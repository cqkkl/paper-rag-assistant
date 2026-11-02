import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function load(file, dependencies) {
  const source = await readFile(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = new vm.SourceTextModule(code);
  await module.link(async (name) => {
    const values = dependencies[name] || {};
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}

test('long-page translation retains every character, including CJK and surrogate pairs', async () => {
  const { splitTranslationText } = await load('translation', { './deepseek': { callDeepSeek() {} } });
  const source = ('Abstract\n\nA sentence. 中文。😀\n').repeat(1100);
  const chunks = splitTranslationText(source);
  assert.equal(chunks.join(''), source);
  assert.ok(chunks.every((x) => x.length <= 4500));
  assert.ok(chunks.length > 4);
  assert.ok(chunks.every((x) => !/[\uD800-\uDBFF]$/.test(x)));
});

test('glossary, language and selection mode reach the prompt', async () => {
  const { buildTranslationPrompt } = await load('translation', { './deepseek': { callDeepSeek() {} } });
  const prompt = buildTranslationPrompt('cavitation', { target: 'en', selection: true, glossary: 'cavitation = 空化', context: 'Ultrasound research' });
  assert.match(prompt[0].content, /英文/);
  assert.match(prompt[0].content, /cavitation = 空化/);
  assert.equal(JSON.parse(prompt[1].content).textToTranslate, 'cavitation');
});

test('all page chunks finish in order; progress is reported; empty output is rejected', async () => {
  let calls = 0;
  const progress = [];
  const { translateText } = await load('translation', { './deepseek': { callDeepSeek: async () => `译文${++calls}` } });
  const result = await translateText('a'.repeat(20000), { onProgress: (a, b) => progress.push([a, b]) });
  assert.equal(calls, 5);
  assert.equal(result, [1, 2, 3, 4, 5].map((n) => `译文${n}`).join('\n\n'));
  assert.deepEqual(progress.at(-1), [5, 5]);
  const empty = await load('translation', { './deepseek': { callDeepSeek: async () => '' } });
  await assert.rejects(empty.translateText('test'), /未返回译文/);
});

test('cancel prevents remaining chunks from being requested', async () => {
  const controller = new AbortController();
  let calls = 0;
  const { translateText } = await load('translation', { './deepseek': { callDeepSeek: async () => { calls++; controller.abort(); return 'first'; } } });
  await assert.rejects(translateText('a'.repeat(12000), { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('SSE handles split UTF-8 frames, surfaces service errors and truncation', async () => {
  const originalFetch = globalThis.fetch;
  const { callDeepSeek } = await load('deepseek', { './apiKeyStore': { getApiKey: () => 'test-key' }, './rag': { buildCoverageContext() {}, expandAcademicQuery() {}, formatRetrievedContext() {}, retrieveRelevantChunks() {} } });
  const encoder = new TextEncoder();
  const respond = (body) => {
    const bytes = encoder.encode(body);
    globalThis.fetch = async (_url, options) => {
      assert.ok('signal' in options);
      return new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); } }));
    };
  };
  try {
    respond('data: {"choices":[{"delta":{"content":"中文译文"}}]}\r\n\r\ndata: [DONE]\n');
    let output = '';
    assert.equal(await callDeepSeek([], (x) => output += x), '中文译文');
    assert.equal(output, '中文译文');
    respond('data: {"error":{"message":"quota exhausted"}}\n');
    await assert.rejects(callDeepSeek([], () => {}), /quota exhausted/);
    respond('data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n');
    await assert.rejects(callDeepSeek([], () => {}), /模型限制/);
  } finally { globalThis.fetch = originalFetch; }
});

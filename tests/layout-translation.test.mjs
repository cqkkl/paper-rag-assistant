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
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); });
  });
  await module.evaluate(); return module.namespace;
}
async function engine(callDeepSeek) {
  const { splitTranslationText } = await load('translation', { './deepseek': { callDeepSeek } });
  return load('layoutTranslation', { './deepseek': { callDeepSeek }, './translation': { splitTranslationText } });
}
const regions = (count) => Array.from({length:count},(_,i)=>({id:`region-${i}`,text:`Academic source paragraph ${i}.`,preserve:false}));
const signal = () => new AbortController().signal;

test('37-region page: omitted IDs are auto-repaired, valid regions publish immediately', async () => {
  let structured=0, fallbacks=0;
  const saved=[];
  const { translateRegions }=await engine(async (messages,onChunk,_signal,options)=>{
    if (!options?.json) { fallbacks++; return '自动补齐的译文'; }
    structured++;
    const batch=JSON.parse(messages[1].content);
    assert.ok(batch.length<=6);
    const raw=JSON.stringify(Object.fromEntries(batch.slice(0,-1).map(({id})=>[id,`对应译文${id}`])));
    onChunk(raw); return raw;
  });
  const result=await translateRegions(regions(37),'',signal(),(values,done,total,status)=>saved.push({values,done,total,status}));
  assert.equal(Object.keys(result).length,37);
  assert.equal(structured,7); assert.equal(fallbacks,7);
  assert.ok(saved.some((x)=>x.done===5));
  assert.ok(saved.some((x)=>x.status?.repairing));
  assert.equal(saved.at(-1).done,37);
});

test('decoder accepts fenced objects, wrapped mappings and ID-bearing arrays without guessing positions', async () => {
  const { readRegionTranslations }=await engine(()=>{});
  const ids=new Set(['region-0','region-1']);
  assert.deepEqual(readRegionTranslations('```json\n{"region-0":"译文"}\n```',ids),{'region-0':'译文'});
  assert.deepEqual(readRegionTranslations('{"translations":[{"id":"region-1","translation":"第二段"}]}',ids),{'region-1':'第二段'});
  assert.deepEqual(readRegionTranslations('{"translations":{"region-0":{"translation":"第一段"}}}',ids),{'region-0':'第一段'});
  assert.deepEqual(readRegionTranslations('["无 ID 的译文"]',ids),{});
  assert.deepEqual(readRegionTranslations('{"region-999":"错误区域"}',ids),{});
});

test('truncated JSON keeps only closed values; escaped quotes and braces remain intact', async () => {
  const { readRegionTranslations }=await engine(()=>{});
  // Build a valid closed first value without confusing the partial final value.
  const input='{"region-0":'+JSON.stringify('译文包含 "引号" 和 {公式}')+',"region-1":"未完成';
  assert.deepEqual(readRegionTranslations(input,new Set(['region-0','region-1'])),{'region-0':'译文包含 "引号" 和 {公式}'});
});

test('truncated model output repairs missing regions without discarding streamed progress', async () => {
  let fallback=0;const saved=[];
  const { translateRegions }=await engine(async (_messages,onChunk,_signal,options)=>{
    if (!options?.json) { fallback++; return '补译'; }
    onChunk('{"region-0":"完整译文","region-1":"截断');
    throw new Error('输出超过模型限制，请重试更短的段落');
  });
  const result=await translateRegions(regions(3),'',signal(),(values)=>saved.push(values));
  assert.equal(result['region-0'],'完整译文');assert.equal(fallback,2);
  assert.ok(saved.some((x)=>x['region-0']==='完整译文'&&!x['region-1']));
});

test('bad JSON falls back per region; a long source is never truncated', async () => {
  const parts=[];
  const { translateRegions }=await engine(async (messages,_onChunk,_signal,options)=>{
    if(options?.json)return '无法输出 JSON';
    parts.push(messages[1].content);return '逐段译文';
  });
  const long='long source. '.repeat(500);
  const result=await translateRegions([{id:'region-0',text:long,preserve:false}],'',signal(),()=>{});
  assert.equal(parts.join(''),long);assert.ok(parts.every((x)=>x.length<=2200));assert.ok(result['region-0']);
});

test('network/key failures do not trigger a retry storm and retain complete regions', async () => {
  let calls=0;const saved=[];
  const { translateRegions }=await engine(async (_messages,onChunk)=>{calls++;onChunk('{"region-0":"已完成译文",');throw new Error('API调用失败: 401');});
  await assert.rejects(translateRegions(regions(37),'',signal(),(values)=>saved.push(values)),/401/);
  assert.equal(calls,1);assert.equal(saved.at(-1)['region-0'],'已完成译文');
});

test('cancellation prevents repair requests and additional persistence', async () => {
  const controller=new AbortController();let calls=0;
  const { translateRegions }=await engine(async (_messages,onChunk)=>{calls++;controller.abort();onChunk('{"region-0":"不得保存"}');return '{}';});
  const saved=[];
  await assert.rejects(translateRegions(regions(37),'',controller.signal,(values)=>saved.push(values)),{name:'AbortError'});
  assert.equal(calls,1);assert.deepEqual(saved,[{}]);
});

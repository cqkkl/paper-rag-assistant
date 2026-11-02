import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/pdfLayout.ts', import.meta.url), 'utf8');
const module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
await module.link(() => {}); await module.evaluate();
const { groupPageLines, fitRegionText } = module.namespace;
const line = (text, x, y, width = 240) => ({ text, x, y, width, height: 11, fontSize: 11, bold: false });
test('two-column text remains in distinct regions', () => {
  const regions = groupPageLines([line('Left first', 42, 100), line('Right first', 322, 100), line('Left second', 42, 114), line('Right second', 322, 114)], 612);
  assert.equal(regions.length, 2);
  assert.equal(regions[0].text, 'Left first Left second');
  assert.equal(regions[1].text, 'Right first Right second');
});
test('table cells, captions, numeric labels and equations remain isolated', () => {
  const regions = groupPageLines([line('Method', 322, 100, 40), line('Score', 458, 100, 30), line('0.89', 458, 135, 30), line('E = mc^2 + x_1', 322, 200, 120)], 612);
  assert.equal(regions.length, 4);
  assert.equal(regions[2].preserve, true);
  assert.equal(regions[3].preserve, true);
});
test('translated text wraps within the original region and exposes overflow', () => {
  const region = { ...line('source', 42, 100, 100), id: 'r', preserve: false, lines: [] };
  const measure = (text, size) => [...text].length * size;
  const fitted = fitRegionText('对应的中文译文', { ...region, height: 30 }, measure);
  assert.ok(fitted.lines.every((text) => measure(text, fitted.fontSize) <= 100));
  assert.equal(fitted.overflow, false);
  assert.equal(fitRegionText('很长的译文'.repeat(100), region, measure).overflow, true);
});

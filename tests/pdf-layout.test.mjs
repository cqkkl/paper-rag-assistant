import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/pdfLayout.ts', import.meta.url), 'utf8');
const module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
await module.link(() => {}); await module.evaluate();
const { detectColumnGutter, groupPageLines, groupPageLinesLegacy, migrateParagraphTranslations, fitRegionText } = module.namespace;
const line = (text, x, y, width = 240) => ({ text, x, y, width, height: 11, fontSize: 11, bold: false });
test('two-column text remains in distinct regions', () => {
  const regions = groupPageLines([line('Left first', 42, 100), line('Right first', 322, 100), line('Left second', 42, 114), line('Right second', 322, 114)], 612);
  assert.equal(regions.length, 2);
  assert.equal(regions[0].text, 'Left first Left second');
  assert.equal(regions[1].text, 'Right first Right second');
});

test('narrow IEEE-style gutter is detected before same-baseline spans can merge', () => {
  const input=[];
  for(let i=0;i<16;i++) {
    input.push({...line(`LEFT_ONLY source paragraph line ${i}.`,50,100+i*12,250),fontSize:10,height:10});
    input.push({...line(`RIGHT_ONLY independent evidence line ${i}.`,310,100+i*12,250),fontSize:10,height:10});
  }
  const gutter=detectColumnGutter(input,612);
  assert.ok(gutter>300&&gutter<310);
  const regions=groupPageLines(input,612);
  assert.equal(regions.length,2);
  assert.ok(regions.every(r=>!(r.text.includes('LEFT_ONLY')&&r.text.includes('RIGHT_ONLY'))));
  assert.ok(regions.filter(r=>r.column==='left').every(r=>r.x+r.width<=gutter));
  assert.ok(regions.filter(r=>r.column==='right').every(r=>r.x>=gutter));
});

test('full-width titles require direct original spanning evidence', () => {
  const input=[];
  for(let i=0;i<12;i++) {
    input.push({...line('Left body text stays entirely in its own column.',50,100+i*12,250),fontSize:10,height:10});
    input.push({...line('Right body text stays entirely in its own column.',310,100+i*12,250),fontSize:10,height:10});
  }
  input.push({...line('A real page-wide title with its own original text span',50,60,510),fontSize:16,height:16});
  const regions=groupPageLines(input,612);
  assert.equal(regions.filter(r=>r.column==='wide').length,1);
  assert.equal(regions.filter(r=>r.column==='wide')[0].fontSize,16);
  assert.ok(regions.filter(r=>r.column==='left'||r.column==='right').every(r=>r.width<=250));
});

test('justified sentence gaps merge inside a detected column, never across its gutter', () => {
  const input=[];
  for(let i=0;i<12;i++) {
    input.push({...line('Left-side prose remains in its own column.',50,100+i*12,250),fontSize:10,height:10});
    input.push({...line('Right-side prose remains in its own column.',310,100+i*12,250),fontSize:10,height:10});
  }
  input.push({...line('sentence.',310,244,45),fontSize:10,height:10});
  input.push({...line('Next sentence starts after justified spacing.',365,244,195),fontSize:10,height:10});
  const regions=groupPageLines(input,612);
  const joined=regions.find(r=>r.text.includes('Next sentence'));
  assert.ok(joined.text.includes('sentence. Next sentence'));
  assert.equal(joined.column,'right');
  assert.ok(regions.every(r=>!(r.text.includes('Left-side')&&r.text.includes('Right-side'))));
});

test('quantities at the start of a list continuation are ordinary body text', () => {
  const input=[line('• Low-power operation, consuming less than',50,100,240),line('50 mW at 50 Hz PRF and less than 60 mW',64,114,226),line('at higher frame rates with a small battery.',64,128,226)];
  const regions=groupPageLines(input,612);
  assert.equal(regions.length,1);
  assert.equal(regions[0].kind,'list');
  assert.ok(regions[0].text.includes('50 mW'));
});

test('translation font sizes follow source headings, body and footnotes without independent shrinking', () => {
  for(const size of [7,10,14,20]) {
    const region={...line('Original source',42,100,80),fontSize:size,height:size*2,id:'r',preserve:false,lines:[]};
    const fit=fitRegionText('很长的译文'.repeat(20),region,(text,font)=>text.length*font);
    assert.equal(fit.fontSize,size);
    assert.equal(fit.overflow,true);
  }
});

test('inline colored links, font changes and indents remain one readable paragraph', () => {
  const input = [
    line('Researchers compare scientific systems with an original method.', 52, 100, 230),
    line('They inspect the ', 42, 114, 85),
    {...line('open-source', 127, 114, 60), color:'rgb(0,100,255)', bold:true},
    line(' platform carefully.', 187, 114, 95),
    line('The corresponding source remains visible for verification.', 42, 128, 240),
    line('This is a separate indented paragraph with its own context.', 52, 142, 230),
    line('It must not be attached to the preceding paragraph.', 42, 156, 240),
  ];
  const regions=groupPageLines(input,612);
  assert.equal(regions.length,2);
  assert.ok(regions[0].text.includes('open-source platform'));
  assert.equal(regions[0].color,'#27313c');
  assert.equal(regions[0].textIndent,10);
});

test('list markers stay with their text and continuation lines use hanging indent', () => {
  const input=[line('•',42,100,4),line('Design of a low-power configurable ultrasound platform.',54,100,228),
    line('It supports multiple transducers and programmable settings.',54,114,228),
    line('•',42,135,4),line('Expanded modes include A-mode, M-mode and B-mode.',54,135,228),
    line('The measurements can be verified in the original document.',54,149,228)];
  const regions=groupPageLines(input,612);
  assert.equal(regions.length,2);
  assert.ok(regions.every((r)=>r.kind==='list'&&r.lines.length===2));
  const fit=fitRegionText('• 设计一种可编程超声平台，支持不同换能器。',regions[0],(text,size)=>text.length*size);
  assert.ok(fit.hangingIndent>0);
  assert.ok(!fit.lines.join('').startsWith('•'));
});

test('short final line joins its paragraph without inheriting colored link styles', () => {
  const input=[line('These systems support multiple transducer configurations.',42,100,240),
    line('and programmable settings in clinical research.',42,114,240),
    {...line('community.',42,128,47),color:'rgb(250,100,0)'},
    line('A separate paragraph begins below the preceding discussion.',52,150,230),line('It has its own independent set of source citations.',42,164,240)];
  const regions=groupPageLines(input,612);
  assert.equal(regions.length,2);
  assert.ok(regions[0].text.endsWith('community.'));
  assert.equal(regions[0].color,'#27313c');
});

test('legacy translation fragments migrate into the corresponding paragraph once', () => {
  const input=[line('The system supports multiple independent applications.',52,100,230),
    {...line('Community.',42,114,50),bold:true},line('Clinical research requires source verification.',95,114,185),
    line('Every conclusion is connected to the original page.',42,128,240)];
  const old=groupPageLinesLegacy(input,612);const next=groupPageLines(input,612);
  const values=Object.fromEntries(old.filter((r)=>!r.preserve).map((r,i)=>[r.id,`旧译文${i}`]));
  const migrated=migrateParagraphTranslations(next,old,values);
  assert.equal(Object.keys(migrated).length,next.length);
  for(const value of Object.values(values)) assert.equal(Object.values(migrated).join('').split(value).length-1,1);
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

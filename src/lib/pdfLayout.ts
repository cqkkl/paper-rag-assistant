export interface PageLine {
  text: string; x: number; y: number; width: number; height: number; fontSize: number; bold: boolean;
  background?: string; color?: string;
}
export interface PageRegion {
  id: string; text: string; x: number; y: number; width: number; height: number;
  fontSize: number; bold: boolean; preserve: boolean; lines: PageLine[];
  color?: string;
}

/** All coordinates are PDF viewport points (origin at the top left). */
export function groupPageLines(input: PageLine[], pageWidth: number): PageRegion[] {
  const lines: PageLine[] = [];
  // Merge adjacent spans, but never cross a column gutter or table-cell gap.
  for (const item of [...input].sort((a, b) => Math.abs(a.y - b.y) < Math.min(a.height, b.height) * .35 ? a.x - b.x : a.y - b.y)) {
    const previous = lines.at(-1);
    const gap = previous ? item.x - previous.x - previous.width : Infinity;
    if (previous && Math.abs(previous.y - item.y) < Math.min(previous.height, item.height) * .35
      && gap >= -2 && gap < Math.max(5, item.fontSize * .9) && Math.abs(previous.fontSize - item.fontSize) < 2) {
      previous.text += `${gap > 1 ? " " : ""}${item.text}`;
      previous.width = item.x + item.width - previous.x;
      previous.height = Math.max(previous.height, item.height);
    } else lines.push({ ...item });
  }
  const regions: PageRegion[] = [];
  for (const line of lines) {
    const candidates = regions.filter((r) => {
      const last = r.lines.at(-1)!;
      const gap = line.y - last.y - last.height;
      return gap >= -1 && gap < Math.max(3, line.fontSize * .65)
        && Math.abs(r.x - line.x) < line.fontSize * .9
        && Math.abs(r.fontSize - line.fontSize) < 1.2 && r.bold === line.bold
        && Math.abs(r.width - line.width) < pageWidth * .14
        && !/^(?:Fig(?:ure)?\.?|Table|图|表)\s*\d/i.test(line.text);
    });
    const region = candidates.sort((a, b) => b.y - a.y)[0];
    if (region) {
      region.lines.push(line);
      region.text = region.text.endsWith("-") ? region.text.slice(0, -1) + line.text : `${region.text} ${line.text}`;
      region.width = Math.max(region.width, line.x + line.width - region.x);
      region.height = line.y + line.height - region.y;
    } else regions.push({ ...line, id: `region-${regions.length}`, preserve: false, lines: [line] });
  }
  return regions.map((region) => ({ ...region,
    // Leave isolated numeric labels, formulas, URLs and reference identifiers intact.
    preserve: !/[a-zA-Z\u3400-\u9fff]{2}/.test(region.text)
      || /^(?:https?:\/\/|doi\s*:|\S+@\S+)/i.test(region.text)
      || ((region.text.match(/[=∑∫√≤≥±^_]/g) ?? []).length >= 2)
      || (/[=∑∫√≤≥]/.test(region.text) && (region.text.match(/[a-zA-Z]{3,}/g) ?? []).length < 3),
  }));
}

export function fitRegionText(text: string, region: PageRegion, measure: (text: string, fontSize: number) => number) {
  const wrap = (size: number) => {
    const output: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
      let line = "";
      // Use words for Latin text; CJK characters may wrap individually.
      const tokens = paragraph.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*\s*|[^A-Za-z0-9]/gu) ?? [];
      for (const token of tokens) {
        if (line && measure(line + token, size) > region.width) {
          // Do not leave Chinese closing punctuation alone at the start of a line.
          if (/^[，。；：！？、）】》]/.test(token)) {
            const chars = [...line];
            const last = chars.pop()!;
            output.push(chars.join("").trimEnd()); line = last;
          } else { output.push(line.trimEnd()); line = ""; }
        }
        if (measure(token, size) > region.width) {
          for (const char of token) {
            if (line && measure(line + char, size) > region.width) { output.push(line); line = ""; }
            line += char;
          }
        } else line += token;
      }
      output.push(line.trimEnd());
    }
    return output;
  };
  let size = region.fontSize;
  const minimum = Math.max(4, region.fontSize * .5);
  let lines = wrap(size);
  const availableHeight = region.height + region.fontSize * .18;
  while (size > minimum && lines.length * size * 1.14 > availableHeight) {
    size = Math.max(minimum, size - .25); lines = wrap(size);
  }
  return { fontSize: size, lines, overflow: lines.length * size * 1.14 > availableHeight };
}

export interface PageLine {
  text: string; x: number; y: number; width: number; height: number; fontSize: number; bold: boolean;
  background?: string; color?: string;
}
export interface PageRegion {
  id: string; text: string; x: number; y: number; width: number; height: number;
  fontSize: number; bold: boolean; preserve: boolean; lines: PageLine[];
  color?: string;
  kind?: "paragraph" | "heading" | "list" | "caption" | "equation" | "label";
  textIndent?: number;
  marker?: string;
  column?: string;
}

/** All coordinates are PDF viewport points (origin at the top left). */
export function groupPageLinesLegacy(input: PageLine[], pageWidth: number): PageRegion[] {
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

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 10;
}

function isFormula(text: string) {
  return (text.match(/[=∑∫√≤≥±^_]/g) ?? []).length >= 2
    || (/[=∑∫√≤≥]/.test(text) && (text.match(/[a-zA-Z]{3,}/g) ?? []).length < 3);
}

/** Rebuild semantic paragraphs; inline links and font changes never split a line. */
export function groupPageLines(input: PageLine[], pageWidth: number): PageRegion[] {
  const bodySize = median(input.filter((line) => line.text.length > 35).map((line) => line.fontSize));
  const rows: Array<{ y: number; items: PageLine[] }> = [];
  for (const item of [...input].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.slice(-3).find((row) => Math.abs(row.y - item.y) < Math.max(bodySize, item.fontSize) * .4);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  const lines: PageLine[] = [];
  for (const row of rows) {
    let current: PageLine | null = null;
    for (const item of row.items.sort((a, b) => a.x - b.x)) {
      const gap = current ? item.x - current.x - current.width : Infinity;
      if (current && gap >= -2 && gap < Math.max(12, bodySize * 1.45)) {
        const separator = gap > 1 && !/[\s-]$/.test(current.text) && !/^[,.;:!?，。；：！？、)\]]/.test(item.text) ? " " : "";
        current.text += separator + item.text;
        current.width = Math.max(current.width, item.x + item.width - current.x);
        current.y = Math.min(current.y, item.y);
        current.height = Math.max(current.height, item.y + item.height - current.y);
        // Tiny citation superscripts do not dictate the paragraph font.
        current.fontSize = Math.max(current.fontSize, item.fontSize);
      } else {
        current = { ...item };
        lines.push(current);
      }
    }
  }
  const anchors: Array<{ x: number; ends: number[]; count: number }> = [];
  for (const line of lines) {
    if (line.width < pageWidth * .17 || line.width > pageWidth * .66 || line.text.length < 24 || line.fontSize > bodySize * 1.25) continue;
    const anchor = anchors.find((anchor) => Math.abs(anchor.x - line.x) <= bodySize * 1.9);
    if (anchor) { anchor.x = Math.min(anchor.x, line.x); anchor.ends.push(line.x + line.width); anchor.count++; }
    else anchors.push({ x: line.x, ends: [line.x + line.width], count: 1 });
  }
  const columns = anchors.filter((a) => a.count >= 2).sort((a, b) => a.x - b.x)
    .filter((a, i, all) => !all.slice(0, i).some((b) => Math.abs(a.x - b.x) < pageWidth * .2))
    .map((a, i, all) => ({ x: a.x, right: Math.min(Math.max(...a.ends), all[i + 1]?.x - bodySize * 1.4 || pageWidth), key: `col-${i}` }));
  const wideLines = lines.filter((line) => line.width > pageWidth * .66);
  const geometry = (line: PageLine) => {
    const wide = wideLines.filter((w) => Math.abs(w.y - line.y) < bodySize * 1.75
      && line.x >= w.x - bodySize * 1.5 && line.x + line.width <= w.x + w.width + bodySize * 1.5);
    if (wide.length) {
      const x = Math.min(...wide.map((w) => w.x));
      return { x, right: Math.max(...wide.map((w) => w.x + w.width)), key: `wide-${Math.round(x / (bodySize * 2))}` };
    }
    const column = columns.find((c) => line.x >= c.x - bodySize * .7 && line.x < c.right
      && line.x + line.width <= c.right + bodySize * .9);
    return column ?? { x: line.x, right: line.x + line.width, key: `local-${Math.round(line.x / bodySize)}-${Math.round((line.x + line.width) / (bodySize * 2))}` };
  };
  const classify = (line: PageLine): NonNullable<PageRegion["kind"]> => {
    if (isFormula(line.text)) return "equation";
    if (/^(?:[•●▪‣◦]|[-–]\s|\(?\d+[)．]\s)/.test(line.text.trim())) return "list";
    if (/^(?:Fig(?:ure)?\.?|Table|图|表)\s*\d/i.test(line.text.trim())) return "caption";
    if (line.fontSize > bodySize * 1.25 || (line.text.length < 100 && /^(?:[IVX]+\.?\s+|\d+(?:\.\d+)*\.?\s+|[A-Z]\.\s+|Abstract\b|References\b|Highlights\b|Keywords\b|摘要|关键词)/.test(line.text.trim()))) return "heading";
    if (!/[a-zA-Z\u3400-\u9fff]{2}/.test(line.text)) return "label";
    return "paragraph";
  };
  const regions: PageRegion[] = [];
  const lastByColumn = new Map<string, PageRegion>();
  for (const line of lines.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const lane = geometry(line);
    const kind = classify(line);
    const previous = lastByColumn.get(lane.key);
    const last = previous?.lines.at(-1);
    const gap = last ? line.y - last.y - last.height : Infinity;
    const sameTextStyle = previous && Math.abs(previous.fontSize - line.fontSize) < bodySize * .25;
    const indentedNewParagraph = previous?.kind === "paragraph" && last
      && line.x > lane.x + bodySize * .65 && last.x < lane.x + bodySize * .45;
    const shortPrevious = last && last.width < (lane.right - lane.x) * .66;
    const listContinuation = previous?.kind === "list" && kind === "paragraph" && line.x >= previous.x + bodySize * .5;
    const continues = previous && last && sameTextStyle && gap >= -1 && gap < bodySize * .65
      && !shortPrevious && !indentedNewParagraph
      && ((previous.kind === "paragraph" && kind === "paragraph") || listContinuation || (previous.kind === "caption" && kind === "paragraph"));
    if (continues) {
      previous.lines.push(line);
      previous.text = /[A-Za-z]-$/.test(previous.text) && /^[a-z]/.test(line.text) ? previous.text.slice(0, -1) + line.text : `${previous.text} ${line.text}`;
      const oldX = previous.x;
      previous.x = Math.min(previous.x, line.x);
      previous.width = Math.max(oldX + previous.width, line.x + line.width, lane.right) - previous.x;
      previous.height = line.y + line.height - previous.y;
      previous.textIndent = Math.max(0, previous.lines[0].x - previous.x);
    } else {
      const marker = kind === "list" ? line.text.trim().match(/^(?:[•●▪‣◦]|[-–]|\(?\d+[)．])/u)?.[0] : undefined;
      const region: PageRegion = { ...line, id: `region-${regions.length}`, kind, column: lane.key,
        width: kind === "paragraph" || kind === "list" ? Math.max(line.width, lane.right - line.x) : line.width,
        bold: kind === "heading", color: kind === "heading" ? "#254b6d" : "#27313c",
        marker, textIndent: 0,
        preserve: kind === "label" || kind === "equation" || /^(?:https?:\/\/|doi\s*:|\S+@\S+)/i.test(line.text.trim()), lines: [line] };
      regions.push(region); lastByColumn.set(lane.key, region);
    }
  }
  return regions;
}

export function fitRegionText(text: string, region: PageRegion, measure: (text: string, fontSize: number) => number) {
  const kind = region.kind ?? "paragraph";
  const isBody = kind === "paragraph" || kind === "list";
  const leading = isBody ? 1.42 : kind === "caption" ? 1.3 : 1.22;
  const marker = region.marker;
  const content = text.replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").trim()
    .replace(marker ? /^\s*(?:[•●▪‣◦]|[-–*]|\(?\d+[)．])\s*/u : /$^/, "");
  const wrap = (size: number) => {
    const output: string[] = [];
    const hangingIndent = marker ? size * 1.35 : 0;
    for (const paragraph of content.split(/\n+/)) {
      let line = "";
      const lineWidth = () => region.width - hangingIndent - (output.length === 0 && !marker ? region.textIndent ?? 0 : 0);
      // Use words for Latin text; CJK characters may wrap individually.
      const tokens = paragraph.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*\s*|[^A-Za-z0-9]/gu) ?? [];
      for (const token of tokens) {
        if (line && measure(line + token, size) > lineWidth()) {
          // Do not leave Chinese closing punctuation alone at the start of a line.
          if (/^[，。；：！？、）】》]/.test(token)) {
            const chars = [...line];
            const last = chars.pop()!;
            output.push(chars.join("").trimEnd()); line = last;
          } else { output.push(line.trimEnd()); line = ""; }
        }
        if (measure(token, size) > lineWidth()) {
          for (const char of token) {
            if (line && measure(line + char, size) > lineWidth()) { output.push(line); line = ""; }
            line += char;
          }
        } else line += token;
      }
      if (line.trim()) output.push(line.trimEnd());
    }
    return output;
  };
  let size = region.fontSize;
  const minimum = Math.max(5, region.fontSize * .72);
  let lines = wrap(size);
  const availableHeight = region.height + region.fontSize * .18;
  while (size > minimum && lines.length * size * leading > availableHeight) {
    size = Math.max(minimum, size - .25); lines = wrap(size);
  }
  return { fontSize: size, lines, lineHeight: size * leading, hangingIndent: marker ? size * 1.35 : 0,
    overflow: lines.length * size * leading > availableHeight };
}

/** Carry complete old fragments into their new paragraph, never duplicate them. */
export function migrateParagraphTranslations(next: PageRegion[], old: PageRegion[], values: Record<string, string>) {
  const ownership = new Map<string, PageRegion[]>();
  const unsafe = new Set<string>();
  for (const region of old) {
    const scores = next.map((candidate) => ({ candidate, overlap: region.lines.reduce((sum, line) => sum + candidate.lines.reduce((score, other) => {
      const width = Math.max(0, Math.min(line.x + line.width, other.x + other.width) - Math.max(line.x, other.x));
      const height = Math.max(0, Math.min(line.y + line.height, other.y + other.height) - Math.max(line.y, other.y));
      return score + width * height;
    }, 0), 0) }));
    const area = region.lines.reduce((sum, line) => sum + line.width * line.height, 0);
    const best = scores.sort((a, b) => b.overlap - a.overlap)[0];
    if (!best || best.overlap < area * .82) {
      for (const score of scores) if (score.overlap > 0) unsafe.add(score.candidate.id);
      continue;
    }
    const members = ownership.get(best.candidate.id) ?? [];
    members.push(region); ownership.set(best.candidate.id, members);
  }
  const result: Record<string, string> = {};
  for (const region of next) {
    if (region.preserve || unsafe.has(region.id)) continue;
    const members = ownership.get(region.id) ?? [];
    const translated = members.filter((member) => !member.preserve);
    if (!translated.length || translated.some((member) => !values[member.id]?.trim())) continue;
    const covered = members.flatMap((m) => m.lines).reduce((sum, l) => sum + l.width * l.height, 0);
    const area = region.lines.reduce((sum, l) => sum + l.width * l.height, 0);
    if (covered < area * .72) continue;
    const fragments = members.sort((a, b) => a.y - b.y || a.x - b.x).map((member) => values[member.id] || member.text);
    result[region.id] = fragments.reduce((text, fragment) => {
      const clean = fragment.trim();
      return text + (/[\u3400-\u9fff，。；：！？、]$/.test(text) && /^[\u3400-\u9fff，。；：！？、]/.test(clean) ? "" : text ? " " : "") + clean;
    }, "");
  }
  return result;
}

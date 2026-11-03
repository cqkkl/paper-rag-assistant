export interface PageLine {
  text: string; x: number; y: number; width: number; height: number; fontSize: number; bold: boolean;
  background?: string; color?: string;
  baseline?: number;
  scripts?: PageLine[];
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

/** Find a repeatedly empty vertical gutter before combining any text spans. */
export function detectColumnGutter(input: PageLine[], pageWidth: number): number | null {
  const bodySize = median(input.filter((line) => line.text.length > 25).map((line) => line.fontSize));
  const body = input.filter((line) => line.fontSize >= bodySize * .7 && line.fontSize <= bodySize * 1.25 && line.width < pageWidth * .7);
  const rows = new Set(body.map((line) => Math.round(line.y / (bodySize * .6))));
  if (rows.size < 8) return null;
  const from = Math.floor(pageWidth * .35), to = Math.ceil(pageWidth * .65);
  const coverage: number[] = [];
  for (let x = from; x <= to; x++) {
    coverage.push(new Set(body.filter((line) => line.x < x && line.x + line.width > x)
      .map((line) => Math.round(line.y / (bodySize * .6)))).size);
  }
  const minimum = Math.min(...coverage), maximum = Math.max(...coverage);
  if (maximum === 0 || minimum > maximum * .4) return null;
  const threshold = minimum + Math.max(1, rows.size * .025);
  const candidates: Array<{ x: number; width: number; support: number }> = [];
  for (let i = 0; i < coverage.length; i++) {
    if (coverage[i] > threshold) continue;
    const begin = i;
    while (i + 1 < coverage.length && coverage[i + 1] <= threshold) i++;
    if (i - begin < 2) continue;
    const x = from + (begin + i) / 2;
    const left = new Set(body.filter((line) => line.x < x - bodySize * 4 && line.x + line.width <= x)
      .map((line) => Math.round(line.y / (bodySize * .6)))).size;
    const right = new Set(body.filter((line) => line.x >= x && line.x <= x + bodySize * 3)
      .map((line) => Math.round(line.y / (bodySize * .6)))).size;
    if (left >= Math.max(3, rows.size * .18) && right >= Math.max(3, rows.size * .18)) candidates.push({ x, width: i - begin, support: Math.min(left, right) });
  }
  return candidates.sort((a, b) => b.support - a.support || Math.abs(a.x - pageWidth / 2) - Math.abs(b.x - pageWidth / 2))[0]?.x ?? null;
}

export function inlineScripts(text: string) {
  return [...text.matchAll(/⟦(sup|sub):([^⟦⟧]+)⟧/gu)];
}

export function preservesInlineScripts(source: string, translation: string) {
  const tokens = (text: string) => inlineScripts(text).map((match) => match[0]).sort().join("");
  return tokens(source) === tokens(translation);
}

/** Attach small, displaced glyphs only to adjacent text in the same column. */
function attachScripts(input: PageLine[], gutter: number | null) {
  const attached = new Map<PageLine, { mark: PageLine; token: string }[]>();
  const used = new Set<PageLine>();
  const baseline = (line: PageLine) => line.baseline ?? line.y + line.fontSize * .8;
  for (const mark of [...input].sort((a, b) => a.x - b.x)) {
    if (!/^[\da-zA-Z*†‡,–−-]{1,16}$/u.test(mark.text.replace(/\s/g, ""))) continue;
    let best: { host: PageLine; distance: number; shift: number } | undefined;
    for (const host of input) {
      if (!/[\p{L}\d)\]]/u.test(host.text) || mark.fontSize > host.fontSize * .84 || mark.fontSize < host.fontSize * .43) continue;
      if (gutter !== null && (mark.x >= gutter) !== (host.x >= gutter)) continue;
      const preceding = attached.get(host)?.at(-1)?.mark;
      const right = preceding && Math.abs(baseline(preceding) - baseline(mark)) < mark.fontSize * .2
        ? preceding.x + preceding.width : host.x + host.width;
      const gap = mark.x - right;
      const shift = (baseline(host) - baseline(mark)) / host.fontSize;
      if (gap < -host.fontSize * .2 || gap > host.fontSize * .4 || Math.abs(shift) < .13 || shift > .75 || shift < -.36) continue;
      const distance = Math.abs(gap) / host.fontSize + Math.abs(Math.abs(shift) - .3);
      if (!best || distance < best.distance) best = { host, distance, shift };
    }
    if (best) {
      const marks = attached.get(best.host) ?? [];
      marks.push({ mark, token: `⟦${best.shift > 0 ? "sup" : "sub"}:${mark.text.trim()}⟧` });
      attached.set(best.host, marks);
      used.add(mark);
    }
  }
  return input.filter((line) => !used.has(line) || attached.has(line)).map((line) => {
    const marks = attached.get(line)?.sort((a, b) => a.mark.x - b.mark.x);
    if (!marks) return line;
    return { ...line, text: line.text.trimEnd() + marks.map(({ token }) => token).join("") + (line.text.match(/\s+$/u)?.[0] ?? ""),
      width: Math.max(line.width, ...marks.map(({ mark }) => mark.x + mark.width - line.x)), scripts: marks.map(({ mark }) => mark) };
  });
}

/** Isolate columns first, then join only geometrically compatible runs. */
export function groupPageLines(input: PageLine[], pageWidth: number): PageRegion[] {
  const bodySize = median(input.filter((line) => line.text.length > 25).map((line) => line.fontSize));
  const gutter = detectColumnGutter(input, pageWidth);
  const rows: Array<{ y: number; items: PageLine[] }> = [];
  for (const item of attachScripts(input, gutter).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.slice(-3).find((row) => Math.abs(row.y - item.y) < Math.min(bodySize, item.fontSize) * .35);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  const lanes = new Map<string, PageLine[]>();
  for (const row of rows) {
    // Full-width status must be proved by an original text span, never by a
    // merged line or a nearby wide line. Adjacent columns must stay independent.
    const provenWide = gutter !== null && row.items.some((item) => item.x < gutter && item.x + item.width > gutter);
    let current: PageLine | null = null;
    let currentLane = "";
    for (const item of row.items.sort((a, b) => a.x - b.x)) {
      const lane = provenWide ? "wide" : gutter === null ? "single" : item.x + item.width / 2 < gutter ? "left" : "right";
      const gap = current ? item.x - current.x - current.width : Infinity;
      const similarSize = current && Math.abs(current.fontSize - item.fontSize) <= Math.max(.35, item.fontSize * .035);
      // Justified prose can contain a large sentence space. It is safe to join
      // across that space only after the two page columns have been isolated.
      const inlineGap = lane === "left" || lane === "right" ? bodySize * 1.5 : Math.max(5, bodySize * .9);
      if (current && lane === currentLane && similarSize && gap >= -1.5 && gap < inlineGap) {
        const separator = gap > .8 && !/[\s-]$/.test(current.text) && !/^[,.;:!?，。；：！？、)\]]/.test(item.text) ? " " : "";
        current.text += separator + item.text;
        current.width = Math.max(current.width, item.x + item.width - current.x);
        current.height = Math.max(current.height, item.height);
        if (item.scripts?.length) current.scripts = [...(current.scripts ?? []), ...item.scripts];
      } else {
        current = { ...item };
        currentLane = lane;
        const lines = lanes.get(lane) ?? [];
        lines.push(current); lanes.set(lane, lines);
      }
    }
  }
  const classify = (line: PageLine): NonNullable<PageRegion["kind"]> => {
    if (isFormula(line.text)) return "equation";
    if (/^(?:[•●▪‣◦]|[-–]\s|\(?\d+[)．]\s)/.test(line.text.trim())) return "list";
    if (/^(?:Fig(?:ure)?\.?|Table|图|表)\s*\d/i.test(line.text.trim())) return "caption";
    if (!/[a-zA-Z\u3400-\u9fff]{2}/.test(line.text)) return "label";
    if (line.fontSize > bodySize * 1.25 || (line.text.length < 100 && /^(?:[IVX]+\.?\s+|\d+(?:\.\d+)*\.\s+|\d+(?:\.\d+)+\s+|[A-Z]\.\s+|Abstract\b|References\b|Highlights\b|Keywords\b|摘要|关键词)/.test(line.text.trim()))) return "heading";
    return "paragraph";
  };
  const regions: PageRegion[] = [];
  for (const [column, lines] of lanes) {
    const columnLeft = Math.min(...lines.map((line) => line.x));
    const laneRegions: PageRegion[] = [];
    for (const line of lines.sort((a, b) => a.y - b.y || a.x - b.x)) {
      const kind = classify(line);
      let previous = [...laneRegions].reverse().find((region) => {
        const last = region.lines.at(-1)!;
        return last.y <= line.y + .8 && Math.abs(line.x - last.x) < bodySize * 1.5;
      });
      const last = previous?.lines.at(-1);
      const gap = last ? line.y - last.y - last.height : Infinity;
      const sameSize = previous && Math.abs(previous.fontSize - line.fontSize) < .4;
      const newIndent = previous?.kind === "paragraph" && last && line.x > columnLeft + bodySize * .6 && last.x < columnLeft + bodySize * .4;
      const shortLast = last && previous && last.width < previous.width * .65;
      const listContinuation = previous?.kind === "list" && kind === "paragraph" && line.x >= previous.x + bodySize * .45;
      const continues = previous && last && sameSize && gap >= -.8 && gap < bodySize * .65
        && Math.abs(line.x - last.x) < bodySize * 1.5 && !newIndent && !shortLast
        && ((previous.kind === "paragraph" && kind === "paragraph") || listContinuation || (previous.kind === "caption" && kind === "paragraph"));
      if (continues) {
        previous.lines.push(line);
        previous.text = /[A-Za-z]-$/.test(previous.text) && /^[a-z]/.test(line.text) ? previous.text.slice(0, -1) + line.text : previous.text + " " + line.text;
        const right = Math.max(previous.x + previous.width, line.x + line.width);
        previous.x = Math.min(previous.x, line.x);
        previous.width = right - previous.x;
        previous.height = line.y + line.height - previous.y;
        previous.textIndent = Math.max(0, previous.lines[0].x - previous.x);
      } else {
        previous = { ...line, id: "", kind, column, fontSize: line.fontSize,
          bold: kind === "heading" || line.bold, color: kind === "heading" ? "#254b6d" : "#27313c",
          marker: kind === "list" ? line.text.trim().match(/^(?:[•●▪‣◦]|[-–]|\(?\d+[)．])/u)?.[0] : undefined,
          textIndent: 0,
          preserve: kind === "label" || kind === "equation" || /^(?:https?:\/\/|doi\s*:|\S+@\S+)/i.test(line.text.trim()), lines: [line] };
        regions.push(previous); laneRegions.push(previous);
      }
    }
  }
  return regions.sort((a, b) => a.y - b.y || a.x - b.x).map((region, index) => ({ ...region, id: "region-" + index }));
}

/** Reserve the next source region's space before drawing any translated ink. */
export function translationBounds(regions: PageRegion[]) {
  return regions.map((region, i) => {
    let width = region.width;
    let height = region.height + region.fontSize * .25;
    for (const [j, other] of regions.entries()) {
      if (i === j || other.x >= region.x + region.width || other.x + other.width <= region.x) continue;
      if (other.y > region.y + .5) height = Math.min(height, other.y - region.y);
      else if (other.y + other.height > region.y && (Math.abs(other.y - region.y) <= .5 || other.preserve)) {
        if (other.x > region.x) width = Math.min(width, other.x - region.x);
        else if (other.preserve || (other.x === region.x && Math.abs(other.y - region.y) <= .5 && j < i)) width = 0;
      }
    }
    return { width, height };
  });
}

export function fitRegionText(text: string, region: PageRegion, measureText: (text: string, fontSize: number) => number,
  bounds = { width: region.width, height: region.height + region.fontSize * .25 }) {
  const measure = (value: string, size: number) => {
    let offset = 0, width = 0;
    for (const match of inlineScripts(value)) {
      width += measureText(value.slice(offset, match.index), size) + measureText(match[2], size * .65);
      offset = match.index + match[0].length;
    }
    return width + measureText(value.slice(offset), size);
  };
  const sourceSteps = region.lines.slice(1).map((line, index) => (line.y - region.lines[index].y) / region.fontSize).filter((step) => step > 1 && step < 1.8);
  const leading = sourceSteps.length ? Math.min(1.5, Math.max(1.1, median(sourceSteps))) : 1.2;
  const marker = region.marker;
  const content = text.replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").trim()
    .replace(marker ? /^\s*(?:[•●▪‣◦]|[-–*]|\(?\d+[)．])\s*/u : /$^/, "");
  const wrap = (size: number) => {
    const output: string[] = [];
    const hangingIndent = marker ? size * 1.35 : 0;
    for (const paragraph of content.split(/\n+/)) {
      let line = "";
      const lineWidth = () => bounds.width - hangingIndent - (output.length === 0 && !marker ? region.textIndent ?? 0 : 0);
      // Use words for Latin text; CJK characters may wrap individually.
      const tokens: string[] = [];
      for (const part of paragraph.match(/⟦(?:sup|sub):[^⟦⟧]+⟧|[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*\s*|[^A-Za-z0-9]/gu) ?? []) {
        if (part.startsWith("⟦") && tokens.length) tokens[tokens.length - 1] = tokens.at(-1)!.trimEnd() + part;
        else tokens.push(part);
      }
      for (const token of tokens) {
        if (line && measure(line + token, size) > lineWidth()) {
          // Do not leave Chinese closing punctuation alone at the start of a line.
          if (/^[，。；：！？、）】》]/.test(token) && !line.endsWith("⟧") && [...line].length > 1) {
            const chars = [...line];
            const last = chars.pop()!;
            output.push(chars.join("").trimEnd()); line = last;
          } else { output.push(line.trimEnd()); line = ""; }
        }
        if (measure(token, size) > lineWidth()) {
          for (const char of token.match(/[^⟦](?:⟦(?:sup|sub):[^⟦⟧]+⟧)+|⟦(?:sup|sub):[^⟦⟧]+⟧|./gu) ?? []) {
            if (line && measure(line + char, size) > lineWidth()) { output.push(line); line = ""; }
            line += char;
          }
        } else line += token;
      }
      if (line.trim()) output.push(line.trimEnd());
    }
    return output;
  };
  // Source typography is authoritative. Do not shrink unrelated fragments to
  // different sizes just to make an overflowing translation fit its rectangle.
  const size = region.fontSize;
  const lines = wrap(size);
  const lineHeight = size * leading;
  const hangingIndent = marker ? size * 1.35 : 0;
  const firstTooWide = lines.findIndex((line, index) => measure(line, size) + hangingIndent
    + (index === 0 && !marker ? region.textIndent ?? 0 : 0) > bounds.width + .001);
  const visibleLines = bounds.width > 0
    ? lines.slice(0, Math.min(firstTooWide < 0 ? lines.length : firstTooWide, Math.floor((bounds.height + .001) / lineHeight))) : [];
  return { fontSize: size, lines, lineHeight, hangingIndent, visibleLines, overflow: visibleLines.length < lines.length };
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

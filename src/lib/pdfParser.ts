import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PAPER_LAYOUT_VERSION } from "./types";
import type { IPaperOutlineItem, IPaperPage, IPaperTextBlock, PaperBlockKind, TextQuality } from "./types";

// 配置worker
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface IPdfParseResult {
  text: string;
  pageCount: number;
  pages: IPaperPage[];
  outline: IPaperOutlineItem[];
  textQuality: TextQuality;
}

interface LayoutItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

interface LayoutLine {
  text: string;
  y: number;
  fontSize: number;
  gapBefore: number;
}

function median(values: number[]) {
  if (!values.length) return 10;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function shouldInsertSpace(left: string, right: string, gap: number, fontSize: number) {
  if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) return false;
  if (/^[,.;:!?，。；：！？、)\]）】]/.test(right)) return false;
  if (/[（([【]$/.test(left)) return false;
  if (/\p{Script=Han}$/u.test(left) && /^\p{Script=Han}/u.test(right)) return false;
  return gap > Math.max(1.2, fontSize * 0.12);
}

function composeLine(items: LayoutItem[]) {
  const ordered = [...items].sort((a, b) => a.x - b.x);
  let text = "";
  let previousEnd = 0;
  for (const item of ordered) {
    const cleaned = item.str.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    if (shouldInsertSpace(text, cleaned, item.x - previousEnd, item.fontSize)) text += " ";
    text += cleaned;
    previousEnd = item.x + item.width;
  }
  return text.trim();
}

function toLayoutLines(content: { items: Array<{ str?: string; transform?: number[]; width?: number; height?: number } | object> }): LayoutLine[] {
  const items: LayoutItem[] = content.items.flatMap((item) => {
    if (!("str" in item) || typeof item.str !== "string" || !item.str.trim()) return [];
    const transform = item.transform;
    const fontSize = transform ? Math.max(1, Math.hypot(transform[0] ?? 0, transform[1] ?? 0)) : item.height ?? 10;
    return [{
      str: item.str,
      x: transform?.[4] ?? 0,
      y: transform?.[5] ?? 0,
      width: item.width ?? 0,
      fontSize,
    }];
  });

  const grouped: Array<{ items: LayoutItem[]; y: number; fontSize: number }> = [];
  for (const item of items) {
    const previous = grouped.at(-1);
    // Superscript author/affiliation markers usually sit 3-5 px above their
    // name while using a smaller font. Basing the tolerance on the smaller
    // font split every author and marker into a separate visual line. The
    // larger font still stays well below normal line spacing, so it safely
    // joins superscripts without folding neighbouring body lines together.
    const tolerance = Math.max(3.5, Math.max(previous?.fontSize ?? item.fontSize, item.fontSize) * 0.52);
    if (previous && Math.abs(previous.y - item.y) <= tolerance) {
      previous.items.push(item);
      previous.y = (previous.y * (previous.items.length - 1) + item.y) / previous.items.length;
      previous.fontSize = Math.max(previous.fontSize, item.fontSize);
    } else {
      grouped.push({ items: [item], y: item.y, fontSize: item.fontSize });
    }
  }

  return grouped
    .map((line, index) => ({
      text: composeLine(line.items),
      y: line.y,
      fontSize: line.fontSize,
      gapBefore: index === 0 ? 0 : Math.abs(grouped[index - 1].y - line.y),
    }))
    .filter((line) => line.text);
}

function compactSpacedHeading(text: string) {
  const trimmed = text.trim();
  if (/^(?:[A-Z]\s+){2,}[A-Z]$/i.test(trimmed)) return trimmed.replace(/\s+/g, "");
  return trimmed;
}

function isNamedSectionHeading(text: string) {
  const compact = compactSpacedHeading(text);
  return /^(?:abstract|摘要|keywords?|关键词|introduction|related\s*work|method(?:ology)?|experiments?|results?|discussion|conclusion|references|acknowledg(?:e)?ments?)[：:]?$/i.test(compact);
}

function looksLikeAuthorLine(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const namePairs = normalized.match(/\b[A-Z][A-Za-z'’-]+\s+[A-Z][A-Za-z'’-]+\b/g) ?? [];
  const affiliationMarkers = normalized.match(/\s[a-z](?:\s*,\s*(?:[a-z0-9]|\*{1,2})){1,}/g) ?? [];
  if (namePairs.length >= 1 && affiliationMarkers.length >= 1) return true;
  const commaSeparatedNames = normalized
    .split(",")
    .filter((part) => /\b[A-Z][A-Za-z'’-]+\s+[A-Z][A-Za-z'’-]+\b/.test(part));
  return commaSeparatedNames.length >= 2 && !/[.:!?]/.test(normalized);
}

function classifyLine(
  line: LayoutLine,
  index: number,
  bodySize: number,
  pageNumber: number,
  frontMatter: boolean,
  titleSize: number,
): PaperBlockKind {
  const text = line.text.trim();
  if (/^(?:fig(?:ure)?|table|图|表)\s*[\d一二三四五六七八九十]+[.：:\s]/i.test(text)) return "caption";
  if (isNamedSectionHeading(text)) return "heading";
  if (/^(?:第[一二三四五六七八九十百]+[章节]|\d+(?:\.\d+){0,3}\s+|[一二三四五六七八九十]+[、.])/.test(text) && text.length < 100) return "heading";
  if (/^(?:[-•·▪◦]|\d+[.)、]|[（(]?[一二三四五六七八九十]+[）)、.])\s*/.test(text)) return "list";
  if (pageNumber === 1 && frontMatter && looksLikeAuthorLine(text)) return "metadata";
  const isLikelyTitle = pageNumber === 1
    && index < 10
    && text.length < 220
    && line.fontSize >= bodySize * 1.28
    && line.fontSize >= titleSize * 0.88;
  if (isLikelyTitle) return "title";
  if (!frontMatter && line.fontSize >= bodySize * 1.42 && text.length < 180) return "heading";
  if (frontMatter && pageNumber === 1 && text.length < 240) return "metadata";
  const mathCharacters = (text.match(/[=<>≤≥±×÷∑∫√≈∞α-ωΑ-Ω^_]/g) ?? []).length;
  if (mathCharacters >= 3 && mathCharacters / Math.max(text.length, 1) > 0.08) return "equation";
  return "paragraph";
}

function joinWrappedLine(left: string, right: string) {
  if (/[-‐‑]$/.test(left) && /^[a-z]/.test(right)) return `${left.slice(0, -1)}${right}`;
  if (/\p{Script=Han}$/u.test(left) && /^\p{Script=Han}/u.test(right)) return `${left}${right}`;
  return `${left} ${right}`;
}

function buildPageContent(content: { items: Array<{ str?: string; transform?: number[]; width?: number; height?: number } | object> }, pageNumber: number) {
  const lines = toLayoutLines(content);
  const bodySize = median(lines.map((line) => line.fontSize).filter((size) => size > 4 && size < 40));
  const titleSize = pageNumber === 1
    ? Math.max(bodySize, ...lines.slice(0, 12).map((line) => line.fontSize))
    : bodySize;
  const drafts: Array<{ kind: PaperBlockKind; text: string }> = [];
  let frontMatter = pageNumber === 1;

  for (const [index, line] of lines.entries()) {
    const detected = classifyLine(line, index, bodySize, pageNumber, frontMatter, titleSize);
    if (detected === "heading") frontMatter = false;
    const previous = drafts.at(-1);
    const mergeGap = detected === "title"
      ? Math.max(bodySize * 2.8, line.fontSize * 1.85)
      : Math.max(bodySize * 1.75, line.fontSize * 1.55);
    const canMerge = previous
      && previous.kind === detected
      && (detected === "paragraph" || detected === "metadata" || detected === "title")
      && line.gapBefore < mergeGap;
    if (canMerge) {
      previous.text = detected === "metadata"
        ? `${previous.text}\n${line.text}`
        : joinWrappedLine(previous.text, line.text);
    } else {
      drafts.push({ kind: detected, text: line.text });
    }
  }

  let text = "";
  const blocks: IPaperTextBlock[] = drafts.map((draft, index) => {
    if (index > 0) text += "\n\n";
    const start = text.length;
    text += draft.text;
    return { id: `block-${pageNumber}-${index}`, kind: draft.kind, text: draft.text, start, end: text.length };
  });
  return { text: text.trim(), blocks };
}

function extractOutline(pages: IPaperPage[]): IPaperOutlineItem[] {
  const outline: IPaperOutlineItem[] = [];
  const seen = new Set<string>();
  const headingPatterns = [
    /^(\d+(?:\.\d+){0,3})\s+(.{2,90})$/,
    /^([一二三四五六七八九十百]+[、.])\s*(.{2,60})$/,
    /^(\d+[、.])\s*(.{2,60})$/,
    /^(第[一二三四五六七八九十百]+[章节])\s*(.{2,90})$/,
    /^(Abstract|摘要|Introduction|Related Work|Method(?:ology)?|Experiments?|Results?|Discussion|Conclusion|References|Acknowledg(?:e)?ments?)$/i,
  ];

  for (const page of pages) {
    for (const rawLine of page.text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.length > 100) continue;
      for (const pattern of headingPatterns) {
        const match = line.match(pattern);
        if (!match) continue;
        const title = line.replace(/\s+/g, " ");
        const key = title.toLowerCase();
        if (seen.has(key)) break;
        seen.add(key);
        const numericPrefix = match[1]?.match(/^\d+(?:\.\d+)*/)?.[0];
        const level = numericPrefix ? numericPrefix.split(".").length : 1;
        outline.push({ title, pageNumber: page.pageNumber, level });
        break;
      }
    }
  }
  return outline.slice(0, 80);
}

function assessTextQuality(pages: IPaperPage[]): TextQuality {
  const nonEmptyPages = pages.filter((page) => page.text.replace(/\s/g, "").length >= 40).length;
  const totalCharacters = pages.reduce((sum, page) => sum + page.text.replace(/\s/g, "").length, 0);
  if (nonEmptyPages === 0 || totalCharacters < pages.length * 30) return "scanned";
  if (nonEmptyPages / pages.length < 0.65 || totalCharacters < pages.length * 180) return "low";
  return "good";
}

/**
 * 解析PDF文件，提取文本内容
 */
export async function parsePdfFile(
  file: Blob,
  onProgress?: (progress: number) => void,
): Promise<IPdfParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = "";
  const pageCount = pdf.numPages;
  const pages: IPaperPage[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageContent = buildPageContent(textContent, i);
    const pageText = pageContent.text;
    pages.push({ pageNumber: i, text: pageText, blocks: pageContent.blocks, layoutVersion: PAPER_LAYOUT_VERSION });
    fullText += `\n--- 第 ${i} 页 ---\n${pageText}`;
    onProgress?.(Math.round((i / pageCount) * 100));
  }

  return {
    text: fullText,
    pageCount,
    pages,
    outline: extractOutline(pages),
    textQuality: assessTextQuality(pages),
  };
}

/**
 * 截断文本到指定长度（用于API调用限制）
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

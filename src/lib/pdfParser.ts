import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { IPaperOutlineItem, IPaperPage, TextQuality } from "./types";

// 配置worker
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface IPdfParseResult {
  text: string;
  pageCount: number;
  pages: IPaperPage[];
  outline: IPaperOutlineItem[];
  textQuality: TextQuality;
}

function normalizePageText(content: { items: Array<{ str?: string; hasEOL?: boolean; transform?: number[]; width?: number; height?: number } | object> }): string {
  const textItems = content.items;
  let output = "";
  let previousY: number | null = null;
  let previousEndX: number | null = null;
  for (const item of textItems) {
    if (!("str" in item) || typeof item.str !== "string" || !item.str) continue;
    const textItem = item as { str: string; hasEOL?: boolean; transform?: number[]; width?: number; height?: number };
    const x = textItem.transform?.[4];
    const y = textItem.transform?.[5];
    const lineChanged = previousY !== null && y !== undefined && Math.abs(y - previousY) > 2.5;
    if (lineChanged && !output.endsWith("\n")) {
      output += "\n";
    } else if (
      output
      && !/[\s-]$/.test(output)
      && x !== undefined
      && previousEndX !== null
      && x - previousEndX > Math.max(1.5, (textItem.height ?? 8) * 0.15)
    ) {
      output += " ";
    }
    output += textItem.str;
    output += textItem.hasEOL ? "\n" : " ";
    previousY = y ?? previousY;
    previousEndX = x !== undefined ? x + (textItem.width ?? 0) : previousEndX;
  }
  return output
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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
  file: File,
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
    const pageText = normalizePageText(textContent);
    pages.push({ pageNumber: i, text: pageText });
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

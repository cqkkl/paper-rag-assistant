import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// 配置worker
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface IPdfParseResult {
  text: string;
  pageCount: number;
}

/**
 * 解析PDF文件，提取文本内容
 */
export async function parsePdfFile(file: File): Promise<IPdfParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = "";
  const pageCount = pdf.numPages;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    fullText += `\n--- 第 ${i} 页 ---\n${pageText}`;
  }

  return {
    text: fullText,
    pageCount,
  };
}

/**
 * 截断文本到指定长度（用于API调用限制）
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

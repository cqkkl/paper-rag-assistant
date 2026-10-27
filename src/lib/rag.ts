import type { IPaper, IPaperPage } from "./types";

export interface RagChunk {
  id: string;
  pageNumber: number;
  section?: string;
  text: string;
  score: number;
}

const CHUNK_SIZE = 1100;
const CHUNK_OVERLAP = 180;

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const latin = normalized.match(/[a-z0-9][a-z0-9._-]+/g) ?? [];
  const chineseRuns = normalized.match(/[\u3400-\u9fff]+/g) ?? [];
  const chinese: string[] = [];
  for (const run of chineseRuns) {
    if (run.length === 1) chinese.push(run);
    for (let index = 0; index < run.length - 1; index += 1) {
      chinese.push(run.slice(index, index + 2));
    }
  }
  return [...latin, ...chinese];
}

function detectSection(text: string): string | undefined {
  const firstLines = text.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 4);
  return firstLines.find((line) =>
    /^(?:\d+(?:\.\d+)*\s+|第[一二三四五六七八九十百]+[章节]\s*|abstract$|摘要$|introduction$|conclusion)/i.test(line),
  );
}

export function chunkPages(pages: IPaperPage[]): RagChunk[] {
  const chunks: RagChunk[] = [];
  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;
    const section = detectSection(text);
    let index = 0;
    let chunkIndex = 0;
    while (index < text.length) {
      let end = Math.min(text.length, index + CHUNK_SIZE);
      if (end < text.length) {
        const naturalBreak = Math.max(
          text.lastIndexOf("\n", end),
          text.lastIndexOf("。", end),
          text.lastIndexOf(". ", end),
        );
        if (naturalBreak > index + CHUNK_SIZE * 0.55) end = naturalBreak + 1;
      }
      chunks.push({
        id: `${page.pageNumber}-${chunkIndex}`,
        pageNumber: page.pageNumber,
        section,
        text: text.slice(index, end).trim(),
        score: 0,
      });
      if (end >= text.length) break;
      index = Math.max(index + 1, end - CHUNK_OVERLAP);
      chunkIndex += 1;
    }
  }
  return chunks;
}

export function retrieveRelevantChunks(
  paper: Pick<IPaper, "pages" | "textContent">,
  query: string,
  limit = 6,
): RagChunk[] {
  const pages = paper.pages?.length
    ? paper.pages
    : [{ pageNumber: 1, text: paper.textContent ?? "" }];
  const chunks = chunkPages(pages);
  const queryTerms = [...new Set(tokenize(query))];
  if (!queryTerms.length) return chunks.slice(0, limit);

  const documentFrequency = new Map<string, number>();
  const tokenSets = chunks.map((chunk) => {
    const tokens = tokenize(chunk.text);
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
    return tokens;
  });

  const scored = chunks.map((chunk, index) => {
    const tokens = tokenSets[index];
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    let score = 0;
    let matchedTerms = 0;
    for (const term of queryTerms) {
      const frequency = frequencies.get(term) ?? 0;
      if (!frequency) continue;
      matchedTerms += 1;
      const inverseFrequency = Math.log((chunks.length + 1) / ((documentFrequency.get(term) ?? 0) + 0.5));
      score += (1 + Math.log(frequency)) * Math.max(0.2, inverseFrequency);
    }
    score += matchedTerms / queryTerms.length;
    if (chunk.section && queryTerms.some((term) => tokenize(chunk.section ?? "").includes(term))) {
      score += 1.5;
    }
    return { ...chunk, score };
  });

  const relevant = scored.filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score);
  return (relevant.length ? relevant : scored).slice(0, limit);
}

export function formatRetrievedContext(chunks: RagChunk[]): string {
  return chunks
    .map((chunk, index) => {
      const section = chunk.section ? `｜${chunk.section}` : "";
      return `[来源 ${index + 1}｜第 ${chunk.pageNumber} 页${section}]\n${chunk.text}`;
    })
    .join("\n\n---\n\n");
}

export function buildCoverageContext(paper: IPaper, maxLength = 28000): string {
  const pages = paper.pages?.length
    ? paper.pages
    : [{ pageNumber: 1, text: paper.textContent ?? "" }];
  if (!pages.length) return "";
  const perPageBudget = Math.max(500, Math.floor(maxLength / pages.length));
  return pages
    .map((page) => `[第 ${page.pageNumber} 页]\n${page.text.slice(0, perPageBudget)}`)
    .join("\n\n")
    .slice(0, maxLength);
}

export type PaperBlockKind = "title" | "heading" | "paragraph" | "list" | "caption" | "metadata" | "equation";

/**
 * Increment when the PDF text-layout heuristics change in a way that should
 * trigger a one-time reparse for documents already stored in IndexedDB.
 */
export const PAPER_LAYOUT_VERSION = 2;

export interface IPaperTextBlock {
  id: string;
  kind: PaperBlockKind;
  text: string;
  start: number;
  end: number;
}

export interface IPaperPage {
  pageNumber: number;
  text: string;
  blocks?: IPaperTextBlock[];
  layoutVersion?: number;
}

export interface IPaperOutlineItem {
  title: string;
  pageNumber: number;
  level: number;
}

export type TextQuality = "good" | "low" | "scanned";

export interface IPaperHighlight {
  id: string;
  pageNumber: number;
  start: number;
  end: number;
  text: string;
  color: "yellow" | "green" | "blue" | "pink";
  createdAt: number;
}

export interface IChatCitation {
  pageNumber: number;
  section?: string;
  excerpt: string;
  score: number;
}

export interface ILayoutTranslationCache {
  version: number;
  sourceKey: string;
  regions: Record<string, string>;
  previous?: { version: number; sourceKey: string; regions: Record<string, string> };
  history?: Array<{ version: number; sourceKey: string; regions: Record<string, string> }>;
}

// 文献类型定义
export interface IPaper {
  id: string;
  name: string;
  size: number;
  uploadTime: number;
  status: "uploading" | "parsing" | "ready" | "error";
  progress?: number;
  errorMessage?: string;
  textContent?: string;
  pageCount?: number;
  pages?: IPaperPage[];
  outline?: IPaperOutlineItem[];
  textQuality?: TextQuality;
  fileBlob?: Blob;
  fileUrl?: string;
  chatMessages?: IChatMessage[];
  notes?: string;
  aiSummary?: string;
  aiExtractedAbstract?: string;
  translations?: Record<number, string>;
  translationGlossary?: string;
  layoutTranslations?: Record<number, ILayoutTranslationCache>;
  pdfHighlights?: Array<{ id: string; pageNumber: number; text: string; rects: Array<{ x: number; y: number; width: number; height: number }> }>;
  translationClips?: Array<{ id: string; pageNumber: number; source: string; translation: string; target: "zh" | "en"; createdAt: number }>;
  highlights?: IPaperHighlight[];
  demo?: boolean;
}

export interface IChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  citations?: IChatCitation[];
  citationWarning?: string;
  demo?: boolean;
}

export interface IPaperPage {
  pageNumber: number;
  text: string;
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
  highlights?: IPaperHighlight[];
}

export interface IChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

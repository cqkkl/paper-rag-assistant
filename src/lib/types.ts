// 文献类型定义
export interface IPaper {
  id: string;
  name: string;
  size: number;
  uploadTime: number;
  status: "uploading" | "parsing" | "ready" | "error";
  textContent?: string;
  pageCount?: number;
  fileUrl?: string; // 用于PDF预览的Blob URL
}

export interface IChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

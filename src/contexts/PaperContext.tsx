import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { IPaper } from "@/lib/types";
import { loadPapers, removePaper, savePaper } from "@/lib/paperStore";

interface PaperContextType {
  papers: IPaper[];
  activePaper: IPaper | null;
  activePaperId: string | null;
  isHydrating: boolean;
  activeTab: string;
  previewPage: number;
  setActivePaperId: (id: string | null) => void;
  setActiveTab: (tab: string) => void;
  openPage: (pageNumber: number) => void;
  addPaper: (paper: IPaper) => void;
  updatePaper: (id: string, updates: Partial<IPaper>) => void;
  deletePaper: (id: string) => void;
}

const PaperContext = createContext<PaperContextType | undefined>(undefined);

export function PaperProvider({ children }: { children: ReactNode }) {
  const [papers, setPapers] = useState<IPaper[]>([]);
  const [activePaperId, setActivePaperId] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [activeTab, setActiveTab] = useState("summary");
  const [previewPage, setPreviewPage] = useState(1);
  const objectUrls = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    const urls = objectUrls.current;
    loadPapers()
      .then((storedPapers) => {
        if (cancelled) return;
        const restored = storedPapers.map((paper) => {
          const fileUrl = paper.fileBlob ? URL.createObjectURL(paper.fileBlob) : undefined;
          if (fileUrl) urls.add(fileUrl);
          return {
            ...paper,
            fileUrl,
            status: paper.status === "uploading" || paper.status === "parsing" ? "error" as const : paper.status,
            errorMessage: paper.status === "uploading" || paper.status === "parsing"
              ? "上次解析被中断，请删除后重新上传"
              : paper.errorMessage,
          };
        });
        setPapers(restored);
        setActivePaperId(restored[0]?.id ?? null);
      })
      .catch((error) => console.error("恢复本地文献失败:", error))
      .finally(() => {
        if (!cancelled) setIsHydrating(false);
      });

    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const addPaper = useCallback((paper: IPaper) => {
    if (paper.fileUrl) objectUrls.current.add(paper.fileUrl);
    setPapers((prev) => [paper, ...prev]);
    setActivePaperId(paper.id);
    setPreviewPage(1);
    void savePaper(paper).catch((error) => console.error("保存文献失败:", error));
  }, []);

  const updatePaper = useCallback((id: string, updates: Partial<IPaper>) => {
    setPapers((prev) => prev.map((paper) => {
      if (paper.id !== id) return paper;
      const updatedPaper = { ...paper, ...updates };
      if (updates.fileUrl) objectUrls.current.add(updates.fileUrl);
      const persistentKeys = Object.keys(updates).filter((key) => key !== "progress" && key !== "fileUrl");
      if (persistentKeys.length > 0) {
        void savePaper(updatedPaper).catch((error) => console.error("保存文献失败:", error));
      }
      return updatedPaper;
    }));
  }, []);

  const deletePaper = useCallback((id: string) => {
    setPapers((prev) => {
      const deleted = prev.find((paper) => paper.id === id);
      if (deleted?.fileUrl) {
        URL.revokeObjectURL(deleted.fileUrl);
        objectUrls.current.delete(deleted.fileUrl);
      }
      const next = prev.filter((paper) => paper.id !== id);
      setActivePaperId((current) => current === id ? next[0]?.id ?? null : current);
      return next;
    });
    void removePaper(id).catch((error) => console.error("删除本地文献失败:", error));
  }, []);

  const openPage = useCallback((pageNumber: number) => {
    setPreviewPage(Math.max(1, pageNumber));
    setActiveTab("pdf");
  }, []);

  const activePaper = papers.find((p) => p.id === activePaperId) || null;

  return (
    <PaperContext.Provider
      value={{
        papers,
        activePaper,
        activePaperId,
        isHydrating,
        activeTab,
        previewPage,
        setActivePaperId,
        setActiveTab,
        openPage,
        addPaper,
        updatePaper,
        deletePaper,
      }}
    >
      {children}
    </PaperContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePaper() {
  const context = useContext(PaperContext);
  if (context === undefined) {
    throw new Error("usePaper must be used within a PaperProvider");
  }
  return context;
}

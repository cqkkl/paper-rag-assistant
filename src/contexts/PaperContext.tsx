import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { IPaper } from "@/lib/types";

interface PaperContextType {
  papers: IPaper[];
  activePaper: IPaper | null;
  activePaperId: string | null;
  setActivePaperId: (id: string | null) => void;
  addPaper: (paper: IPaper) => void;
  updatePaper: (id: string, updates: Partial<IPaper>) => void;
  deletePaper: (id: string) => void;
}

const PaperContext = createContext<PaperContextType | undefined>(undefined);

export function PaperProvider({ children }: { children: ReactNode }) {
  const [papers, setPapers] = useState<IPaper[]>([]);
  const [activePaperId, setActivePaperId] = useState<string | null>(null);

  const addPaper = useCallback((paper: IPaper) => {
    setPapers((prev) => [paper, ...prev]);
    setActivePaperId(paper.id);
  }, []);

  const updatePaper = useCallback((id: string, updates: Partial<IPaper>) => {
    setPapers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  }, []);

  const deletePaper = useCallback((id: string) => {
    setPapers((prev) => prev.filter((p) => p.id !== id));
    if (activePaperId === id) {
      setActivePaperId(null);
    }
  }, [activePaperId]);

  const activePaper = papers.find((p) => p.id === activePaperId) || null;

  return (
    <PaperContext.Provider
      value={{
        papers,
        activePaper,
        activePaperId,
        setActivePaperId,
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

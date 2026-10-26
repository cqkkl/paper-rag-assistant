import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, MessageCircle, StickyNote, Sparkles, Languages, BookOpen } from "lucide-react";
import { SummaryTab } from "./tabs/SummaryTab";
import { ChatTab } from "./tabs/ChatTab";
import { NotesTab } from "./tabs/NotesTab";
import { BilingualTab } from "./tabs/BilingualTab";
import { PdfPreviewTab } from "./tabs/PdfPreviewTab";
import { usePaper } from "@/contexts/PaperContext";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState("summary");
  const { activePaper } = usePaper();

  return (
    <div className="min-h-full">
      {/* 顶部标题栏 */}
      <header className="border-b border-border bg-card px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">文献研读工作台</h2>
            <p className="text-sm text-muted-foreground">
              上传论文后，AI 自动为你生成摘要、解答疑问、整理笔记
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-accent/50 px-3 py-1.5">
            <Sparkles className="h-4 w-4 text-accent-foreground" />
            <span className="text-xs font-medium text-accent-foreground">
              AI 已就绪
            </span>
          </div>
        </div>
      </header>

      {/* 标签页内容 */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="summary" className="gap-2">
              <FileText className="h-4 w-4" />
              智能摘要
            </TabsTrigger>
            <TabsTrigger value="pdf" className="gap-2">
              <BookOpen className="h-4 w-4" />
              原文预览
            </TabsTrigger>
            <TabsTrigger value="bilingual" className="gap-2">
              <Languages className="h-4 w-4" />
              双语对照
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              文献问答
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2">
              <StickyNote className="h-4 w-4" />
              研读笔记
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-0">
            <SummaryTab key={activePaper?.id || "empty"} />
          </TabsContent>
          <TabsContent value="pdf" className="mt-0 h-full">
            <PdfPreviewTab key={activePaper?.id || "empty"} />
          </TabsContent>
          <TabsContent value="bilingual" className="mt-0">
            <BilingualTab key={activePaper?.id || "empty"} />
          </TabsContent>
          <TabsContent value="chat" className="mt-0">
            <ChatTab key={activePaper?.id || "empty"} />
          </TabsContent>
          <TabsContent value="notes" className="mt-0">
            <NotesTab key={activePaper?.id || "empty"} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

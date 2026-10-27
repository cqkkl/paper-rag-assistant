import { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, MessageCircle, StickyNote, Sparkles, Languages, BookOpen, ListTree, GitCompareArrows, Loader2, CircleAlert } from "lucide-react";
import { usePaper } from "@/contexts/PaperContext";
import { useApiKeyStatus } from "@/hooks/use-api-key-status";

const SummaryTab = lazy(() => import("./tabs/SummaryTab").then((module) => ({ default: module.SummaryTab })));
const ResearchChatTab = lazy(() => import("./tabs/ResearchChatTab").then((module) => ({ default: module.ResearchChatTab })));
const ResearchNotesTab = lazy(() => import("./tabs/ResearchNotesTab").then((module) => ({ default: module.ResearchNotesTab })));
const BilingualTab = lazy(() => import("./tabs/BilingualTab").then((module) => ({ default: module.BilingualTab })));
const PdfPreviewTab = lazy(() => import("./tabs/PdfPreviewTab").then((module) => ({ default: module.PdfPreviewTab })));
const OutlineTab = lazy(() => import("./tabs/OutlineTab").then((module) => ({ default: module.OutlineTab })));
const CompareTab = lazy(() => import("./tabs/CompareTab").then((module) => ({ default: module.CompareTab })));

function TabFallback() {
  return <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在加载功能…</div>;
}

export default function HomePage() {
  const { activePaper, activeTab, setActiveTab } = usePaper();
  const apiConfigured = useApiKeyStatus();
  const isParsing = activePaper?.status === "parsing" || activePaper?.status === "uploading";

  return (
    <div className="min-h-full">
      {/* 顶部标题栏 */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 py-3 pl-14 pr-4 backdrop-blur md:px-6 md:py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">文献研读工作台</h2>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              {activePaper ? activePaper.name : "上传论文后开始可追溯的深度研读"}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-accent/50 px-3 py-1.5" role="status">
            {isParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : apiConfigured ? <Sparkles className="h-4 w-4 text-accent-foreground" /> : <CircleAlert className="h-4 w-4 text-amber-600" />}
            <span className="text-xs font-medium text-accent-foreground">
              {isParsing ? "正在解析" : apiConfigured ? "AI 已连接" : "未配置 AI"}
            </span>
          </div>
        </div>
      </header>

      {/* 标签页内容 */}
      <div className="p-3 sm:p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-4 w-full overflow-x-auto pb-1">
          <TabsList className="w-max min-w-full justify-start">
            <TabsTrigger value="summary" className="gap-2">
              <FileText className="h-4 w-4" />
              智能摘要
            </TabsTrigger>
            <TabsTrigger value="pdf" className="gap-2">
              <BookOpen className="h-4 w-4" />
              原文预览
            </TabsTrigger>
            <TabsTrigger value="outline" className="gap-2">
              <ListTree className="h-4 w-4" />
              章节导读
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
            <TabsTrigger value="compare" className="gap-2">
              <GitCompareArrows className="h-4 w-4" />
              多文献对比
            </TabsTrigger>
          </TabsList>
          </div>

          <TabsContent value="summary" className="mt-0">
            <Suspense fallback={<TabFallback />}><SummaryTab key={activePaper?.id || "empty"} /></Suspense>
          </TabsContent>
          <TabsContent value="pdf" className="mt-0 h-full">
            <Suspense fallback={<TabFallback />}><PdfPreviewTab key={activePaper?.id || "empty"} /></Suspense>
          </TabsContent>
          <TabsContent value="outline" className="mt-0">
            <Suspense fallback={<TabFallback />}><OutlineTab key={activePaper?.id || "empty"} /></Suspense>
          </TabsContent>
          <TabsContent value="bilingual" className="mt-0">
            <Suspense fallback={<TabFallback />}><BilingualTab key={activePaper?.id || "empty"} /></Suspense>
          </TabsContent>
          <TabsContent value="chat" className="mt-0">
            <Suspense fallback={<TabFallback />}><ResearchChatTab key={activePaper?.id || "empty"} /></Suspense>
          </TabsContent>
          <TabsContent value="notes" className="mt-0">
            <Suspense fallback={<TabFallback />}><ResearchNotesTab key={activePaper?.id || "empty"} /></Suspense>
          </TabsContent>
          <TabsContent value="compare" className="mt-0">
            <Suspense fallback={<TabFallback />}><CompareTab /></Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

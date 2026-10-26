import { useRef, useCallback, useState, useEffect } from "react";
import { Upload, FileText, BookOpen, Loader2, Trash2, Settings, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePaper } from "@/contexts/PaperContext";
import { parsePdfFile } from "@/lib/pdfParser";
import { getApiKey, setApiKey, hasApiKey } from "@/lib/apiKeyStore";
import type { IPaper } from "@/lib/types";

export default function Sidebar() {
  const { papers, activePaperId, setActivePaperId, addPaper, updatePaper, deletePaper } = usePaper();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey());
  const [isApiKeySet, setIsApiKeySet] = useState(hasApiKey());
  
  // 侧边栏宽度调整
  const [width, setWidth] = useState(288); // 默认288px = w-72
  const sidebarRef = useRef<HTMLElement>(null);
  const isResizing = useRef(false);

  const handleMouseDown = () => {
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(220, Math.min(480, e.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim().length < 10) {
      toast.error("请输入有效的API Key");
      return;
    }
    setApiKey(apiKeyInput.trim());
    setIsApiKeySet(true);
    setApiKeyDialogOpen(false);
    toast.success("API Key 已保存");
  };

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const pdfFiles = Array.from(files).filter((f) => f.type === "application/pdf");
    
    if (pdfFiles.length === 0) {
      toast.error("请选择PDF格式的文件");
      return;
    }

    // 逐个处理文件
    for (const file of pdfFiles) {
      const paperId = Math.random().toString(36).substring(2, 9);
      
      // 添加到列表，状态为uploading
      const newPaper: IPaper = {
        id: paperId,
        name: file.name,
        size: file.size,
        uploadTime: Date.now(),
        status: "uploading",
      };
      addPaper(newPaper);

      try {
        // 标记为解析中
        updatePaper(paperId, { status: "parsing" });
        
        // 保存文件URL用于预览
        const fileUrl = URL.createObjectURL(file);
        updatePaper(paperId, { fileUrl });

        // 解析PDF
        const result = await parsePdfFile(file);
        
        // 标记为完成
        updatePaper(paperId, {
          status: "ready",
          textContent: result.text,
          pageCount: result.pageCount,
        });

        toast.success(`《${file.name}》解析完成，共 ${result.pageCount} 页`);
      } catch (error) {
        console.error("PDF解析失败:", error);
        updatePaper(paperId, { status: "error" });
        toast.error(`《${file.name}》解析失败，请重试`);
      }
    }

    // 清空input，允许重复选择同一个文件
    e.target.value = "";
  }, [addPaper, updatePaper]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getStatusIcon = (status: IPaper["status"]) => {
    switch (status) {
      case "uploading":
      case "parsing":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "ready":
        return <FileText className="h-4 w-4 text-success" />;
      case "error":
        return <FileText className="h-4 w-4 text-destructive" />;
    }
  };

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deletePaper(id);
    toast.info("文献已删除");
  }, [deletePaper]);

  return (
    <aside 
      ref={sidebarRef}
      className="relative flex h-full flex-col border-r border-sidebar-border bg-sidebar shrink-0"
      style={{ width: `${width}px` }}
    >
      {/* 拖动调整手柄 */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors"
        onMouseDown={handleMouseDown}
      />
      {/* 标题 */}
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-sidebar-foreground">
            文献研读助手
          </h1>
          <p className="text-xs text-sidebar-foreground/60">AI 驱动的学术阅读工具</p>
        </div>
      </div>

      {/* 上传按钮 */}
      <div className="px-4 pb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          className="w-full gap-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          上传 PDF 文献
        </Button>
      </div>

      {/* 分隔线 */}
      <div className="px-4">
        <div className="border-t border-sidebar-border" />
      </div>

      {/* 文献列表 */}
      <div className="flex-1 overflow-hidden px-3 py-3">
        <p className="mb-2 px-2 text-xs font-medium text-sidebar-foreground/60">
          已上传文献 ({papers.length})
        </p>
        <ScrollArea className="h-full">
          {papers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="mb-3 h-10 w-10 text-sidebar-foreground/20" />
              <p className="text-sm text-sidebar-foreground/50">
                暂无文献
              </p>
              <p className="mt-1 text-xs text-sidebar-foreground/40">
                上传第一篇论文开始研读
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {papers.map((paper) => (
                <div
                  key={paper.id}
                  onClick={() => setActivePaperId(paper.id)}
                  className={cn(
                    "group w-full rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer",
                    activePaperId === paper.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">
                      {getStatusIcon(paper.status)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {paper.name}
                      </p>
                      <p className="mt-0.5 text-xs text-sidebar-foreground/50">
                        {formatFileSize(paper.size)}
                        {paper.pageCount && ` · ${paper.pageCount}页`}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, paper.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* 底部 */}
      <div className="border-t border-sidebar-border px-4 py-3 space-y-2">
        <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/70">
              <Settings className="h-4 w-4" />
              API 设置
              {!isApiKeySet && <span className="ml-auto h-2 w-2 rounded-full bg-warning" />}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                DeepSeek API 设置
              </DialogTitle>
              <DialogDescription>
                输入你的 DeepSeek API Key，用于AI摘要、问答和笔记生成
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="sk-..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Key 只保存在你的浏览器本地，不会上传到任何服务器
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApiKeyDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSaveApiKey}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <p className="text-xs text-sidebar-foreground/40 px-1">
          数据保存在本地浏览器
        </p>
      </div>
    </aside>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen, CheckCircle2, FileText, Key, Loader2, Settings,
  Trash2, Upload, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePaper } from "@/contexts/PaperContext";
import { useApiKeyStatus } from "@/hooks/use-api-key-status";
import { clearApiKey, getApiKey, isApiKeyRemembered, setApiKey } from "@/lib/apiKeyStore";
import { testDeepSeekApiKey } from "@/lib/deepseek";
import { cn } from "@/lib/utils";
import type { IPaper } from "@/lib/types";
import { toast } from "sonner";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface PaperSidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export default function PaperSidebar({ mobile = false, onNavigate }: PaperSidebarProps) {
  const {
    papers, activePaperId, isHydrating, setActivePaperId,
    addPaper, updatePaper, deletePaper,
  } = usePaper();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState(288);
  const isResizing = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<IPaper | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey());
  const [rememberKey, setRememberKey] = useState(isApiKeyRemembered());
  const [testingKey, setTestingKey] = useState(false);
  const apiConfigured = useApiKeyStatus();

  useEffect(() => {
    if (mobile) return;
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing.current) return;
      setWidth(Math.max(240, Math.min(420, event.clientX)));
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
  }, [mobile]);

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;

    for (const file of files) {
      const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!looksLikePdf) {
        toast.error(`“${file.name}”不是 PDF 文件`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`“${file.name}”超过 50 MB 限制`);
        continue;
      }
      const signature = await file.slice(0, 5).text();
      if (!signature.startsWith("%PDF-")) {
        toast.error(`“${file.name}”不是有效的 PDF 文件`);
        continue;
      }

      const id = crypto.randomUUID();
      const fileUrl = URL.createObjectURL(file);
      addPaper({
        id,
        name: file.name,
        size: file.size,
        uploadTime: Date.now(),
        status: "parsing",
        progress: 0,
        fileBlob: file,
        fileUrl,
      });

      try {
        const { parsePdfFile } = await import("@/lib/pdfParser");
        const result = await parsePdfFile(file, (progress) => updatePaper(id, { progress }));
        updatePaper(id, {
          status: "ready",
          progress: 100,
          textContent: result.text,
          pageCount: result.pageCount,
          pages: result.pages,
          outline: result.outline,
          textQuality: result.textQuality,
        });
        if (result.textQuality === "scanned") {
          toast.warning(`《${file.name}》疑似扫描版，建议先进行 OCR`);
        } else if (result.textQuality === "low") {
          toast.warning(`《${file.name}》文本较少，问答结果可能不完整`);
        } else {
          toast.success(`《${file.name}》解析完成，共 ${result.pageCount} 页`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        const friendlyMessage = /password/i.test(message)
          ? "PDF 已加密，请先移除密码"
          : "PDF 解析失败，请检查文件是否损坏";
        updatePaper(id, { status: "error", errorMessage: friendlyMessage });
        toast.error(`《${file.name}》${friendlyMessage}`);
      }
    }
  }, [addPaper, updatePaper]);

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim().length < 10) {
      toast.error("请输入有效的 API Key");
      return;
    }
    setApiKey(apiKeyInput.trim(), rememberKey);
    setSettingsOpen(false);
    toast.success(rememberKey ? "API Key 已保存在此浏览器" : "API Key 仅在本次会话中保存");
  };

  const handleTestApiKey = async () => {
    if (apiKeyInput.trim().length < 10) {
      toast.error("请先输入 API Key");
      return;
    }
    setTestingKey(true);
    try {
      await testDeepSeekApiKey(apiKeyInput.trim());
      toast.success("DeepSeek 连接成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "连接测试失败");
    } finally {
      setTestingKey(false);
    }
  };

  const formatFileSize = (bytes: number) => bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const statusIcon = (paper: IPaper) => {
    if (paper.status === "parsing" || paper.status === "uploading") {
      return <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="正在解析" />;
    }
    if (paper.status === "error") {
      return <XCircle className="h-4 w-4 text-destructive" aria-label="解析失败" />;
    }
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="解析完成" />;
  };

  return (
    <aside
      className="relative flex h-full min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
      style={{ width: mobile ? "100%" : `${width}px` }}
      aria-label="文献库"
    >
      {!mobile && (
        <div
          role="separator"
          aria-label="调整侧栏宽度"
          aria-orientation="vertical"
          aria-valuemin={240}
          aria-valuemax={420}
          aria-valuenow={width}
          tabIndex={0}
          className="absolute bottom-0 right-0 top-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-primary/30 focus:bg-primary/30"
          onMouseDown={() => {
            isResizing.current = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") setWidth((value) => Math.max(240, value - 16));
            if (event.key === "ArrowRight") setWidth((value) => Math.min(420, value + 16));
          }}
        />
      )}

      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-sidebar-foreground">文献研读助手</h1>
          <p className="text-xs text-sidebar-foreground/60">传智杯 · 可追溯 AI 学术阅读</p>
        </div>
      </div>

      <div className="px-4 pb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) void processFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          data-upload-trigger="true"
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-3 text-sm transition-colors",
            isDragging ? "border-primary bg-primary/10 text-primary" : "border-sidebar-border bg-background/50 hover:border-primary/60 hover:bg-primary/5",
          )}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            void processFiles(event.dataTransfer.files);
          }}
        >
          <span className="flex items-center gap-2 font-medium"><Upload className="h-4 w-4" />上传或拖入 PDF</span>
          <span className="text-[11px] text-muted-foreground">支持多选，单个文件不超过 50 MB</span>
        </button>
      </div>

      <div className="mx-4 border-t border-sidebar-border" />
      <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
        <p className="mb-2 px-2 text-xs font-medium text-sidebar-foreground/60">文献库 ({papers.length})</p>
        <ScrollArea className="min-h-0 flex-1">
          {isHydrating ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />正在恢复本地文献…
            </div>
          ) : papers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="mb-3 h-10 w-10 text-sidebar-foreground/20" />
              <p className="text-sm text-sidebar-foreground/50">暂无文献</p>
              <p className="mt-1 text-xs text-sidebar-foreground/40">上传第一篇论文开始研读</p>
            </div>
          ) : (
            <div className="space-y-1 pr-2">
              {papers.map((paper) => (
                <div
                  key={paper.id}
                  className={cn(
                    "group flex items-start gap-1 rounded-lg p-1 transition-colors",
                    activePaperId === paper.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left"
                    onClick={() => { setActivePaperId(paper.id); onNavigate?.(); }}
                    aria-current={activePaperId === paper.id ? "true" : undefined}
                  >
                    <span className="mt-0.5 shrink-0">{statusIcon(paper)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{paper.name}</span>
                      <span className="mt-0.5 block text-xs text-sidebar-foreground/50">
                        {formatFileSize(paper.size)}{paper.pageCount ? ` · ${paper.pageCount} 页` : ""}
                      </span>
                      {(paper.status === "parsing" || paper.status === "uploading") && (
                        <Progress value={paper.progress ?? 0} className="mt-2 h-1" />
                      )}
                      {paper.errorMessage && <span className="mt-1 block text-[11px] text-destructive">{paper.errorMessage}</span>}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground opacity-100 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                    aria-label={`删除 ${paper.name}`}
                    onClick={() => setDeleteCandidate(paper)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="space-y-2 border-t border-sidebar-border px-4 py-3">
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/70">
              <Settings className="h-4 w-4" />API 设置
              <span className={cn("ml-auto h-2 w-2 rounded-full", apiConfigured ? "bg-emerald-500" : "bg-amber-500")} />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Key className="h-5 w-5" />DeepSeek API 设置</DialogTitle>
              <DialogDescription>用于摘要、检索问答、对比和笔记生成。</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input id="api-key" type="password" autoComplete="off" placeholder="sk-..." value={apiKeyInput} onChange={(event) => setApiKeyInput(event.target.value)} />
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="remember-key" checked={rememberKey} onCheckedChange={(checked) => setRememberKey(checked === true)} />
                <Label htmlFor="remember-key" className="font-normal leading-snug">在此浏览器中长期保存；关闭时只保留到当前会话结束</Label>
              </div>
              <p className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                Key 仅存放在当前浏览器；调用 AI 时会直接发送给 DeepSeek，不经过本站服务器。
              </p>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleTestApiKey} disabled={testingKey}>
                  {testingKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}测试连接
                </Button>
                {apiConfigured && <Button variant="ghost" onClick={() => { clearApiKey(); setApiKeyInput(""); toast.success("API Key 已删除"); }}>删除 Key</Button>}
              </div>
              <Button onClick={handleSaveApiKey}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <p className="px-1 text-xs text-sidebar-foreground/40">PDF、笔记和对话保存在此浏览器</p>
      </div>

      <AlertDialog open={Boolean(deleteCandidate)} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这篇文献？</AlertDialogTitle>
            <AlertDialogDescription>PDF、问答记录和笔记都会从当前浏览器中删除，且无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteCandidate) deletePaper(deleteCandidate.id);
                setDeleteCandidate(null);
              }}
            >删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

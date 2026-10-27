import { useState } from "react";
import { StickyNote, Download, Sparkles, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePaper } from "@/contexts/PaperContext";
import { callDeepSeek, buildNotesPrompt } from "@/lib/deepseek";
import { hasApiKey } from "@/lib/apiKeyStore";
import { toast } from "sonner";

export function NotesTab() {
  const { activePaper } = usePaper();
  const [isGenerating, setIsGenerating] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const handleGenerateNotes = async () => {
    if (!activePaper?.textContent) return;

    if (!hasApiKey()) {
      toast.error("请先在左侧设置中配置 DeepSeek API Key");
      return;
    }

    setIsGenerating(true);
    setNotes("");

    try {
      const messages = buildNotesPrompt(activePaper);
      await callDeepSeek(messages, (chunk) => {
        setNotes((prev) => prev + chunk);
      });
      toast.success("研读笔记生成完成");
    } catch (error) {
      console.error("生成笔记失败:", error);
      toast.error("生成笔记失败，请检查API Key和网络");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(notes);
    setCopied(true);
    toast.success("笔记已复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([notes], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activePaper?.name.replace(".pdf", "")}_研读笔记.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("笔记已下载");
  };

  if (!activePaper) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
              <StickyNote className="h-8 w-8 text-warning" />
            </div>
            <CardTitle>研读笔记</CardTitle>
            <CardDescription>
              AI 自动整理结构化研读笔记，包含核心观点、实验数据、参考文献，支持一键导出
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              上传文献后自动生成笔记
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">研读笔记</h3>
          <p className="text-sm text-muted-foreground">{activePaper.name}</p>
        </div>
        <div className="flex gap-2">
          {notes && (
            <>
              <Button size="sm" variant="outline" onClick={handleCopy} className="gap-2">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "已复制" : "复制"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownload} className="gap-2">
                <Download className="h-4 w-4" />
                导出
              </Button>
            </>
          )}
          <Button 
            size="sm" 
            onClick={handleGenerateNotes}
            disabled={isGenerating || activePaper.status !== "ready"}
            className="gap-2"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {notes ? "重新生成" : "生成笔记"}
          </Button>
        </div>
      </div>

      {isGenerating ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-warning" />
              AI 正在整理研读笔记...
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-sm leading-relaxed font-sans min-h-[300px]">
              {notes}
              <span className="inline-block w-2 h-4 bg-warning animate-pulse ml-1" />
            </div>
          </CardContent>
        </Card>
      ) : notes ? (
        <Card>
          <CardContent className="pt-6">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
              {notes}
            </pre>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <StickyNote className="mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground mb-2">点击右上角"生成笔记"按钮</p>
            <p className="text-sm text-muted-foreground/70">
              AI 将自动整理结构化的研读笔记
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

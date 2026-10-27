import { useEffect, useState } from "react";
import { Check, Copy, Download, Edit3, Eye, Loader2, Save, Sparkles, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownContent } from "@/components/MarkdownContent";
import { usePaper } from "@/contexts/PaperContext";
import { callDeepSeek, buildNotesPrompt } from "@/lib/deepseek";
import { hasApiKey } from "@/lib/apiKeyStore";
import { toast } from "sonner";

export function ResearchNotesTab() {
  const { activePaper, updatePaper } = usePaper();
  const [notes, setNotes] = useState(activePaper?.notes ?? "");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    if (!activePaper || saved) return;
    const timeout = window.setTimeout(() => {
      updatePaper(activePaper.id, { notes });
      setSaved(true);
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [activePaper, notes, saved, updatePaper]);

  if (!activePaper) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <StickyNote className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <CardTitle>研读笔记</CardTitle>
          <CardDescription>AI 生成初稿后仍可自由编辑，并自动保存在浏览器中。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const generateNotes = async () => {
    if (!activePaper.textContent) return;
    if (!hasApiKey()) {
      toast.error("请先配置 DeepSeek API Key");
      return;
    }
    setGenerating(true);
    setNotes("");
    try {
      const fullText = await callDeepSeek(buildNotesPrompt(activePaper), (chunk) => {
        setNotes((current) => current + chunk);
      });
      setNotes(fullText);
      setSaved(true);
      updatePaper(activePaper.id, { notes: fullText });
      toast.success("研读笔记已生成并保存");
    } catch (error) {
      console.error("生成笔记失败:", error);
      toast.error("生成失败，请检查 API Key 和网络");
    } finally {
      setGenerating(false);
    }
  };

  const copyNotes = async () => {
    await navigator.clipboard.writeText(notes);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    toast.success("笔记已复制");
  };

  const downloadNotes = () => {
    const url = URL.createObjectURL(new Blob([notes], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activePaper.name.replace(/\.pdf$/i, "")}_研读笔记.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">研读笔记</h2>
          <p className="text-xs text-muted-foreground">{saved ? "已保存到当前浏览器" : "正在保存…"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {notes && (
            <>
              <Button size="sm" variant="outline" onClick={() => setPreview((value) => !value)}>
                {preview ? <Edit3 className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}{preview ? "编辑" : "预览"}
              </Button>
              <Button size="sm" variant="outline" onClick={copyNotes}>{copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}{copied ? "已复制" : "复制"}</Button>
              <Button size="sm" variant="outline" onClick={downloadNotes}><Download className="mr-1 h-4 w-4" />导出</Button>
            </>
          )}
          <Button size="sm" onClick={() => void generateNotes()} disabled={generating || activePaper.status !== "ready"}>
            {generating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            {notes ? "重新生成" : "AI 生成初稿"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {preview ? (
            <MarkdownContent className="min-h-[420px]">{notes || "暂无笔记"}</MarkdownContent>
          ) : (
            <Textarea
              value={notes}
              onChange={(event) => { setNotes(event.target.value); setSaved(false); }}
              placeholder="在这里记录思考，或让 AI 生成一份带页码引用的笔记初稿…"
              className="min-h-[420px] resize-y font-mono text-sm leading-relaxed"
              aria-label="研读笔记编辑器"
            />
          )}
          {!saved && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Save className="h-3.5 w-3.5" />修改会自动保存</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

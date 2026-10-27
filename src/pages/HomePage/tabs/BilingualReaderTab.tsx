import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookOpenText, Check, Eraser, ExternalLink,
  Highlighter, Languages, Loader2, RefreshCw, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { usePaper } from "@/contexts/PaperContext";
import { useApiKeyStatus } from "@/hooks/use-api-key-status";
import { callDeepSeek } from "@/lib/deepseek";
import type { IPaperHighlight } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type HighlightColor = IPaperHighlight["color"];

const colorStyles: Record<HighlightColor, string> = {
  yellow: "bg-yellow-200/80 decoration-yellow-500",
  green: "bg-emerald-200/80 decoration-emerald-500",
  blue: "bg-sky-200/80 decoration-sky-500",
  pink: "bg-pink-200/80 decoration-pink-500",
};

const colorButtons: Array<{ color: HighlightColor; label: string; className: string }> = [
  { color: "yellow", label: "黄色", className: "bg-yellow-300" },
  { color: "green", label: "绿色", className: "bg-emerald-300" },
  { color: "blue", label: "蓝色", className: "bg-sky-300" },
  { color: "pink", label: "粉色", className: "bg-pink-300" },
];

const preferenceKey = (name: string) => `paper-rag-assistant:reader:${name}`;

function readPreference(name: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(preferenceKey(name));
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function savePreference(name: string, value: boolean) {
  try {
    localStorage.setItem(preferenceKey(name), String(value));
  } catch {
    // 隐私模式下保留当前会话状态即可。
  }
}

export function BilingualReaderTab() {
  const { activePaper, previewPage, openPage, updatePaper } = usePaper();
  const apiConfigured = useApiKeyStatus();
  const sourceRef = useRef<HTMLDivElement>(null);
  const translationRef = useRef<HTMLTextAreaElement>(null);
  const synchronizing = useRef(false);
  const autoRequested = useRef(new Set<string>());
  const pages = useMemo(() => activePaper?.pages ?? [], [activePaper?.pages]);
  const pageNumber = Math.min(Math.max(previewPage, 1), Math.max(1, pages.length));
  const currentPage = pages.find((page) => page.pageNumber === pageNumber) ?? pages[pageNumber - 1];
  const sourceText = currentPage?.text ?? "";
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");
  const [translation, setTranslation] = useState(activePaper?.translations?.[pageNumber] ?? "");
  const [translationDirty, setTranslationDirty] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [syncScroll, setSyncScroll] = useState(() => readPreference("sync-scroll", true));
  const [autoTranslate, setAutoTranslate] = useState(() => readPreference("auto-translate", true));

  const pageHighlights = useMemo(
    () => (activePaper?.highlights ?? [])
      .filter((highlight) => highlight.pageNumber === pageNumber)
      .sort((a, b) => a.start - b.start),
    [activePaper?.highlights, pageNumber],
  );

  useEffect(() => {
    sourceRef.current?.scrollTo({ top: 0 });
    translationRef.current?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (!activePaper || !translationDirty) return;
    const timeout = window.setTimeout(() => {
      updatePaper(activePaper.id, {
        translations: { ...(activePaper.translations ?? {}), [pageNumber]: translation },
      });
      setTranslationDirty(false);
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [activePaper, pageNumber, translation, translationDirty, updatePaper]);

  const translateCurrentPage = useCallback(async () => {
    if (!activePaper || !sourceText.trim() || translating) return;
    if (!apiConfigured) {
      toast.error("请先在左侧 API 设置中配置 DeepSeek Key");
      return;
    }

    setTranslating(true);
    setTranslation("");
    setTranslationDirty(false);
    try {
      const messages = [
        {
          role: "system" as const,
          content: `你是专业学术翻译助手。请将用户提供的论文页面完整翻译成准确、流畅的中文。
要求：
1. 保留原文段落顺序、标题层级、编号、公式和数据；
2. 专业术语首次出现时可保留英文括注；
3. 不得概括、删减或补充原文没有的信息；
4. 只输出译文，不要添加说明。`,
        },
        {
          role: "user" as const,
          content: `论文第 ${pageNumber} 页原文：\n\n${sourceText.slice(0, 18000)}`,
        },
      ];
      const fullText = await callDeepSeek(messages, (chunk) => {
        setTranslation((current) => current + chunk);
      });
      setTranslation(fullText);
      updatePaper(activePaper.id, {
        translations: { ...(activePaper.translations ?? {}), [pageNumber]: fullText },
      });
      toast.success(`第 ${pageNumber} 页翻译完成`);
    } catch (error) {
      console.error("页面翻译失败:", error);
      toast.error("翻译失败，请检查 API Key 和网络");
    } finally {
      setTranslating(false);
    }
  }, [activePaper, apiConfigured, pageNumber, sourceText, translating, updatePaper]);

  useEffect(() => {
    if (!autoTranslate || !apiConfigured || !activePaper || !sourceText.trim()) return;
    if (activePaper.translations?.[pageNumber]) return;
    const requestKey = `${activePaper.id}:${pageNumber}`;
    if (autoRequested.current.has(requestKey)) return;
    autoRequested.current.add(requestKey);
    void translateCurrentPage();
  }, [activePaper, apiConfigured, autoTranslate, pageNumber, sourceText, translateCurrentPage]);

  if (!activePaper) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <Languages className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <CardTitle>双语精读</CardTitle>
          <p className="text-sm text-muted-foreground">上传论文后，原文与对应译文会按页并排显示。</p>
        </CardHeader>
      </Card>
    );
  }

  const saveHighlights = (highlights: IPaperHighlight[]) => {
    updatePaper(activePaper.id, { highlights });
  };

  const addSelectionHighlight = () => {
    const selection = window.getSelection();
    const container = sourceRef.current;
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !container) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    const rawSelectedText = range.toString();
    const selectedText = rawSelectedText.trim();
    if (!selectedText) return;
    const before = document.createRange();
    before.selectNodeContents(container);
    before.setEnd(range.startContainer, range.startOffset);
    const leadingWhitespace = rawSelectedText.length - rawSelectedText.trimStart().length;
    const start = before.toString().length + leadingWhitespace;
    const end = start + selectedText.length;
    const allHighlights = activePaper.highlights ?? [];
    const overlaps = allHighlights.some((highlight) =>
      highlight.pageNumber === pageNumber && start < highlight.end && end > highlight.start,
    );
    if (overlaps) {
      toast.info("所选内容与已有高亮重叠");
      selection.removeAllRanges();
      return;
    }

    saveHighlights([
      ...allHighlights,
      {
        id: crypto.randomUUID(), pageNumber, start, end, text: selectedText,
        color: highlightColor, createdAt: Date.now(),
      },
    ]);
    selection.removeAllRanges();
    toast.success("已添加高亮");
  };

  const removeHighlight = (id: string) => {
    saveHighlights((activePaper.highlights ?? []).filter((highlight) => highlight.id !== id));
  };

  const clearPageHighlights = () => {
    saveHighlights((activePaper.highlights ?? []).filter((highlight) => highlight.pageNumber !== pageNumber));
  };

  const renderHighlightedSource = () => {
    if (!pageHighlights.length) return sourceText;
    const fragments: React.ReactNode[] = [];
    let cursor = 0;
    for (const highlight of pageHighlights) {
      const start = Math.max(cursor, Math.min(highlight.start, sourceText.length));
      const end = Math.max(start, Math.min(highlight.end, sourceText.length));
      if (start > cursor) fragments.push(sourceText.slice(cursor, start));
      fragments.push(
        <mark
          key={highlight.id}
          className={cn("cursor-pointer rounded-sm px-0.5 text-inherit underline decoration-2 underline-offset-2", colorStyles[highlight.color])}
          title="点击删除这条高亮"
          onClick={(event) => { event.stopPropagation(); removeHighlight(highlight.id); }}
        >
          {sourceText.slice(start, end)}
        </mark>,
      );
      cursor = end;
    }
    if (cursor < sourceText.length) fragments.push(sourceText.slice(cursor));
    return fragments;
  };

  const synchronizeScroll = (source: HTMLElement, target: HTMLElement) => {
    if (!syncScroll || synchronizing.current) return;
    const sourceRange = source.scrollHeight - source.clientHeight;
    const targetRange = target.scrollHeight - target.clientHeight;
    if (sourceRange <= 0 || targetRange <= 0) return;
    synchronizing.current = true;
    target.scrollTop = (source.scrollTop / sourceRange) * targetRange;
    window.requestAnimationFrame(() => { synchronizing.current = false; });
  };

  const outlineTitle = (page: number) => activePaper.outline?.find((item) => item.pageNumber === page)?.title;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Button size="icon" variant="outline" aria-label="上一页" disabled={pageNumber <= 1} onClick={() => openPage(pageNumber - 1)}><ArrowLeft className="h-4 w-4" /></Button>
          <select
            value={pageNumber}
            onChange={(event) => openPage(Number(event.target.value))}
            className="h-9 max-w-[260px] rounded-md border bg-background px-3 text-sm"
            aria-label="选择论文页码"
          >
            {pages.map((page) => (
              <option key={page.pageNumber} value={page.pageNumber}>
                第 {page.pageNumber} 页{outlineTitle(page.pageNumber) ? ` · ${outlineTitle(page.pageNumber)}` : ""}
              </option>
            ))}
          </select>
          <Button size="icon" variant="outline" aria-label="下一页" disabled={pageNumber >= pages.length} onClick={() => openPage(pageNumber + 1)}><ArrowRight className="h-4 w-4" /></Button>
          <span className="hidden text-xs text-muted-foreground sm:inline">共 {pages.length} 页</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2"><Checkbox checked={autoTranslate} onCheckedChange={(checked) => { const value = checked === true; setAutoTranslate(value); savePreference("auto-translate", value); }} />自动翻译新页面</label>
          <label className="flex items-center gap-2"><Checkbox checked={syncScroll} onCheckedChange={(checked) => { const value = checked === true; setSyncScroll(value); savePreference("sync-scroll", value); }} />同步滚动</label>
          {activePaper.fileUrl && (
            <Button size="sm" variant="ghost" onClick={() => window.open(`${activePaper.fileUrl}#page=${pageNumber}`, "_blank")}><ExternalLink className="mr-1 h-3.5 w-3.5" />PDF</Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:h-[calc(100dvh-230px)] md:min-h-[560px] md:grid-cols-2">
        <Card className="flex min-h-[520px] min-w-0 flex-col overflow-hidden md:min-h-0">
          <CardHeader className="space-y-3 border-b py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base"><BookOpenText className="h-4 w-4 text-primary" />原文 · 第 {pageNumber} 页</CardTitle>
              <div className="flex items-center gap-1">
                <Highlighter className="mr-1 h-4 w-4 text-muted-foreground" />
                {colorButtons.map((item) => (
                  <button
                    key={item.color}
                    type="button"
                    className={cn("h-5 w-5 rounded-full border-2", item.className, highlightColor === item.color ? "border-foreground" : "border-transparent")}
                    aria-label={`使用${item.label}高亮`}
                    onClick={() => setHighlightColor(item.color)}
                  />
                ))}
                {pageHighlights.length > 0 && (
                  <Button size="sm" variant="ghost" className="ml-1 h-7 px-2" onClick={clearPageHighlights}><Eraser className="mr-1 h-3.5 w-3.5" />清除</Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">鼠标选中文字即可高亮；点击已高亮内容可删除。</p>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <div
              ref={sourceRef}
              data-source-text="true"
              className="h-full max-h-[62vh] overflow-y-auto whitespace-pre-wrap p-5 text-sm leading-8 text-foreground/90 selection:bg-primary/20 md:max-h-none"
              onMouseUp={addSelectionHighlight}
              onScroll={(event) => translationRef.current && synchronizeScroll(event.currentTarget, translationRef.current)}
            >
              {sourceText ? renderHighlightedSource() : <span className="text-muted-foreground">此页未提取到可阅读文本，可能需要 OCR。</span>}
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-[520px] min-w-0 flex-col overflow-hidden md:min-h-0">
          <CardHeader className="border-b py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><Languages className="h-4 w-4 text-primary" />译文 · 第 {pageNumber} 页</CardTitle>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">{translationDirty ? "正在保存修改…" : translation ? <><Check className="h-3.5 w-3.5" />已保存，可直接编辑</> : "尚未生成译文"}</p>
              </div>
              <Button size="sm" variant={translation ? "outline" : "default"} disabled={translating || !sourceText} onClick={() => void translateCurrentPage()}>
                {translating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : translation ? <RefreshCw className="mr-1 h-4 w-4" /> : <Sparkles className="mr-1 h-4 w-4" />}
                {translating ? "翻译中…" : translation ? "重新翻译" : "翻译本页"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            {!apiConfigured && !translation ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center p-8 text-center">
                <Languages className="mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="font-medium">配置 API Key 后自动翻译</p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">无需复制粘贴。配置后进入任意页面，右侧会自动生成与左侧当前页对应的译文。</p>
              </div>
            ) : (
              <Textarea
                ref={translationRef}
                data-translation-editor="true"
                value={translation}
                onChange={(event) => { setTranslation(event.target.value); setTranslationDirty(true); }}
                onScroll={(event) => sourceRef.current && synchronizeScroll(event.currentTarget, sourceRef.current)}
                disabled={translating}
                placeholder={translating ? "正在生成对应译文…" : "译文将在这里显示，也可以直接修改。"}
                className="h-full min-h-[460px] resize-none rounded-none border-0 p-5 text-sm leading-8 shadow-none focus-visible:ring-0 md:min-h-0"
                aria-label={`第 ${pageNumber} 页可编辑译文`}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

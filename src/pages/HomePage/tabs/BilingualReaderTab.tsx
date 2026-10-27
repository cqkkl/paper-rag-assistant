import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookOpenText, Check, Eraser, ExternalLink,
  Eye, FilePenLine, Highlighter, ImageIcon, Languages, LayoutTemplate,
  Loader2, RefreshCw, Sparkles,
} from "lucide-react";
import { MarkdownContent } from "@/components/MarkdownContent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { usePaper } from "@/contexts/PaperContext";
import { useApiKeyStatus } from "@/hooks/use-api-key-status";
import { callDeepSeek } from "@/lib/deepseek";
import type { IPaperHighlight, IPaperTextBlock, PaperBlockKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type HighlightColor = IPaperHighlight["color"];
type SourceView = "layout" | "page";

const PdfPageVisual = lazy(() => import("@/components/PdfPageVisual").then((module) => ({ default: module.PdfPageVisual })));

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

function readTextPreference<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(preferenceKey(name));
    return allowed.includes(value as T) ? value as T : fallback;
  } catch {
    return fallback;
  }
}

function saveTextPreference(name: string, value: string) {
  try {
    localStorage.setItem(preferenceKey(name), value);
  } catch {
    // 隐私模式下保留当前会话状态即可。
  }
}

function inferBlockKind(text: string, index: number, pageNumber: number, frontMatter: boolean): PaperBlockKind {
  const trimmed = text.trim();
  if (/^(?:fig(?:ure)?|table|图|表)\s*[\d一二三四五六七八九十]+[.：:\s]/i.test(trimmed)) return "caption";
  if (/^(?:abstract|摘要|keywords?|关键词|introduction|related work|method(?:ology)?|experiments?|results?|discussion|conclusion|references|acknowledg(?:e)?ments?)\b[：:]?$/i.test(trimmed)) return "heading";
  if (/^(?:第[一二三四五六七八九十百]+[章节]|\d+(?:\.\d+){0,3}\s+|[一二三四五六七八九十]+[、.])/.test(trimmed) && trimmed.length < 100) return "heading";
  if (/^(?:[-•·▪◦]|\d+[.)、]|[（(]?[一二三四五六七八九十]+[）)、.])\s*/.test(trimmed)) return "list";
  if (pageNumber === 1 && index === 0 && trimmed.length < 180) return "title";
  if (frontMatter && pageNumber === 1 && trimmed.length < 260) return "metadata";
  const mathCharacters = (trimmed.match(/[=<>≤≥±×÷∑∫√≈∞α-ωΑ-Ω^_]/g) ?? []).length;
  if (mathCharacters >= 3 && mathCharacters / Math.max(trimmed.length, 1) > 0.08) return "equation";
  return "paragraph";
}

function inferTextBlocks(text: string, pageNumber: number): IPaperTextBlock[] {
  if (!text) return [];
  const lines = [...text.matchAll(/[^\n]*(?:\n|$)/g)].filter((match) => match[0]);
  const blocks: IPaperTextBlock[] = [];
  let frontMatter = pageNumber === 1;
  for (const [index, match] of lines.entries()) {
    const line = match[0];
    if (!line.trim()) continue;
    const start = match.index;
    const kind = inferBlockKind(line, index, pageNumber, frontMatter);
    if (kind === "heading") frontMatter = false;
    const previous = blocks.at(-1);
    if (previous && previous.kind === kind && (kind === "paragraph" || kind === "metadata")) {
      previous.end = start + line.length;
      previous.text = text.slice(previous.start, previous.end);
    } else {
      blocks.push({ id: `fallback-${pageNumber}-${index}`, kind, text: line, start, end: start + line.length });
    }
  }
  return blocks.map((block, index) => ({
    ...block,
    end: blocks[index + 1]?.start ?? text.length,
    text: text.slice(block.start, blocks[index + 1]?.start ?? text.length),
  }));
}

const blockStyles: Record<PaperBlockKind, string> = {
  title: "block pb-5 pt-1 text-center text-xl font-semibold leading-8 tracking-tight text-foreground",
  heading: "block mb-3 mt-5 border-l-2 border-primary pl-3 text-base font-semibold leading-7 text-foreground",
  paragraph: "block mb-4 text-justify text-[15px] leading-8 text-foreground/90",
  list: "block mb-2 rounded-lg bg-muted/45 px-3 py-2 text-[14px] leading-7 text-foreground/90",
  caption: "block my-4 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-center text-xs italic leading-6 text-muted-foreground",
  metadata: "block mb-5 whitespace-pre-line rounded-xl border bg-muted/25 p-4 text-xs leading-6 text-muted-foreground",
  equation: "block my-4 overflow-x-auto rounded-lg bg-slate-950 px-4 py-3 text-center font-mono text-xs leading-6 text-slate-100",
};

export function BilingualReaderTab() {
  const { activePaper, previewPage, openPage, updatePaper } = usePaper();
  const apiConfigured = useApiKeyStatus();
  const sourceRef = useRef<HTMLDivElement>(null);
  const translationRef = useRef<HTMLTextAreaElement>(null);
  const translationPreviewRef = useRef<HTMLDivElement>(null);
  const synchronizing = useRef(false);
  const autoRequested = useRef(new Set<string>());
  const pages = useMemo(() => activePaper?.pages ?? [], [activePaper?.pages]);
  const pageNumber = Math.min(Math.max(previewPage, 1), Math.max(1, pages.length));
  const currentPage = pages.find((page) => page.pageNumber === pageNumber) ?? pages[pageNumber - 1];
  const sourceText = currentPage?.text ?? "";
  const sourceBlocks = useMemo(() => {
    const blocks = currentPage?.blocks?.length ? currentPage.blocks : inferTextBlocks(sourceText, pageNumber);
    return blocks.map((block, index) => {
      const start = Math.max(0, Math.min(block.start, sourceText.length));
      const end = Math.max(start, Math.min(blocks[index + 1]?.start ?? sourceText.length, sourceText.length));
      return { ...block, start, end, text: sourceText.slice(start, end) };
    });
  }, [currentPage, pageNumber, sourceText]);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");
  const [translation, setTranslation] = useState(activePaper?.translations?.[pageNumber] ?? "");
  const [translationDirty, setTranslationDirty] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationEditing, setTranslationEditing] = useState(false);
  const [sourceView, setSourceView] = useState<SourceView>(() => readTextPreference("source-view", ["layout", "page"] as const, "layout"));
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
    translationPreviewRef.current?.scrollTo({ top: 0 });
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
    setTranslationEditing(false);
    setTranslation("");
    setTranslationDirty(false);
    try {
      const messages = [
        {
          role: "system" as const,
          content: `你是专业的学术论文翻译与版式编辑。请先根据语义还原 PDF 文本的正确阅读顺序，再完整翻译为准确、流畅的中文，并输出可直接渲染的 Markdown。

排版规则：
1. 合并 PDF 导致的错误断行，不要把每个视觉换行当成独立段落；
2. 用 #、##、### 表示论文标题和章节层级，正文按语义划分为自然段；
3. 作者姓名整理为连续、易读的一行；作者单位按 a、b、c 等标记整理为项目列表；
4. 关键词整理为“**关键词：** 词一；词二；词三”；
5. 枚举内容使用 Markdown 列表，表格使用 Markdown 表格；
6. 图片和表格标题使用引用块，例如“> **图 1｜标题**”；保留图号、表号及其说明；
7. 公式单独成行，保留变量、上下标含义、数据、单位、参考文献编号；
8. 专业术语首次出现时可保留英文括注；不得概括、删减或补充原文没有的信息；
9. 只输出排版后的译文，不要解释处理过程，也不要使用 Markdown 代码块。`,
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

  const renderHighlightedRange = (rangeStart: number, rangeEnd: number) => {
    const fragments: React.ReactNode[] = [];
    let cursor = rangeStart;
    for (const highlight of pageHighlights) {
      if (highlight.end <= rangeStart || highlight.start >= rangeEnd) continue;
      const start = Math.max(cursor, rangeStart, Math.min(highlight.start, sourceText.length));
      const end = Math.max(start, Math.min(highlight.end, rangeEnd, sourceText.length));
      if (start > cursor) fragments.push(sourceText.slice(cursor, start));
      fragments.push(
        <mark
          key={`${highlight.id}-${rangeStart}`}
          className={cn("cursor-pointer rounded-sm px-0.5 text-inherit underline decoration-2 underline-offset-2", colorStyles[highlight.color])}
          title="点击删除这条高亮"
          onClick={(event) => { event.stopPropagation(); removeHighlight(highlight.id); }}
        >
          {sourceText.slice(start, end)}
        </mark>,
      );
      cursor = end;
    }
    if (cursor < rangeEnd) fragments.push(sourceText.slice(cursor, rangeEnd));
    return fragments;
  };

  const renderStructuredSource = () => sourceBlocks.map((block) => (
    <span key={block.id} className={blockStyles[block.kind]} data-block-kind={block.kind}>
      {renderHighlightedRange(block.start, block.end)}
    </span>
  ));

  const synchronizeScroll = (source: HTMLElement, target: HTMLElement) => {
    if (!syncScroll || synchronizing.current) return;
    const sourceRange = source.scrollHeight - source.clientHeight;
    const targetRange = target.scrollHeight - target.clientHeight;
    if (sourceRange <= 0 || targetRange <= 0) return;
    synchronizing.current = true;
    target.scrollTop = (source.scrollTop / sourceRange) * targetRange;
    window.requestAnimationFrame(() => { synchronizing.current = false; });
  };

  const translationScroller = () => translationEditing ? translationRef.current : translationPreviewRef.current;

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
              <div className="flex rounded-lg bg-muted p-0.5 text-xs">
                <button
                  type="button"
                  className={cn("flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors", sourceView === "layout" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                  onClick={() => { setSourceView("layout"); saveTextPreference("source-view", "layout"); }}
                ><LayoutTemplate className="h-3.5 w-3.5" />智能排版</button>
                <button
                  type="button"
                  className={cn("flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors", sourceView === "page" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                  onClick={() => { setSourceView("page"); saveTextPreference("source-view", "page"); }}
                ><ImageIcon className="h-3.5 w-3.5" />原始版面</button>
              </div>
            </div>
            {sourceView === "layout" ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">已按标题、正文、列表与图表说明重排；鼠标划词即可高亮。</p>
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
            ) : (
              <p className="text-xs text-muted-foreground">完整保留 PDF 图片、表格、公式与原始布局，适合核对图文信息。</p>
            )}
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            {sourceView === "layout" ? (
              <div
                ref={sourceRef}
                data-source-text="true"
                className="h-full max-h-[62vh] overflow-y-auto px-5 py-6 selection:bg-primary/20 md:max-h-none sm:px-7"
                onMouseUp={addSelectionHighlight}
                onScroll={(event) => { const target = translationScroller(); if (target) synchronizeScroll(event.currentTarget, target); }}
              >
                {sourceText ? renderStructuredSource() : <span className="text-muted-foreground">此页未提取到可阅读文本，请切换“原始版面”查看页面图像。</span>}
              </div>
            ) : activePaper.fileBlob ? (
              <div ref={sourceRef} className="h-full max-h-[62vh] overflow-y-auto md:max-h-none" onScroll={(event) => { const target = translationScroller(); if (target) synchronizeScroll(event.currentTarget, target); }}>
                <Suspense fallback={<div className="flex min-h-[420px] items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在加载原始版面…</div>}>
                  <PdfPageVisual key={`${activePaper.id}-${pageNumber}`} file={activePaper.fileBlob} pageNumber={pageNumber} />
                </Suspense>
              </div>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-muted-foreground">原始 PDF 未保存在浏览器中，请重新上传文件。</div>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-[520px] min-w-0 flex-col overflow-hidden md:min-h-0">
          <CardHeader className="border-b py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><Languages className="h-4 w-4 text-primary" />译文 · 第 {pageNumber} 页</CardTitle>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">{translationDirty ? "正在保存修改…" : translation ? <><Check className="h-3.5 w-3.5" />已按学术结构排版并保存</> : "尚未生成译文"}</p>
              </div>
              <div className="flex items-center gap-2">
                {translation && !translating && (
                  <Button size="sm" variant="ghost" onClick={() => setTranslationEditing((value) => !value)}>
                    {translationEditing ? <><Eye className="mr-1 h-4 w-4" />阅读</> : <><FilePenLine className="mr-1 h-4 w-4" />编辑</>}
                  </Button>
                )}
                <Button size="sm" variant={translation ? "outline" : "default"} disabled={translating || !sourceText} onClick={() => void translateCurrentPage()}>
                  {translating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : translation ? <RefreshCw className="mr-1 h-4 w-4" /> : <Sparkles className="mr-1 h-4 w-4" />}
                  {translating ? "翻译排版中…" : translation ? "重新生成" : "翻译并排版"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            {!apiConfigured && !translation ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center p-8 text-center">
                <Languages className="mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="font-medium">配置 API Key 后自动翻译并排版</p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">AI 会修复错误断行，识别标题、作者、单位、列表和图表说明，再生成可继续编辑的译文。</p>
              </div>
            ) : translationEditing ? (
              <Textarea
                ref={translationRef}
                data-translation-editor="true"
                value={translation}
                onChange={(event) => { setTranslation(event.target.value); setTranslationDirty(true); }}
                onScroll={(event) => sourceRef.current && synchronizeScroll(event.currentTarget, sourceRef.current)}
                disabled={translating}
                spellCheck={false}
                placeholder="在这里修改译文或 Markdown 排版…"
                className="h-full min-h-[460px] resize-none rounded-none border-0 bg-muted/10 p-5 font-mono text-sm leading-7 shadow-none focus-visible:ring-0 md:min-h-0 sm:p-7"
                aria-label={`第 ${pageNumber} 页可编辑译文`}
              />
            ) : (
              <div
                ref={translationPreviewRef}
                data-translation-preview="true"
                className="h-full max-h-[62vh] overflow-y-auto px-5 py-6 md:max-h-none sm:px-8"
                onScroll={(event) => sourceRef.current && synchronizeScroll(event.currentTarget, sourceRef.current)}
              >
                {translating && !translation ? (
                  <div className="flex min-h-[380px] flex-col items-center justify-center text-center text-muted-foreground">
                    <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
                    <p className="font-medium text-foreground">正在翻译并整理学术版式</p>
                    <p className="mt-1 text-sm">将自动处理错误断行、标题层级与列表结构</p>
                  </div>
                ) : translation ? (
                  <MarkdownContent className="prose-headings:scroll-mt-4 prose-headings:tracking-tight prose-h1:border-b prose-h1:pb-3 prose-h1:text-2xl prose-h2:mt-8 prose-h2:border-l-2 prose-h2:border-primary prose-h2:pl-3 prose-h2:text-lg prose-p:text-justify prose-p:leading-8 prose-li:leading-7 prose-blockquote:rounded-r-lg prose-blockquote:bg-muted/40 prose-blockquote:py-2 prose-table:block prose-table:overflow-x-auto prose-th:bg-muted/60">
                    {translation}
                  </MarkdownContent>
                ) : (
                  <div className="flex min-h-[380px] items-center justify-center text-sm text-muted-foreground">点击“翻译并排版”生成本页译文。</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

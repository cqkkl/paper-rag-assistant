import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ArrowLeft, ArrowRight, Check, GripVertical, Highlighter, Languages, Loader2, Maximize2, Minimize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePaper } from "@/contexts/PaperContext";
import { useApiKeyStatus } from "@/hooks/use-api-key-status";
import { useReaderSizing } from "@/hooks/use-reader-sizing";
import { groupPageLines, fitRegionText, type PageLine, type PageRegion } from "@/lib/pdfLayout";
import { translateRegions } from "@/lib/layoutTranslation";
import { toast } from "sonner";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const VERSION = 1;

export function PdfParallelReader({ onTextMode }: { onTextMode?: () => void }) {
  const { activePaper, previewPage, openPage, updatePaper } = usePaper();
  const configured = useApiKeyStatus();
  const latest = useRef(activePaper);
  useEffect(() => { latest.current = activePaper; }, [activePaper]);
  const original = useRef<HTMLCanvasElement>(null);
  const translated = useRef<HTMLCanvasElement>(null);
  const leftScroll = useRef<HTMLDivElement>(null);
  const rightScroll = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const {
    widths: readerWidths, focus: readerFocus, toggleFocus: readerToggleFocus,
    root: readerRoot, stage: readerStage, reset: readerReset,
    heightRatio: readerHeightRatio, setHeight: readerSetHeight, height: readerHeight,
    split: readerSplit, setSplit: readerSetSplit,
    rightColumn: readerRightColumn, leftColumn: readerLeftColumn,
    startDrag: readerStartDrag, moveDrag: readerMoveDrag, stopDrag: readerStopDrag,
  } = useReaderSizing();
  const syncing = useRef(false);
  const request = useRef<AbortController | null>(null);
  const [layout, setLayout] = useState<{ width: number; height: number; regions: PageRegion[]; sourceKey: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState([0, 0]);
  const [repairing, setRepairing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<PageRegion | null>(null);
  const [draft, setDraft] = useState("");
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(() => {
    try { return localStorage.getItem("paper-rag:pdf-auto-translate") === "true"; } catch { return false; }
  });
  const autoStarted = useRef(false);
  const [glossary, setGlossary] = useState(activePaper?.translationGlossary ?? "");
  const [selection, setSelection] = useState<{ text: string; rects: Array<{ x: number; y: number; width: number; height: number }> } | null>(null);
  const stored = activePaper?.layoutTranslations?.[previewPage];
  const values = useMemo(() => stored?.version === VERSION && stored.sourceKey === layout?.sourceKey ? stored.regions : {}, [stored, layout]);
  const scales = readerWidths.map((width) => layout ? Math.min(width / layout.width, 1.8) * zoom : 1);
  const scale = scales[0];

  useEffect(() => {
    if (!readerFocus) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !editing) readerToggleFocus(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [readerFocus, readerToggleFocus, editing]);

  useEffect(() => {
    let disposed = false;
    let renderTask: ReturnType<pdfjs.PDFPageProxy["render"]> | undefined;
    let task: ReturnType<typeof pdfjs.getDocument> | undefined;
    void (async () => {
      try {
        const file = activePaper?.fileBlob;
        if (!file) return;
        task = pdfjs.getDocument({ data: await file.arrayBuffer() });
        const document = await task.promise;
        if (disposed) return;
        const page = await document.getPage(previewPage);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const lines: PageLine[] = [];
        for (const item of content.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          const t = pdfjs.Util.transform(viewport.transform, item.transform);
          // Rotated mathematical labels remain in the underlying PDF image.
          if (Math.abs(t[1]) > .2 || Math.abs(t[2]) > .2) continue;
          const size = Math.hypot(t[2], t[3]);
          const style = content.styles[item.fontName];
          const ascent = style?.ascent ?? .8;
          lines.push({ text: item.str, x: t[4], y: t[5] - size * ascent, width: item.width,
            height: size, fontSize: size, bold: /bold|black|heavy/i.test(`${item.fontName} ${style?.fontFamily ?? ""}`) });
        }
        const canvas = original.current;
        if (!canvas || disposed) return;
        const renderViewport = page.getViewport({ scale: Math.min(2.2, window.devicePixelRatio || 1.5) });
        canvas.width = Math.ceil(renderViewport.width); canvas.height = Math.ceil(renderViewport.height);
        renderTask = page.render({ canvas, viewport: renderViewport });
        await renderTask.promise;
        if (disposed) return;
        const copy = translated.current!;
        copy.width = canvas.width; copy.height = canvas.height;
        copy.getContext("2d")!.drawImage(canvas, 0, 0);
        const sizes = lines.map((line) => line.fontSize).sort((a, b) => a - b);
        const bodySize = sizes[Math.floor(sizes.length / 2)] ?? 11;
        const pixels = canvas.getContext("2d", { willReadFrequently: true })!;
        const factor = canvas.width / viewport.width;
        for (const line of lines) {
          if (line.fontSize > bodySize * 1.06 && line.text.length < 150) line.bold = true;
          const samples: number[][] = [];
          for (const dx of [.15, .5, .85]) for (const dy of [-1, line.height + 1]) {
            const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((line.x + line.width * dx) * factor)));
            const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((line.y + dy) * factor)));
            samples.push([...pixels.getImageData(x, y, 1, 1).data].slice(0, 3));
          }
          const bg = [0, 1, 2].map((channel) => samples.map((sample) => sample[channel]).sort((a, b) => a - b)[3]);
          line.background = `rgb(${bg.join(",")})`;
          const x = Math.max(0, Math.floor(line.x * factor));
          const y = Math.max(0, Math.floor(line.y * factor));
          const width = Math.min(canvas.width - x, Math.ceil(line.width * factor));
          const height = Math.min(canvas.height - y, Math.ceil(line.height * factor));
          if (width > 0 && height > 0) {
            const data = pixels.getImageData(x, y, width, height).data;
            const colors = new Map<string, number>();
            for (let i = 0; i < data.length; i += 4) {
              if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) < 180) continue;
              const color = `${data[i]},${data[i + 1]},${data[i + 2]}`;
              colors.set(color, (colors.get(color) ?? 0) + 1);
            }
            const ink = [...colors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
            if (ink) line.color = `rgb(${ink})`;
          }
        }
        const regions = groupPageLines(lines, viewport.width);
        setLayout({ width: viewport.width, height: viewport.height, regions,
          sourceKey: `${VERSION}:${viewport.width}:${viewport.height}:${regions.map((r) => `${r.id}:${r.x}:${r.y}:${r.text}`).join("|")}` });
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : "无法载入 PDF 页面");
      }
    })();
    return () => { disposed = true; request.current?.abort(); renderTask?.cancel(); void task?.destroy(); };
  }, [activePaper?.fileBlob, previewPage]);

  const fitted = useMemo(() => {
    const context = document.createElement("canvas").getContext("2d")!;
    return layout?.regions.map((region) => ({ region, fit: values[region.id] ? fitRegionText(values[region.id], region, (text, size) => {
      context.font = `${region.bold ? "600" : "400"} ${size}px "Noto Serif SC", "SimSun", serif`;
      return context.measureText(text).width;
    }) : null })) ?? [];
  }, [layout, values]);

  const saveValues = useCallback((regions: Record<string, string>) => {
    const paper = latest.current;
    if (!paper || !layout) return;
    updatePaper(paper.id, { layoutTranslations: { ...paper.layoutTranslations,
      [previewPage]: { version: VERSION, sourceKey: layout.sourceKey, regions } } });
  }, [layout, previewPage, updatePaper]);
  const translate = useCallback(async () => {
    if (!layout || busy) return;
    if (!configured) { toast.error("请先在 API 设置中配置 DeepSeek Key"); return; }
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(""); setRepairing(false);
    const existing = { ...values };
    try {
      const pending = layout.regions.filter((r) => !existing[r.id]);
      await translateRegions(pending, activePaper?.translationGlossary ?? "", controller.signal, (batch, done, total, status) => {
        if (controller.signal.aborted) return;
        setProgress([done, total]); setRepairing(status?.repairing ?? false); saveValues({ ...existing, ...batch });
      });
      toast.success("本页译文已按原版位置保存");
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "翻译失败，请重试");
    } finally { if (request.current === controller) setBusy(false); }
  }, [layout, busy, configured, values, activePaper, saveValues]);
  useEffect(() => {
    if (!autoTranslate || !configured || !layout || autoStarted.current) return;
    if (!layout.regions.some((r) => !r.preserve && !values[r.id])) return;
    const timer = window.setTimeout(() => { autoStarted.current = true; void translate(); }, 200);
    return () => window.clearTimeout(timer);
  }, [autoTranslate, configured, layout, values, translate]);
  const sync = (from: HTMLDivElement, to: HTMLDivElement | null) => {
    if (!to || syncing.current) return;
    syncing.current = true;
    const fromScale = Number(from.dataset.pageScale) || 1;
    const toScale = Number(to.dataset.pageScale) || 1;
    to.scrollTop = from.scrollTop * toScale / fromScale;
    to.scrollLeft = from.scrollLeft * toScale / fromScale;
    requestAnimationFrame(() => { syncing.current = false; });
  };
  const capture = () => {
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed || !sheet.current || !layout) return;
    const range = selected.getRangeAt(0);
    if (!sheet.current.contains(range.commonAncestorContainer)) return;
    const bounds = sheet.current.getBoundingClientRect();
    const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map((r) => ({
      x: Math.max(0, (r.left - bounds.left) / scale), y: Math.max(0, (r.top - bounds.top) / scale),
      width: Math.min(layout.width, r.width / scale), height: r.height / scale,
    }));
    setSelection({ text: selected.toString(), rects });
  };
  const translatedCount = layout?.regions.filter((r) => !r.preserve && values[r.id]).length ?? 0;
  const total = layout?.regions.filter((r) => !r.preserve).length ?? 0;
  const overflow = fitted.filter((r) => r.fit?.overflow).length;
  const marks = activePaper?.pdfHighlights?.filter((h) => h.pageNumber === previewPage) ?? [];
  const jumpToRegion = (region: PageRegion) => {
    setSelected(region.id);
    leftScroll.current?.scrollTo({ top: Math.max(0, region.y * scales[0] - 80), behavior: "smooth" });
    rightScroll.current?.scrollTo({ top: Math.max(0, region.y * scales[1] - 80), behavior: "smooth" });
  };

  return <div ref={readerRoot} data-reader-focus={readerFocus} className={readerFocus ? "fixed inset-0 z-40 overflow-auto bg-background p-2 sm:p-3" : "space-y-1.5"}>
    <div data-reader-controls="true" className="space-y-1.5">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="mr-2 flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={autoTranslate} onChange={(e) => {
          setAutoTranslate(e.target.checked);
          try { localStorage.setItem("paper-rag:pdf-auto-translate", String(e.target.checked)); } catch { /* Keep the session preference. */ }
        }} />切页自动翻译</label>
        <Button size="icon" variant="outline" aria-label="上一页" disabled={previewPage <= 1} onClick={() => openPage(previewPage - 1)}><ArrowLeft className="h-4 w-4" /></Button>
        <select className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="选择论文页码" value={previewPage} onChange={(e) => openPage(Number(e.target.value))}>{Array.from({ length: activePaper?.pageCount ?? 1 }, (_, i) => <option value={i + 1} key={i}>第 {i + 1} 页 / {activePaper?.pageCount}</option>)}</select>
        <Button size="icon" variant="outline" aria-label="下一页" disabled={previewPage >= (activePaper?.pageCount ?? 1)} onClick={() => openPage(previewPage + 1)}><ArrowRight className="h-4 w-4" /></Button>
        <span className="mx-1 h-5 border-l" />
        <Button size="icon" variant="ghost" aria-label="缩小两侧页面" disabled={zoom <= .75} onClick={() => setZoom((z) => z - .25)}><Minus className="h-4 w-4" /></Button>
        <button className="text-xs tabular-nums" onClick={() => setZoom(1)} title="点击恢复适合宽度" aria-label="适合栏宽">{zoom === 1 ? "适合宽度" : `${Math.round(zoom * 100)}%`}</button>
        <Button size="icon" variant="ghost" aria-label="放大两侧页面" disabled={zoom >= 2.5} onClick={() => setZoom((z) => z + .25)}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => readerToggleFocus(!readerFocus)}>{readerFocus ? <Minimize2 className="mr-1 h-3.5 w-3.5" /> : <Maximize2 className="mr-1 h-3.5 w-3.5" />}{readerFocus ? "退出专注" : "专注阅读"}</Button>
        <Button size="icon" variant="ghost" aria-label="重置阅读布局" title="恢复等宽、充满高度及默认缩放" onClick={() => { readerReset(); setZoom(1); }}><RotateCcw className="h-3.5 w-3.5" /></Button>
        {onTextMode && <Button size="sm" variant="ghost" className="hidden xl:inline-flex" onClick={onTextMode}>文本精读</Button>}
        <Button size="sm" variant="ghost" onClick={() => setGlossaryOpen((v) => !v)}>术语约定</Button>
        {busy ? <Button size="sm" variant="outline" onClick={() => request.current?.abort()}>取消翻译</Button>
          : <Button size="sm" disabled={!layout || !total || translatedCount === total} onClick={() => void translate()}><Languages className="mr-2 h-4 w-4" />{translatedCount > 0 && translatedCount < total ? "继续翻译本页" : translatedCount === total && total ? "本页已翻译" : error ? "重试本页翻译" : "翻译本页 · 保留版式"}</Button>}
      </div>
    </div>
    {glossaryOpen && <div className="rounded-lg border bg-card p-4"><label htmlFor="layout-glossary" className="mb-2 block text-sm font-medium">本篇论文的术语约定</label><Textarea id="layout-glossary" value={glossary} maxLength={3000} onChange={(e) => setGlossary(e.target.value)} placeholder="cavitation = 空化" /><Button className="mt-2" size="sm" onClick={() => { updatePaper(activePaper!.id, { translationGlossary: glossary }); toast.success("已保存，用于后续翻译"); }}>保存术语</Button></div>}
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
      <span>{busy ? <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />{repairing ? "正在自动补译缺失区域" : "正在逐区翻译"} {progress[0]}/{progress[1]}</span> : <span className="flex items-center gap-1">{total > 0 && translatedCount === total ? <Check className="h-3.5 w-3.5" /> : <Languages className="h-3.5 w-3.5" />}已翻译 {translatedCount}/{total}{translatedCount < total && " · 未完成区域暂显原文"}</span>}</span>
      <div className="flex flex-wrap items-center gap-3"><span className="hidden lg:inline">拖动中线调宽 · 拖动底边调高 · 双击恢复</span><label className="flex items-center gap-1">高度<select aria-label="阅读区高度" className="rounded border bg-background px-1 py-0.5" value={Math.round(readerHeightRatio * 100)} onChange={(e) => readerSetHeight(Number(e.target.value) / 100)}>{![100, 85, 70].includes(Math.round(readerHeightRatio * 100)) && <option value={Math.round(readerHeightRatio * 100)}>{Math.round(readerHeightRatio * 100)}%</option>}<option value="100">充满屏幕</option><option value="85">85%</option><option value="70">70%</option></select></label><span className="tabular-nums">原文 {Math.round(readerSplit)}% / 译文 {Math.round(100 - readerSplit)}%</span></div>
    </div>
    {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {layout && !total && <p className="rounded-lg border bg-card p-3 text-sm">此页没有可翻译的文本层。原始图像已保留；扫描页需要先经过 OCR。</p>}
    {overflow > 0 && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">{overflow} 个区域译文较长，已用橙色边框标出。点击区域查看完整译文并修订。</p>}
    {selection && <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-2 text-sm"><span className="max-w-lg truncate">{selection.text}</span><Button size="sm" variant="secondary" onClick={() => {
      const paper = latest.current!;
      updatePaper(paper.id, { pdfHighlights: [...(paper.pdfHighlights ?? []), { id: crypto.randomUUID(), pageNumber: previewPage, ...selection }] });
      setSelection(null); window.getSelection()?.removeAllRanges();
    }}><Highlighter className="mr-1 h-4 w-4" />高亮所选语句</Button><Button size="sm" variant="ghost" onClick={() => setSelection(null)}>取消</Button></div>}
    </div>
    <div ref={readerStage} className="grid rounded-lg border bg-slate-100/70 p-1.5 dark:bg-muted/30" style={{ height: readerHeight, gridTemplateColumns: `minmax(0, ${readerSplit}fr) 14px minmax(0, ${100 - readerSplit}fr)` }} data-pdf-parallel="true">
      {[false, true].map((right) => { const pageScale = scales[right ? 1 : 0]; return <Fragment key={String(right)}><section className="flex min-h-0 min-w-0 flex-col" ref={right ? readerRightColumn : readerLeftColumn}>
        <div className="flex h-7 shrink-0 items-center justify-between gap-1 px-1 text-xs font-medium"><span className="truncate">{right ? translatedCount ? "中文译文 · 原版对照" : "待翻译 · 当前显示原文" : "论文原文 · 原始 PDF"}</span><span className="shrink-0 font-normal text-muted-foreground">第 {previewPage} 页</span></div>
        <div ref={right ? rightScroll : leftScroll} data-pdf-pane={right ? "translation" : "source"} data-page-scale={pageScale} style={{ scrollbarGutter: "stable" }} className="min-h-0 flex-1 overflow-auto overscroll-contain rounded bg-slate-200/40 p-2 dark:bg-muted/50"
          onScroll={(e) => sync(e.currentTarget, right ? leftScroll.current : rightScroll.current)}>
          <div style={{ width: layout ? layout.width * pageScale : "100%", height: layout ? layout.height * pageScale : 760, position: "relative", margin: "0 auto" }}>
            <div ref={right ? undefined : sheet} className="absolute left-0 top-0 origin-top-left bg-white text-black shadow-lg" style={{ width: layout?.width ?? 612, height: layout?.height ?? 792, transform: `scale(${pageScale})` }} onMouseUp={right ? undefined : capture} onKeyUp={right ? undefined : (e) => { if (e.key === "Shift") capture(); }}>
              <canvas ref={right ? translated : original} className="absolute inset-0 h-full w-full" aria-label={`${right ? "译文" : "原文"} PDF 第 ${previewPage} 页背景`} />
              {!layout && <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white/90 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />正在还原 PDF 页面…</div>}
              {fitted.map(({ region, fit }) => {
                const common = { position: "absolute" as const, left: region.x, top: region.y, width: region.width, height: region.height };
                if (!right) return <span key={region.id} data-source-region={region.id} style={{ ...common, color: "transparent", fontSize: region.fontSize, lineHeight: 1, cursor: "text", outline: selected === region.id ? "1px solid #60a5fa" : undefined }} onClick={() => setSelected(region.id)}>
                  {region.lines.map((line, i) => <span key={i} style={{ position: "absolute", left: line.x - region.x, top: line.y - region.y, width: line.width, height: line.height, whiteSpace: "pre", fontSize: line.fontSize }}>{line.text}</span>)}
                </span>;
                if (!fit) return null;
                return <div key={region.id}>
                  {region.lines.map((line, i) => <span key={i} aria-hidden="true" style={{ position: "absolute", left: line.x - 1, top: line.y - line.fontSize * .16, width: line.width + 2, height: line.height + line.fontSize * .32, background: line.background ?? "white" }} />)}
                  <button data-translated-region={region.id} disabled={busy} title={busy ? "翻译完成后可修改" : "点击编辑完整译文"} onClick={() => { jumpToRegion(region); setEditing(region); setDraft(values[region.id]); }}
                    className="m-0 cursor-text border-0 bg-transparent p-0 text-left hover:outline hover:outline-1 hover:outline-blue-400"
                    style={{ ...common, height: region.height + region.fontSize * .18, color: region.color ?? "black", fontFamily: '"Noto Serif SC", "SimSun", serif', fontWeight: region.bold ? 600 : 400, fontSize: fit.fontSize, lineHeight: `${fit.fontSize * 1.14}px`, whiteSpace: "pre", overflow: "hidden", outline: fit.overflow ? "1px solid #f59e0b" : selected === region.id ? "1px solid #60a5fa" : undefined }}>
                    {fit.lines.join("\n")}
                  </button>
                </div>;
              })}
              {!right && marks.flatMap((mark) => mark.rects.map((rect, i) => <button key={`${mark.id}-${i}`} title="点击删除高亮" aria-label={`删除高亮：${mark.text}`} onClick={() => updatePaper(activePaper!.id, { pdfHighlights: latest.current!.pdfHighlights?.filter((h) => h.id !== mark.id) })}
                style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.width, height: rect.height, background: "rgba(250,204,21,.35)", mixBlendMode: "multiply", border: 0, padding: 0 }} />))}
            </div>
          </div>
        </div>
      </section>{!right && <div role="separator" tabIndex={0} aria-label="调整原文与译文宽度" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(readerSplit)}
        className="group flex touch-none select-none items-center justify-center rounded cursor-col-resize hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary" title="左右拖动调整栏宽；双击恢复等宽；方向键微调"
        onPointerDown={(e) => readerStartDrag(e, "split")} onPointerMove={readerMoveDrag} onPointerUp={readerStopDrag} onPointerCancel={readerStopDrag} onLostPointerCapture={readerStopDrag} onDoubleClick={() => readerSetSplit(50)}
        onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); readerSetSplit(readerSplit + (e.key === "ArrowLeft" ? -2 : 2)); } if (e.key === "Home") readerSetSplit(50); }}>
        <GripVertical className="h-8 w-3 text-muted-foreground/60 group-hover:text-primary" />
      </div>}</Fragment>; })}
    </div>
    <div role="separator" aria-label="调整阅读区高度" aria-orientation="horizontal" aria-valuemin={45} aria-valuemax={100} aria-valuenow={Math.round(readerHeightRatio * 100)} tabIndex={0}
      className="flex h-4 touch-none select-none cursor-row-resize items-center justify-center rounded hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary" title="上下拖动调整阅读高度；双击充满可用空间"
      onPointerDown={(e) => readerStartDrag(e, "height")} onPointerMove={readerMoveDrag} onPointerUp={readerStopDrag} onPointerCancel={readerStopDrag} onLostPointerCapture={readerStopDrag} onDoubleClick={() => readerSetHeight(1)}
      onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); readerSetHeight(readerHeightRatio + (e.key === "ArrowUp" ? -.05 : .05)); } if (e.key === "Home") readerSetHeight(1); }}><span className="h-1 w-12 rounded-full bg-muted-foreground/30" /></div>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-5" onClick={() => setEditing(null)}>
      <section role="dialog" aria-modal="true" aria-label="编辑对应区域译文" className="w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}>
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">第 {previewPage} 页 · 对应区域译文</h2><Button size="icon" variant="ghost" aria-label="关闭译文编辑" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button></div>
        <p className="mb-4 max-h-40 overflow-auto rounded-lg bg-muted p-3 text-sm leading-relaxed">{editing.text}</p>
        <Textarea autoFocus aria-label="对应区域译文" className="min-h-40 leading-relaxed" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <p className="mt-2 text-xs text-muted-foreground">保存后按原位置重新适配字号与行距。译文较长时可放大页面阅读。</p>
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button disabled={!draft.trim()} onClick={() => { saveValues({ ...values, [editing.id]: draft.trim() }); setEditing(null); toast.success("译文已保存并回填原位"); }}>保存并回填</Button></div>
      </section>
    </div>}
  </div>;
}

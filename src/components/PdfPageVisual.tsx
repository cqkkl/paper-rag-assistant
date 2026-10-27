import { useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, ScanSearch } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfPageVisualProps {
  file: Blob;
  pageNumber: number;
}

export function PdfPageVisual({ file, pageNumber }: PdfPageVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let disposed = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;
    let renderTask: { cancel: () => void; promise: Promise<void> } | undefined;

    void (async () => {
      try {
        const data = await file.arrayBuffer();
        if (disposed) return;
        loadingTask = pdfjsLib.getDocument({ data });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        const scale = Math.max(1, Math.min(2.2, 1080 / baseViewport.width)) * pixelRatio;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || disposed) return;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas 不可用");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
        if (!disposed) setStatus("ready");
      } catch (error) {
        if (disposed || (error instanceof Error && error.name === "RenderingCancelledException")) return;
        console.error("PDF 页面渲染失败:", error);
        setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [file, pageNumber]);

  if (status === "error") {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <ScanSearch className="mb-3 h-10 w-10 opacity-30" />
        <p className="font-medium text-foreground">原始页面渲染失败</p>
        <p className="mt-1 text-sm">可以使用右上角“PDF”按钮打开原文件核对。</p>
      </div>
    );
  }

  return (
    <figure className="relative min-h-[420px] bg-muted/40 p-3 sm:p-5">
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/80 text-sm text-muted-foreground backdrop-blur-sm">
          <Loader2 className="h-4 w-4 animate-spin" />正在还原第 {pageNumber} 页版面…
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="mx-auto h-auto max-w-full rounded-sm bg-white shadow-[0_14px_40px_rgba(15,23,42,0.12)]"
        aria-label={`PDF 第 ${pageNumber} 页原始版面，包含页面内图片、表格和公式`}
      />
      <figcaption className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5" />原始版面会完整保留页面内的图片、表格和公式
      </figcaption>
    </figure>
  );
}

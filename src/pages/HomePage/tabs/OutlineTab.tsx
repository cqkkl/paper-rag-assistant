import { AlertTriangle, BookOpen, FileSearch, ScanText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePaper } from "@/contexts/PaperContext";

export function OutlineTab() {
  const { activePaper, openPage } = usePaper();

  if (!activePaper) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <CardTitle>章节导读</CardTitle>
          <CardDescription>上传论文后自动识别章节和页码</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const outline = activePaper.outline ?? [];
  const pages = activePaper.pages ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">章节导读</h2>
          <p className="text-sm text-muted-foreground">点击章节或页码可直接打开 PDF 原文</p>
        </div>
        <Badge variant="outline">{activePaper.pageCount ?? 0} 页 · {outline.length} 个章节</Badge>
      </div>

      {activePaper.textQuality !== "good" && (
        <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">文本解析质量较低</p>
            <p className="mt-1 text-xs leading-relaxed">
              {activePaper.textQuality === "scanned"
                ? "这可能是扫描版 PDF。当前仍可预览原文，但摘要和问答前建议先用 OCR 工具转换为可搜索 PDF。"
                : "部分页面文本较少或排版复杂，AI 结果可能不完整，请结合原文核对。"}
            </p>
          </div>
        </div>
      )}

      {outline.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ScanText className="h-4 w-4" />论文目录</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {outline.map((item, index) => (
              <Button
                key={`${item.pageNumber}-${index}`}
                variant="ghost"
                className="h-auto w-full justify-between py-2 text-left"
                style={{ paddingLeft: `${Math.min(item.level, 4) * 12}px` }}
                onClick={() => openPage(item.pageNumber)}
              >
                <span className="min-w-0 truncate">{item.title}</span>
                <span className="ml-3 shrink-0 text-xs text-muted-foreground">第 {item.pageNumber} 页</span>
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">未识别到标准章节标题</CardTitle>
            <CardDescription>你仍可通过下面的页面摘要快速定位内容。</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {pages.map((page) => (
          <button
            type="button"
            key={page.pageNumber}
            className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/20"
            onClick={() => openPage(page.pageNumber)}
          >
            <span className="mb-2 flex items-center gap-2 text-sm font-medium"><FileSearch className="h-4 w-4 text-primary" />第 {page.pageNumber} 页</span>
            <span className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {page.text.trim() || "此页未提取到文本"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

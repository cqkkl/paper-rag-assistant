import { BookOpen, FileText } from "lucide-react";
import { usePaper } from "@/contexts/PaperContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PdfPreviewTab() {
  const { activePaper, previewPage } = usePaper();

  if (!activePaper) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>原文预览</CardTitle>
            <CardDescription>
              浏览器原生PDF渲染，完整保留论文格式、图表、排版
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              上传文献后即可预览
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activePaper.fileUrl) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md text-center">
          <CardContent className="py-12">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">PDF预览加载中...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-168px)] min-h-[420px] w-full md:h-[calc(100dvh-176px)]">
      <iframe
        key={`${activePaper.id}-${previewPage}`}
        src={`${activePaper.fileUrl}#page=${previewPage}&toolbar=1&navpanes=1&view=FitH`}
        className="w-full h-full border-0 rounded-lg shadow-sm"
        title={activePaper.name}
      />
    </div>
  );
}

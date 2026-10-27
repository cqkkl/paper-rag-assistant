import { useMemo, useState } from "react";
import { GitCompareArrows, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MarkdownContent } from "@/components/MarkdownContent";
import { usePaper } from "@/contexts/PaperContext";
import { callDeepSeek, buildComparisonPrompt } from "@/lib/deepseek";
import { hasApiKey } from "@/lib/apiKeyStore";
import { toast } from "sonner";

export function CompareTab() {
  const { papers } = usePaper();
  const readyPapers = useMemo(() => papers.filter((paper) => paper.status === "ready"), [papers]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = readyPapers.filter((paper) => selectedIds.includes(paper.id));

  const togglePaper = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (!checked) return current.filter((item) => item !== id);
      if (current.length >= 5) {
        toast.info("一次最多对比 5 篇文献");
        return current;
      }
      return [...current, id];
    });
  };

  const generateComparison = async () => {
    if (selected.length < 2) {
      toast.error("请至少选择两篇文献");
      return;
    }
    if (!hasApiKey()) {
      toast.error("请先配置 DeepSeek API Key");
      return;
    }
    setLoading(true);
    setResult("");
    try {
      const fullText = await callDeepSeek(buildComparisonPrompt(selected), (chunk) => {
        setResult((current) => current + chunk);
      });
      setResult(fullText);
      toast.success("文献对比完成");
    } catch (error) {
      console.error("文献对比失败:", error);
      toast.error("对比失败，请检查 API Key 和网络");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">多论文对比</h2>
        <p className="text-sm text-muted-foreground">选择 2–5 篇论文，比较研究问题、方法、实验结果和局限性。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><GitCompareArrows className="h-4 w-4" />选择文献</CardTitle>
          <CardDescription>已选择 {selected.length} 篇</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {readyPapers.length < 2 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">至少上传并解析两篇论文后才能对比。</p>
          ) : readyPapers.map((paper) => (
            <div key={paper.id} className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id={`compare-${paper.id}`}
                checked={selectedIds.includes(paper.id)}
                onCheckedChange={(checked) => togglePaper(paper.id, checked === true)}
              />
              <Label htmlFor={`compare-${paper.id}`} className="min-w-0 cursor-pointer font-normal">
                <span className="block truncate font-medium">{paper.name}</span>
                <span className="text-xs text-muted-foreground">{paper.pageCount ?? 0} 页</span>
              </Label>
            </div>
          ))}
          <Button onClick={generateComparison} disabled={loading || selected.length < 2} className="w-full sm:w-auto">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {loading ? "正在对比…" : "生成对比报告"}
          </Button>
        </CardContent>
      </Card>

      {result && <Card><CardContent className="pt-6"><MarkdownContent>{result}</MarkdownContent></CardContent></Card>}
    </div>
  );
}

import { useState } from "react";
import { FileText, Sparkles, RefreshCw, Loader2, FileSearch, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePaper } from "@/contexts/PaperContext";
import { callDeepSeek, buildSummaryPrompt } from "@/lib/deepseek";
import { hasApiKey } from "@/lib/apiKeyStore";
import { toast } from "sonner";

// 从论文文本中提取摘要
function extractAbstract(text: string): string {
  // 英文摘要匹配 - 更宽松的匹配
  const enPatterns = [
    // Abstract 开头，到 Keywords 或 1. Introduction 结束
    /Abstract[\s:]+([\s\S]+?)(?=\n\s*(?:Keywords|Index Terms|1\.?\s*Introduction|1\s+Introduction))/i,
    // Abstract 单独一行，后面跟着大段文本，到第一个数字编号章节结束
    /Abstract[\s:]*\n+([\s\S]+?)(?=\n\s*\d+\.\s+[A-Z])/,
    // 有的论文 ABSTRACT 是全大写
    /ABSTRACT[\s:]+([\s\S]+?)(?=\n\s*(?:Keywords|INDEX TERMS|1\.?\s*INTRODUCTION))/,
  ];

  for (const pattern of enPatterns) {
    const match = text.match(pattern);
    if (match && match[1].trim().length > 100) {
      return match[1].trim();
    }
  }

  // 中文摘要匹配
  const cnPatterns = [
    /摘要[:\s]+([\s\S]+?)(?=\n\n|关键词|引言)/,
  ];

  for (const pattern of cnPatterns) {
    const match = text.match(pattern);
    if (match && match[1].trim().length > 50) {
      return match[1].trim();
    }
  }

  return "";
}

export function SummaryTab() {
  const { activePaper } = usePaper();
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [activeSubTab, setActiveSubTab] = useState("original");
  const [extractingAbstract, setExtractingAbstract] = useState(false);
  const [aiExtractedAbstract, setAiExtractedAbstract] = useState("");

  if (!activePaper) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>智能摘要</CardTitle>
            <CardDescription>
              自动提取论文原文摘要，AI 深度解读研究价值
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              从左侧上传文献后开始
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const originalAbstract = activePaper.textContent ? extractAbstract(activePaper.textContent) : "";
  const displayAbstract = originalAbstract || aiExtractedAbstract;

  const handleExtractAbstractByAI = async () => {
    if (!activePaper?.textContent || !hasApiKey()) {
      toast.error("请先配置API Key");
      return;
    }
    setExtractingAbstract(true);
    setAiExtractedAbstract("");

    try {
      const messages = [
        {
          role: "system" as const,
          content: "你是论文摘要提取助手。请从用户提供的论文文本中，准确找到Abstract（摘要）部分，先完整提取原文，然后翻译成流畅的中文。输出格式：先写【中文摘要】，再写【英文原文】，两部分都要完整。",
        },
        {
          role: "user" as const,
          content: `论文开头部分内容：\n\n${activePaper.textContent.slice(0, 5000)}\n\n请提取其中的Abstract摘要部分，翻译成中文，按格式输出。`,
        },
      ];
      await callDeepSeek(messages, (chunk) => {
        setAiExtractedAbstract((prev) => prev + chunk);
      });
      toast.success("AI 提取摘要完成");
    } catch (error) {
      console.error("提取摘要失败:", error);
      toast.error("提取失败，请重试");
    } finally {
      setExtractingAbstract(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!activePaper?.textContent) {
      toast.error("请先上传并解析文献");
      return;
    }

    if (!hasApiKey()) {
      toast.error("请先在左侧设置中配置 DeepSeek API Key");
      return;
    }

    setIsGenerating(true);
    setAiSummary("");
    setActiveSubTab("ai");

    try {
      const messages = buildSummaryPrompt(activePaper.textContent);
      await callDeepSeek(messages, (chunk) => {
        setAiSummary((prev) => prev + chunk);
      });
      toast.success("AI 深度解读生成完成");
    } catch (error) {
      console.error("生成摘要失败:", error);
      toast.error("生成失败，请检查API Key和网络");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{activePaper.name}</h3>
          <p className="text-sm text-muted-foreground">
            {activePaper.pageCount ? `${activePaper.pageCount} 页` : ""}
          </p>
        </div>
        <Button 
          size="sm" 
          onClick={handleGenerateSummary}
          disabled={isGenerating || activePaper.status !== "ready"}
          className="gap-2"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {aiSummary ? "重新AI解读" : "AI 深度解读"}
        </Button>
      </div>

      {activePaper.status === "parsing" ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">正在解析文献内容...</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
          <TabsList>
            <TabsTrigger value="original" className="gap-2">
              <FileSearch className="h-4 w-4" />
              原文摘要
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Lightbulb className="h-4 w-4" />
              AI 深度解读
            </TabsTrigger>
          </TabsList>

          <TabsContent value="original" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-primary" />
                  论文原文摘要
                </CardTitle>
              </CardHeader>
              <CardContent>
                {displayAbstract ? (
                  <div className="space-y-3">
                    {!originalAbstract && aiExtractedAbstract && (
                      <p className="text-xs text-muted-foreground bg-accent/30 px-3 py-1.5 rounded">
                        此摘要由AI从论文中自动提取
                      </p>
                    )}
                    <p className="text-foreground/90 leading-relaxed whitespace-pre-line">
                      {displayAbstract}
                      {extractingAbstract && (
                        <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">
                      未能自动提取到原文摘要
                    </p>
                    <Button 
                      size="sm" 
                      onClick={handleExtractAbstractByAI}
                      disabled={extractingAbstract}
                      className="gap-2"
                    >
                      {extractingAbstract ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      AI 帮我提取摘要
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI 结构化解读
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isGenerating ? (
                  <div className="min-h-[200px]">
                    <div className="prose prose-sm max-w-none whitespace-pre-line text-foreground/90 leading-relaxed">
                      {aiSummary}
                      <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
                    </div>
                  </div>
                ) : aiSummary ? (
                  <div className="prose prose-sm max-w-none whitespace-pre-line text-foreground/90 leading-relaxed">
                    {aiSummary}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">点击右上角"AI 深度解读"按钮</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      AI 将从研究背景、方法、结果、结论四个维度结构化解读
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

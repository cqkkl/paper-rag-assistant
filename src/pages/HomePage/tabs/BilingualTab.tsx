import { useState } from "react";
import { Languages, Loader2, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { callDeepSeek } from "@/lib/deepseek";
import { hasApiKey } from "@/lib/apiKeyStore";
import { toast } from "sonner";

export function BilingualTab() {
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);

  const handleTranslate = async () => {
    if (!inputText.trim()) {
      toast.error("请先粘贴要翻译的英文内容");
      return;
    }
    if (!hasApiKey()) {
      toast.error("请先配置API Key");
      return;
    }

    setIsTranslating(true);
    setOutputText("");

    try {
      const messages = [
        {
          role: "system" as const,
          content: "你是专业的学术论文翻译。请把用户提供的英文翻译成流畅准确的中文，保留专业术语，只输出翻译结果，不要加任何解释。",
        },
        {
          role: "user" as const,
          content: inputText,
        },
      ];

      await callDeepSeek(messages, (chunk) => {
        setOutputText((prev) => prev + chunk);
      });

      toast.success("翻译完成");
    } catch (error) {
      console.error("翻译失败:", error);
      toast.error("翻译失败，请重试");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleClear = () => {
    setInputText("");
    setOutputText("");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(outputText);
      toast.success("已复制翻译结果");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="text-center py-4">
        <h2 className="text-xl font-bold mb-2">论文段落翻译助手</h2>
        <p className="text-sm text-muted-foreground">
          在「原文预览」里看到不懂的英文段落，复制粘贴到这里，AI马上翻译成中文
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 左边：输入 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">英文原文</label>
            <Button variant="ghost" size="sm" onClick={handleClear} className="h-7 text-xs gap-1">
              <Trash2 className="h-3 w-3" />
              清空
            </Button>
          </div>
          <Textarea
            placeholder="把PDF里看不懂的英文段落复制粘贴到这里..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="min-h-[400px] text-base leading-relaxed"
          />
        </div>

        {/* 右边：输出 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-accent-foreground">中文翻译</label>
            {outputText && (
              <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-xs gap-1">
                <Copy className="h-3 w-3" />
                复制
              </Button>
            )}
          </div>
          <div className="border rounded-lg p-4 min-h-[400px] bg-accent/5 text-base leading-relaxed whitespace-pre-wrap">
            {isTranslating && !outputText ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI 正在翻译...</span>
              </div>
            ) : outputText ? (
              outputText
            ) : (
              <span className="text-muted-foreground/50">
                翻译结果会显示在这里
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <Button
          onClick={handleTranslate}
          disabled={isTranslating || !inputText.trim()}
          size="lg"
          className="min-w-[200px]"
        >
          {isTranslating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              翻译中...
            </>
          ) : (
            <>
              <Languages className="h-4 w-4 mr-2" />
              开始翻译
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

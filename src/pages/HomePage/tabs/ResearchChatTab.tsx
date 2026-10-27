import { useEffect, useRef, useState } from "react";
import { Bot, MessageCircle, Send, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownContent } from "@/components/MarkdownContent";
import { usePaper } from "@/contexts/PaperContext";
import { callDeepSeek, buildChatPrompt } from "@/lib/deepseek";
import { hasApiKey } from "@/lib/apiKeyStore";
import { cn } from "@/lib/utils";
import type { IChatMessage } from "@/lib/types";
import { toast } from "sonner";

export function ResearchChatTab() {
  const { activePaper, updatePaper } = usePaper();
  const [messages, setMessages] = useState<IChatMessage[]>(activePaper?.chatMessages ?? []);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [messages]);

  if (!activePaper) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md text-center">
          <CardHeader>
            <MessageCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <CardTitle>文献问答</CardTitle>
            <CardDescription>检索论文相关页面，给出带出处的回答并支持多轮追问。</CardDescription>
          </CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">上传文献后即可开始提问</p></CardContent>
        </Card>
      </div>
    );
  }

  const handleSend = async () => {
    const question = inputValue.trim();
    if (!question || !activePaper.textContent || isLoading) return;
    if (!hasApiKey()) {
      toast.error("请先在文献库底部配置 DeepSeek API Key");
      return;
    }

    const history = messages;
    const userMessage: IChatMessage = {
      id: crypto.randomUUID(), role: "user", content: question, timestamp: Date.now(),
    };
    const assistantId = crypto.randomUUID();
    const pending: IChatMessage[] = [
      ...history,
      userMessage,
      { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
    ];
    setMessages(pending);
    setInputValue("");
    setIsLoading(true);

    try {
      const fullText = await callDeepSeek(buildChatPrompt(activePaper, question, history), (chunk) => {
        setMessages((current) => current.map((message) =>
          message.id === assistantId ? { ...message, content: message.content + chunk } : message,
        ));
      });
      const completed = pending.map((message) =>
        message.id === assistantId ? { ...message, content: fullText } : message,
      );
      setMessages(completed);
      updatePaper(activePaper.id, { chatMessages: completed });
    } catch (error) {
      console.error("问答失败:", error);
      const failed = pending.map((message) =>
        message.id === assistantId
          ? { ...message, content: "抱歉，回答失败。请检查 API Key 和网络后重试。" }
          : message,
      );
      setMessages(failed);
      updatePaper(activePaper.id, { chatMessages: failed });
      toast.error("回答失败，请检查 API Key 和网络");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">基于原文的检索问答</h2>
          <p className="text-xs text-muted-foreground">回答会检索相关页面，页码引用可点击跳转原文。</p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => {
            setMessages([]);
            updatePaper(activePaper.id, { chatMessages: [] });
          }}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />清空
          </Button>
        )}
      </div>

      <div className="min-h-[300px] space-y-4 rounded-lg border bg-card p-3 sm:p-4">
        {messages.length === 0 ? (
          <div className="py-10 text-center">
            <MessageCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="mb-3 text-sm text-muted-foreground">可以从这些问题开始</p>
            <div className="mx-auto flex max-w-xl flex-wrap justify-center gap-2">
              {["这篇论文的核心创新是什么？", "实验结果支持哪些结论？", "作者提到了哪些局限性？"].map((question) => (
                <Button key={question} variant="outline" size="sm" onClick={() => setInputValue(question)}>{question}</Button>
              ))}
            </div>
          </div>
        ) : messages.map((message) => (
          <div key={message.id} className={cn("flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}>
            {message.role === "assistant" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20"><Bot className="h-4 w-4" /></div>
            )}
            <div className={cn("max-w-[85%] rounded-lg px-4 py-2.5 sm:max-w-[75%]", message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {message.role === "assistant"
                ? <MarkdownContent className="text-sm leading-relaxed">{message.content}</MarkdownContent>
                : <p className="whitespace-pre-line text-sm leading-relaxed">{message.content}</p>}
              {message.role === "assistant" && isLoading && message.id === messages.at(-1)?.id && (
                <span className="inline-block h-4 w-2 animate-pulse bg-foreground/60" />
              )}
            </div>
            {message.role === "user" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10"><User className="h-4 w-4 text-primary" /></div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t bg-background py-3">
        <Input
          placeholder="针对这篇论文提问，支持继续追问…"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) void handleSend();
          }}
          disabled={activePaper.status !== "ready" || isLoading}
        />
        <Button size="icon" onClick={() => void handleSend()} disabled={!inputValue.trim() || isLoading} aria-label="发送问题">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

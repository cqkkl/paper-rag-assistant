import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePaper } from "@/contexts/PaperContext";
import { cn } from "@/lib/utils";
import { callDeepSeek, buildChatPrompt } from "@/lib/deepseek";
import { hasApiKey } from "@/lib/apiKeyStore";
import { toast } from "sonner";
import type { IChatMessage } from "@/lib/types";

export function ChatTab() {
  const { activePaper } = usePaper();
  const [messages, setMessages] = useState<IChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 自动滚动到底部
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || !activePaper?.textContent) return;

    if (!hasApiKey()) {
      toast.error("请先在左侧设置中配置 DeepSeek API Key");
      return;
    }

    const userMessage: IChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      role: "user",
      content: inputValue.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // 添加一个空的assistant消息，用于流式更新
    const assistantMessageId = Math.random().toString(36).substring(2, 9);
    setMessages((prev) => [...prev, {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    }]);

    try {
      const prompt = buildChatPrompt(activePaper, userMessage.content, messages);
      await callDeepSeek(prompt, (chunk) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId ? { ...m, content: m.content + chunk } : m
          )
        );
      });
    } catch (error) {
      console.error("问答失败:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: "抱歉，回答出错了，请稍后重试。" }
            : m
        )
      );
      toast.error("回答失败，请检查API Key和网络");
    } finally {
      setIsLoading(false);
    }
  };

  if (!activePaper) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
              <MessageCircle className="h-8 w-8 text-accent-foreground" />
            </div>
            <CardTitle>文献问答</CardTitle>
            <CardDescription>
              针对论文内容提问，AI 基于原文内容给出精准回答，支持多轮对话
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              上传文献后即可开始提问
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full space-y-4">
      {/* 聊天消息区域 */}
      <div className="space-y-4 py-4">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground mb-2">开始与这篇论文对话</p>
            <p className="text-sm text-muted-foreground/70">
              试试问："这篇论文的核心方法是什么？"
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20">
                  <Bot className="h-4 w-4 text-accent-foreground" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[70%] rounded-lg px-4 py-2.5",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <p className="text-sm whitespace-pre-line leading-relaxed">
                  {message.content}
                  {message.role === "assistant" && isLoading && message.content === messages[messages.length-1]?.content && (
                    <span className="inline-block w-2 h-4 bg-accent-foreground animate-pulse ml-1" />
                  )}
                </p>
              </div>
              {message.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 输入框 */}
      <div className="border-t border-border pt-4 sticky bottom-0 bg-background pb-4">
        <div className="flex gap-2">
          <Input
            placeholder="针对这篇论文提问..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={activePaper.status !== "ready" || isLoading}
          />
          <Button 
            size="icon" 
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronRight, FileSearch, MessageCircle, Send, ShieldCheck, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownContent } from "@/components/MarkdownContent";
import { usePaper } from "@/contexts/PaperContext";
import { callDeepSeek, prepareChatRequest } from "@/lib/deepseek";
import { validatePageCitations } from "@/lib/rag";
import { hasApiKey } from "@/lib/apiKeyStore";
import { cn } from "@/lib/utils";
import type { IChatCitation, IChatMessage } from "@/lib/types";
import { toast } from "sonner";

export function ResearchChatTab() {
  const { activePaper, updatePaper, openPage } = usePaper();
  const [messages, setMessages] = useState<IChatMessage[]>(activePaper?.chatMessages ?? []);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

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
      const prepared = await prepareChatRequest(activePaper, question, history);
      const seenEvidence = new Set<string>();
      const citations: IChatCitation[] = prepared.chunks.flatMap((chunk) => {
        const excerpt = chunk.text.replace(/\s+/g, " ").trim().slice(0, 230);
        const key = `${chunk.pageNumber}:${excerpt}`;
        if (!excerpt || seenEvidence.has(key)) return [];
        seenEvidence.add(key);
        return [{ pageNumber: chunk.pageNumber, section: chunk.section, excerpt, score: chunk.score }];
      }).slice(0, 4);
      const pendingWithEvidence = pending.map((message) =>
        message.id === assistantId ? { ...message, citations } : message,
      );
      setMessages(pendingWithEvidence);

      const fullText = await callDeepSeek(prepared.messages, (chunk) => {
        setMessages((current) => current.map((message) =>
          message.id === assistantId ? { ...message, content: message.content + chunk } : message,
        ));
      });
      const validated = validatePageCitations(fullText, prepared.chunks.map((chunk) => chunk.pageNumber));
      const completed = pendingWithEvidence.map((message) =>
        message.id === assistantId ? {
          ...message,
          content: validated.content,
          citationWarning: validated.rejectedPages.length
            ? `已拦截 ${validated.rejectedPages.length} 个不在本轮证据范围内的页码引用。`
            : undefined,
        } : message,
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

      {activePaper.demo && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          当前为离线评审样例，已有回答和证据无需 API Key。配置 Key 后可继续提出新问题。
        </div>
      )}

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
              {message.role === "assistant" ? (
                <>
                  <MarkdownContent className="text-sm leading-relaxed">{message.content}</MarkdownContent>
                  {message.citationWarning && (
                    <p className="mt-3 rounded-md border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                      {message.citationWarning}
                    </p>
                  )}
                  {message.citations && message.citations.length > 0 && (
                    <details className="mt-3 border-t border-border/70 pt-3" open={message.demo || undefined}>
                      <summary className="cursor-pointer select-none text-xs font-medium text-foreground/80">
                        检索证据 · {message.citations.length} 条
                      </summary>
                      <div className="mt-2 space-y-2">
                        {message.citations.map((citation, index) => (
                          <button
                            type="button"
                            key={`${citation.pageNumber}-${index}`}
                            className="group flex w-full gap-2 rounded-md border bg-background/70 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                            onClick={() => openPage(citation.pageNumber)}
                          >
                            <FileSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold text-foreground">
                                第 {citation.pageNumber} 页{citation.section ? ` · ${citation.section}` : ""}
                              </span>
                              <span className="mt-1 line-clamp-3 block text-[11px] leading-5 text-muted-foreground">{citation.excerpt}</span>
                            </span>
                            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              ) : <p className="whitespace-pre-line text-sm leading-relaxed">{message.content}</p>}
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

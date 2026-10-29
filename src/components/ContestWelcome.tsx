import { ArrowRight, BookOpenCheck, Database, FileSearch, GitCompareArrows, LockKeyhole, MessageSquareQuote, PlayCircle, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ContestWelcomeProps {
  onUpload: () => void;
  onTryDemo?: () => void;
}

const highlights = [
  {
    icon: FileSearch,
    title: "可追溯 RAG",
    description: "中英文查询自动扩展，回答只允许引用本轮召回页，并展示可点击的原文证据卡。",
  },
  {
    icon: Database,
    title: "本地文献库",
    description: "PDF、解析文本、对话和笔记保存在浏览器中，刷新后仍可继续阅读。",
  },
  {
    icon: GitCompareArrows,
    title: "跨论文研究",
    description: "分页双语精读、生成结构化笔记，并对 2–5 篇论文进行横向比较。",
  },
];

const steps = [
  { icon: Upload, title: "上传论文", description: "解析分页原文并建立双语精读空间" },
  { icon: MessageSquareQuote, title: "提出问题", description: "检索与问题最相关的原文片段" },
  { icon: BookOpenCheck, title: "核对证据", description: "点击引用跳到对应双语原文页" },
];

export function ContestWelcome({ onUpload, onTryDemo }: ContestWelcomeProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-8 py-4 sm:py-8">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-accent/20 px-5 py-8 text-center sm:px-10 sm:py-12">
        <Badge variant="outline" className="mb-4 bg-background/70">传智杯 · Vibe Coding 挑战赛作品</Badge>
        <h2 className="mx-auto max-w-3xl text-2xl font-bold tracking-tight sm:text-4xl">
          让每个 AI 结论，都能回到论文原文
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          文献研读助手将分页双语精读、划词高亮、检索增强问答、页码引用和研究笔记整合为一条可信的阅读流程。
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {onTryDemo && (
            <Button size="lg" onClick={onTryDemo}>
              <PlayCircle className="mr-2 h-4 w-4" />一键体验评审样例<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" size="lg" onClick={onUpload}>
            <Upload className="mr-2 h-4 w-4" />上传自己的论文
          </Button>
        </div>
        {onTryDemo && <p className="mt-3 text-xs font-medium text-primary">无需 API Key · 预置双语内容与证据问答 · 约 30 秒看懂核心价值</p>}
        <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" />PDF 默认仅保存在当前浏览器
        </p>
      </section>

      <section>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">核心创新</h3>
          <p className="text-sm text-muted-foreground">重点解决普通 AI 阅读工具“答案无法核验”和“刷新即丢失”的问题。</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {highlights.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="bg-card/70">
              <CardContent className="pt-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div>
                <h4 className="font-semibold">{title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <h3 className="text-lg font-semibold">三步完成一次可信研读</h3>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, description }, index) => (
            <div key={title} className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{index + 1}</div>
              <div>
                <p className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4 text-primary" />{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

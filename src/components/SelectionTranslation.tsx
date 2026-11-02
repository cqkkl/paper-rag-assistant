import { useEffect, useRef, useState } from "react";
import { Languages, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { translateText, type TranslationTarget } from "@/lib/translation";

interface Props {
  text: string;
  context: string;
  glossary: string;
  configured: boolean;
  onHighlight: () => void;
  onSave: (translation: string, target: TranslationTarget) => void;
  onClose: () => void;
}

export function SelectionTranslation({ text, context, glossary, configured, onHighlight, onSave, onClose }: Props) {
  const [target, setTarget] = useState<TranslationTarget>("zh");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const translate = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(""); setSaved(false);
    try {
      const translated = await translateText(text, { target, glossary, context, selection: true, signal: controller.signal });
      if (!controller.signal.aborted) setResult(translated);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "翻译失败，请重试");
    } finally {
      if (request.current === controller) setBusy(false);
    }
  };
  return (
    <section aria-label="选区翻译" className="rounded-xl border border-primary/25 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold"><Languages className="h-4 w-4 text-primary" />选区翻译 · {text.length} 字符</span>
        <Button size="icon" variant="ghost" aria-label="关闭选区翻译" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <p className="my-2 max-h-24 overflow-y-auto rounded-md bg-muted/40 p-3 text-sm leading-relaxed">{text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="选区翻译目标语言" value={target} disabled={busy} onChange={(e) => { setTarget(e.target.value as TranslationTarget); setResult(""); setSaved(false); }} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="zh">译为中文</option><option value="en">译为英文</option>
        </select>
        <Button size="sm" disabled={busy || !configured} onClick={() => void translate()}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{result ? "重译选区" : "翻译选区"}</Button>
        {busy && <Button size="sm" variant="outline" onClick={() => request.current?.abort()}>取消</Button>}
        <Button size="sm" variant="outline" onClick={onHighlight}>高亮原文</Button>
        {!configured && <span className="text-xs text-muted-foreground">在 API 设置中配置 Key 后可翻译</span>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      {result && <>
        <Textarea aria-label="选区译文，可编辑" className="mt-3 min-h-28 leading-relaxed" spellCheck={false} value={result} disabled={busy} onChange={(e) => { setResult(e.target.value); setSaved(false); }} />
        <div className="mt-2 flex items-center gap-3"><Button size="sm" variant="secondary" disabled={busy || saved || !result.trim()} onClick={() => { onSave(result, target); setSaved(true); }}>{saved ? "已存入研读笔记" : "原文与译文存入笔记"}</Button><span className="text-xs text-muted-foreground">保留来源页码，可先修改再保存</span></div>
      </>}
    </section>
  );
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { usePaper } from "@/contexts/PaperContext";

interface MarkdownContentProps {
  children: string;
  className?: string;
}

export function MarkdownContent({ children, className }: MarkdownContentProps) {
  const { openPage } = usePaper();

  return (
    <div className={cn("prose prose-sm max-w-none text-foreground/90", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren, ...props }) => {
            const pageMatch = href?.match(/^#page=(\d+)$/);
            if (pageMatch) {
              return (
                <button
                  type="button"
                  className="font-medium text-primary underline underline-offset-2"
                  onClick={() => openPage(Number(pageMatch[1]))}
                >
                  {linkChildren}
                </button>
              );
            }
            return <a href={href} target="_blank" rel="noreferrer" {...props}>{linkChildren}</a>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

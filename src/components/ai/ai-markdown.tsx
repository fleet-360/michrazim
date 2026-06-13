"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function AiMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="font-display text-lg font-bold">{children}</h3>,
          h2: ({ children }) => (
            <h4 className="mt-4 flex items-center gap-2 font-display text-base font-semibold text-foreground">
              {children}
            </h4>
          ),
          h3: ({ children }) => <h5 className="mt-3 font-semibold">{children}</h5>,
          p: ({ children }) => <p className="text-foreground/90">{children}</p>,
          ul: ({ children }) => <ul className="space-y-1.5 pr-4">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1.5 pr-5">{children}</ol>,
          li: ({ children }) => (
            <li className="relative pr-4 text-foreground/90 before:absolute before:right-0 before:top-2 before:size-1.5 before:rounded-full before:bg-primary/60">
              {children}
            </li>
          ),
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border bg-muted/50 px-2 py-1.5 text-right font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border-b border-border/50 px-2 py-1.5">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

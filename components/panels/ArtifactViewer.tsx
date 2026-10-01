"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { renderMdLite } from "@/lib/md-lite";
import { FileText, Copy, Check, Download } from "lucide-react";

type Mode = "rendered" | "markdown" | "code";

function extOf(file: string): string {
  const i = file.lastIndexOf(".");
  return i >= 0 ? file.slice(i + 1).toLowerCase() : "";
}

/** G4 artifact viewer modal: sandboxed HTML, Markdown, and code/text modes. */
export default function ArtifactViewer({
  projectId,
  file,
  taskTitle,
  onClose,
}: {
  projectId: string;
  file: string;
  taskTitle?: string | null;
  onClose: () => void;
}) {
  const ext = extOf(file);
  const canRender = ext === "html" || ext === "htm";
  const canMarkdown = ext === "md" || ext === "markdown" || ext === "txt";
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(canRender ? "rendered" : canMarkdown ? "markdown" : "code");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setContent(null);
    setError(null);
    setCopied(false);
    setMode(canRender ? "rendered" : canMarkdown ? "markdown" : "code");
    let live = true;
    fetch(`/api/artifacts?projectId=${encodeURIComponent(projectId)}&file=${encodeURIComponent(file)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!live) return;
        if (r.ok) setContent(d.content ?? "");
        else setError(d.error ?? `load failed (${r.status})`);
      })
      .catch(() => {
        if (live) setError("could not load artifact");
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, file]);

  const mdHtml = useMemo(() => (content != null ? renderMdLite(content) : ""), [content]);

  const copy = async () => {
    if (content == null) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = () => {
    if (content == null) return;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const modes: { id: Mode; label: string; show: boolean }[] = [
    { id: "rendered", label: "Rendered", show: canRender },
    { id: "markdown", label: "Markdown", show: canMarkdown },
    { id: "code", label: "Code", show: true },
  ];

  return (
    <Dialog open onClose={onClose} className="max-w-2xl">
      <div className="mb-1 flex items-start justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-stone-100">
          <FileText size={14} className="shrink-0" />
          <span className="truncate">{file}</span>
        </h2>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={copy} disabled={content == null} title="Copy content">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </Button>
          <Button size="sm" variant="ghost" onClick={download} disabled={content == null} title="Download file">
            <Download size={14} />
          </Button>
        </div>
      </div>
      {taskTitle && <div className="mb-2 truncate text-[11px] text-stone-500">from task: {taskTitle}</div>}
      <div className="mb-2 flex gap-1">
        {modes
          .filter((m) => m.show)
          .map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                mode === m.id ? "bg-stone-800 font-medium text-stone-100" : "text-stone-500 hover:text-stone-300"
              }`}
            >
              {m.label}
            </button>
          ))}
      </div>
      {content === null && error === null && (
        <div className="space-y-1.5 rounded-md bg-stone-950/70 p-3" aria-label="Loading artifact">
          <div className="ao-skeleton h-4 w-11/12" />
          <div className="ao-skeleton h-4 w-3/4" />
          <div className="ao-skeleton h-4 w-5/6" />
        </div>
      )}
      {error !== null && <div className="rounded-md bg-stone-950/70 p-3 text-xs text-red-400">{error}</div>}
      {content !== null && mode === "rendered" && canRender && (
        <iframe
          title={file}
          sandbox="allow-same-origin"
          srcDoc={content}
          className="h-[55vh] w-full rounded-md border border-stone-800 bg-white"
        />
      )}
      {content !== null && mode === "markdown" && canMarkdown && (
        <div
          className="ao-md max-h-[55vh] overflow-y-auto rounded-md bg-stone-950/70 p-3 text-[13px] leading-relaxed text-stone-200"
          dangerouslySetInnerHTML={{ __html: mdHtml }}
        />
      )}
      {content !== null && (mode === "code" || ((mode === "rendered" || mode === "markdown") && !canRender && !canMarkdown)) && (
        <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-md bg-stone-950 p-3 font-mono text-xs leading-relaxed text-stone-200">
          {content}
        </pre>
      )}
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}

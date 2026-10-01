// Minimal Markdown-lite renderer (no dependencies).
// Supports: headings (#-######), fenced code blocks, inline code,
// unordered + ordered lists, bold (**x**), links [t](http...).
// Everything else is HTML-escaped plain text. Output is safe to inject.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline formatting: code spans first, then bold + links on escaped text. */
export function renderInline(src: string): string {
  const parts = (src ?? "").split(/(`[^`]*`)/g);
  return parts
    .map((p) => {
      if (p.length >= 2 && p.startsWith("`") && p.endsWith("`")) {
        return `<code>${escapeHtml(p.slice(1, -1))}</code>`;
      }
      let e = escapeHtml(p);
      e = e.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
      e = e.replace(
        /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      );
      // Strip non-http(s) link targets entirely (e.g. javascript:) — keep the label.
      e = e.replace(/\[([^\]\n]+)\]\([^)\s]*\)/g, "$1");
      return e;
    })
    .join("");
}

export function renderMdLite(md: string): string {
  const lines = (md ?? "").split(/\r?\n/);
  const out: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length > 0) {
      out.push(`<p>${para.map(renderInline).join("<br>")}</p>`);
      para = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block.
    if (/^```/.test(trimmed)) {
      flushPara();
      const buf: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "```") {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence (or EOF)
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // Heading.
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushPara();
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list run.
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*[-*+]\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(`<li>${renderInline(m[1].trim())}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list run.
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*\d+\.\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(`<li>${renderInline(m[1].trim())}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (trimmed === "") {
      flushPara();
      i++;
      continue;
    }

    para.push(trimmed);
    i++;
  }
  flushPara();
  return out.join("\n");
}

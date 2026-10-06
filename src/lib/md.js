// A small Markdown renderer for the audit texts the drawing sessions write: headings,
// paragraphs, bullet lists, pipe tables, bold, code. Enough to read them in place.
function escape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(\d{1,2}:\d{2}(?::\d{2})?)/g, '<span class="t">$1</span>');
}

export function renderMarkdown(source) {
  const lines = (source ?? '').split('\n');
  const out = [];
  let list = null, table = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; } };
  const flushTable = () => {
    if (table) {
      const [head, ...rows] = table;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      table = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*\|/.test(line)) {
      flushPara(); flushList();
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      (table ??= []).push(cells);
      continue;
    }
    flushTable();
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { flushPara(); flushList(); out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`); continue; }
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) { flushPara(); (list ??= []).push(`<li>${inline(li[1])}</li>`); continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList(); flushTable();
  return out.join('\n');
}

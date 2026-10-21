import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = new URL("./match-chat-xmpp.md", import.meta.url);
const target = new URL("./index.html", import.meta.url);
const markdown = readFileSync(source, "utf8");
const metadata = Object.fromEntries(
  markdown.match(/^---\n([\s\S]*?)\n---\n/)?.[1]
    .split("\n")
    .map((line) => {
      const separator = line.indexOf(":");
      return [line.slice(0, separator), line.slice(separator + 1).trim()];
    }) ?? [],
);
const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
const lines = body.split("\n");
const heading = lines.find((line) => line.startsWith("# "))?.slice(2) ?? metadata.title;
const intro = lines.find((line) => line.startsWith("> "))?.slice(2) ?? "";

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function inline(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${href}"${href.startsWith("http") ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

const sections = [];
const rendered = [];
let paragraph = [];
let code = null;
let codeLanguage = "";

function flushParagraph() {
  if (paragraph.length) {
    rendered.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  }
}

function flushCode() {
  if (code === null) return;
  const codeLines = code.map((line, index) => `<span class="code-line" data-line="${index + 1}">${escapeHtml(line) || " "}</span>`).join("\n");
  rendered.push(`<div class="code-card"><div class="code-card-head"><span>CODE PREVIEW <b>${escapeHtml(codeLanguage.toUpperCase() || "TEXT")}</b></span><button type="button" class="copy-code" aria-label="复制代码">复制代码</button></div><pre><code>${codeLines}</code></pre></div>`);
  code = null;
  codeLanguage = "";
}

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (line.startsWith("```")) {
    flushParagraph();
    if (code === null) {
      code = [];
      codeLanguage = line.slice(3).trim();
    } else {
      flushCode();
    }
    continue;
  }
  if (code !== null) {
    code.push(line);
    continue;
  }
  if (!line.trim()) {
    flushParagraph();
    continue;
  }
  if (line.startsWith("# ") || line.startsWith("> ")) continue;
  if (line.startsWith("## ")) {
    flushParagraph();
    const label = line.slice(3);
    const id = `section-${sections.length + 1}`;
    sections.push({ id, label });
    rendered.push(`<h2 id="${id}"><span class="section-index">${String(sections.length).padStart(2, "0")}</span>${escapeHtml(label)}</h2>`);
    continue;
  }
  const image = line.match(/^!\[([^\]]+)\]\(([^)]+)\)$/);
  if (image) {
    flushParagraph();
    const next = lines[index + 1] || "";
    const caption = /^\*([^*]+)\*$/.exec(next);
    rendered.push(`<figure><img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1])}">${caption ? `<figcaption>${inline(caption[1])}</figcaption>` : ""}</figure>`);
    if (caption) index += 1;
    continue;
  }
  paragraph.push(line);
}
flushParagraph();
flushCode();

const toc = sections.map(({ id, label }, index) => `<a href="#${id}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(label)}</a>`).join("\n");
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(metadata.description || "")}">
  <title>${escapeHtml(heading)}</title>
  <style>
    :root { color-scheme: light; --ink: #17293b; --muted: #607083; --paper: #f3f6f7; --line: #dce5e8; --teal: #087f85; --coral: #eb806b; --navy: #10253b; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; background: var(--paper); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: var(--teal); text-decoration-thickness: .075em; text-underline-offset: .16em; }
    a:hover { color: #075e67; }
    a:focus-visible, button:focus-visible { outline: 3px solid var(--coral); outline-offset: 4px; }
    .site-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; height: 64px; padding: 0 max(24px, calc((100vw - 1260px) / 2)); background: #fff; border-bottom: 1px solid var(--line); }
    .brand { color: var(--navy); font: 700 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; text-decoration: none; }
    .brand strong { color: var(--teal); }
    .site-header .source-link { font-size: 12px; font-weight: 700; text-decoration: none; }
    .hero { position: relative; overflow: hidden; background: var(--navy); color: #f6fbff; }
    .hero::before { content: ""; position: absolute; inset: 0; opacity: .24; background-image: linear-gradient(to right, transparent 0, transparent calc(100% - 1px), #7ca6b0 calc(100% - 1px)), linear-gradient(to bottom, transparent 0, transparent calc(100% - 1px), #7ca6b0 calc(100% - 1px)); background-size: 42px 42px; mask-image: linear-gradient(to right, transparent 10%, #000 100%); }
    .hero-inner { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 56px; max-width: 1200px; margin: auto; padding: 76px 24px 82px; }
    .eyebrow { margin: 0 0 23px; color: #8ce0dc; font: 700 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .16em; }
    h1 { max-width: 800px; margin: 0; font: 700 clamp(39px, 5.2vw, 70px)/1.18 "Songti SC", "Noto Serif CJK SC", "STSong", serif; letter-spacing: -.045em; }
    .standfirst { max-width: 720px; margin: 24px 0 0; color: #d3e3e8; font-size: clamp(16px, 1.8vw, 19px); line-height: 1.85; }
    .hero-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; color: #adc8d1; font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .hero-meta span { border: 1px solid #4d7182; padding: 7px 10px; border-radius: 4px; }
    .stanza-rail { align-self: center; display: grid; gap: 14px; border-left: 1px solid #4c697a; padding-left: 24px; transform: rotate(-3deg); }
    .stanza-rail span { display: block; width: fit-content; padding: 9px 12px; border: 1px solid #58798a; border-radius: 4px; color: #9dc6d0; background: #183249; font: 600 13px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .stanza-rail span:nth-child(3) { color: #ffb29f; border-color: #bf776a; }
    .stanza-rail span:last-child { color: #adede4; border-color: #5baba9; }
    .page-grid { display: grid; grid-template-columns: 220px minmax(0, 760px); gap: 64px; max-width: 1200px; margin: auto; padding: 64px 24px 120px; align-items: start; }
    .toc { position: sticky; top: 28px; border-top: 2px solid var(--navy); padding-top: 18px; }
    .toc-label { margin: 0 0 20px; color: var(--muted); font: 700 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; }
    .toc a { display: grid; grid-template-columns: 26px 1fr; gap: 7px; padding: 9px 0; color: #43596e; font-size: 13px; line-height: 1.4; text-decoration: none; }
    .toc a:hover { color: var(--teal); }
    .toc a span { color: #8396a4; font: 600 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
    article { min-width: 0; font-size: 16px; line-height: 1.95; }
    article > p { margin: 0 0 24px; }
    article > p:first-child { font-size: 18px; font-weight: 500; line-height: 1.9; }
    article strong { color: #0d4758; }
    article h2 { display: flex; align-items: baseline; gap: 16px; scroll-margin-top: 32px; margin: 74px 0 24px; padding-top: 22px; border-top: 1px solid #cbd8de; color: #122b40; font: 700 clamp(26px, 3vw, 34px)/1.4 "Songti SC", "Noto Serif CJK SC", "STSong", serif; letter-spacing: -.025em; }
    .section-index { color: var(--coral); font: 700 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    article p code { padding: 2px 5px; border-radius: 4px; color: #a33837; background: #e8eef0; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    figure { margin: 32px 0 36px; }
    figure img { display: block; width: 100%; height: auto; border: 1px solid #d1dce0; border-radius: 10px; background: #e6ecf0; box-shadow: 0 18px 42px rgba(14, 41, 63, .09); }
    figcaption { margin-top: 11px; color: #637689; font-size: 12px; line-height: 1.6; }
    .code-card { overflow: hidden; margin: 30px 0 34px; border: 1px solid #314b5d; border-radius: 9px; background: #10263a; box-shadow: 0 14px 28px rgba(20, 41, 56, .1); }
    .code-card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 11px 17px; border-bottom: 1px solid #314b5d; color: #92adba; font: 600 10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .09em; }
    .code-card-head b { color: #81d9cf; }
    .copy-code { padding: 5px 8px; border: 1px solid #527181; border-radius: 4px; background: transparent; color: #c8e0e6; cursor: pointer; font: inherit; letter-spacing: 0; }
    .copy-code:hover { border-color: #9be4dd; color: #fff; }
    pre { overflow-x: auto; margin: 0; padding: 17px 20px 19px 0; color: #e7f2f2; font: 12.5px/1.75 ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; tab-size: 2; }
    pre code { display: block; min-width: max-content; counter-reset: code-line; }
    .code-line { display: block; padding-right: 20px; }
    .code-line::before { content: attr(data-line); display: inline-block; width: 34px; margin-right: 18px; color: #638397; text-align: right; user-select: none; }
    .site-footer { border-top: 1px solid var(--line); padding: 27px 24px 32px; color: #697d8d; background: #fff; text-align: center; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
    @media (max-width: 920px) { .hero-inner { grid-template-columns: 1fr; padding-top: 64px; } .stanza-rail { display: none; } .page-grid { display: block; max-width: 780px; padding-top: 42px; } .toc { display: none; } }
    @media (max-width: 560px) { .site-header { height: 58px; gap: 8px; } .brand { font-size: 10px; letter-spacing: .03em; white-space: nowrap; } .site-header .source-link { font-size: 11px; white-space: nowrap; } .hero-inner { padding: 51px 20px 59px; } .page-grid { padding: 32px 20px 85px; } article { font-size: 15px; } article h2 { margin-top: 54px; } pre { font-size: 11.5px; } }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  </style>
</head>
<body>
  <header class="site-header"><a class="brand" href="../../README.md">MATCH<strong>/</strong>CHAT &nbsp; FIELD NOTES</a><a class="source-link" href="match-chat-xmpp.md">查看 Markdown 原文 ↗</a></header>
  <section class="hero"><div class="hero-inner"><div><p class="eyebrow">PROTOCOL NOTES / ${escapeHtml(metadata.date || "")}</p><h1>${escapeHtml(heading)}</h1><p class="standfirst">${inline(intro)}</p><div class="hero-meta"><span>XMPP over WebSocket</span><span>Vue + Node</span><span>源码实录</span></div></div><div class="stanza-rail" aria-hidden="true"><span>&lt;open/&gt;</span><span>&lt;auth/&gt;</span><span>&lt;presence/&gt;</span><span>&lt;message/&gt;</span></div></div></section>
  <div class="page-grid"><nav class="toc" aria-label="文章目录"><p class="toc-label">ON THIS PAGE</p>${toc}</nav><article>${rendered.join("\n")}</article></div>
  <footer class="site-footer">MATCH CHAT / ARTICLE PREVIEW · 根据仓库源码生成</footer>
  <script>
    for (const button of document.querySelectorAll('.copy-code')) {
      button.addEventListener('click', async () => {
        const code = button.closest('.code-card').querySelector('code');
        const value = [...code.querySelectorAll('.code-line')].map((line) => line.textContent).join('\\n');
        let copied = false;
        try { await navigator.clipboard.writeText(value); copied = true; }
        catch { /* Browsers may deny the async clipboard API for local previews. */ }
        if (!copied) {
          const input = document.createElement('textarea');
          input.value = value;
          input.style.position = 'fixed';
          input.style.opacity = '0';
          document.body.appendChild(input);
          input.select();
          copied = document.execCommand('copy');
          input.remove();
        }
        button.textContent = copied ? '已复制' : '复制失败';
        setTimeout(() => { button.textContent = '复制代码'; }, 1800);
      });
    }
  </script>
</body>
</html>`;

writeFileSync(target, html);
console.log(`Wrote ${fileURLToPath(target)}`);

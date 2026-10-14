import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = process.env.GITHUB_REPOSITORY || "wkylin/chat-platform";
const project = repository.split("/").at(-1);
const basePath = `/${project}/`;
const apiBaseUrl = process.env.VITE_API_BASE_URL || "https://match-chat-server-seven.vercel.app/api";
const output = new URL("../dist-pages/", import.meta.url);

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
writeFileSync(new URL("index.html", output), `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#101219" />
    <title>Match Chat Platform</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101219; color: #f0f2f6; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; background: radial-gradient(ellipse at 12% 4%, rgba(183,243,109,.12), transparent 34rem), #101219; }
      main { width: min(980px, calc(100% - 40px)); margin: 0 auto; padding: 11vh 0 64px; }
      .eyebrow { color: #b7f36d; font: 700 11px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .16em; }
      h1 { max-width: 690px; margin: 18px 0 14px; font: 600 clamp(44px, 8vw, 86px)/.98 Georgia, serif; letter-spacing: -.065em; }
      .lede { max-width: 620px; color: #a0a8b4; font-size: 16px; line-height: 1.7; }
      .systems { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 52px; }
      article { min-height: 230px; padding: 25px; background: rgba(25,30,39,.82); border: 1px solid rgba(230,239,249,.13); border-radius: 16px; }
      .index { color: #b7f36d; font: 11px ui-monospace, monospace; }
      h2 { margin: 24px 0 8px; font-size: 22px; letter-spacing: -.04em; }
      article p { min-height: 42px; margin: 0; color: #98a1af; font-size: 13px; line-height: 1.6; }
      a { display: inline-flex; align-items: center; gap: 9px; margin-top: 18px; color: #101219; background: #b7f36d; border-radius: 8px; padding: 10px 13px; font-size: 12px; font-weight: 800; text-decoration: none; }
      .credentials { margin-top: 16px; padding: 19px 21px; color: #c7ced8; background: rgba(183,243,109,.055); border: 1px solid rgba(183,243,109,.14); border-radius: 12px; font-size: 13px; line-height: 1.8; }
      .credentials strong { color: #f0f2f6; }
      code { color: #d3ef66; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
      .server-link { display: inline; margin: 0; padding: 0; color: #b7f36d; background: none; border-radius: 0; font: inherit; font-weight: 700; text-decoration: underline; }
      footer { margin-top: 30px; color: #7e8795; font-size: 12px; line-height: 1.7; }
      @media (max-width: 650px) { main { padding-top: 64px; } .systems { grid-template-columns: 1fr; margin-top: 35px; } article { min-height: auto; } }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">MATCH CHAT / PRIVATE NETWORK</p>
      <h1>Make room for a better conversation.</h1>
      <p class="lede">The member workspace and control room connect to the Match Chat server for accounts, room data, moderation, and live messaging.</p>
      <section class="systems" aria-label="Demo systems">
        <article><span class="index">01 / MEMBER SPACE</span><h2>User workspace</h2><p>Register or sign in, join a shared room, and exchange live messages.</p><a href="${basePath}client/">Open user workspace <span>↗</span></a></article>
        <article><span class="index">02 / OPERATIONS</span><h2>Control room</h2><p>Review live reports, manage room status, and inspect member accounts.</p><a href="${basePath}admin/">Open control room <span>↗</span></a></article>
      </section>
      <div class="credentials"><strong>Server accounts</strong><br />User workspace: <code>guest</code> / <code>guest123!</code><br />Control room: <code>admin</code> / password configured as <code>IM_ADMIN_PASSWORD</code> on Vercel.</div>
      <footer>Both frontends use the Vercel API at <code>${apiBaseUrl}</code>. <a class="server-link" href="https://match-chat-server-seven.vercel.app/api/health">Check server health ↗</a> Accounts and room data are stored by the server; GitHub Pages only hosts the static frontends.</footer>
    </main>
  </body>
</html>
`);
writeFileSync(new URL(".nojekyll", output), "");

for (const appName of ["client", "admin"]) {
  const appDirectory = new URL(`../apps/${appName}/`, import.meta.url);
  const viteCli = new URL(`../apps/${appName}/node_modules/vite/bin/vite.js`, import.meta.url);
  const result = spawnSync(process.execPath, [
    fileURLToPath(viteCli), "build",
    "--base", `${basePath}${appName}/`,
    "--outDir", `../../dist-pages/${appName}`,
    "--emptyOutDir",
  ], {
    cwd: fileURLToPath(appDirectory),
    stdio: "inherit",
    env: { ...process.env, VITE_API_BASE_URL: apiBaseUrl, VITE_DEMO_MODE: "false" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`GitHub Pages files written to dist-pages/ (base ${basePath}).`);

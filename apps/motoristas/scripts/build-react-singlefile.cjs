const fs = require("fs");
const path = require("path");
const { proximaVersao } = require("./versao-build.cjs");

async function run() {
  const esbuild = require("esbuild");
  const root = process.cwd();
  const distDir = path.join(root, "dist");
  const packagePath = path.join(root, "package.json");
  const packageLockPath = path.join(root, "package-lock.json");
  const shouldBumpVersion = !process.argv.includes("--no-version");

  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const buildVersion = shouldBumpVersion ? proximaVersao(packageJson.version, process.env.PUBLISHED_VERSION) : packageJson.version;

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  const jsResult = await esbuild.build({
    entryPoints: [path.join(root, "src", "main.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    write: false,
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    loader: {
      ".png": "dataurl",
      ".webp": "dataurl",
      ".jpg": "dataurl",
      ".jpeg": "dataurl",
      ".svg": "dataurl",
      ".ttf": "dataurl",
      ".otf": "dataurl",
      ".woff": "dataurl",
      ".woff2": "dataurl",
    },
  });

  const cssResult = await esbuild.build({
    entryPoints: [path.join(root, "src", "styles.css")],
    bundle: true,
    write: false,
    minify: true,
    loader: {
      ".png": "dataurl",
      ".webp": "dataurl",
      ".jpg": "dataurl",
      ".jpeg": "dataurl",
      ".svg": "dataurl",
      ".ttf": "dataurl",
      ".otf": "dataurl",
      ".woff": "dataurl",
      ".woff2": "dataurl",
    },
  });

  const js = jsResult.outputFiles[0].text;
  const css = cssResult.outputFiles[0].text;
  if (shouldBumpVersion) {
    packageJson.version = buildVersion;
    fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  }

  if (shouldBumpVersion && fs.existsSync(packageLockPath)) {
    const packageLock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));
    packageLock.version = buildVersion;
    if (packageLock.packages?.[""]) {
      packageLock.packages[""].version = buildVersion;
    }
    fs.writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`, "utf8");
  }

  const flowEnv = JSON.stringify({
    VITE_FLOW_GERAR_VOUCHER_URL: process.env.VITE_FLOW_GERAR_VOUCHER_URL ?? "",
    VITE_FLOW_SALVAR_FOTOS_MANUTENCAO_URL: process.env.VITE_FLOW_SALVAR_FOTOS_MANUTENCAO_URL ?? ""
  }).replace(/</g, "\\u003c");
  const builtAt = new Date();
  const buildInfo = JSON.stringify({
    version: buildVersion,
    builtAt: builtAt.toISOString(),
    builtAtLabel: builtAt.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }).replace(/</g, "\\u003c");

  const initScript = `<script>window.__APP_FLOW_ENV=${flowEnv};window.__APP_BUILD_INFO=${buildInfo};</script>`;

  // Splash da marca: o mesmo do index.html do dev (estilo e marcação), com a logo embutida. Pinta antes do JS inline.
  const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const splashStyle = indexHtml.match(/<style>[\s\S]*?#boot-splash[\s\S]*?<\/style>/)?.[0];
  const splashMarkup = indexHtml.match(/<div id="boot-splash"[\s\S]*?<\/div>\s*<\/div>/)?.[0];
  if (!splashStyle || !splashMarkup) throw new Error("index.html sem o splash #boot-splash");
  const splashLogo = `data:image/webp;base64,${fs.readFileSync(path.join(root, "src", "assets", "images", "logo-betinhos-b-192.webp")).toString("base64")}`;
  const splash = splashMarkup.replace(/src="[^"]*"/, `src="${splashLogo}"`);

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App Betinhos Motoristas</title>
    ${splashStyle}
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    ${splash}
    ${initScript}
    <script>${js}</script>
  </body>
  </html>`;

  fs.writeFileSync(path.join(distDir, "webresource-app-motoristas.html"), html, "utf8");
  fs.writeFileSync(path.join(distDir, "index.html"), html, "utf8");
  // Service worker do PWA: web resource JS próprio (o navegador não aceita SW embutido no HTML).
  fs.copyFileSync(path.join(root, "src", "pwa", "sw.js"), path.join(distDir, "sw.js"));
  console.log(`Build concluído: dist/webresource-app-motoristas.html | versão ${buildVersion}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

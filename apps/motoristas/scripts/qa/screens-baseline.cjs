// Prova visual da refatoração: captura as telas do mock a partir do dist/ e compara pixel a pixel.
//   node scripts/qa/screens-baseline.cjs capture <pasta>   (rode `npm run build -- --no-version` antes)
//   node scripts/qa/screens-baseline.cjs compare <antes> <depois>
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { openBrowser } = require("@remotion/renderer");

const root = path.resolve(__dirname, "..", "..");
const [mode, first, second] = process.argv.slice(2);

function serveDist() {
  const html = fs.readFileSync(path.join(root, "dist", "index.html"));
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// Relógio congelado: o mock calcula "hoje", horários e badges a partir de Date.
const FROZEN_NOW = Date.parse("2026-10-28T12:00:00.000Z");
const FREEZE_CLOCK = `(() => {
  const RealDate = Date;
  const now = ${FROZEN_NOW};
  class FrozenDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(now); else super(...args); }
    static now() { return now; }
  }
  globalThis.Date = FrozenDate;
  // Animações e selo de build desligados desde o primeiro quadro (o selo muda a cada build).
  const style = "<style>.build-stamp{visibility:hidden!important}*,*::before,*::after{caret-color:transparent!important;animation:none!important;transition:none!important}</style>";
  document.addEventListener("DOMContentLoaded", () => document.head.insertAdjacentHTML("beforeend", style));
  Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel() {}, finish() {}, play() {}, pause() {}, addEventListener() {} }; };
})();`;

// Rotas hash (ativas em localhost). Telas que exigem detalhe recebem o serviço/manutenção do mock.
const ROUTES = [
  ["01-inicio", "#inicio"],
  ["02-servicos", "#servicos"],
  ["03-detalhe-servico", "#detalhes?serviceId=10241&type=SERVICO"],
  ["04-detalhe-manutencao", "#detalhes?serviceId=76&type=MANUTENCAO"],
  ["05-voucher", "#voucher?serviceId=10241&type=SERVICO"],
  ["06-finalizar", "#finalizar?serviceId=10241&type=SERVICO"],
  ["07-receber", "#receber?serviceId=10241&type=SERVICO"],
  ["08-comunicados", "#comunicados"],
  ["09-checklists", "#checklists"],
  ["10-historico", "#historico"],
  ["11-gastos", "#gastos"],
  ["12-colisoes", "#colisoes"],
  ["13-manutencao", "#solicitar-manutencao"],
  ["14-ideias", "#boas-ideias"],
  ["15-meu-carro", "#meu-carro"],
  ["16-multas", "#multas"]
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function capture(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serveDist();
  const baseUrl = `http://localhost:${server.address().port}/`;
  const browser = await openBrowser("chrome", { browserExecutable: null, chromiumOptions: {}, forceDeviceScaleFactor: 1, logLevel: "warn" });
  try {
    const page = await browser.newPage({ context: null, logLevel: "warn", indent: false, pageIndex: 0, onBrowserLog: null, onLog: () => undefined });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true, isLandscape: false });
    const cdp = page._client();
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: FREEZE_CLOCK });
    for (const [name, hash] of ROUTES) {
      await page.goto({ url: `${baseUrl}?shot=${name}${hash}`, timeout: 30000 });
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); return true; });
      await page.goto({ url: `${baseUrl}?shot=${name}-2${hash}`, timeout: 30000 });
      await sleep(1500);
      const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const data = result.data ?? result.result?.data ?? result.value?.data;
      fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
      const title = await page.evaluate(() => document.body.innerText.split("\n").filter(Boolean).slice(0, 2).join(" | "));
      console.log(`${name.padEnd(24)} ${title}`);
    }
  } finally {
    await browser.close({ silent: true });
    server.close();
  }
  console.log(`Telas salvas em ${path.resolve(outDir)}`);
}

// Mesmo navegador e mesmo HTML renderizado geram o mesmo PNG; qualquer byte diferente = olhar a tela.
async function compare(beforeDir, afterDir) {
  const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const names = fs.readdirSync(beforeDir).filter((name) => name.endsWith(".png")).sort();
  if (names.length === 0) throw new Error(`nenhum PNG em ${beforeDir}`);
  let changed = 0;
  for (const name of names) {
    const afterPath = path.join(afterDir, name);
    const status = !fs.existsSync(afterPath) ? "FALTA  " : hash(path.join(beforeDir, name)) === hash(afterPath) ? "IGUAL  " : "DIFERE ";
    if (status !== "IGUAL  ") changed += 1;
    console.log(`${status} ${name}`);
  }
  console.log(changed === 0 ? `OK: ${names.length} telas idênticas.` : `${changed} de ${names.length} telas diferentes.`);
  process.exitCode = changed === 0 ? 0 : 1;
}

const run = mode === "capture" && first ? capture(first) : mode === "compare" && first && second ? compare(first, second) : null;
if (!run) {
  console.error("uso: capture <pasta> | compare <antes> <depois>");
  process.exit(2);
}
run.catch((error) => {
  console.error(error);
  process.exit(1);
});

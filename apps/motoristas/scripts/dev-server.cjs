const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { execSync, spawn } = require("child_process");

const root = process.cwd();
const distDir = path.join(root, "dist");
const host = "127.0.0.1";
const DEV_PORTS_FILE = path.join(os.homedir(), ".codex", "dev-ports.json");
let building = false;
let pending = false;

function build() {
  if (building) {
    pending = true;
    return;
  }

  building = true;
  const child = spawn(process.execPath, [path.join(root, "scripts", "build-react-singlefile.cjs"), "--no-version"], {
    cwd: root,
    stdio: "inherit"
  });

  child.on("exit", (code) => {
    building = false;
    if (code === 0) {
      console.log("[dev] build atualizado");
    } else {
      console.log(`[dev] build falhou: ${code}`);
    }
    if (pending) {
      pending = false;
      build();
    }
  });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  return "text/plain; charset=utf-8";
}

function serveFile(request, response) {
  const requestPath = (request.url || "/").split("?")[0];
  if (requestPath === "/__dev-server") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ root }));
    return;
  }
  const requestedPath = requestPath === "/" ? "index.html" : requestPath.replace(/^\//, "");
  const filePath = path.join(distDir, requestedPath);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("not found");
      return;
    }

    response.writeHead(200, { "Content-Type": contentType(filePath) });
    response.end(data);
  });
}

function watchDirectory(relativePath) {
  const directory = path.join(root, relativePath);
  if (!fs.existsSync(directory)) return;

  fs.watch(directory, { recursive: true }, (eventType, fileName) => {
    if (!fileName || fileName.includes("~")) return;
    console.log(`[dev] mudança detectada: ${relativePath}\\${fileName}`);
    build();
  });
}

// Porta fixa por checkout: PORT do ambiente ou a reserva em ~/.codex/dev-ports.json
// (caminho absoluto -> porta). Sem fallback silencioso para outra porta.
function resolvePort() {
  if (process.env.PORT) return Number(process.env.PORT);
  let reservations = {};
  try { reservations = JSON.parse(fs.readFileSync(DEV_PORTS_FILE, "utf8")); } catch { /* sem registro */ }
  const key = Object.keys(reservations).find((dir) => path.resolve(dir).toLowerCase() === root.toLowerCase());
  if (key) return Number(reservations[key]);
  console.error(`[dev] nenhuma porta reservada para ${root}. Registre uma porta livre em ${DEV_PORTS_FILE} ou rode com PORT=<porta>.`);
  process.exit(1);
}

function listeningPids(port) {
  if (process.platform !== "win32") return [];
  let output = "";
  try { output = execSync("netstat -ano", { encoding: "utf8" }); } catch { return []; }
  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols[0] === "TCP" && cols[3] === "LISTENING" && cols[1].endsWith(`:${port}`)) pids.add(Number(cols[4]));
  }
  return [...pids].filter((pid) => pid > 0 && pid !== process.pid);
}

// O próprio dev server responde /__dev-server com o checkout que está servindo.
function servedRoot(port) {
  return new Promise((resolve) => {
    const request = http.get({ host, port, path: "/__dev-server", timeout: 1500 }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => { try { resolve(JSON.parse(body).root || ""); } catch { resolve(""); } });
    });
    request.on("timeout", () => { request.destroy(); resolve(""); });
    request.on("error", () => resolve(""));
  });
}

function commandLine(pid) {
  try {
    return execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`, { encoding: "utf8" }).trim();
  } catch { return ""; }
}

// Porta ocupada pelo dev server deste checkout: encerra e reaproveita. Outro serviço: falha com PID e comando.
async function freePort(port) {
  const pids = listeningPids(port);
  const isOurs = pids.length > 0 && (await servedRoot(port)).toLowerCase() === root.toLowerCase();
  for (const pid of pids) {
    const command = commandLine(pid);
    if (!isOurs) {
      console.error(`[dev] porta ${port} ocupada por outro serviço (PID ${pid}): ${command || "comando desconhecido"}`);
      process.exit(1);
    }
    console.log(`[dev] porta ${port} em uso pelo dev server deste projeto (PID ${pid}); encerrando.`);
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
  }
  for (let attempt = 0; attempt < 20 && listeningPids(port).length; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function listen(port) {
  const server = http.createServer(serveFile);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`[dev] porta ${port} continua ocupada; nenhuma porta alternativa será usada.`);
      process.exit(1);
    }
    throw error;
  });

  server.listen(port, host, () => {
    console.log(`[dev] http://${host}:${port}`);
    console.log("[dev] edite src/*; recarregue o navegador");
  });
}

(async () => {
  const port = resolvePort();
  await freePort(port);
  build();
  watchDirectory("src");
  watchDirectory("extracted-msapp\Assets\Images");
  listen(port);
})();

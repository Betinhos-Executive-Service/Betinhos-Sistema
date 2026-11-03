#!/usr/bin/env node
// Publica no DEV o assembly Betinhos.DriverRecordSharing (equivalente em Node de register-driver-record-sharing-plugin-webapi.ps1, para Linux/macOS).
// Só ATUALIZA o conteúdo do assembly já registrado. Não cria assembly, tipos nem steps (use os scripts de provisão para isso).
//
//   node scripts/publicar-plugin-dev.mjs --build            # confere tudo, sem gravar
//   node scripts/publicar-plugin-dev.mjs --build --apply    # grava no DEV
//
// Pré-requisitos: dotnet no PATH, plugins/DriverRecordSharing/DriverRecordSharing.snk (a chave REAL, não versionada) e login Microsoft
// por código de dispositivo (o script imprime a URL e o código). O PROD nunca é alvo: ele recebe mudanças por scripts/deploy-prod.ps1.
import { createHash } from "node:crypto";
import dns from "node:dns";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Alguns Linux têm IPv6 sem rota e o fetch estoura o tempo de conexão antes de tentar o IPv4.
dns.setDefaultResultOrder("ipv4first");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENVIRONMENT_URL = "https://org23b93544.crm2.dynamics.com"; // DEV
const ASSEMBLY_NAME = "Betinhos.DriverRecordSharing";
const PROJECT = "plugins/DriverRecordSharing";
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d"; // mesmo cliente público do MSAL.PS dos scripts PowerShell
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");

// Token de nome forte (16 hex) lido da própria DLL: cabeçalho SN de RSA 2048 + PUBLICKEYBLOB (288 bytes); token = 8 últimos bytes do SHA-1, invertidos.
function publicKeyToken(dll) {
  const at = dll.indexOf(Buffer.from("002400000480000014010000", "hex"));
  if (at < 0) throw new Error("A DLL não tem nome forte RSA de 2048 bits.");
  const digest = createHash("sha1").update(dll.subarray(at, at + 288)).digest();
  return Buffer.from(digest.subarray(12)).reverse().toString("hex");
}

// Rede instável (timeouts de conexão) não pode derrubar um login ou uma publicação no meio.
async function fetchRetry(url, init, attempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await fetch(url, { ...init, signal: AbortSignal.timeout(90_000) }); } catch (error) {
      if (attempt >= attempts) throw error;
      await sleep(2000 * attempt);
    }
  }
}

async function deviceCodeToken() {
  const authority = "https://login.microsoftonline.com/organizations/oauth2/v2.0";
  const form = (data) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data) });
  const device = await (await fetchRetry(`${authority}/devicecode`, form({ client_id: CLIENT_ID, scope: `${ENVIRONMENT_URL}/user_impersonation offline_access` }))).json();
  if (!device.device_code) throw new Error(`Login Microsoft não iniciou: ${device.error_description ?? device.error}`);
  console.log(device.message);
  let interval = device.interval;
  for (const deadline = Date.now() + device.expires_in * 1000; Date.now() < deadline;) {
    await sleep(interval * 1000);
    const answer = await (await fetchRetry(`${authority}/token`, form({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: CLIENT_ID, device_code: device.device_code }))).json();
    if (answer.access_token) return answer.access_token;
    if (answer.error === "slow_down") interval += 5;
    else if (answer.error !== "authorization_pending") throw new Error(`Login Microsoft falhou: ${answer.error_description ?? answer.error}`);
  }
  throw new Error("Login Microsoft expirou.");
}

// O assembly é único e compartilhado entre frentes: publicar de branch sem a main apagaria no DEV os tipos das outras.
function assertPublishableBranch() {
  const git = (...gitArgs) => execFileSync("git", gitArgs, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  git("fetch", "origin", "main", "--quiet");
  try { git("merge-base", "--is-ancestor", "origin/main", "HEAD"); } catch (error) {
    if (error.status !== 1) throw error;
    throw new Error("A branch não contém origin/main. Faça merge da main antes de publicar o plugin (o assembly é compartilhado entre frentes).");
  }
  if (git("status", "--porcelain", "--", PROJECT).toString().trim()) throw new Error(`Há mudanças não commitadas em ${PROJECT}: a DLL publicada não corresponderia a um commit.`);
}

async function main() {
  if (apply && !args.has("--build")) throw new Error("--apply exige --build: sem ele a DLL publicada pode estar desatualizada.");
  if (apply) assertPublishableBranch();
  if (args.has("--build")) {
    if (!existsSync(`${ROOT}${PROJECT}/DriverRecordSharing.snk`)) throw new Error(`Falta ${PROJECT}/DriverRecordSharing.snk (a chave real, copiada do Windows; não é versionada).`);
    execFileSync("dotnet", ["build", `${PROJECT}/DriverRecordSharing.csproj`, "-c", "Release", "--nologo", "-v", "q"], { cwd: ROOT, stdio: "inherit" });
  }
  const dllPath = `${ROOT}${PROJECT}/bin/Release/net462/${ASSEMBLY_NAME}.dll`;
  if (!existsSync(dllPath)) throw new Error(`DLL não encontrada: ${dllPath}. Use --build.`);
  const dll = readFileSync(dllPath);
  const localToken = publicKeyToken(dll);
  console.log(`DLL ${dll.length} bytes, token de nome forte ${localToken}`);

  const token = await deviceCodeToken();
  const api = async (method, path, body) => {
    const response = await fetchRetry(`${ENVIRONMENT_URL}/api/data/v9.2/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0", "Content-Type": "application/json; charset=utf-8" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`${method} ${path.split("?")[0]} falhou: HTTP ${response.status} ${(await response.text()).slice(0, 400)}`);
    return response.status === 204 ? null : response.json();
  };

  const rows = (await api("GET", `pluginassemblies?$select=pluginassemblyid,publickeytoken,isolationmode,sourcetype,modifiedon&$filter=name eq '${ASSEMBLY_NAME}'`)).value;
  if (rows.length !== 1) throw new Error(`Esperava 1 assembly ${ASSEMBLY_NAME} no DEV e achei ${rows.length}.`);
  const [remote] = rows;
  if (remote.isolationmode !== 2 || remote.sourcetype !== 0) throw new Error("Assembly do DEV não está em Sandbox/Banco de dados.");
  if (String(remote.publickeytoken).toLowerCase() !== localToken) {
    throw new Error(`Chave de nome forte diferente: DEV ${remote.publickeytoken}, DLL ${localToken}. Publicar assim mudaria a identidade do assembly; use a chave real (a mesma do Windows).`);
  }
  const types = async () => (await api("GET", `plugintypes?$select=typename&$filter=_pluginassemblyid_value eq ${remote.pluginassemblyid}`)).value.map((row) => row.typename).sort();
  const before = await types();
  // Nome simples de cada tipo do DEV tem de existir na DLL nova (heap de strings do .NET): se faltar, o PATCH apagaria um tipo e seus steps.
  const missing = before.filter((typeName) => !dll.includes(`${typeName.split(".").pop()}\0`));
  if (missing.length) throw new Error(`A DLL não contém tipos que existem no DEV (provável branch sem as outras frentes): ${missing.join(", ")}.`);
  console.log(`DEV: assembly ${remote.pluginassemblyid}, ${before.length} tipos, todos presentes na DLL, modificado em ${remote.modifiedon}`);
  if (!apply) return console.log("DRY RUN OK: identidade e tipos conferem. Use --apply para publicar.");

  const backup = `${tmpdir()}/${ASSEMBLY_NAME}-DEV-antes-${new Date().toISOString().replace(/[:.]/g, "-")}.dll`;
  writeFileSync(backup, Buffer.from((await api("GET", `pluginassemblies(${remote.pluginassemblyid})?$select=content`)).content, "base64"));
  console.log(`Cópia do assembly atual do DEV: ${backup}`);
  await api("PATCH", `pluginassemblies(${remote.pluginassemblyid})`, { content: dll.toString("base64") });
  const after = await types();
  const now = (await api("GET", `pluginassemblies(${remote.pluginassemblyid})?$select=modifiedon`)).modifiedon;
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`Tipos mudaram depois da publicação: antes ${before.length}, depois ${after.length}. Restaure a cópia ${backup} se precisar.`);
  console.log(`Publicado. ${after.length} tipos preservados, modificado em ${now}.`);
}

await main().catch((error) => { console.error(`ERRO: ${error.message}${error.cause?.code ? ` (${error.cause.code})` : ""}`); process.exit(1); });

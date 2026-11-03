#!/usr/bin/env node
// Grava a chave da API Anthropic na configuração segura do step de new_OrganizarObservacao no DEV (Linux/macOS).
// A chave vem de um ARQUIVO (canal seguro, ex.: recurso de segredo do T3), nunca de argumento, e o arquivo é apagado ao final.
// O valor nunca é impresso. Não cria step nem tipo: eles vêm de scripts/provision-observacao-organizada.ps1.
//
//   node scripts/configurar-chave-observacao-dev.mjs --verificar             # só confere o step e se há configuração segura
//   node scripts/configurar-chave-observacao-dev.mjs --arquivo <caminho>     # grava (e apaga o arquivo)
import dns from "node:dns";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

dns.setDefaultResultOrder("ipv4first");
const ENVIRONMENT_URL = "https://org23b93544.crm2.dynamics.com"; // DEV
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const PLUGIN_TYPE = "Betinhos.DriverRecordSharing.OrganizeObservationPlugin";
const API_NAME = "new_OrganizarObservacao";
const argv = process.argv.slice(2);
const fileIndex = argv.indexOf("--arquivo");
const keyFile = fileIndex >= 0 ? argv[fileIndex + 1] : "";

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

async function main() {
  if (fileIndex < 0 === !argv.includes("--verificar")) throw new Error("Use --verificar ou --arquivo <caminho>.");
  let secret = "";
  if (keyFile) {
    if (!existsSync(keyFile)) throw new Error("Arquivo da chave não encontrado.");
    secret = readFileSync(keyFile, "utf8").trim();
    if (!secret) throw new Error("Chave vazia: nada foi gravado.");
  }
  try {
    const token = await deviceCodeToken();
    const api = async (method, path, body) => {
      const response = await fetchRetry(`${ENVIRONMENT_URL}/api/data/v9.2/${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0", "Content-Type": "application/json; charset=utf-8", Prefer: "return=representation" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      // Não repete o corpo da resposta no erro: ele pode ecoar o valor enviado.
      if (!response.ok) throw new Error(`${method} ${path.split("?")[0]} falhou: HTTP ${response.status}`);
      return response.status === 204 ? null : response.json();
    };
    const one = async (path, what) => {
      const rows = (await api("GET", path)).value;
      if (rows.length !== 1) throw new Error(`Esperava 1 ${what} no DEV e achei ${rows.length}. Rode scripts/provision-observacao-organizada.ps1 -Apply antes.`);
      return rows[0];
    };
    const type = await one(`plugintypes?$select=plugintypeid&$filter=typename eq '${PLUGIN_TYPE}'`, "PluginType");
    const message = await one(`sdkmessages?$select=sdkmessageid&$filter=name eq '${API_NAME}'`, "mensagem");
    const step = await one(`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,stage,mode,_sdkmessageprocessingstepsecureconfigid_value&$filter=_eventhandler_value eq ${type.plugintypeid} and _sdkmessageid_value eq ${message.sdkmessageid}`, "step");
    if (step.stage !== 40 || step.mode !== 0) throw new Error("Step divergente (esperado PostOperation síncrono).");
    const secureId = step._sdkmessageprocessingstepsecureconfigid_value;
    console.log(`Step ${step.sdkmessageprocessingstepid}: configuração segura ${secureId ? "presente" : "ausente"}.`);
    if (!keyFile) return;
    if (secureId) await api("PATCH", `sdkmessageprocessingstepsecureconfigs(${secureId})`, { secureconfig: secret });
    else {
      const created = await api("POST", "sdkmessageprocessingstepsecureconfigs", { secureconfig: secret });
      await api("PATCH", `sdkmessageprocessingsteps(${step.sdkmessageprocessingstepid})`, { "sdkmessageprocessingstepsecureconfigid@odata.bind": `/sdkmessageprocessingstepsecureconfigs(${created.sdkmessageprocessingstepsecureconfigid})` });
    }
    console.log("Chave gravada na configuração segura do step (valor não impresso).");
  } finally {
    if (keyFile) rmSync(keyFile, { force: true });
  }
}

await main().catch((error) => { console.error(`ERRO: ${error.message}${error.cause?.code ? ` (${error.cause.code})` : ""}`); process.exit(1); });

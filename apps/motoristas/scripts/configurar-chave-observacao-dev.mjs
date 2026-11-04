#!/usr/bin/env node
// Grava a chave da API Anthropic na configuração segura do step de new_OrganizarObservacao no DEV (Linux/macOS).
// Com --combustivel grava no step de new_GerarInsightsCombustivel (insights do relatório de combustível); --copiar-da-variavel
// continua copiando da variável da observação, que é a chave Anthropic já guardada no ambiente.
// A chave vem da variável de ambiente que já a guarda no DEV (--copiar-da-variavel) ou de um ARQUIVO (canal seguro), nunca de argumento;
// Com --prod aponta para o PROD (gravar exige --confirmo-prod; --prod --verificar só lê). O arquivo é apagado ao final. O valor nunca é impresso. Não cria step nem tipo: eles vêm de scripts/provision-observacao-organizada.ps1.
//
//   node scripts/configurar-chave-observacao-dev.mjs --verificar             # só confere o step e se há configuração segura
//   node scripts/configurar-chave-observacao-dev.mjs --copiar-da-variavel   # copia o valor da variável do DEV para o step
//   node scripts/configurar-chave-observacao-dev.mjs --arquivo <caminho>     # grava a chave do arquivo (e apaga o arquivo)
//   node scripts/configurar-chave-observacao-dev.mjs --combustivel --copiar-da-variavel   # mesma chave no step dos insights de combustível
import dns from "node:dns";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

dns.setDefaultResultOrder("ipv4first");
const argv = process.argv.slice(2);
const isProd = argv.includes("--prod"); // PROD: leitura livre; escrita só com --confirmo-prod
const ENVIRONMENT_NAME = isProd ? "PROD" : "DEV";
const ENVIRONMENT_URL = isProd ? "https://orgf261ae8e.crm2.dynamics.com" : "https://org23b93544.crm2.dynamics.com";
const CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d";
const isFuel = argv.includes("--combustivel");
const PLUGIN_TYPE = isFuel ? "Betinhos.DriverRecordSharing.FuelInsightsPlugin" : "Betinhos.DriverRecordSharing.OrganizeObservationPlugin";
const API_NAME = isFuel ? "new_GerarInsightsCombustivel" : "new_OrganizarObservacao";
const ENV_VAR = "new_AnthropicKeyObservacaoMotorista";
const fileIndex = argv.indexOf("--arquivo");
const keyFile = fileIndex >= 0 ? argv[fileIndex + 1] : "";
const fromVariable = argv.includes("--copiar-da-variavel");
const verifyOnly = argv.includes("--verificar");

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
  if ([verifyOnly, fromVariable, fileIndex >= 0].filter(Boolean).length !== 1) throw new Error("Use exatamente um: --verificar, --copiar-da-variavel ou --arquivo <caminho>.");
  if (isProd && !verifyOnly && !argv.includes("--confirmo-prod")) throw new Error("Gravar no PROD exige --confirmo-prod (confira antes o ambiente e a chave).");
  let secret = "";
  if (keyFile) {
    if (!existsSync(keyFile)) throw new Error("Arquivo da chave não encontrado.");
    secret = readFileSync(keyFile, "utf8").trim();
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
      if (rows.length !== 1) throw new Error(`Esperava 1 ${what} no ${ENVIRONMENT_NAME} e achei ${rows.length}. Faça antes o deploy da solução (PROD: scripts/deploy-prod.ps1) ou rode scripts/provision-observacao-organizada.ps1 -Apply (DEV).`);
      return rows[0];
    };
    const type = await one(`plugintypes?$select=plugintypeid&$filter=typename eq '${PLUGIN_TYPE}'`, "PluginType");
    const message = await one(`sdkmessages?$select=sdkmessageid&$filter=name eq '${API_NAME}'`, "mensagem");
    const step = await one(`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,stage,mode,_sdkmessageprocessingstepsecureconfigid_value&$filter=_eventhandler_value eq ${type.plugintypeid} and _sdkmessageid_value eq ${message.sdkmessageid}`, "step");
    if (step.stage !== 40 || step.mode !== 0) throw new Error("Step divergente (esperado PostOperation síncrono).");
    const secureId = step._sdkmessageprocessingstepsecureconfigid_value;
    console.log(`[${ENVIRONMENT_NAME}] Step ${step.sdkmessageprocessingstepid}: configuração segura ${secureId ? "presente" : "ausente"}.`);
    if (verifyOnly) return;
    if (fromVariable) {
      // Mesma regra do app: o valor da variável, se houver; senão o padrão da definição.
      const definition = await one(`environmentvariabledefinitions?$select=environmentvariabledefinitionid,defaultvalue&$filter=schemaname eq '${ENV_VAR}'`, "variável de ambiente");
      const values = (await api("GET", `environmentvariablevalues?$select=value&$filter=_environmentvariabledefinitionid_value eq ${definition.environmentvariabledefinitionid}`)).value;
      secret = String(values[0]?.value ?? definition.defaultvalue ?? "").trim();
    }
    if (!secret) throw new Error("Chave vazia: nada foi gravado.");
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

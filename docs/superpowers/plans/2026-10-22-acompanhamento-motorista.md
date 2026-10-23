# Link de acompanhamento do motorista — plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** link público com trajeto e endereços certos, etapas no mapa, status confiável, fechamento pelo Dataverse e cartão com foto, telefone corporativo e veículo.

**Arquitetura:** o Worker (`Link Acompanhamento de Motorista`) ganha três módulos puros (`normalizar.mjs`, `confianca.mjs`, `etapas.mjs`), o endpoint `/concluir` e as fotos em KV. O plugin do `App Motoristas` passa a enviar paradas, telefone e fotos e a chamar `/concluir` quando a reserva é concluída. O Worker sai primeiro e aceita o payload antigo, então a ordem de publicação não quebra nada.

**Stack:** Cloudflare Worker (ESM, `node --test`), Anthropic Messages API (`claude-haiku-5-5`), Nominatim, TomTom, Infleet GraphQL; plugin C# .NET 4.6.2 (`DriverRecordSharing`), xUnit.

**Spec:** `docs/superpowers/specs/2026-10-22-acompanhamento-motorista-design.md` (Sistema Betinhos).

## Restrições globais

- Geocodificação só Nominatim (`geocodeTolerante`/`geocodeNominatim`). Nada de Google Geocoding.
- IA só normaliza texto. Status, etapas e ETA são regra fixa.
- Secret novo: `ANTHROPIC_API_KEY_ACOMPANHAMENTO`. Modelo: `claude-haiku-5-5`. Timeout: 8 s. Falha → caminho atual.
- Raio padrão: `RAIO_LOCAL` = 150 m, permanência de 60 s; aeroporto usa `areaDoLugar`.
- Confiança: todas as etapas geocodificadas, `confianca: "alta"`, salto entre etapas ≤ 150 km.
- ETA só com `fonte: "tomtom"` e posição com menos de 3 min.
- Fotos: até 200 KB cada, chave `foto:<id>:motorista|veiculo`, mesmo TTL do link.
- Dataverse manda: `/concluir` encerra mesmo sem o GPS ter chegado.
- Links antigos no KV (sem `etapas`) continuam no formato atual até expirar.
- Versão de build no rodapé (`v0.0.N · dd/mm/aaaa HH:mm`), PATCH sobe em `pnpm push`.
- Nunca logar segredo, telefone completo nem a foto.
- Publicação: Worker com `pnpm push` no repo do Worker; plugin com `scripts/push-dev.ps1` do App Motoristas, **só DEV**. PROD fica fora deste plano.

---

## Parte A — Worker (`C:\Users\mendo\Desktop\vscode\Link Acompanhamento de Motorista`)

Branch: `feat/acompanhamento-etapas` (worktree em `.worktrees/` se o repo tiver trabalho em curso).

### Tarefa A1: normalização com o Haiku

**Arquivos:**
- Criar: `src/normalizar.mjs`
- Criar: `tests/normalizar.test.mjs`

**Interfaces:**
- Produz: `normalizarEnderecos({ saida, paradas, destino, observacoes }, { chave, fetch, timeoutMs = 8000 })` → `Promise<{ etapas: Array<{ tipo: "saida"|"parada"|"destino", consulta: string, rotulo: string }>, confianca: "alta"|"baixa", fonte: "haiku" } | null>`. `null` = não rodou ou falhou.

- [ ] **Passo 1: teste que falha**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { normalizarEnderecos } from "../src/normalizar.mjs";

const resposta = (input) => ({ ok: true, json: async () => ({ content: [{ type: "tool_use", name: "enderecos", input }] }) });

test("devolve as etapas limpas do Haiku", async () => {
  let corpo;
  const fetch = async (_url, init) => { corpo = JSON.parse(init.body); return resposta({ etapas: [
    { tipo: "saida", consulta: "Aeroporto Internacional de Guarulhos", rotulo: "GRU Terminal 3" },
    { tipo: "destino", consulta: "Rua Haddock Lobo 1000, São Paulo", rotulo: "Haddock Lobo, 1000" }], confianca: "alta" }); };
  const r = await normalizarEnderecos({ saida: "Aerop. GRU AA 963", destino: "R. Haddock Lobo 1000 - SP" }, { chave: "k", fetch });
  assert.equal(corpo.model, "claude-haiku-5-5");
  assert.equal(corpo.tool_choice.name, "enderecos");
  assert.equal(r.etapas.length, 2);
  assert.equal(r.confianca, "alta");
  assert.equal(r.fonte, "haiku");
});

test("sem chave, erro HTTP, JSON fora do formato ou timeout → null", async () => {
  assert.equal(await normalizarEnderecos({ saida: "x", destino: "y" }, { chave: "", fetch: async () => { throw new Error("não chama"); } }), null);
  assert.equal(await normalizarEnderecos({ saida: "x", destino: "y" }, { chave: "k", fetch: async () => ({ ok: false, status: 529 }) }), null);
  assert.equal(await normalizarEnderecos({ saida: "x", destino: "y" }, { chave: "k", fetch: async () => resposta({ etapas: [{ tipo: "outro" }] }) }), null);
  const lento = (_u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new Error("abort"))));
  assert.equal(await normalizarEnderecos({ saida: "x", destino: "y" }, { chave: "k", fetch: lento, timeoutMs: 20 }), null);
});

test("exige uma saída e um destino, na ordem", async () => {
  const fetch = async () => resposta({ etapas: [{ tipo: "destino", consulta: "a", rotulo: "a" }], confianca: "alta" });
  assert.equal(await normalizarEnderecos({ saida: "x", destino: "y" }, { chave: "k", fetch }), null);
});
```

- [ ] **Passo 2:** `node --test tests/normalizar.test.mjs` → FAIL (módulo não existe).

- [ ] **Passo 3: implementação**

```js
// Normaliza os textos de endereço da operação com o Haiku, uma vez por link. Só limpa texto:
// status, etapas e ETA são regra fixa no Worker. Qualquer falha devolve null (caminho antigo).
const MODELO = "claude-haiku-5-5";
const TIPOS = new Set(["saida", "parada", "destino"]);

const PROMPT = `Você recebe endereços digitados pela operação de uma empresa de transporte executivo em São Paulo.
Devolva cada etapa com "consulta" pronta para geocodificar no OpenStreetMap e "rotulo" curto para o cliente.
Regras: tire número de voo, nome de passageiro, telefone e instruções; mantenha rua, número, bairro e cidade;
aeroporto vira o nome oficial (Aeroporto Internacional de Guarulhos, Aeroporto de Congonhas, Aeroporto Internacional de Viracopos);
não invente endereço. Se algum endereço estiver incompleto ou ambíguo, confianca = "baixa".`;

const FERRAMENTA = {
  name: "enderecos",
  description: "Etapas do serviço em ordem: uma saída, paradas e um destino.",
  input_schema: {
    type: "object",
    required: ["etapas", "confianca"],
    properties: {
      etapas: { type: "array", items: { type: "object", required: ["tipo", "consulta", "rotulo"], properties: {
        tipo: { enum: ["saida", "parada", "destino"] }, consulta: { type: "string" }, rotulo: { type: "string" } } } },
      confianca: { enum: ["alta", "baixa"] }
    }
  }
};

function valido(r) {
  const e = r?.etapas;
  if (!Array.isArray(e) || e.length < 2 || !["alta", "baixa"].includes(r.confianca)) return false;
  if (e[0].tipo !== "saida" || e.at(-1).tipo !== "destino") return false;
  return e.every((x, i) => TIPOS.has(x.tipo) && typeof x.consulta === "string" && x.consulta.trim() && typeof x.rotulo === "string"
    && (i === 0 || i === e.length - 1 || x.tipo === "parada"));
}

export async function normalizarEnderecos(textos, { chave, fetch = globalThis.fetch, timeoutMs = 8000 }) {
  if (!chave) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELO, max_tokens: 1024, system: PROMPT, tools: [FERRAMENTA], tool_choice: { type: "tool", name: "enderecos" },
        messages: [{ role: "user", content: JSON.stringify(textos) }]
      })
    });
    if (!res.ok) { console.warn(`Haiku HTTP ${res.status}`); return null; }
    const input = (await res.json()).content?.find((c) => c.type === "tool_use")?.input;
    return valido(input) ? { etapas: input.etapas, confianca: input.confianca, fonte: "haiku" } : null;
  } catch (e) {
    console.warn(`Haiku falhou: ${e.message}`);
    return null;
  } finally { clearTimeout(timer); }
}
```

- [ ] **Passo 4:** `node --test tests/normalizar.test.mjs` → PASS.
- [ ] **Passo 5:** commit `feat(link): normaliza endereços com o Haiku antes do Nominatim`.

### Tarefa A2: confiança do trajeto

**Arquivos:** criar `src/confianca.mjs`, `tests/confianca.test.mjs`.

**Interfaces:**
- Consome: `distanciaMetros(lat1, lon1, lat2, lon2)` (já existe; importar de onde o `worker.mjs` importa).
- Produz: `trajetoConfiavel(etapasGeo, confiancaHaiku)` → `boolean`. `etapasGeo`: `Array<{ lat, lon } | null>`; `confiancaHaiku`: `"alta"|"baixa"|null` (`null` = Haiku não rodou).

- [ ] **Passo 1: teste**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { trajetoConfiavel, SALTO_MAX_M } from "../src/confianca.mjs";

const gru = { lat: -23.4356, lon: -46.4731 }, paulista = { lat: -23.5614, lon: -46.6559 }, manaus = { lat: -3.119, lon: -60.0217 };

test("todas geocodificadas, perto e Haiku alta → confiável", () => assert.equal(trajetoConfiavel([gru, paulista], "alta"), true));
test("Haiku não rodou mas geocode achou tudo → confiável", () => assert.equal(trajetoConfiavel([gru, paulista], null), true));
test("Haiku baixa → simples", () => assert.equal(trajetoConfiavel([gru, paulista], "baixa"), false));
test("etapa sem geocode → simples", () => assert.equal(trajetoConfiavel([gru, null, paulista], "alta"), false));
test("salto acima de 150 km → simples", () => { assert.equal(SALTO_MAX_M, 150000); assert.equal(trajetoConfiavel([gru, manaus], "alta"), false); });
test("menos de duas etapas → simples", () => assert.equal(trajetoConfiavel([gru], "alta"), false));
```

- [ ] **Passo 2:** rodar → FAIL.
- [ ] **Passo 3: implementação**

```js
// Decide se o link mostra status, etapas e ETA (modo completo) ou só o carro (modo simples).
import { distanciaMetros } from "./local.mjs"; // ajuste o import para o módulo onde distanciaMetros mora hoje

export const SALTO_MAX_M = 150000;

export function trajetoConfiavel(etapasGeo, confiancaHaiku) {
  if (!Array.isArray(etapasGeo) || etapasGeo.length < 2 || etapasGeo.some((p) => !p)) return false;
  if (confiancaHaiku === "baixa") return false;
  return etapasGeo.every((p, i) => i === 0 || distanciaMetros(etapasGeo[i - 1].lat, etapasGeo[i - 1].lon, p.lat, p.lon) <= SALTO_MAX_M);
}
```

Antes do passo 3, confira com `grep -n "export function distanciaMetros" src/*.mjs` e use esse módulo no import.

- [ ] **Passo 4:** rodar → PASS. **Passo 5:** commit `feat(link): regra de confiança do trajeto (modo completo ou simples)`.

### Tarefa A3: máquina de etapas

**Arquivos:** criar `src/etapas.mjs`, `tests/etapas.test.mjs`.

**Interfaces:**
- Consome: `chegouAoLocal(pos, ponto)`, `saiuDoLocal(pos, ponto)` de `src/local.mjs`.
- Produz:
  - `avancarEtapas(etapas, pos, quandoIso)` → `boolean` (mutou?). `etapas`: `Array<{ tipo, rotulo, lat, lon, area?, chegouEm?, saiuEm?, dentroDesde? }>`.
  - `faseDasEtapas(etapas, concluidoDataverse)` → `{ fase: "a_caminho"|"no_local"|"em_viagem"|"concluido", atual: number|null }`.

- [ ] **Passo 1: teste**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { avancarEtapas, faseDasEtapas } from "../src/etapas.mjs";

const saida = { tipo: "saida", lat: -23.5614, lon: -46.6559 };
const parada = { tipo: "parada", lat: -23.5700, lon: -46.6900 };
const destino = { tipo: "destino", lat: -23.6267, lon: -46.6554 };
const longe = { lat: -23.50, lon: -46.60 };
const t = (s) => new Date(Date.UTC(2026, 9, 22, 12, 0, s)).toISOString();
const novas = () => [saida, parada, destino].map((e) => ({ ...e }));

test("a caminho → no local só após 60 s no raio → em viagem ao sair", () => {
  const e = novas();
  avancarEtapas(e, longe, t(0));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "a_caminho", atual: 0 });
  avancarEtapas(e, saida, t(10));
  assert.equal(faseDasEtapas(e, false).fase, "a_caminho", "30 s ainda não conta");
  avancarEtapas(e, saida, t(75));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "no_local", atual: 0 });
  avancarEtapas(e, longe, t(200));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "em_viagem", atual: 1 });
});

test("parada visitada avança para o destino; chegar no destino conclui", () => {
  const e = novas();
  for (const [p, s] of [[saida, 0], [saida, 70], [longe, 100], [parada, 200], [parada, 270], [longe, 300], [destino, 400], [destino, 470]]) avancarEtapas(e, p, t(s));
  assert.deepEqual(faseDasEtapas(e, false), { fase: "concluido", atual: null });
});

test("sair do raio antes de 60 s zera a contagem", () => {
  const e = novas();
  avancarEtapas(e, saida, t(0)); avancarEtapas(e, longe, t(30)); avancarEtapas(e, saida, t(50)); avancarEtapas(e, saida, t(90));
  assert.equal(faseDasEtapas(e, false).fase, "a_caminho");
});

test("Dataverse concluído prevalece", () => assert.deepEqual(faseDasEtapas(novas(), true), { fase: "concluido", atual: null }));
test("sem posição não muda nada", () => assert.equal(avancarEtapas(novas(), null, t(0)), false));
```

- [ ] **Passo 2:** rodar → FAIL.
- [ ] **Passo 3: implementação**

```js
// Etapas do serviço (saída → paradas → destino) avançadas pelo GPS. Regra fixa, sem IA.
import { chegouAoLocal, saiuDoLocal } from "./local.mjs";

export const PERMANENCIA_MS = 60000;

const atualDe = (etapas) => {
  const i = etapas.findIndex((e, k) => (k === etapas.length - 1 ? !e.chegouEm : !e.saiuEm));
  return i === -1 ? null : i;
};

export function avancarEtapas(etapas, pos, quando) {
  if (!pos) return false;
  const i = atualDe(etapas);
  if (i === null) return false;
  const e = etapas[i];
  if (!e.chegouEm) {
    if (!chegouAoLocal(pos, e)) { if (!e.dentroDesde) return false; delete e.dentroDesde; return true; }
    if (!e.dentroDesde) { e.dentroDesde = quando; return true; }
    if (Date.parse(quando) - Date.parse(e.dentroDesde) < PERMANENCIA_MS) return false;
    e.chegouEm = e.dentroDesde; delete e.dentroDesde; return true;
  }
  if (i < etapas.length - 1 && saiuDoLocal(pos, e)) { e.saiuEm = quando; return true; }
  return false;
}

export function faseDasEtapas(etapas, concluidoDataverse) {
  const i = atualDe(etapas);
  if (concluidoDataverse || i === null) return { fase: "concluido", atual: null };
  if (i === 0) return { fase: etapas[0].chegouEm ? "no_local" : "a_caminho", atual: 0 };
  return { fase: "em_viagem", atual: i };
}
```

- [ ] **Passo 4:** rodar → PASS (rode também `pnpm test` inteiro). **Passo 5:** commit `feat(link): etapas do serviço avançadas pelo GPS`.

### Tarefa A4: criação do link com etapas, motorista e fotos

**Arquivos:** modificar `src/api-links.mjs` (`validarPedido`, `criarLink`, `rotaApiLinks`); modificar `tests/api-links.test.mjs`.

**Interfaces:**
- Consome: `normalizarEnderecos` (A1), `trajetoConfiavel` (A2), `geocodeTolerante`.
- Payload novo do `POST /api/links` (todos opcionais, o antigo continua válido):
  `paradas: string[]` (até 8), `observacoes: string`, `motorista: { nome, telefone, fotoBase64 }`, `veiculo: { fotoBase64 }`.
- Grava em `track:<id>`: `etapas` (com `lat`, `lon`, `area`, `rotulo`, `tipo`), `modo: "completo"|"simples"`, `motorista: { nome, telefone, temFoto }`, `veiculoTemFoto`; mantém `destino`/`destinoFinal` = primeira/última etapa (compatível com `worker.mjs` atual).
- Grava `foto:<id>:motorista` e `foto:<id>:veiculo` (bytes, `{ metadata: { tipo } }`), TTL igual.
- `deps` ganha `normalizar` (default `(t) => normalizarEnderecos(t, { chave: env.ANTHROPIC_API_KEY_ACOMPANHAMENTO })`).

- [ ] **Passo 1: testes** (no `tests/api-links.test.mjs`, usando o KV falso que o arquivo já tem; se não tiver, `const kv = () => { const m = new Map(); return { m, put: async (k, v, o) => m.set(k, { v, o }), get: async (k) => m.get(k)?.v ?? null, delete: async (k) => m.delete(k) }; };`)

```js
test("validarPedido aceita paradas, motorista e fotos; recusa foto acima de 200 KB", () => {
  const ok = validarPedido({ placa: "abc1d23", embarque: "GRU", paradas: [" Hotel Unique ", ""], motorista: { nome: "Carlos Lima", telefone: "11999990000", fotoBase64: "aGVsbG8=" } });
  assert.deepEqual(ok.dados.paradas, ["Hotel Unique"]);
  assert.equal(ok.dados.motorista.telefone, "11999990000");
  const grande = "A".repeat(Math.ceil(200 * 1024 * 4 / 3) + 8);
  assert.match(validarPedido({ placa: "x", embarque: "y", veiculo: { fotoBase64: grande } }).erro, /200 KB/);
});

test("criarLink usa as etapas do Haiku, marca modo completo e guarda as fotos", async () => {
  const env = { TRACK_KV: kv() };
  const geo = { "Aeroporto Internacional de Guarulhos": { lat: -23.4356, lon: -46.4731, area: null }, "Rua Haddock Lobo 1000, São Paulo": { lat: -23.5614, lon: -46.6659, area: null } };
  const r = await criarLink(env, "https://w", { placa: "ABC1D23", embarque: "Aerop. GRU AA 963", destinoFinal: "R. Haddock Lobo 1000", paradas: [], validadeHoras: 4,
    motorista: { nome: "Carlos Lima", telefone: "11999990000", fotoBase64: "aGVsbG8=" }, veiculo: { fotoBase64: null } }, {
    acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), geocode: async (q) => geo[q] ?? null, agora: () => new Date("2026-10-22T12:00:00Z"), novoId: () => "f".repeat(64),
    normalizar: async () => ({ etapas: [{ tipo: "saida", consulta: "Aeroporto Internacional de Guarulhos", rotulo: "GRU" }, { tipo: "destino", consulta: "Rua Haddock Lobo 1000, São Paulo", rotulo: "Haddock Lobo, 1000" }], confianca: "alta", fonte: "haiku" })
  });
  const t = JSON.parse(env.TRACK_KV.m.get(`track:${"f".repeat(64)}`).v);
  assert.equal(r.link, `https://w/r/${"f".repeat(64)}`);
  assert.equal(t.modo, "completo");
  assert.equal(t.etapas.length, 2);
  assert.equal(t.destino.lat, -23.4356);
  assert.equal(t.motorista.telefone, "11999990000");
  assert.equal(t.motorista.temFoto, true);
  assert.ok(env.TRACK_KV.m.has(`foto:${"f".repeat(64)}:motorista`));
  assert.ok(!env.TRACK_KV.m.has(`foto:${"f".repeat(64)}:veiculo`));
});

test("Haiku fora → geocode do texto cru; etapa sem geocode → modo simples", async () => {
  const env = { TRACK_KV: kv() };
  await criarLink(env, "https://w", { placa: "ABC1D23", embarque: "lugar estranho", destinoFinal: "outro", paradas: [], validadeHoras: 4 }, {
    acharVeiculo: async () => ({ id: "v1", plate: "ABC1D23" }), geocode: async () => null, agora: () => new Date(), novoId: () => "e".repeat(64), normalizar: async () => null });
  const t = JSON.parse(env.TRACK_KV.m.get(`track:${"e".repeat(64)}`).v);
  assert.equal(t.modo, "simples");
});
```

- [ ] **Passo 2:** `node --test tests/api-links.test.mjs` → FAIL.
- [ ] **Passo 3: implementação** (trechos novos; manter o resto do arquivo)

```js
import { normalizarEnderecos } from "./normalizar.mjs";
import { trajetoConfiavel } from "./confianca.mjs";

const FOTO_MAX = 200 * 1024;
const bytesDoBase64 = (b64) => Math.floor((b64.replace(/=+$/, "").length * 3) / 4);

// dentro de validarPedido, antes do return:
const paradas = Array.isArray(body.paradas) ? body.paradas.map(texto).filter(Boolean).slice(0, 8) : [];
const foto = (v) => (typeof v === "string" && v ? v : null);
const motorista = body.motorista ? { nome: texto(body.motorista.nome), telefone: texto(body.motorista.telefone), fotoBase64: foto(body.motorista.fotoBase64) } : null;
const veiculo = { fotoBase64: foto(body.veiculo?.fotoBase64) };
for (const f of [motorista?.fotoBase64, veiculo.fotoBase64]) if (f && bytesDoBase64(f) > FOTO_MAX) return { erro: "foto acima de 200 KB" };
// incluir paradas, observacoes: texto(body.observacoes), motorista, veiculo em `dados`

async function etapasDoPedido(dados, deps) {
  const n = await deps.normalizar({ saida: dados.embarque, paradas: dados.paradas, destino: dados.destinoFinal, observacoes: dados.observacoes });
  const brutas = n?.etapas ?? [
    { tipo: "saida", consulta: dados.embarque, rotulo: dados.embarque },
    ...dados.paradas.map((p) => ({ tipo: "parada", consulta: p, rotulo: p })),
    ...(dados.destinoFinal ? [{ tipo: "destino", consulta: dados.destinoFinal, rotulo: dados.destinoFinal }] : [])
  ];
  const geo = [];
  for (const e of brutas) geo.push(await geocodeTolerante(e.consulta, deps.geocode)); // em série: Nominatim pede 1 req/s
  const etapas = brutas.map((e, i) => (geo[i] ? { tipo: e.tipo, rotulo: e.rotulo, ...geo[i] } : null));
  const modo = trajetoConfiavel(etapas, n ? n.confianca : null) ? "completo" : "simples";
  return { etapas: etapas.filter(Boolean), modo };
}

// criarLink: substituir os dois geocodeTolerante por:
const { etapas, modo } = await etapasDoPedido(dados, deps);
const destino = etapas.find((e) => e.tipo === "saida") ?? null;
const destinoFinal = etapas.findLast((e) => e.tipo === "destino") ?? null;
const ttl = { expirationTtl: Math.round(dados.validadeHoras * 3600) };
const fotos = { motorista: dados.motorista?.fotoBase64, veiculo: dados.veiculo?.fotoBase64 };
for (const [qual, b64] of Object.entries(fotos)) if (b64) await env.TRACK_KV.put(`foto:${id}:${qual}`, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), ttl);
// no JSON gravado, além dos campos atuais:
//   etapas, modo,
//   motorista: dados.motorista ? { nome: dados.motorista.nome, telefone: dados.motorista.telefone, temFoto: Boolean(fotos.motorista) } : null,
//   veiculoTemFoto: Boolean(fotos.veiculo)

// rotaApiLinks: deps.normalizar = (t) => normalizarEnderecos(t, { chave: env.ANTHROPIC_API_KEY_ACOMPANHAMENTO })
```

- [ ] **Passo 4:** `pnpm test` → PASS. **Passo 5:** commit `feat(link): etapas, modo de confiança, motorista e fotos na criação do link`.

### Tarefa A5: `POST /api/links/<id>/concluir`

**Arquivos:** modificar `src/api-links.mjs` (`rotaApiLinks`, nova `concluirLink`); testes em `tests/api-links.test.mjs`.

**Interfaces:** produz `concluirLink(request, env, id, agora = new Date())` → `Response` 200 `{ concluido: true }`, 401, 400, 404. Grava `concluidoEm`, `concluidoPor: "dataverse"` e TTL de 2 h (`foto:*` regravadas com o mesmo TTL).

- [ ] **Passo 1: teste**

```js
test("concluir: auth, id, 404 e marca concluído com TTL de 2 h", async () => {
  const env = { TRACK_KV: kv(), LINK_API_SECRET: "s" };
  const id = "a".repeat(64);
  const req = (auth) => new Request(`https://w/api/links/${id}/concluir`, { method: "POST", headers: { Authorization: `Bearer ${auth}` } });
  assert.equal((await concluirLink(req("x"), env, id)).status, 401);
  assert.equal((await concluirLink(req("s"), env, "zz")).status, 400);
  assert.equal((await concluirLink(req("s"), env, id)).status, 404);
  await env.TRACK_KV.put(`track:${id}`, JSON.stringify({ placa: "ABC1D23" }));
  const r = await concluirLink(req("s"), env, id, new Date("2026-10-22T12:00:00Z"));
  assert.equal(r.status, 200);
  const g = env.TRACK_KV.m.get(`track:${id}`);
  assert.equal(JSON.parse(g.v).concluidoPor, "dataverse");
  assert.equal(g.o.expirationTtl, 7200);
});
```

- [ ] **Passo 2:** FAIL. **Passo 3:**

```js
export async function concluirLink(request, env, id, agora = new Date()) {
  if (!autorizado(request, env.LINK_API_SECRET)) return Response.json({ erro: "não autorizado" }, { status: 401 });
  if (!ID_LINK.test(id)) return Response.json({ erro: "id inválido" }, { status: 400 });
  const raw = await env.TRACK_KV.get(`track:${id}`);
  if (!raw) return Response.json({ erro: "link não encontrado" }, { status: 404 });
  const t = JSON.parse(raw);
  t.concluidoEm ??= agora.toISOString();
  t.concluidoPor = "dataverse";
  const ttl = { expirationTtl: 7200 };
  await env.TRACK_KV.put(`track:${id}`, JSON.stringify(t), ttl);
  for (const qual of ["motorista", "veiculo"]) {
    const f = await env.TRACK_KV.get(`foto:${id}:${qual}`, "arrayBuffer");
    if (f) await env.TRACK_KV.put(`foto:${id}:${qual}`, f, ttl);
  }
  return Response.json({ concluido: true });
}
// rotaApiLinks, antes do match de DELETE:
const c = url.pathname.match(/^\/api\/links\/([^/]+)\/concluir$/);
if (c) return request.method === "POST" ? concluirLink(request, env, c[1]) : new Response("Método não permitido", { status: 405 });
```

O KV falso do teste precisa aceitar `get(k, "arrayBuffer")` (ignorar o 2º argumento).

- [ ] **Passo 4:** PASS. **Passo 5:** commit `feat(link): endpoint concluir para o Dataverse encerrar o link`.

### Tarefa A6: resposta de posição com etapas, fase e ETA confiável; rota das fotos

**Arquivos:** modificar `src/worker.mjs` (`dadosAcompanhamento`, roteamento de `/r/<id>/foto/<qual>`); criar `tests/worker-dados.test.mjs` só para as funções puras extraídas.

**Interfaces:**
- Consome: `avancarEtapas`, `faseDasEtapas` (A3).
- Produz: `etaVisivel({ modo, fase, rota, posFixTime, agora })` → `number|null` (minutos), exportada de `src/etapas.mjs`.
- JSON de `/r/<id>/dados` ganha: `modo`, `etapas: [{ tipo, rotulo, lat, lon, visitada, atual }]` (só no modo completo), `fase` (`null` no simples, exceto `"concluido"`), `etaMin`, `motorista: { nome, telefone, foto: "/r/<id>/foto/motorista"|null }`, `veiculo: { ..., foto: "/r/<id>/foto/veiculo"|null }`.
- Link antigo (sem `etapas`): mantém a lógica atual de `worker.mjs:96-114`.
- `concluidoPor === "dataverse"` → `fase: "concluido"` sem consultar a Infleet.

- [ ] **Passo 1: teste de `etaVisivel`** (em `tests/etapas.test.mjs`)

```js
import { etaVisivel } from "../src/etapas.mjs";
const agora = new Date("2026-10-22T12:00:00Z");
test("ETA só com TomTom, posição recente, modo completo e fase a caminho/em viagem", () => {
  const base = { modo: "completo", fase: "a_caminho", rota: { fonte: "tomtom", segundos: 725 }, posFixTime: "2026-10-22T11:58:30Z", agora };
  assert.equal(etaVisivel(base), 13);
  assert.equal(etaVisivel({ ...base, rota: { fonte: "osrm", segundos: 725 } }), null);
  assert.equal(etaVisivel({ ...base, posFixTime: "2026-10-22T11:56:00Z" }), null);
  assert.equal(etaVisivel({ ...base, modo: "simples" }), null);
  assert.equal(etaVisivel({ ...base, fase: "no_local" }), null);
});
```

Antes, confira o nome do campo de duração em `rotaTomTom` (`src/infleet.mjs:29-40`) e use o mesmo no teste e na função.

- [ ] **Passo 2:** FAIL. **Passo 3:**

```js
export const POSICAO_MAX_MS = 3 * 60000;
export function etaVisivel({ modo, fase, rota, posFixTime, agora }) {
  if (modo !== "completo" || !["a_caminho", "em_viagem"].includes(fase)) return null;
  if (rota?.fonte !== "tomtom" || !Number.isFinite(rota.segundos)) return null;
  if (!posFixTime || agora - new Date(posFixTime) > POSICAO_MAX_MS) return null;
  return Math.max(1, Math.round(rota.segundos / 60));
}
```

Em `dadosAcompanhamento`: se `t.etapas`, chamar `avancarEtapas(t.etapas, pos, quando)`, gravar o KV quando mudar (mesmo padrão de `JSON.stringify(e) !== ...` da linha 105), `faseDasEtapas(t.etapas, t.concluidoPor === "dataverse")`, alvo da rota = `t.etapas[atual]`, e montar o JSON acima. Modo simples: não calcula rota e devolve `fase` só quando `"concluido"`. Rota `/r/<id>/foto/(motorista|veiculo)`: `env.TRACK_KV.get(..., "arrayBuffer")` → `image/jpeg`, `Cache-Control: private, max-age=300`, `X-Robots-Tag: noindex`; ausente → 404.

- [ ] **Passo 4:** `pnpm test` e `pnpm check` → PASS. **Passo 5:** commit `feat(link): fase por etapas, ETA só quando confiável e rota das fotos`.

### Tarefa A7: interface da página (`src/pagina.mjs`)

**Arquivos:** modificar `src/pagina.mjs`.

Ler `DESIGN_SYSTEM.md` e `design-tokens.json` do diretório pai antes (regra do `CLAUDE.md`). Sem gradiente, tema só claro. Preservar o layout e as correções da v0.0.15/0.0.16 (painel e bloco Saída/Destino).

- [ ] **Passo 1:** mapa: linha do trajeto (polyline da rota atual) e marcadores numerados por etapa; atual em azul de status, visitadas em cinza, futuras em contorno.
- [ ] **Passo 2:** painel: linha de status + "Chega em ~N min" (só se `etaMin`) → lista de etapas (rótulo, marcador "Agora" na atual, check nas visitadas) → cartão do motorista (foto ou iniciais, nome, botões "Ligar" `tel:` e "WhatsApp" `https://wa.me/55<número>`) → cartão do veículo (foto ou ícone, modelo, cor, placa).
- [ ] **Passo 3:** modo simples: esconde status, ETA e etapas; mostra carro + cartões. `fase: "concluido"`: tela "Serviço concluído" e para o polling.
- [ ] **Passo 4:** sem telefone corporativo: botões usam `CENTRAL_TELEFONE`/`CENTRAL_WHATSAPP` (já vêm em `config`).
- [ ] **Passo 5:** `pnpm dev` (porta 51734) com um link criado contra mock e conferir no navegador interno em 375 px e 1280 px: modo completo, modo simples, sem fotos, concluído. Console sem erros.
- [ ] **Passo 6:** commit `feat(link): etapas no mapa, cartões de motorista e veículo`.

### Tarefa A8: secret e publicação do Worker

- [ ] **Passo 1:** em `scripts/`, criar `configurar-anthropic.ps1` copiando o padrão de `configurar-tomtom.ps1` (lê a chave sem eco e roda `wrangler secret put ANTHROPIC_API_KEY_ACOMPANHAMENTO`); adicionar `"segredo:anthropic"` no `package.json`. O Renan roda e cola a chave.
- [ ] **Passo 2:** README: secret novo, endpoint `/concluir`, campos novos do payload.
- [ ] **Passo 3:** `pnpm test && pnpm check`, rodar `qualidade-antes-do-pr`, PR, merge, `pnpm push`. Conferir a versão no rodapé do link.
- [ ] **Passo 4:** prova com payload antigo (o plugin atual): gerar link da OS-10525 no DEV → abre, modo calculado pelo Haiku sobre o texto cru.

---

## Parte B — Plugin (`C:\Users\mendo\Desktop\vscode\App Motoristas`, `plugins/DriverRecordSharing`)

Só depois da A8 publicada. Branch `feat/link-motorista-veiculo`.

### Tarefa B1: payload com paradas, telefone e fotos

**Arquivos:** modificar `GenerateTrackingLinkPlugin.cs`, `PluginConfig.cs` (nomes de colunas); criar `TrackingLinkPayload.cs` (montagem pura do JSON); testes em `DriverRecordSharing.Tests/TrackingLinkPayloadTests.cs`.

- [ ] **Passo 1:** conferir na metadata do DEV (Web API com `az account get-access-token`): colunas de paradas em `cr40f_reservadeveculos`, `cr40f_telefonecorporativo` e `cr40f_foto` (imagem: ler `cr40f_foto_url` ou a miniatura `cr40f_foto`) em `cr40f_funcionarios`; registrar os nomes em `PluginConfig`.
- [ ] **Passo 2:** teste xUnit de `TrackingLinkPayload.Build(...)`: inclui `paradas` sem vazias, `motorista.telefone`, `fotoBase64` só quando ≤ 200 KB (acima: omite e registra trace "foto do motorista acima do limite"), payload antigo continua igual quando não há dados novos.
- [ ] **Passo 3:** implementar `Build` e usar no plugin. Foto do motorista: miniatura da coluna de imagem (já vem reduzida pelo Dataverse).
- [ ] **Passo 4:** foto do veículo: chamar por HTTP o mesmo Flow "listar/baixar" do SharePoint que a Frota usa (`SP_VARS` em `apps/shell/src/pages/frota/data/sharepoint.ts` do Sistema Betinhos dá os nomes das variáveis de ambiente), escolher a principal pela mesma regra de `escolherPrincipal`, reduzir para no máximo 640 px (System.Drawing) e só enviar se ≤ 200 KB. Falha ou timeout de 10 s → sem foto, link gerado mesmo assim.
- [ ] **Passo 5:** `dotnet test` → PASS. Commit `feat(link): envia paradas, telefone corporativo e fotos ao Worker`.

### Tarefa B2: Dataverse encerra o link no Concluído

**Arquivos:** modificar `RevokeTrackingLinkPlugin.cs`, `TrackingLinkRevocation.cs`; testes em `TrackingLinkRevocationTests.cs`.

- [ ] **Passo 1:** confirmar na metadata o valor de `cr40f_status` = Concluído e quais status existem entre Programado e Concluído. **Atenção:** hoje o plugin revoga em qualquer saída de Programado (202410005). Se a operação usa um status "Em andamento", o link some no meio da viagem: nesse caso, revogar só em Cancelado e concluir só em Concluído. Levar essa resposta ao Renan antes de mudar.
- [ ] **Passo 2:** teste: status Concluído → ação `Concluir` (URL `<url>/<id>/concluir`, POST); Cancelado → `Revogar` (DELETE, como hoje); demais → nenhuma ação (se confirmado no passo 1).
- [ ] **Passo 3:** implementar; em sucesso de Concluir, **não** limpar `new_linkacompanhamento` (o cliente ainda vê "Serviço concluído" por 2 h); 404 conta como sucesso.
- [ ] **Passo 4:** `dotnet test` → PASS; `scripts/push-dev.ps1` (só DEV). Commit `feat(link): concluir no Dataverse encerra o link no Worker`.

### Tarefa B3: prova ponta a ponta no DEV

- [ ] Gerar link da OS-10525 pela Operacional no DEV → mapa com etapas certas, foto e telefone do motorista, foto do veículo.
- [ ] Mudar a reserva para Concluído no DEV → link mostra "Serviço concluído" na próxima atualização.
- [ ] Reserva com endereço ambíguo de teste → modo simples.
- [ ] Logs do plugin e do Worker (`wrangler tail`) sem segredo, telefone completo ou base64.
- [ ] Atualizar/criar skill `verificar-link-acompanhamento` (via `verificacao-criar`) no repo do Worker com este roteiro.

---

## Ordem e dependências

A1, A2 e A3 são independentes → A4 → A5 → A6 → A7 → A8 → B1 → B2 → B3. PROD fica fora: o PROD está congelado até o checklist (memória `prod-espera-checklist`).

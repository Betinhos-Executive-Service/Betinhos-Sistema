# Rota mais assertiva — plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos com checkbox (`- [ ]`).

**Objetivo:** a rota do link de acompanhamento parar de "viajar" em rodovia de pistas separadas e trocar menos de forma brusca.

**Arquitetura:** funções puras novas em `src/movimento.mjs` (as que a página também usa, estilo ES5 porque vão embutidas por `String(fn)`), `src/rota-viva.mjs` (trilha, corte, bom senso e decisão da rota, só servidor) e `src/chegada.mjs` (terminal de aeroporto). `src/infleet.mjs` ganha rumo nos roteadores e o encaixe da posição. `src/worker.mjs` troca `rotaComCache` por `rotaViva`, que junta tudo, registra rota suspeita e monta o diagnóstico. `src/pagina.mjs` desenha o carro sobre a rota, estabiliza o ETA e tem o modo `?debug=1`.

**Stack:** Cloudflare Worker (ESM), `node --test`, MapLibre na página.

**Spec:** `docs/superpowers/specs/2026-11-12-rota-assertiva-design.md`

## Restrições globais

- Testes **nunca** neste PC (8 GB). Rodar `node --test tests/<arquivo>` na máquina Betinhos-Renan (`delegate_task` com `target.environmentId` da máquina) ou deixar o job `testes` do PR rodar. `node --check src/<arquivo>` é leve e pode rodar aqui.
- Funções em `src/movimento.mjs` usadas pela página: `var`, `function`, sem arrow, sem template literal, sem spread, sem `import` de outros módulos; podem chamar outras funções do mesmo arquivo pelo nome se elas também entrarem em `CLIENTE_MOVIMENTO`.
- Nada de coordenada em log. Texto bruto da reserva nunca vai para a resposta.
- Uma escrita a mais no KV por link é proibida: estado da rota fica em `Map` por isolate.
- Publicação só pelo workflow (merge na `main`). Nunca `pnpm push` à mão.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: projeção na linha, carro na rota e ETA estável (`movimento.mjs`)

**Files:**
- Modify: `src/movimento.mjs` (acrescentar no fim)
- Test: `tests/movimento.test.mjs` (acrescentar no fim)

**Interfaces:**
- Produces:
  - `projetarNaLinha(pos, coords) → { indice, lat, lon, distancia, metrosAntes, total } | null` (`coords` `[lon, lat]`; `indice` = início do segmento; `metrosAntes` = metros da linha até o ponto projetado; `total` = comprimento da linha)
  - `carroNaRota(pos, coords, maxM) → { lat, lon }` (projetado se ≤ `maxM`, senão `pos`)
  - `etaEstavel(mostrado, pendente, novo) → { mostrar, pendente }` (objetos ETA com `minutos`)

- [ ] **Step 1: testes que falham** — acrescentar em `tests/movimento.test.mjs` (ajustar o import da linha 3 para incluir `projetarNaLinha, carroNaRota, etaEstavel`):

```js
const linhaLeste = [[p.lon, p.lat], [leste(1000).lon, leste(1000).lat]];

test("projetarNaLinha: ponto 20 m ao norte do meio da linha", () => {
  const meio = leste(500), q = { lat: meio.lat + 20 / 111320, lon: meio.lon };
  const r = projetarNaLinha(q, linhaLeste);
  assert.equal(r.indice, 0);
  assert.ok(Math.abs(r.distancia - 20) < 1);
  assert.ok(Math.abs(r.metrosAntes - 500) < 2);
  assert.ok(Math.abs(r.total - 1000) < 2);
  assert.ok(Math.abs(r.lat - p.lat) < 1e-6);
});

test("projetarNaLinha: prefere o trecho anterior quando um posterior passa quase no mesmo lugar", () => {
  // vai 1 km para leste e volta pela mesma rua 30 m ao norte (retorno)
  const n30 = (q) => ({ lat: q.lat + 30 / 111320, lon: q.lon });
  const ida = [[p.lon, p.lat], [leste(1000).lon, leste(1000).lat]];
  const volta = [[n30(leste(1000)).lon, n30(leste(1000)).lat], [n30(p).lon, n30(p).lat]];
  const r = projetarNaLinha(leste(100), ida.concat(volta));
  assert.equal(r.indice, 0);
});

test("projetarNaLinha: sem linha → null", () => {
  assert.equal(projetarNaLinha(p, null), null);
  assert.equal(projetarNaLinha(p, [[p.lon, p.lat]]), null);
});

test("carroNaRota: encaixa até o limite, mantém acima dele", () => {
  const meio = leste(500);
  const perto = { lat: meio.lat + 20 / 111320, lon: meio.lon }, longe = { lat: meio.lat + 60 / 111320, lon: meio.lon };
  assert.ok(Math.abs(carroNaRota(perto, linhaLeste, 30).lat - p.lat) < 1e-6);
  assert.deepEqual(carroNaRota(longe, linhaLeste, 30), longe);
  assert.deepEqual(carroNaRota(perto, null, 30), perto);
});

test("etaEstavel: pequenas variações passam, salto só com confirmação", () => {
  const e = (m) => ({ minutos: m });
  assert.deepEqual(etaEstavel(null, null, e(40)), { mostrar: e(40), pendente: null });
  assert.deepEqual(etaEstavel(e(40), null, e(38)), { mostrar: e(38), pendente: null });
  const salto = etaEstavel(e(40), null, e(58));
  assert.deepEqual(salto, { mostrar: e(40), pendente: e(58) });
  assert.deepEqual(etaEstavel(e(40), e(58), e(57)), { mostrar: e(57), pendente: null });
  assert.deepEqual(etaEstavel(e(40), e(58), e(41)), { mostrar: e(41), pendente: null });
  assert.deepEqual(etaEstavel(e(40), null, null), { mostrar: null, pendente: null });
});
```

- [ ] **Step 2: rodar e ver falhar** — `node --test tests/movimento.test.mjs` (Betinhos-Renan ou CI). Esperado: `projetarNaLinha is not a function`.

- [ ] **Step 3: implementar** — acrescentar no fim de `src/movimento.mjs`:

```js
/**
 * Projeção de `pos` na linha (coords [lon, lat]) em metros locais. Um trecho posterior só ganha de um anterior se
 * estiver 10 m mais perto: num retorno a volta passa a poucos metros da ida e o carro continua na ida.
 */
export function projetarNaLinha(pos, coords) {
  if (!pos || !coords || coords.length < 2) return null;
  var kx = 111320 * Math.cos(pos.lat * Math.PI / 180), ky = 111320;
  var melhor = null, acum = 0;
  for (var i = 0; i < coords.length - 1; i++) {
    var ax = (coords[i][0] - pos.lon) * kx, ay = (coords[i][1] - pos.lat) * ky;
    var bx = (coords[i + 1][0] - pos.lon) * kx, by = (coords[i + 1][1] - pos.lat) * ky;
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, seg = Math.sqrt(l2);
    var t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    var px = ax + t * dx, py = ay + t * dy, d = Math.sqrt(px * px + py * py);
    if (!melhor || d < melhor.distancia - 10) melhor = { indice: i, lon: pos.lon + px / kx, lat: pos.lat + py / ky, distancia: d, metrosAntes: acum + t * seg };
    acum += seg;
  }
  melhor.total = acum;
  return melhor;
}

/** Posição do carro desenhada sobre a rota quando o GPS está a até `maxM` dela; senão a posição crua. */
export function carroNaRota(pos, coords, maxM) {
  var r = projetarNaLinha(pos, coords);
  return r && r.distancia <= maxM ? { lat: r.lat, lon: r.lon } : pos;
}

/**
 * ETA que não pula: variação acima de max(3 min, 25 %) do mostrado só entra se a leitura seguinte confirmar
 * (ficar perto da pendente). Devolve o que mostrar e a pendente.
 */
export function etaEstavel(mostrado, pendente, novo) {
  if (!novo) return { mostrar: null, pendente: null };
  if (!mostrado) return { mostrar: novo, pendente: null };
  var perto = function (a, b) { return Math.abs(a.minutos - b.minutos) <= Math.max(3, b.minutos * 0.25); };
  if (perto(novo, mostrado)) return { mostrar: novo, pendente: null };
  if (pendente && perto(novo, pendente)) return { mostrar: novo, pendente: null };
  return { mostrar: mostrado, pendente: novo };
}
```

(`etaEstavel` usa função anônima com `function`, permitida; nada de arrow.)

- [ ] **Step 4: rodar e ver passar** — `node --test tests/movimento.test.mjs`. Esperado: tudo PASS.
- [ ] **Step 5: commit** — `git add src/movimento.mjs tests/movimento.test.mjs && git commit -m "feat(rota): projeção na linha, carro na rota e ETA estável"`

---

### Task 2: trilha confiável e rumo (`rota-viva.mjs`)

**Files:**
- Create: `src/rota-viva.mjs`
- Create: `tests/rota-viva.test.mjs`
- Modify: `package.json` (script `check`: acrescentar `&& node --check src/rota-viva.mjs && node --check src/chegada.mjs`)

**Interfaces:**
- Consumes: `metrosEntre`, `rumo` de `src/movimento.mjs`.
- Produces:
  - `leituraConfiavel(anterior, atual, agoraMs) → boolean` (leituras `{ lat, lon, fixTime }`)
  - `registrarNaTrilha(trilha, leitura, agoraMs) → { pontos: Leitura[], rejeitada: Leitura | null }` (no máximo 8 pontos)
  - `rumoDaTrilha(pontos) → { rumo, velocidadeKmh } | null`

- [ ] **Step 1: testes que falham** — `tests/rota-viva.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { leituraConfiavel, registrarNaTrilha, rumoDaTrilha } from "../src/rota-viva.mjs";

// Dutra em Guarulhos, sentido oeste (São Paulo): longitude diminui
const base = { lat: -23.4440, lon: -46.4350 };
const oeste = (m) => ({ lat: base.lat, lon: base.lon - m / (111320 * Math.cos(base.lat * Math.PI / 180)) });
const T0 = Date.parse("2026-11-12T19:00:00Z");
const leitura = (m, s) => ({ ...oeste(m), fixTime: new Date(T0 + s * 1000).toISOString() });

test("leituraConfiavel: aceita andar normal e recusa coordenada inválida, futuro, fora de ordem e salto", () => {
  const a = leitura(0, 0);
  assert.equal(leituraConfiavel(null, a, T0), true);
  assert.equal(leituraConfiavel(a, leitura(400, 20), T0 + 20000), true);          // 72 km/h
  assert.equal(leituraConfiavel(a, { lat: NaN, lon: 1, fixTime: a.fixTime }, T0), false);
  assert.equal(leituraConfiavel(null, { lat: 0, lon: 0, fixTime: a.fixTime }, T0), false);
  assert.equal(leituraConfiavel(null, leitura(0, 600), T0), false);                // 10 min no futuro
  assert.equal(leituraConfiavel(leitura(0, 30), leitura(100, 10), T0 + 30000), false);
  assert.equal(leituraConfiavel(a, leitura(5000, 20), T0 + 20000), false);        // 900 km/h
  assert.equal(leituraConfiavel(a, leitura(200, 0), T0), true);                   // salto pequeno sempre passa
});

test("registrarNaTrilha: acumula até 8, ignora repetida e recomeça com duas ruins coerentes", () => {
  let t = { pontos: [], rejeitada: null };
  for (let i = 0; i < 10; i++) t = registrarNaTrilha(t, leitura(i * 300, i * 15), T0 + i * 15000);
  assert.equal(t.pontos.length, 8);
  const igual = registrarNaTrilha(t, t.pontos.at(-1), T0 + 200000);
  assert.equal(igual, t);
  const ultima = t.pontos.at(-1);
  const pulo = { ...oeste(60000), fixTime: new Date(Date.parse(ultima.fixTime) + 15000).toISOString() };
  t = registrarNaTrilha(t, pulo, T0 + 200000);
  assert.equal(t.pontos.at(-1), ultima);
  assert.equal(t.rejeitada, pulo);
  const seguinte = { ...oeste(60300), fixTime: new Date(Date.parse(pulo.fixTime) + 15000).toISOString() };
  t = registrarNaTrilha(t, seguinte, T0 + 215000);
  assert.deepEqual(t.pontos, [pulo, seguinte]);
  assert.equal(t.rejeitada, null);
});

test("rumoDaTrilha: oeste ≈ 270° a 72 km/h; parado ou sem janela → null", () => {
  const r = rumoDaTrilha([leitura(0, 0), leitura(200, 10), leitura(400, 20)]);
  assert.ok(Math.abs(r.rumo - 270) < 1);
  assert.ok(Math.abs(r.velocidadeKmh - 72) <= 1);
  assert.equal(rumoDaTrilha([leitura(0, 0), leitura(10, 60)]), null);               // < 40 m
  assert.equal(rumoDaTrilha([leitura(0, 0), leitura(50, 60)]), null);               // 3 km/h
  assert.equal(rumoDaTrilha([leitura(0, 0), leitura(2000, 400)]), null);            // fora da janela de 3 min
  assert.equal(rumoDaTrilha([leitura(0, 0)]), null);
});
```

- [ ] **Step 2: rodar e ver falhar** — `node --test tests/rota-viva.test.mjs`. Esperado: módulo não encontrado.

- [ ] **Step 3: implementar** — `src/rota-viva.mjs`:

```js
// Rota "viva" do link: trilha de leituras confiáveis, rumo do carro, corte da rota pela posição,
// teste de bom senso e a decisão de manter, recalcular ou esperar confirmação. Funções puras (testadas em Node);
// o estado fica no worker, em Map por isolate.
import { metrosEntre, rumo as rumoEntre, giro, projetarNaLinha } from "./movimento.mjs";

const SALTO_MIN_M = 300;          // abaixo disso nunca é salto
const VELOCIDADE_MAX_KMH = 200;   // acima disso entre duas leituras é GPS ruim
const FUTURO_MAX_MS = 120000;
const TRILHA_MAX = 8;
const RUMO_JANELA_MS = 3 * 60000;
const RUMO_MIN_M = 40;
export const VEL_MIN_RUMO_KMH = 10;

const valida = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && !(Math.abs(p.lat) < 0.01 && Math.abs(p.lon) < 0.01);

/** Leitura nova é aceitável depois de `anterior` (null = primeira). */
export function leituraConfiavel(anterior, atual, agoraMs) {
  if (!valida(atual)) return false;
  const fix = Date.parse(atual.fixTime);
  if (Number.isFinite(fix) && fix > agoraMs + FUTURO_MAX_MS) return false;
  if (!anterior) return true;
  const fixAnt = Date.parse(anterior.fixTime);
  if (Number.isFinite(fix) && Number.isFinite(fixAnt) && fix < fixAnt) return false;
  const m = metrosEntre(anterior, atual);
  if (m <= SALTO_MIN_M) return true;
  const h = (fix - fixAnt) / 3600e3;
  return h > 0 && m / 1000 / h <= VELOCIDADE_MAX_KMH;
}

/** Acrescenta a leitura à trilha se confiável. Duas rejeitadas coerentes entre si recomeçam a trilha. */
export function registrarNaTrilha(trilha, leitura, agoraMs) {
  const pontos = trilha?.pontos ?? [];
  const ultima = pontos.at(-1) ?? null;
  if (ultima && leitura && leitura.fixTime === ultima.fixTime) return trilha;
  if (leituraConfiavel(ultima, leitura, agoraMs)) return { pontos: [...pontos, leitura].slice(-TRILHA_MAX), rejeitada: null };
  const r = trilha?.rejeitada;
  if (r && leitura && r.fixTime !== leitura.fixTime && leituraConfiavel(r, leitura, agoraMs)) return { pontos: [r, leitura], rejeitada: null };
  return { pontos, rejeitada: valida(leitura) ? leitura : null };
}

/** Rumo e velocidade pelas últimas leituras (≥ 40 m, até 3 min); null parado (< 10 km/h) ou sem dados. */
export function rumoDaTrilha(pontos) {
  if (!pontos || pontos.length < 2) return null;
  const fim = pontos.at(-1), tFim = Date.parse(fim.fixTime);
  for (let i = pontos.length - 2; i >= 0; i--) {
    const p = pontos[i], ms = tFim - Date.parse(p.fixTime);
    if (!(ms > 0) || ms > RUMO_JANELA_MS) return null;
    const m = metrosEntre(p, fim);
    if (m >= RUMO_MIN_M) {
      const v = m / 1000 / (ms / 3600e3);
      return v >= VEL_MIN_RUMO_KMH ? { rumo: rumoEntre(p, fim), velocidadeKmh: Math.round(v) } : null;
    }
  }
  return null;
}
```

(`giro` e `projetarNaLinha` já entram no import porque a Task 3 os usa.)

- [ ] **Step 4: rodar e ver passar** — `node --test tests/rota-viva.test.mjs`.
- [ ] **Step 5: commit** — `git add src/rota-viva.mjs tests/rota-viva.test.mjs package.json && git commit -m "feat(rota): trilha de leituras confiáveis e rumo do carro"`

---

### Task 3: corte, bom senso e decisão da rota (`rota-viva.mjs`)

**Files:**
- Modify: `src/rota-viva.mjs` (acrescentar no fim)
- Test: `tests/rota-viva.test.mjs` (acrescentar no fim; ampliar o import)

**Interfaces:**
- Consumes: `projetarNaLinha` (Task 1).
- Produces:
  - `cortarRota(base, pos, limite = 80) → Rota | null` (Rota = `{ km, minutos, atrasoTransitoMin, coords, fonte }`)
  - `avaliarRota(rota, { pos, alvo, rumo }) → string[]` (`"contramao"`, `"volta"`, `"desvio"`)
  - `decidirRota(estado, { pos, fixTime, alvo, alvoChave, agoraMs, perto, rumo }, calcular) → Promise<{ rota, estado, decisao, motivos }>`; `decisao` ∈ `"nova" | "recalculada" | "seguindo" | "fora_aguardando" | "suspeita_aguardando" | "suspeita_aceita" | "sem_rota"`

- [ ] **Step 1: testes que falham** — acrescentar em `tests/rota-viva.test.mjs` (import passa a ser `{ leituraConfiavel, registrarNaTrilha, rumoDaTrilha, cortarRota, avaliarRota, decidirRota }`):

```js
const norte = (q, m) => ({ lat: q.lat + m / 111320, lon: q.lon });
const linha = (...pts) => pts.map((q) => [q.lon, q.lat]);
// Rota boa: 10 km reto para oeste
const boa = { km: 10, minutos: 20, coords: linha(oeste(0), oeste(5000), oeste(10000)), fonte: "tomtom" };
// Rota com retorno: 1 km para leste, volta pela outra pista (40 m ao norte) e segue 10 km para oeste
const leste1 = { lat: base.lat, lon: base.lon + 1000 / (111320 * Math.cos(base.lat * Math.PI / 180)) };
const comRetorno = { km: 12, minutos: 26, coords: linha(oeste(0), leste1, norte(leste1, 40), norte(oeste(0), 40), norte(oeste(10000), 40)), fonte: "tomtom" };

test("cortarRota: corta na projeção e reduz km e minutos na proporção", () => {
  const r = cortarRota(boa, norte(oeste(2500), 20));
  assert.ok(Math.abs(r.km - 7.5) < 0.1);
  assert.equal(r.minutos, 15);
  assert.ok(Math.abs(r.coords[0][0] - oeste(2500).lon) < 1e-5);
  assert.equal(r.coords.length, 3);
  assert.equal(cortarRota(boa, norte(oeste(2500), 200)), null);
  assert.equal(cortarRota(null, base), null);
});

test("avaliarRota: retorno e contramão; rota boa passa", () => {
  const alvo = oeste(10000);
  assert.deepEqual(avaliarRota(boa, { pos: oeste(0), alvo, rumo: 270 }), []);
  const m = avaliarRota(comRetorno, { pos: oeste(0), alvo, rumo: 270 });
  assert.ok(m.includes("contramao"));
  assert.ok(m.includes("volta"));
  assert.deepEqual(avaliarRota(comRetorno, { pos: oeste(0), alvo, rumo: null }), ["volta"]);
});

test("avaliarRota: desvio quando a rota passa de 2,5× a reta", () => {
  const longa = { ...boa, km: 30 };
  assert.deepEqual(avaliarRota(longa, { pos: oeste(0), alvo: oeste(10000), rumo: null }), ["desvio"]);
  assert.deepEqual(avaliarRota(longa, { pos: oeste(0), alvo: oeste(1000), rumo: null }).includes("desvio"), false); // reta < 2 km
});

const fix = (s) => new Date(T0 + s * 1000).toISOString();
const entrada = (pos, s, extra = {}) => ({ pos, fixTime: fix(s), alvo: oeste(10000), alvoChave: "fim", agoraMs: T0 + s * 1000, perto: false, rumo: 270, ...extra });
const contador = (...rotas) => { const f = async () => { f.n++; return rotas.shift() ?? null; }; f.n = 0; return f; };

test("decidirRota: primeira rota é calculada; depois segue cortando sem chamar o roteador", async () => {
  const calc = contador(boa);
  const r1 = await decidirRota(null, entrada(oeste(0), 0), calc);
  assert.equal(r1.decisao, "nova");
  const r2 = await decidirRota(r1.estado, entrada(oeste(1000), 30), calc);
  assert.equal(r2.decisao, "seguindo");
  assert.equal(calc.n, 1);
  assert.ok(r2.rota.km < 10);
});

test("decidirRota: fora da rota só recalcula na segunda leitura diferente", async () => {
  const calc = contador(boa, boa);
  const { estado } = await decidirRota(null, entrada(oeste(0), 0), calc);
  const fora = norte(oeste(1000), 300);
  const a = await decidirRota(estado, entrada(fora, 30), calc);
  assert.equal(a.decisao, "fora_aguardando");
  const mesma = await decidirRota(a.estado, entrada(fora, 30), calc);
  assert.equal(mesma.decisao, "fora_aguardando");
  const b = await decidirRota(mesma.estado, entrada(norte(oeste(1300), 300), 45), calc);
  assert.equal(b.decisao, "recalculada");
  assert.equal(calc.n, 2);
});

test("decidirRota: rota com retorno espera confirmação e mantém a anterior", async () => {
  const calc = contador(boa, comRetorno, comRetorno);
  const { estado } = await decidirRota(null, entrada(oeste(0), 0), calc);
  // rota velha (4 min) força o recálculo, que volta com retorno
  const a = await decidirRota(estado, entrada(oeste(500), 250), calc);
  assert.equal(a.decisao, "suspeita_aguardando");
  assert.equal(a.rota.coords.at(-1)[0], boa.coords.at(-1)[0]);
  const repetida = await decidirRota(a.estado, entrada(oeste(500), 250), calc);
  assert.equal(repetida.decisao, "suspeita_aguardando");
  assert.equal(calc.n, 2);
  const b = await decidirRota(repetida.estado, entrada(oeste(700), 265), calc);
  assert.equal(b.decisao, "suspeita_aceita");
  assert.deepEqual(b.motivos.includes("volta"), true);
});

test("decidirRota: alvo novo descarta o estado; roteador fora devolve a última exibida", async () => {
  const calc = contador(boa, null);
  const { estado } = await decidirRota(null, entrada(oeste(0), 0), calc);
  const r = await decidirRota(estado, entrada(oeste(0), 10, { alvoChave: "etapa2" }), calc);
  assert.equal(r.decisao, "sem_rota");
  assert.equal(r.rota, null);
});
```

- [ ] **Step 2: rodar e ver falhar** — `node --test tests/rota-viva.test.mjs`. Esperado: `cortarRota is not a function`.

- [ ] **Step 3: implementar** — acrescentar em `src/rota-viva.mjs`:

```js
export const LIMITE_NA_ROTA_M = 80;
const LEITURAS_FORA = 2;
const IDADE_PERTO_MS = 120000;
const IDADE_LONGE_MS = 240000;
const ANTERIOR_SERVE_M = 150;
const CONTRAMAO_GRAUS = 120;
const VOLTA_JANELA_M = 5000, VOLTA_AFASTA_M = 500, VOLTA_RETORNA_M = 200;
const DESVIO_FATOR = 2.5, DESVIO_RETA_MIN_M = 2000;

/** Rota a partir da projeção do carro; km e minutos na proporção do que falta. null se o carro está fora dela. */
export function cortarRota(base, pos, limite = LIMITE_NA_ROTA_M) {
  const p = base?.coords && pos ? projetarNaLinha(pos, base.coords) : null;
  if (!p || p.distancia > limite || !(p.total > 0)) return null;
  const frac = Math.max(0, (p.total - p.metrosAntes) / p.total);
  return {
    ...base,
    coords: [[p.lon, p.lat], ...base.coords.slice(p.indice + 1)],
    km: Number.isFinite(base.km) ? Math.round(base.km * frac * 10) / 10 : base.km,
    minutos: Number.isFinite(base.minutos) ? Math.max(1, Math.round(base.minutos * frac)) : base.minutos,
  };
}

/** Motivos para desconfiar da rota: começa contra o rumo, faz retorno no começo, ou é longa demais. */
export function avaliarRota(rota, { pos, alvo, rumo }) {
  const motivos = [];
  const pts = (rota?.coords ?? []).map(([lon, lat]) => ({ lat, lon }));
  if (pts.length < 2 || !pos) return motivos;
  if (rumo != null) {
    const inicio = pts.find((q) => metrosEntre(pts[0], q) >= 50);
    if (inicio && Math.abs(giro(rumo, rumoEntre(pts[0], inicio))) > CONTRAMAO_GRAUS) motivos.push("contramao");
  }
  let andado = 0, afastou = false;
  for (let i = 1; i < pts.length && andado <= VOLTA_JANELA_M; i++) {
    andado += metrosEntre(pts[i - 1], pts[i]);
    const d = metrosEntre(pts[0], pts[i]);
    if (d >= VOLTA_AFASTA_M) afastou = true;
    else if (afastou && d <= VOLTA_RETORNA_M) { motivos.push("volta"); break; }
  }
  const reta = alvo ? metrosEntre(pos, alvo) : 0;
  if (reta >= DESVIO_RETA_MIN_M && Number.isFinite(rota.km) && rota.km * 1000 > DESVIO_FATOR * reta) motivos.push("desvio");
  return motivos;
}

const mesmoAlvo = (estado, alvo, alvoChave) => estado && estado.alvoChave === alvoChave && metrosEntre(estado.alvo, alvo) < 50;

/**
 * Decide a rota desta leitura. Segue a rota guardada (cortada) enquanto o carro está nela e ela não envelheceu;
 * fora dela, só recalcula na segunda leitura (fixTime diferente). Rota nova suspeita, com a anterior ainda servindo,
 * espera a próxima leitura confirmar. `calcular()` devolve a rota do roteador ou null.
 */
export async function decidirRota(estado, { pos, fixTime, alvo, alvoChave, agoraMs, perto, rumo }, calcular) {
  let est = mesmoAlvo(estado, alvo, alvoChave) ? estado : null;
  if (est) {
    const corte = cortarRota(est.base, pos);
    const fresca = agoraMs - est.em < (perto ? IDADE_PERTO_MS : IDADE_LONGE_MS);
    if (corte) {
      est = { ...est, fora: 0, exibida: corte, ultimoFix: fixTime };
      if (fresca) return { rota: corte, estado: est, decisao: "seguindo", motivos: [] };
    } else {
      const fora = fixTime !== est.ultimoFix ? est.fora + 1 : est.fora;
      est = { ...est, fora, ultimoFix: fixTime };
      if (fora < LEITURAS_FORA) return { rota: est.exibida, estado: est, decisao: "fora_aguardando", motivos: [] };
    }
    if (est.pendente && est.pendente.fix === fixTime) return { rota: est.exibida, estado: est, decisao: "suspeita_aguardando", motivos: est.pendente.motivos };
  }
  const nova = await calcular();
  if (!nova) return { rota: est?.exibida ?? null, estado: est, decisao: "sem_rota", motivos: [] };
  const motivos = avaliarRota(nova, { pos, alvo, rumo });
  const anterior = est ? projetarNaLinha(pos, est.base.coords) : null;
  if (motivos.length && anterior && anterior.distancia <= ANTERIOR_SERVE_M && !est.pendente) {
    return { rota: est.exibida, estado: { ...est, pendente: { fix: fixTime, motivos } }, decisao: "suspeita_aguardando", motivos };
  }
  const novoEstado = { base: nova, exibida: nova, em: agoraMs, alvo: { lat: alvo.lat, lon: alvo.lon }, alvoChave, fora: 0, ultimoFix: fixTime, pendente: null };
  return { rota: nova, estado: novoEstado, decisao: motivos.length ? "suspeita_aceita" : est ? "recalculada" : "nova", motivos };
}
```

Atenção no teste "alvo novo": com `alvoChave` diferente o estado é descartado, `calcular` devolve `null` e `est` é `null`, então `rota` é `null` (não há "última exibida" para outro alvo). É o comportamento desejado.

- [ ] **Step 4: rodar e ver passar** — `node --test tests/rota-viva.test.mjs`.
- [ ] **Step 5: commit** — `git add src/rota-viva.mjs tests/rota-viva.test.mjs && git commit -m "feat(rota): segue a rota, confirma desvio e desconfia de retorno"`

---

### Task 4: rumo nos roteadores e encaixe da posição (`infleet.mjs`)

**Files:**
- Modify: `src/infleet.mjs` (`rotaTomTom`, `rotaOsrm`, `rotaAte`; nova `encaixarPosicao`)
- Create: `tests/infleet.test.mjs`

**Interfaces:**
- Produces:
  - `rotaAte(origem, destino, chaveTomTom, urls = {}, opcoes = {}) → Promise<Rota | null>`; `opcoes.rumo` (graus) vira `vehicleHeading` no TomTom e `bearings=<rumo>,45;` no OSRM.
  - `encaixarPosicao(pontos, base) → Promise<{ lat, lon, rumo: number | null } | null>` (`pontos` = leituras `{ lat, lon, fixTime }`, usa as 6 últimas, precisa de ≥ 3)

- [ ] **Step 1: testes que falham** — `tests/infleet.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { rotaAte, encaixarPosicao } from "../src/infleet.mjs";

async function comFetch(resposta, fn) {
  const original = globalThis.fetch, urls = [];
  globalThis.fetch = async (u) => { urls.push(String(u)); return new Response(JSON.stringify(typeof resposta === "function" ? resposta(String(u)) : resposta)); };
  try { return { valor: await fn(), urls }; } finally { globalThis.fetch = original; }
}
const o = { lat: -23.444, lon: -46.435 }, d = { lat: -23.43, lon: -46.48 };
const tomtom = { routes: [{ summary: { lengthInMeters: 5000, travelTimeInSeconds: 600, trafficDelayInSeconds: 0 }, legs: [{ points: [{ latitude: o.lat, longitude: o.lon }, { latitude: d.lat, longitude: d.lon }] }] }] };

test("rotaAte manda vehicleHeading ao TomTom só com rumo", async () => {
  const com = await comFetch(tomtom, () => rotaAte(o, d, "k", { tomtom: "https://tt" }, { rumo: 271.6 }));
  assert.match(com.urls[0], /[?&]vehicleHeading=272(&|$)/);
  const sem = await comFetch(tomtom, () => rotaAte(o, d, "k", { tomtom: "https://tt" }));
  assert.doesNotMatch(sem.urls[0], /vehicleHeading/);
});

test("rotaAte manda bearings ao OSRM com rumo", async () => {
  const osrm = { code: "Ok", routes: [{ distance: 5000, duration: 600, geometry: { coordinates: [[o.lon, o.lat], [d.lon, d.lat]] } }] };
  const r = await comFetch(osrm, () => rotaAte(o, d, null, { osrm: "https://os" }, { rumo: 360 }));
  assert.match(r.urls[0], /[?&]bearings=0,45;(&|$)/);
  assert.equal(r.valor.fonte, "osrm");
});

test("encaixarPosicao: último tracepoint e rumo da linha encaixada", async () => {
  const T = Date.parse("2026-11-12T19:00:00Z");
  const pts = [0, 1, 2].map((i) => ({ lat: -23.444, lon: -46.435 - i * 0.002, fixTime: new Date(T + i * 10000).toISOString() }));
  const match = { code: "Ok", tracepoints: [{ location: [-46.435, -23.4442], matchings_index: 0 }, null, { location: [-46.439, -23.4442], matchings_index: 0 }],
    matchings: [{ geometry: { coordinates: [[-46.435, -23.4442], [-46.437, -23.4442], [-46.439, -23.4442]] } }] };
  const r = await comFetch(match, () => encaixarPosicao(pts, "https://os"));
  assert.match(r.urls[0], /\/match\/v1\/driving\//);
  assert.match(r.urls[0], /timestamps=/);
  assert.deepEqual([r.valor.lat, r.valor.lon], [-23.4442, -46.439]);
  assert.ok(Math.abs(r.valor.rumo - 270) < 1);
  assert.equal(await encaixarPosicao(pts.slice(0, 2), "https://os"), null);
  const falha = await comFetch({ code: "NoMatch" }, () => encaixarPosicao(pts, "https://os"));
  assert.equal(falha.valor, null);
});
```

- [ ] **Step 2: rodar e ver falhar** — `node --test tests/infleet.test.mjs`. Esperado: `encaixarPosicao` não exportada.

- [ ] **Step 3: implementar** — em `src/infleet.mjs`:
  - linha 3: `import { metrosEntre, rumo } from "./movimento.mjs";`
  - depois de `ENDPOINT`: `const UA = { "User-Agent": "betinhos-acompanhar-motorista" };` e trocar os dois `{ "User-Agent": "betinhos-acompanhar-motorista" }` existentes por `UA`.
  - helper: `const grau = (r) => ((Math.round(r) % 360) + 360) % 360;`
  - `rotaTomTom(origem, destino, chave, base = "https://api.tomtom.com", rumoCarro = null)`: acrescentar ao fim da URL `+ (rumoCarro != null ? \`&vehicleHeading=${grau(rumoCarro)}\` : "")`.
  - `rotaOsrm(origem, destino, base = "https://router.project-osrm.org", rumoCarro = null)`: acrescentar `+ (rumoCarro != null ? \`&bearings=${grau(rumoCarro)},45;\` : "")` (o `;` deixa o destino sem restrição).
  - `rotaAte`:

```js
export async function rotaAte(origem, destino, chaveTomTom, urls = {}, opcoes = {}) {
  const rumoCarro = Number.isFinite(opcoes.rumo) ? opcoes.rumo : null;
  if (chaveTomTom) {
    try { return await rotaTomTom(origem, destino, chaveTomTom, urls.tomtom, rumoCarro); } catch (e) { console.warn(e.message); }
  }
  try { return await rotaOsrm(origem, destino, urls.osrm, rumoCarro); } catch { return null; }
}
```

  - Atenção: `urls.tomtom`/`urls.osrm` `undefined` precisam cair no padrão; parâmetro com default só vale para `undefined`, e é o caso.
  - nova função, depois de `encaixarNasRuas`:

```js
// Encaixe da posição atual pelas últimas leituras (OSRM Match com horários): três pontos seguidos no mesmo
// sentido não cabem na pista contrária. Devolve o último ponto encaixado e o rumo da linha encaixada nele.
export async function encaixarPosicao(pontos, base = "https://router.project-osrm.org") {
  const pts = (pontos ?? []).slice(-6);
  if (pts.length < 3) return null;
  const ts = pts.map((p) => Math.round(Date.parse(p.fixTime) / 1000));
  if (ts.some((x) => !Number.isFinite(x))) return null;
  const url = `${base}/match/v1/driving/${pts.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";")}` +
    `?geometries=geojson&overview=full&timestamps=${ts.join(";")}&radiuses=${pts.map(() => 30).join(";")}`;
  try {
    const j = await (await fetch(url, { headers: UA })).json();
    const ultimo = j.code === "Ok" ? j.tracepoints?.at(-1) : null;
    if (!ultimo?.location) return null;
    const [lon, lat] = ultimo.location, fim = { lat, lon };
    const geo = j.matchings?.[ultimo.matchings_index]?.geometry?.coordinates ?? [];
    let rumoEnc = null;
    for (let i = geo.length - 1; i >= 0; i--) {
      const q = { lat: geo[i][1], lon: geo[i][0] };
      if (metrosEntre(q, fim) >= 20) { rumoEnc = rumo(q, fim); break; }
    }
    return { lat, lon, rumo: rumoEnc };
  } catch { return null; }
}
```

- [ ] **Step 4: rodar e ver passar** — `node --test tests/infleet.test.mjs tests/etapas.test.mjs tests/worker-dados.test.mjs`.
- [ ] **Step 5: commit** — `git add src/infleet.mjs tests/infleet.test.mjs && git commit -m "feat(rota): rumo do carro no TomTom e no OSRM e encaixe da posição"`

---

### Task 5: chegada no terminal certo (`chegada.mjs` + criação do link)

**Files:**
- Create: `src/chegada.mjs`
- Create: `tests/chegada.test.mjs`
- Modify: `src/api-links.mjs` (função `etapasDoPedido`, os dois `geo.push`/`geo[i] =` que montam a etapa)

**Interfaces:**
- Consumes: `metrosEntre` de `src/movimento.mjs`.
- Produces:
  - `terminalDoTexto(texto, ponto) → { lat, lon } | null`
  - `pontoDeChegada(alvo) → alvo` com `lat/lon` trocados pelo terminal (usa `alvo.chegada`, senão `alvo.rotulo ?? alvo.label`), ou o próprio `alvo`.

- [ ] **Step 1: testes que falham** — `tests/chegada.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { terminalDoTexto, pontoDeChegada } from "../src/chegada.mjs";

const gru = { lat: -23.4356, lon: -46.4731 }; // centro do aeroporto (pátio)

test("terminal do texto em Guarulhos; sem terminal, o T2", () => {
  assert.deepEqual(terminalDoTexto("Aeroporto de Guarulhos T3 - LATAM", gru), { lat: -23.4257371, lon: -46.4740626 });
  assert.deepEqual(terminalDoTexto("GRU terminal 1", gru), { lat: -23.4296966, lon: -46.4893132 });
  assert.deepEqual(terminalDoTexto("Aeroporto de Guarulhos", gru), { lat: -23.4271535, lon: -46.4802039 });
});

test("não troca hotel perto do aeroporto, cidade sem aeroporto nem ponto longe", () => {
  assert.equal(terminalDoTexto("Hotel Pullman GRU", gru), null);
  assert.equal(terminalDoTexto("Rua Dom Pedro II, Guarulhos", gru), null);
  assert.equal(terminalDoTexto("Aeroporto de Guarulhos", { lat: -23.55, lon: -46.63 }), null);
});

test("pontoDeChegada: usa a chegada gravada, senão o rótulo; mantém o resto do alvo", () => {
  const gravada = pontoDeChegada({ ...gru, rotulo: "Destino", chegada: { lat: -23.4257371, lon: -46.4740626 }, area: null });
  assert.deepEqual([gravada.lat, gravada.lon, gravada.rotulo], [-23.4257371, -46.4740626, "Destino"]);
  const peloRotulo = pontoDeChegada({ ...gru, rotulo: "Aeroporto de Guarulhos" });
  assert.equal(peloRotulo.lat, -23.4271535);
  const comum = { lat: -23.2, lon: -45.9, rotulo: "Kenvue" };
  assert.equal(pontoDeChegada(comum), comum);
  assert.equal(pontoDeChegada(null), null);
});
```

- [ ] **Step 2: rodar e ver falhar** — `node --test tests/chegada.test.mjs`.

- [ ] **Step 3: implementar** — `src/chegada.mjs`:

```js
// Ponto de chegada para o roteamento em aeroportos: o centro do aeroporto cai no pátio e a rota termina numa via
// de serviço. O centro do prédio do terminal (OpenStreetMap, aeroway=terminal, consultado em 12/11/2026) faz o
// roteador encaixar no meio-fio do terminal. Só o roteamento usa: "chegou"/"chegando" seguem o ponto geocodificado.
import { metrosEntre } from "./movimento.mjs";

const AEROPORTOS = [
  { texto: /\b(gru|cumbica)\b|aeroporto[^,;]*guarulhos|guarulhos[^,;]*aeroporto/i, padrao: 2,
    terminais: { 1: { lat: -23.4296966, lon: -46.4893132 }, 2: { lat: -23.4271535, lon: -46.4802039 }, 3: { lat: -23.4257371, lon: -46.4740626 } } },
  { texto: /\b(cgh|congonhas)\b/i, padrao: 1, terminais: { 1: { lat: -23.625256, lon: -46.659837 } } },
  { texto: /\b(vcp|viracopos)\b/i, padrao: 1, terminais: { 1: { lat: -23.0075041, lon: -47.148967 } } },
  { texto: /\bsjk\b|urbano ernesto stumpf|aeroporto[^,;]*s[aã]o jos[eé] dos campos/i, padrao: 1, terminais: { 1: { lat: -23.2252881, lon: -45.8615911 } } },
  { texto: /\b(sdu|santos dumont)\b/i, padrao: 1, terminais: { 1: { lat: -22.9129283, lon: -43.1666027 } } },
  { texto: /\b(gig|gale[aã]o)\b/i, padrao: 2, terminais: { 1: { lat: -22.8109475, lon: -43.2511351 }, 2: { lat: -22.8144499, lon: -43.245939 } } },
];
const RAIO_AEROPORTO_M = 4000; // o ponto geocodificado tem de estar no aeroporto, senão o texto engana
const NAO_E_TERMINAL = /\b(hotel|flat|pousada|residencial|condom[ií]nio|estacionamento|hangar|cargas?|pullman|ibis|marriott|tryp)\b/i;
const NUMERO_TERMINAL = /\b(?:terminal|term\.?|t)\s*-?\s*([1-3])\b/i;

/** Terminal do aeroporto citado no texto, se o ponto geocodificado estiver nele; senão null. */
export function terminalDoTexto(texto, ponto) {
  const s = String(texto ?? "");
  if (!s || NAO_E_TERMINAL.test(s) || !ponto || !Number.isFinite(ponto.lat)) return null;
  const a = AEROPORTOS.find((x) => x.texto.test(s));
  if (!a) return null;
  const n = Number(s.match(NUMERO_TERMINAL)?.[1]);
  const t = a.terminais[n] ?? a.terminais[a.padrao];
  return metrosEntre(ponto, t) <= RAIO_AEROPORTO_M ? { lat: t.lat, lon: t.lon } : null;
}

/** Alvo para o roteador: com `chegada` gravada na criação ou terminal pelo rótulo; senão o próprio alvo. */
export function pontoDeChegada(alvo) {
  if (!alvo) return alvo;
  const c = alvo.chegada && Number.isFinite(alvo.chegada.lat) ? alvo.chegada : terminalDoTexto(alvo.rotulo ?? alvo.label, alvo);
  return c ? { ...alvo, lat: c.lat, lon: c.lon } : alvo;
}
```

- Em `src/api-links.mjs`:
  - import: `import { terminalDoTexto } from "./chegada.mjs";`
  - depois de `const brutas = ...` e do loop dos rótulos, acrescentar:

```js
  // Texto para achar o terminal (o bruto não é guardado): rótulo, consulta montada e, com a mesma contagem, o texto original.
  const textoChegada = (i) => [brutas[i].rotulo, montarConsulta(brutas[i].campos), brutas.length === textos.length ? textos[i][1] : null].filter(Boolean).join(" ");
  const comChegada = (g, i) => { const c = terminalDoTexto(textoChegada(i), g); return c ? { ...g, chegada: c } : g; };
```

  - o loop `for (const e of brutas)` passa a ter índice: `for (const [i, e] of brutas.entries())` e o push vira `geo.push(r ? comChegada({ ...r, tipo: e.tipo, rotulo: e.rotulo, label: e.rotulo, rotuloLimpo: true }, i) : null);`
  - na reanálise: `if (g) { geo[i] = comChegada({ ...g, tipo: brutas[i].tipo, rotulo: brutas[i].rotulo, label: brutas[i].rotulo, rotuloLimpo: true }, i); melhorou = true; }`
  - conferir que `chegada` não vaza para a página: `etapasVisiveis` (`src/etapas.mjs`) já lista só `tipo, rotulo, lat, lon, visitada, atual, pulada`. Nada a mudar.

- [ ] **Step 4: rodar e ver passar** — `node --test tests/chegada.test.mjs tests/api-links.test.mjs`.
- [ ] **Step 5: commit** — `git add src/chegada.mjs tests/chegada.test.mjs src/api-links.mjs && git commit -m "feat(rota): chegada no terminal certo em aeroportos"`

---

### Task 6: worker usa a rota viva, registra suspeita e expõe diagnóstico

**Files:**
- Modify: `src/worker.mjs` (imports, constantes de rota, `rotaComCache` → `rotaViva`, `resposta`, `dadosAcompanhamento`, `dadosPorEtapas`, `rotaAcompanhamento`)
- Modify: `wrangler.jsonc` (observability)
- Test: `tests/worker-dados.test.mjs` (acrescentar)

**Interfaces:**
- Consumes: `registrarNaTrilha`, `rumoDaTrilha`, `decidirRota`, `VEL_MIN_RUMO_KMH` (Tasks 2-3); `rotaAte`, `encaixarPosicao` (Task 4); `pontoDeChegada` (Task 5).
- Produces: `/dados` igual ao de hoje e, com `?debug=1`, o campo `diagnostico = { decisao, motivos, rumo, velocidadeKmh, origem, encaixada, trilha }` (`origem`/`encaixada` `{ lat, lon } | null`, `trilha` `[lon, lat][]`).

- [ ] **Step 1: teste que falha** — acrescentar em `tests/worker-dados.test.mjs` (segue o padrão dos testes com `globalThis.fetch` já existentes no arquivo, linhas 100-120):

```js
test("diagnostico só sai com ?debug=1 e a rota usa o terminal do aeroporto", async () => {
  const id = "f".repeat(64);
  const agora = new Date().toISOString();
  const link = { modo: "completo", vehicleId: "v1", expiraEm: "2099-01-01T00:00:00Z",
    etapas: [{ tipo: "saida", lat: -23.44, lon: -46.40, rotulo: "Becooper", saiuEm: agora, chegouEm: agora }, { tipo: "destino", lat: -23.4356, lon: -46.4731, rotulo: "Aeroporto de Guarulhos" }] };
  const m = new Map([[`track:${id}`, JSON.stringify(link)]]);
  const env = { INFLEET_TOKEN: "x", TRACK_KV: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } } };
  const urls = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    const s = String(u); urls.push(s);
    if (s.includes("/route/v1/")) return new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 8000, duration: 600, geometry: { coordinates: [[-46.43, -23.444], [-46.48, -23.427]] } }] }));
    if (s.includes("/match/v1/")) return new Response(JSON.stringify({ code: "NoMatch" }));
    const q = JSON.parse(init?.body ?? "{}").query ?? "";
    if (q.includes("listVehiclePositions")) return new Response(JSON.stringify({ data: { listVehiclePositions: [] } }));
    return new Response(JSON.stringify({ data: { getVehicle: { plate: "ABC1D23", hasSignal: true, driver: null, location: { latitude: -23.444, longitude: -46.43, address: null, speed: 70, fixTime: agora } } } }));
  };
  try {
    const sem = await (await worker.fetch(new Request(`https://w/r/${id}/dados`), env)).json();
    assert.equal(sem.diagnostico, undefined);
    assert.ok(sem.rota);
    const rota = urls.find((u) => u.includes("/route/v1/"));
    assert.match(rota, /-46\.480203\d*,-23\.427153\d*/); // destino = T2, não o centro do aeroporto
    const com = await (await worker.fetch(new Request(`https://w/r/${id}/dados?debug=1`), env)).json();
    assert.equal(typeof com.diagnostico.decisao, "string");
    assert.ok(Array.isArray(com.diagnostico.trilha));
  } finally { globalThis.fetch = fetchOriginal; }
});
```

(O id `"f".repeat(64)` não pode colidir com outro teste do arquivo; conferir com `grep -n 'repeat(64)' tests/worker-dados.test.mjs` e trocar a letra se preciso.)

- [ ] **Step 2: rodar e ver falhar** — `node --test tests/worker-dados.test.mjs`. Esperado: a URL da rota tem o centro do aeroporto e `diagnostico` não existe.

- [ ] **Step 3: implementar** em `src/worker.mjs`:
  - imports:

```js
import { gqlInfleet, rotaAte, distanciaMetros, encaixarNasRuas, encaixarPosicao } from "./infleet.mjs";
import { registrarNaTrilha, rumoDaTrilha, decidirRota } from "./rota-viva.mjs";
import { pontoDeChegada } from "./chegada.mjs";
```

  - trocar o bloco de constantes `ROTA_*` (linhas 15-20) por:

```js
// Rota "viva" (src/rota-viva.mjs): segue a rota calculada e só pede outra ao sair dela, ao envelhecer
// (trânsito) ou com rota suspeita confirmada. Perto do alvo a idade máxima é menor.
const ROTA_PERTO_METROS = 5000;
```

  - trocar `cacheRota` e `rotaComCache` (linhas 36 e 50-63) por:

```js
const trilhas = new Map();     // id → { pontos, rejeitada, semeadaEm }
const estadosRota = new Map(); // id → estado de decidirRota
const SEMEAR_A_CADA_MS = 120000;
const SEMEAR_JANELA_MS = 5 * 60000;

// Primeira vez do link neste isolate: as últimas leituras da Infleet dão o rumo sem esperar o carro andar.
async function semearTrilha(id, t, env, agoraMs) {
  const atual = trilhas.get(id);
  if ((atual?.pontos.length ?? 0) >= 3 || (atual?.semeadaEm && agoraMs - atual.semeadaEm < SEMEAR_A_CADA_MS) || !t.vehicleId) return;
  let trilha = { pontos: [], rejeitada: null };
  try {
    const d = await gqlInfleet(env.INFLEET_TOKEN,
      "query Recentes($f: ListVehiclePositionsFilterInput!){ listVehiclePositions(filter:$f){ latitude longitude fixTime } }",
      { f: { vehicleId: t.vehicleId, fixTime: { startAt: new Date(agoraMs - SEMEAR_JANELA_MS).toISOString(), endAt: new Date(agoraMs).toISOString() } } }, env.INFLEET_URL);
    const pontos = (d.listVehiclePositions ?? []).map((p) => ({ lat: p.latitude, lon: p.longitude, fixTime: p.fixTime }))
      .sort((a, b) => Date.parse(a.fixTime) - Date.parse(b.fixTime));
    for (const p of pontos) trilha = registrarNaTrilha(trilha, p, agoraMs);
  } catch (e) { console.warn(`Trilha recente indisponível: ${e.message}`); }
  for (const p of atual?.pontos ?? []) trilha = registrarNaTrilha(trilha, p, agoraMs);
  trilhas.set(id, { ...trilha, semeadaEm: agoraMs });
}

// Rota da leitura atual: trilha confiável → rumo → (se precisar recalcular) encaixe e roteador com o rumo.
async function rotaViva(id, t, env, leitura, alvo, alvoChave) {
  const agoraMs = Date.now();
  await semearTrilha(id, t, env, agoraMs);
  if (trilhas.size > 300) trilhas.clear();
  if (estadosRota.size > 300) estadosRota.clear();
  const trilha = registrarNaTrilha(trilhas.get(id), leitura, agoraMs);
  trilhas.set(id, { ...trilha, semeadaEm: trilhas.get(id)?.semeadaEm });
  const pos = trilha.pontos.at(-1) ?? leitura;
  const destino = pontoDeChegada(alvo);
  const movimento = rumoDaTrilha(trilha.pontos);
  const diag = { rumo: movimento?.rumo ?? null, velocidadeKmh: movimento?.velocidadeKmh ?? null, origem: null, encaixada: null, trilha: trilha.pontos.map((p) => [p.lon, p.lat]) };
  const calcular = async () => {
    const enc = movimento ? await encaixarPosicao(trilha.pontos, env.OSRM_URL) : null;
    const rumoCarro = movimento ? (enc?.rumo ?? movimento.rumo) : null;
    diag.origem = { lat: pos.lat, lon: pos.lon };
    diag.encaixada = enc ? { lat: enc.lat, lon: enc.lon } : null;
    diag.rumo = rumoCarro;
    return rotaAte(enc ?? pos, destino, env.TOMTOM_KEY, { tomtom: env.TOMTOM_URL, osrm: env.OSRM_URL }, { rumo: rumoCarro });
  };
  const perto = distanciaMetros(pos.lat, pos.lon, destino.lat, destino.lon) < ROTA_PERTO_METROS;
  const r = await decidirRota(estadosRota.get(id) ?? null, { pos, fixTime: pos.fixTime, alvo: destino, alvoChave, agoraMs, perto, rumo: diag.rumo }, calcular);
  if (r.estado) estadosRota.set(id, r.estado); else estadosRota.delete(id);
  if (r.motivos.length) console.log(JSON.stringify({ evento: "rota_suspeita", link: id.slice(0, 6), decisao: r.decisao, motivos: r.motivos, km: r.rota?.km ?? null, fonte: r.rota?.fonte ?? null }));
  return { rota: r.rota, diagnostico: { decisao: r.decisao, motivos: r.motivos, ...diag } };
}
```

  - `resposta(...)`: acrescentar `diagnostico = null` aos parâmetros desestruturados e `diagnostico` ao objeto devolvido (depois de `percorrido`).
  - em `dadosAcompanhamento`: trocar `const rota = pos && alvo ? await rotaComCache(id, pos, alvo, alvoChave, env) : null;` por

```js
  const viva = pos && alvo ? await rotaViva(id, t, env, { lat: pos.lat, lon: pos.lon, fixTime: quando }, alvo, alvoChave) : null;
  const rota = viva?.rota ?? null;
```

    e passar `diagnostico: viva?.diagnostico ?? null` no `resposta(...)` final da função.
  - em `dadosPorEtapas`: mesma troca (`rotaComCache(id, pos, alvo, \`etapa${atual}\`, env)` → `rotaViva(id, t, env, { lat: pos.lat, lon: pos.lon, fixTime: quando }, alvo, \`etapa${atual}\`)`) e `diagnostico: viva?.diagnostico ?? null` no `resposta(...)`.
  - em `rotaAcompanhamento`, no `return Response.json(...)` final:

```js
  const { diagnostico, ...publico } = dados;
  const debug = url.searchParams.get("debug") === "1";
  return Response.json({ ...publico, ...(debug && diagnostico ? { diagnostico } : {}), avaliado, versao: VERSAO, servidorEm: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
```

    (`avaliado` usa `dados.fase`, que continua igual.)
  - conferir que nada mais referencia `rotaComCache`, `cacheRota`, `ROTA_IDADE_*` ou `ROTA_MOVEU_METROS`: `grep -n "rotaComCache\|cacheRota\|ROTA_IDADE\|ROTA_MOVEU" src/` vazio.
  - `wrangler.jsonc`: acrescentar, depois de `"triggers"`, com o comentário:

```jsonc
  // Logs do Worker guardados no painel (ex.: evento "rota_suspeita" para medir quantas rotas foram seguradas)
  "observability": { "enabled": true }
```

- [ ] **Step 4: rodar e ver passar** — `node --test` (suíte inteira) e `pnpm check` (o `check` é `node --check`, leve).
- [ ] **Step 5: commit** — `git add src/worker.mjs wrangler.jsonc tests/worker-dados.test.mjs && git commit -m "feat(rota): worker segue a rota viva, registra rota suspeita e tem diagnóstico"`

---

### Task 7: página — carro na rota, ETA estável e modo diagnóstico

**Files:**
- Modify: `src/pagina.mjs` (import e `CLIENTE_MOVIMENTO` linhas 5 e 55; `previsao` ~linha 779; `renderMapa` ~linha 908; `atualizar` ~linha 921; `iniciarMapa` (camada de diagnóstico); CSS da caixinha)
- Test: `tests/pagina.test.mjs` (acrescentar)

**Interfaces:**
- Consumes: `projetarNaLinha`, `carroNaRota`, `etaEstavel` (Task 1); `diagnostico` do `/dados?debug=1` (Task 6).

- [ ] **Step 1: testes que falham** — acrescentar em `tests/pagina.test.mjs` (usa `paginaHtml` como os testes existentes do arquivo; conferir o import no topo):

```js
test("página embute as funções de rota e o modo diagnóstico", () => {
  const html = paginaHtml("ativo", { completo: true });
  assert.match(html, /function projetarNaLinha\(/);
  assert.match(html, /function carroNaRota\(/);
  assert.match(html, /function etaEstavel\(/);
  assert.match(html, /debug=1/);
  assert.match(html, /id="diag"/);
});
```

- [ ] **Step 2: rodar e ver falhar** — `node --test tests/pagina.test.mjs`.

- [ ] **Step 3: implementar** em `src/pagina.mjs`:
  - linha 5: acrescentar `projetarNaLinha, carroNaRota, etaEstavel` ao import de `./movimento.mjs`.
  - linha 55: `const CLIENTE_MOVIMENTO = [rumo, metrosEntre, interpolar, giro, planoDeMovimento, idadeTexto, rumoDaRota, rumoDoPercorrido, projetarNaLinha, carroNaRota, etaEstavel].map(String).join("\n  ");`
  - CSS (junto das regras do mapa): `.diag{position:fixed;left:8px;bottom:8px;z-index:50;max-width:min(92vw,360px);padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.72);color:#fff;font:11px/1.35 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none}`
  - markup: logo depois de `<div id="mapa"...>` (procurar `id="mapa"`), `<div class="diag" id="diag" hidden></div>`.
  - perto de `var INTERVALO_MS`: `var DEBUG = /[?&]debug=1(&|$)/.test(location.search);` e `var CARRO_NA_ROTA_M = 30;`
  - em `iniciarMapa`, no fim do `mapa.on("load", ...)`, antes de `pronto = true`:

```js
      // Modo diagnóstico (?debug=1): trilha do GPS (cinza), leitura crua (vermelho) e ponto encaixado (verde).
      if (DEBUG) {
        mapa.addSource("diag", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        mapa.addLayer({ id: "diag", type: "circle", source: "diag", paint: { "circle-radius": 5, "circle-color": ["get", "cor"], "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
      }
```

  - função nova, perto de `renderMapa`:

```js
  function desenharDiagnostico(d) {
    var g = d.diagnostico;
    if (!DEBUG || !g) return;
    var feats = [];
    function ponto(c, cor) { feats.push({ type: "Feature", properties: { cor: cor }, geometry: { type: "Point", coordinates: c } }); }
    (g.trilha || []).forEach(function (c) { ponto(c, "#8a93a3"); });
    if (d.posicao) ponto([d.posicao.lon, d.posicao.lat], "#d93025");
    if (g.encaixada) ponto([g.encaixada.lon, g.encaixada.lat], "#188038");
    if (pronto && mapa.getSource("diag")) mapa.getSource("diag").setData({ type: "FeatureCollection", features: feats });
    $("diag").hidden = false;
    $("diag").textContent = "rota: " + g.decisao + (g.motivos && g.motivos.length ? " (" + g.motivos.join(", ") + ")" : "") +
      "\nrumo: " + (g.rumo == null ? "—" : Math.round(g.rumo) + "°") + " · " + (g.velocidadeKmh == null ? "parado" : g.velocidadeKmh + " km/h") +
      "\ntrilha: " + (g.trilha ? g.trilha.length : 0) + " pontos" + (g.encaixada ? " · encaixada" : "");
  }
```

  - `renderMapa`: trocar `if (d.posicao) moverCarro({ lat: d.posicao.lat, lon: d.posicao.lon });` por

```js
    if (d.posicao) moverCarro(carroNaRota({ lat: d.posicao.lat, lon: d.posicao.lon }, rotaCoords, CARRO_NA_ROTA_M));
    desenharDiagnostico(d);
```

  - `previsao`: estado do ETA estável antes da função e uso dentro dela:

```js
  // ETA estável: salto grande só aparece se a leitura seguinte confirmar; troca de fase ou etapa zera.
  var etaMostrado = null, etaPendente = null, etaChave = null;
  function previsao(d) {
    var atualIdx = (d.etapas || []).findIndex(function (x) { return x.atual; });
    var chave = d.fase + ":" + atualIdx;
    if (chave !== etaChave) { etaMostrado = null; etaPendente = null; etaChave = chave; }
    var est = etaEstavel(etaMostrado, etaPendente, d.eta || null);
    etaMostrado = est.mostrar; etaPendente = est.pendente;
    var e = etaMostrado;
```

    (o resto da função continua igual, usando `e`; remover a linha antiga `var e = d.eta;`.)
  - `atualizar`: `fetch(location.pathname + "/dados" + (DEBUG ? "?debug=1" : ""), { cache: "no-store" })`.
  - Atenção ao template literal: dentro de `paginaHtml` o script está num template; não usar `${` nem crase no código novo, e barras invertidas em regex precisam ser duplicadas (`\\b`). A regex de `DEBUG` acima não tem barra invertida; mantê-la assim.

- [ ] **Step 4: rodar e ver passar** — `node --test tests/pagina.test.mjs` e `pnpm check`. Depois o e2e na Betinhos-Renan: `pnpm mock` + `pnpm dev:local` + `pnpm e2e` (scripts do repo), para garantir que a página continua abrindo sem erro de script.
- [ ] **Step 5: commit** — `git add src/pagina.mjs tests/pagina.test.mjs && git commit -m "feat(rota): carro sobre a rota, ETA estável e modo diagnóstico na página"`

---

### Task 8: documentação, PR e verificação no ar

**Files:**
- Modify: `README.md` (seção "Rotas e consumo")

- [ ] **Step 1: README** — em "Rotas e consumo", substituir o parágrafo do recálculo a cada 30/60 s por um resumo da rota viva (segue e corta a rota; recalcula fora dela em 2 leituras ou com 2/4 min; rumo e encaixe; rota suspeita espera confirmação; terminal de aeroporto) e acrescentar: "Diagnóstico: abra o link com `?debug=1`. Eventos `rota_suspeita` ficam nos logs do Worker (Observability)."
- [ ] **Step 2: suíte inteira** — `node --test` na Betinhos-Renan (ou deixar o CI); tudo PASS.
- [ ] **Step 3: commit e PR** — commit `docs: rota viva no README`; push da branch `feat/rota-assertiva`; `gh pr create --base main` com resumo por item da spec e o plano de teste. Linkar o PR.
- [ ] **Step 4: depois do merge (com o ok do Renan)** — o workflow publica sozinho. Conferir: execução verde; `/r/<id>` de um link ativo responde 200 com a versão nova; `/r/<id>/dados?debug=1` traz `diagnostico`; `/r/<id>/dados` não traz. Os links ativos continuam respondendo (o deploy só troca o código).

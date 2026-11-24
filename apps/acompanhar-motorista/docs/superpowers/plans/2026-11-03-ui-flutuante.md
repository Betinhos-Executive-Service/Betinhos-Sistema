# UI flutuante do link de acompanhamento — plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos com checkbox (`- [ ]`).

**Objetivo:** levar a página pública do link de acompanhamento para o visual da proposta 2. O mapa fica em tela cheia com prédios em 3D, os controles e o cartão flutuam com margem e a logo aparece sem fundo branco.

**Arquitetura:** toda a página fica em `src/pagina.mjs`, que gera HTML, CSS e JS inline dentro de um template literal. A mudança é CSS mais ajustes pontuais de markup e JS. Os IDs que o JS e o e2e usam ficam preservados (`#atualizado`, `#conexao`, `#status`, `#aviso`, `#paradas`, `#concluido`, `#centrar`, `#painel` e demais). O backend não muda: rota (TomTom/OSRM), ETA e marcos (`chegouEmbarqueEm`, `saiuEmbarqueEm`, `concluidoEm`) já chegam no `/dados`.

**Stack:** Cloudflare Worker, MapLibre GL 4.7.1 (cdnjs), tiles OpenFreeMap `positron` (gratuitos e sem chave, com a camada `building` que tem `render_height`), `node --test` e Playwright (`scripts/cenarios-e2e.mjs`).

**Referência visual:** `docs/ideias-ui-2026-11-03/ideias-v2.html` e `ideia-v2-1..5.png` (proposta 2 aprovada em 03/11/2026, com a logo sem fundo).

## Restrições globais

- Template literal: dentro do `<script>` inline, toda barra invertida precisa ser dobrada (`\\d`). O código deste plano não usa barra invertida.
- Não mudar IDs existentes nem o contrato do `/dados`.
- Controles de toque com no mínimo 44 px. Animações com `--bt-ease-out` e menos de 300 ms. `prefers-reduced-motion` já zera as animações (regra global no fim do CSS).
- A versão continua visível em todas as telas, sutil e sem capturar clique (`.versao`, `pointer-events:none`).
- Fora do escopo, porque o backend não tem esses dados: trilha já percorrida no mapa, distância no resumo final, chips de elogio na avaliação e horário por parada no trilho.
- Não publicar (`pnpm push` = `wrangler deploy`) sem pedido explícito. A entrega é um PR.

## Arquivos

- Modificar: `src/pagina.mjs` (ícones `I` nas linhas 7–20, CSS nas linhas 76–232, markup nas linhas 236–275 e JS nas linhas 296–630).
- Modificar: `tests/pagina.test.mjs` (testes de string sobre o HTML gerado).
- Modificar: `.claude/skills/verificar-acompanhamento/SKILL.md` (seletores e telas novos).
- Criar: `docs/verificacao/2026-11-03-ui-flutuante/` (prints do e2e).

---

### Task 0: Worktree e linha de base

- [ ] **Passo 1:** No checkout `~/Desktop/vscode/acompanhar-motorista`, crie a worktree a partir de `origin/main`. O checkout principal tem `package.json` e `src/version.mjs` modificados por um bump local; não os leve.

```bash
cd ~/Desktop/vscode/acompanhar-motorista
git fetch -q origin
git worktree add .claude/worktrees/ui-flutuante -b feat/ui-flutuante origin/main
cp -r docs/ideias-ui-2026-11-03 .claude/worktrees/ui-flutuante/docs/
cp docs/superpowers/plans/2026-11-03-ui-flutuante.md .claude/worktrees/ui-flutuante/docs/superpowers/plans/
cd .claude/worktrees/ui-flutuante && pnpm install --frozen-lockfile
```

- [ ] **Passo 2:** Rode a linha de base. Esperado: tudo PASSA.

```bash
pnpm test 2>&1 | tail -5 && pnpm check
```

- [ ] **Passo 3:** Commit dos documentos de referência.

```bash
git add docs/ideias-ui-2026-11-03 docs/superpowers/plans/2026-11-03-ui-flutuante.md
git commit -m "docs: propostas de UI flutuante e plano de implementação"
```

---

### Task 1: Mapa com prédios em 3D e carro em pé

**Arquivos:** `src/pagina.mjs` (`iniciarMapa` e `moverCarro`), `tests/pagina.test.mjs`

**Interfaces:** nenhuma nova. A camada se chama `predios-3d`.

- [ ] **Passo 1: teste que falha.** Acrescente ao fim de `tests/pagina.test.mjs`:

```js
const ativa = () => paginaHtml("ativo", { telefone: null, whatsapp: null, tomtom: true, completo: true });

test("mapa: prédios 3D, inclinação fixa e carro em pé", () => {
  const html = ativa();
  assert.match(html, /"fill-extrusion"/);
  assert.match(html, /pitch: 45/);
  assert.match(html, /pitchAlignment: "viewport"/);
});
```

- [ ] **Passo 2:** `node --test tests/pagina.test.mjs`. Esperado: FALHA em `fill-extrusion`.

- [ ] **Passo 3: implementação.** Em `iniciarMapa`, no objeto do `new maplibregl.Map`, troque `center: [-46.63, -23.55], zoom: 10,` por:

```js
      container: "mapa", style: "https://tiles.openfreemap.org/styles/positron", center: [-46.63, -23.55], zoom: 10, pitch: 45,
```

(Apague a linha antiga do `container`. `dragRotate`, `pitchWithRotate` e `touchPitch` continuam `false`, então o usuário não muda a inclinação.)

No `mapa.on("load", ...)`, antes de `mapa.addSource("rota", ...)`:

```js
      // Prédios 3D dos mesmos tiles gratuitos; entram abaixo dos rótulos para os nomes de rua continuarem legíveis.
      var rotulos = mapa.getStyle().layers.find(function (l) { return l.type === "symbol"; });
      mapa.addLayer({ id: "predios-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
        paint: { "fill-extrusion-color": "#f2f2f0", "fill-extrusion-opacity": 0.9,
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0] } }, rotulos && rotulos.id);
```

Em `moverCarro`, troque `pitchAlignment: "map"` por `pitchAlignment: "viewport"`. Assim o carro continua apontando para o rumo (`rotationAlignment: "map"`) sem ficar achatado no chão inclinado.

Atualize o comentário acima de `var mapa = null` para: `// Mapa vetorial gratuito (OpenFreeMap, sem chave), inclinado 45° com prédios 3D. Sem rotação: o carro gira, o mapa não.`

- [ ] **Passo 4:** `node --test tests/pagina.test.mjs && pnpm check`. Esperado: PASSA.

- [ ] **Passo 5:** Commit: `feat(pagina): mapa inclinado com prédios 3D e carro em pé`.

---

### Task 2: Topo flutuante (logo sem fundo, pílula ao vivo, compartilhar, centralizar quadrado)

**Arquivos:** `src/pagina.mjs`, `tests/pagina.test.mjs`

**Interfaces:**
- Produz: `#vivo` (contém `#atualizado` e `#conexao`), `#compartilhar`, `#copiado` (região `role=status` para leitor de tela), `.topo`, `.qd`, os tokens `--bt-glass`, `--bt-shadow-float` e `--bt-color-gold`.
- `folga()` passa a medir `.topo` em vez de `.logo-chip`.

- [ ] **Passo 1: teste que falha.**

```js
test("topo flutuante: logo sem fundo, pílula ao vivo e compartilhar", () => {
  const html = ativa();
  assert.match(html, /class="logo-solta"/);
  assert.doesNotMatch(html, /logo-chip|logo-card/);
  assert.match(html, /id="vivo"[^>]*>[\s\S]*?id="atualizado"[\s\S]*?id="conexao"/);
  assert.match(html, /id="compartilhar"/);
  assert.doesNotThrow(() => new Function(script(html)));
});
```

- [ ] **Passo 2:** Rode o teste. Esperado: FALHA.

- [ ] **Passo 3: ícone.** No objeto `I` (linha ~11), depois de `centro:`:

```js
  compartilhar: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>'),
```

- [ ] **Passo 4: markup.** Troque:

```html
  <div class="logo-chip"><img src="/logo-b-128.png" alt="Betinhos Executive Service" width="48" height="48"></div>
  <button type="button" class="btn-centro" id="centrar" aria-label="Mostrar veículo e destino">${I.centro}Centralizar</button>
```

por:

```html
  <div class="topo">
    <img class="logo-solta" src="/logo-b-128.png" alt="Betinhos Executive Service" width="46" height="46">
    <p class="vivo" id="vivo" hidden><span id="atualizado"></span><span class="conexao" id="conexao" role="status" hidden></span></p>
    <button type="button" class="qd" id="compartilhar" aria-label="Compartilhar este link">${I.compartilhar}</button>
  </div>
  <button type="button" class="qd btn-centro" id="centrar" aria-label="Mostrar veículo e destino">${I.centro}</button>
  <span class="sr" id="copiado" role="status"></span>
```

Apague a linha `<div class="logo-card">…</div>` dentro do painel. Em `#linha-status`, apague `<span class="nota" id="atualizado"></span><span class="conexao" id="conexao" role="status" hidden></span>`, que agora ficam dentro de `#vivo`; o `#status` continua ali.

- [ ] **Passo 5: CSS.** No `:root`, acrescente:

```css
  --bt-glass:rgba(255,255,255,.9);--bt-shadow-float:0 18px 40px rgba(0,26,61,.16),0 2px 6px rgba(0,26,61,.06);--bt-color-gold:#b8913a;
```

Apague as regras `.logo-chip{…}`, `.logo-chip img,.logo-card img{…}`, `.logo-card{…}`, a regra longa `.btn-centro{…}`, `.btn-centro svg{…}` e `.btn-centro:active{…}`. Mantenha `.btn-centro[data-oculto="1"]{opacity:0;pointer-events:none}`. Troque `.btn:focus-visible,.btn-centro:focus-visible` por `.btn:focus-visible`. Na regra de hover, troque `.btn-centro:hover,.btn-secundario:hover` por `.qd:hover,.btn-secundario:hover`. Acrescente:

```css
/* Topo flutuante */
.topo{position:absolute;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top));z-index:3;display:grid;grid-template-columns:46px 1fr 46px;align-items:center;gap:10px;pointer-events:none}
.topo>*{pointer-events:auto}
.logo-solta{display:block;width:46px;height:46px;filter:drop-shadow(0 6px 14px rgba(0,26,61,.28))}
.vivo{grid-column:2;justify-self:center;display:inline-flex;align-items:center;gap:7px;min-height:36px;margin:0;padding:0 14px;border-radius:var(--bt-radius-full);background:var(--bt-glass);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:var(--bt-shadow-float);font-size:12px;font-weight:700;color:var(--bt-color-text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.vivo::before{content:"";flex:none;width:8px;height:8px;border-radius:50%;background:var(--bt-color-success);box-shadow:0 0 0 4px var(--bt-color-success-soft)}
.vivo.velha::before{background:var(--bt-color-warning);box-shadow:0 0 0 4px var(--bt-color-warning-soft)}
.qd{width:46px;height:46px;display:grid;place-items:center;padding:0;border:0;border-radius:16px;background:var(--bt-glass);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:var(--bt-shadow-float);color:var(--bt-color-brand);cursor:pointer;transition:transform var(--bt-duration-fast) var(--bt-ease-out),opacity var(--bt-duration-normal),color var(--bt-duration-fast)}
.qd svg{width:18px;height:18px}
.qd:active{transform:scale(.97)}
.qd:focus-visible{outline:0;box-shadow:var(--bt-shadow-float),var(--bt-focus-ring)}
.qd.copiado{color:var(--bt-color-success)}
#compartilhar{grid-column:3}
.btn-centro{position:absolute;right:12px;top:calc(68px + env(safe-area-inset-top));z-index:3}
```

Troque a regra `.versao{…}` por (no rodapé, abaixo do cartão, sem colidir com o compartilhar):

```css
.versao{position:fixed;left:50%;bottom:calc(3px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:4;font-size:10px;line-height:1;color:var(--bt-color-text-secondary);pointer-events:none;user-select:none;white-space:nowrap}
```

No `@media (min-width:820px)`, troque `.logo-chip{display:none}`, `.logo-card{display:block}` e `.btn-centro{right:auto;left:12px}` por:

```css
  .topo{right:432px}
  .btn-centro{right:432px}
```

- [ ] **Passo 6: JS.** Em `folga()`, troque `document.querySelector(".logo-chip")` por `document.querySelector(".topo")`.

No fim de `relogio()`, antes do comentário `// Mesma regra de badgeStatus`, acrescente:

```js
    $("vivo").hidden = !txt && c.hidden;
    $("vivo").classList.toggle("velha", !c.hidden || !(idade < 120000));
```

Em `encerrar(d)`, inclua `"vivo"` na lista de IDs escondidos: `["vivo", "linha-status", "eta", …]`.

Logo depois de `seguirMapa(true);` (a chamada solta, linha ~384), acrescente:

```js
  // Compartilhar: folha nativa no celular; no computador copia o link e avisa (visual + leitor de tela).
  $("compartilhar").addEventListener("click", function () {
    var b = this, url = location.origin + location.pathname;
    if (navigator.share) { navigator.share({ title: document.title, url: url }).catch(function () {}); return; }
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(url).then(function () {
      b.classList.add("copiado"); $("copiado").textContent = "Link copiado";
      setTimeout(function () { b.classList.remove("copiado"); $("copiado").textContent = ""; }, 2000);
    });
  });
```

- [ ] **Passo 7:** `node --test tests/pagina.test.mjs && pnpm check`. Esperado: PASSA.

- [ ] **Passo 8:** Commit: `feat(pagina): topo flutuante com logo sem fundo, pílula ao vivo e compartilhar`.

---

### Task 3: Cartão flutuante (painel, ETA, motorista e placa Mercosul)

**Arquivos:** `src/pagina.mjs` (só CSS)

**Interfaces:** consome `--bt-glass`, `--bt-shadow-float` e `--bt-color-gold` da Task 2.

- [ ] **Passo 1: CSS do painel.** Troque a regra `.painel{…}` inteira por:

```css
.painel{position:absolute;left:12px;right:12px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:2;max-height:64dvh;overflow-y:auto;overscroll-behavior:contain;background:var(--bt-glass);-webkit-backdrop-filter:blur(16px) saturate(1.2);backdrop-filter:blur(16px) saturate(1.2);border-radius:28px;box-shadow:var(--bt-shadow-float);padding:18px;animation:sobe var(--bt-duration-normal) var(--bt-ease-out)}
```

Apague `.painel::after{…}` (a alça de arrastar, que não arrasta). Troque `.titulo{…margin:10px 0 12px}` por `margin:0 0 12px`. No `@media (min-width:820px)`, troque a regra `.painel{…}` por:

```css
  .painel{left:auto;right:16px;top:16px;bottom:auto;width:400px;max-height:calc(100dvh - 32px);animation:none}
```

e apague `.painel::after{display:none}`.

- [ ] **Passo 2: ETA e botões.** Troque `.eta strong{font-size:38px;…}` por `font-size:44px` (o resto igual). Na regra `.btn{…}`, troque `min-height:var(--bt-control-height-touch)` por `min-height:50px`, `border-radius:var(--bt-radius-md)` por `border-radius:16px` e `font:700 13px` por `font:800 14px`. Troque `.btn-secundario{…}` por:

```css
.btn-secundario{background:var(--bt-color-surface-neutral);color:var(--bt-color-brand);border:1px solid transparent}
```

- [ ] **Passo 3: motorista sem caixa interna, avatar com aro dourado e placa Mercosul.** Troque `.motorista{…}`, `.motorista small{…}`, `.avatar{…}` e `.placa{…}` por:

```css
.motorista{margin:14px -18px 0;padding:14px 18px 0;border-top:1px solid var(--bt-color-border)}
#m-rotulo{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.m-topo{display:flex;align-items:center;gap:12px}
.avatar{flex:none;width:48px;height:48px;border-radius:16px;background:var(--bt-color-brand);color:var(--bt-color-surface);display:grid;place-items:center;font-size:18px;font-weight:800;overflow:hidden;box-shadow:0 0 0 2px var(--bt-color-surface),0 0 0 3.5px var(--bt-color-gold)}
.placa{flex:none;display:inline-flex;flex-direction:column;padding:0 8px 2px;overflow:hidden;font-size:15px;line-height:20px;font-weight:800;letter-spacing:.08em;color:#111;background:#fff;border:2px solid #1b1b1b;border-radius:6px;font-variant-numeric:tabular-nums}
.placa::before{content:"BRASIL";display:block;margin:0 -8px 1px;background:#1f4fa8;color:#fff;font-size:6px;line-height:9px;letter-spacing:.2em;text-align:center}
.placa.esqueleto::before{visibility:hidden}
```

(Apague a regra antiga `.m-topo{…margin-top:8px}`, porque a nova já está acima.)

- [ ] **Passo 4:** `pnpm test && pnpm check`. Esperado: PASSA (a task só mexe em CSS).

- [ ] **Passo 5:** Confira o visual. Suba `pnpm mock` (36490) e `pnpm dev:local` (36489) em segundo plano, rode `pnpm semear` e depois `SO=1 pnpm e2e /tmp/ui-t3` (com `CHROME_PATH` do headless shell 1248, se faltar o Chromium padrão). Leia `/tmp/ui-t3/1*.png` e compare com `docs/ideias-ui-2026-11-03/ideia-v2-1.png`. Esperado: cartão com margem e cantos de 28 px, placa com a faixa azul BRASIL e mapa inclinado com prédios.

- [ ] **Passo 6:** Commit: `feat(pagina): cartão flutuante com vidro, ETA maior e placa Mercosul`.

---

### Task 4: Chegou (faixa azul-marinho, tempo de espera e placa grande)

**Arquivos:** `src/pagina.mjs`, `tests/pagina.test.mjs`

**Interfaces:**
- Consome `d.marcos.chegouEmbarqueEm` (ISO, opcional) e `agoraServidor()`.
- Produz a classe `.chegou` em `#painel` e o elemento `#aviso-espera`.

- [ ] **Passo 1: teste que falha.**

```js
test("chegou: faixa com tempo de espera a partir do marco de chegada", () => {
  const html = ativa();
  assert.match(html, /id="aviso-espera"/);
  assert.match(html, /chegouEmbarqueEm/);
  assert.match(html, /classList\.toggle\("chegou"/);
});
```

- [ ] **Passo 2:** Rode o teste. Esperado: FALHA.

- [ ] **Passo 3: markup.** Troque o `#aviso` por:

```html
    <div class="aviso" id="aviso" role="status" hidden>${I.check}<div><strong id="aviso-titulo"></strong><span id="aviso-texto"></span><em class="espera" id="aviso-espera" hidden></em></div></div>
```

- [ ] **Passo 4: JS.** Em `badgeStatus`, no ramo `if (d.fase === "no_local")`, troque a linha `$("aviso-texto").textContent = [...]` por:

```js
      var v = d.veiculo || {}, carroTxt = [v.modelo, v.cor].filter(Boolean).join(" ");
      $("aviso-texto").textContent = "Procure " + (carroTxt ? "o " + carroTxt : "o carro") + (v.placa ? ", placa " + v.placa : "") + ".";
      var desde = d.marcos && d.marcos.chegouEmbarqueEm ? new Date(d.marcos.chegouEmbarqueEm).getTime() : NaN;
      var espera = Math.floor((agoraServidor() - desde) / 60000);
      $("aviso-espera").hidden = !(espera >= 1);
      $("aviso-espera").textContent = espera >= 1 ? "Esperando por você há " + espera + " min" : "";
```

(O cenário 3a do e2e continua passando: o aviso contém "chegou" e a placa.)

Em `render(d)`, no ramo `else` (não concluído), depois de `cartao(d);`:

```js
      $("painel").classList.toggle("chegou", d.fase === "no_local" && !!d.posicao);
```

Em `encerrar(d)`, acrescente `$("painel").classList.remove("chegou");`.

- [ ] **Passo 5: CSS.** Depois das regras `.aviso …`:

```css
/* Chegou: a faixa escura vira o topo do cartão e a placa cresce para achar o carro */
.painel.chegou{display:flex;flex-direction:column}
.painel.chegou .aviso{order:-1;margin:-18px -18px 14px;padding:18px;border-radius:28px 28px 0 0;background:var(--bt-color-brand);color:var(--bt-color-surface)}
.painel.chegou .aviso strong{font-size:20px;line-height:26px}
.painel.chegou .aviso span{color:#c4d2ea}
.painel.chegou .titulo{display:none}
.espera{display:inline-flex;margin-top:10px;padding:5px 10px;border-radius:var(--bt-radius-full);background:rgba(255,255,255,.14);font-size:12px;font-weight:700;font-style:normal;color:var(--bt-color-surface)}
.painel.chegou .m-topo{flex-wrap:wrap}
.painel.chegou .m-info{flex:1 1 calc(100% - 72px)}
.painel.chegou .placa{margin:12px auto 0;padding:0 16px 4px;font-size:28px;line-height:38px;border-width:3px;border-radius:9px}
.painel.chegou .placa::before{margin:0 -16px 2px;font-size:9px;line-height:14px}
```

- [ ] **Passo 6:** `node --test tests/pagina.test.mjs && pnpm check`. Esperado: PASSA.

- [ ] **Passo 7:** Commit: `feat(pagina): chegada com faixa escura, tempo de espera e placa em destaque`.

---

### Task 5: Etapas em trilho horizontal

**Arquivos:** `src/pagina.mjs`, `tests/pagina.test.mjs`

- [ ] **Passo 1: teste que falha.**

```js
test("etapas: trilho horizontal até 4 etapas", () => {
  assert.match(ativa(), /classList\.toggle\("trilho", lista\.length >= 2 && lista\.length <= 4\)/);
});
```

- [ ] **Passo 2:** Rode o teste. Esperado: FALHA.

- [ ] **Passo 3: JS.** Em `listaEtapas`, logo antes de `ol.hidden = !lista.length;`:

```js
    // Até 4 etapas cabem lado a lado e mantêm o cartão baixo; com mais, volta para a lista vertical.
    ol.classList.toggle("trilho", lista.length >= 2 && lista.length <= 4);
```

- [ ] **Passo 4: CSS.** Depois de `.p-atual .num{…}`:

```css
.paradas.trilho{grid-auto-flow:column;grid-auto-columns:minmax(0,1fr)}
.trilho .parada{flex-direction:column;align-items:center;gap:6px;padding:0 4px;text-align:center}
.trilho .parada+.parada::before{left:calc(-50% + 16px);right:calc(50% + 16px);top:11px;height:0;border-left:0;border-top:2px dashed var(--bt-color-border)}
.trilho .p-feita+.parada::before{border-top-style:solid;border-top-color:var(--bt-color-success)}
.trilho .p-feita .num{background:var(--bt-color-success);border-color:var(--bt-color-success)}
.trilho .p-atual .num{box-shadow:0 0 0 4px var(--bt-color-action-soft)}
.trilho .parada>div>span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;line-height:16px}
.trilho .parada .badge{display:none}
```

- [ ] **Passo 5:** `node --test tests/pagina.test.mjs && pnpm check`. Esperado: PASSA. O cenário B3 do e2e (`#paradas li` = 3) continua igual.

- [ ] **Passo 6:** Commit: `feat(pagina): etapas em trilho horizontal até 4 paradas`.

---

### Task 6: Concluído (véu no mapa, resumo da viagem e estrelas douradas)

**Arquivos:** `src/pagina.mjs`, `tests/pagina.test.mjs`

**Interfaces:** consome `d.marcos.saiuEmbarqueEm` e `d.marcos.concluidoEm`. Produz a classe `.fim` em `#app` e `#resumo`, `#r-saida`, `#r-chegada` e `#r-duracao`.

- [ ] **Passo 1: teste que falha.**

```js
test("concluído: véu no mapa e resumo com saída, chegada e duração", () => {
  const html = ativa();
  assert.match(html, /id="resumo" hidden/);
  assert.match(html, /\$\("app"\)\.classList\.add\("fim"\)/);
});
```

- [ ] **Passo 2:** Rode o teste. Esperado: FALHA.

- [ ] **Passo 3: markup.** Troque o bloco `#concluido` por:

```html
    <div class="concluido" id="concluido" role="status" hidden><div class="icone">${I.check}</div><h2>Serviço concluído</h2><p id="concluido-txt">Obrigado por viajar com a Betinhos.</p>
      <dl class="resumo" id="resumo" hidden><div><dt>Saída</dt><dd id="r-saida"></dd></div><div><dt>Chegada</dt><dd id="r-chegada"></dd></div><div><dt>Duração</dt><dd id="r-duracao"></dd></div></dl></div>
```

- [ ] **Passo 4: JS.** Em `encerrar(d)`, troque as duas linhas `var fim = d.marcos && d.marcos.concluidoEm;` e `$("concluido-txt").textContent = …` por:

```js
    $("app").classList.add("fim"); $("painel").classList.remove("chegou");
    var m = d.marcos || {}, saiu = m.saiuEmbarqueEm, fim = m.concluidoEm;
    $("concluido-txt").textContent = fim ? "Chegada às " + hora(fim) + ". Obrigado por viajar com a Betinhos." : "Obrigado por viajar com a Betinhos.";
    $("resumo").hidden = !(saiu && fim);
    if (saiu && fim) {
      $("r-saida").textContent = hora(saiu); $("r-chegada").textContent = hora(fim);
      $("r-duracao").textContent = Math.max(1, Math.round((new Date(fim) - new Date(saiu)) / 60000)) + " min";
    }
```

(Se a Task 4 já pôs `$("painel").classList.remove("chegou");` em `encerrar`, não duplique.)

- [ ] **Passo 5: CSS.** Troque `.concluido .icone{…}` e `.concluido .icone svg{…}` por, e acrescente o resto:

```css
#app.fim::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(0,26,61,.55),rgba(0,26,61,.25) 45%,rgba(0,26,61,.1))}
.concluido .icone{width:64px;height:64px;margin:0 auto;border-radius:20px;display:grid;place-items:center;background:var(--bt-color-success);color:var(--bt-color-surface);box-shadow:0 10px 24px rgba(20,122,75,.3);animation:surge 240ms var(--bt-ease-out)}
.concluido .icone svg{width:30px;height:30px}
@keyframes surge{from{transform:scale(.9);opacity:0}}
.resumo{display:grid;grid-template-columns:repeat(3,1fr);margin:14px 0 0;border-radius:16px;background:var(--bt-color-surface-neutral)}
.resumo div{padding:10px 4px}
.resumo div+div{border-left:1px solid var(--bt-color-border)}
.resumo dt{font-size:11px;font-weight:700;color:var(--bt-color-text-secondary)}
.resumo dd{margin:2px 0 0;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
```

Troque `.estrela.on{color:var(--bt-color-action)}` por `.estrela.on{color:var(--bt-color-gold)}`.

- [ ] **Passo 6:** `node --test tests/pagina.test.mjs && pnpm check`. Esperado: PASSA.

- [ ] **Passo 7:** Commit: `feat(pagina): conclusão com véu no mapa, resumo da viagem e estrelas douradas`.

---

### Task 7: Verificação, skill de verificação e PR

- [ ] **Passo 1:** Rode o e2e completo. Esperado: todos os cenários PASSAM, 0 erro de console e 0 violação axe Critical ou Serious (o próprio e2e mede).

```bash
pnpm mock &  pnpm dev:local &   # aguarde as portas 36490 e 36489
pnpm semear && CHROME_PATH=$(ls -d ~/.cache/ms-playwright/chromium_headless_shell-1248/*/chrome-headless-shell | head -1) pnpm e2e docs/verificacao/2026-11-03-ui-flutuante
```

- [ ] **Passo 2:** Leia os prints `1*`, `3a*`, `3c*` e `B*` e compare com `ideia-v2-1..5.png`. Confira estes pontos: a logo aparece sem quadrado branco, o cartão não toca as bordas, a versão fica visível embaixo, o carro não fica escondido atrás do cartão (`folga()`) e os prédios 3D aparecem a partir do zoom 14. Para o desktop, abra também `/r/<id>` com largura 1280 e confira se o topo e o centralizar ficam à esquerda do painel.

- [ ] **Passo 3:** Rode `ux-audit` no modo Rápido nas telas a caminho, chegou, em viagem e concluído. Corrija o que ele apontar.

- [ ] **Passo 4:** Atualize `.claude/skills/verificar-acompanhamento/SKILL.md`: `#atualizado` e `#conexao` agora ficam na pílula `#vivo` do topo, o compartilhar é `#compartilhar` (no desktop copia o link e mostra "Link copiado" em `#copiado`), `.chegou` fica no painel na fase no_local, `#resumo` aparece no concluído quando há os dois marcos, e o 3D usa a camada `predios-3d`.

- [ ] **Passo 5:** Rode `qualidade-antes-do-pr` (simplify, karpathy-coder e `/code-review high --fix`) e depois `verificacao-manter`.

- [ ] **Passo 6:** Commit da verificação e PR para `main`. Nada de `pnpm push`.

```bash
git add .claude/skills/verificar-acompanhamento docs/verificacao/2026-11-03-ui-flutuante
git commit -m "test(pagina): verificação ponta a ponta da UI flutuante"
git push -u origin feat/ui-flutuante && gh pr create --base main --title "UI flutuante do link de acompanhamento" --body-file -
```

---

## Riscos conhecidos

- **Celular fraco:** prédios 3D custam GPU. Mitigação: `minzoom: 14`. Se o e2e com CPU limitada ou o uso real mostrar travamento, basta tirar a camada `predios-3d`, porque o resto da UI não depende dela.
- **`fitBounds` com inclinação:** com pitch 45 a parte de cima do enquadramento fica mais distante. A `folga()` cobre isso, mas confira no Passo 2 da Task 7 se o carro e o embarque aparecem inteiros.
- **Placa antiga (cinza):** a faixa BRASIL entra em toda placa. É aceitável, porque quase toda a frota tem placa Mercosul.

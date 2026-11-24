# Tempo real e avisos — plano de implementação

> **Para agentes:** executar tarefa por tarefa (superpowers:executing-plans ou subagent-driven-development). Passos com `- [ ]`.

**Objetivo:** a página recebe cada leitura na hora por WebSocket, a Infleet é lida uma vez por viagem (Durable Object `Viagem`), o passageiro recebe web push com a página fechada, adiciona o embarque à agenda e o link tem prévia bonita no WhatsApp.

**Arquitetura:** as funções de dados saem do `worker.mjs` para `src/dados.mjs` e passam a receber o estado da rota (`est`) e uma função `gravar`; o Worker monta esse estado com os `Map`s do isolate (caminho sem DO, idêntico ao de hoje) e o `Viagem` com o próprio storage SQLite. O `Viagem` agenda o próprio alarm (ritmo da seção 2), transmite pelo WebSocket com Hibernation API e dispara os avisos.

**Tecnologia:** Cloudflare Workers + Durable Objects SQLite (plano gratuito), WebCrypto (web push sem dependências), `node --test`, Playwright no e2e.

**Spec:** `docs/superpowers/specs/2026-11-13-tempo-real-e-avisos-design.md`

## Restrições globais

- Sem merge, sem `wrangler deploy` (push/merge na `main` publica). `wrangler deploy --dry-run` só para conferir o bundle.
- Testes de rede só com mock de `globalThis.fetch`.
- Funções embutidas na página via `String(fn)`: ES5, sem função interna (o bundle usa keepNames → `__name(...)`). No template da página: nada de `${` nem crase no JS embutido; barras invertidas dobradas.
- Marcos continuam espelhados no KV; nenhuma escrita a mais no KV por leitura (o caminho via DO escreve menos: `ultimaPos` não vai mais ao KV).
- Segredos VAPID nunca gravados no Cloudflare por nós; sem eles o sino não aparece e o resto funciona.
- `npm test` e `npm run check` verdes a cada tarefa; um commit por tarefa, `feat(tempo-real): ...`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisões de implementação (fechadas antes de codar)

1. **DO sem `extends DurableObject`**: `import "cloudflare:workers"` não carrega no Node e o `worker.mjs` é importado pelos testes. A classe usa a API clássica (`constructor(ctx, env)`, `fetch`, `alarm`, `webSocket*`), e o Worker fala com ela por `stub.fetch` (não RPC). Mesmo efeito do design.
2. **Estado no storage do DO**: chave `s` = `{ id, t, est: { trilha, estadoRota, rotaEm }, recarregadoEm, concluidoKv, inscricoes, enviados, encerrado, limparEm }`, gravada só quando o JSON muda; chave `p` = cache do percorrido (`{ em, pontos, casado, ate }`), gravada só quando é relido (≤ 1/min). Última leitura (`{ em, dados }`) só em memória.
3. **Espelho no KV**: `marcosChave(t) = JSON.stringify({ ...t, ultimaPos: undefined })`; o DO grava no KV (com a mesma releitura + `mesclarEtapas` de hoje) só quando essa chave muda.
4. **Recarga do link**: a API (PUT, concluir) relê o KV no mesmo isolate e manda o JSON ao DO (`POST /recarregar`), evitando a consistência eventual do KV; DELETE manda `/encerrar`. A recarga periódica (5 min) mescla: progresso do DO (`etapas` via `mesclarEtapas(kv, do)`, `estado`, `ultimaPos`, `trajeto*`, `saidaVistaEm`, `destino*`) sobre o resto do KV, e relê `concluido:<id>`. KV sem a chave só encerra se `expiraEm` passou ou existe `revogado:<id>` (falta transitória não encerra).
5. **Ritmo**: "sem WebSocket e sem inscrição → sem alarm" vence "< 3 km" (sem ninguém para avisar não há o que fazer, igual a hoje). Com inscrição e longe do horário, o alarm é marcado para 60 min antes do horário agendado.
6. **Primeira conexão WS**: leitura com < 10 s é enviada na hora; senão o DO marca o alarm para agora (não segura o handshake esperando a Infleet).
7. **Avisos**: ao inscrever, eventos já verdadeiros viram "já vistos" (sem aviso atrasado). Vários eventos novos de uma vez → só o mais adiantado é enviado, os outros marcados.
8. **Service worker**: arquivo estático `public/sw.js`, registrado com escopo `/r/<id>` (uma inscrição por link e aparelho; o estado do sino vem de `getSubscription()` desse registro).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/dados.mjs` (novo) | `calcularDados`, `gravarNoKv`, `publicarDados`, `marcosChave` e as funções de dados movidas do worker |
| `src/worker.mjs` | rotas; caminho sem DO com `Map`s; repasse ao DO; aviso ao DO após a API; `export { Viagem }` |
| `src/ritmo.mjs` (novo) | `proximoAlarme(...)` puro |
| `src/viagem.mjs` (novo) | classe `Viagem` |
| `src/avisos.mjs` (novo) | `validarInscricao`, `guardarInscricao`, `eventosNovos`, `textoAviso`, `payloadAviso` |
| `src/webpush.mjs` (novo) | porta de `webpush.ts` (aes128gcm + VAPID) |
| `src/agenda.mjs` (novo) | `icsDoLink`, `linkGoogleAgenda` (servidor), escape RFC 5545 |
| `src/pagina.mjs` | WS com fallback, sino, agenda, metatags, manifest |
| `src/idiomas.mjs` | textos novos (sino, agenda, avisos) |
| `public/sw.js`, `public/og-betinhos.png` (novos) | service worker e arte da prévia |
| `scripts/gerar-vapid.mjs`, `scripts/gerar-og.mjs` (novos) | par VAPID; arte 1200×630 |
| `wrangler.jsonc` | binding `VIAGEM` + `migrations` |
| `tests/*.test.mjs` | testes novos por módulo |
| `scripts/cenarios-e2e.mjs`, `scripts/mock-servicos.mjs` | cenários WS, queda → polling, inscrição |

---

### Tarefa 1: funções de dados com estado explícito (sem mudar comportamento)

**Arquivos:** criar `src/dados.mjs`; modificar `src/worker.mjs`, `package.json` (`check`).

**Interfaces produzidas:**
- `calcularDados(id, t, env, est, { concluido, economia = false, gravar }) → Promise<dados>` — `t` é mutado (é a cópia de trabalho); `est = { trilha, estadoRota, percorrido, rotaEm }` é mutado; `gravar(t, { mesclar }) → Promise<void>` chamado nos mesmos pontos de hoje.
- `gravarNoKv(env, id, t, { mesclar }) → Promise<void>` — `mesclar: true` relê o KV e aplica `mesclarEtapas` em `t.etapas` antes de gravar (comportamento atual de `dadosPorEtapas`).
- `publicarDados(dados, { debug, avaliado, versao, agora }) → objeto` — tira `diagnostico` sem `debug`, acrescenta `avaliado`, `versao`, `servidorEm`.
- `marcosChave(t) → string`.

- [ ] Rodar `npm test` e anotar o total (linha de base).
- [ ] Mover para `src/dados.mjs`: `pontoPublico`, `etapasPublicas`, `semearTrilha`, `rotaViva`, `completarArea`, `completarDestino`, `corrigirSaidaFixa`, `lerTrajeto`, `percorridoComCache`, `percorridoFinal`, `marcosDasEtapas`, `reconstruirPeloTrajeto`, `cartoes`, `resposta`, `etapasLegado`, `comEtapas`, `dadosAcompanhamento` (vira o corpo de `calcularDados`), `gravarLink`, `dadosPorEtapas`. Trocar `trilhas.get(id)` → `est.trilha`, `estadosRota` → `est.estadoRota`, `cachePercorrido` → `est.percorrido`; `await env.TRACK_KV.get(concluido:)` → `opcoes.concluido`; as gravações → `opcoes.gravar(t, { mesclar })`.
- [ ] No worker: `estadoDoIsolate(id)` / `guardarNoIsolate(id, est)` (com os limites `ESTADOS_MAX` e 200 de hoje) e `/dados` chamando `calcularDados(id, JSON.parse(raw), env, est, { concluido: t.concluidoPor === "dataverse" || Boolean(await env.TRACK_KV.get(...)), gravar: (t, o) => gravarNoKv(env, id, t, o) })`.
- [ ] `npm test`: mesmo total, nenhuma expectativa alterada. `npm run check` com `src/dados.mjs`.
- [ ] Teste novo `tests/dados.test.mjs`: `calcularDados` com `est` vazio preenche `est.trilha` e `est.estadoRota` (Infleet/OSRM mockados), e uma segunda chamada com o mesmo `est` segue a rota ("seguindo") sem chamar o roteador.
- [ ] Commit `refactor(tempo-real): funções de dados recebem o estado da rota e a gravação`.

### Tarefa 2: ritmo do alarm

**Arquivos:** criar `src/ritmo.mjs`, `tests/ritmo.test.mjs`.

**Interface:** `proximoAlarme({ agoraMs, conectados, inscricoes, fase, distanciaAlvoM, horarioAgendado, encerrado }) → { emMs: number|null, limpar: boolean }`; constantes `RAPIDO_MS = 15000`, `LENTO_MS = 60000`, `LIMPEZA_MS = 24 h`, `PERTO_M = 3000`, `JANELA_MS = 60 min`.

Tabela de testes (um `test` por linha):

| entrada | esperado |
|---|---|
| `encerrado` (ou `fase: "concluido"`) | `{ emMs: agora + 24 h, limpar: true }` |
| `conectados: 1`, longe, sem inscrição | `agora + 15 s` |
| `conectados: 0`, `inscricoes: 0`, a 1 km | `null` |
| `inscricoes: 1`, a 2 km | `agora + 15 s` |
| `inscricoes: 1`, fase `no_local` | `agora + 15 s` |
| `inscricoes: 1`, 30 min antes do horário, a 20 km | `agora + 60 s` |
| `inscricoes: 1`, 3 h antes do horário | `horario − 60 min` |
| `inscricoes: 1`, sem horário, em viagem | `agora + 60 s` |

- [ ] Testes → falham → implementar → passam → commit `feat(tempo-real): ritmo do alarm por viagem`.

### Tarefa 3: Durable Object `Viagem` + `/dados` via DO com fallback

**Arquivos:** criar `src/viagem.mjs`, `tests/viagem.test.mjs`; modificar `src/worker.mjs`, `wrangler.jsonc`, `package.json`.

**Interface do DO (`stub.fetch`, host `https://viagem`):**
- `POST /dados?id=<id>[&debug=1]` corpo = JSON do link (do KV, lido pelo Worker) → 200 com o JSON público (`publicarDados`) ou 404 `{ expirado: true }`.
- `POST /recarregar?id=<id>` corpo = JSON do link → 204.
- `POST /encerrar?id=<id>` → 204 (fecha sockets com `{ tipo: "fim" }`, `deleteAll`).
- `alarm()`.
- Métodos internos testáveis: `ler({ economia })`, `agendar()`, `transmitir(dados)`.

`ctx` simulado nos testes: `storage` com `get/put/delete/deleteAll/getAlarm/setAlarm/deleteAlarm` sobre `Map` (contando `put` e `setAlarm`), `getWebSockets(tag)`, `getTags(ws)`, `acceptWebSocket(ws, tags)`.

Testes:
- duas chamadas `/dados` em < 10 s → uma consulta à Infleet;
- leitura sem mudança (mesmo `fixTime`) não grava `s` de novo;
- `ultimaPos` nova grava `s` mas **não** o KV; chegada na saída grava o KV uma vez;
- sem socket e sem inscrição, `alarm()` não reagenda;
- `concluido` agenda limpeza em +24 h e o `alarm()` seguinte faz `deleteAll`;
- `/recarregar` com `concluidoPor: "dataverse"` → próxima leitura `fase: "concluido"` sem Infleet;
- Worker: binding ausente → caminho atual; `stub.fetch` lança → caminho atual (mesmo JSON).
- `wrangler.jsonc`: `durable_objects.bindings: [{ name: "VIAGEM", class_name: "Viagem" }]`, `migrations: [{ tag: "v1", new_sqlite_classes: ["Viagem"] }]`; `npx wrangler deploy --dry-run --outdir <scratch>` sai sem erro.
- [ ] Commit `feat(tempo-real): Durable Object Viagem por link com /dados e fallback`.

### Tarefa 4: API avisa o `Viagem`

**Arquivos:** `src/worker.mjs`, `tests/viagem.test.mjs`.
- PUT `/api/links/:id` e POST `/concluir` com resposta ok → `ctx.waitUntil(stub.fetch("/recarregar", corpo = KV relido))`; DELETE ok → `/encerrar`. Sem `VIAGEM` ou sem `ctx`, nada.
- Teste: env com `VIAGEM` falso registrando chamadas; concluir → `/recarregar` com o JSON novo; revogar → `/encerrar`.
- [ ] Commit `feat(tempo-real): API de links avisa o Viagem ao editar, concluir e revogar`.

### Tarefa 5: WebSocket no DO e na página, com fallback para polling

**Arquivos:** `src/viagem.mjs`, `src/worker.mjs`, `src/pagina.mjs`, `tests/viagem.test.mjs`, `tests/pagina.test.mjs`.
- Worker: `GET /r/<id>/ao-vivo` sem `Upgrade: websocket` → 426; sem `VIAGEM` → 404; senão repassa ao DO (`/ao-vivo?id=&debug=`).
- DO: `WebSocketPair`, `ctx.acceptWebSocket(servidor, debug ? ["debug"] : [])`, leitura fresca enviada na hora, senão `setAlarm(agora)`; `transmitir` manda `{ tipo: "dados", ...publico }` (diagnóstico só para a tag `debug`). `webSocketClose` fecha o par.
- Página: `aplicar(d)` (corpo atual do `then` do fetch, com a checagem de versão); `conectarAoVivo()` com timeout de 5 s, backoff 5 s/15 s/60 s/2 min, `onopen` para o polling, `onclose` volta ao polling; aba oculta > 60 s fecha o WS; ao voltar, reconecta e salta o carro.
- Testes: DO envia a leitura no aceite e transmite no alarm (com e sem tag debug); página contém `/ao-vivo`, o script compila (`new Function`) e não tem `${`.
- [ ] Commit `feat(tempo-real): WebSocket ao vivo com volta automática ao polling`.

### Tarefa 6: alarm com economia de rota

**Arquivos:** `src/dados.mjs`, `src/viagem.mjs`, testes.
- `economia: true` (alarm sem socket): sem rota a ≥ 15 km do alvo; a < 15 km o roteador só é chamado se `est.rotaEm` tem ≥ 5 min.
- `alarm()`: lê, transmite, avisos (tarefa 8), `agendar()` com `proximoAlarme`. Nada de `waitUntil`/timers no handler.
- Testes: economia longe → `rota: null` e nenhuma chamada ao roteador; perto com `rotaEm` recente → sem roteador.
- [ ] Commit `feat(tempo-real): alarm segue o ritmo e poupa o roteador sem ninguém olhando`.

### Tarefa 7: web push (porta do App Motoristas)

**Arquivos:** criar `src/webpush.mjs`, `tests/webpush.test.mjs`, `scripts/gerar-vapid.mjs`.
- Porta 1:1 de `toBase64Url`, `fromBase64Url`, `encryptPayload`, `vapidAuthorization`, `sendPush` (`fetchImpl` injetável, hosts conhecidos).
- Testes: cifra decifrada no teste com a chave privada do "aparelho" (RFC 8291 ao contrário) devolve o texto; JWT VAPID verificado com a chave pública (`aud` = origem do endpoint, `exp` 12 h); host fora da lista → 400 sem fetch; 410 → `gone: true`.
- `gerar-vapid.mjs` imprime `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_JWK` e os comandos `wrangler secret put`.
- [ ] Commit `feat(tempo-real): web push sem dependências e gerador do par VAPID`.

### Tarefa 8: inscrições, eventos e envio dos avisos

**Arquivos:** criar `src/avisos.mjs`, `tests/avisos.test.mjs`; modificar `src/viagem.mjs`, `src/worker.mjs`, `src/idiomas.mjs`.
- `validarInscricao(corpo)` → `{ inscricao }` ou `{ erro }`: `endpoint` https em host de push conhecido, ≤ 1024 caracteres; `p256dh` 65 bytes; `auth` 16 bytes; `idioma` ∈ pt/en/es (padrão pt).
- `guardarInscricao(lista, nova)` → até 5, mesma `endpoint` substitui, a 6ª tira a mais antiga.
- `eventosNovos(dados, enviados)` → eventos em ordem `chegando_embarque, chegou_embarque, viagem_iniciada, chegando_destino, concluido` cujo gatilho vale e ainda não constam.
- `textoAviso(evento, dados, idioma)` → `{ titulo, corpo }` (pt/en/es); `payloadAviso(id, evento, dados, idioma)` → `{ titulo, corpo, url: "/r/<id>", tag: "<id>:<evento>" }`.
- DO: `POST/DELETE /avisos`; ao inscrever, eventos já verdadeiros viram vistos; no alarm, envia só o mais adiantado, marca os outros; 404/410 remove a inscrição; falha tenta no alarm seguinte até 3 vezes.
- Worker: `POST/DELETE /r/<id>/avisos` → 404 sem `VIAGEM` ou sem VAPID; corpo ≤ 4 KB.
- Testes: tabela de gatilhos; dedupe; textos nos 3 idiomas sem endereço nem nome de passageiro; validação; DO envia uma vez, remove 410, tenta 3 vezes em 500.
- [ ] Commit `feat(tempo-real): avisos por web push nos marcos da viagem`.

### Tarefa 9: sino e service worker na página

**Arquivos:** `src/pagina.mjs`, `src/worker.mjs` (cfg `vapid`), `public/sw.js`, `src/idiomas.mjs`, testes.
- `cfg.vapid` = `VAPID_PUBLIC_KEY` só com os três segredos e `VIAGEM`; sem ele, nada de sino no HTML.
- Sino: registra `/sw.js` com escopo `/r/<id>`, `subscribe`, `POST /avisos`; novo toque `DELETE` + `unsubscribe`. iPhone sem `PushManager` fora da tela de início: dica. Sem suporte: escondido.
- `sw.js`: `push` → `showNotification`; `notificationclick` → foca ou abre `data.url`.
- Testes: HTML com e sem `vapid`; `sw.js` compila e trata `push`/`notificationclick`.
- [ ] Commit `feat(tempo-real): sino de avisos e service worker`.

### Tarefa 10: agenda (retirada em 13/11/2026 por decisão do Renan; ver design, seção 4)

**Arquivos:** criar `src/agenda.mjs`, `tests/agenda.test.mjs`; modificar `src/worker.mjs`, `src/pagina.mjs`.
- `icsDoLink(id, t, origem)` → texto `VCALENDAR` com CRLF, dobra de 75 octetos, `UID:<id>@acompanhar-motorista`, `DTSTART`/`DTEND` UTC (+1 h), `SUMMARY:Betinhos · <título sem OS>`, `LOCATION` = rótulo limpo, `URL`/`DESCRIPTION` = link, `VALARM` `-PT30M`; escape de `\ ; , \n`.
- `GET /r/<id>/agenda.ics` → `text/calendar; charset=utf-8`, `Content-Disposition: attachment; filename="betinhos.ics"`; sem horário → 404.
- Página: "Adicionar à agenda" (Google + .ics) enquanto a saída não aconteceu e há `horarioAgendado`.
- Testes: escape, dobra, campos, sem nome de passageiro.
- [ ] Commit `feat(tempo-real): adicionar o embarque à agenda`.

### Tarefa 11: prévia no WhatsApp, manifest e noindex

**Arquivos:** `src/pagina.mjs`, `src/worker.mjs`, `public/og-betinhos.png`, `scripts/gerar-og.mjs`, testes.
- `<head>` ativo: `og:title`, `og:description` ("Embarque às HH:mm · Modelo cor", partes ausentes omitidas), `og:image` absoluto, `og:type`, `twitter:card`, `theme-color`, `apple-touch-icon`, `<link rel="manifest">`; `robots` "noindex, nofollow". Expirada/revogada: genéricos.
- `GET /r/<id>/manifest.webmanifest` (`start_url`/`scope` `/r/<id>`); `X-Robots-Tag: noindex` em todas as respostas `/r/`.
- `gerar-og.mjs` (Playwright) monta 1200×630 com `logo-betinhos.png` sobre `#001a3d`.
- Testes: metatags com e sem modelo/horário; páginas expirada/revogada sem dados; manifest.
- [ ] Commit `feat(tempo-real): prévia do link no WhatsApp e página instalável`.

### Tarefa 12: e2e local

**Arquivos:** `scripts/cenarios-e2e.mjs`, `.dev.vars.exemplo` (VAPID de teste, não secreto).
- Cenários: WS abre e recebe `tipo: "dados"` (mudança de posição chega sem `/dados`); WS bloqueado (`page.route("**/ao-vivo*", abort)`) → polling segue atualizando; `POST /avisos` com inscrição sintética aceito (201) e `DELETE` 204.
- Rodar `pnpm mock`, `pnpm dev:local`, `pnpm semear`, `pnpm e2e`; todos os cenários antigos passando.
- [ ] Commit `test(e2e): tempo real, queda do WebSocket e inscrição de aviso`.

### Tarefa 13: README

- Seção "Tempo real e avisos": arquitetura, ritmo, consumo, segredos VAPID (`node scripts/gerar-vapid.mjs` + `wrangler secret put`), como testar push num Android.
- [ ] Commit `docs: tempo real e avisos no README`.

## Autoverificação contra o spec

- Seção 1 (DO, rotas, refatoração): tarefas 1, 3, 4, 5, 8, 10, 11. Seção 2 (ritmo, reaproveitamento 10 s, economia, hibernação, aba oculta): 2, 3, 5, 6. Seção 3: 7, 8, 9. Seção 4: 10. Seção 5: 11. Seção 6: 3, 5. Seção 7: todas + 12.

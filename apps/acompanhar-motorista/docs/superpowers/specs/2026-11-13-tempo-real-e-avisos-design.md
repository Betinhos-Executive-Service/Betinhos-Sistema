# Tempo real e avisos no link de acompanhamento — design

Aprovado pelo Renan em 13/11/2026 (abordagem A, "cérebro por viagem"; canal só web push; menos de 100 links/dia, plano gratuito do Cloudflare).

## Objetivo

1. **Tempo real de verdade**: a página recebe cada leitura nova na hora (sem esperar o próximo ciclo de 15 s) e a Infleet é consultada uma vez por viagem, não uma vez por aba/isolate.
2. **Avisos ao passageiro com a página fechada** (web push) e prévia bonita ao colar o link no WhatsApp.

Fora do escopo desta rodada: WhatsApp/SMS, mapa vivo (carro estimado entre leituras, trânsito colorido, incidentes), ponto de encontro detalhado, botão de segurança.

## 1. Arquitetura

Um Durable Object **`Viagem`** por link (`env.VIAGEM.idFromName(id)`), classe SQLite (`migrations: [{ tag: "v1", new_sqlite_classes: ["Viagem"] }]` no `wrangler.jsonc`; disponível no plano gratuito).

O Worker continua servindo a página e a API; o que hoje está em `Map`s por isolate e em escritas no KV passa a morar no `Viagem`:

| Hoje (por isolate / KV) | No `Viagem` (storage SQLite/KV API do DO) |
|---|---|
| `track:<id>` lido a cada `/dados` | cópia do link carregada na 1ª vez; recarregada quando a API avisa ou a cada 5 min |
| progresso das etapas, `ultimaPos`, `chegandoEm`, `estado` gravados no KV | gravados no storage do DO; **marcos** (chegou, saiu, concluído, chegando) continuam espelhados no KV, como hoje, para o conector e o Dataverse |
| `trilhas`, `estadosRota`, `cachePercorrido`, `cacheDados` | estado do DO (sobrevive a troca de isolate) |
| — | inscrições de web push e avisos já enviados |

**Refatoração necessária**: `dadosPorEtapas` e `dadosAcompanhamento` (e `rotaViva`, `percorridoComCache`, `semearTrilha`) deixam de ler/gravar `Map`s e KV diretamente e passam a receber um **estado** (`{ link, trilha, estadoRota, percorrido, ... }`) e devolver `{ dados, estadoNovo, marcosMudaram }`. O caminho sem DO (fallback) usa as mesmas funções com um estado montado a partir do KV + `Map`s, preservando o comportamento atual. Regras de negócio (etapas, geofence, rota viva, percorrido, ETA) não mudam.

### Rotas

| Rota | Comportamento |
|---|---|
| `GET /r/<id>` | página (como hoje), com metatags novas (seção 5) |
| `GET /r/<id>/ao-vivo` | upgrade WebSocket, repassado ao `Viagem` (WebSocket Hibernation API: `ctx.acceptWebSocket`) |
| `GET /r/<id>/dados` | pergunta ao `Viagem` (RPC); se o DO falhar ou não existir binding, responde pelo caminho atual (sem DO) |
| `POST /r/<id>/avisos` / `DELETE /r/<id>/avisos` | inscreve/cancela um aparelho (seção 3) |
| `GET /r/<id>/manifest.webmanifest` | manifest por link (`start_url` = `/r/<id>`), para "Adicionar à Tela de Início" no iPhone |
| `GET /sw.js` | service worker (escopo `/r/`), só para receber push e abrir o link ao tocar |
| `PUT /api/links/:id`, `DELETE /api/links/:id`, `POST .../concluir` | depois de gravar no KV, avisam o `Viagem` (`recarregar()` / `encerrar()`) |

Contrato do JSON enviado pelo WebSocket = exatamente o de `/dados` (mais `tipo: "dados"`), para a página usar o mesmo `atualizar(d)`. `?debug=1` continua valendo (só `/dados` e WS aberto com `?debug=1` recebem `diagnostico`).

## 2. Ritmo (alarm do `Viagem`)

O `Viagem` agenda o próprio alarm; cada disparo faz **uma** leitura da Infleet e roda as regras.

| Situação | Intervalo |
|---|---|
| WebSocket conectado, **ou** carro a < 3 km do alvo atual, **ou** fase `no_local` | 15 s |
| Sem WebSocket, com inscrição de aviso e faltando < 60 min para o horário agendado (ou já em curso) | 60 s |
| Sem WebSocket e sem inscrição | sem alarm (o DO só acorda por requisição) |
| `concluido`, revogado ou expirado | para; alarm final em +24 h faz `deleteAll()` |

- Leitura com menos de 10 s é reaproveitada (requisição `/dados` ou conexão WS nova não força outra consulta).
- Sem WebSocket, rota (TomTom/OSRM) só é recalculada a cada 5 min e só a < 15 km do alvo; o "chegando" sem rota usa o geofence por distância/área (já existe).
- O handler do alarm não deixa timers nem `waitUntil` pendentes, para o DO poder hibernar entre disparos (não paga duração ociosa).
- Página: aba oculta por mais de 60 s fecha o WebSocket; ao voltar, reconecta (e já salta o carro para a posição atual, como hoje).

### Consumo estimado (plano gratuito, por dia; < 100 links/dia)

| Recurso | Por viagem (2 h) | Limite/dia | Capacidade |
|---|---|---|---|
| Requisições DO (alarms + conexões) | ~320 | 100.000 | ~300 |
| Duração DO (~1,5 s × 128 MB por alarm) | ~55 GB-s | 13.000 GB-s | ~230 |
| Linhas gravadas (setAlarm + estado) | ~400 | 100.000 | ~250 |

Gravar estado só quando mudar. Estouro de limite → operações do DO falham → a página cai no modo consulta (seção 6).

## 3. Avisos (web push)

- **Página**: botão sino no cartão, "Me avise quando o motorista estiver chegando". Toque → `Notification.requestPermission()` → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })` → `POST /r/<id>/avisos` com `{ endpoint, p256dh, auth, idioma }`. Novo toque cancela (`DELETE`). Estado do sino lembrado por `pushManager.getSubscription()`.
- **iPhone fora da tela de início** (`navigator.standalone !== true` e sem `PushManager`): no lugar do sino, dica "Para receber avisos no iPhone: Compartilhar → Adicionar à Tela de Início". Navegador sem suporte nenhum: o sino não aparece.
- **`Viagem`**: até 5 inscrições por link (a 6ª substitui a mais antiga); validação de `endpoint` (https, hosts de push conhecidos ou qualquer https) e tamanhos; inscrição com resposta 404/410 é removida.
- **Eventos** (cada um uma vez por link, registro em `avisosEnviados`), texto no idioma da inscrição (pt/en/es, junto do dicionário `idiomas.mjs`):

| Evento | Gatilho | Texto (pt) |
|---|---|---|
| `chegando_embarque` | `chegando` liga com alvo = etapa de saída | "{Motorista} está chegando · {Modelo} {cor} {placa}" |
| `chegou_embarque` | fase vira `no_local` | "Seu motorista chegou · procure o {Modelo} {cor}, placa {placa}" |
| `viagem_iniciada` | saída registrada (`saiuEm` da etapa de saída) | "Viagem iniciada · previsão {hora}" (sem hora se não houver ETA) |
| `chegando_destino` | `chegando` liga com alvo = destino final | "Chegando ao destino" |
| `concluido` | fase vira `concluido` | "Viagem concluída · toque para avaliar" |

  Nunca levam endereço completo nem nome do passageiro. Payload: `{ titulo, corpo, url: "/r/<id>", tag: "<id>:<evento>" }`. Tocar abre/foca o link.
- **Envio**: porta de `apps/motoristas/workers/web-push/src/webpush.ts` (repo Betinhos-Sistema; `encryptPayload` aes128gcm + `vapidAuthorization` ES256) para `src/webpush.mjs`, com os testes. Falha de envio tenta de novo no alarm seguinte, até 3 vezes por evento.
- **Segredos do Worker** (par novo, não reutilizar o do App Motoristas): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_JWK`, `VAPID_SUBJECT` via `wrangler secret put`; script `scripts/gerar-vapid.mjs` gera o par. Sem os segredos, o sino não aparece e nada é enviado.

## 4. Agenda (retirada)

Retirada em 13/11/2026 por decisão do Renan: o "Adicionar à agenda" (Google e `.ics`) saiu da página, do Worker e dos testes. O passageiro já recebe o link com o horário e os avisos por web push cobrem os marcos da viagem.

## 5. Prévia no WhatsApp e página instalável

- No `<head>` da página ativa: `og:title` "Acompanhe sua viagem · Betinhos", `og:description` "Embarque às {HH:mm} · {Modelo} {cor}" (partes ausentes omitidas), `og:image` = `/og-betinhos.png` (arte fixa 1200×630, logo sobre fundo escuro, em `public/`), `og:type` website, `twitter:card` summary_large_image, `theme-color`, `apple-touch-icon`, `<link rel="manifest" href="/r/<id>/manifest.webmanifest">`.
- `<meta name="robots" content="noindex, nofollow">` e cabeçalho `X-Robots-Tag: noindex` nas rotas `/r/`.
- Páginas expirada/revogada: título e descrição genéricos, sem dados do serviço.

## 6. Falhas e compatibilidade

- **WebSocket**: se não abrir em 5 s, cair, ou o navegador não suportar, a página volta ao `setInterval` de 15 s em `/dados` e tenta reconectar com espera crescente (5 s, 15 s, 60 s, depois a cada 2 min). Com WS ativo, o polling para.
- **DO indisponível** (erro, limite estourado, binding ausente): `/dados` responde pelo caminho atual; a página nunca fica sem dados.
- **Links antigos** (sem `modo`, sem etapas) e links simples: mesmo comportamento de hoje, agora servidos pelo `Viagem`.
- **Concluir/editar/revogar** feitos fora deste Worker (direto no KV): o `Viagem` recarrega o link a cada 5 min.
- **Deploy**: a migração `new_sqlite_classes` é aditiva; links ativos continuam respondendo durante e depois do deploy (o primeiro acesso cria o DO a partir do KV).

## 7. Testes

- Unitários (`node --test`): função de ritmo (tabela da seção 2), detecção de eventos e deduplicação, textos dos avisos nos 3 idiomas sem dados proibidos, metatags, criptografia/VAPID (portados), validação de inscrição, refatoração das funções de dados (os testes atuais de `worker-dados` continuam passando sem mudança de expectativa).
- `Viagem`: testes com storage/alarm simulados (estado salvo só quando muda; alarm não reagendado sem viewer nem inscrição; `deleteAll` após 24 h).
- Página: teste de que o JS embutido continua ES5 e válido; WS com fallback para polling.
- e2e local (`pnpm mock` + `pnpm dev:local` + `pnpm e2e`): conexão WS recebe dados; WS bloqueado → polling; inscrição de aviso aceita.
- Não verificável antes do deploy: entrega real de push em Android/iPhone; comportamento de hibernação e consumo real (conferir no painel do Cloudflare 1 dia depois).

---
name: verificar-acompanhamento
description: "Verifica o link público de acompanhamento (página /r/<id>, /dados, WebSocket ao vivo, sino de avisos, prévia OG, etapas, Chegando, ETA, cartão do motorista, estados de erro, revogado/expirado/concluído e avaliação). Use após mudar apps/acompanhar-motorista (src/worker.mjs, src/pagina.mjs, web/ (app React do portal), src/etapas.mjs, src/movimento.mjs, src/infleet.mjs, src/local.mjs, src/viagem.mjs, src/webpush.mjs, src/avisos.mjs, public/sw.js ou scripts/mock-servicos.mjs), ou quando pedirem para testar o acompanhamento."
---
# Verificar acompanhamento

> Worker no monorepo: `apps/acompanhar-motorista`. Todos os comandos abaixo (`pnpm check`, `pnpm mock`, `pnpm dev:local`, `pnpm semear`, `pnpm e2e`, `cp .dev.vars.exemplo`, `scripts/...`, `.wrangler/...`) rodam **dentro dessa pasta** (`cd apps/acompanhar-motorista`) ou com `pnpm --filter @betinhos/acompanhar-motorista <script>`. Caminhos `src/`, `web/`, `public/`, `scripts/` e `docs/` são relativos a ela. Os prints e vídeos de referência de `docs/verificacao/` e os anexos do T3 citados abaixo não vieram para o repositório público; a pasta `docs/verificacao/` é gitignorada e o e2e a recria. Publicação: o GitHub (deploy-cloudflare.yml no DEV, producao.yml no PROD); nunca à mão.

## Cobre
- Código: `src/worker.mjs`, `src/pagina.mjs` (injeta metatags e bootstrap no HTML do build), `web/` (app React + Vite: `web/src`, entrada `web/portal.html`, build em `web-dist/`), `src/etapas.mjs`, `src/movimento.mjs`, `src/infleet.mjs`, `src/local.mjs`, `src/confianca.mjs`, `src/dados.mjs`, `src/ritmo.mjs`, `src/viagem.mjs` (Durable Object), `src/webpush.mjs`, `src/avisos.mjs`, `public/sw.js`, `scripts/mock-servicos.mjs`, `scripts/semear-local.mjs`, `scripts/cenarios-e2e.mjs`, `scripts/kv-local.mjs` (`gravarTrackLocal`: grava `track:<id>` no KV local via `wrangler kv key put --local`; semear e e2e usam).
- Rotas: `GET /r/<id>`, `GET /r/<id>/dados`, `DELETE /api/links/<id>`, `POST /api/links/<id>/concluir`, `POST /r/<id>/avaliacao`, `GET /r/<id>/ao-vivo` (WebSocket), `POST|DELETE /r/<id>/avisos`, `GET /r/<id>/manifest.webmanifest`, `GET /sw.js`, `GET /og-betinhos.png`.

## Preparar ambiente
- Nunca rode `wrangler deploy`, `wrangler kv`, `wrangler secret` nem `pnpm segredo*`; nada aqui toca DEV nem produção.
- `cp .dev.vars.exemplo .dev.vars` (valores de mock, não são segredos). Para o sino aparecer, gere um par VAPID de teste com `node scripts/gerar-vapid.mjs` e cole só no `.dev.vars` (gitignored); nunca versione a chave privada.
- Antes de repetir o e2e: pare o `wrangler dev`, `rm -rf .wrangler/state/v3/do` (o estado do Durable Object sobrevive ao `pnpm semear`, que só regrava o KV), suba de novo e rode `pnpm semear`. Sem isso o cenário 3 começa "concluído" e trava no mapa.
- Três processos, nesta ordem, cada um em segundo plano com log em `/tmp`:
  1. `pnpm mock` → imprime `Mock Infleet/OSRM/TomTom em http://127.0.0.1:36490`.
  2. `pnpm dev:local` → compila o portal (`vite build` em `web-dist/`) e imprime `Ready on http://127.0.0.1:36489` (porta fixa 36489; se ocupada pelo próprio wrangler, encerre o PID e suba de novo). Sem `web-dist/` o `/r/<id>` responde 503. Mudou algo em `web/`: rode `pnpm build` (ou deixe `pnpm dev:web` em outro terminal, `vite build --watch`) e recarregue; o Worker não precisa reiniciar.
  3. `pnpm semear` → lista os links `DevCompleto1`, `DevParadas01` (3 etapas), `DevSimples01`, `DevSemNome01` (sem foto), `DevRevogar01`, `DevConcluir1`, `DevFluxo0001` e um id antigo de 64 `a`.
- Primeira vez: `pnpm exec playwright install chromium`. Se o Playwright pedir um `chromium_headless_shell-<n>` que não existe, aponte `CHROME_PATH=~/.cache/ms-playwright/chromium_headless_shell-<versão existente>/chrome-headless-shell-linux64/chrome-headless-shell` (o e2e usa `executablePath`).
- Sanidade: `curl -s http://127.0.0.1:36489/r/DevCompleto1/dados | head -c 300` deve trazer `"modo":"completo"` e `"fase":"a_caminho"`.
- Mover o carro / simular falhas: `curl -X POST -H 'content-type: application/json' -d '{"lat":-23.52,"lon":-46.6559,"speed":45}' http://127.0.0.1:36490/cenario`. Campos: `lat`, `lon`, `speed`, `fixTime` (ISO; null = agora), `falhar` (Infleet fora), `tomtomFalha` (cai para OSRM), `foto` (foto do motorista na Infleet), `semPosicao`.
- Coordenadas do seed: saída Av. Paulista 1000 (-23.5614, -46.6559), parada Oscar Freire (-23.57, -46.69), destino Congonhas (-23.6267, -46.6554).

## Roteiro
1. `pnpm check` (inclui `tsc --noEmit`) e `pnpm test` → `# fail 0` nos testes do Worker e `Tests N passed` no Vitest (componentes do portal em `web/src/testes`: avaliação, avatar, passageiros, status, idioma, contrato do CSS). Depois `pnpm build`.
2. `pnpm e2e docs/verificacao/<aaaa-mm-dd>-<tema>` (ou `CHROME_PATH=<chrome> node scripts/cenarios-e2e.mjs <pasta> .`) → imprime `PASSOU`/`FALHOU` por cenário e grava `resultado.json` + PNGs. Esperado: todos `PASSOU`:
   - 1/1b/1c: "A caminho" com "Chega em N min" e "Chegada prevista às HH:mm · X km", marcador com 20+ atualizações em ≥ 8 s (desliza) e sprite do carro no quadro 8 (`background-position: 0 -160px`, grade 4x4 de 80px, 16 rumos) indo para o sul.
   - 2: a 900 m o status vira "Chegando" (barra `.passo[data-passo=a_caminho]` com texto "Chegando") e continua "Chegando" ao recuar para 1,4 km.
   - 3a/3b/3c: parado na saída com `fixTime` 70 s atrás → "Motorista no local" + aviso "Seu motorista chegou" + "Procure o Corolla Altis Preto, placa MOCK123." no cartão de status (`.painel.chegou`), com a placa grande; saiu → "Em viagem" com "Chega ao destino em"; parado no destino > 60 s → `#concluido` visível, `#cartao` escondido, `#avaliacao` visível.
   - 4: `falhar:true` por 60 s → `#conexao` "Aguardando o rastreador", `#atualizado` "Última posição há 1 min", carro continua no mapa; `falhar:false` → `#conexao` some em até 30 s.
   - 5: `tomtomFalha:true` → ETA em faixa "12–16 min", badge "Sem trânsito" e nota "sem considerar o trânsito".
   - 6: `DELETE /api/links/<id>` com `Authorization: Bearer dev-local` → h1 "Acompanhamento encerrado"; id inexistente → "Link expirado"; `POST /concluir` → "Serviço concluído". Nenhuma das três tem `#cartao` visível.
   - 7: em 360 px o cartão mostra foto, "Carlos", "Corolla Altis", "Preto", "MOCK123" e o axe (wcag2a/wcag2aa) não acusa violação critical/serious. 7b: o sino cabe numa linha (44 px, texto sem corte), com o fundo cinza-azulado do bloco do veículo. 7c: o avatar mostra a foto real (`naturalWidth` ≥ 16; o mock serve um retrato SVG de 96 px com `foto: true`).
   - T1: com o WebSocket aberto, posição nova chega por quadro `{"tipo":"dados"}` sem nenhum `/dados` a mais. T2: WebSocket bloqueado (`routeWebSocket` fecha com 1011) → o polling continua. T3 (precisa do par VAPID): o sino é um botão de 44 px; tocar liga (`POST /avisos` 201, `aria-pressed="true"`, "Aviso ligado", toast "Vamos avisar quando Carlos estiver chegando") e tocar de novo desliga (`DELETE` 204, toast "Aviso desligado"). T3c: o toast fica no rodapé da tela (24 px), centralizado (aparece/some com a classe `.on`, não com `hidden`). O headless não tem serviço de push: o cenário troca `PushManager.subscribe` por uma inscrição sintética, e o POST/DELETE vão ao Worker de verdade. T4: com a permissão `denied`, o toque abre a folha `#tc` com `#tc-aviso` ("Notificações bloqueadas", foco em `#tc-a-titulo`), sem nenhum pedido a `/avisos`; "Entendi" fecha.
   - B1–B5: modo simples sem `#passos`/`#eta`; sem foto → inicial "C" (B2b: foto 404 → "C"; B2c: pixel 1x1 → "C", nunca círculo vazio); 3 etapas em `#paradas` e 3 `.mk-etapa`; horário do ETA em America/Sao_Paulo com o navegador em Nova York; volta do segundo plano salta (≤ 4 posições) e reconsulta.
3. Lighthouse mobile (opcional, antes de publicar): `CHROME_PATH=<chrome> npx lighthouse http://127.0.0.1:36489/r/DevCompleto1 --preset=perf --form-factor=mobile --screenEmulation.mobile --chrome-flags="--headless=new"`. Esperado: LCP < 2,5 s e CLS < 0,1 (TBT fica alto no headless por WebGL em software; não é bloqueio).
4. Abra 2 ou 3 PNGs gerados e confira a olho (portal em cards, nov/2026):
   - cabeçalho azul-marinho com logo, "BETINHOS / Executive Service", "Reserva OS-N" (se houver), idioma e compartilhar;
   - a página rola normalmente (sem `#app` de altura fixa). Celular (390): uma coluna, status, mapa, motorista, trajeto e passageiros. Desktop (>= 900): duas colunas (status, motorista, trajeto e passageiros à esquerda; mapa `sticky` à direita);
   - cards brancos com borda e sombra, sem borda colorida lateral; placa Mercosul com faixa "BRASIL", avatar com aro dourado;
   - "Localização ao vivo": miniatura do mapa real (190 px no celular, 380 no desktop) com "Ampliar mapa" (`#ampliar`); toque amplia o mesmo mapa em tela cheia (`#mapa-caixa.ampliado`, sem segundo mapa), fecha com X (`#reduzir`), Esc ou clique no fundo (`#mapa-fundo`, desktop) e devolve a rolagem; "Atualizado há N s" abaixo do mapa;
   - "Trajeto e horários" (`#c-trajeto`): saída com "Agendado" e destino com "Previsto";
   - antes da saída (fase `agendado`, sem `etapas`, só `embarque`): o card mostra a "Saída" com o endereço e o horário "Agendado", o mapa tem um pino 1 no embarque centrado em zoom 15 (igual em 390 e 1280) e a atribuição do mapa abre recolhida no "i" (sem `.maplibregl-compact-show`). Link sem etapas: grave com `gravarTrackLocal` de `scripts/kv-local.mjs` um track `modo: "simples"`, `etapas: []`, `horarioAgendado` futuro (id de 12 caracteres);
   - versão `v0.0.x · data` pequena no canto inferior direito, sem cobrir conteúdo;
   - concluído: resumo da viagem e estrelas no cartão de status.
- Porta 36489 ocupada por um workerd que você não pode encerrar: suba outro com `npx wrangler dev --port 36491 --ip 127.0.0.1 --inspector-port 9231` e rode uma cópia temporária do e2e com `sed 's/127.0.0.1:36489/127.0.0.1:36491/' scripts/cenarios-e2e.mjs > scripts/_e2e-tmp.mjs` (apague depois).

## Animações do portal (web/src/estilo.css e componentes React)
- CSS puro quase tudo (transform, opacity); a biblioteca `motion` só no mapa ampliado (layout animation), na folha do passageiro (mola na entrada, saída de 200 ms, `AnimatePresence`) e na lista de passageiros (tags saindo, flash de sucesso). `MotionConfig reducedMotion="user"`. Tokens `--bt-ease-quint`, `--bt-ease-in`, `--bt-ease-spring`. Com `reducedMotion: 'reduce'` nada anima (a regra global zera durações e repetições; o JS checa `reduzMovimento`).
- Entrada: cards em cascata (`entra`, 320 ms, 60 ms entre eles) por CSS com `backwards`; termina visível mesmo sem JS. `html.entrou` (após 1 s) zera o atraso do que aparecer depois.
- Ampliar mapa: layout animation do `motion` no `.mapa-caixa` (mesmo MapLibre, `map.resize()` ao fim). Confira: Esc, X e clique fora fecham, inclusive abrindo e fechando no meio da animação (`#mapa-caixa.ampliado` e `html.sem-rolagem` coerentes depois de ~1 s) e `map.resize()` no fim.
- ETA: `#eta-min` dentro de `.rolo`; ao mudar, o número remonta com a classe `rola` e o `::after` sobe enquanto o novo entra (mova o carro com `POST /cenario`). Badge `#status` faz crossfade com um fantasma sem id (`[id=status]` deve contar 1); em "a caminho" mostra o ponto `.ao-vivo`. Barras `.passo i::after` enchem por `scaleX`.
- "Atualizado agora": `#vivo::after` pulsa a cada `posicao.atualizadoEm` novo.
- Passageiros: salvar um dado faz a tag "Falta ..." sumir (fade e escala) e a linha piscar (`.pax-flash`); a folha sobe com mola e desce em 200 ms sem capturar toque (`#pf` fica sem `hidden` até o fim da saída). Para ver a tag sumir, salve o e-mail do Roberto (2º da lista).
- Vídeos de referência (grave com `recordVideo`, `--use-gl=swiftshader --enable-unsafe-swiftshader`; sem ffmpeg com h264, fica em .webm): `~/.t3/userdata/attachments/portal-anim-390.webm` e `portal-anim-1280.webm`.

## Portal de passageiros (seção Passageiros e folha de edição)
- O flow `cadastro-passageiro-link` é falso no mock (`pnpm mock`, `POST /flow`, hash `d` x64). Copie `.dev.vars.exemplo` para `.dev.vars` (traz `CADASTRO_FLOW_URL_DEV=http://127.0.0.1:36490/flow`) antes do `pnpm dev:local`; depois `pnpm semear`.
- Links: `DevPassagei1` (3 passageiros, cadastro aberto), `DevPaxConcl1` (serviço concluído: só leitura, sem botão Editar), `DevAgendado1` (antes de 2 h do horário: "Viagem agendada para dd/mm às HH:mm", sem posição).
- Confira com playwright (viewports 390 e 360): lista com "Falta foto/telefone/e-mail"; Editar abre a folha; digitar e apertar Esc, X ou clicar fora abre "Descartar alterações?"; "Continuar editando" mantém o digitado; telefone inválido mostra erro; salvar fecha a folha e atualiza a lista (o mock guarda em memória: `pnpm mock` de novo zera). Sem `overflow-x` em 360.
- Repetir o roteiro: o mock guarda em memória e o Worker guarda a lista em `pax:<id>` e `paxfoto:*` no KV local, então "Falta foto" do Roberto some na 2ª rodada. Reinicie só o mock (`pnpm mock`), rode `pnpm semear` e apague as chaves `pax*` (`node node_modules/wrangler/bin/wrangler.js kv key list --binding=TRACK_KV --local` e `... kv key delete --binding=TRACK_KV --local <chave>`). Um viewport por rodada.
- Foto: gere um PNG local (ex.: Pillow 800x800 com ruído), `setInputFiles('#pf-arq-galeria', arq)`, espere `#pf-salvar` habilitar, salve com o POST atrasado (`page.route('**/passageiros/**')` com 1,8 s): durante "Salvando…" X, Esc e clique fora não fecham a folha nem abrem `#pf-conf`; ao terminar a folha fecha e Roberto perde "Falta foto" e ganha `<img>` no avatar.
- Link sem cadastro (ex.: `DevCompleto1`): `GET /r/<id>/passageiros` devolve 404 por contrato e a seção fica oculta; o Chromium registra isso no console como "Failed to load resource ... 404". É esperado (um único 404); qualquer outro erro é falha.
- Erros de console esperados: só avisos do WebGL do mapa. `__name is not defined` indica função interna embutida sem o shim (ver `PASSAGEIROS_SCRIPT`).
- Prints de referência: `docs/verificacao/2026-11-23-portal-passageiros/`. Flow real não é chamado: declare "não verificado com o flow real".

## Sem motorista e sem rastreio (fase 2, 25/11/2026)
- `POST/PUT /api/links` aceita pedido sem `placa` e com `rastreio: false`; `rastreio: true` sem placa → 400 "placa obrigatória para rastreio". Sem rastreio o link nasce com `vehicleId` nulo e `acharVeiculo` não é chamado; um PUT com placa da Infleet passa a rastrear, um PUT sem motorista volta a "em definição" sem revogar. Foto do carro só segue com a mesma placa.
- `/dados` publica `rastreio` (há `vehicleId`) e `emDefinicao` (sem motorista, sem veículo e sem placa); sem `vehicleId` a Infleet nunca é chamada e a fase fica "agendado" até o Dataverse concluir (limite conhecido).
- Página: `emDefinicao` → card "Motorista em definição" com o contato da central e o Sino; `rastreio === false` → sem `.col-b`/mapa e, no desktop, `.portal.sem-mapa` em coluna única centralizada. Links antigos (sem os campos) continuam com mapa.
- Testes: `tests/api-links.test.mjs` ("link sem rastreio…"), `tests/dados.test.mjs` (Infleet não chamada), `web/src/testes/em-definicao.test.tsx`. Cenários locais `DevDefinica1` e `DevSemRastr1` (`scripts/semear-local.mjs`): print a 390 e 1280 px.
- Plugin (`Betinhos.DriverRecordSharing`): `TrackingLinkRequest.Build` só recusa Solicitado (202410004), Cancelado (202410002), Cancelado com Ressalvas (202410010) e reserva sem embarque; sem motorista, sem carro, terceiro ou carro sem `InfleetId` manda `rastreio: false` (placa nula sem carro). `GenerateTrackingLinkPlugin` gera sem motorista e, com a reserva em Concluído (202410008), chama `/concluir` logo depois de gravar o link. `UpdateTrackingLinkPlugin` só faz DELETE quando o `Build` recusa; tirar o motorista vira PUT ("em definição"). Testes: `TrackingLinkRequestTests` (sem rastreio, status, embarque).
- Prova no DEV (depois do Deploy e com o Worker DEV publicado): gerar link numa reserva Confirmada sem motorista → página "Motorista em definição"; pôr motorista com Infleet → mapa; trocar por terceiro → sem mapa com placa; tirar o motorista → volta a "em definição" e o trace do Update mostra PUT, nunca DELETE.

## Redesenho "D" da página (25/11/2026, v0.0.48)

Vale por cima das descrições de layout acima (cards `.painel`, `.passos`, `#c-trajeto`, 2 colunas no desktop, rolo do ETA, `.badge`): a página agora é uma faixa marinho no topo e um corpo de coluna única (592 px) com cards sobrepondo a faixa.
- Faixa (`#status` título por fase, `#reserva`, `#eta` selo dourado só em a caminho/em viagem com ETA, `#passos` com 5 `li` feita/atual, `#frase` "Chega em X às HH:MM — N min antes do horário", seletor segmentado `#idioma` com `[data-idioma]`). Aeroporto (regex no embarque): `#boasvindas` (saudação dourada de 22 px, "Seja bem-vindo" / "Welcome" / "Bienvenido", em todas as fases antes do concluído); em no_local o título vira "<nome> espera você no desembarque" e `#frase` some (volta "Seu motorista espera você no desembarque." só sem nome do motorista).
- Corpo, na ordem: `#faixa-pax` (só enquanto faltar dado), mapa (só a caminho/no local/em viagem; `#selo-mapa` "Ao vivo" ou "Atualizado há X", `#mapa-km`, `#vivo`), `#cartao` (Seu motorista: placa, `#m-ligar`, `#m-whats`; em definição avatar "?" e sino aqui), `#viagem` com `ol#paradas` (`li.etapa[data-passo]`: confirmada, definido/definicao, aguardando, a_caminho, no_local, em_viagem, parada, chegada; atual dourado com `aria-current="step"`, feitas verdes; o sino `#sino-area` fica dentro da etapa atual, a caminho ou aguardando), passageiros, `#compartilhar`, Central 24h, rodapé. Sem rastreio: 4 etapas e nota "Este serviço não tem acompanhamento em tempo real.", sem mapa. Concluído: avaliação no topo, etapas todas feitas, sem mapa, passageiros nem compartilhar.
- Semente nova `DevAeroport1` (12 caracteres; ids com 13 dão 404). Para ver "concluído": `pnpm semear` e `curl -X POST -H 'Authorization: Bearer dev-local' http://127.0.0.1:36489/api/links/DevConcluir1/concluir`.
- Prints a 390x844 @2x fullPage dos estados definição, agendado, a caminho, sem rastreio, passageiros, concluído, paradas e aeroporto; comparar com a densidade da V1 (`link-passageiro-v1.png`): gap de 16 px entre cards, padding 20 px, sem emojis, pílulas só para estado. O único 404 de console esperado é `/passageiros` em link sem cadastro.
- Testes: `web/src/testes/portal.test.tsx` (aeroporto, título/barra, frases, linha do tempo por estado, sino) e `layout-css.test.ts`. Não verificado: comportamento com Infleet/Dataverse reais (ex.: OS-1993 no DEV) e Web Push real.

## Desktop (≥1024 px, 25/11/2026, v0.0.50)

O celular continua igual ao "D". No desktop (`useDesktop`, `(min-width: 1024px)`, troca ao redimensionar):
- Faixa fina como no PROD (`.faixa.fina`): marca à esquerda; à direita `#reserva` "Reserva OS-N", bandeira `#idioma-botao` com menu e `#compartilhar` (copia o link, `#copiado` "Link copiado"). Sem seletor segmentado e sem o card de compartilhar no corpo.
- `main.corpo.duas` com duas `.col`. Esquerda: herói em card (`.heroi-card`: `#boasvindas`, `#agenda` data · saída sem a reserva, `#status`, `#eta`, `#passos`, `#frase`), avaliação, `#faixa-pax`, motorista, passageiros, Central 24h. Direita: mapa (300 px; 190 px com altura ≤780) e `#viagem`.
- Mesma árvore nos dois modos: no celular as `.col` ficam `display:contents` e o `order` devolve a sequência faixa-pax, mapa, motorista, viagem, passageiros, compartilhar, Central 24h e rodapé. Prova: marcar `#c-mapa` (`dataset`) a 1440, redimensionar para 800 e conferir que a marca continua (o mapa não é recriado) e a ordem pelo `getBoundingClientRect().top`.
- Prints 1440x900 e 1280x720 sem fullPage de `DevCompleto1` (rolagem 0 nos dois) e `DevAgendado1`. Rolagem só aparece com a lista de passageiros (`DevAgendado1`, `DevAeroport1`), aceita.

## Casos de borda
- Infleet fora com o Durable Object recém-acordado (sem leitura em memória): a página recebe `{"tipo":"fonte_fora"}` e mostra "Aguardando o rastreador"; o log mostra `Leitura do alarm falhou`.
- Prévia do WhatsApp: `curl -s http://127.0.0.1:36489/r/DevCompleto1 | rg 'og:'` → título, descrição com horário e carro, `og:image` absoluto; revogado/expirado só com metatags genéricas.
- Link antigo (64 hex, `label` bruto): `/r/aaaa…a` abre no mesmo render, sem etapas, com "Chegando" só a caminho.
- `semPosicao:true` → "Localizando o veículo…" sem ETA; `fixTime` com mais de 15 min → "Posição desatualizada".
- Dois estados ao mesmo tempo em abas diferentes: o KV mescla marcos (mais antigo vence).
- Se um cenário falhar por tempo, repita: o estado das etapas fica no KV local; `pnpm semear` zera.
- O worker só processa posição com `fixTime` maior que o último visto (`t.ultimaPos`). No mock, mande `fixTime` sempre crescente; para simular chegada num link que já tinha posição, são 3 leituras no local (t, t+60 s, t+120 s), não 2.
- Auditoria de UX (modo Fluxo) com manifesto, screenshots `ux-*.png` e relatório: `docs/verificacao/2026-11-02-nivel-uber/ux-audit-fluxo.md` serve de modelo.

## Evidência obrigatória
- `resultado.json` com todos `ok: true`, PNGs dos 7 cenários + bordas, `# fail 0` do `pnpm test`, console sem erros (o próprio e2e checa).
- Lighthouse: versione só um `lighthouse.md` com as métricas; `lighthouse.report.json/html` ficam fora do commit (grandes). PNGs: reduza antes de commitar (ex.: `quantize(128)` no Pillow).

## Botão "Gerar link" no shell (fase 2)
- Regra igual à `TrackingLinkRequest.StatusAllowsLink` do plugin: bloqueia só Solicitado (202410004), Cancelado (202410002) e Cancelado com Ressalvas (202410010); sem exigência de motorista (`apps/shell/src/pages/geral/domain/link.ts`). No Operacional o botão vale também para motorista terceiro (página sem mapa).
- Provar: `pnpm exec vitest run src/pages/geral/domain/link.test.ts src/pages/geral/GeralPage.correcoes.test.tsx src/pages/operacional` em `apps/shell`; no mock, `#/operacional` → serviço da Rita Fernandes (terceiro) mostra "Gerar link" ativo.

## Aviso "Seu motorista é X" (fase 3, 25/11/2026)

- Regra (`src/viagem.mjs` `avisar`, `src/avisos.mjs` `MOTORISTA_DEFINIDO`): avisa quem ligou o sino quando a escala define o motorista (em definição → nome) ou troca (A → B), antes da viagem começar. Tirar o motorista, o mesmo motorista de novo, viagem iniciada ou concluída: só atualiza `s.motorista`, sem push. Na inscrição, o motorista de agora vira a base (não avisa o que a pessoa já vê); Viagem antigo sem `s.motorista` faz o mesmo na primeira leitura.
- Texto: título "Seu motorista é <primeiro nome>", corpo "<modelo cor> · <placa>" (o que houver) ou "Toque para ver os detalhes"; pt/en/es em `AVISOS`; tag `<id>:motorista_definido` (troca substitui a notificação anterior). Falha de entrega repete no alarm seguinte, até 3 vezes (`falhas.motorista_definido`).
- Sino em definição: "Avisar quando o motorista for definido", toast "Vamos avisar quando o motorista for definido e quando estiver chegando" (mesma inscrição liga os avisos de chegada).
- Testes: `node --test tests/avisos.test.mjs tests/viagem.test.mjs` ("avisos: motorista definido ou trocado…", "…inscrição com motorista já definido…") e `npx vitest run web/src/testes/em-definicao.test.tsx`.
- Prova no DEV (precisa do Deploy da develop e de um celular com o sino ligado): link sem motorista, ligar o sino, vincular motorista na reserva (`cr40f_Motorista@odata.bind`) → push em até ~1 min (o PUT do plugin chama `/recarregar`, que antecipa o alarm). Trocar o motorista → segundo push; tirar → nenhum.

## Limites
- Infleet, TomTom e OSRM reais não são chamados: declare "não verificado com Infleet real". Push real (FCM/Mozilla/Apple) não é enviado no local: a entrega no Android se testa depois do deploy com os segredos VAPID (passo no README). Publicação (`wrangler deploy`) e segredos são do Renan.

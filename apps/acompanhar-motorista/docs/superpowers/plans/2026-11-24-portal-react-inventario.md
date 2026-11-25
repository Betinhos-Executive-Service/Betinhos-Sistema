# Inventário da página /r/<id> para a migração React + Vite + TypeScript

Fonte: `src/pagina.mjs` (1402 linhas) e `src/passageiros-pagina.mjs` (342 linhas) na base v0.0.45 + `d24dbb1`.
Marcado `[x]` ao final quando o item existe no código novo (`web/src`) e foi verificado. Nada pode sumir.
Legenda de destino: W = Worker (`src/`), R = React (`web/src`), C = CSS, M = mapa imperativo (`web/src/mapa`).

## 1. Worker e HTML (W)
- [x] Rota `/r/<id>`: ativo = 200, expirado/revogado = 404; cabeçalhos `Content-Type`, `Cache-Control: no-store`, `Referrer-Policy: strict-origin`, `X-Robots-Tag: noindex`.
- [x] Metatags OG/WhatsApp por link ativo: título, descrição (`descricaoPrevia`), `og:image` 1200x630, `twitter:card`, `apple-touch-icon`, `og:site_name`, `og:type`, `robots noindex`, `theme-color`.
- [x] Manifest por link só com `cfg.manifest` válido.
- [x] Link inválido: metatags genéricas ("Betinhos Executive Service" / "Transporte executivo"), sem MapLibre, texto no HTML servido, status 404.
- [x] Bootstrap injetado: `CFG` {tomtom, telefone, whatsapp, aoVivo, vapid, completo}, versão, estado.
- [x] `/dados`, `/ao-vivo`, `/passageiros`, `/avaliacao`, `/avisos`, fotos, manifest: sem mudança de contrato.
- [x] `d.versao !== VERSAO` recarrega uma vez por versão (`sessionStorage recarregou:<versao>`).
- [x] Preconnect para tiles.openfreemap.org; fonte Manrope; MapLibre agora por `import()` dinâmico (chunk separado), só no link ativo.
- [x] `<body ontouchstart="">` e `-webkit-tap-highlight-color` (toque no iOS).
- [x] `public/sw.js` servido na raiz (escopo registrado `/r/<id>`).

## 2. Idioma (R)
- [x] pt/en/es; escolha: localStorage `bt-idioma` > `?lang=` > navigator > pt.
- [x] Interpolação `{var}`; `cor()` traduz cores do veículo; `local()` para `Intl`.
- [x] `document.documentElement.lang` e `document.title` por idioma; título muda (`titulo.chegou`, `titulo.concluido`).
- [x] Seletor (botão com bandeira, menu, `aria-expanded`, `aria-pressed`, fecha por clique fora e Esc, foco volta ao botão).
- [x] Troca de idioma refaz textos dinâmicos (aria das estrelas, contador, marcadores, `#tc`, badge, render).

## 3. Cabeçalho e utilitários (R)
- [x] Logo, "BETINHOS / Executive Service", `#reserva` (OS-n a partir do título), seletor, `#compartilhar` (navigator.share; senão copia o link, `.copiado` 2 s, `#copiado` sr).
- [x] `#toast` (`.on`, 3 s, limpa 220 ms depois), `#diag` (`?debug=1`).
- [x] Classe `html.entrou` após 1 s; esqueletos (`.esqueleto`) até o 1º render.
- [x] Rodapé `.versao` com `v0.0.X · dd/mm/aaaa HH:mm`.

## 4. Dados e conexão (R)
- [x] Polling `/dados` a cada 15 s (aba oculta não busca), `cache:no-store`, `?debug=1`.
- [x] 404 recarrega a página; falha define `falhandoDesde`; sem dados mostra badge warn `status.semResposta`.
- [x] `aria-busy` no `#painel` durante a busca.
- [x] `desvio` do relógio do servidor (`servidorEm`); `agoraServidor()`.
- [x] Relógio de 1 s: `vivo.agora` / `vivo.ha` / `vivo.parado`; `#conexao` (off após 60 s, `conexao.rastreador`, `conexao.reconectando`); `#vivo.velha`; badge warn se posição > 15 min.
- [x] Pulso no ponto "ao vivo" a cada posição nova (`#vivo::after`).
- [x] WebSocket `/ao-vivo` (só `cfg.aoVivo`): esperas 5/15/60/120 s, abrir em 5 s, vigia mudo 45 s; `fim` recarrega; `dados` para o polling; `fonte_fora`; ao fechar volta o polling.
- [x] Aba oculta > 60 s fecha o WS; ao voltar: `saltarProxima`, `atualizar()`, reconecta.

## 5. Painel de status (R)
- [x] h1 sr `#titulo` (sem "OS-n"), badge `#status` (load/info/ok/warn), crossfade com fantasma, ponto `.ao-vivo` em "a caminho".
- [x] Aviso de chegada `#aviso` (carro, cor, placa, espera >= 1 min, vibração com ativação do usuário, `.painel.chegou`).
- [x] ETA: `etaEstavel`, rótulos `eta.cerca`/`eta.destino`/`eta.chega`, rolagem de dígito, "às HH:mm · km", `#eta-aviso` sem trânsito, oculto com `fonteIndisponivel` ou `!completo`.
- [x] Passos (4) com `feita`/`atual`/`chegando`, `aria-current`, primeiro rótulo vira "Chegando".
- [x] Modo simples esconde passos e linha de status; agendado (`textoAgendado`, Brasília, h23) esconde-os também.
- [x] `#local` (endereço atual da posição).
- [x] Botões de contato da central (WhatsApp/ligar), escondidos enquanto o cartão do motorista mostra contato.
- [x] Concluído: `encerrar` (para timers/ws, esconde vivo/passos/linha/eta/aviso/local/paradas/trajeto/cartão, mostra contato), `#concluido` + resumo (saída, chegada, duração, distância), `#app.fim`, `#app.fim-card`.
- [x] Avaliação: estrelas (`aria-pressed`, `.on`, `.com-nota`), comentário (máx. 1000, contador, `.perto` >= 900), `POST /avaliacao`, 200/409 jaAvaliado = obrigado, 429, erro, sem conexão, `d.avaliado`.

## 6. Cartão do motorista e folhas (R)
- [x] Avatar com foto só após carregar (>= 16 px), senão inicial; troca de foto mantém inicial.
- [x] Nome, ligar/WhatsApp do motorista (`tel:+55`, `wa.me/55`, remove prefixo 55), fallback da central, aria por caso, `#m-nota`.
- [x] Veículo: foto sem fundo branco (canvas, flood-fill, cache), `nomesCarro` (marca+modelo, só modelo se cortar), cor traduzida, placa, ajuste no resize.
- [x] Folha `#tc` (motorista / carro / aviso do sino `negado` e `iphone`): foco preso, Esc, clique fora, devolve foco, `aria-label` por tipo, `tc-baixo`.
- [x] Sino: `#sino-area` só com `cfg.vapid`; registra `/sw.js` com escopo; some sem SW/Push/Notification; iPhone fora da tela de início abre folha `iphone`; `denied` abre `negado`; `subscribe` com chave VAPID; `POST /avisos`; falha desfaz; `DELETE`; toasts `sino.ligado`/`ligadoSemNome`/`desligado`/`erro`; botão desabilitado durante a operação.

## 7. Trajeto e mapa (R + M)
- [x] Lista de paradas (numeração, check nas feitas, "Agora", `.sr`, horários agendado/previsto só com mais de uma etapa), `c-trajeto` oculto sem etapas.
- [x] MapLibre via `import()`: estilo positron, pitch 45, sem rotação, `fadeDuration 0`, atribuição compacta (+ "Rotas © TomTom"), NavigationControl no desktop, atribuição recolhida no celular, prédios 3D, camadas `percorrido`/`rota` com borda, `diag` em debug.
- [x] Uma instância; `ResizeObserver` chama `resize` e re-enquadra.
- [x] Carro: sprite 4x4 de 80 px (16 rumos), `girar`, `rumoAlvo`, `planoDeMovimento` (parado/saltar/animar), `carroNaRota`, `saltarProxima`.
- [x] Marcadores de etapa `.mk-etapa` (atual/feita/futura, check, aria-label).
- [x] Enquadramento (`folga`, `pontosDeInteresse`), botão `#centrar`, `dragstart`/`zoomstart` param de seguir.
- [x] Sequência final: deita em 2D, linha do trajeto cresce (1200 ms), card entra; plano B 3500 ms; sem mapa 600 ms.
- [x] Ampliar/reduzir (Motion layout): `role=dialog`, `aria-modal`, `sem-rolagem`, foco preso (reduzir/centrar), Esc, clique no fundo, rolagem e foco restaurados.
- [x] `#vivo` com `#atualizado` e `#conexao`.
- [x] Diagnóstico `?debug=1` (camada e texto em `#diag`).

## 8. Passageiros (R)
- [x] Seção `#pax` oculta sem cadastro/lista; `GET /passageiros` (404 = não existe); recarrega a cada 60 s e ao voltar à aba (se aberto e sem edição); não redesenha enquanto envia.
- [x] Lista: avatar `/foto?v=`, fallback inicial, nome, telefone e e-mail mascarados, tags "Falta ..." (só se aberto), "Editar"; encerrado: linhas sem botão e `#pax-nota`.
- [x] Folha `#pf`: prévia, valores atuais, telefone/e-mail, câmera (`capture=user`) e galeria, Salvar desabilitado se não sujo/enviando/preparando.
- [x] Foto: decodifica (createImageBitmap/img), fundo branco, lado 1280, JPEG 0,8 a 0,3 até 2,5 MB, miniatura 288; erros `pax.err.heic`/`abrir`/`grande`.
- [x] Validação `pax.err.tel`/`email`; corpo `{fotoBase64, miniaturaBase64?, telefone?, email?}`; erros 400/409/410/413/429/rede; 409/410 encerra o cadastro.
- [x] Sucesso: fecha, flash verde, tags saem, toast `pax.salvo`.
- [x] Fechar: X, clique fora, Esc (captura); sujo abre "Descartar alterações?" (Continuar editando / Descartar); durante envio não fecha; foco volta à origem; saída rápida (baixo no celular, fade/escala no desktop).
- [x] Campos desabilitados enquanto envia; botão "Salvando...".

## 9. Animações (R + C)
- [x] CSS: entrada em cascata, rolagem do ETA, badge, barras `scaleX`, pulso "ao vivo", `:active`, hover lift, `prefers-reduced-motion`.
- [x] Motion: ampliar mapa (layout), folha de passageiro (mola + saída curta), lista (tags saindo, flash), `MotionConfig reducedMotion="user"`.

## 10. Ferramentas
- [x] `pnpm build`, `pnpm push` (bump + build + deploy), `pnpm dev:local`, `pnpm check`, `pnpm test`.
- [x] `deploy.yml`: build antes do deploy, testes em PR, paths `web/**`.
- [x] e2e `scripts/cenarios-e2e.mjs` passa; seletores/ids preservados.

## Verificação final (24/11/2026)
- Todos os itens acima marcados `[x]`: cada um existe em `web/src` (React/CSS/mapa), no Worker (`src/pagina.mjs`, `src/worker.mjs`) ou nos testes. Nada foi removido sem substituto.
- Testes: base 285 (Node) -> 272 Node + 44 Vitest = 316. Os testes de HTML inline de `pagina.test.mjs`, `avaliacao.test.mjs` e `worker-dados.test.mjs` viraram testes do Worker (bootstrap, 404, OG, `ASSETS`) ou testes de componente e de contrato CSS em `web/src/testes`.
- E2E local (`scripts/cenarios-e2e.mjs`): 26 passou, 0 falhou (com VAPID de teste no `.dev.vars` e Durable Objects limpos antes de cada execução).
- Armadilhas encontradas: (1) o worker do MapLibre 6 é arquivo próprio e precisa de `setWorkerUrl` (corrigido); (2) reexecutar o e2e sem `rm -rf .wrangler/state/v3/do` deixa o cenário 3a sem posição.
- Diferença visual conhecida contra a produção v0.0.45: o selo "A caminho" usa o ponto pulsante (vem do commit `d24dbb1`, já presente na base de origem desta migração), não a seta de navegação.

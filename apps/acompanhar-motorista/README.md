# Link Acompanhamento de Motorista

Página pública, estilo "acompanhe sua corrida", para o passageiro ou cliente seguir o veículo da Betinhos ao vivo. Atualiza a cada 15 segundos e expira sozinha.

- Produção: `https://acompanhar-motorista.betinhosexecutiveservice.workers.dev/r/<id>` (Worker `acompanhar-motorista`)
- DEV: `https://acompanhar-motorista-dev.betinhosexecutiveservice.workers.dev/r/<id>` (Worker `acompanhar-motorista-dev`, `env.dev` do `wrangler.jsonc`)
- Hospedagem: Cloudflare Workers, conta Betinhos (`a26e65df…`)
- Dados: Infleet (posição e motorista) + TomTom (rota com trânsito) com OSRM de reserva + OpenFreeMap (mapa)
- Custo: gratuito dentro das cotas (TomTom free: 2.500 rotas/dia)

## O que a página mostra

- Logo oficial da Betinhos.
- Etapas: A caminho → No local → Em viagem → Concluído. "Chegando" é um geofence com histerese: liga a menos de 1 km (ou dentro da área do lugar, ou a 5 min) e só desliga acima de 2 km e 10 min, para não oscilar na borda.
- Previsão de chegada (minutos, horário e distância) com trânsito em tempo real quando há `TOMTOM_KEY`. Sem trânsito (OSRM) ou com posição com mais de 90 s, vira faixa ("12–16 min") e a página avisa "Sem trânsito".
- Carro 3D (sedan preto, sprite `public/carro.webp`, 16 rumos de 22,5° em grade 4x4 de 80 px) desliza entre posições (interpolação no cliente) e troca o quadro conforme o rumo; aba que volta do segundo plano salta direto para a posição atual.
- Sem resposta da Infleet ou da rede: a tela fica como está, com "Última posição há X" e um aviso discreto ("Aguardando o rastreador", "Reconectando…"); volta sozinha.
- Horário agendado ao lado da previsão e aviso quando a previsão passa 5 min do horário.
- Motorista (primeiro nome e foto da Infleet, ou inicial), modelo, cor e placa em destaque.
- Aviso "Seu motorista chegou" com placa, modelo e cor; título da aba muda e o celular vibra.
- Botões "Falar no WhatsApp" e "Ligar para a central" (número da central, nunca o do motorista).
- Mapa em tela cheia; o card não cobre veículo, rota nem destinos.

## Como os links nascem

A ferramenta `link_acompanhamento` do conector Infleet (`Skill Agendamento/infleet-mcp`) grava no KV compartilhado e devolve a URL deste Worker.

Contrato da chave `track:<id>` (namespace `ff5ff0133e2741799e0c660dea0ddf80`):

```json
{
  "vehicleId": "uuid do veículo na Infleet",
  "placa": "ABC1D23",
  "destino": { "lat": -23.4356, "lon": -46.4731, "label": "Aeroporto GRU" },
  "destinoFinal": { "lat": -23.5614, "lon": -46.6559, "label": "Av. Paulista" },
  "titulo": "Embarque Aeroporto GRU",
  "horarioAgendado": "2026-10-06T17:00:00.000Z",
  "corVeiculo": "Prata",
  "modeloVeiculo": null,
  "expiraEm": "2026-10-06T21:00:00.000Z",
  "criadoPor": "email de quem gerou",
  "estado": { "chegouEmbarqueEm": "…", "saiuEmbarqueEm": "…", "concluidoEm": "…" }
}
```

- `destino` é o embarque. `destinoFinal`, `horarioAgendado`, `corVeiculo` e `modeloVeiculo` são opcionais.
- `estado` é gravado por este Worker (no máximo 3 escritas por link): chegou = a até 150 m do embarque; saiu = passou de 300 m depois de chegar; concluído = a até 150 m do destino final.
- Validade: TTL do KV (padrão 4 h, máximo 24 h). Expirado → página "Link expirado" com contato da central.

## Rotas e consumo

| Rota | Retorno |
|---|---|
| `GET /r/<id>` | Página HTML (404 com "Link expirado" se não existir, ou "Acompanhamento encerrado" se foi revogado nas últimas 24 h) |
| `GET /r/<id>/dados` | JSON (contrato abaixo); cache de 12 s por isolate; 404 `{"expirado":true,"revogado":bool}` |
| `GET /r/<id>/foto/motorista` e `/foto/veiculo` | Foto enviada na criação (404 se não houver) |
| `GET /logo-betinhos.png` | Logo oficial (pasta `public/`) |
| `POST /r/<id>/avaliacao` | Avaliação do serviço pelo passageiro (ver abaixo) |
| `GET /r/<id>/ao-vivo` | WebSocket com o Durable Object `Viagem` do link (quadros `{tipo:"dados"}`, `fonte_fora`, `fim`) |
| `POST`/`DELETE /r/<id>/avisos` | Inscreve ou cancela o aviso por web push deste aparelho (404 sem os segredos VAPID) |
| `GET /r/<id>/manifest.webmanifest` | Manifesto para instalar a página na tela de início |

### Contrato de `/dados`

Um só formato para links novos, antigos e em modo simples:

| Campo | Significado |
|---|---|
| `modo` | `completo` (etapas, ETA, rota) ou `simples` (só posição e cartão) |
| `fase` | `a_caminho`, `no_local`, `em_viagem`, `concluido` (null no modo simples) |
| `chegando` | boolean separado da fase (geofence com histerese, persistido no KV como `chegandoEm`) |
| `eta` | `{ minutos, faixa: [min, max] \| null, transito, km }` ou null (sem rota, posição com mais de 3 min, no local, modo simples) |
| `etapas` | lista com `tipo`, `rotulo`, `lat`, `lon`, `visitada`, `atual` (omitida no modo simples) |
| `posicao`, `rota`, `motorista`, `veiculo`, `marcos`, `avaliado` | posição com `atualizadoEm`, rota com `coords`/`fonte`, cartão do motorista, horários dos marcos |
| `servidorEm` | hora do servidor, para a página calcular a idade da posição sem depender do relógio do celular |
| `fonteIndisponivel` | true quando a Infleet não respondeu e a resposta veio da reserva em memória (até 15 min) |

A rota é viva e fica em memória por isolate (nenhuma escrita a mais no KV): o Worker guarda uma trilha das últimas leituras confiáveis do carro, calcula o rumo dele e pede a rota já com esse rumo (TomTom `vehicleHeading`, OSRM `bearings`), com a posição encaixada na via. A cada leitura a rota é cortada na projeção do carro e só é recalculada quando ele sai dela por mais de 80 m em 2 leituras seguidas ou quando ela envelhece (2 min a menos de 5 km do alvo, 4 min mais longe). Rota nova que manda o carro na contramão, de volta pelo caminho de onde veio ou num desvio 2,5× maior que o necessário é tratada como suspeita: a anterior continua até a nova se confirmar. Em aeroportos (GRU, CGH, VCP, SJK, SDU, GIG) a chegada usa o terminal citado na reserva. Tudo isso só enquanto alguém está com a página aberta. Sem `TOMTOM_KEY`, ou se a TomTom falhar, usa OSRM (sem trânsito) e a página avisa.

Diagnóstico: abra o link com `?debug=1`. Eventos `rota_suspeita` ficam nos logs do Worker (Observability).

## Criar link pela Operacional

`POST /api/links` com `Authorization: Bearer <LINK_API_SECRET>` e corpo JSON (`Content-Type: application/json`):

```json
{ "placa": "ABC1D23", "embarque": "Av. Paulista, 1000, São Paulo", "destinoFinal": "Aeroporto de Guarulhos",
  "horarioAgendado": "2026-10-13T14:00:00Z", "titulo": "Embarque OS-1", "corVeiculo": "Prata",
  "modeloVeiculo": "Corolla", "validadeHoras": 6 }
```

Obrigatórios: `placa` e `embarque`. `validadeHoras` fica entre 0,5 e 24 (padrão 4).

Campos opcionais novos (o payload antigo continua aceito):

```json
{ "paradas": ["Rua Oscar Freire, 900", "Av. Faria Lima, 3477"], "observacoes": "texto livre da reserva",
  "motorista": { "nome": "Carlos", "telefone": "(11) 98765-4321", "fotoBase64": "data:image/jpeg;base64,…" },
  "veiculo": { "fotoBase64": "…" } }
```

- `paradas`: até 8, na ordem. Com `observacoes`, saída, paradas e destino são normalizados pela IA (`claude-haiku-5-5`, segredo `ANTHROPIC_API_KEY_ACOMPANHAMENTO`, timeout 8 s); se ela falhar, segue o texto cru.
- `fotoBase64`: base64 puro ou com prefixo `data:image/...;base64,`; até 400 KB cada. Ficam em `foto:<id>:motorista|veiculo` com o mesmo TTL do link e são servidas em `GET /r/<id>/foto/motorista|veiculo`.
- `motorista.telefone`: telefone corporativo. Sem ele, a página usa `CENTRAL_TELEFONE`/`CENTRAL_WHATSAPP`.
- Modo do link: `completo` quando todas as etapas foram geocodificadas com confiança alta e nenhum salto passa de 150 km (status, etapas no mapa e ETA); senão `simples` (só o carro e os cartões de motorista e veículo). Links antigos (sem `modo`) seguem no formato anterior.

| Status | Corpo |
|---|---|
| 200 | `{"link":"https://…/r/<id>","expiraEm":"ISO"}` |
| 401 | `{"erro":"não autorizado"}` (sem cabeçalho ou segredo errado) |
| 400 | `{"erro":"…"}` (campo inválido ou ausente) |
| 502 | `{"erro":"…"}` (veículo não achado na Infleet ou endereço não geocodificado) |

### Atualizar um link (reserva editada)

`PUT /api/links/<id>` com o mesmo corpo e cabeçalho do `POST /api/links`. Chamado pelo Dataverse quando a reserva com link ativo muda endereço, parada, trajeto, horário ou motorista: recalcula as etapas no mesmo link, sem mudar id nem validade. Etapa que continua no mesmo lugar (< 150 m) mantém o progresso; saída nova zera os marcos do serviço. A página aberta mostra o trajeto novo na próxima atualização (15 s).

| Status | Corpo |
|---|---|
| 200 | `{"atualizado":true,"mesmaSaida":true}` |
| 404 | `{"erro":"link não encontrado"}` (inexistente, revogado ou expirado) |
| 409 | `{"erro":"serviço já concluído"}` |
| 401 / 400 / 502 | como no `POST` |

### Revogar um link

`DELETE /api/links/<id>` (`<id>` = o final da URL `/r/<id>`: 12 caracteres base62 nos links novos; links antigos têm 64 hexadecimais minúsculos) com `Authorization: Bearer <LINK_API_SECRET>`. Apaga `track:<id>` do KV e grava a lápide `revogado:<id>` (24 h); a página pública passa a mostrar "Acompanhamento encerrado" (sem cartão do motorista) e, depois disso, "Link expirado".

| Status | Corpo |
|---|---|
| 200 | `{"revogado":true}` (idempotente: também 200 se o link já não existir) |
| 401 | `{"erro":"não autorizado"}` |
| 400 | `{"erro":"id inválido"}` (nem 12 caracteres base62 nem 64 hexadecimais minúsculos) |

### Concluir um link

`POST /api/links/<id>/concluir` com `Authorization: Bearer <LINK_API_SECRET>`. Chamado pelo Dataverse quando a reserva é concluída: encerra o acompanhamento mesmo que o GPS não tenha chegado ao destino. Grava `concluidoEm` e `concluidoPor: "dataverse"` em `track:<id>`, cria a chave `concluido:<id>` (ISO, que o GPS não regrava) e reduz o TTL do link e das fotos para 2 h. A página mostra "Serviço concluído" e para de atualizar.

| Status | Corpo |
|---|---|
| 200 | `{"concluido":true}` |
| 401 | `{"erro":"não autorizado"}` |
| 400 | `{"erro":"id inválido"}` |
| 404 | `{"erro":"link não encontrado"}` |

O segredo `LINK_API_SECRET` é configurado à mão em cada Worker (ver "Segredos por Worker" em Configuração).

## Tempo real e avisos

- **Arquitetura**: cada link tem um Durable Object `Viagem` (SQLite, plano gratuito), dono da leitura da Infleet, do percorrido e das inscrições de aviso. `/dados` e `/ao-vivo` passam por ele; sem o binding `VIAGEM`, `/dados` segue pelo caminho antigo (cache de 12 s por isolate). O KV continua sendo a fonte do link e recebe os marcos só quando eles mudam.
- **Página**: abre um WebSocket (hibernação: o DO dorme com a conexão aberta sem cobrar duração). O polling de 15 s só para depois do primeiro quadro de dados e volta se o WebSocket cair (nova tentativa em 5 s, 15 s, 60 s e depois a cada 2 min; 45 s mudo fecha). Aba oculta por 60 s fecha o WebSocket.
- **Ritmo do alarm** (`src/ritmo.mjs`): alguém olhando → 15 s; só inscrição de aviso → 60 s a partir de 60 min antes do horário (15 s perto do alvo ou no local); ninguém → sem alarm. Leituras de até 10 s são reaproveitadas por todas as conexões; Infleet fora, a última leitura segue valendo por 15 min marcada como "Aguardando o rastreador".
- **Avisos**: o sino do cartão inscreve o aparelho (até 5 por link). Cada evento sai uma vez por link: chegando ao embarque, chegou, viagem iniciada, chegando ao destino e concluído, no idioma da inscrição. iPhone só recebe com a página na tela de início (o cartão mostra a dica).
- **Prévia**: o link no WhatsApp mostra título, horário e veículo (`og:*`) com a arte `public/og-betinhos.png`, refeita por `pnpm og` (Playwright).

### Consumo estimado (plano gratuito, < 100 links/dia; estimativa)

| Recurso | Por viagem (2 h) | Limite/dia | Capacidade |
|---|---|---|---|
| Requisições DO (alarms + conexões) | ~320 | 100.000 | ~300 |
| Duração DO (~1,5 s × 128 MB por alarm) | ~55 GB-s | 13.000 GB-s | ~230 |
| Linhas gravadas (setAlarm + estado) | ~400 | 100.000 | ~250 |

Estouro de limite faz as operações do DO falharem e a página cai no polling. Confira o consumo real no painel do Cloudflare (Workers > Durable Objects) um dia depois do deploy.

### Segredos VAPID (ligam o sino)

Sem os três segredos o sino não aparece e o resto funciona. Não há workflow que gere ou grave chave (o CI nunca roda `wrangler secret`): gere o par à mão e grave só no Cloudflare.

Gere um par novo (não reaproveite o do App Motoristas) e grave só no Cloudflare:

```bash
node scripts/gerar-vapid.mjs                 # imprime as chaves; nada é gravado
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_JWK
npx wrangler secret put VAPID_SUBJECT        # ex.: mailto:contato@exemplo.com.br
# Worker DEV: o mesmo comando com --env dev (par próprio, não reaproveite o do PROD)
```

Trocar o par invalida as inscrições existentes (os aparelhos precisam tocar no sino de novo).

### Testar o aviso num Android

1. Crie um link de teste com horário daqui a uns 40 min e abra no Chrome do Android (não em aba anônima).
2. Toque no sino e permita as notificações; o botão passa a "Avisos ativados".
3. Feche a aba. Quando o carro estiver perto do embarque (a página mostraria "Chegando"), o aviso chega em até 60 s; tocar nele abre o link.
4. Sem aviso: confira em Configurações > Apps > Chrome > Notificações e o log do Worker (`npx wrangler tail`, procure "Avisos falharam").

## Publicação

O GitHub é o único caminho de publicação (decisão do Renan, 05/11/2026; ver o `CLAUDE.md` da raiz). São dois Workers com a mesma base de código:

| Worker | Nome | Quando publica | Como |
|---|---|---|---|
| DEV | `acompanhar-motorista-dev` (`env.dev` do `wrangler.jsonc`) | push na `develop` que mude o app | job `worker` do `deploy-cloudflare.yml` (environment `dev`): `wrangler deploy --env dev` |
| PROD | `acompanhar-motorista` (nível raiz do `wrangler.jsonc`) | push na `main` (PR `develop → main`) | caminho "worker" do `producao.yml` (`packages/deploy/caminho-publicacao.mjs`, environment `prod-front`): `wrangler deploy`, sem soluções nem Dataverse |

- PR: o job `acompanhar-motorista` do `ci.yml` roda `pnpm check`, `pnpm test` e `pnpm build` só quando o PR toca o app.
- Teste, `docs/`, `scripts/`, os testes do front e `.md` não publicam (regra em `caminho-publicacao.mjs`).
- Versão sem commit (a `main` é protegida): `scripts/bump-version.mjs --publicada <url do Worker>` lê a versão que o Worker de destino mostra no ar, parte da maior entre ela e a do `package.json`, soma 1 no PATCH e grava `package.json` e `src/version.mjs` só no runner. A página mostra `vX.Y.Z · dd/mm/aaaa HH:mm` (America/Sao_Paulo). DEV e PROD têm sequências independentes. Worker fora do ar: parte da versão do repositório.
- Depois do deploy, `scripts/conferir-no-ar.sh` confere o rodapé de `/r/CheckDeploy0` com a versão nova e o `/logo-betinhos.png`.
- Links ativos não caem: o deploy troca só o código; KV e segredos ficam como estão, e a página aberta recarrega sozinha uma vez quando vê a versão nova. Os workflows nunca rodam `wrangler kv`, `wrangler secret` nem `wrangler delete`.
- Precisa do secret `CLOUDFLARE_API_TOKEN` nos environments `dev` e `prod-front` (Cloudflare > My Profile > API Tokens > template "Edit Cloudflare Workers", conta Betinhos).

### Worker DEV (feito à mão uma vez)

O KV do DEV (`acompanhar-motorista-dev`) foi criado em 24/11/2026 e o id está em `env.dev.kv_namespaces` do `wrangler.jsonc`. Se o id voltar a ser `KV_DEV_ID_PENDENTE`, o job `worker` do `deploy-cloudflare.yml` não publica (só avisa).

1. Os segredos do Worker DEV (abaixo) se gravam com `pnpm exec wrangler secret put <NOME> --env dev`.
2. O primeiro `wrangler deploy --env dev` cria o Worker e o Durable Object `Viagem` (migration `v1` própria); o Deploy da `develop` faz isso sozinho.

### Domínios `acompanhe.betinhos.com.br` (PROD) e `acompanhe.dev.betinhos.com.br` (DEV)

O DNS do `betinhos.com.br` fica na Locaweb, então o Worker não aceita domínio próprio direto. O projeto Pages `acompanhe` (`pages/`) repassa tudo ao Worker por service binding, com a mesma URL; o Worker monta os links novos com o domínio de quem chamou `/api/links`. Na Locaweb, os CNAMEs `acompanhe` e `acompanhe.dev` apontam para `acompanhe.pages.dev`. A function escolhe o Worker pelo domínio (decisão do Renan, 25/11/2026): `acompanhe.betinhos.com.br` → `acompanhar-motorista` (PROD); o resto (`acompanhe.dev`, `pages.dev`, previews) → `acompanhar-motorista-dev`. Publicação do Pages à mão: `cd pages && npx wrangler pages deploy --branch main`. Os links já enviados no `workers.dev` continuam valendo.

## Configuração

- Variáveis (`wrangler.jsonc`): `CENTRAL_TELEFONE`, `CENTRAL_WHATSAPP`. Opcionais, só para apontar a serviços de teste: `INFLEET_URL`, `TOMTOM_URL`, `OSRM_URL`.
- Segredos por Worker (só os nomes; os valores ficam no Cloudflare, nunca no Git). Grave à mão com `pnpm exec wrangler secret put <NOME>` (PROD, já configurados) e `pnpm exec wrangler secret put <NOME> --env dev` (DEV):

| Segredo | Uso | PROD | DEV |
|---|---|---|---|
| `ANTHROPIC_API_KEY_ACOMPANHAMENTO` | IA que normaliza endereços e classifica avaliações | sim | sim |
| `AVALIACAO_FLOW_URL` | URL do flow que recebe a avaliação (nunca vai ao log) | sim | sim |
| `CADASTRO_FLOW_URL_PROD` | URL do flow de cadastro de passageiros do Dataverse PROD (usada quando o link tem `cadastroAmbiente: "prod"`) | sim | opcional |
| `CADASTRO_FLOW_URL_DEV` | URL do flow de cadastro de passageiros do Dataverse DEV (usada quando o link tem `cadastroAmbiente: "dev"`) | opcional | sim |
| `INFLEET_TOKEN` | token da Infleet (posição e motorista) | sim | sim |
| `LINK_API_SECRET` | Bearer das chamadas `/api/links` da Operacional e do Dataverse | sim | sim (valor próprio) |
| `TOMTOM_KEY` | rota com trânsito (TomTom) | sim | sim |
| `VAPID_PRIVATE_JWK` | chave privada do web push (sino) | sim | sim (par próprio) |
| `VAPID_PUBLIC_KEY` | chave pública do web push | sim | sim (par próprio) |
| `VAPID_SUBJECT` | contato do web push (`mailto:`) | sim | sim |

  Atalhos locais para os três primeiros do PROD: `pnpm segredo` (Infleet), `pnpm segredo:tomtom`, `pnpm segredo:anthropic` (scripts PowerShell que pedem o valor e gravam no Cloudflare).

```bash
pnpm install
pnpm dev       # compila o portal e roda wrangler dev --remote na porta 51734
pnpm build     # compila o portal React (web/ -> web-dist/)
pnpm deploy:dev   # plano B local do Worker DEV: versão, build e wrangler deploy --env dev (o normal é o GitHub)
pnpm test      # testes do Worker (node --test) e do portal (Vitest + Testing Library)
```

### Portal React (`web/`)

A página `/r/<id>` é um app React + Vite + TypeScript (`web/src`; `web/portal.html` é a entrada). O build vai para `web-dist/` (fora do Git), que o Worker publica como Static Assets. O Worker continua dono de `/r/*`: devolve o `portal.html` do build com as metatags da prévia e o bootstrap do link (`window.__BT__`: estado, versão, configuração) e responde todas as APIs (`/dados`, `/ao-vivo`, `/passageiros`, `/avaliacao`, `/avisos`, fotos, manifesto). Link expirado ou revogado leva o texto no HTML e nunca baixa o MapLibre (que é um chunk separado, carregado só no link ativo). Sem `web-dist/` o Worker responde 503 em `/r/<id>`: rode `pnpm build` antes de `wrangler dev`/`deploy` (`pnpm dev` e `pnpm dev:local` já fazem isso).

Para editar a interface com recarga: em um terminal `pnpm dev:web` (`vite build --watch`, regrava `web-dist/` a cada salvamento) e em outro `wrangler dev --port 36489 --ip 127.0.0.1` (ou `pnpm dev:local`, que compila uma vez e sobe); recarregue a página no navegador.

A versão aparece no canto inferior esquerdo da página (`v0.0.x · dd/mm/aaaa HH:mm`).

### Desenvolvimento local com mock (sem Infleet nem TomTom)

```bash
cp .dev.vars.exemplo .dev.vars      # aponta o Worker para o mock; nenhum segredo real
pnpm mock                           # Infleet GraphQL + OSRM + TomTom falsos em 127.0.0.1:36490
pnpm dev:local                      # compila o portal e roda wrangler dev na porta 36489 (KV local em .wrangler/state)
pnpm semear                         # grava links de exemplo (DevCompleto1, DevParadas01, DevSimples01…)
pnpm e2e                            # cenários Playwright + screenshots mobile em docs/verificacao/<data>/ (pasta fora do Git)
```

Para o sino no teste local, gere um par só de teste (`node scripts/gerar-vapid.mjs`) e cole no `.dev.vars`. Para repetir o e2e com os mesmos links, apague antes o estado local do DO (`rm -rf .wrangler/state/v3/do`) com o `dev:local` parado: o `semear` só regrava o KV.

O mock aceita `POST /cenario` com `{lat, lon, speed, fixTime, falhar, tomtomFalha, foto, semPosicao}` para mover o carro, derrubar a Infleet ou a TomTom. Na primeira vez rode `pnpm exec playwright install chromium`. Roteiro completo na skill `.claude/skills/verificar-acompanhamento`.

## Avaliação do serviço

Na fase "concluído" a página mostra "Como foi o seu serviço?" com 5 estrelas e um comentário opcional (até 1000 caracteres). Depois do envio, ou se o link já foi avaliado (`avaliado: true` no `/dados`, sem o conteúdo), mostra "Obrigado pela avaliação".

`POST /r/<id>/avaliacao` com `{ "nota": 1-5, "comentario": "opcional" }`:

| Resposta | Quando |
|---|---|
| `200 { ok: true }` | Avaliação gravada no KV (o envio ao Flow segue em segundo plano) |
| `400` | Nota não inteira de 1 a 5, comentário acima de 1000 caracteres ou JSON inválido |
| `404` | Link inexistente ou expirado |
| `409` | Serviço ainda não concluído (Dataverse via `concluido:<id>`/`concluidoPor`, ou GPS) |
| `409 { jaAvaliado: true }` | Já existe `avaliacao:<id>`: só a primeira vale |
| `429` | Mais de 5 POSTs no mesmo link em 1 hora (contador `limite-avaliacao:<id>`) |

- Classificação: sem comentário → `sem_comentario`. Com comentário, o Haiku (`claude-haiku-5-5`, mesmo segredo `ANTHROPIC_API_KEY_ACOMPANHAMENTO`, effort low, timeout 8 s) devolve `elogio`, `sugestao` ou `reclamacao` e um resumo curto, considerando a nota. Se a IA falhar: nota ≥ 4 elogio, ≤ 2 reclamação, 3 sugestão. O uso de tokens sai no log (`evento: "ia_avaliacao"`).
- Gravação: `avaliacao:<id>` no KV por 30 dias, com `nota`, `comentario`, `classificacao`, `resumo`, `avaliadoEm`, `ia` e `envio { ok, tentativas, ultimoErro, enviadoEm }`. A metadata `pendente` marca o que falta enviar.
- Envio ao Dataverse: `POST` JSON `{ linkId, titulo, nota, comentario, classificacao, avaliadoEm }` para a URL do segredo `AVALIACAO_FLOW_URL` (timeout 10 s). A URL nunca vai para o log. Configure à mão com `pnpm exec wrangler secret put AVALIACAO_FLOW_URL` (e `--env dev` no DEV).
- Reenvio: Cron Trigger a cada 15 min (`triggers.crons` no `wrangler.jsonc`) percorre `avaliacao:*` pendentes, até 20 por execução e até 5 tentativas por avaliação. Sem o segredo, a avaliação fica pendente sem gastar tentativa e é enviada quando ele for configurado.

## Créditos

O carro do mapa é um render 3D (câmera ortográfica a 55°, fundo transparente, 16 ângulos) feito a partir do modelo "Generic Sedan Car" (https://sketchfab.com/3d-models/generic-sedan-car-58c33766470d46e7b2aed542650494e5) de Márcio Meireles (https://sketchfab.com/marciomeireles), licenciado sob CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). A pintura foi recolorida para preto e as texturas originais não são usadas; o arquivo do modelo não está no repositório.

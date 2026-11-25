# Portal de Consulta do Cliente — Fase 2: link sem motorista e sem rastreio

Status: **rascunho para aprovação** (25/11/2026; D1–D4 decididas no mesmo dia, seção 11). Só documento; nada implementado, publicado ou alterado no Dataverse.
Base: fase 1 (`2026-11-23-portal-cliente-fase1-passageiros-design.md`) e decisões de 23/11/2026 (memória `portal-consulta-cliente`).

## 1. Objetivo

A operação passa a poder gerar o link `/r/<id>` **antes da escala**, assim que o serviço deixa de ser Solicitado. Enquanto
não houver motorista, a página mostra o card **"Motorista em definição"** com os dados do serviço e o cadastro de
passageiros da fase 1. Quando o motorista é atribuído, o mesmo link passa a mostrar motorista, carro e (se houver
rastreador) mapa e ETA, sem reenviar nada ao cliente.

Critério de pronto (DEV): gerar o link de uma reserva Confirmada sem motorista → abrir e ver "Motorista em definição",
horário, embarque, destino e passageiros; atribuir motorista com carro Infleet → a página recarregada mostra motorista,
carro e mapa; tirar o motorista → volta a "Motorista em definição" com o mesmo link; motorista terceiro sem rastreador
→ link gerado com nome, carro e placa, sem mapa.

## 2. Fora de escopo

- **Fase 3**: Web Push "Seu motorista é X" e aposentar `apps/cadastro-passageiro`.
- Mapa só com o ponto de embarque (exigiria geocodificar sem o carro; D1).
- Gerar link sozinho ao atribuir motorista: continua sendo ação da operação.
- Mudança no flow `cadastro-passageiro-link` e no link de cadastro (fase 1 continua igual).

## 3. O que já existe (mapeado em 25/11/2026)

| Camada | Onde | Comportamento hoje | Muda? |
|---|---|---|---|
| Shell (Geral) | `apps/shell/src/pages/geral/domain/link.ts:9-15`, ação "Gerar link" em `GeralPage.tsx:542` | só 1 linha, status Programado e com motorista | Sim (seção 6.1) |
| Shell (Operacional) | `apps/shell/src/pages/operacional/components/ServiceDetail.tsx:134-135` | desabilitado só para terceiro | Sim |
| Gerar | `GenerateTrackingLinkPlugin.LoadPayload` (`:118-119`) e `TrackingLinkRequest.Build` (`:34-37`) | recusa "Serviço sem motorista.", "Motorista terceiro sem rastreador.", "Motorista sem carro atual.", "Carro sem rastreador na Infleet."; não olha status | Sim |
| Atualizar | `UpdateTrackingLinkPlugin` (assíncrono; Update da reserva e Create/Update de `cr40f_servicosporpassageiro`) | só age se já existe link; PUT com o corpo da criação; se o payload der erro (sem motorista, carro, Infleet) faz DELETE e zera o link (`:57-66`) | Sim: nunca revoga por falta de motorista |
| Encerrar | `RevokeTrackingLinkPlugin` | Concluído → `/concluir`; Cancelado e Cancelado com Ressalvas → DELETE | Não |
| Worker API | `src/api-links.mjs`: `validarPedido` (`:30-34`) exige `placa`; `criarLink` (`:186`) chama `acharVeiculo(placa)` e dá 502 se não achar; PUT revalida | Sim |
| Worker dados | `src/dados.mjs`: `calcularDados` (`:267-271`) consulta `getVehicle(vehicleId)` sempre que o link não está concluído nem agendado (> 2 h); `lerTrajeto` (`:112`) idem; `semearTrilha` (`:38`) já pula sem `vehicleId`; `cartoes()` (`:171-188`) já tolera motorista nulo | Sim |
| Durable Object | `src/viagem.mjs:90` chama `calcularDados` no alarm | Herda a proteção do `calcularDados` |
| Página | `web/src/componentes/CardMotorista.tsx:44-48` (fallback `t("m.motorista")`, inicial no Avatar) | Sim: estado "em definição" e "sem rastreio" |

Status (`cr40f_status`, `PluginConfig.cs:103-109`): 202410000 Pré-reserva, 202410001 Confirmado, 202410002 Cancelado,
202410004 Solicitado, 202410005 Programado, 202410008 Concluído, 202410010 Cancelado com Ressalvas (Em execução não tem
constante no plugin; conferir na metadata antes de implementar).

## 4. Arquitetura escolhida

O link deixa de depender do carro. Três modos, derivados do que o plugin consegue montar:

| Modo | Quando | Página |
|---|---|---|
| `definicao` | reserva sem motorista | card "Motorista em definição", dados do serviço, passageiros; sem mapa, sem ETA |
| `sem-rastreio` | motorista sem carro atual, terceiro sem rastreador ou carro sem `InfleetId` | motorista (nome, foto), carro e placa quando houver; sem mapa, sem ETA |
| `rastreio` | motorista com carro Infleet (hoje) | como hoje |

1. **Plugin**: `TrackingLinkRequest.Build` deixa de recusar pelas três regras do carro e por falta de motorista; continua
   recusando sem endereço de embarque. Monta o payload com `placa`, `motorista` e `veiculo` só quando existirem e manda
   `rastreio: true|false` (true só com `InfleetId`). O modo `definicao` é `motorista == null`.
2. **Status** (D4): gera em todos os status, menos Solicitado, Cancelado e Cancelado com Ressalvas. Reserva Concluída:
   o plugin cria o link e em seguida chama `/concluir` (a página abre direto no resumo e avaliação).
3. **Worker**: `placa` vira opcional; `acharVeiculo` só roda com `rastreio: true`. Sem `vehicleId`, `calcularDados` e
   `lerTrajeto` não chamam a Infleet e devolvem posição, ETA e trilha nulos, mantendo etapas, horário e passageiros.
   O PUT aceita a transição entre modos: ganhar placa refaz a busca na Infleet; perder placa zera `vehicleId` e a trilha.
4. **Atualização** (D3): `UpdateTrackingLinkPlugin` nunca revoga por falta de motorista, carro ou rastreador; manda PUT
   com o modo novo. Só revoga com status de cancelamento (já é o Revoke) ou payload inválido de verdade (sem embarque).

Por que assim: um caminho só para os três casos (D2 reaproveita o modo do Worker sem custo extra); o link enviado ao
cliente nunca morre por mudança de escala.

Alternativa descartada: link "provisório" separado trocado pelo definitivo na escala (dois links para o cliente, e a
operação teria de reenviar).

## 5. Fluxo do usuário

1. Operação abre a reserva Confirmada (sem motorista) e clica "Link de acompanhamento" (Operacional ou Geral).
2. Plugin gera o link no modo `definicao`; a operação envia ao cliente como hoje.
3. Cliente abre: "Motorista em definição — avisaremos aqui quando a escala for confirmada", horário, embarque, destino,
   trajeto e passageiros (cadastro da fase 1 funcionando).
4. Escala atribui o motorista → `UpdateTrackingLinkPlugin` faz PUT → o DO avisa a página aberta (`avisarViagem`), que
   recarrega os dados e mostra o motorista; com Infleet, o mapa aparece a partir da janela de 2 h, como hoje.
5. Motorista trocado ou removido → PUT com o modo novo; o link continua o mesmo.
6. Cancelado → link revogado (como hoje). Concluído → resumo e avaliação (como hoje).

## 6. Contrato de dados e API

### 6.1 Shell

- `gerarLinkBlock` (`link.ts`): exige 1 linha e status fora de {Solicitado, Cancelado, Cancelado com Ressalvas}; mensagem
  "O link não pode ser gerado para serviço Solicitado ou Cancelado."; sai a exigência de motorista.
- `ServiceDetail.tsx`: o botão deixa de bloquear terceiro; bloqueia pelos mesmos status.
- Erros do plugin seguem em `LinkErro` sem mudança.

### 6.2 Plugin → Worker (`POST` e `PUT /api/links`)

Campos que mudam (o resto igual à fase 1):

| Campo | Antes | Agora |
|---|---|---|
| `placa` | obrigatório | opcional; ausente sem carro atual |
| `motorista` | sempre | ausente sem motorista |
| `veiculo`, `corVeiculo`, `modeloVeiculo`, `marcaVeiculo` | sempre | só com carro |
| `rastreio` | — | `true` só com `InfleetId` do carro |
| `validadeHoras` | saída + 4 h, teto 14 dias | igual; link de Pré-reserva com saída além de 14 dias vence antes e a operação gera de novo |

Respostas novas do Worker: nenhuma. `validarPedido` passa a exigir só `embarque`; `rastreio: true` sem `placa` → 400
"placa obrigatória para rastreio".

### 6.3 Worker → página (`/dados`, `/ao-vivo`)

- Novo campo público `modo`: `definicao` | `sem-rastreio` | `rastreio`.
- Em `definicao` e `sem-rastreio`, `posicao`, `eta` e `trilha` vêm nulos; a página não monta o mapa.
- `descricaoPrevia` (`pagina.mjs:15-19`) em `definicao`: horário + "Motorista em definição".
- Textos novos em `web/src/i18n.tsx` e `src/idiomas.mjs` (pt, en, es): `m.emDefinicao`, `m.emDefinicaoAviso`, `m.semRastreio`.

## 7. Segurança

- Nada novo exposto: o `/dados` continua sem telefone do motorista fora do que já publica e sem campos internos.
- Link gerado mais cedo vive mais tempo (até 14 dias, já decidido na fase 1); a revogação por cancelamento continua.
- Repo público: testes com dados fictícios, sem URL `sig=`.

## 8. Mudanças por repositório/pasta

| Pasta | Mudança |
|---|---|
| `packages/plugins/Betinhos.DriverRecordSharing` | `TrackingLinkRequest.Build`, `GenerateTrackingLinkPlugin.LoadPayload` (sem recusa por motorista/carro, status, `rastreio`, Concluído → `/concluir`), `UpdateTrackingLinkPlugin` (não revoga por modo), testes |
| `apps/acompanhar-motorista` | `api-links.mjs` (placa opcional, `rastreio`, transição de modo no PUT), `dados.mjs` (sem Infleet sem `vehicleId`), `pagina.mjs`, `web/src` (CardMotorista nos 3 modos, mapa só em `rastreio`), i18n, testes |
| `apps/shell` | `geral/domain/link.ts`, `ServiceDetail.tsx`, testes |
| Steps do Update | conferir no checkout principal os `filteringattributes` (o script de registro não está no worktree); se faltar `cr40f_motorista`, entra por migration/registrador, não à mão |

## 9. Verificação

- Testes unitários: plugin (Build nos 3 modos, status bloqueados, Update sem DELETE por modo), Worker (POST/PUT sem placa,
  troca de modo, `calcularDados` sem `vehicleId` não chama a Infleet), página (card nos 3 modos), shell (`gerarLinkBlock`).
- DEV, pelo Deploy da `develop`: roteiro do critério de pronto (seção 1) em `acompanhe.dev.betinhos.com.br`, com print
  dos três modos; conferir no trace do Update que não houve DELETE ao tirar o motorista.
- Atualizar `verificar-link-acompanhamento` e `verificar-portal-worker` com os três modos.
- PROD: Worker pelo job `worker` do `producao.yml`; plugin e shell pelos caminhos rápidos do develop→main.

## 10. Tarefas

1. Worker: placa opcional, `rastreio`, `calcularDados`/`lerTrajeto` sem `vehicleId`, `modo` no `/dados` (com testes).
2. Página: CardMotorista em `definicao` e `sem-rastreio`, mapa condicionado, i18n, prévia.
3. Plugin: Build e LoadPayload sem recusas de modo, status, Concluído → `/concluir`, Update sem revogar (com testes).
4. Shell: regra de status no Geral e no Operacional (com testes).
5. Conferir filtering attributes do Update no DEV; ajustar se preciso.
6. Prova no DEV e skills de verificação.

Ordem: 1 → 2 → 3 → 4 (o Worker aceita o payload novo antes de o plugin mandá-lo; o plugin velho continua compatível).

## 11. Decisões (25/11/2026)

- **D1** Sem motorista: card "Motorista em definição" com os dados do serviço, sem mapa.
- **D2** Terceiro sem rastreador ou carro sem Infleet: gera o link sem mapa, com motorista, carro e placa.
- **D3** Motorista removido depois: o link volta a "Motorista em definição"; não revoga.
- **D4** Status: gera em todos menos Solicitado e Cancelado (inclui Cancelado com Ressalvas); Concluído é permitido.

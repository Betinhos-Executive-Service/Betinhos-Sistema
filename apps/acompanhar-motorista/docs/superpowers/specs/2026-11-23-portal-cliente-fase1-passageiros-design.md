# Portal de Consulta do Cliente — Fase 1: passageiros no link de acompanhamento

Status: **rascunho para aprovação** (23/11/2026; D1–D4 decididas no mesmo dia, seção 11). Só documento; nada implementado, publicado ou alterado no Dataverse.
Origem das decisões: grill de 23/11/2026 (memória `portal-consulta-cliente` do projeto Sistema Betinhos).

## 1. Objetivo

O link de acompanhamento `/r/<id>` (este Worker) passa a ter uma seção **Passageiros**: cada passageiro da reserva
aparece com dados mascarados e pode enviar **foto, telefone e e-mail novos**, sem login. É o primeiro passo para o
`/r/<id>` virar o portal de consulta do cliente e, na fase 3, substituir o `apps/cadastro-passageiro` do Sistema.

Critério de pronto: a operação gera o link pelo botão "Link de acompanhamento" do shell; o cliente abre, vê os
passageiros da reserva na ordem da escala, envia foto/telefone/e-mail de um deles e o registro
`cr40f_bancodedados` do DEV fica atualizado (foto no SharePoint); depois de a reserva ficar Concluída, o envio é recusado
e a seção fica só leitura.

## 2. Fora de escopo

- **Fase 2**: link sem motorista ("motorista em definição"); hoje o plugin recusa gerar sem motorista, carro atual e Infleet, e isso continua.
- **Fase 3**: Web Push "Seu motorista é X" e aposentar `apps/cadastro-passageiro`.
- Login, cadastro de passageiro novo, troca de passageiro da reserva, edição de nome ou endereço.
- Remarcação: se a data da reserva mudar muito, a operação gera o link de novo (a atualização mantém a validade, como hoje).

## 3. O que já existe (mapeado em 23/11/2026)

| Peça | Onde | Reaproveita? |
|---|---|---|
| Página e API do link | este repo: `src/worker.mjs` (`/r/<id>`, `/dados`, `/ao-vivo`, `/avaliacao`, `/avisos`), `src/api-links.mjs` (`POST/PUT/DELETE /api/links`, `/concluir`, Bearer `LINK_API_SECRET`) | Sim, ganha rotas novas |
| Dados do link | KV `TRACK_KV`, chave `track:<id>`; o Worker **não tem credencial do Dataverse**, recebe tudo do plugin | Sim |
| Validade do link | `TrackingLinkRequest.Build` (plugin): saída + 4 h, **limitada a 24 h**; o Worker também limita a 24 h (`validarPedido`) | Muda: saída + 4 h, teto de 14 dias (D1) |
| Gerar/atualizar/encerrar | `Betinhos.DriverRecordSharing`: `GenerateTrackingLinkPlugin` (Custom API `new_GerarLinkAcompanhamento`, lê como o usuário), `UpdateTrackingLinkPlugin` (PUT), `RevokeTrackingLinkPlugin` (Update de `cr40f_status`: Concluído → `/concluir`, Cancelado/Cancelado com Ressalvas → DELETE) | Sim, com acréscimos |
| Cadastro de passageiro | `apps/cadastro-passageiro` (Worker) → flow HTTP `cadastro-passageiro-link` (`op` = `ler`/`foto`/`salvar`, autenticado pelo **hash SHA-256 do token** procurado em `cr40f_linkcadastro.cr40f_tokenhash`) | Sim: o flow inteiro, sem mudança |
| Regras do flow (testadas em `packages/deploy/flows/cadastro-passageiro-link.test.mjs`) | escopo pelos filhos `_cr40f_geral_value` (ou `_cr40f_passageiro_value` do link); vencido/revogado → 410 e marca Expirado; fora do escopo → 404; **30 envios por link → 429**; foto `<passageiroId>.jpg` + `.min.jpg` na pasta Passageiros/Fotos do **SharePoint**, link por caminho, sem compartilhamento; `ler` devolve telefone/e-mail **só mascarados** | Sim |
| Link de cadastro | `Cr40f.Cadastro.Plugin`: `GerarLinkCadastroHandler` (Custom API `new_GerarLinkCadastro`, 36 h, revoga os links ativos anteriores do mesmo escopo), `PassageirosDoServico.Ids` | Sem mudança; revogação mútua aceita (D3) |
| Cliente de foto | `apps/cadastro-passageiro/public/app.js`: reduz no canvas, `toBlob`, miniatura 288 px (~15 KB); `public/validacao.mjs` (telefone/e-mail) | Copiar para este repo |

Metadata conferida no DEV em 23/11/2026:

- `cr40f_servicosporpassageiro` (set `cr40f_servicosporpassageiros`): `cr40f_geral` → `cr40f_reservadeveculos` (navigation `cr40f_Geral`), `cr40f_bancodedados` → `cr40f_bancodedados` (navigation `cr40f_BancodeDados`), `cr40f_ordemdeselecao` (Integer), `new_enderecodesaidacolunaservicosporpassageiro` (Memo).
- `cr40f_reservadeveculos` (set `cr40f_reservadeveculoses`): não tem mais `cr40f_passageiro1..4`; tem `new_linkacompanhamento`, `new_linkacompanhamentoexpiraem`. `cr40f_status`: 202410000 Pré-reserva, 202410004 Solicitado, 100000001 Requer Análise, 202410001 Confirmado, 202410005 Programado, 202410006 Em Execução, 202410008 Concluído, 202410002 Cancelado, 202410010 Cancelado com Ressalvas.
- `cr40f_bancodedados` (set `cr40f_bancodedadoses`): `cr40f_nomedopassageiro`, `cr40f_telefone`, `cr40f_email`, `new_linkdafoto` (String).
- `cr40f_linkcadastro` (set `cr40f_linkcadastros`): `cr40f_reserva`, `cr40f_passageiro` (Lookup), `cr40f_tokenhash`, `cr40f_expiraem`, `cr40f_ultimouso`, `cr40f_envios`, `cr40f_status` (1 Ativo, 2 Usado parcialmente, 3 Expirado, 4 Revogado). Não tem coluna de origem.

## 4. Arquitetura escolhida

O link de acompanhamento carrega, só do lado do servidor, uma **credencial de cadastro** igual à do cadastro-passageiro:

1. `GenerateTrackingLinkPlugin`, depois de validar a reserva com o usuário chamador, cria um `cr40f_linkcadastro` do
   serviço inteiro (`cr40f_passageiro` vazio) com 32 bytes aleatórios → token Base64Url → `cr40f_tokenhash`,
   `cr40f_expiraem` = validade do link de acompanhamento, revogando antes os links ativos do serviço inteiro (mesma regra do `GerarLinkCadastroHandler`; D3). O token é descartado; só o hash segue.
2. O plugin manda o hash ao Worker no `POST /api/links` (`cadastro: { hash, ambiente }`). O Worker guarda em `track:<id>`
   (campos internos, nunca publicados no `/dados`).
3. A página chama rotas novas do Worker; o Worker chama o flow `cadastro-passageiro-link` com `{ hash, op, ... }`
   usando a URL do flow do ambiente certo (segredo do Worker). **O flow não muda**: escopo, máscara, limite de 30 envios,
   SharePoint e expiração continuam sendo dele.

Por que assim: o Worker continua sem credencial do Dataverse; o flow já testado faz todo o trabalho com dados
pessoais; o navegador nunca vê token, hash nem URL do flow; a credencial de cadastro morre junto com o link.

Alternativas descartadas: (a) o Worker ler o Dataverse direto (exigiria app registration e segredo novo no Worker, e
duplicaria máscara/escopo/SharePoint); (b) embutir o link do cadastro-passageiro na página (dois links, duas validades,
token no navegador).

## 5. Fluxo do usuário

1. Operação, no shell: botão "Link de acompanhamento" (status diferente de Solicitado/Cancelado) → copia o link e envia (WhatsApp/e-mail).
2. Cliente abre `/r/<id>`. Até 2 h antes da saída (D1) vê "Viagem agendada para dd/mm às HH:mm" + seção Passageiros; perto da saída, o mapa ao vivo de hoje + seção Passageiros recolhida abaixo do cartão.
3. Seção Passageiros: um cartão por passageiro, na ordem `cr40f_ordemdeselecao`: primeiro nome, miniatura da foto atual (D2), telefone `(11) •••••-4321`, e-mail `ma•••@empresa.com.br`, selos "falta foto/telefone/e-mail".
4. "Atualizar dados" abre uma folha (sheet) com: foto (câmera ou galeria, reduzida no aparelho), telefone, e-mail; envia só o que foi preenchido. Clique fora, X e Esc fecham; com alteração não salva pergunta "Descartar alterações?" ("Continuar editando" / "Descartar"); durante o envio não fecha.
5. Sucesso: cartão atualizado com o valor novo mascarado e "Dados enviados". Erros com texto claro: limite de envios, link vencido, serviço concluído, falha temporária (manter o que foi digitado).
6. Reserva Concluída (ou link expirado/revogado): seção só leitura, "Cadastro encerrado para este serviço".

Idiomas: os textos novos entram em `src/idiomas.mjs` (pt, en, es), como o resto da página.

## 6. Contrato de dados e API

### 6.1 Plugin → Worker (`POST /api/links`, Bearer `LINK_API_SECRET`)

Campo novo, opcional (link sem ele funciona como hoje, sem seção Passageiros):

```json
{ "cadastro": { "hash": "<64 hex minúsculos>", "ambiente": "dev" | "prod" } }
```

- `validarPedido`: `hash` precisa casar `^[0-9a-f]{64}$`, `ambiente` ∈ {dev, prod}; senão 400.
- Gravado em `track:<id>` como `cadastroHash` e `cadastroAmbiente`. `PUT /api/links/<id>` (atualização) preserva os dois se o corpo não trouxer `cadastro`.
- `validadeHoras` passa a aceitar até 336 h = 14 dias (D1; hoje 24).

### 6.2 Página → Worker (rotas novas, mesma origem)

`GET /r/<id>/passageiros` → 200

```json
{
  "aberto": true,
  "motivo": null,
  "passageiros": [
    { "id": "<guid>", "primeiroNome": "Mariana", "temFoto": true, "temTelefone": true,
      "telefoneMascarado": "(11) •••••-4321", "temEmail": true, "emailMascarado": "ma•••@empresa.com.br" }
  ]
}
```

- `aberto: false` com `motivo` = `"concluido"` | `"expirado"` quando o envio está travado (a lista ainda aparece).
- Link sem `cadastroHash` → 404 (a página esconde a seção). Link inexistente/expirado → 404 como as outras rotas.
- Ordem: a de `cr40f_ordemdeselecao`. O flow monta a lista em paralelo (o cadastro-passageiro ordena por nome); passa a devolver `ordem` (`cr40f_ordemdeselecao`) no `ler` e o Worker ordena por ela (D4), com nome como desempate.
- Só passa adiante campos da lista acima; telefone/e-mail só se contiverem `•` (mesma regra de `limparLer`).
- Cache: KV `pax:<id>` com a resposta limpa, TTL = resto do link; regravado só quando muda; apagado no envio. A primeira abertura não espera o flow (2–5 s) se o cache existir.

`GET /r/<id>/passageiros/<guid>/foto` (D2): JPEG da miniatura (flow `op: "foto"`, cache KV `paxfoto:<id>:<guid>`, gravado também no envio) (`Cache-Control: private, max-age=300`, `nosniff`, CSP `default-src 'none'`), 404 sem foto.

`POST /r/<id>/passageiros/<guid>` com `{ fotoBase64?, miniaturaBase64?, telefone?, email? }` → `{ ok: true, passageiro: {...mascarado} }`

| Status | Quando |
|---|---|
| 400 | corpo inválido, nenhum campo, telefone/e-mail fora do formato, foto que não é JPEG base64 |
| 403 | `Origin` diferente da do Worker |
| 404 | link sem cadastro, passageiro fora do escopo (o flow decide) |
| 409 | serviço concluído (`concluidoPor: "dataverse"`, chave `concluido:<id>` ou fase concluída) — o Worker recusa antes do flow |
| 410 | link de cadastro vencido ou revogado (flow) |
| 413 | corpo acima de 4 MB |
| 429 | limite por IP (Worker) ou 30 envios no link (flow) |
| 502 | flow fora; a página mantém o que foi digitado |

### 6.3 Worker → flow

Exatamente o contrato atual do `cadastro-passageiro-link`: `POST <URL do flow>` com `{ hash, op: "ler" }`,
`{ hash, op: "foto", passageiroId }`, `{ hash, op: "salvar", passageiroId, fotoBase64?, miniaturaBase64?, telefone?, email? }`.
Status repassados: 200, 400, 404, 410, 429, 500. Timeout de 15 s no Worker.

## 7. Segurança (link sem login)

- **Quem tem o link vê a lista**: o link pode ser repassado (ex.: secretária manda ao grupo). Por isso só primeiro nome, telefone/e-mail mascarados pelo flow, nada de sobrenome, documento, empresa ou endereço. A miniatura da foto atual aparece (D2): só a de 288 px, nunca a foto inteira; só para passageiro do escopo (o flow confere).
- **Credenciais fora do navegador**: o hash e a URL do flow ficam no KV e nos segredos do Worker; teste garante que `/dados`, `/passageiros` e o HTML não contêm `cadastroHash` nem `sig=`.
- **Segredos novos do Worker**: `CADASTRO_FLOW_URL_DEV` e `CADASTRO_FLOW_URL_PROD` (a URL tem `sig=`; via `wrangler secret put`/script `configurar-segredo.ps1`, nunca no repo, em log ou na wiki). O Worker escolhe pelo `cadastroAmbiente` do link.
- **Escrita**: só `POST` da mesma origem (`Origin`), corpo ≤ 4 MB, foto validada como JPEG base64 (miniatura ≤ 300.000 caracteres), telefone/e-mail com a mesma validação do cadastro-passageiro (`validacao.mjs` copiado).
- **Limite de envio**: binding `ratelimits` no `wrangler.jsonc` (sugestão 20 por minuto por IP + link) + os 30 envios por link do flow. Leituras: o cache do KV absorve repetição; limite de 60/min por IP.
- **Expiração**: `cr40f_expiraem` do link de cadastro = expiração do link de acompanhamento (o KV some no mesmo instante). Revogar/cancelar a reserva revoga os dois.
- **Trava na conclusão**: duas camadas. (1) Worker recusa `POST` com 409 quando o link está concluído; (2) `RevokeTrackingLinkPlugin`, ao concluir ou cancelar, marca Revogado (4) os `cr40f_linkcadastro` ativos do serviço inteiro da reserva, então o flow responde 410 mesmo que algo passe pelo Worker.
- **Sem indexação**: as rotas novas herdam o `X-Robots-Tag: noindex` de `/r/`.
- **Logs**: o Worker loga só evento, status e id do link; nunca telefone, e-mail, base64 ou hash.
- **Repo do Sistema é público**: migration, plugin e testes sem URL de flow, `sig=`, domínio de tenant ou dado real de passageiro (o teste do flow já barra `sharepoint.com`/`dynamics.com`).

## 8. Mudanças por repositório

### 8.1 acompanhar-motorista (este repo)

- `src/api-links.mjs`: aceitar e preservar `cadastro`; teto de `validadeHoras` 336 h (D1).
- `src/passageiros.mjs` (novo): rotas `GET/POST /r/<id>/passageiros[...]`, chamada ao flow, cache `pax:<id>`, limpeza (`limparLer`/`payloadSalvar` trazidos do cadastro-passageiro), trava 409.
- `src/validacao-cadastro.mjs` (novo, cópia de `apps/cadastro-passageiro/public/validacao.mjs`; na fase 3 este vira a fonte).
- `src/worker.mjs`: roteamento das rotas novas; `semIndice` já cobre.
- `src/pagina.mjs` + `src/idiomas.mjs`: seção Passageiros, folha de edição, redução da foto no aparelho (trecho de `app.js` do cadastro-passageiro), estados aberto/só leitura/erro.
- `src/dados.mjs`/`src/viagem.mjs` (D1): não consultam a Infleet nem mostram posição antes de `horarioAgendado − 2 h` (fase `agendado`).
- `wrangler.jsonc`: binding `ratelimits`. Segredos `CADASTRO_FLOW_URL_DEV/PROD` (fora do repo).
- Testes `node:test` em `tests/` para tudo acima; `scripts/mock-servicos.mjs` ganha o flow falso (`ler`/`foto`/`salvar`) para `pnpm dev:local`.
- `.claude/skills/verificar-acompanhamento/SKILL.md`: passo de verificação da seção Passageiros.

### 8.2 Sistema Betinhos (`~/Desktop/vscode/Sistema Betinhos`, PR para `develop`)

- **Schema**: nenhuma mudança (D3). **`Cr40f.Cadastro.Plugin`**: nenhuma mudança; gerar o link do cadastro-passageiro revoga a credencial do portal (a seção passa a responder 410 "link vencido") e gerar o link de acompanhamento revoga o do cadastro-passageiro. A operação usa um ou outro até a fase 3.
- **`Betinhos.DriverRecordSharing`**:
  - `TrackingLinkCadastro.cs` (novo, ~40 linhas): revoga os `cr40f_linkcadastro` ativos do serviço inteiro da reserva, cria o novo (serviço inteiro, hash, `cr40f_expiraem`, `cr40f_name` "Link de acompanhamento … até …") e devolve o hash. Mesmo `Sha256Hex`/`Base64Url` do cadastro (copiado; assemblies separados).
  - `GenerateTrackingLinkPlugin`: chama o acima antes do `RequestLink` e inclui `cadastro` no payload; `ambiente` a partir de `organizationName` vs `PluginConfig.DevOrganizationName`. Falha ao criar o link de cadastro não derruba o link de acompanhamento (só fica sem a seção; trace).
  - `TrackingLinkRequest.Build`: teto de 336 h em vez de 24 (D1).
  - `RevokeTrackingLinkPlugin`: em Conclude e Revoke, marca Revogado os `cr40f_linkcadastro` ativos do serviço inteiro da reserva.
  - Testes xUnit para cada item.
- **Flow `cadastro-passageiro-link`**: só acrescenta `ordem` a cada passageiro do `ler` (D4); o cadastro-passageiro ignora o campo. Teste do flow atualizado.
- **Shell**: nada (o botão já existe e já respeita os status).

## 9. Verificação

1. Unitários: `pnpm test` aqui (rotas, limpeza, 409, rate limit, não vazamento de hash/URL) e `dotnet test` dos dois plugins no Sistema; `node --test packages/deploy/flows/cadastro-passageiro-link.test.mjs` se o flow mudar.
2. Local: `pnpm mock` + `pnpm dev:local` (porta 51734) com link semeado com `cadastro`: lista, envio, erros 409/410/429, 360 px e desktop; print no chat; `ux-audit` Rápido.
3. DEV autenticado (com aprovação na hora): publicar plugins e migration pelo Deploy do Sistema, publicar o Worker (o CI da `main` publica produção: links ativos não podem cair), gerar link numa reserva de teste do DEV, enviar foto/telefone/e-mail de um passageiro de teste e conferir `cr40f_bancodedados` (valores e `new_linkdafoto` no SharePoint), `cr40f_linkcadastro` (`cr40f_envios`, status 2), depois concluir a reserva e ver 409/410.
4. PROD: somente leitura até pedido explícito.

## 10. Tarefas (ordem; cada uma pequena e com teste)

0. ✅ (23/11/2026, leitura nos dois ambientes) **DEV e PROD usam o mesmo Worker** `acompanhar-motorista` (DEV pela configuração segura dos steps `*TrackingLink*`; PROD pela linha `link-acompanhamento.worker` em `cr40f_segredo`). Logo o Worker precisa das duas URLs (`CADASTRO_FLOW_URL_DEV` e `_PROD`) e escolhe pelo `cadastro.ambiente` do link; link sem ambiente conhecido fica sem seção Passageiros. O flow "Cadastro do passageiro | Link" existe nos dois: **ligado na PROD, desligado (rascunho) no DEV** desde o deploy de 23/11/2026 18:30 UTC; precisa estar ligado no DEV antes da verificação da seção 9.3. Links de teste do DEV continuam caindo no Worker de produção (mesmo KV), como hoje.
1. **Worker** — `validarPedido`/`criarLink`/`atualizarLink`: aceitar, validar e preservar `cadastro`; novo teto de validade. Teste de não publicação no `/dados`.
2. **Worker** — `src/validacao-cadastro.mjs` + `src/passageiros.mjs` com `GET /r/<id>/passageiros` (flow `ler`, limpeza, cache KV, 404 sem cadastro). Mock do flow.
3. **Worker** — `POST /r/<id>/passageiros/<guid>` (origem, tamanho, validação, 409 concluído, rate limit, invalidação do cache).
4. **Worker** — miniatura atual (`GET .../foto`, cache KV) (D2).
5. **Worker** — fase `agendado` (D1) sem Infleet antes de `horarioAgendado − 2 h` (dados + Viagem DO).
6. **Página** — seção Passageiros (lista, selos, estados), textos pt/en/es.
7. **Página** — folha de edição com foto reduzida, validação, descarte, envio e erros. Print + `ux-audit` Rápido.
8. **Sistema** — `TrackingLinkCadastro` + `GenerateTrackingLinkPlugin` manda `cadastro`; teto de validade no `TrackingLinkRequest`. Testes.
9. **Sistema** — `RevokeTrackingLinkPlugin` revoga o link de cadastro na conclusão/cancelamento. Teste.
10. **Sistema** — flow devolve `ordem` no `ler` (D4) + teste do flow.
11. Segredos `CADASTRO_FLOW_URL_DEV/PROD` no Worker (Renan ou script, sem colar a URL no chat).
12. Ordem de publicação: Worker primeiro (aceita `cadastro` e validade maior sem exigir), depois plugins/migration no DEV; validação autenticada no DEV (seção 9.3); só então PROD, com pedido explícito.
13. `verificacao-manter` nos dois repos e nota na wiki (`/wiki`) com a decisão e as armadilhas.

## 11. Decisões (Renan, 23/11/2026)

- **D1 — validade e mapa antes da viagem:** validade até a saída + 4 h, teto de 14 dias; posição do carro só a partir de 2 h antes da saída, antes disso "Viagem agendada".
- **D2 — foto atual:** mostrar a miniatura (288 px), como o cadastro-passageiro.
- **D3 — convivência com o cadastro-passageiro até a fase 3:** revogação mútua aceita; sem mudança de schema.
- **D4 — ordem:** a da escala (`cr40f_ordemdeselecao`); o flow passa a devolver `ordem`.

# Manutenções v2, plano 2: Shell › Frota (implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** levar o gestor de frota para o ciclo novo no shell. Ele ganha a fila "A encaixar", a gaveta única da manutenção (encaixar ou reagendar, reprovar, cancelar, concluir com os campos do App e corrigir a classificação) e a "Nova manutenção" em gaveta. As Pendências, a Custom API `cr40f_FrotaPendencias`, o e-mail semanal e o Agente Frota passam a contar do mesmo jeito. Saem do shell o flow `aprovarManutencao`, a transição "Programar" e a escrita de `cr40f_agendarpara`.

**Architecture:** a tela fala com as Custom APIs do plano 1 (`cr40f_ManutencaoAgendar/Reprovar/Cancelar/Concluir`, entrada `RequestJson` e saída `ResponseJson`). A `DataSource` da Frota ganha dois grupos de métodos, `ComandosManutencao` e `ArquivosManutencao`. Eles ficam implementados em `data/manutencaoDataverse.ts`, fora do closure de `createXrmSource`, e têm versão no mock. As regras puras ficam em `domain/`: janela, fila, conclusão, nova manutenção e as ações em `transitions.ts`. A gaveta `components/GavetaManutencao.tsx` lê o detalhe da manutenção no servidor quando abre. Por isso a mesma gaveta funciona na Frota e no hospedeiro de gavetas do shell (`app/gavetas`), onde a Geral vai usá-la no plano 3. O lado C# muda só nas regras de pendência (`Regras.cs`, `FrotaRepository.cs`, `Modelo.cs`) e na paridade.

**Tech Stack:** React 19 + TypeScript 5.9, `@betinhos/ui` (Drawer, Field, Input, Textarea, Select, SegmentedControl, Checkbox, Upload, Alert, Tabs, StatusBadge, EmptyState, Surface), Vitest 3 + Testing Library 16 + jsdom 27; C# `net462`/`net48` com xunit 2.9; PowerShell 5.1 nas migrations.

**Spec:** `docs/superpowers/specs/2026-11-16-manutencoes-v2-design.md`. Seções-alvo: "Shell › Frota › Manutenções", "Pendências, e-mail semanal e agente" e a nota de `cr40f_kmrealizado` em "Dados".

**Depende de:** plano 1 (`docs/superpowers/plans/2026-11-16-manutencoes-v2-1-servidor.md`), já na `develop` e no DEV: migration `20261117-0900-manutencoes-v2.ps1`, Custom APIs e espelho. Contratos JSON em `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Contratos.cs`; regras em `Manutencao/Ciclo.cs`; fatos do DEV em `docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md`.

## Decisões deste plano

Quando a spec, o plano 1 e o código atual divergem, a spec decide. As decisões abaixo foram tomadas ao escrever este plano.

- **D1. A fila "A encaixar" é uma sub-aba da visão Manutenções.** As abas ficam "A encaixar | Todas" (`?sub=todas`), no mesmo padrão de Multas e Infrações. Não é uma visão salva da lista porque a lista ordena por uma coluna só, e a fila precisa de grau decrescente e, dentro do grau, da mais antiga.
- **D2. A gaveta lê o detalhe no servidor quando abre** (`detalheManutencao(id)`), e não a partir da carga da Frota. A Geral (plano 3) não tem essa carga, e a gaveta precisa de colunas que a lista não traz: fotos, pagamento, comentários e quem realizou. A gaveta fica registrada como `cr40f_manutencoes` em `app/registroAberto.ts`. Efeito colateral aceito: o link do lookup `cr40f_om` em qualquer lista já abre esta gaveta.
- **D3. A manutenção sai das regras do `StatusPanel`.** As ações dela passam a ser `acoesManutencao(status)` e `executarAcaoManutencao(...)`, que relê o status, recusa com `StaleError` e permite uma ação por vez em cada registro. A maquinaria de campos do `StatusPanel` (genérica) continua para multas e colisões. Hoje nenhuma regra usa campos, e os testes dela passam a usar uma transição sintética. "Concluir" também aparece em Solicitado, porque o `Ciclo.ExigirConcluivel` aceita o lançamento feito depois do fato.
- **D4. Registros antigos não somem das Pendências antes da conversão do plano 5.** O fim da janela é `cr40f_janelafim` e, na falta dela, `cr40f_agendarpara`. A "prioridade parada" depois do encaixe conta de `cr40f_datadaaprovacao` e, na falta dela (registro antigo), não marca. Ela vale só para Agendado, porque Programado já tem dia e motorista. Os limiares continuam 2 e 5 dias. Tela e Custom API fazem igual.
- **D5. A Custom API `cr40f_FrotaPendencias` continua só com as regras proativas:** prioridade, reincidência, preventiva, atrasada, custo e hodômetro. "A encaixar" é a fila diária da tela, como "Aprovar" era. O e-mail e o agente não ganham tipo novo. "Contar igual" vale para os tipos que as duas têm, e o fixture de paridade confere isso.
- **D6. `ExecutePrivilegeName`: nenhuma das 4 Custom APIs ganha.** Elas rodam no contexto de quem chama (`CreateOrganizationService(context.UserId)`). Cada gravação já passa pelos privilégios do papel, então a API não deixa ninguém fazer o que o papel não permite direto pela Web API. O Dataverse não tem privilégio próprio de API: `ExecutePrivilegeName` precisa ser um privilégio de tabela, e o papel do motorista tem Write em `cr40f_manutencoes` e na Geral, porque o App grava as duas hoje. Exigir algum desses não separaria o motorista do escritório. `Concluir` precisa continuar aberto ao motorista (plano 4). O único candidato que poderia separar é `prvCreatecr40f_reservadeveculos`, se o papel `Acesso-Motoristas` não o tiver. A Tarefa 1 confere isso e registra o resultado para o Renan decidir (ver "Pontos para o Renan").
- **D7. O escritório recebe privilégios por migration.** Antes, o flow "Criar Serviço de Manutenção na Geral" criava a linha com o dono dele. Agora quem cria é o gestor, pela API. A migration `20261117-1000-manutencoes-v2-privilegios.ps1` segue o precedente de `20261116-1400-prova-midia.ps1` e só concede o que falta, nunca rebaixa. Ela vale para os papéis `Acesso-Betinhos-MDA` e `DEV - Usuário`, os mesmos de `conceder-privilegios-documentos.ps1` e `conceder-privilegios-equipamentos.ps1`. O PROD recebe pelos papéis da `BetinhosCore` (`regras.json`, tipo 20). Os `conceder-privilegios-*.ps1` não servem: rodam à mão, e o CLAUDE.md manda que nada que mude o DEV ou o PROD fique fora do Deploy e das soluções. O arquivo só entra no PR se o dry-run mostrar falta.
- **D8. `FrotaAgendadaVencida` vira `FrotaAtrasada` no mesmo valor do choice** (100000018 = 100000000 + posição 18 em `TODOS_OS_TIPOS`). O `provision-agentes-schema.ps1` só acrescenta opção nova (`GarantirOpcoes` pula valor existente) e não troca o rótulo. A troca entra pela migration `20261117-1010-agente-frota-atrasada.ps1` (`UpdateOptionValue`). A tela do Assistente mostra o `FormattedValue`, e é por isso que o rótulo importa.
- **D9. Concluir pelo shell segue o mesmo caminho do App.** A nota fiscal é obrigatória, porque o servidor exige. As fotos finais são opcionais (até 3), porque o escritório lança depois do fato e nem sempre tem foto. A nota aceita PDF (NF eletrônica). Como no App, a nota sobe duas vezes:
  - na pasta da manutenção (`Manutenções/[DEV/]<modelo - placa>/<código>`), com o link indo para `new_linkdanotafiscal`;
  - na pasta da despesa (`Despesas/[DEV/]<nome>`), com anexo em `cr40f_anexodespesaoperacional`, só quando `statusAnexo` = 100000001.

  Não há prova de captura, porque só o App captura. O vínculo `new_fotomanutencao` é criado sem id determinístico, e repetir depois de uma falha pode duplicar o vínculo. A conclusão em si é idempotente no servidor.
- **D10. Na gaveta, as fotos e a nota aparecem como links que abrem o arquivo em outra aba** (o link de compartilhamento do OneDrive). O `FotosChecklist` do Checklists não serve aqui: o visualizador dele é um portal fixo no `body`, e a gaveta do DS é um `dialog` modal, então ele abriria atrás e inerte. Miniatura na gaveta fica para depois, junto com "Reunir as fotos num lugar só" (spec, próximos passos).
- **D11. "Nova manutenção" exige veículo, descrição, grau e km**, como o App. O tipo de reparo e quem pediu são opcionais. Foto do pedido não é pedida no shell. O encaixe é opcional na mesma gaveta. Se o encaixe falhar depois da criação, a manutenção fica Solicitado e a gaveta dela abre.
- **D12. A busca de funcionário ("Quem realizou", "Quem pediu") e de cidade vai ao servidor** (`contains`, `$top=50`) com o `useLookupSearch` da Geral. A lista de cidades é grande demais para carregar inteira.
- **D13. `agendarPara` continua no tipo `Manutencao`, só para leitura.** A gaveta mostra "Agendada para (antes das manutenções v2)" quando não há janela, e a D4 usa o campo. Nada mais grava nele.
- **D14. Encaixe:** o padrão é "Semana", começando na semana de hoje. A tela recusa janela que termina antes de hoje, embora o servidor aceite. O comentário ao motorista vai em `comentario` (`cr40f_comentariosaomotorista` e, na linha nova, `cr40f_obsdeoperao`). Os limites de texto estão em `LIMITE` (`schema.ts`) e são conferidos na Tarefa 1.
- **D15. Cada tarefa compila sozinha.** A interface cresce em dois grupos (`ComandosManutencao` na Tarefa 11, `ArquivosManutencao` na 12) e só entra na `DataSource` na Tarefa 13, junto com o mock e as fontes falsas. O `customApi` da Frota passa para `data/customApi.ts`, para os dois arquivos usarem a mesma função.
- **D16. A preventiva usa `cr40f_kmrealizado` quando ele existir (`kmRealizado ?? km`).** A spec diz "a preventiva continua como está" em "Pendências" e "usa `cr40f_kmrealizado` (plano 2)" em "Dados". A nota de "Dados" é a mais específica, então vale. O cálculo muda na Frota, no Dashboard (que reaproveita `calcularPreventivas`) e no C#.

## Pontos para o Renan

1. **(D6) Trava extra nas APIs de gestor.** Se a Tarefa 1 mostrar que `Acesso-Motoristas` não tem `prvCreatecr40f_reservadeveculos`, dá para pôr `ExecutePrivilegeName = prvCreatecr40f_reservadeveculos` em Agendar, Reprovar e Cancelar, numa mudança pequena do registrador, que no PROD vai pelas soluções. Este plano não faz isso.
2. **(D7) Privilégios do escritório.** O dry-run da migration da Tarefa 2 sai no PR, e o Renan aprova o que será concedido antes do merge.
3. **(D9) PDF na nota fiscal: resolvido.** A conferência de despesas por IA lê PDF (`provision-flow-despesas-ia.ps1` envia `application/pdf` como `document`), então a nota aceita PDF.

## Global Constraints

- **Nada pesado roda nesta máquina** (8 GB, regra do CLAUDE.md do usuário). Isso inclui test runners (`vitest`, `dotnet test`), builds (`dotnet build`, `pnpm build`), typecheck, `pnpm dev`, Chromium headless e chamadas ao Dataverse DEV (`az`, `pwsh`, `curl` com token). Tudo isso roda na máquina linkada **Betinhos-Renan** (T3 environmentId `0af2203c-6aba-4a53-8896-1d00fe75c6fa`) via `delegate_task` com `target.environmentId`. Prints feitos lá são trazidos para esta máquina e mostrados no chat.
- Comandos de teste:
  - shell: `pnpm --filter @betinhos/shell exec vitest run <caminho relativo a apps/shell>`;
  - typecheck do shell: `pnpm --filter @betinhos/shell typecheck`;
  - C#: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`;
  - agente: `pnpm --filter @betinhos/agentes-ia test`.
- TDD em toda tarefa de código: teste que falha → código → teste passando → commit.
- Migration: nome `AAAAMMDD-HHMM-descricao.ps1`; BOM UTF-8; comentários em ASCII; idempotente; dry-run sem `-Apply`; só DEV; **imutável depois de publicada** (`packages/deploy/migrations/README.md`). Quem aplica é o Deploy; nunca rode com `-Apply` à mão.
- Nenhum `provision-*.ps1` novo. Sem `pnpm push`, `sitemap:*` nem `push:plugin:*` à mão: o Deploy da `develop` publica a tela, o plugin, as migrations e os flows alterados (`flows-dev.mjs`).
- UI só com o Design System `@betinhos/ui` e os tokens `--bt-*`. CSS novo só em `apps/shell/src/pages/frota/frota.css`. Nenhum componente do zero quando o DS ou o shell já tem um.
- Mensagens ao usuário em português, frase completa, sem jargão. Os erros de negócio do servidor chegam em `payload.error.message` e são mostrados como vieram.
- Códigos de choice:
  - manutenção (`cr40f_status`): Solicitado `0`, **Agendado** `202410001`, Programado `202410005`, Realizado `202410002`, Reprovado `100000002`, Cancelado `100000001`;
  - pagamento (`cr40f_pagamento`): Cartão `202410000`, Pedido de compra `202410001`, Pix `202410002`, Dinheiro `202410003`;
  - anexo da despesa (`cr40f_statusanexo`): pendente `100000001`, enviado `100000002`, falhou `100000003`.
- JSON das Custom APIs em camelCase, exatamente como em `Contratos.cs`: `manutencaoId`, `inicio`, `fim`, `comentario`, `servicos`, `km`, `data`, `valor`, `pagamento`, `estabelecimento`, `cidadeId`, `realizadoPorId`, `servicoRealizado`, `linkNotaFiscal`, `linkFotoFinal1..3`. Resposta: `geralId`, `despesaId`, `statusAnexo`.
- Fuso: São Paulo = UTC−3 sem horário de verão (`dates.ts`). Datas de janela em `YYYY-MM-DD`.
- UI mudou → print antes e depois no chat (CLAUDE.md do usuário).
- Commits em português no estilo `tipo(escopo): resumo`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `t3/manutencoes-v2-frota`, criada da `develop`. PR para a `develop`.
- **Promoção ao PROD:** este PR tem migrations, então a promoção da `develop` vai pelo "Publicar soluções", que leva junto o schema do plano 1. As Custom APIs do plano 1 precisam estar no PROD antes ou junto, e estão na mesma `develop`. Os flows antigos de sincronização continuam ligados até a virada (plano 5) e convivem, conforme a descoberta (f).

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| Modificar `docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md` | Seção "Plano 2": privilégios, tamanhos de texto, rótulo do agente (Tarefa 1) |
| Criar (condicional) `packages/deploy/migrations/20261117-1000-manutencoes-v2-privilegios.ps1` | Privilégios do escritório para as Custom APIs no contexto de quem chama |
| Criar `packages/deploy/migrations/20261117-1010-agente-frota-atrasada.ps1` | Rótulo `FrotaAtrasada` no valor 100000018 |
| Modificar `packages/agentes-ia/src/tipos.ts`, `frota.ts`, `agentes-ia.test.ts` | Tipo `FrotaAtrasada` na mesma posição; prompt com "atrasada" |
| Modificar `packages/deploy/flows/frota-pendencias-semanal.json` | Rótulo "Manutenção atrasada" no e-mail |
| Modificar `apps/shell/src/pages/frota/data/schema.ts` | `MANUT.AGENDADO`, rótulo "Agendado", pagamento, anexo, limites, entity sets |
| Criar `apps/shell/src/pages/frota/data/schema.test.ts` | Rótulos e códigos |
| Modificar `apps/shell/src/pages/frota/data/types.ts` | Campos da janela, encaixe e km; `DetalheManutencao` |
| Modificar `apps/shell/src/pages/frota/data/mappers.ts` (+ teste) | Colunas novas; `mapDetalheManutencao` |
| Criar `apps/shell/src/pages/frota/domain/janela.ts` (+ teste) | Dia/semana, validação, rótulo, atrasada |
| Criar `apps/shell/src/pages/frota/domain/fila.ts` (+ teste) | Fila "A encaixar" |
| Modificar `apps/shell/src/pages/frota/domain/pendencias.ts`, `alertas.ts` (+ testes) | "A encaixar", "Atrasada", prioridade pelo encaixe, sem "Programar" |
| Modificar `apps/shell/src/pages/frota/views/Pendencias.tsx` | Rótulos curtos |
| Modificar `apps/shell/src/pages/frota/domain/preventiva.ts` (+ teste) | Km da realização |
| Modificar `apps/shell/src/pages/dashboard/data/queries.ts` (+ `data.test.ts`) | Km da realização na preventiva do Dashboard |
| Modificar `apps/shell/src/pages/dashboard/domain/abas/manutencoes.ts` (+ teste), `dashboard/data/mock.ts` | "Agendado" conta como em andamento (rótulo novo do 202410001) |
| Modificar `packages/plugins/Cr40f.Frota.Plugin/Modelo.cs`, `Regras.cs`, `FrotaRepository.cs`, `Manutencao/Esquema.cs` | Mesmas regras no servidor |
| Criar `packages/plugins/Cr40f.Frota.Plugin.Tests/RegrasManutencaoTests.cs` | Atrasada, prioridade, km da realização |
| Modificar `packages/plugins/Cr40f.Frota.Plugin.Tests/ParidadeTests.cs`, `RepositoryTests.cs`, `Fixtures/paridade.json`; `apps/shell/src/pages/frota/domain/paridade.test.ts` | Paridade tela × Custom API |
| Modificar `apps/shell/src/pages/frota/domain/transitions.ts` (+ teste reescrito) | Manutenção fora do `StatusPanel`; ações protegidas |
| Modificar `apps/shell/src/pages/frota/components/StatusPanel.test.tsx`, `RegistroDrawer.test.tsx` (reescritos) | Testes sem manutenção |
| Modificar `apps/shell/src/pages/frota/data/source.ts`, `dataverse.ts`, `dataverse.test.ts`, `mock.ts`, `hostSource.ts` | Sem o flow `aprovarManutencao`; contratos novos |
| Criar `apps/shell/src/pages/frota/data/mock.test.ts` | Mock das ações da manutenção (mesmas mensagens do `Ciclo.cs`) |
| Criar `apps/shell/src/pages/frota/data/customApi.ts` | Chamada de Custom API compartilhada |
| Criar `apps/shell/src/pages/frota/data/arquivosManutencao.ts` (+ teste) | Pastas, nome de arquivo, leitura do link do flow |
| Criar `apps/shell/src/pages/frota/data/manutencaoDataverse.ts` (+ teste) | Custom APIs, detalhe, criação, arquivos, anexo, buscas |
| Modificar `apps/shell/src/pages/frota/testUtils.ts` | `manutencaoFalsa()` para as fontes falsas |
| Criar `apps/shell/src/pages/frota/domain/conclusao.ts` (+ teste) | Validação da conclusão e orquestração (arquivos → API → nota na despesa) |
| Criar `apps/shell/src/pages/frota/domain/novaManutencao.ts` (+ teste) | Validação da nova manutenção |
| Criar `apps/shell/src/pages/frota/components/GradeServicos.tsx`; modificar `ClassificacaoManutencao.tsx` | Grade de serviços compartilhada |
| Criar `apps/shell/src/pages/frota/components/JanelaCampos.tsx` | Dia/Semana + comentário |
| Criar `apps/shell/src/pages/frota/components/useOpcoesBusca.ts` | Busca de funcionário e cidade no servidor para o `Select` |
| Criar `apps/shell/src/pages/frota/components/CamposManutencao.test.tsx` | Testes da grade de serviços e dos campos de janela |
| Criar `apps/shell/src/pages/frota/components/ConcluirManutencaoForm.tsx` (+ teste) | Concluir com os campos do App |
| Criar `apps/shell/src/pages/frota/components/GavetaManutencao.tsx` (+ teste) | Gaveta única |
| Criar `apps/shell/src/pages/frota/components/NovaManutencaoDrawer.tsx` (+ teste) | Nova manutenção |
| Criar `apps/shell/src/pages/frota/views/FilaEncaixe.tsx` (+ teste) | Fila "A encaixar" |
| Modificar `apps/shell/src/pages/frota/FrotaPage.tsx` (+ teste), `views/Registros.tsx` (+ teste), `components/RegistroDrawer.tsx` | Sub-abas, gaveta, nova manutenção; `RegistroDrawer` só multa e colisão |
| Modificar `apps/shell/src/pages/frota/frota.css` | Erro de grupo, rótulo de campo, fotos |
| Criar `apps/shell/src/app/gavetas/GavetaManutencao.tsx`; modificar `app/registroAberto.ts`, `app/GavetaRegistro.tsx` (+ teste) | Gaveta compartilhada |
| Modificar `.claude/skills/verificar-plugins/SKILL.md`, `.claude/skills/verificar-shell/SKILL.md` | Roteiro com "atrasada", "encaixe" e a gaveta |

---

### Tarefa 1: Conferência no DEV (só leitura)

Antes de escrever código que depende do DEV, confira os privilégios dos papéis (D6, D7), os tamanhos das colunas de texto (D14) e o rótulo atual do agente (D8). Tudo **roda na Betinhos-Renan** (precisa de `az login`).

**Files:**
- Modify: `docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md`

**Interfaces:**
- Produces: a matriz papel × privilégio que decide se a Tarefa 2 entra; os `MaxLength` que ajustam `LIMITE` na Tarefa 4; o rótulo atual da opção 100000018 (a Tarefa 3 espera `FrotaAgendadaVencida`).

- [ ] **Step 1: Script de leitura (scratchpad da Betinhos-Renan, não versionado)**

```bash
cat > /tmp/conferir-plano2.py <<'PY'
import json, subprocess, sys, urllib.parse, urllib.request
BASE = "https://org23b93544.crm2.dynamics.com"
TOKEN = subprocess.check_output(["az", "account", "get-access-token", "--resource", BASE + "/", "--query", "accessToken", "-o", "tsv"], text=True).strip()
def get(path):
    req = urllib.request.Request(f"{BASE}/api/data/v9.2/{path}", headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"})
    with urllib.request.urlopen(req) as r: return json.load(r)

print("== Tamanho das colunas de texto")
for tabela, coluna in [("cr40f_manutencoes", "cr40f_comentariosdoaprovador"), ("cr40f_manutencoes", "cr40f_comentariosaomotorista"), ("cr40f_manutencoes", "cr40f_estabelecimento"), ("cr40f_manutencoes", "cr40f_servicorealizado"), ("cr40f_manutencoes", "new_comentariosdocolaborador"), ("cr40f_manutencoes", "cr40f_descricao"), ("cr40f_reservadeveculos", "new_observacaofinal"), ("cr40f_reservadeveculos", "cr40f_obsdeoperao")]:
    achou = None
    for tipo in ("StringAttributeMetadata", "MemoAttributeMetadata"):
        r = get(f"EntityDefinitions(LogicalName='{tabela}')/Attributes/Microsoft.Dynamics.CRM.{tipo}?$select=LogicalName,MaxLength&$filter=LogicalName eq '{coluna}'")["value"]
        if r: achou = (tipo, r[0]["MaxLength"])
    print(tabela, coluna, achou)

print("== Privilegios (profundidade: 1 Basic, 2 Local, 4 Deep, 8 Global)")
nomes = []
for t in ("cr40f_manutencoes", "cr40f_reservadeveculos", "cr40f_despesaoperacional"):
    nomes += [f"prvRead{t}", f"prvWrite{t}", f"prvCreate{t}", f"prvAppend{t}", f"prvAppendTo{t}"]
for t in ("cr40f_anexodespesaoperacional", "new_fotomanutencao"):
    nomes += [f"prvRead{t}", f"prvCreate{t}", f"prvAppend{t}"]
for t in ("cr40f_veiculos", "cr40f_funcionarios", "cr40f_cidade", "cr40f_categoriadespesaoperacional", "cr40f_formapagamentodespesa"):
    nomes += [f"prvRead{t}", f"prvAppendTo{t}"]
ids = {}
for n in nomes:
    v = get("privileges?$select=privilegeid,name&$filter=" + urllib.parse.quote(f"name eq '{n}'"))["value"]
    ids[n] = v[0]["privilegeid"] if v else None
for papel in ("Acesso-Betinhos-MDA", "DEV - Usuário", "Acesso-Motoristas"):
    r = get("roles?$select=roleid&$filter=" + urllib.parse.quote(f"name eq '{papel}' and _parentroleid_value eq null"))["value"]
    if len(r) != 1: print(papel, "NAO ENCONTRADO", len(r)); continue
    rps = get("roleprivilegescollection?$select=privilegeid,privilegedepthmask&$filter=" + urllib.parse.quote(f"roleid eq {r[0]['roleid']}"))["value"]
    mapa = {x["privilegeid"]: x["privilegedepthmask"] for x in rps}
    print("--", papel)
    for n in nomes: print(f"   {n}: {mapa.get(ids[n], 0) if ids[n] else 'privilegio inexistente'}")

print("== Rotulo da opcao 100000018 de cr40f_agenteproposta.cr40f_tipo")
os_ = get("EntityDefinitions(LogicalName='cr40f_agenteproposta')/Attributes(LogicalName='cr40f_tipo')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet")["OptionSet"]
for o in os_["Options"]:
    if o["Value"] == 100000018: print([l["Label"] for l in o["Label"]["LocalizedLabels"]], "IsGlobal", os_["IsGlobal"])

print("== Custom APIs da manutencao")
for api in get("customapis?$select=uniquename,executeprivilegename,isprivate&$filter=startswith(uniquename,'cr40f_Manutencao')")["value"]:
    print(api["uniquename"], api.get("executeprivilegename"), api["isprivate"])
PY
python3 -I /tmp/conferir-plano2.py
```

Expected: as quatro seções impressas, sem exceção. As Custom APIs aparecem com `executeprivilegename` vazio.

- [ ] **Step 2: Registrar na descoberta**

Acrescente ao fim de `docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md`. O texto entre `<...>` é a saída do Step 1, copiada como veio:

```markdown
## 6. Plano 2 (17/11/2026)

Leitura apenas (GET), feita pela Tarefa 1 do plano `2026-11-17-manutencoes-v2-2-frota.md`.

### Tamanho das colunas de texto

<tabela: tabela.coluna, tipo, MaxLength>

### Privilégios (1 Basic, 2 Local, 4 Deep, 8 Global; 0 = não tem)

<matriz por papel: Acesso-Betinhos-MDA, DEV - Usuário, Acesso-Motoristas>

### Agente

- Opção 100000018 de `cr40f_agenteproposta.cr40f_tipo`: <rótulo>; choice global: <sim/não>.
- `executeprivilegename` das 4 Custom APIs da manutenção: <valores>.

### Decisões

- Privilégios do escritório: <"nada a conceder" ou a lista do que falta> → Tarefa 2 <entra/não entra>.
- `Acesso-Motoristas` tem `prvCreatecr40f_reservadeveculos`: <sim/não> (ponto 1 para o Renan).
- `LIMITE` do shell: <igual ao padrão, ou os valores lidos que trocam o padrão>.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md
git commit -m "docs(frota): conferência no DEV para o plano 2 das manutenções v2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Migration de privilégios do escritório (só se a Tarefa 1 mostrou falta)

**Files:**
- Create: `packages/deploy/migrations/20261117-1000-manutencoes-v2-privilegios.ps1` (com BOM UTF-8)

**Interfaces:**
- Consumes: Tarefa 1 (matriz de privilégios).
- Produces: os papéis `Acesso-Betinhos-MDA` e `DEV - Usuário` com o mínimo para encaixar, reprovar, cancelar, concluir e abrir manutenção pelo shell.

- [ ] **Step 1: Escrever a migration**

```powershell
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Manutencoes v2, plano 2 (docs/superpowers/plans/2026-11-17-manutencoes-v2-2-frota.md, Tarefa 2):
# o escritorio passa a encaixar, reprovar, cancelar, concluir e abrir manutencao pelo shell. As Custom APIs
# cr40f_Manutencao* rodam no contexto de quem chama: o papel precisa criar e alterar a linha da Geral, a despesa
# e os anexos (antes o flow "Criar Servico de Manutencao na Geral" criava a linha com o dono dele).
# So concede o que falta ou esta abaixo da profundidade pedida; nunca rebaixa nem remove. Somente DEV;
# o PROD recebe os papeis pelas solucoes (BetinhosCore).

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$papeis = @("Acesso-Betinhos-MDA", "DEV - Usu$([char]0xE1)rio")
$ordem = @{ Basic = 1; Local = 2; Deep = 4; Global = 8 }

$pedido = [ordered]@{}
foreach ($t in @("cr40f_manutencoes", "cr40f_reservadeveculos", "cr40f_despesaoperacional")) {
  $pedido["prvRead$t"] = "Global"; $pedido["prvWrite$t"] = "Global"; $pedido["prvCreate$t"] = "Basic"
  $pedido["prvAppend$t"] = "Global"; $pedido["prvAppendTo$t"] = "Global"
}
foreach ($t in @("cr40f_anexodespesaoperacional", "new_fotomanutencao")) {
  $pedido["prvRead$t"] = "Global"; $pedido["prvCreate$t"] = "Basic"; $pedido["prvAppend$t"] = "Global"
}
foreach ($t in @("cr40f_veiculos", "cr40f_funcionarios", "cr40f_cidade", "cr40f_categoriadespesaoperacional", "cr40f_formapagamentodespesa")) {
  $pedido["prvRead$t"] = "Global"; $pedido["prvAppendTo$t"] = "Global"
}

$privs = @{}
foreach ($nome in $pedido.Keys) {
  $achado = @(Get-Rows "privileges" "privilegeid,name" "name eq '$nome'")
  if ($achado.Count -ne 1) { throw "Privilegio $nome nao encontrado." }
  $privs[$nome] = [string] $achado[0].privilegeid
}

foreach ($nomePapel in $papeis) {
  $achados = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$($nomePapel.Replace("'", "''"))' and _parentroleid_value eq null")
  if ($achados.Count -ne 1) { throw "Papel '$nomePapel' nao encontrado (ou ambiguo) na unidade raiz: $($achados.Count)." }
  $papel = $achados[0]
  $atual = @{}
  foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid)")) { $atual[[string] $rp.privilegeid] = [int] $rp.privilegedepthmask }
  $concessoes = @()
  foreach ($nome in $pedido.Keys) {
    $id = $privs[$nome]; $depth = $pedido[$nome]
    if ($atual.ContainsKey($id) -and $atual[$id] -ge $ordem[$depth]) { continue }
    $concessoes += [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $id; Depth = $depth; BusinessUnitId = $papel._businessunitid_value; PrivilegeName = $nome }
  }
  if ($concessoes.Count -eq 0) { Write-Step "$nomePapel ja tem tudo: nada a conceder"; continue }
  $resumo = ($concessoes | ForEach-Object { "$($_.PrivilegeName)=$($_.Depth)" }) -join ", "
  if (-not $Apply) { Write-Step "DRY RUN $nomePapel receberia: $resumo"; continue }
  Invoke-Dv "POST" "roles($($papel.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = $concessoes } | Out-Null
  $depois = @{}
  foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid)")) { $depois[[string] $rp.privilegeid] = [int] $rp.privilegedepthmask }
  foreach ($c in $concessoes) {
    if (-not $depois.ContainsKey($c.PrivilegeId) -or $depois[$c.PrivilegeId] -lt $ordem[$c.Depth]) { throw "$nomePapel ficou sem $($c.PrivilegeName) na profundidade $($c.Depth)." }
  }
  Write-Step "$nomePapel concedido: $resumo"
}
```

- [ ] **Step 2: Gravar com BOM UTF-8 e conferir**

Run: `head -c 3 packages/deploy/migrations/20261117-1000-manutencoes-v2-privilegios.ps1 | xxd -p`
Expected: `efbbbf`. Se faltar: `printf '\xef\xbb\xbf' | cat - arquivo > tmp && mv tmp arquivo`.

- [ ] **Step 3: Dry-run no DEV (Betinhos-Renan)**

Run: `pwsh -File packages/deploy/migrations/20261117-1000-manutencoes-v2-privilegios.ps1`
Expected: para cada papel, ou `ja tem tudo: nada a conceder` ou `DRY RUN <papel> receberia: ...`. Sem exceção.

- **Os dois papéis com "nada a conceder":** apague o arquivo (`rm`, porque ele ainda não foi commitado), registre "Tarefa 2 não entrou" na seção 6 da descoberta, commite só a descoberta e pule o Step 5.
- **Há concessões:** guarde a saída para o corpo do PR (Tarefa 21).

- [ ] **Step 4: Conferir a trava das migrations**

Run: `git diff --name-status -M origin/develop...HEAD | node packages/deploy/migrations-ci.mjs` (leve; pode rodar nesta máquina)
Expected: sai com código 0.

- [ ] **Step 5: Commit (só se o arquivo ficou)**

```bash
git add packages/deploy/migrations/20261117-1000-manutencoes-v2-privilegios.ps1 docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md
git commit -m "feat(frota): privilégios do escritório para as Custom APIs da manutenção

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Agente Frota e e-mail: "agendada" vira "atrasada"

**Files:**
- Create: `packages/deploy/migrations/20261117-1010-agente-frota-atrasada.ps1` (com BOM UTF-8)
- Modify: `packages/agentes-ia/src/tipos.ts`, `packages/agentes-ia/src/frota.ts`, `packages/agentes-ia/src/agentes-ia.test.ts`
- Modify: `packages/deploy/flows/frota-pendencias-semanal.json`

**Interfaces:**
- Consumes: Tarefa 1 (rótulo atual `FrotaAgendadaVencida`).
- Produces: tipo de proposta `FrotaAtrasada` na posição 18 de `TODOS_OS_TIPOS`; tipo de pendência `atrasada` no prompt e no e-mail. A Tarefa 9 passa a devolver `atrasada` na Custom API.

- [ ] **Step 1: Teste que falha**

Em `packages/agentes-ia/src/agentes-ia.test.ts`, troque a linha 180:

```ts
    expect(TODOS_OS_TIPOS.slice(-7)).toEqual(['FrotaPrioridade', 'FrotaReincidencia', 'FrotaPreventiva', 'FrotaAtrasada', 'FrotaCustoAlto', 'FrotaHodometro', 'TreinamentoPendente'])
    expect(TODOS_OS_TIPOS.indexOf('FrotaAtrasada')).toBe(18)
```

e acrescente, no mesmo `describe` do Agente Frota (depois do teste da ordem do choice):

```ts
  it('prompt da frota fala de "atrasada" e da proposta FrotaAtrasada, sem "agendada"', () => {
    expect(SYSTEM_FROTA).toContain('atrasada (janela do encaixe vencida sem realizar)')
    expect(SYSTEM_FROTA).toContain('- FrotaAtrasada: uma para cada pendência "atrasada".')
    expect(SYSTEM_FROTA).not.toMatch(/agendada/i)
  })
```

Cada seção do arquivo importa o que usa de `./index.ts`. Acrescente, logo antes de `describe('Agente Frota', () => {`:

```ts
import { SYSTEM_FROTA } from './index.ts'
```

O detalhe de exemplo `'Aguardando aprovação há 3 dias'` no `ctx` desse `describe` passa a ser `'Aguardando encaixe há 3 dias'`, o texto que a Tarefa 9 faz a Custom API devolver.

Run: `pnpm --filter @betinhos/agentes-ia test`
Expected: FAIL nos dois testes (`FrotaAgendadaVencida` ainda na lista; prompt com "agendada").

- [ ] **Step 2: Renomear o tipo na mesma posição**

Em `packages/agentes-ia/src/tipos.ts`, troque `'FrotaAgendadaVencida'` por `'FrotaAtrasada'` nas duas listas (`TIPOS_POR_AGENTE.frota` e `TODOS_OS_TIPOS`), sem mover nada:

```ts
  frota: ['FrotaPrioridade', 'FrotaReincidencia', 'FrotaPreventiva', 'FrotaAtrasada', 'FrotaCustoAlto', 'FrotaHodometro'],
```

```ts
  'FrotaPrioridade', 'FrotaReincidencia', 'FrotaPreventiva', 'FrotaAtrasada', 'FrotaCustoAlto', 'FrotaHodometro',
```

- [ ] **Step 3: Prompt**

Em `packages/agentes-ia/src/frota.ts`, troque a linha do `tipo =` (22) e a da proposta (29):

```ts
  tipo = prioridade (manutenção Alta ou Urgente parada: sem encaixe ou encaixada sem programação), reincidencia (mesmo serviço repetido no mesmo carro), preventiva (vencida ou a vencer pelo plano), atrasada (janela do encaixe vencida sem realizar), custo (custo de manutenção acima da curva da frota), hodometro (hodômetro do Infleet sem atualizar).
```

```ts
- FrotaAtrasada: uma para cada pendência "atrasada". registroAlvo: cr40f_manutencoes com o manutencaoId. Prioridade media.
```

Run: `pnpm --filter @betinhos/agentes-ia test`
Expected: PASS.

- [ ] **Step 4: Rótulo no e-mail semanal**

Em `packages/deploy/flows/frota-pendencias-semanal.json`, na ação `Rotulos`, troque `"agendada": "Agendada e não realizada"` por:

```json
"atrasada": "Manutenção atrasada"
```

O Deploy republica o flow "Frota | Resumo semanal" sozinho (`flows-dev.mjs` mapeia `frota-pendencias-semanal.json`). O "Flow Agentes | Executar" também, porque `src/*.ts` do `agentes-ia` mudou.

- [ ] **Step 5: Migration do rótulo**

```powershell
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Agente Frota (packages/agentes-ia/src/tipos.ts): o tipo de proposta FrotaAgendadaVencida passa a se chamar
# FrotaAtrasada no mesmo valor do choice (100000018 = 100000000 + posicao em TODOS_OS_TIPOS). O
# provision-agentes-schema.ps1 so acrescenta opcoes novas e nao renomeia a existente; esta migration troca o
# rotulo. Idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_agenteproposta"
$coluna = "cr40f_tipo"
$valor = 100000018

$os = (Invoke-Dv "GET" "EntityDefinitions(LogicalName='$table')/Attributes(LogicalName='$coluna')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet").OptionSet
$opcao = @($os.Options | Where-Object { $_.Value -eq $valor })
if ($opcao.Count -ne 1) { throw "$table.$coluna sem a opcao $valor." }
$rotulo = @($opcao[0].Label.LocalizedLabels | Where-Object { $_.LanguageCode -eq 1046 })[0].Label
if ($rotulo -eq "FrotaAtrasada") { Write-Step "rotulo $valor ja e FrotaAtrasada"; return }
if ($rotulo -ne "FrotaAgendadaVencida") { throw "Opcao $valor tem o rotulo '$rotulo'; esperado FrotaAgendadaVencida." }
if (-not $Apply) { Write-Step "DRY RUN trocaria o rotulo de $valor para FrotaAtrasada"; return }

$body = if ($os.IsGlobal) { @{ OptionSetName = $os.Name } } else { @{ EntityLogicalName = $table; AttributeLogicalName = $coluna } }
$body.Value = $valor; $body.Label = (Label "FrotaAtrasada"); $body.MergeLabels = $true; $body.SolutionUniqueName = $script:SolucaoDev
Invoke-Dv "POST" "UpdateOptionValue" $body | Out-Null
Publish-Tabela $table
Write-Step "rotulo $valor = FrotaAtrasada"
```

Run (BOM): `head -c 3 packages/deploy/migrations/20261117-1010-agente-frota-atrasada.ps1 | xxd -p` → `efbbbf`.
Run (Betinhos-Renan): `pwsh -File packages/deploy/migrations/20261117-1010-agente-frota-atrasada.ps1`
Expected: `DRY RUN trocaria o rotulo de 100000018 para FrotaAtrasada`.
Run: `git diff --name-status -M origin/develop...HEAD | node packages/deploy/migrations-ci.mjs` → código 0.

- [ ] **Step 6: Commit**

```bash
git add packages/agentes-ia/src/tipos.ts packages/agentes-ia/src/frota.ts packages/agentes-ia/src/agentes-ia.test.ts packages/deploy/flows/frota-pendencias-semanal.json packages/deploy/migrations/20261117-1010-agente-frota-atrasada.ps1
git commit -m "feat(frota): agente e e-mail chamam de atrasada a manutenção com janela vencida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: "Agendado" no lugar de "Aprovado" (constantes e rótulo)

**Files:**
- Create: `apps/shell/src/pages/frota/data/schema.test.ts`
- Modify: `apps/shell/src/pages/frota/data/schema.ts`
- Modify (sed): todo arquivo de `apps/shell/src` com `MANUT.APROVADO`
- Modify: `packages/plugins/Cr40f.Frota.Plugin/Modelo.cs`, `Regras.cs`, `Manutencao/Esquema.cs`

**Interfaces:**
- Produces:
  - `MANUT.AGENDADO = 202410001` (sem `MANUT.APROVADO`);
  - `PAGAMENTO` e `PAGAMENTO_MANUT: Option[]`;
  - `ANEXO_DESPESA = { PENDENTE: 100000001, ENVIADO: 100000002, FALHOU: 100000003 }`;
  - `LIMITE = { comentarioAprovador, comentarioAoMotorista, estabelecimento, servicoRealizado, comentarioColaborador, descricao }`;
  - `ENTITY_SET` com `manutencoes`, `funcionarios` e `despesas`;
  - no C#, `Codigos.Agendado` (sem `Codigos.Aprovado`).

- [ ] **Step 1: Teste que falha**

```ts
// apps/shell/src/pages/frota/data/schema.test.ts
import { describe, expect, it } from 'vitest'
import { ANEXO_DESPESA, ENTITY_SET, LIMITE, MANUT, PAGAMENTO, PAGAMENTO_MANUT, STATUS_OPTIONS, label } from './schema'

describe('schema da manutenção', () => {
  it('202410001 é "Agendado" (era "Aprovado"; mesmo valor)', () => {
    expect(MANUT.AGENDADO).toBe(202410001)
    expect(label(STATUS_OPTIONS.manutencao, MANUT.AGENDADO)).toBe('Agendado')
    expect(Object.keys(MANUT)).not.toContain('APROVADO')
  })

  it('pagamento tem Dinheiro próprio e anexo da despesa usa os códigos do App', () => {
    expect(PAGAMENTO).toEqual({ CARTAO: 202410000, PEDIDO_COMPRA: 202410001, PIX: 202410002, DINHEIRO: 202410003 })
    expect(PAGAMENTO_MANUT.map((o) => o.label)).toEqual(['Cartão de crédito', 'Pedido de compra', 'Pix', 'Dinheiro'])
    expect(ANEXO_DESPESA).toEqual({ PENDENTE: 100000001, ENVIADO: 100000002, FALHOU: 100000003 })
  })

  it('limites de texto e entity sets usados nos binds', () => {
    expect(LIMITE.comentarioAprovador).toBeGreaterThan(0)
    expect(ENTITY_SET).toMatchObject({ veiculos: 'cr40f_veiculoses', manutencoes: 'cr40f_manutencoeses', funcionarios: 'cr40f_funcionarioses', despesas: 'cr40f_despesaoperacionals' })
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data/schema.test.ts`
Expected: FAIL (`AGENDADO`, `PAGAMENTO`, `ANEXO_DESPESA`, `LIMITE` não existem).

- [ ] **Step 2: Renomear o uso no shell**

```bash
grep -rl "MANUT\.APROVADO" apps/shell/src | xargs sed -i 's/MANUT\.APROVADO/MANUT.AGENDADO/g'
```

- [ ] **Step 3: Constantes em `schema.ts`**

Troque a linha 22 (`ENTITY_SET`) e o comentário acima dela por:

```ts
/** Entity sets usados nos @odata.bind (os mesmos do App Motoristas, `data/dataverse/entidades.ts`). */
export const ENTITY_SET = { veiculos: 'cr40f_veiculoses', planoPreventivo: 'cr40f_itemplanopreventivos', manutencoes: 'cr40f_manutencoeses', funcionarios: 'cr40f_funcionarioses', despesas: 'cr40f_despesaoperacionals' } as const
```

Troque a linha 34 (`MANUT`) por:

```ts
/** 202410001 era "Aprovado"; desde as manutenções v2 é "Agendado" (encaixado num dia ou numa semana), mesmo valor. */
export const MANUT = { SOLICITADO: 0, AGENDADO: 202410001, PROGRAMADO: 202410005, REALIZADO: 202410002, REPROVADO: 100000002, CANCELADO: 100000001 } as const
/** cr40f_pagamento (choice global cr40f_opcoes). 202410001 aparece como "Boleto" no DEV; App e shell chamam de "Pedido de compra". */
export const PAGAMENTO = { CARTAO: 202410000, PEDIDO_COMPRA: 202410001, PIX: 202410002, DINHEIRO: 202410003 } as const
export const PAGAMENTO_MANUT: Option[] = [
  { value: PAGAMENTO.CARTAO, label: 'Cartão de crédito' },
  { value: PAGAMENTO.PEDIDO_COMPRA, label: 'Pedido de compra' },
  { value: PAGAMENTO.PIX, label: 'Pix' },
  { value: PAGAMENTO.DINHEIRO, label: 'Dinheiro' },
]
/** cr40f_statusanexo da despesa: pendente = quem concluiu ainda sobe a nota fiscal na despesa. */
export const ANEXO_DESPESA = { PENDENTE: 100000001, ENVIADO: 100000002, FALHOU: 100000003 } as const
/** Tamanho máximo dos textos gravados (MaxLength do DEV, conferido na Tarefa 1 do plano 2). */
export const LIMITE = { comentarioAprovador: 100, comentarioAoMotorista: 100, estabelecimento: 100, servicoRealizado: 100, comentarioColaborador: 500, descricao: 2000 } as const
```

Se a seção 6 da descoberta (Tarefa 1) trouxer um `MaxLength` diferente para alguma dessas colunas, use o valor lido nessa chave. O limite de `comentarioColaborador` é o menor entre `new_comentariosdocolaborador` e `new_observacaofinal`, porque o Concluir grava o mesmo texto nas duas.

Troque, em `STATUS_OPTIONS.manutencao`, a linha do 202410001 por:

```ts
    { value: MANUT.AGENDADO, label: 'Agendado' },
```

O `TONE` já foi trocado pelo sed (`[MANUT.AGENDADO]: 'info'`).

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data/schema.test.ts`
Expected: PASS.

- [ ] **Step 4: C#**

```bash
sed -i 's/Codigos\.Aprovado/Codigos.Agendado/g' packages/plugins/Cr40f.Frota.Plugin/Regras.cs packages/plugins/Cr40f.Frota.Plugin/Manutencao/Esquema.cs
sed -i 's/Solicitado = 0, Aprovado = 202410001/Solicitado = 0, Agendado = 202410001/' packages/plugins/Cr40f.Frota.Plugin/Modelo.cs
```

Em `Modelo.cs`, troque o comentário da classe `Codigos` por:

```csharp
/// <summary>Códigos de choice, iguais a apps/shell/src/pages/frota/data/schema.ts. 202410001 era "Aprovado"; agora é "Agendado".</summary>
```

- [ ] **Step 5: Dashboard conta "Agendado" como em andamento**

O Dashboard compara o **rótulo** do status (`manutencaoEmAndamento`). A migration do plano 1 já trocou o rótulo no DEV para "Agendado", e desde então o card "Em andamento" deixou de contar essas manutenções. "Aprovado" fica na lista até o rótulo novo chegar ao PROD.

Teste primeiro. Em `apps/shell/src/pages/dashboard/domain/abas/manutencoes.test.ts`, no teste `'em andamento pelos status reais (spec §6)...'`, acrescente depois de `expect(manutencaoEmAndamento(' Programado ')).toBe(true)`:

```ts
    expect(manutencaoEmAndamento('Agendado')).toBe(true) // rótulo novo do 202410001 (manutenções v2)
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/dashboard/domain/abas/manutencoes.test.ts`
Expected: FAIL (`Agendado` não conta).

Em `apps/shell/src/pages/dashboard/domain/abas/manutencoes.ts`, troque a constante e o comentário acima dela:

```ts
/** Status reais de `cr40f_manutencoes.cr40f_status` que contam como em andamento (metadata DEV; spec §6). 202410001 é "Agendado" desde as manutenções v2; "Aprovado" fica até o rótulo novo chegar ao PROD. */
const STATUS_EM_ANDAMENTO: ReadonlySet<string> = new Set(['solicitado', 'agendado', 'aprovado', 'programado'])
```

Em `apps/shell/src/pages/dashboard/data/mock.ts`, na constante `STATUS_MANUTENCAO`, troque `'Aprovado'` por `'Agendado'`. No comentário acima dela, troque "Solicitado, Aprovado e Programado" por "Solicitado, Agendado e Programado".

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/dashboard`
Expected: PASS.

- [ ] **Step 6: Rodar tudo o que tocou (Betinhos-Renan)**

Run: `pnpm --filter @betinhos/shell typecheck && pnpm --filter @betinhos/shell exec vitest run src/pages/frota src/pages/dashboard && dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`
Expected: typecheck sem erros; todos PASS. Nenhum teste compara o rótulo "Aprovado" da manutenção na Frota; as transições "Aprovar e agendar" e "Programar" continuam até a Tarefa 10.

- [ ] **Step 7: Commit**

```bash
git add apps/shell/src packages/plugins/Cr40f.Frota.Plugin
git commit -m "refactor(frota): Aprovado vira Agendado no shell, no Dashboard e no plugin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Tarefa 5: Campos novos da manutenção na carga e o detalhe da gaveta

**Files:**
- Modify: `apps/shell/src/pages/frota/data/types.ts`
- Modify: `apps/shell/src/pages/frota/data/mappers.ts`
- Test: `apps/shell/src/pages/frota/data/mappers.test.ts`
- Modify (sed): os literais de `Manutencao` nos testes e no mock

**Interfaces:**
- Produces:
  - `Manutencao` ganha `janelaInicio`, `janelaFim`, `dataAprovacao` (todos `string | null`, `YYYY-MM-DD`) e `kmRealizado: number | null`;
  - `DetalheManutencao = Manutencao & { comentarioAoMotorista; comentarioColaborador; pagamento; realizadoPor: Ref | null; fotosPedido: string[]; linkNotaFiscal: string | null; fotosFinais: string[] }`;
  - `SELECT_DETALHE_MANUTENCAO` e `mapDetalheManutencao(row, behaviors)`.

- [ ] **Step 1: Testes que falham**

Em `mappers.test.ts`, troque o `import` da linha 2 por:

```ts
import { FORMATTED, mapBaseline, mapColisao, mapDespesaCombustivel, mapDetalheManutencao, mapItemPlano, mapManutencao, mapMulta, mapPosse, mapTelemetriaKm, mapVeiculo, ref, SELECT, SELECT_DETALHE_MANUTENCAO } from './mappers'
```

e acrescente, depois do teste `'mapeia manutenção mantendo valor ausente como null'`:

```ts
  it('mapeia janela, data do encaixe e km da realização', () => {
    const m = mapManutencao(
      { cr40f_manutencoesid: 'M2', cr40f_status: 202410001, cr40f_janelainicio: '2026-11-23', cr40f_janelafim: '2026-11-29', cr40f_datadaaprovacao: '2026-11-17T13:00:00Z', cr40f_kmrealizado: 85200, createdon: '2026-11-10T12:00:00Z' },
      { cr40f_janelainicio: 'DateOnly', cr40f_janelafim: 'DateOnly', cr40f_datadaaprovacao: 'UserLocal' },
    )
    expect(m).toMatchObject({ janelaInicio: '2026-11-23', janelaFim: '2026-11-29', dataAprovacao: '2026-11-17', kmRealizado: 85200 })
    expect(mapManutencao({ cr40f_manutencoesid: 'M3' })).toMatchObject({ janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null })
    expect(SELECT.manutencoes).toEqual(expect.arrayContaining(['cr40f_janelainicio', 'cr40f_janelafim', 'cr40f_datadaaprovacao', 'cr40f_kmrealizado']))
  })

  it('detalhe da manutenção junta fotos, nota, pagamento, comentários e quem realizou', () => {
    const d = mapDetalheManutencao({
      cr40f_manutencoesid: 'M4', cr40f_pagamento: 202410003,
      _cr40f_realizado_por_nome_value: 'F1', [`_cr40f_realizado_por_nome_value${FORMATTED}`]: 'Ana',
      cr40f_foto01: 'https://x.invalid/1', cr40f_linkdaevidencia: '', cr40f_foto03: 'https://x.invalid/3',
      new_linkdanotafiscal: 'https://x.invalid/nf1\nhttps://x.invalid/nf2', new_linkdafotofinal1: 'https://x.invalid/f1',
      cr40f_comentariosaomotorista: 'Levar cedo', new_comentariosdocolaborador: 'Feito',
    })
    expect(d).toMatchObject({
      id: 'm4', pagamento: 202410003, realizadoPor: { id: 'f1', label: 'Ana' },
      fotosPedido: ['https://x.invalid/1', 'https://x.invalid/3'], linkNotaFiscal: 'https://x.invalid/nf1\nhttps://x.invalid/nf2', fotosFinais: ['https://x.invalid/f1'],
      comentarioAoMotorista: 'Levar cedo', comentarioColaborador: 'Feito',
    })
    expect(SELECT_DETALHE_MANUTENCAO).toEqual(expect.arrayContaining(['cr40f_janelafim', 'cr40f_kmrealizado', '_cr40f_realizado_por_nome_value', 'new_linkdanotafiscal', 'cr40f_foto01']))
  })
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data/mappers.test.ts`
Expected: FAIL (`mapDetalheManutencao` e `SELECT_DETALHE_MANUTENCAO` não existem).

- [ ] **Step 2: Tipos**

Em `types.ts`, troque a linha do `Manutencao` (5) por:

```ts
/** `agendarPara` (cr40f_agendarpara) é só leitura: histórico de antes das manutenções v2. A janela (início e fim, `YYYY-MM-DD`) é a do encaixe; `dataAprovacao` é o dia do primeiro encaixe; `kmRealizado`, o km de quem concluiu. */
export type Manutencao = { id: string; codigo: string; descricao: string; status: number | null; grau: number | null; tipo: number | null; agendarPara: string | null; janelaInicio: string | null; janelaFim: string | null; dataAprovacao: string | null; kmRealizado: number | null; dataManutencao: string | null; valor: number | null; estabelecimento: string | null; servicoRealizado: string | null; comentarioAprovador: string | null; km: number | null; veiculo: Ref | null; solicitante: Ref | null; criadoEm: string; servicos: number[]; categorias: number[]; origemClassificacao: number | null; confiancaIa: number | null }
/** Manutenção aberta na gaveta: a linha da lista mais o que só a gaveta mostra (lido do servidor quando ela abre). */
export type DetalheManutencao = Manutencao & { comentarioAoMotorista: string | null; comentarioColaborador: string | null; pagamento: number | null; realizadoPor: Ref | null; fotosPedido: string[]; linkNotaFiscal: string | null; fotosFinais: string[] }
```

- [ ] **Step 3: Mapper**

Em `mappers.ts`, troque o `import type` da linha 4 para incluir `DetalheManutencao`:

```ts
import type { Baseline, Colisao, DespesaCombustivel, DetalheManutencao, Infracao, ItemPlano, Manutencao, Multa, ParcelaTermo, Posse, Ref, ResumoTermo, TelemetriaKm, TermoMulta, Veiculo } from './types'
```

Na linha 13 (`SELECT.manutencoes`), acrescente as quatro colunas depois de `'cr40f_agendarpara'`:

```ts
  manutencoes: ['cr40f_manutencoesid', 'cr40f_id', 'cr40f_descricao', 'cr40f_status', 'cr40f_graudamanutencao', 'cr40f_tipodoreparo', 'cr40f_agendarpara', 'cr40f_janelainicio', 'cr40f_janelafim', 'cr40f_datadaaprovacao', 'cr40f_kmrealizado', 'cr40f_datamanutencao', 'cr40f_valor', 'cr40f_estabelecimento', 'cr40f_servicorealizado', 'cr40f_comentariosdoaprovador', 'cr40f_kmatual', '_cr40f_placa_carro_value', '_cr40f_solicitado_por_value', 'createdon', 'new_servicosmanutencao', 'new_categoriasmanutencao', 'new_classificacaoorigem', 'new_confiancaia'],
```

Em `mapManutencao`, logo depois de `agendarPara: ...`:

```ts
    janelaInicio: toDateOnly(row.cr40f_janelainicio, behaviors.cr40f_janelainicio),
    janelaFim: toDateOnly(row.cr40f_janelafim, behaviors.cr40f_janelafim),
    dataAprovacao: toDateOnly(row.cr40f_datadaaprovacao, behaviors.cr40f_datadaaprovacao),
    kmRealizado: num(row.cr40f_kmrealizado),
```

Depois da função `mapManutencao`, acrescente:

```ts
/** Colunas da gaveta da manutenção: as da lista mais fotos, nota fiscal, pagamento, comentários e quem realizou. */
export const SELECT_DETALHE_MANUTENCAO = [...SELECT.manutencoes, 'cr40f_comentariosaomotorista', 'new_comentariosdocolaborador', 'cr40f_pagamento', '_cr40f_realizado_por_nome_value', 'cr40f_foto01', 'cr40f_linkdaevidencia', 'cr40f_foto03', 'new_linkdanotafiscal', 'new_linkdafotofinal1', 'new_linkdafotofinal2', 'new_linkdafotofinal3'] as const

/** Links http(s) das colunas; a nota fiscal com vários arquivos guarda um link por linha (como o App grava). */
const links = (...valores: unknown[]) => valores.flatMap((v) => (typeof v === 'string' ? v.split('\n') : [])).map((v) => v.trim()).filter((v) => /^https?:\/\//i.test(v))

export function mapDetalheManutencao(row: Row, behaviors: Behaviors = {}): DetalheManutencao {
  return {
    ...mapManutencao(row, behaviors),
    comentarioAoMotorista: str(row.cr40f_comentariosaomotorista),
    comentarioColaborador: str(row.new_comentariosdocolaborador),
    pagamento: num(row.cr40f_pagamento),
    realizadoPor: ref(row, '_cr40f_realizado_por_nome_value'),
    fotosPedido: links(row.cr40f_foto01, row.cr40f_linkdaevidencia, row.cr40f_foto03),
    linkNotaFiscal: str(row.new_linkdanotafiscal),
    fotosFinais: links(row.new_linkdafotofinal1, row.new_linkdafotofinal2, row.new_linkdafotofinal3),
  }
}
```

- [ ] **Step 4: Literais de `Manutencao` nos testes e no mock**

Todo literal completo de `Manutencao` tem `agendarPara: null, ` (os helpers `manut(...)` dos testes, `mock.ts` e os objetos de `FrotaPage.test.tsx`, `Pendencias.test.tsx`, `Veiculos.test.tsx`, `Indicadores.test.tsx`, `listas.test.ts`, `FichaVeiculo.test.tsx`, `CustoTotal.test.tsx`, `custoTotal.test.ts`, `indicadores.test.ts`, `Preventivas.test.tsx`, `RegistroDrawer.test.tsx`, `Registros.test.tsx`, `alertas.test.ts`, `pendencias.test.ts`).

```bash
grep -rl "agendarPara: null, " apps/shell/src | xargs sed -i 's/agendarPara: null, /agendarPara: null, janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null, /'
grep -rn "agendarPara: null, " apps/shell/src | grep -v "janelaInicio: null" || echo "todos os literais atualizados"
```

Expected: `todos os literais atualizados`.

- [ ] **Step 5: Rodar (Betinhos-Renan)**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data/mappers.test.ts && pnpm --filter @betinhos/shell typecheck`
Expected: PASS e typecheck sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src
git commit -m "feat(frota): janela, encaixe e km da realização na carga das manutenções

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: Janela do encaixe (`domain/janela.ts`)

**Files:**
- Create: `apps/shell/src/pages/frota/domain/janela.ts`
- Test: `apps/shell/src/pages/frota/domain/janela.test.ts`

**Interfaces:**
- Produces:
  - tipos `ModoJanela = 'dia' | 'semana'`, `Janela = { inicio: string; fim: string }`, `ValoresJanela = { modo; dia; semana; comentario }` e `ErrosJanela`;
  - funções `somarDias(dia, n)`, `segundaDe(dia)`, `janelaDoDia(dia)`, `semanaDe(dia)`, `janelaValida(j)`, `modoDe(j)`, `semanasAPartirDe(hoje, n)`, `rotuloJanela(j)`, `fimDaJanela(m)`, `atrasada(m, hoje)`, `valoresJanelaIniciais(atual, hoje, comentario)` e `lerJanela(v, hoje, limite) -> { erros, janela, comentario }`.

- [ ] **Step 1: Testes que falham**

```ts
// apps/shell/src/pages/frota/domain/janela.test.ts
import { describe, expect, it } from 'vitest'
import { MANUT } from '../data/schema'
import { atrasada, fimDaJanela, janelaDoDia, janelaValida, lerJanela, modoDe, rotuloJanela, segundaDe, semanaDe, semanasAPartirDe, somarDias, valoresJanelaIniciais } from './janela'

describe('janela do encaixe', () => {
  it('a semana vai de segunda a domingo, inclusive quando o dia é domingo', () => {
    expect(segundaDe('2026-11-18')).toBe('2026-11-16') // quarta
    expect(segundaDe('2026-11-16')).toBe('2026-11-16') // segunda
    expect(segundaDe('2026-11-22')).toBe('2026-11-16') // domingo
    expect(semanaDe('2026-11-22')).toEqual({ inicio: '2026-11-16', fim: '2026-11-22' })
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('valida como o servidor (Ciclo.ValidarJanela): um dia, ou segunda a domingo', () => {
    expect(janelaValida(janelaDoDia('2026-11-18'))).toBe(true)
    expect(janelaValida({ inicio: '2026-11-16', fim: '2026-11-22' })).toBe(true)
    expect(janelaValida({ inicio: '2026-11-17', fim: '2026-11-23' })).toBe(false) // terça a segunda
    expect(janelaValida({ inicio: '2026-11-16', fim: '2026-11-20' })).toBe(false) // segunda a sexta
    expect(janelaValida({ inicio: '18/11/2026', fim: '18/11/2026' })).toBe(false)
  })

  it('oferece a semana de hoje e as seguintes, com rótulo legível', () => {
    expect(semanasAPartirDe('2026-11-18', 3).map((s) => s.inicio)).toEqual(['2026-11-16', '2026-11-23', '2026-11-30'])
    expect(rotuloJanela({ inicio: '2026-11-16', fim: '2026-11-22' })).toBe('Semana de 16/11 a 22/11/2026')
    expect(rotuloJanela(janelaDoDia('2026-11-18'))).toBe('18/11/2026')
    expect(modoDe({ inicio: '2026-11-16', fim: '2026-11-22' })).toBe('semana')
    expect(modoDe(janelaDoDia('2026-11-18'))).toBe('dia')
  })

  it('atrasada: janela vencida em Agendado ou Programado; sem janela, a data antiga de agendamento', () => {
    const hoje = '2026-11-18'
    const m = (status: number, janelaFim: string | null, agendarPara: string | null = null) => ({ status, janelaFim, agendarPara })
    expect(atrasada(m(MANUT.AGENDADO, '2026-11-17'), hoje)).toBe(true)
    expect(atrasada(m(MANUT.PROGRAMADO, '2026-11-17'), hoje)).toBe(true)
    expect(atrasada(m(MANUT.AGENDADO, '2026-11-18'), hoje)).toBe(false) // vence hoje: ainda não está atrasada
    expect(atrasada(m(MANUT.SOLICITADO, '2026-11-01'), hoje)).toBe(false)
    expect(atrasada(m(MANUT.REALIZADO, '2026-11-01'), hoje)).toBe(false)
    expect(atrasada(m(MANUT.PROGRAMADO, null, '2026-11-10'), hoje)).toBe(true) // registro antigo
    expect(fimDaJanela({ janelaFim: '2026-11-22', agendarPara: '2026-11-10' })).toBe('2026-11-22')
  })

  it('valores iniciais: a semana de hoje; com janela gravada, ela', () => {
    expect(valoresJanelaIniciais(null, '2026-11-18', null)).toEqual({ modo: 'semana', dia: '2026-11-18', semana: '2026-11-16', comentario: '' })
    expect(valoresJanelaIniciais(janelaDoDia('2026-11-25'), '2026-11-18', 'Levar cedo')).toEqual({ modo: 'dia', dia: '2026-11-25', semana: '2026-11-23', comentario: 'Levar cedo' })
    expect(valoresJanelaIniciais({ inicio: '2026-11-23', fim: '2026-11-29' }, '2026-11-18', null)).toEqual({ modo: 'semana', dia: '2026-11-23', semana: '2026-11-23', comentario: '' })
  })

  it('lê dia ou semana; recusa janela que já passou e comentário longo', () => {
    const base = { modo: 'semana' as const, dia: '2026-11-18', semana: '2026-11-23', comentario: ' ok ' }
    expect(lerJanela(base, '2026-11-18', 100)).toEqual({ erros: {}, janela: { inicio: '2026-11-23', fim: '2026-11-29' }, comentario: 'ok' })
    expect(lerJanela({ ...base, modo: 'dia', dia: '2026-11-20', comentario: '' }, '2026-11-18', 100)).toEqual({ erros: {}, janela: { inicio: '2026-11-20', fim: '2026-11-20' }, comentario: null })
    expect(lerJanela({ ...base, semana: '2026-11-16' }, '2026-11-18', 100).janela).toEqual({ inicio: '2026-11-16', fim: '2026-11-22' }) // semana corrente vale
    expect(lerJanela({ ...base, modo: 'dia', dia: '' }, '2026-11-18', 100).erros).toEqual({ dia: 'Escolha o dia' })
    expect(lerJanela({ ...base, modo: 'dia', dia: '2026-11-17' }, '2026-11-18', 100).erros).toEqual({ dia: 'A janela não pode terminar antes de hoje' })
    expect(lerJanela({ ...base, semana: '2026-11-09' }, '2026-11-18', 100).erros).toEqual({ semana: 'A janela não pode terminar antes de hoje' })
    expect(lerJanela({ ...base, semana: '' }, '2026-11-18', 100).erros).toEqual({ semana: 'Escolha a semana' })
    expect(lerJanela({ ...base, comentario: 'x'.repeat(101) }, '2026-11-18', 100).erros).toEqual({ comentario: 'Máximo de 100 caracteres' })
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/janela.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 2: Implementação**

```ts
// apps/shell/src/pages/frota/domain/janela.ts
import { daysBetween, formatBR } from '../data/dates'
import { MANUT } from '../data/schema'
import type { Manutencao } from '../data/types'

/** Janela do encaixe (spec 2026-11-16-manutencoes-v2): um dia, ou uma semana de segunda a domingo. Datas `YYYY-MM-DD`. */
export type ModoJanela = 'dia' | 'semana'
export type Janela = { inicio: string; fim: string }
export type ValoresJanela = { modo: ModoJanela; dia: string; semana: string; comentario: string }
export type ErrosJanela = Partial<Record<'dia' | 'semana' | 'comentario', string>>

const DIA = /^\d{4}-\d{2}-\d{2}$/

/** Soma dias no calendário (UTC, sem fuso: só a data). */
export function somarDias(dia: string, dias: number) {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Segunda-feira da semana (seg–dom) do dia. */
export function segundaDe(dia: string) {
  const diaDaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay() // 0 = domingo
  return somarDias(dia, diaDaSemana === 0 ? -6 : 1 - diaDaSemana)
}

export const janelaDoDia = (dia: string): Janela => ({ inicio: dia, fim: dia })

export function semanaDe(dia: string): Janela {
  const inicio = segundaDe(dia)
  return { inicio, fim: somarDias(inicio, 6) }
}

/** Mesma regra de `Ciclo.ValidarJanela` (Cr40f.Frota.Plugin): um dia, ou de segunda a domingo. */
export function janelaValida(j: Janela) {
  if (!DIA.test(j.inicio) || !DIA.test(j.fim)) return false
  if (j.inicio === j.fim) return true
  return segundaDe(j.inicio) === j.inicio && somarDias(j.inicio, 6) === j.fim
}

export const modoDe = (j: Janela): ModoJanela => (j.inicio === j.fim ? 'dia' : 'semana')

/** A semana de hoje e as seguintes: as opções do encaixe por semana. */
export function semanasAPartirDe(hoje: string, quantas: number): Janela[] {
  const primeira = segundaDe(hoje)
  return Array.from({ length: quantas }, (_, i) => semanaDe(somarDias(primeira, i * 7)))
}

export function rotuloJanela(j: Janela) {
  if (j.inicio === j.fim) return formatBR(j.inicio)
  return `Semana de ${formatBR(j.inicio).slice(0, 5)} a ${formatBR(j.fim)}`
}

/** Fim da janela; registro de antes da conversão (plano 5) só tem a data antiga de agendamento. */
export const fimDaJanela = (m: Pick<Manutencao, 'janelaFim' | 'agendarPara'>) => m.janelaFim ?? m.agendarPara

/** Atrasada não é estado: janela vencida (fim antes de hoje) com a manutenção Agendada ou Programada. */
export function atrasada(m: Pick<Manutencao, 'status' | 'janelaFim' | 'agendarPara'>, hoje: string) {
  const fim = fimDaJanela(m)
  return (m.status === MANUT.AGENDADO || m.status === MANUT.PROGRAMADO) && fim !== null && daysBetween(hoje, fim) < 0
}

export function valoresJanelaIniciais(atual: Janela | null, hoje: string, comentario: string | null): ValoresJanela {
  if (atual && janelaValida(atual)) return { modo: modoDe(atual), dia: atual.inicio, semana: segundaDe(atual.inicio), comentario: comentario ?? '' }
  return { modo: 'semana', dia: hoje, semana: segundaDe(hoje), comentario: comentario ?? '' }
}

export type LeituraJanela = { erros: ErrosJanela; janela: Janela | null; comentario: string | null }

/** Janela e comentário prontos para o `cr40f_ManutencaoAgendar`; janela que termina antes de hoje é recusada na tela. */
export function lerJanela(v: ValoresJanela, hoje: string, limiteComentario: number): LeituraJanela {
  const erros: ErrosJanela = {}
  let janela: Janela | null = null
  if (v.modo === 'dia') {
    if (!DIA.test(v.dia)) erros.dia = 'Escolha o dia'
    else janela = janelaDoDia(v.dia)
  } else if (!DIA.test(v.semana)) erros.semana = 'Escolha a semana'
  else janela = semanaDe(v.semana)
  if (janela && janela.fim < hoje) {
    erros[v.modo] = 'A janela não pode terminar antes de hoje'
    janela = null
  }
  const comentario = v.comentario.trim()
  if (comentario.length > limiteComentario) erros.comentario = `Máximo de ${limiteComentario} caracteres`
  if (Object.keys(erros).length) return { erros, janela: null, comentario: null }
  return { erros, janela, comentario: comentario || null }
}
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/janela.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/shell/src/pages/frota/domain/janela.ts apps/shell/src/pages/frota/domain/janela.test.ts
git commit -m "feat(frota): janela do encaixe (dia ou semana de segunda a domingo) e atrasada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Fila "A encaixar" (`domain/fila.ts`)

**Files:**
- Create: `apps/shell/src/pages/frota/domain/fila.ts`
- Test: `apps/shell/src/pages/frota/domain/fila.test.ts`

**Interfaces:**
- Produces: `filaEncaixe(manutencoes) -> Manutencao[]`, `diaDoPedido(m) -> string`, `diasEsperando(m, hoje) -> number`.

- [ ] **Step 1: Testes que falham**

```ts
// apps/shell/src/pages/frota/domain/fila.test.ts
import { describe, expect, it } from 'vitest'
import { MANUT } from '../data/schema'
import type { Manutencao } from '../data/types'
import { diasEsperando, filaEncaixe } from './fila'

const manut = (id: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id, descricao: id, status: MANUT.SOLICITADO, grau: 1, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: null, solicitante: null, criadoEm: '2026-11-10T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra })

describe('fila "A encaixar"', () => {
  it('só Solicitado; grau maior primeiro e, no mesmo grau, a mais antiga; sem grau no fim', () => {
    const fila = filaEncaixe([
      manut('baixaAntiga', { grau: 1, criadoEm: '2026-11-01T12:00:00Z' }),
      manut('urgenteNova', { grau: 4, criadoEm: '2026-11-15T12:00:00Z' }),
      manut('urgenteAntiga', { grau: 4, criadoEm: '2026-11-12T12:00:00Z' }),
      manut('semGrau', { grau: null, criadoEm: '2026-10-01T12:00:00Z' }),
      manut('alta', { grau: 3 }),
      manut('agendada', { grau: 4, status: MANUT.AGENDADO }),
      manut('cancelada', { grau: 4, status: MANUT.CANCELADO }),
    ])
    expect(fila.map((m) => m.id)).toEqual(['urgenteAntiga', 'urgenteNova', 'alta', 'baixaAntiga', 'semGrau'])
  })

  it('conta os dias desde o pedido no fuso de São Paulo', () => {
    expect(diasEsperando(manut('a', { criadoEm: '2026-11-16T02:00:00Z' }), '2026-11-18')).toBe(3) // 15/11 às 23:00 em São Paulo
    expect(diasEsperando(manut('b', { criadoEm: '2026-11-18T12:00:00Z' }), '2026-11-18')).toBe(0)
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/fila.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 2: Implementação**

```ts
// apps/shell/src/pages/frota/domain/fila.ts
import { daysBetween, diaSP } from '../data/dates'
import { MANUT } from '../data/schema'
import type { Manutencao } from '../data/types'

/** Dia do pedido (createdon) em São Paulo. */
export const diaDoPedido = (m: Pick<Manutencao, 'criadoEm'>) => diaSP(m.criadoEm) ?? m.criadoEm.slice(0, 10)

export const diasEsperando = (m: Pick<Manutencao, 'criadoEm'>, hoje: string) => Math.max(0, daysBetween(diaDoPedido(m), hoje))

/** Fila "A encaixar" (spec): Solicitado, grau maior primeiro (Urgente, Alta, Média, Baixa; sem grau no fim) e, no mesmo grau, a mais antiga. */
export function filaEncaixe(manutencoes: Manutencao[]): Manutencao[] {
  return manutencoes
    .filter((m) => m.status === MANUT.SOLICITADO)
    .sort((a, b) => (b.grau ?? 0) - (a.grau ?? 0) || a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id))
}
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/fila.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/shell/src/pages/frota/domain/fila.ts apps/shell/src/pages/frota/domain/fila.test.ts
git commit -m "feat(frota): fila A encaixar por grau e antiguidade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: Preventiva com o km da realização (Frota e Dashboard)

**Files:**
- Modify: `apps/shell/src/pages/frota/domain/preventiva.ts`
- Test: `apps/shell/src/pages/frota/domain/preventiva.test.ts`
- Modify: `apps/shell/src/pages/dashboard/data/queries.ts`
- Test: `apps/shell/src/pages/dashboard/data/data.test.ts`

**Interfaces:**
- Produces: `ManutencaoPrev` com `kmRealizado`; `kmDe(m) = m.kmRealizado ?? m.km`, usado na última execução e no km estimado.

- [ ] **Step 1: Teste que falha**

Em `preventiva.test.ts`, troque o helper `manut` (linha 8) por:

```ts
const manut = (id: string, extra: Partial<ManutencaoPrev> = {}): ManutencaoPrev => ({ id, status: MANUT.REALIZADO, dataManutencao: null, criadoEm: '2026-01-01T12:00:00Z', km: null, kmRealizado: null, veiculo: null, servicos: [], ...extra })
```

e acrescente ao `describe('preventiva')`:

```ts
  it('o km de quem concluiu vale mais que o km do pedido (última execução e km estimado)', () => {
    const [p] = calcularPreventivas(entrada({
      veiculos: [veic('a')],
      manutencoes: [manut('feita', { veiculo: ref('a'), servicos: [1], dataManutencao: '2026-09-05', km: 150000, kmRealizado: 158000 })],
    }), today)
    expect(p.ultima).toMatchObject({ km: 158000, manutencaoId: 'feita', complementadaPorBaseline: false })
    expect(p).toMatchObject({ kmAtual: 158000, kmEstimado: true, kmProxima: 168000, faltamKm: 10000 })
  })
```

Em `dashboard/data/data.test.ts`, na expectativa de `manutencoesPreventivaPath('man')` (linha 486), troque `cr40f_kmatual,_cr40f_placa_carro_value` por `cr40f_kmatual,cr40f_kmrealizado,_cr40f_placa_carro_value`. No `expect(ok.preventivas)` (linha 505), troque `km: 12000, veiculo` por `km: 12000, kmRealizado: null, veiculo`.

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/preventiva.test.ts src/pages/dashboard/data/data.test.ts`
Expected: FAIL.

- [ ] **Step 2: `preventiva.ts`**

Troque o tipo da linha 15 e acrescente `kmDe` logo abaixo:

```ts
export type ManutencaoPrev = Pick<Manutencao, 'id' | 'status' | 'dataManutencao' | 'criadoEm' | 'km' | 'kmRealizado' | 'veiculo' | 'servicos'>
/** Km da manutenção: o informado por quem concluiu (cr40f_kmrealizado) vale mais que o do pedido (cr40f_kmatual). */
export const kmDe = (m: Pick<ManutencaoPrev, 'km' | 'kmRealizado'>) => m.kmRealizado ?? m.km
```

Em `kmAtualDe`, troque a linha do `kms` por:

```ts
  const kms = manutencoes.filter((m) => m.veiculo?.id === veiculo.id && kmDe(m) !== null).map((m) => kmDe(m) as number)
```

Em `ultimaExecucao`, troque as linhas 42 e 43 por:

```ts
    const kmManutencao = kmDe(melhor.m)
    const km = kmManutencao ?? baselineValida?.km ?? null
    return { km, data: melhor.dia, origem: 'manutencao', manutencaoId: melhor.m.id, complementadaPorBaseline: kmManutencao === null && km !== null }
```

- [ ] **Step 3: Dashboard**

Em `dashboard/data/queries.ts`, troque `manutencoesPreventivaPath` e `mapManutencaoPrev`:

```ts
export const manutencoesPreventivaPath = (set: string) =>
  `${set}?$select=cr40f_manutencoesid,cr40f_status,cr40f_datamanutencao,createdon,cr40f_kmatual,cr40f_kmrealizado,_cr40f_placa_carro_value,new_servicosmanutencao&$filter=statecode eq 0 and (cr40f_status eq 202410002 or cr40f_status eq 0 or cr40f_status eq 202410001 or cr40f_status eq 202410005)`
```

```ts
export const mapManutencaoPrev = (row: Row): ManutencaoPrev => ({
  id: lower(row.cr40f_manutencoesid), status: num(row.cr40f_status), dataManutencao: textoOuNull(row.cr40f_datamanutencao), criadoEm: str(row.createdon),
  km: num(row.cr40f_kmatual), kmRealizado: num(row.cr40f_kmrealizado), veiculo: refDe(row, '_cr40f_placa_carro_value'), servicos: lerMulti(row.new_servicosmanutencao),
})
```

No comentário acima de `manutencoesPreventivaPath`, troque "Solicitado, Aprovado e Programado" por "Solicitado, Agendado e Programado".

- [ ] **Step 4: Rodar (Betinhos-Renan)**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota src/pages/dashboard && pnpm --filter @betinhos/shell typecheck`
Expected: PASS (o fixture de paridade ainda não tem `kmRealizado`, e `kmRealizado ?? km` cai no `km`); typecheck sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/frota/domain/preventiva.ts apps/shell/src/pages/frota/domain/preventiva.test.ts apps/shell/src/pages/dashboard/data/queries.ts apps/shell/src/pages/dashboard/data/data.test.ts
git commit -m "feat(frota): preventiva usa o km informado na conclusão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: Pendências no ciclo novo (tela, Custom API e paridade)

A tela e a Custom API mudam juntas porque compartilham o fixture `paridade.json`. Separadas, uma das duas ficaria vermelha entre um commit e outro.

**Files:**
- Modify: `apps/shell/src/pages/frota/domain/pendencias.ts`, `apps/shell/src/pages/frota/domain/alertas.ts`, `apps/shell/src/pages/frota/views/Pendencias.tsx`
- Test: `apps/shell/src/pages/frota/domain/pendencias.test.ts`, `apps/shell/src/pages/frota/domain/alertas.test.ts`, `apps/shell/src/pages/frota/domain/paridade.test.ts`
- Modify: `packages/plugins/Cr40f.Frota.Plugin/Modelo.cs`, `Regras.cs`, `FrotaRepository.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin.Tests/RegrasManutencaoTests.cs`
- Modify: `packages/plugins/Cr40f.Frota.Plugin.Tests/ParidadeTests.cs`, `RepositoryTests.cs`, `Fixtures/paridade.json`

**Interfaces:**
- Consumes: `fimDaJanela` (Tarefa 6), `diasEsperando` (Tarefa 7), `kmDe` (Tarefa 8).
- Produces:
  - shell: `PendenciaTipo` troca `'aprovar'` por `'encaixar'` e `'agendada'` por `'atrasada'`, e tira `'programar'`; `LIMIARES.agendadoParadoDias = 5` (troca `aprovadoSemDataDias`); `prioridadeParada(m, hoje)` passa a contar do encaixe em Agendado;
  - C#: `Regras.Ordem = { "prioridade", "reincidencia", "preventiva", "atrasada", "custo", "hodometro" }`; funções públicas `Regras.FimDaJanela(m)`, `Regras.Atrasada(m, hoje)` e `Regras.KmDe(m)`; `ManutencaoRegistro` com `JanelaFim`, `DataAprovacao` e `KmRealizado` (o `AgendarPara` fica, por causa da D4); `Limiares.AgendadoParadoDias`;
  - textos iguais nos dois lados: `"Aguardando encaixe há N dias"`, `"Encaixada sem programação há N dias"` e, só na API, `"Janela até dd/MM/yyyy e ainda não realizada"`.

- [ ] **Step 1: Testes que falham no shell (pendências)**

Em `pendencias.test.ts`, troque os três primeiros testes (`'ordena aprovações por grau...'`, `'aponta aprovadas sem data...'`, `'manutenção aprovada com data vencida...'`) por:

```ts
  it('A encaixar: grau maior primeiro e, no mesmo grau, a mais antiga', () => {
    const result = build({ manutencoes: [
      manut('a', { grau: 1 }),
      manut('b', { grau: 4, criadoEm: '2026-10-01T12:00:00Z' }),
      manut('c', { grau: 3, criadoEm: '2026-10-01T12:00:00Z' }),
      manut('d', { grau: 1, criadoEm: '2026-09-20T12:00:00Z' }),
    ] })
    expect(result.map((item) => [item.tipo, item.id])).toEqual([['encaixar', 'b'], ['encaixar', 'c'], ['encaixar', 'a'], ['encaixar', 'd']])
  })

  it('atrasada: janela vencida em Agendado ou Programado; vence hoje ou futura não aparece; Agendado sem janela vencida não pede nada', () => {
    const result = build({ manutencoes: [
      manut('agendadaVencida', { status: MANUT.AGENDADO, janelaInicio: '2026-09-21', janelaFim: '2026-09-27' }),
      manut('programadaVencida', { status: MANUT.PROGRAMADO, janelaInicio: '2026-09-30', janelaFim: '2026-09-30' }),
      manut('semanaCorrente', { status: MANUT.PROGRAMADO, janelaInicio: '2026-09-28', janelaFim: '2026-10-04' }),
      manut('venceHoje', { status: MANUT.AGENDADO, janelaInicio: '2026-10-02', janelaFim: '2026-10-02' }),
      manut('futura', { status: MANUT.AGENDADO, janelaInicio: '2026-10-05', janelaFim: '2026-10-11' }),
      manut('semJanela', { status: MANUT.AGENDADO }),
    ] })
    expect(result.map((item) => [item.tipo, item.id, item.dias, item.prazo])).toEqual([['atrasada', 'agendadaVencida', -5, '2026-09-27'], ['atrasada', 'programadaVencida', -2, '2026-09-30']])
  })

  it('registro antigo sem janela: a data antiga de agendamento decide se está atrasada', () => {
    const result = build({ manutencoes: [
      manut('antigaVencida', { status: MANUT.PROGRAMADO, agendarPara: '2026-09-30' }),
      manut('antigaFutura', { status: MANUT.AGENDADO, agendarPara: '2026-10-05' }),
    ] })
    expect(result.map((item) => [item.tipo, item.id, item.dias])).toEqual([['atrasada', 'antigaVencida', -2]])
  })
```

No `describe('preventiva')`, troque o teste `'vencida e a vencer entram entre aprovar e programar...'` por:

```ts
    it('vencida e a vencer entram depois de A encaixar, vencida primeiro; em dia não gera', () => {
      const result = build({
        veiculos: [...veiculos, veic('v3', 'CCC3C33', 100)],
        planoPreventivo,
        baselines: [base('v1', 'oleo', 9000), base('v2', 'oleo', 4500), base('v3', 'oleo', 0)],
        manutencoes: [manut('ap', { grau: 1 }), manut('sd', { status: MANUT.AGENDADO })],
      })
      expect(result.map((p) => [p.tipo, p.id])).toEqual([['encaixar', 'ap'], ['preventiva', 'v1:oleo'], ['preventiva', 'v2:oleo']])
    })
```

Não rode ainda: o Step 2 roda os testes do shell e o Step 3 os do C#.

- [ ] **Step 2: Testes que falham no shell (alertas)**

Em `alertas.test.ts`, troque o `describe('prioridadeParada', ...)` inteiro por:

```ts
describe('prioridadeParada', () => {
  it('Alta solicitada há 3 dias entra (conta do pedido); Média e recentes não', () => {
    expect(prioridadeParada(manut('a', { grau: 3, status: MANUT.SOLICITADO, criadoEm: '2026-10-17T12:00:00Z' }), today)).toBe(3)
    expect(prioridadeParada(manut('c', { grau: 2, status: MANUT.SOLICITADO, criadoEm: '2026-09-01T12:00:00Z' }), today)).toBeNull()
    expect(prioridadeParada(manut('d', { grau: 4, status: MANUT.SOLICITADO, criadoEm: '2026-10-19T12:00:00Z' }), today)).toBeNull()
  })

  it('Urgente encaixada há 6 dias sem programação entra: conta do encaixe, não do pedido', () => {
    expect(prioridadeParada(manut('b', { grau: 4, status: MANUT.AGENDADO, criadoEm: '2026-09-01T12:00:00Z', dataAprovacao: '2026-10-14' }), today)).toBe(6)
    expect(prioridadeParada(manut('e', { grau: 4, status: MANUT.AGENDADO, criadoEm: '2026-09-01T12:00:00Z', dataAprovacao: '2026-10-18' }), today)).toBeNull()
  })

  it('sem data do encaixe (registro antigo) e Programada não entram', () => {
    expect(prioridadeParada(manut('f', { grau: 4, status: MANUT.AGENDADO, criadoEm: '2026-09-01T12:00:00Z' }), today)).toBeNull()
    expect(prioridadeParada(manut('g', { grau: 4, status: MANUT.PROGRAMADO, criadoEm: '2026-09-01T12:00:00Z', dataAprovacao: '2026-09-02' }), today)).toBeNull()
  })
})
```

No teste `'prioridade parada substitui aprovar e reincidência vem logo depois'`, troque o título por `'prioridade parada substitui A encaixar e reincidência vem logo depois'` e a expectativa por:

```ts
    expect(result.map((p) => [p.tipo, p.id])).toEqual([['prioridade', 'alta'], ['reincidencia', 'reinc:v1:9'], ['encaixar', 'baixa']])
    expect(result[0].detalhe).toBe('Aguardando encaixe há 10 dias')
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/pendencias.test.ts src/pages/frota/domain/alertas.test.ts`
Expected: FAIL (ainda saem `aprovar`, `programar` e `agendada`; a prioridade ainda conta da criação).

- [ ] **Step 3: Testes que falham no C#**

```csharp
// packages/plugins/Cr40f.Frota.Plugin.Tests/RegrasManutencaoTests.cs
using System;
using System.Collections.Generic;
using System.Linq;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class RegrasManutencaoTests
{
    const string Hoje = "2026-10-20";

    static ManutencaoRegistro M(string id, int status, int grau = 2) => new()
    {
        Id = id, Descricao = id, Status = status, Grau = grau, CriadoEm = "2026-09-01", VeiculoId = "v1", VeiculoLabel = "ABC1A11",
    };

    [Theory]
    [InlineData(Codigos.Agendado, "2026-10-19", true)]
    [InlineData(Codigos.Programado, "2026-10-19", true)]
    [InlineData(Codigos.Agendado, "2026-10-20", false)] // vence hoje
    [InlineData(Codigos.Solicitado, "2026-10-01", false)]
    [InlineData(Codigos.Realizado, "2026-10-01", false)]
    public void Atrasada_quando_a_janela_venceu_em_aberto(int status, string fim, bool esperado)
    {
        var m = M("a", status);
        m.JanelaFim = fim;
        Assert.Equal(esperado, Regras.Atrasada(m, Hoje));
    }

    [Fact]
    public void Sem_janela_usa_a_data_antiga_de_agendamento()
    {
        var m = M("a", Codigos.Programado);
        m.AgendarPara = "2026-10-15";
        Assert.True(Regras.Atrasada(m, Hoje));
        m.JanelaFim = "2026-10-25";
        Assert.False(Regras.Atrasada(m, Hoje));
    }

    [Fact]
    public void Prioridade_parada_conta_do_pedido_antes_do_encaixe_e_do_encaixe_depois()
    {
        var solicitada = M("s", Codigos.Solicitado, 3);
        solicitada.CriadoEm = "2026-10-17";
        Assert.Equal(3, Regras.PrioridadeParada(solicitada, Hoje));

        var encaixada = M("e", Codigos.Agendado, 4);
        encaixada.DataAprovacao = "2026-10-14";
        Assert.Equal(6, Regras.PrioridadeParada(encaixada, Hoje));
        encaixada.DataAprovacao = "2026-10-18";
        Assert.Null(Regras.PrioridadeParada(encaixada, Hoje));

        Assert.Null(Regras.PrioridadeParada(M("antiga", Codigos.Agendado, 4), Hoje)); // sem data do encaixe
        var programada = M("p", Codigos.Programado, 4);
        programada.DataAprovacao = "2026-09-01";
        Assert.Null(Regras.PrioridadeParada(programada, Hoje));
    }

    [Fact]
    public void Pendencia_atrasada_traz_o_fim_da_janela()
    {
        var m = M("a1", Codigos.Programado);
        m.JanelaFim = "2026-10-18";
        var p = Regras.Avaliar(new DadosFrota { Manutencoes = new List<ManutencaoRegistro> { m } }, Hoje, new DateTime(2026, 10, 20, 12, 0, 0, DateTimeKind.Utc)).Pendencias.Single();
        Assert.Equal("atrasada", p.Tipo);
        Assert.Equal("Janela até 18/10/2026 e ainda não realizada", p.Detalhe);
        Assert.Equal("a1", p.ManutencaoId);
    }

    [Fact]
    public void Preventiva_usa_o_km_da_realizacao()
    {
        var dados = new DadosFrota
        {
            Veiculos = { new Veiculo { Id = "v1", Placa = "ABC1A11", Status = Codigos.VeiculoAtivo, Categoria = Codigos.Proprio, Hodometro = 30000 } },
            Itens = { new ItemPlano { Id = "oleo", Nome = "Troca de óleo", Servico = 100000000, IntervaloKm = 10000 } },
            Manutencoes = { new ManutencaoRegistro { Id = "r", Status = Codigos.Realizado, DataManutencao = "2026-10-10", CriadoEm = "2026-10-09", Km = 20000, KmRealizado = 29500, VeiculoId = "v1", Servicos = { 100000000 } } },
        };
        Assert.Empty(Regras.Preventivas(dados, Hoje)); // 29.500 + 10.000 > 30.000 + aviso
        dados.Manutencoes[0].KmRealizado = null;
        Assert.Single(Regras.Preventivas(dados, Hoje)); // pelo km do pedido estaria a vencer
    }
}
```

Em `RepositoryTests.cs`, no entity do primeiro teste, acrescente depois da linha do `cr40f_agendarpara`:

```csharp
            ["cr40f_janelafim"] = new DateTime(2026, 10, 26, 0, 0, 0, DateTimeKind.Utc), // somente data
            ["cr40f_datadaaprovacao"] = new DateTime(2026, 10, 14, 13, 0, 0, DateTimeKind.Utc), // 14/10 10:00 em São Paulo
            ["cr40f_kmrealizado"] = 85200,
```

e, depois de `Assert.Equal("2026-10-25", manut.AgendarPara);`:

```csharp
        Assert.Equal("2026-10-26", manut.JanelaFim);
        Assert.Equal("2026-10-14", manut.DataAprovacao);
        Assert.Equal(85200m, manut.KmRealizado);
```

Em `ParidadeTests.cs`, troque as linhas 51 e 52 por:

```csharp
        Assert.Equal("Aguardando encaixe há 3 dias", p.Single(x => x.Id == "p1").Detalhe);
        Assert.Equal("Encaixada sem programação há 6 dias", p.Single(x => x.Id == "p2").Detalhe);
        Assert.Equal("Janela até 18/10/2026 e ainda não realizada", p.Single(x => x.Id == "a1").Detalhe);
```

Run (Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`
Expected: FAIL de compilação (`Regras.Atrasada`, `JanelaFim`, `DataAprovacao`, `KmRealizado` não existem).

- [ ] **Step 4: Fixture de paridade (lido pelo C# e pelo shell)**

Troque `packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/paridade.json` inteiro por:

```json
{
  "hoje": "2026-10-20",
  "agora": "2026-10-20T12:00:00Z",
  "veiculos": [
    { "id": "v1", "placa": "ABC1A11", "status": 202410001, "categoria": 100000000, "hodometro": 52000, "hodometroEm": "2026-10-20T06:00:00Z" },
    { "id": "v2", "placa": "ABC2B22", "status": 202410001, "categoria": 100000000, "hodometro": 30000, "hodometroEm": "2026-10-18T11:00:00Z" },
    { "id": "v3", "placa": "ABC3C33", "status": 202410001, "categoria": 100000000, "hodometro": null, "hodometroEm": null },
    { "id": "v4", "placa": "ABC4D44", "status": 202410001, "categoria": 100000001, "hodometro": null, "hodometroEm": null },
    { "id": "v5", "placa": "ABC5E55", "status": 202410000, "categoria": 100000000, "hodometro": 90000, "hodometroEm": "2026-09-01T12:00:00Z" }
  ],
  "itens": [
    { "id": "i-oleo", "nome": "Troca de óleo", "servico": 100000000, "intervaloKm": 10000, "intervaloMeses": 12, "avisoKm": 1000, "avisoDias": 30, "ativo": true },
    { "id": "i-pneu", "nome": "Troca de pneu", "servico": 100000012, "intervaloKm": 40000, "intervaloMeses": null, "avisoKm": 1000, "avisoDias": 30, "ativo": true },
    { "id": "i-inativo", "nome": "Item inativo", "servico": 100000001, "intervaloKm": 1, "intervaloMeses": 1, "avisoKm": 1000, "avisoDias": 30, "ativo": false }
  ],
  "baselines": [
    { "veiculoId": "v1", "itemId": "i-oleo", "km": 41000, "data": "2026-01-10" },
    { "veiculoId": "v1", "itemId": "i-pneu", "km": 13000, "data": null },
    { "veiculoId": "v2", "itemId": "i-oleo", "km": 25000, "data": "2025-11-05" },
    { "veiculoId": "v3", "itemId": "i-oleo", "km": null, "data": "2026-06-01" }
  ],
  "manutencoes": [
    { "id": "r1", "descricao": "Freio", "status": 202410002, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": "2026-07-01", "criadoEm": "2026-06-30", "km": null, "kmRealizado": null, "valor": 100, "estabelecimento": "Oficina A", "veiculoId": "v3", "veiculoLabel": "ABC3C33", "servicos": [100000007] },
    { "id": "r2", "descricao": "Freio de novo", "status": 202410002, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": "2026-09-01", "criadoEm": "2026-08-30", "km": null, "kmRealizado": null, "valor": 200, "estabelecimento": "Oficina A", "veiculoId": "v3", "veiculoLabel": "ABC3C33", "servicos": [100000007] },
    { "id": "r3", "descricao": "Freio de novo", "status": 202410002, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": "2026-10-10", "criadoEm": "2026-10-09", "km": null, "kmRealizado": null, "valor": 300, "estabelecimento": "Oficina B", "veiculoId": "v3", "veiculoLabel": "ABC3C33", "servicos": [100000007] },
    { "id": "x1", "descricao": "Freio cancelado", "status": 100000001, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": null, "criadoEm": "2026-10-12", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v3", "veiculoLabel": "ABC3C33", "servicos": [100000007] },
    { "id": "l1", "descricao": "Filtro", "status": 202410002, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": "2025-11-01", "criadoEm": "2025-11-01", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v4", "veiculoLabel": "ABC4D44", "servicos": [100000002] },
    { "id": "l2", "descricao": "Filtro", "status": 202410002, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": "2026-01-15", "criadoEm": "2026-01-15", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v4", "veiculoLabel": "ABC4D44", "servicos": [100000002] },
    { "id": "l3", "descricao": "Filtro", "status": 202410002, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": "2026-03-20", "criadoEm": "2026-03-20", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v4", "veiculoLabel": "ABC4D44", "servicos": [100000002] },
    { "id": "l4", "descricao": "Filtro", "status": 202410002, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": "2026-05-30", "criadoEm": "2026-05-30", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v4", "veiculoLabel": "ABC4D44", "servicos": [100000002] },
    { "id": "l5", "descricao": "Filtro", "status": 202410002, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": "2026-09-01", "criadoEm": "2026-09-01", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v4", "veiculoLabel": "ABC4D44", "servicos": [100000002] },
    { "id": "c1", "descricao": "Revisão", "status": 202410002, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": "2026-10-01", "criadoEm": "2026-10-01", "km": null, "kmRealizado": null, "valor": 400, "estabelecimento": null, "veiculoId": "v1", "veiculoLabel": "ABC1A11", "servicos": [] },
    { "id": "c2", "descricao": "Revisão", "status": 202410002, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": "2026-09-15", "criadoEm": "2026-09-15", "km": null, "kmRealizado": null, "valor": 450, "estabelecimento": null, "veiculoId": "v2", "veiculoLabel": "ABC2B22", "servicos": [] },
    { "id": "c4", "descricao": "Motor", "status": 202410002, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": "2026-10-05", "criadoEm": "2026-10-05", "km": null, "kmRealizado": null, "valor": 2000, "estabelecimento": null, "veiculoId": "v4", "veiculoLabel": "ABC4D44", "servicos": [] },
    { "id": "k1", "descricao": "Óleo com km da realização", "status": 202410002, "grau": 1, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": "2026-10-10", "criadoEm": "2026-10-09", "km": 20000, "kmRealizado": 29500, "valor": null, "estabelecimento": null, "veiculoId": "v2", "veiculoLabel": "ABC2B22", "servicos": [100000000] },
    { "id": "p1", "descricao": "Barulho no motor", "status": 0, "grau": 3, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": null, "criadoEm": "2026-10-17", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v1", "veiculoLabel": "ABC1A11", "servicos": [] },
    { "id": "p2", "descricao": "Luz do freio", "status": 202410001, "grau": 4, "agendarPara": null, "janelaInicio": "2026-10-26", "janelaFim": "2026-11-01", "dataAprovacao": "2026-10-14", "dataManutencao": null, "criadoEm": "2026-10-01", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v2", "veiculoLabel": "ABC2B22", "servicos": [] },
    { "id": "p3", "descricao": "Média antiga", "status": 0, "grau": 2, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": null, "criadoEm": "2026-09-01", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v2", "veiculoLabel": "ABC2B22", "servicos": [] },
    { "id": "p4", "descricao": "Urgente recente", "status": 0, "grau": 4, "agendarPara": null, "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": null, "criadoEm": "2026-10-19", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v1", "veiculoLabel": "ABC1A11", "servicos": [] },
    { "id": "p5", "descricao": "Urgente encaixada há pouco", "status": 202410001, "grau": 4, "agendarPara": null, "janelaInicio": "2026-10-26", "janelaFim": "2026-11-01", "dataAprovacao": "2026-10-18", "dataManutencao": null, "criadoEm": "2026-09-01", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v2", "veiculoLabel": "ABC2B22", "servicos": [] },
    { "id": "p6", "descricao": "Urgente antiga sem data do encaixe", "status": 202410001, "grau": 4, "agendarPara": "2026-10-30", "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": null, "criadoEm": "2026-09-01", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v2", "veiculoLabel": "ABC2B22", "servicos": [] },
    { "id": "a1", "descricao": "Alinhamento", "status": 202410005, "grau": 2, "agendarPara": null, "janelaInicio": "2026-10-12", "janelaFim": "2026-10-18", "dataAprovacao": "2026-10-08", "dataManutencao": null, "criadoEm": "2026-10-01", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v2", "veiculoLabel": "ABC2B22", "servicos": [] },
    { "id": "a2", "descricao": "Encaixada para a semana que vem", "status": 202410001, "grau": 2, "agendarPara": null, "janelaInicio": "2026-10-26", "janelaFim": "2026-11-01", "dataAprovacao": "2026-10-19", "dataManutencao": null, "criadoEm": "2026-10-01", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v2", "veiculoLabel": "ABC2B22", "servicos": [] },
    { "id": "a3", "descricao": "Encaixada para hoje", "status": 202410001, "grau": 2, "agendarPara": null, "janelaInicio": "2026-10-20", "janelaFim": "2026-10-20", "dataAprovacao": "2026-10-19", "dataManutencao": null, "criadoEm": "2026-10-01", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v2", "veiculoLabel": "ABC2B22", "servicos": [] },
    { "id": "a4", "descricao": "Programada antiga, sem janela", "status": 202410005, "grau": 2, "agendarPara": "2026-10-15", "janelaInicio": null, "janelaFim": null, "dataAprovacao": null, "dataManutencao": null, "criadoEm": "2026-10-01", "km": null, "kmRealizado": null, "valor": null, "estabelecimento": null, "veiculoId": "v2", "veiculoLabel": "ABC2B22", "servicos": [] }
  ],
  "esperado": [
    "atrasada|a1",
    "atrasada|a4",
    "custo|custo:v4",
    "hodometro|hod:v2",
    "preventiva|v1:i-oleo",
    "preventiva|v1:i-pneu",
    "prioridade|p1",
    "prioridade|p2",
    "reincidencia|reinc:v3:100000007",
    "reincidencia|reinc:v4:100000002"
  ]
}
```

O que o fixture prova:

| Caso | Mostra que |
|---|---|
| p2 (6 dias desde o encaixe) entra; p5 (2 dias) e p6 (sem data do encaixe) não | a prioridade parada conta de `dataAprovacao` |
| a1 entra; a2 e a3 (vence hoje) não | a "atrasada" olha o fim da janela |
| a4 entra | sem janela, vale o `agendarPara` antigo |
| `v2:i-oleo` some do esperado | k1 tem `kmRealizado` 29500: a próxima troca fica em 39500 contra o hodômetro 30000. Pelo km do pedido (20000) ela estaria a vencer |

- [ ] **Step 5: `alertas.ts`**

No `LIMIARES`, troque `aprovadoSemDataDias: 5,` por:

```ts
  agendadoParadoDias: 5,
```

Troque a função `prioridadeParada` e o comentário acima dela por:

```ts
/**
 * Alta/Urgente parada: Solicitada há mais de N dias (contados do pedido) ou Agendada há mais de M dias sem programação
 * (contados do encaixe, cr40f_datadaaprovacao). Agendada sem data do encaixe é registro antigo (antes da conversão do
 * plano 5) e não entra. A Custom API (Regras.PrioridadeParada) faz igual.
 */
export function prioridadeParada(m: Manutencao, today: string): number | null {
  if ((m.grau ?? 0) < LIMIARES.prioridadeGrauMinimo) return null
  if (m.status === MANUT.SOLICITADO) {
    const dias = daysBetween(diaSP(m.criadoEm) ?? m.criadoEm.slice(0, 10), today)
    return dias > LIMIARES.solicitadoParadoDias ? dias : null
  }
  if (m.status === MANUT.AGENDADO && m.dataAprovacao) {
    const dias = daysBetween(diaSP(m.dataAprovacao) ?? m.dataAprovacao.slice(0, 10), today)
    return dias > LIMIARES.agendadoParadoDias ? dias : null
  }
  return null
}
```

- [ ] **Step 6: `pendencias.ts`**

Acrescente aos `import`:

```ts
import { diasEsperando } from './fila'
import { fimDaJanela } from './janela'
```

Troque o tipo, a ordem e os rótulos (linhas 7 e 13 a 26):

```ts
export type PendenciaTipo = 'prioridade' | 'reincidencia' | 'encaixar' | 'preventiva' | 'atrasada' | 'notificar' | 'indicar' | 'colisao' | 'hodometro' | 'custo'
```

```ts
export const PENDENCIA_ORDEM: PendenciaTipo[] = ['prioridade', 'reincidencia', 'encaixar', 'preventiva', 'atrasada', 'notificar', 'indicar', 'colisao', 'custo', 'hodometro']
export const PENDENCIA_LABEL: Record<PendenciaTipo, string> = {
  prioridade: 'Manutenções de prioridade Alta ou Urgente paradas (solicitadas há mais de 2 dias sem encaixe ou encaixadas há mais de 5 sem programação)',
  reincidencia: 'Mesmo serviço repetido no mesmo veículo (3 vezes em 120 dias ou 5 em 12 meses): vale investigar a causa raiz',
  custo: 'Veículos com custo de manutenção nos últimos 90 dias acima de 1,5× a mediana da frota',
  hodometro: 'Hodômetro sem atualização do Infleet há mais de 48 horas: preventivas por km podem estar erradas',
  encaixar: 'Manutenções solicitadas esperando encaixe num dia ou numa semana',
  preventiva: 'Preventivas vencidas ou a vencer (plano da frota)',
  atrasada: 'Manutenções encaixadas ou programadas com a janela vencida e ainda não realizadas',
  notificar: 'Multas: notificar o condutor',
  indicar: 'Multas com prazo de indicação vencido ou em até 7 dias',
  colisao: 'Colisões em aberto',
}
```

Troque o laço das manutenções (linhas 54 a 68) por:

```ts
  for (const item of data.manutencoes) {
    const base = { kind: 'manutencao' as const, id: item.id, titulo: item.descricao, veiculo: item.veiculo, pessoa: item.solicitante, veiculoId: item.veiculo?.id ?? null, faltamKm: null, ...SEM_PREVENTIVA }
    const parada = prioridadeParada(item, today)
    if (parada !== null) {
      // Substitui "A encaixar" e "Atrasada" para não listar a mesma manutenção duas vezes (a Custom API faz igual).
      result.push({ ...base, tipo: 'prioridade', prazo: null, dias: null, peso: -(item.grau ?? 0) * 1000 - parada, detalhe: `${item.status === MANUT.SOLICITADO ? 'Aguardando encaixe' : 'Encaixada sem programação'} há ${parada} dias` })
      continue
    }
    // Mesma ordem da fila "A encaixar": grau maior primeiro e, no mesmo grau, a mais antiga.
    if (item.status === MANUT.SOLICITADO) result.push({ ...base, tipo: 'encaixar', prazo: null, dias: null, peso: -(item.grau ?? 0) * 100_000 - diasEsperando(item, today) })
    const fim = fimDaJanela(item)
    if ((item.status === MANUT.AGENDADO || item.status === MANUT.PROGRAMADO) && fim) {
      const dias = daysBetween(today, fim)
      if (dias < 0) result.push({ ...base, tipo: 'atrasada', prazo: fim, dias, peso: dias })
    }
  }
```

O `JANELA_DIAS` continua, porque as multas a indicar usam.

- [ ] **Step 7: Rótulos curtos da tela**

Em `views/Pendencias.tsx`, troque no `CURTO` as linhas de `aprovar`, `programar` e `agendada` por:

```ts
  encaixar: 'A encaixar',
  preventiva: 'Preventiva do plano',
  atrasada: 'Manutenção atrasada',
```

(a linha `preventiva` já existe; mantenha uma só). No `EmptyState` da linha 74, troque o texto por `Encaixes, manutenções atrasadas, multas e colisões em aberto aparecem aqui.`

- [ ] **Step 8: Paridade no shell**

Em `apps/shell/src/pages/frota/domain/paridade.test.ts`, troque as linhas 18, 19 e 30:

```ts
// A Custom API só devolve as regras proativas; "A encaixar" e as de multa e colisão são só da tela.
const PROATIVOS: PendenciaTipo[] = ['prioridade', 'reincidencia', 'preventiva', 'atrasada', 'custo', 'hodometro']
```

```ts
    const proativas = pendencias.filter((p) => PROATIVOS.includes(p.tipo))
```

- [ ] **Step 9: `Modelo.cs`**

Troque, em `Limiares`, `AprovadoSemDataDias = 5` por `AgendadoParadoDias = 5`. Em `ManutencaoRegistro`, troque o bloco de `AgendarPara` até `Km` por:

```csharp
    /// <summary>Dias yyyy-MM-dd já no fuso de São Paulo. Data antiga de agendamento: vale só para registro sem janela (antes da conversão).</summary>
    [DataMember(Name = "agendarPara")] public string? AgendarPara { get; set; }
    /// <summary>Último dia da janela do encaixe (cr40f_janelafim).</summary>
    [DataMember(Name = "janelaFim")] public string? JanelaFim { get; set; }
    /// <summary>Dia do primeiro encaixe (cr40f_datadaaprovacao).</summary>
    [DataMember(Name = "dataAprovacao")] public string? DataAprovacao { get; set; }
    [DataMember(Name = "dataManutencao")] public string? DataManutencao { get; set; }
    [DataMember(Name = "criadoEm")] public string CriadoEm { get; set; } = "";
    [DataMember(Name = "km")] public decimal? Km { get; set; }
    /// <summary>Km informado por quem concluiu (cr40f_kmrealizado); na preventiva vale mais que o km do pedido.</summary>
    [DataMember(Name = "kmRealizado")] public decimal? KmRealizado { get; set; }
```

- [ ] **Step 10: `Regras.cs`**

Troque o comentário da classe (linhas 8 a 12) por:

```csharp
/// <summary>
/// Porte de apps/shell/src/pages/frota/domain/alertas.ts e da parte proativa de pendencias.ts/preventiva.ts.
/// Tipos: prioridade, reincidencia, preventiva, atrasada (janela vencida), custo, hodometro. "A encaixar" é a fila da
/// tela e não entra aqui. A paridade é conferida pelo fixture Fixtures/paridade.json, lido também por
/// apps/shell/src/pages/frota/domain/paridade.test.ts.
/// </summary>
```

Troque a linha 17 (`Ordem`) por:

```csharp
    public static readonly string[] Ordem = { "prioridade", "reincidencia", "preventiva", "atrasada", "custo", "hodometro" };
```

Troque o laço das manutenções em `Avaliar` (linhas 23 a 30) por:

```csharp
        foreach (var m in dados.Manutencoes)
        {
            var parada = PrioridadeParada(m, hoje);
            if (parada is int dias)
                lista.Add(new Pendencia { Tipo = "prioridade", Id = m.Id, VeiculoId = m.VeiculoId, Placa = m.VeiculoLabel, ManutencaoId = m.Id, Titulo = m.Descricao, Detalhe = $"{(m.Status == Codigos.Solicitado ? "Aguardando encaixe" : "Encaixada sem programação")} há {dias} dias" });
            else if (Atrasada(m, hoje))
                lista.Add(new Pendencia { Tipo = "atrasada", Id = m.Id, VeiculoId = m.VeiculoId, Placa = m.VeiculoLabel, ManutencaoId = m.Id, Titulo = m.Descricao, Detalhe = $"Janela até {Br(FimDaJanela(m)!)} e ainda não realizada" });
        }
```

Troque `PrioridadeParada` (linhas 40 a 47) por:

```csharp
    /// <summary>Alta/Urgente parada: Solicitada há mais de 2 dias (do pedido) ou Agendada há mais de 5 sem programação (do encaixe). Sem data do encaixe (registro antigo) não entra.</summary>
    public static int? PrioridadeParada(ManutencaoRegistro m, string hoje)
    {
        if ((m.Grau ?? 0) < Limiares.PrioridadeGrauMinimo) return null;
        if (m.Status == Codigos.Solicitado)
        {
            var dias = Dias(m.CriadoEm, hoje);
            return dias > Limiares.SolicitadoParadoDias ? dias : (int?)null;
        }
        if (m.Status == Codigos.Agendado && m.DataAprovacao != null)
        {
            var dias = Dias(m.DataAprovacao, hoje);
            return dias > Limiares.AgendadoParadoDias ? dias : (int?)null;
        }
        return null;
    }

    /// <summary>Fim da janela do encaixe; sem janela (registro anterior às manutenções v2), a data antiga de agendamento.</summary>
    public static string? FimDaJanela(ManutencaoRegistro m) => m.JanelaFim ?? m.AgendarPara;

    /// <summary>Atrasada não é estado: janela vencida (fim antes de hoje) com a manutenção Agendada ou Programada.</summary>
    public static bool Atrasada(ManutencaoRegistro m, string hoje)
        => (m.Status == Codigos.Agendado || m.Status == Codigos.Programado) && FimDaJanela(m) is string fim && Dias(hoje, fim) < 0;

    /// <summary>Km da manutenção: o de quem concluiu vale mais que o do pedido.</summary>
    public static decimal? KmDe(ManutencaoRegistro m) => m.KmRealizado ?? m.Km;
```

Em `Preventivas`, troque a linha do `kms` por:

```csharp
            var kms = doVeiculo.Select(KmDe).Where(k => k != null).Select(k => k!.Value).ToList();
```

Em `UltimaExecucao`, troque `return (melhor.Km ?? baselineValida?.Km, dia);` por:

```csharp
            return (KmDe(melhor) ?? baselineValida?.Km, dia);
```

- [ ] **Step 11: `FrotaRepository.cs`**

Troque a linha 131 (`Consulta("cr40f_manutencoes", ...)`) por:

```csharp
        var manut = Consulta("cr40f_manutencoes", "cr40f_descricao", "cr40f_status", "cr40f_graudamanutencao", "cr40f_agendarpara", "cr40f_janelafim", "cr40f_datadaaprovacao", "cr40f_datamanutencao", "createdon", "cr40f_kmatual", "cr40f_kmrealizado", "cr40f_valor", "cr40f_estabelecimento", "cr40f_placa_carro", "new_servicosmanutencao");
```

No `Mapper.Manutencao`, depois de `AgendarPara = Dia(e, "cr40f_agendarpara"),`:

```csharp
            JanelaFim = Dia(e, "cr40f_janelafim"),
            DataAprovacao = Dia(e, "cr40f_datadaaprovacao"),
```

e depois de `Km = Numero(e, "cr40f_kmatual"),`:

```csharp
            KmRealizado = Numero(e, "cr40f_kmrealizado"),
```

- [ ] **Step 12: Rodar tudo (Betinhos-Renan)**

Run (Betinhos-Renan): `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain src/pages/frota/views && pnpm --filter @betinhos/shell typecheck && dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`
Expected: PASS em todos; typecheck sem erros. Tela e Custom API chegam às mesmas 10 pendências proativas do fixture.

- [ ] **Step 13: Commit**

```bash
git add apps/shell/src/pages/frota packages/plugins/Cr40f.Frota.Plugin packages/plugins/Cr40f.Frota.Plugin.Tests
git commit -m "feat(frota): Pendências e Custom API com A encaixar, Atrasada e prioridade pelo encaixe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: Transições: a manutenção sai do `StatusPanel`; ações protegidas; sem o flow `aprovarManutencao`

**Files:**
- Modify: `apps/shell/src/pages/frota/domain/transitions.ts`
- Test (reescrito): `apps/shell/src/pages/frota/domain/transitions.test.ts`
- Test (reescrito): `apps/shell/src/pages/frota/components/StatusPanel.test.tsx`
- Test (reescrito): `apps/shell/src/pages/frota/components/RegistroDrawer.test.tsx`
- Modify: `apps/shell/src/pages/frota/data/source.ts`, `data/dataverse.ts`, `data/dataverse.test.ts`, `data/mock.ts`

**Interfaces:**
- Produces:
  - `type AcaoManutencao = 'encaixar' | 'reprovar' | 'cancelar' | 'concluir'`;
  - `acoesManutencao(status) -> AcaoManutencao[]` e `rotuloAcao(acao, status) -> string`;
  - `executarAcaoManutencao<T>(source: Pick<DataSource, 'currentStatus'>, record: { id: string; status: number | null }, acao, executar: () => Promise<T>) -> Promise<T>`, que relê o status, lança `StaleError` e permite uma ação por vez na mesma manutenção;
  - `transitionsFor('manutencao', s)` sempre `[]`;
  - `FlowId = 'notificarCondutor' | 'gerarContrato'`.

- [ ] **Step 1: Reescrever `transitions.test.ts` (falha)**

```ts
// apps/shell/src/pages/frota/domain/transitions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLISAO, MANUT, MULTA } from '../data/schema'
import type { DataSource, FlowResult } from '../data/source'
import { EMPTY_DATA, FlowIncertoError } from '../data/source'
import { acoesManutencao, applyTransition, bloqueio, buildPatch, executarAcaoManutencao, liberarFlows, rotuloAcao, StaleError, transitionsFor, validate, type RegistroStatus, type Transition } from './transitions'

const ctx = { now: new Date('2026-10-02T15:00:00Z'), dateBehaviors: { cr40f_prazo: 'DateOnly' } as const }
const ids = (kind: Parameters<typeof transitionsFor>[0], status: number | null) => transitionsFor(kind, status).map((item) => item.id)
const pick = (kind: Parameters<typeof transitionsFor>[0], status: number, id: string) => transitionsFor(kind, status).find((item) => item.id === id)!
const registro = (status: number | null, extra: Partial<RegistroStatus> = {}): RegistroStatus => ({ id: 'r1', status, temVeiculo: true, temMotorista: true, ...extra })

/** Só nos testes: nenhuma regra atual tem campos, mas `validate` e `buildPatch` continuam genéricos. */
const comCampos: Transition = {
  id: 'teste', to: MULTA.RECURSO, label: 'Teste', set: { new_recursopendente: true },
  fields: [
    { key: 'cr40f_prazo', label: 'Prazo', type: 'date', required: true },
    { key: 'cr40f_quando', label: 'Quando', type: 'datetime', required: false },
    { key: 'cr40f_valor', label: 'Valor', type: 'money', required: false },
    { key: 'cr40f_obs', label: 'Observação', type: 'text', required: false, maxLength: 5 },
  ],
}

function fakeSource(current: number | null) {
  return {
    mode: 'mock', envLabel: 'TEST',
    load: async () => ({ data: EMPTY_DATA, errors: {} }),
    currentStatus: vi.fn(async () => current),
    dateBehaviors: async () => ({}),
    update: vi.fn(async () => {}),
    prepareFlow: vi.fn(async () => {}),
    runFlow: vi.fn(async (): Promise<FlowResult> => ({ message: 'ok', shareUrl: null })),
    openForm: async () => {},
    fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, salvarItemPlano: async () => {}, inativarItemPlano: async () => {}, salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => ({ nome: 't.pdf', blob: new Blob() }), lembrarTermoMulta: async () => {}, listarParcelasTermo: async () => [],
  } satisfies DataSource
}

describe('transitionsFor', () => {
  it('manutenção não passa pelo StatusPanel: as ações dela são as Custom APIs', () => {
    for (const status of [MANUT.SOLICITADO, MANUT.AGENDADO, MANUT.PROGRAMADO, MANUT.REALIZADO]) expect(ids('manutencao', status)).toEqual([])
    expect(ids('manutencao', null)).toEqual([])
  })

  it('lista só as transições permitidas de multa', () => {
    expect(ids('multa', MULTA.NOTIFICAR)).toEqual(['notificado'])
    expect(ids('multa', MULTA.NOTIFICADO)).toEqual(['indicar', 'recurso', 'descontado', 'pago'])
    expect(ids('multa', MULTA.INDICADA)).toEqual(['recurso', 'descontado', 'pago'])
    expect(ids('multa', MULTA.PAGO)).toEqual(['finalizar'])
    expect(ids('multa', MULTA.RECURSO)).toEqual([])
  })

  it('lista só as transições permitidas de colisão', () => {
    expect(ids('colisao', COLISAO.ENVIADO)).toEqual(['analisar', 'cancelar'])
    expect(ids('colisao', COLISAO.ANALISE)).toEqual(['resolver', 'cancelar'])
    expect(ids('colisao', COLISAO.RESOLVIDO)).toEqual([])
  })

  it('marca quais transições chamam Flow', () => {
    expect(pick('multa', MULTA.NOTIFICAR, 'notificado').flow).toBe('notificarCondutor')
    expect(pick('multa', MULTA.NOTIFICADO, 'indicar').flow).toBe('gerarContrato')
    expect(pick('multa', MULTA.INDICADA, 'recurso').flow).toBeUndefined()
    expect(pick('colisao', COLISAO.ENVIADO, 'analisar').flow).toBeUndefined()
  })
})

describe('bloqueio', () => {
  it('exige motorista para notificar e gerar contrato', () => {
    expect(bloqueio(pick('multa', MULTA.NOTIFICAR, 'notificado'), registro(MULTA.NOTIFICAR, { temMotorista: false }))).toBe('Informe o motorista no formulário antes desta ação')
    expect(bloqueio(pick('multa', MULTA.NOTIFICADO, 'indicar'), registro(MULTA.NOTIFICADO, { temMotorista: false }))).toBe('Informe o motorista no formulário antes desta ação')
  })

  it('não bloqueia quando o requisito existe nem transições sem requisito', () => {
    expect(bloqueio(pick('multa', MULTA.NOTIFICAR, 'notificado'), registro(MULTA.NOTIFICAR))).toBeNull()
    expect(bloqueio(pick('colisao', COLISAO.ENVIADO, 'analisar'), registro(COLISAO.ENVIADO, { temVeiculo: false, temMotorista: false }))).toBeNull()
  })
})

describe('validate', () => {
  it('exige os campos obrigatórios', () => {
    expect(validate(comCampos, {})).toEqual({ cr40f_prazo: 'Obrigatório' })
    expect(validate(comCampos, { cr40f_prazo: '2026-10-09' })).toEqual({})
  })

  it('recusa valor negativo, data e hora inválida e texto acima do tamanho', () => {
    expect(validate(comCampos, { cr40f_prazo: '2026-10-09', cr40f_valor: '-1', cr40f_quando: 'amanhã', cr40f_obs: 'abcdef' })).toEqual({ cr40f_valor: 'Informe um valor válido', cr40f_quando: 'Data inválida', cr40f_obs: 'Máximo de 5 caracteres' })
  })

  it('não exige campo nas transições de multa feitas por Flow', () => {
    expect(validate(pick('multa', MULTA.NOTIFICAR, 'notificado'), {})).toEqual({})
    expect(validate(pick('multa', MULTA.NOTIFICADO, 'indicar'), {})).toEqual({})
  })
})

describe('buildPatch', () => {
  it('grava status e campos fixos, e converte data, data e hora (São Paulo para UTC) e valor', () => {
    expect(buildPatch('multa', comCampos, { cr40f_prazo: '2026-10-09', cr40f_quando: '2026-10-02T10:00', cr40f_valor: '350.5', cr40f_obs: ' ok ' }, ctx)).toEqual({
      cr40f_status: MULTA.RECURSO, new_recursopendente: true, cr40f_prazo: '2026-10-09', cr40f_quando: '2026-10-02T13:00:00.000Z', cr40f_valor: 350.5, cr40f_obs: 'ok',
    })
  })

  it('data em coluna UserLocal vira meia-noite de São Paulo em UTC', () => {
    expect(buildPatch('multa', comCampos, { cr40f_prazo: '2026-10-09' }, { now: ctx.now, dateBehaviors: { cr40f_prazo: 'UserLocal' } })).toMatchObject({ cr40f_prazo: '2026-10-09T03:00:00Z' })
  })

  it('recurso grava o campo fixo; transições de multa por Flow não gravam nada pela tela', () => {
    expect(buildPatch('multa', pick('multa', MULTA.INDICADA, 'recurso'), {}, ctx)).toEqual({ cr40f_status: MULTA.RECURSO, new_recursopendente: true })
    expect(buildPatch('multa', pick('multa', MULTA.NOTIFICAR, 'notificado'), {}, ctx)).toEqual({})
    expect(buildPatch('multa', pick('multa', MULTA.NOTIFICADO, 'indicar'), {}, ctx)).toEqual({})
  })

  it('colisão grava no campo de status operacional', () => {
    expect(buildPatch('colisao', pick('colisao', COLISAO.ENVIADO, 'analisar'), {}, ctx)).toEqual({ cr40f_statusoperacional: COLISAO.ANALISE })
  })

  it('recusa gravar data sem o comportamento da coluna', () => {
    expect(() => buildPatch('multa', comCampos, { cr40f_prazo: '2026-10-09' }, { now: ctx.now, dateBehaviors: {} })).toThrow('Metadata de data indisponível para cr40f_prazo')
  })
})

describe('applyTransition', () => {
  beforeEach(() => liberarFlows())

  it('transição direta relê o status, grava e não chama Flow', async () => {
    const source = fakeSource(COLISAO.ENVIADO)
    const result = await applyTransition(source, 'colisao', registro(COLISAO.ENVIADO), pick('colisao', COLISAO.ENVIADO, 'analisar'), {})
    expect(result).toBeNull()
    expect(source.update).toHaveBeenCalledWith('colisao', 'r1', { cr40f_statusoperacional: COLISAO.ANALISE })
    expect(source.prepareFlow).not.toHaveBeenCalled()
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('transição com Flow resolve a URL antes e chama o Flow uma vez, sem gravar pela tela', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    const result = await applyTransition(source, 'multa', registro(MULTA.NOTIFICAR), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})
    expect(source.prepareFlow).toHaveBeenCalledWith('notificarCondutor')
    expect(source.runFlow).toHaveBeenCalledWith('notificarCondutor', 'r1')
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    expect(source.prepareFlow.mock.invocationCallOrder[0]).toBeLessThan(source.runFlow.mock.invocationCallOrder[0])
    expect(source.update).not.toHaveBeenCalled()
    expect(result).toEqual({ message: 'ok', shareUrl: null })
  })

  it('não chama o Flow quando a URL do Flow não está disponível', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.prepareFlow.mockRejectedValueOnce(new Error('URL do Flow "Notificar condutor" não configurada (variável new_FlowUrlNotificarMotoristaMultas)'))
    await expect(applyTransition(source, 'multa', registro(MULTA.NOTIFICAR), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})).rejects.toThrow('não configurada')
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('registro desatualizado: não grava, não resolve nem chama o Flow', async () => {
    const colisao = fakeSource(COLISAO.RESOLVIDO)
    await expect(applyTransition(colisao, 'colisao', registro(COLISAO.ENVIADO), pick('colisao', COLISAO.ENVIADO, 'cancelar'), {})).rejects.toBeInstanceOf(StaleError)
    expect(colisao.update).not.toHaveBeenCalled()
    const multa = fakeSource(MULTA.NOTIFICADO)
    await expect(applyTransition(multa, 'multa', registro(MULTA.NOTIFICAR), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})).rejects.toBeInstanceOf(StaleError)
    expect(multa.prepareFlow).not.toHaveBeenCalled()
    expect(multa.runFlow).not.toHaveBeenCalled()
  })

  it('não consulta nem chama nada quando falta o requisito', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    await expect(applyTransition(source, 'multa', registro(MULTA.NOTIFICAR, { temMotorista: false }), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})).rejects.toThrow('Informe o motorista no formulário antes desta ação')
    expect(source.currentStatus).not.toHaveBeenCalled()
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('rejeita transição que não está disponível no status atual, inclusive qualquer uma em manutenção', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    await expect(applyTransition(source, 'multa', registro(MULTA.NOTIFICAR), pick('multa', MULTA.NOTIFICADO, 'indicar'), {})).rejects.toThrow('Esta ação não está disponível para o status atual do registro')
    await expect(applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO), pick('colisao', COLISAO.ENVIADO, 'cancelar'), {})).rejects.toThrow('Esta ação não está disponível para o status atual do registro')
    expect(source.currentStatus).not.toHaveBeenCalled()
    expect(source.update).not.toHaveBeenCalled()
  })

  it('rejeita se a chamada do Flow falhar', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.runFlow.mockRejectedValueOnce(new Error('O Flow não respondeu'))
    await expect(applyTransition(source, 'multa', registro(MULTA.NOTIFICAR), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})).rejects.toThrow('O Flow não respondeu')
    expect(source.runFlow).toHaveBeenCalledTimes(1)
  })
})

describe('Flow já em andamento', () => {
  const MENSAGEM = 'Já há uma ação em andamento para este registro. Aguarde e recarregue a tela'
  const notificar = (source: DataSource, id = 'r1') => applyTransition(source, 'multa', registro(MULTA.NOTIFICAR, { id }), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})

  beforeEach(() => liberarFlows())

  it('duas chamadas sobrepostas para o mesmo registro disparam o Flow uma única vez', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    let terminar: (value: FlowResult) => void = () => {}
    source.runFlow.mockImplementationOnce(() => new Promise<FlowResult>((resolve) => { terminar = resolve }))
    const primeira = notificar(source)
    await vi.waitFor(() => expect(source.runFlow).toHaveBeenCalledTimes(1))
    await expect(notificar(source)).rejects.toThrow(MENSAGEM)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    terminar({ message: 'ok', shareUrl: null })
    await expect(primeira).resolves.toEqual({ message: 'ok', shareUrl: null })
  })

  it('depois do sucesso o registro pode ser tentado de novo', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    await notificar(source)
    await notificar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('resultado incerto mantém o bloqueio até liberarFlows()', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.runFlow.mockRejectedValueOnce(new FlowIncertoError('O Flow "Notificar condutor" não respondeu em 30 s. Confira o registro antes de tentar de novo'))
    await expect(notificar(source)).rejects.toBeInstanceOf(FlowIncertoError)
    await expect(notificar(source)).rejects.toThrow(MENSAGEM)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    liberarFlows()
    await notificar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('erro definitivo libera o registro na hora', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.runFlow.mockRejectedValueOnce(new Error('O Flow "Notificar condutor" respondeu 500. Confira o registro antes de tentar de novo'))
    await expect(notificar(source)).rejects.toThrow('respondeu 500')
    await notificar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('outro registro não é bloqueado', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.runFlow.mockRejectedValueOnce(new FlowIncertoError('timeout'))
    await expect(notificar(source, 'r1')).rejects.toBeInstanceOf(FlowIncertoError)
    await notificar(source, 'r2')
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('duas chamadas no mesmo instante, com currentStatus lento, disparam o Flow uma única vez', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.currentStatus.mockImplementation(() => new Promise<number | null>((resolve) => { setTimeout(() => resolve(MULTA.NOTIFICAR), 10) }))
    const resultados = await Promise.allSettled([notificar(source), notificar(source)])
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    expect(resultados.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
    const recusada = resultados.find((item) => item.status === 'rejected') as PromiseRejectedResult
    expect((recusada.reason as Error).message).toBe(MENSAGEM)
  })

  it('liberarFlows() não libera uma chamada que ainda está em execução', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    let terminar: (value: FlowResult) => void = () => {}
    source.runFlow.mockImplementationOnce(() => new Promise<FlowResult>((resolve) => { terminar = resolve }))
    const primeira = notificar(source)
    await vi.waitFor(() => expect(source.runFlow).toHaveBeenCalledTimes(1))
    liberarFlows()
    await expect(notificar(source)).rejects.toThrow(MENSAGEM)
    terminar({ message: null, shareUrl: null })
    await primeira
    await notificar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('registro desatualizado não deixa o registro bloqueado', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.currentStatus.mockResolvedValueOnce(MULTA.NOTIFICADO)
    await expect(notificar(source)).rejects.toBeInstanceOf(StaleError)
    await notificar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
  })

  it('falha antes do Flow (prepareFlow) não deixa o registro bloqueado', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.prepareFlow.mockRejectedValueOnce(new Error('sem permissão'))
    await expect(notificar(source)).rejects.toThrow('sem permissão')
    await notificar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
  })
})

describe('ações da manutenção (Custom APIs)', () => {
  const alvo = (status: number | null) => ({ id: 'm1', status })
  const fonte = (atual: number | null) => ({ currentStatus: vi.fn(async (_kind: string, _id: string) => atual) })

  it('oferece as ações do ciclo novo por status', () => {
    expect(acoesManutencao(MANUT.SOLICITADO)).toEqual(['encaixar', 'reprovar', 'cancelar', 'concluir'])
    expect(acoesManutencao(MANUT.AGENDADO)).toEqual(['encaixar', 'cancelar', 'concluir'])
    expect(acoesManutencao(MANUT.PROGRAMADO)).toEqual(['encaixar', 'cancelar', 'concluir'])
    for (const status of [MANUT.REALIZADO, MANUT.REPROVADO, MANUT.CANCELADO, null]) expect(acoesManutencao(status)).toEqual([])
  })

  it('encaixar vira Reagendar depois do encaixe', () => {
    expect(rotuloAcao('encaixar', MANUT.SOLICITADO)).toBe('Encaixar')
    expect(rotuloAcao('encaixar', MANUT.PROGRAMADO)).toBe('Reagendar')
    expect(rotuloAcao('cancelar', MANUT.AGENDADO)).toBe('Cancelar manutenção')
    expect(rotuloAcao('concluir', MANUT.AGENDADO)).toBe('Concluir')
  })

  it('relê o status e só então executa', async () => {
    const source = fonte(MANUT.SOLICITADO)
    const executar = vi.fn(async () => 'feito')
    await expect(executarAcaoManutencao(source, alvo(MANUT.SOLICITADO), 'encaixar', executar)).resolves.toBe('feito')
    expect(source.currentStatus).toHaveBeenCalledWith('manutencao', 'm1')
    expect(source.currentStatus.mock.invocationCallOrder[0]).toBeLessThan(executar.mock.invocationCallOrder[0])
  })

  it('outra pessoa mudou o status: StaleError e nada é executado', async () => {
    const source = fonte(MANUT.CANCELADO)
    const executar = vi.fn(async () => undefined)
    await expect(executarAcaoManutencao(source, alvo(MANUT.SOLICITADO), 'reprovar', executar)).rejects.toBeInstanceOf(StaleError)
    expect(executar).not.toHaveBeenCalled()
  })

  it('ação fora do status é recusada antes de ler o servidor', async () => {
    const source = fonte(MANUT.AGENDADO)
    await expect(executarAcaoManutencao(source, alvo(MANUT.AGENDADO), 'reprovar', async () => undefined)).rejects.toThrow('Esta ação não está disponível para o status atual da manutenção')
    expect(source.currentStatus).not.toHaveBeenCalled()
  })

  it('uma ação por vez na mesma manutenção; falha libera a vez', async () => {
    const source = fonte(MANUT.SOLICITADO)
    let terminar: () => void = () => {}
    const longa = vi.fn(() => new Promise<void>((resolve) => { terminar = resolve }))
    const primeira = executarAcaoManutencao(source, alvo(MANUT.SOLICITADO), 'encaixar', longa)
    await expect(executarAcaoManutencao(source, alvo(MANUT.SOLICITADO), 'cancelar', async () => undefined)).rejects.toThrow('Já há uma ação em andamento para esta manutenção. Aguarde')
    await vi.waitFor(() => expect(longa).toHaveBeenCalledTimes(1))
    terminar()
    await primeira
    await expect(executarAcaoManutencao(source, alvo(MANUT.SOLICITADO), 'encaixar', async () => { throw new Error('falhou') })).rejects.toThrow('falhou')
    await expect(executarAcaoManutencao(source, alvo(MANUT.SOLICITADO), 'encaixar', async () => 'de novo')).resolves.toBe('de novo')
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/transitions.test.ts`
Expected: FAIL (`acoesManutencao`, `rotuloAcao`, `executarAcaoManutencao` não existem; manutenção ainda tem transições).

- [ ] **Step 2: `transitions.ts`**

Apague as linhas 25 a 37: as constantes `agendarPara`, `comentario`, `concluir` e `cancelarManutencao`. Fica de `const cancelarColisao` em diante.

Troque o bloco `manutencao: { ... },` de `RULES` (linhas 47 a 56) por:

```ts
  // Manutenção não passa pelo StatusPanel: as ações dela são Custom APIs (acoesManutencao / executarAcaoManutencao, abaixo).
  manutencao: {},
```

Acrescente no fim do arquivo:

```ts
// ---------- Manutenção (Custom APIs cr40f_Manutencao*, plano 1 das manutenções v2) ----------

export type AcaoManutencao = 'encaixar' | 'reprovar' | 'cancelar' | 'concluir'

/** Ciclo novo (spec 2026-11-16-manutencoes-v2): encaixar é aprovar; reprovar só antes do encaixe; concluir também lança depois do fato. */
const ACOES_MANUTENCAO: Partial<Record<number, AcaoManutencao[]>> = {
  [MANUT.SOLICITADO]: ['encaixar', 'reprovar', 'cancelar', 'concluir'],
  [MANUT.AGENDADO]: ['encaixar', 'cancelar', 'concluir'],
  [MANUT.PROGRAMADO]: ['encaixar', 'cancelar', 'concluir'],
}

export function acoesManutencao(status: number | null): AcaoManutencao[] {
  return status === null ? [] : ACOES_MANUTENCAO[status] ?? []
}

const ROTULO_ACAO: Record<Exclude<AcaoManutencao, 'encaixar'>, string> = { reprovar: 'Reprovar', cancelar: 'Cancelar manutenção', concluir: 'Concluir' }

export function rotuloAcao(acao: AcaoManutencao, status: number | null): string {
  if (acao === 'encaixar') return status === MANUT.SOLICITADO ? 'Encaixar' : 'Reagendar'
  return ROTULO_ACAO[acao]
}

/** Manutenções com uma ação em execução agora (uma por vez, como nos Flows). */
const acoesEmCurso = new Set<string>()

/**
 * Relê o status no servidor e só executa se ele ainda for o que a tela mostrava (senão, StaleError). A reserva da vez é
 * síncrona, antes de qualquer await: dois cliques seguidos não disparam duas chamadas.
 */
export async function executarAcaoManutencao<T>(source: Pick<DataSource, 'currentStatus'>, record: { id: string; status: number | null }, acao: AcaoManutencao, executar: () => Promise<T>): Promise<T> {
  if (!acoesManutencao(record.status).includes(acao)) throw new Error('Esta ação não está disponível para o status atual da manutenção')
  const chave = `manutencao:${record.id}`
  if (acoesEmCurso.has(chave)) throw new Error('Já há uma ação em andamento para esta manutenção. Aguarde')
  acoesEmCurso.add(chave)
  try {
    const atual = await source.currentStatus('manutencao', record.id)
    if (atual !== record.status) throw new StaleError()
    return await executar()
  } finally {
    acoesEmCurso.delete(chave)
  }
}
```

- [ ] **Step 3: Sem o flow `aprovarManutencao`**

Em `data/source.ts`:

```ts
export type FlowId = 'notificarCondutor' | 'gerarContrato'
```

Em `data/dataverse.ts`, apague a linha `aprovarManutencao: { envVar: 'new_FlowUrlManutencao', ... },` de `FLOWS`.

Em `data/mock.ts`, troque `runFlow` por:

```ts
    async runFlow(flow: FlowId, id: string) {
      await delay()
      const record = find('multa', id) as Record<string, unknown> | undefined
      if (!record) throw new Error('Registro não encontrado no mock.')
      if (flow === 'notificarCondutor') { record.status = MULTA.NOTIFICADO; record.dataAviso = todaySP() }
      else record.status = MULTA.INDICADA
      return { message: 'Mock: Flow simulado.', shareUrl: flow === 'gerarContrato' ? 'https://example.invalid/contrato-ficticio.pdf' : null }
    },
```

Em `data/dataverse.test.ts`:

1. No `it.each` de `'chama o Flow %s com POST e o corpo certo'`, apague a linha `['aprovarManutencao', { guids: GUID }],`.
2. Troque o teste `'lê a variável de ambiente pelo schemaname de cada Flow'` por:

```ts
  it('lê a variável de ambiente pelo schemaname de cada Flow', async () => {
    stubFetch(200)
    const { xrm, retrieveMultipleRecords } = flowHost()
    const source = createXrmSource(xrm)
    await source.runFlow('notificarCondutor', GUID)
    await source.runFlow('gerarContrato', GUID)
    const options = retrieveMultipleRecords.mock.calls.map((call) => call[1])
    expect(options[0]).toContain("schemaname eq 'new_FlowUrlNotificarMotoristaMultas'")
    expect(options[1]).toContain("schemaname eq 'new_FlowUrlGerarContratoMultas'")
  })
```

3. Nos demais testes, o Flow de exemplo passa a ser o "Gerar contrato" (40 s):

```bash
sed -i "s/'aprovarManutencao'/'gerarContrato'/g; s/Agendar manutenção/Gerar contrato/g; s/59_999/39_999/; s/em 60 s/em 40 s/" apps/shell/src/pages/frota/data/dataverse.test.ts
grep -n "aprovarManutencao\|FlowUrlManutencao\|Agendar manutenção" apps/shell/src/pages/frota/data/dataverse.test.ts || echo "sem restos"
```

Expected: `sem restos`.

- [ ] **Step 4: Reescrever `StatusPanel.test.tsx` (só multa e colisão)**

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COLISAO, MULTA } from '../data/schema'
import { EMPTY_DATA, type DataSource, type FlowResult } from '../data/source'
import type { Kind } from '../data/types'
import { liberarFlows, type RegistroStatus } from '../domain/transitions'
import { StatusPanel } from './StatusPanel'
import { ToastProvider } from '@betinhos/ui'

function fakeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    mode: 'mock', envLabel: 'TEST',
    load: async () => ({ data: EMPTY_DATA, errors: {} }),
    currentStatus: async () => COLISAO.ENVIADO,
    dateBehaviors: async () => ({}),
    update: vi.fn(async () => {}),
    openForm: async () => {},
    prepareFlow: vi.fn(async () => {}),
    fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, runFlow: vi.fn(async (): Promise<FlowResult> => ({ message: null, shareUrl: null })), salvarItemPlano: async () => {}, inativarItemPlano: async () => {}, salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => ({ nome: 't.pdf', blob: new Blob() }), lembrarTermoMulta: async () => {}, listarParcelasTermo: async () => [],
    ...overrides,
  }
}

type PanelOptions = { kind?: Kind; record?: Partial<RegistroStatus> }

function renderPanel(source: DataSource, status: number | null, options: PanelOptions = {}) {
  const onDone = vi.fn()
  const onReload = vi.fn()
  const record: RegistroStatus = { id: 'c1', status, temVeiculo: true, temMotorista: true, ...options.record }
  render(<ToastProvider><StatusPanel source={source} kind={options.kind ?? 'colisao'} record={record} onDone={onDone} onReload={onReload} /></ToastProvider>)
  return { onDone, onReload }
}

async function confirmar() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar' })) })
}

afterEach(() => {
  cleanup()
  liberarFlows()
})

describe('StatusPanel', () => {
  it('mostra só as ações permitidas para o status', () => {
    renderPanel(fakeSource(), COLISAO.ENVIADO)
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Colocar em análise', 'Cancelar colisão'])
  })

  it('informa quando não há ação, inclusive na manutenção (que usa a gaveta própria)', () => {
    renderPanel(fakeSource(), COLISAO.RESOLVIDO)
    expect(screen.getByText('Sem ações de status para este registro.')).toBeTruthy()
    cleanup()
    renderPanel(fakeSource(), 0, { kind: 'manutencao' })
    expect(screen.getByText('Sem ações de status para este registro.')).toBeTruthy()
  })

  it('grava a transição direta com o status e avisa a tela com null', async () => {
    const source = fakeSource()
    const { onDone, onReload } = renderPanel(source, COLISAO.ENVIADO)
    fireEvent.click(screen.getByRole('button', { name: 'Colocar em análise' }))
    await confirmar()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone).toHaveBeenCalledWith(null)
    expect(onReload).not.toHaveBeenCalled()
    expect(source.update).toHaveBeenCalledWith('colisao', 'c1', { cr40f_statusoperacional: COLISAO.ANALISE })
    expect(source.runFlow).not.toHaveBeenCalled()
    expect(await screen.findByText('Colocar em análise: concluído.')).toBeTruthy()
  })

  it('em falha mostra a mensagem real e continua no formulário', async () => {
    const source = fakeSource({ update: vi.fn(async () => { throw new Error('Principal user is missing prvWritecr40f_colisao_v2 privilege.') }) })
    const { onDone, onReload } = renderPanel(source, COLISAO.ENVIADO)
    fireEvent.click(screen.getByRole('button', { name: 'Colocar em análise' }))
    await confirmar()
    await waitFor(() => expect(screen.getByText(/missing prvWritecr40f_colisao_v2 privilege/)).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
    expect(onReload).not.toHaveBeenCalled()
  })

  it('quando outra pessoa mudou o status, não grava e pede recarga', async () => {
    const source = fakeSource({ currentStatus: async () => COLISAO.RESOLVIDO })
    const { onDone, onReload } = renderPanel(source, COLISAO.ENVIADO)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar colisão' }))
    await confirmar()
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))
    expect(source.update).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByText(/alterado por outra pessoa/)).toBeTruthy()
  })

  it('transição com campo fixo grava o campo junto com o status (Entrar com recurso)', async () => {
    const source = fakeSource({ currentStatus: async () => MULTA.INDICADA })
    renderPanel(source, MULTA.INDICADA, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com recurso' }))
    await confirmar()
    await waitFor(() => expect(source.update).toHaveBeenCalledWith('multa', 'c1', { cr40f_status: MULTA.RECURSO, new_recursopendente: true }))
  })

  it('desabilita as ações de multa que exigem motorista', () => {
    renderPanel(fakeSource(), MULTA.NOTIFICAR, { kind: 'multa', record: { temMotorista: false } })
    const notificar = screen.getByRole('button', { name: 'Notificar condutor' }) as HTMLButtonElement
    expect(notificar.disabled).toBe(true)
    expect(notificar.title).toBe('Informe o motorista no formulário antes desta ação')
    expect(screen.getByText('Informe o motorista no formulário antes desta ação').className).toContain('muted')
  })

  it('transição com Flow chama o Flow, sem gravar pela tela, e devolve o resultado', async () => {
    const resultado: FlowResult = { message: 'Contrato gerado.', shareUrl: 'https://contrato.example/abc' }
    const source = fakeSource({ currentStatus: async () => MULTA.NOTIFICADO, runFlow: vi.fn(async () => resultado) })
    const { onDone, onReload } = renderPanel(source, MULTA.NOTIFICADO, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar contrato de indicação' }))
    expect(screen.getByText('Esta ação dispara o Flow "Gerar contrato de indicação" e pode levar até um minuto.')).toBeTruthy()
    await confirmar()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone).toHaveBeenCalledWith(resultado)
    expect(onReload).not.toHaveBeenCalled()
    expect(source.runFlow).toHaveBeenCalledWith('gerarContrato', 'c1')
    expect(source.update).not.toHaveBeenCalled()
    expect(await screen.findByText('Contrato gerado.')).toBeTruthy()
  })

  it('usa a mensagem padrão quando o Flow não devolve texto', async () => {
    const source = fakeSource({ currentStatus: async () => MULTA.NOTIFICAR })
    const { onDone } = renderPanel(source, MULTA.NOTIFICAR, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Notificar condutor' }))
    await confirmar()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(source.runFlow).toHaveBeenCalledWith('notificarCondutor', 'c1')
    expect(source.update).not.toHaveBeenCalled()
    expect(await screen.findByText('Notificar condutor: concluído.')).toBeTruthy()
  })

  it('durante o Flow mostra a espera e desabilita os controles', async () => {
    let finish: (value: FlowResult) => void = () => {}
    const source = fakeSource({ currentStatus: async () => MULTA.NOTIFICAR, runFlow: vi.fn(() => new Promise<FlowResult>((resolve) => { finish = resolve })) })
    const { onDone } = renderPanel(source, MULTA.NOTIFICAR, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Notificar condutor' }))
    await confirmar()
    const espera = await screen.findByRole('button', { name: /Aguardando o Flow…/ })
    expect((espera as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Voltar' }) as HTMLButtonElement).disabled).toBe(true)
    expect(onDone).not.toHaveBeenCalled()
    await act(async () => { finish({ message: null, shareUrl: null }) })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('falha do Flow mostra o erro, volta para a lista de ações e pede recarga', async () => {
    const source = fakeSource({ currentStatus: async () => MULTA.NOTIFICAR, runFlow: vi.fn(async () => { throw new Error('O Flow não respondeu a tempo') }) })
    const { onDone, onReload } = renderPanel(source, MULTA.NOTIFICAR, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Notificar condutor' }))
    await confirmar()
    await waitFor(() => expect(screen.getByText(/O Flow não respondeu a tempo/)).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Notificar condutor' })).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('dois envios seguidos antes de re-renderizar chamam o Flow uma única vez', async () => {
    const source = fakeSource({ currentStatus: async () => MULTA.NOTIFICAR, runFlow: vi.fn(() => new Promise<FlowResult>((resolve) => { setTimeout(() => resolve({ message: null, shareUrl: null }), 20) })) })
    const { onDone } = renderPanel(source, MULTA.NOTIFICAR, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Notificar condutor' }))
    const form = screen.getByRole('button', { name: 'Confirmar' }).closest('form')!
    await act(async () => {
      fireEvent.submit(form)
      fireEvent.submit(form)
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 5: Reescrever `RegistroDrawer.test.tsx` (a manutenção fica só nos testes de classificação até a Tarefa 19)**

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COLISAO, MANUT, MULTA } from '../data/schema'
import { EMPTY_DATA, type DataSource } from '../data/source'
import type { Colisao, FrotaData, Kind, Manutencao, Multa } from '../data/types'
import { RegistroDrawer } from './RegistroDrawer'
import { ToastProvider } from '@betinhos/ui'

function fakeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    mode: 'mock', envLabel: 'TEST',
    load: async () => ({ data: EMPTY_DATA, errors: {} }),
    currentStatus: async () => COLISAO.ENVIADO,
    dateBehaviors: async () => ({}),
    update: vi.fn(async () => {}),
    openForm: vi.fn(async () => {}),
    prepareFlow: vi.fn(async () => {}),
    fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, runFlow: vi.fn(async () => ({ message: null, shareUrl: null })), salvarItemPlano: async () => {}, inativarItemPlano: async () => {}, salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => ({ nome: 't.pdf', blob: new Blob() }), lembrarTermoMulta: async () => {}, listarParcelasTermo: async () => [],
    ...overrides,
  }
}

const manutencao: Manutencao = { id: 'm1', codigo: 'M-1', descricao: 'Freio com ruído', status: MANUT.SOLICITADO, grau: null, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: { id: 'v1', label: 'ABC-1234' }, solicitante: null, criadoEm: '2026-10-01T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null }
const multa: Multa = { id: 'u1', codigo: 'NT-1073', titulo: 'Multa sem condutor', status: MULTA.NOTIFICAR, dataHora: null, local: null, dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'ABC-1234' }, motorista: null, infracaoId: null, criadoEm: '2026-10-01T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null }
const colisao: Colisao = { id: 'c1', titulo: 'Batida leve', status: COLISAO.ENVIADO, tipo: null, dataHora: null, local: null, descricao: null, houveTerceiro: false, veiculo: { id: 'v1', label: 'ABC-1234' }, motorista: null, criadoEm: '2026-10-01T12:00:00Z' }
const data: FrotaData = { ...EMPTY_DATA, manutencoes: [manutencao], multas: [multa], colisoes: [colisao] }

function renderDrawer(source: DataSource, kind: Kind, id: string) {
  const onClose = vi.fn()
  const onChanged = vi.fn()
  render(<ToastProvider><RegistroDrawer source={source} kind={kind} id={id} data={data} onClose={onClose} onChanged={onChanged} onOpenVeiculo={() => {}} /></ToastProvider>)
  return { onClose, onChanged }
}

afterEach(cleanup)

describe('RegistroDrawer', () => {
  it('fecha com Esc (cancel do dialog nativo) mesmo depois que o botão focado saiu da tela', () => {
    const { onClose } = renderDrawer(fakeSource(), 'colisao', 'c1')
    fireEvent.click(screen.getByRole('button', { name: 'Colocar em análise' }))
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeTruthy()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('mostra o erro e não recarrega quando o formulário não abre', async () => {
    const source = fakeSource({ openForm: vi.fn(async () => { throw new Error('Formulário indisponível') }) })
    const { onChanged } = renderDrawer(source, 'colisao', 'c1')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Abrir formulário/ })) })
    await waitFor(() => expect(screen.getByText(/Formulário indisponível/)).toBeTruthy())
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('recarrega depois que o formulário fecha', async () => {
    const { onChanged } = renderDrawer(fakeSource(), 'colisao', 'c1')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Abrir formulário/ })) })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('multa sem motorista: Notificar condutor desabilitado com o motivo visível', () => {
    renderDrawer(fakeSource(), 'multa', 'u1')
    expect((screen.getByRole('button', { name: 'Notificar condutor' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Informe o motorista no formulário antes desta ação')).toBeTruthy()
  })

  it('mostra a classificação da IA e grava a correção manual dos serviços', async () => {
    const update = vi.fn(async () => {})
    const classificada = { ...manutencao, servicos: [100000007], categorias: [100000001], origemClassificacao: 100000000, confiancaIa: 0.93 }
    const onChanged = vi.fn()
    render(<ToastProvider><RegistroDrawer source={fakeSource({ update })} kind="manutencao" id="m1" data={{ ...data, manutencoes: [classificada] }} onClose={() => {}} onChanged={onChanged} onOpenVeiculo={() => {}} /></ToastProvider>)
    expect(screen.getByText('Classificado por IA · 93%')).toBeTruthy()
    expect(screen.getByText('Pastilhas de freio')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Discos de freio' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' })) })
    expect(update).toHaveBeenCalledWith('manutencao', 'm1', { new_servicosmanutencao: '100000007,100000008', new_categoriasmanutencao: '100000001', new_classificacaoorigem: 100000001, new_confiancaia: null })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('manutenção sem classificação: não oferece IA e classifica à mão', async () => {
    const update = vi.fn(async () => {})
    const onClassificado = vi.fn()
    render(<ToastProvider><RegistroDrawer source={fakeSource({ update })} kind="manutencao" id="m1" data={data} onClose={() => {}} onChanged={() => {}} onClassificado={onClassificado} onOpenVeiculo={() => {}} /></ToastProvider>)
    expect(screen.getByText('Sem classificação')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /IA/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Classificar' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pastilhas de freio' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' })) })
    expect(update).toHaveBeenCalledWith('manutencao', 'm1', { new_servicosmanutencao: '100000007', new_categoriasmanutencao: '100000001', new_classificacaoorigem: 100000001, new_confiancaia: null })
    expect(onClassificado).toHaveBeenCalledWith('m1', { servicos: [100000007], categorias: [100000001], origem: 100000001, confianca: null })
  })
})
```

- [ ] **Step 6: Rodar (Betinhos-Renan)**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota && pnpm --filter @betinhos/shell typecheck`
Expected: PASS e typecheck sem erros. Antes do commit, confirme que não sobrou o flow nem a transição antiga: `grep -rn "aprovarManutencao\|new_FlowUrlManutencao" apps/shell/src` e `grep -rn "'programar'\|Aprovar e agendar" apps/shell/src/pages/frota` não devem achar nada.

- [ ] **Step 7: Commit**

```bash
git add apps/shell/src/pages/frota
git commit -m "feat(frota): manutenção sai do StatusPanel; ações protegidas e sem o flow Agendar manutenção

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: Custom APIs da manutenção no Dataverse (`criarComandosXrm`)

**Files:**
- Create: `apps/shell/src/pages/frota/data/customApi.ts`
- Modify: `apps/shell/src/pages/frota/data/dataverse.ts` (o `customApi` interno passa a usar `chamarCustomApi`)
- Modify: `apps/shell/src/pages/frota/data/source.ts` (tipos e `ComandosManutencao`)
- Create: `apps/shell/src/pages/frota/data/manutencaoDataverse.ts`
- Test: `apps/shell/src/pages/frota/data/manutencaoDataverse.test.ts`

**Interfaces:**
- Produces:
  - `chamarCustomApi(apiUrl, nome, body, falha) -> Promise<Record<string, unknown>>`;
  - tipos `PedidoAgendar`, `PedidoConclusao`, `RespostaConclusao` e `NovaManutencao`;
  - a interface `ComandosManutencao` (`detalheManutencao`, `criarManutencao`, `agendarManutencao`, `reprovarManutencao`, `cancelarManutencao`, `concluirManutencao`);
  - `DepsXrm`, `guid(valor)` e `criarComandosXrm(deps)`.

- [ ] **Step 1: Testes que falham**

```ts
// apps/shell/src/pages/frota/data/manutencaoDataverse.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { criarComandosXrm, type DepsXrm } from './manutencaoDataverse'

const ID = '{AAAAAAAA-1111-2222-3333-444444444444}'
const LIMPO = 'aaaaaaaa-1111-2222-3333-444444444444'
const API = 'https://org23b93544.crm2.dynamics.com/api/data/v9.2'

function criarDeps() {
  const webApi = {
    retrieveMultipleRecords: vi.fn(async (_entity: string, _options?: string) => ({ entities: [] as Record<string, unknown>[] })),
    retrieveRecord: vi.fn(async (_entity: string, _id: string, _options?: string) => ({}) as Record<string, unknown>),
    updateRecord: vi.fn(async (_entity: string, _id: string, _data: Record<string, unknown>) => ({})),
    createRecord: vi.fn(async (_entity: string, _data: Record<string, unknown>) => ({ id: '{BBBBBBBB-1111-2222-3333-444444444444}' })),
  }
  const d: DepsXrm = {
    api: webApi, apiUrl: API, envLabel: 'DEV',
    lerVariavel: vi.fn(async (_schemaName: string) => 'https://flow.invalid/arquivos?sig=SEGREDO'),
    metadata: vi.fn(async () => ({ value: [] })) as unknown as DepsXrm['metadata'],
    comportamentos: async () => ({ cr40f_janelainicio: 'DateOnly', cr40f_janelafim: 'DateOnly' }),
  }
  return { d, webApi }
}

const resposta = (ok: boolean, status: number, body: unknown) => vi.fn(async (_url: string, _init?: RequestInit) => ({ ok, status, json: async () => body }))
const corpo = (fetchMock: ReturnType<typeof resposta>, i = 0) => JSON.parse(String(fetchMock.mock.calls[i][1]?.body))

afterEach(() => vi.unstubAllGlobals())

describe('Custom APIs da manutenção', () => {
  it('agendar manda o pedido em RequestJson, com o Guid limpo', async () => {
    const f = resposta(true, 200, { ResponseJson: JSON.stringify({ geralId: 'g1' }) })
    vi.stubGlobal('fetch', f)
    await criarComandosXrm(criarDeps().d).agendarManutencao({ manutencaoId: ID, inicio: '2026-11-23', fim: '2026-11-29', comentario: 'Levar cedo' })
    expect(f.mock.calls[0][0]).toBe(`${API}/cr40f_ManutencaoAgendar`)
    expect(f.mock.calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(corpo(f).RequestJson)).toEqual({ manutencaoId: LIMPO, inicio: '2026-11-23', fim: '2026-11-29', comentario: 'Levar cedo' })
  })

  it('reprovar e cancelar vão para as APIs deles', async () => {
    const f = resposta(true, 200, { ResponseJson: '{}' })
    vi.stubGlobal('fetch', f)
    const comandos = criarComandosXrm(criarDeps().d)
    await comandos.reprovarManutencao(ID, 'Sem verba')
    await comandos.cancelarManutencao(ID, null)
    expect(f.mock.calls.map((call) => call[0])).toEqual([`${API}/cr40f_ManutencaoReprovar`, `${API}/cr40f_ManutencaoCancelar`])
    expect(JSON.parse(corpo(f, 0).RequestJson)).toEqual({ manutencaoId: LIMPO, comentario: 'Sem verba' })
    expect(JSON.parse(corpo(f, 1).RequestJson)).toEqual({ manutencaoId: LIMPO, comentario: null })
  })

  it('erro de negócio do servidor chega com a mensagem dele', async () => {
    vi.stubGlobal('fetch', resposta(false, 400, { error: { message: 'A janela precisa ser um dia ou uma semana de segunda a domingo.' } }))
    await expect(criarComandosXrm(criarDeps().d).agendarManutencao({ manutencaoId: ID, inicio: '2026-11-24', fim: '2026-11-30', comentario: null })).rejects.toThrow('A janela precisa ser um dia ou uma semana de segunda a domingo.')
  })

  it('concluir manda o contrato inteiro e lê a despesa e o estado do anexo', async () => {
    const f = resposta(true, 200, { ResponseJson: JSON.stringify({ despesaId: '{CCCCCCCC-1111-2222-3333-444444444444}', statusAnexo: 100000001, geralId: null }) })
    vi.stubGlobal('fetch', f)
    const pedido = { manutencaoId: ID, servicos: [100000007], km: 85200, data: '2026-11-17T10:00:00-03:00', valor: 350.5, pagamento: 202410003, estabelecimento: 'Oficina', cidadeId: '{DDDDDDDD-1111-2222-3333-444444444444}', realizadoPorId: '{EEEEEEEE-1111-2222-3333-444444444444}', servicoRealizado: null, comentario: 'ok', linkNotaFiscal: 'https://x.invalid/nf', linkFotoFinal1: null, linkFotoFinal2: null, linkFotoFinal3: null }
    const r = await criarComandosXrm(criarDeps().d).concluirManutencao(pedido)
    expect(r).toEqual({ despesaId: 'cccccccc-1111-2222-3333-444444444444', statusAnexo: 100000001, geralId: null })
    expect(f.mock.calls[0][0]).toBe(`${API}/cr40f_ManutencaoConcluir`)
    expect(JSON.parse(corpo(f).RequestJson)).toEqual({ ...pedido, manutencaoId: LIMPO, cidadeId: 'dddddddd-1111-2222-3333-444444444444', realizadoPorId: 'eeeeeeee-1111-2222-3333-444444444444' })
  })

  it('concluir sem a despesa na resposta é erro', async () => {
    vi.stubGlobal('fetch', resposta(true, 200, { ResponseJson: '{}' }))
    const pedido = { manutencaoId: ID, servicos: [100000007], km: 1, data: '2026-11-17T10:00:00-03:00', valor: 1, pagamento: 202410000, estabelecimento: 'x', cidadeId: ID, realizadoPorId: ID, servicoRealizado: null, comentario: null, linkNotaFiscal: null, linkFotoFinal1: null, linkFotoFinal2: null, linkFotoFinal3: null }
    await expect(criarComandosXrm(criarDeps().d).concluirManutencao(pedido)).rejects.toThrow(/não devolveu a despesa/)
  })

  it('recusa id que não é Guid sem chamar o servidor', async () => {
    const f = resposta(true, 200, {})
    vi.stubGlobal('fetch', f)
    await expect(criarComandosXrm(criarDeps().d).reprovarManutencao("x'; drop", 'motivo')).rejects.toThrow('Identificador inválido')
    expect(f).not.toHaveBeenCalled()
  })
})

describe('detalhe e criação', () => {
  it('detalhe lê as colunas da gaveta com os comportamentos de data', async () => {
    const { d, webApi } = criarDeps()
    webApi.retrieveRecord.mockResolvedValueOnce({ cr40f_manutencoesid: LIMPO, cr40f_status: 202410001, cr40f_janelainicio: '2026-11-23', cr40f_janelafim: '2026-11-29', cr40f_foto01: 'https://x.invalid/1' })
    const m = await criarComandosXrm(d).detalheManutencao(ID)
    expect(webApi.retrieveRecord.mock.calls[0][0]).toBe('cr40f_manutencoes')
    expect(webApi.retrieveRecord.mock.calls[0][1]).toBe(LIMPO)
    expect(webApi.retrieveRecord.mock.calls[0][2]).toContain('new_linkdanotafiscal')
    expect(m).toMatchObject({ id: LIMPO, status: 202410001, janelaInicio: '2026-11-23', janelaFim: '2026-11-29', fotosPedido: ['https://x.invalid/1'] })
  })

  it('detalhe de registro que não existe devolve null', async () => {
    const { d, webApi } = criarDeps()
    webApi.retrieveRecord.mockRejectedValueOnce(new Error(`cr40f_manutencoes With Id = ${LIMPO} Does Not Exist`))
    expect(await criarComandosXrm(d).detalheManutencao(ID)).toBeNull()
  })

  it('criar grava Solicitado com veículo e solicitante pelos binds', async () => {
    const { d, webApi } = criarDeps()
    const id = await criarComandosXrm(d).criarManutencao({ veiculoId: '{11111111-1111-4111-8111-111111111111}', descricao: 'Freio', grau: 4, tipo: 2, km: 85000, solicitanteId: '{22222222-2222-4222-8222-222222222222}' })
    expect(id).toBe('bbbbbbbb-1111-2222-3333-444444444444')
    expect(webApi.createRecord).toHaveBeenCalledWith('cr40f_manutencoes', {
      cr40f_descricao: 'Freio', cr40f_graudamanutencao: 4, cr40f_kmatual: 85000, cr40f_status: 0, cr40f_tipodoreparo: 2,
      'cr40f_Placa_Carro@odata.bind': '/cr40f_veiculoses(11111111-1111-4111-8111-111111111111)',
      'cr40f_Solicitado_por@odata.bind': '/cr40f_funcionarioses(22222222-2222-4222-8222-222222222222)',
    })
  })

  it('criar sem tipo nem solicitante não manda essas colunas', async () => {
    const { d, webApi } = criarDeps()
    await criarComandosXrm(d).criarManutencao({ veiculoId: '{11111111-1111-4111-8111-111111111111}', descricao: 'Pneu', grau: 2, tipo: null, km: 1000, solicitanteId: null })
    const enviado = webApi.createRecord.mock.calls[0][1]
    expect(enviado).not.toHaveProperty('cr40f_tipodoreparo')
    expect(enviado).not.toHaveProperty('cr40f_Solicitado_por@odata.bind')
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data/manutencaoDataverse.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 2: `customApi.ts` e uso em `dataverse.ts`**

```ts
// apps/shell/src/pages/frota/data/customApi.ts
/** Chama uma Custom API não vinculada; erro do servidor sai com a mensagem do Dataverse (payload.error.message). */
export async function chamarCustomApi(apiUrl: string, nome: string, body: Record<string, unknown>, falha: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${apiUrl}/${nome}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
    body: JSON.stringify(body),
  })
  let payload: Record<string, unknown> = {}
  try {
    const parsed: unknown = await response.json()
    if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>
  } catch { /* 204 ou corpo vazio */ }
  if (!response.ok) {
    const erro = payload.error as { message?: unknown } | undefined
    throw new Error(typeof erro?.message === 'string' && erro.message ? erro.message : `${falha} (${response.status})`)
  }
  return payload
}
```

Em `dataverse.ts`, acrescente `import { chamarCustomApi } from './customApi'` e troque a função interna `customApi` (linhas 59 a 77) por:

```ts
  /** Chama uma Custom API não vinculada; erro do servidor sai com a mensagem do Dataverse. */
  const customApi = (nome: string, body: Record<string, unknown>, falha: string) => chamarCustomApi(apiUrl, nome, body, falha)
```

- [ ] **Step 3: Tipos e `ComandosManutencao` em `source.ts`**

Troque o `import type` da linha 3 por:

```ts
import type { DetalheManutencao, FrotaData, Kind, ParcelaTermo, TableKey, TermoMulta, Veiculo } from './types'
```

Acrescente antes de `export interface DataSource`:

```ts
/** Pedidos e respostas das Custom APIs cr40f_Manutencao* (packages/plugins/Cr40f.Frota.Plugin/Manutencao/Contratos.cs). */
export type PedidoAgendar = { manutencaoId: string; inicio: string; fim: string; comentario: string | null }
export type PedidoConclusao = {
  manutencaoId: string; servicos: number[]; km: number
  /** ISO 8601 com fuso (`2026-11-17T10:00:00-03:00`). */
  data: string
  valor: number; pagamento: number; estabelecimento: string; cidadeId: string; realizadoPorId: string
  servicoRealizado: string | null; comentario: string | null
  linkNotaFiscal: string | null; linkFotoFinal1: string | null; linkFotoFinal2: string | null; linkFotoFinal3: string | null
}
/** `statusAnexo` 100000001 (ANEXO_DESPESA.PENDENTE): quem chamou ainda sobe a nota fiscal na despesa. */
export type RespostaConclusao = { despesaId: string; statusAnexo: number; geralId: string | null }
export type NovaManutencao = { veiculoId: string; descricao: string; grau: number; tipo: number | null; km: number; solicitanteId: string | null }

/** Ações da manutenção pela gaveta (Custom APIs, no contexto de quem chama) e o detalhe que ela mostra. */
export interface ComandosManutencao {
  /** Detalhe atual no servidor; null = a manutenção não existe mais. */
  detalheManutencao(id: string): Promise<DetalheManutencao | null>
  /** Cria a manutenção Solicitada e devolve o id. */
  criarManutencao(input: NovaManutencao): Promise<string>
  /** cr40f_ManutencaoAgendar: encaixa ou reagenda (cria ou reabre a linha da Geral). */
  agendarManutencao(pedido: PedidoAgendar): Promise<void>
  /** cr40f_ManutencaoReprovar: só Solicitado, comentário obrigatório. */
  reprovarManutencao(id: string, comentario: string): Promise<void>
  /** cr40f_ManutencaoCancelar: qualquer estado antes de Realizado. */
  cancelarManutencao(id: string, comentario: string | null): Promise<void>
  /** cr40f_ManutencaoConcluir: manutenção, despesa e linha da Geral numa transação; repetir é seguro. */
  concluirManutencao(pedido: PedidoConclusao): Promise<RespostaConclusao>
}
```

- [ ] **Step 4: `manutencaoDataverse.ts`**

```ts
// apps/shell/src/pages/frota/data/manutencaoDataverse.ts
import { chamarCustomApi } from './customApi'
import type { DateBehavior } from './dates'
import { cleanId, mapDetalheManutencao, SELECT_DETALHE_MANUTENCAO } from './mappers'
import { ENTITY_SET, MANUT, TABLE } from './schema'
import type { ComandosManutencao } from './source'
import { errorMessage, type XrmWebApi } from './xrm'

/** O que as fábricas da manutenção precisam do `createXrmSource`: Web API, URL, ambiente, variáveis e metadata. */
export type DepsXrm = {
  api: XrmWebApi
  apiUrl: string
  envLabel: string
  lerVariavel: (schemaName: string) => Promise<string | null>
  metadata: <T>(path: string) => Promise<T>
  comportamentos: () => Promise<Record<string, DateBehavior>>
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Guid sem chaves e minúsculo; rejeita o que não for Guid (nada vai ao servidor). */
export function guid(valor: string) {
  const id = cleanId(valor)
  if (!GUID.test(id)) throw new Error('Identificador inválido')
  return id
}

export function criarComandosXrm(deps: DepsXrm): ComandosManutencao {
  const { api } = deps

  /** Custom API das manutenções: RequestJson entra, ResponseJson sai (Contratos.cs). */
  async function comando(nome: string, pedido: Record<string, unknown>, falha: string): Promise<Record<string, unknown>> {
    const payload = await chamarCustomApi(deps.apiUrl, nome, { RequestJson: JSON.stringify(pedido) }, falha)
    const texto = typeof payload.ResponseJson === 'string' ? payload.ResponseJson : ''
    if (!texto) return {}
    try {
      return JSON.parse(texto) as Record<string, unknown>
    } catch {
      throw new Error(`${falha}: o servidor devolveu uma resposta inválida`)
    }
  }

  return {
    async detalheManutencao(id) {
      let row: Record<string, unknown>
      try {
        row = await api.retrieveRecord(TABLE.manutencoes, guid(id), `?$select=${SELECT_DETALHE_MANUTENCAO.join(',')}`)
      } catch (reason) {
        if (/does not exist|não existe/i.test(errorMessage(reason))) return null
        throw reason
      }
      return mapDetalheManutencao(row, await deps.comportamentos())
    },

    async criarManutencao(input) {
      const registro: Record<string, unknown> = {
        cr40f_descricao: input.descricao,
        cr40f_graudamanutencao: input.grau,
        cr40f_kmatual: input.km,
        cr40f_status: MANUT.SOLICITADO,
        'cr40f_Placa_Carro@odata.bind': `/${ENTITY_SET.veiculos}(${guid(input.veiculoId)})`,
      }
      if (input.tipo !== null) registro.cr40f_tipodoreparo = input.tipo
      if (input.solicitanteId) registro['cr40f_Solicitado_por@odata.bind'] = `/${ENTITY_SET.funcionarios}(${guid(input.solicitanteId)})`
      const { id } = await api.createRecord(TABLE.manutencoes, registro)
      return cleanId(id)
    },

    async agendarManutencao(p) {
      await comando('cr40f_ManutencaoAgendar', { manutencaoId: guid(p.manutencaoId), inicio: p.inicio, fim: p.fim, comentario: p.comentario }, 'Não foi possível encaixar a manutenção')
    },

    async reprovarManutencao(id, comentario) {
      await comando('cr40f_ManutencaoReprovar', { manutencaoId: guid(id), comentario }, 'Não foi possível reprovar a manutenção')
    },

    async cancelarManutencao(id, comentario) {
      await comando('cr40f_ManutencaoCancelar', { manutencaoId: guid(id), comentario }, 'Não foi possível cancelar a manutenção')
    },

    async concluirManutencao(p) {
      const r = await comando('cr40f_ManutencaoConcluir', { ...p, manutencaoId: guid(p.manutencaoId), cidadeId: guid(p.cidadeId), realizadoPorId: guid(p.realizadoPorId) }, 'Não foi possível concluir a manutenção')
      const despesaId = typeof r.despesaId === 'string' && r.despesaId ? cleanId(r.despesaId) : ''
      if (!despesaId) throw new Error('A conclusão não devolveu a despesa. Recarregue antes de tentar de novo')
      return { despesaId, statusAnexo: Number(r.statusAnexo), geralId: typeof r.geralId === 'string' && r.geralId ? cleanId(r.geralId) : null }
    },
  }
}
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data/manutencaoDataverse.test.ts src/pages/frota/data/dataverse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/frota/data
git commit -m "feat(frota): chamadas às Custom APIs da manutenção, detalhe e criação no Dataverse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 12: Arquivos, anexo da nota na despesa e buscas (`criarArquivosXrm`)

**Files:**
- Create: `apps/shell/src/pages/frota/data/arquivosManutencao.ts`
- Test: `apps/shell/src/pages/frota/data/arquivosManutencao.test.ts`
- Modify: `apps/shell/src/pages/frota/data/source.ts` (tipos e `ArquivosManutencao`)
- Modify: `apps/shell/src/pages/frota/data/manutencaoDataverse.ts` (+ teste)

**Interfaces:**
- Produces:
  - tipos `OrigemArquivo = 'NOTA_FISCAL' | 'POS_MANUTENCAO'`, `ArquivoEnviado = { link; nomeArquivo; caminho }`, `OpcaoBusca = { id; nome }` e `AlvoArquivo = Pick<DetalheManutencao, 'id' | 'codigo' | 'veiculo'>`;
  - a interface `ArquivosManutencao` (`enviarArquivoManutencao`, `anexarNotaFiscalDespesa`, `buscarFuncionarios`, `buscarCidades`);
  - em `arquivosManutencao.ts`: `VAR_FLOW_ARQUIVOS`, `segmentoPasta`, `pastaManutencao`, `pastaDespesa`, `extensaoDe`, `tipoFoto`, `linkDoFlow` e `exigirSucessoDoFlow`;
  - `criarArquivosXrm(deps)`.

- [ ] **Step 1: Testes que falham (funções puras)**

```ts
// apps/shell/src/pages/frota/data/arquivosManutencao.test.ts
import { describe, expect, it } from 'vitest'
import { exigirSucessoDoFlow, extensaoDe, linkDoFlow, pastaDespesa, pastaManutencao, segmentoPasta, tipoFoto } from './arquivosManutencao'

describe('arquivos da manutenção', () => {
  it('mesmas pastas do App: Manutenções/[DEV/]<modelo - placa>/<código> e Despesas/[DEV/]<nome>', () => {
    expect(pastaManutencao('DEV', 'Corolla', 'ABC1D23', 'MAN-0042')).toBe('Manutenções/DEV/Corolla - ABC1D23/MAN-0042')
    expect(pastaManutencao('PROD', null, ' ', '')).toBe('Manutenções/Sem modelo - Sem placa/Sem ID')
    expect(pastaDespesa('DEV', 'Manutenção ABC1D23')).toBe('Despesas/DEV/Manutenção ABC1D23')
    expect(pastaDespesa('PROD', '')).toBe('Despesas/Sem nome')
  })

  it('tira do caminho o que o OneDrive recusa', () => {
    expect(segmentoPasta(' a/b:c*d?. ', 'x')).toBe('a-b-c-d-')
    expect(segmentoPasta('', 'padrão')).toBe('padrão')
  })

  it('extensão pelo tipo; sem tipo conhecido, pelo nome', () => {
    expect(extensaoDe({ type: 'image/jpeg', name: 'x' })).toBe('jpg')
    expect(extensaoDe({ type: 'application/pdf', name: 'nota' })).toBe('pdf')
    expect(extensaoDe({ type: '', name: 'Nota.PNG' })).toBe('png')
    expect(extensaoDe({ type: '', name: 'sem-extensao' })).toBe('bin')
  })

  it('tipo da foto igual ao do App', () => {
    expect(tipoFoto('NOTA_FISCAL', 1)).toBe('NOTAFISCAL')
    expect(tipoFoto('NOTA_FISCAL', 2)).toBe('NOTAFISCAL_2')
    expect(tipoFoto('POS_MANUTENCAO', 3)).toBe('FOTO3')
  })

  it('lê o link nas chaves que o App aceita, inclusive aninhado e no body em texto', () => {
    expect(linkDoFlow({ shareLink: 'https://1drv.ms/a' })).toBe('https://1drv.ms/a')
    expect(linkDoFlow({ link: { webUrl: 'https://1drv.ms/b' } })).toBe('https://1drv.ms/b')
    expect(linkDoFlow({ body: JSON.stringify({ url: 'https://1drv.ms/c' }) })).toBe('https://1drv.ms/c')
    expect(linkDoFlow({ link: 'não é link' })).toBe('')
    expect(linkDoFlow(null)).toBe('')
  })

  it('status de falha do Flow vira erro com a mensagem dele; sem status ou com sucesso passa', () => {
    expect(() => exigirSucessoDoFlow({ status: 'Erro', mensagem: 'Pasta sem permissão' })).toThrow('Pasta sem permissão')
    expect(() => exigirSucessoDoFlow({ status: 'Sucesso' })).not.toThrow()
    expect(() => exigirSucessoDoFlow({ shareLink: 'https://1drv.ms/a' })).not.toThrow()
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data/arquivosManutencao.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 2: Tipos e `ArquivosManutencao` em `source.ts`**

O `import type` da linha 3 já traz `DetalheManutencao` (Tarefa 11). Acrescente depois de `ComandosManutencao`:

```ts
/** Origem do arquivo em new_fotomanutencao (mesmos valores do App). */
export type OrigemArquivo = 'NOTA_FISCAL' | 'POS_MANUTENCAO'
export type ArquivoEnviado = { link: string; nomeArquivo: string; caminho: string }
export type OpcaoBusca = { id: string; nome: string }
/** O que o envio precisa saber da manutenção para montar a pasta do App. */
export type AlvoArquivo = Pick<DetalheManutencao, 'id' | 'codigo' | 'veiculo'>

/** Arquivos da conclusão (mesmo flow e pastas do App) e as buscas da gaveta. */
export interface ArquivosManutencao {
  /** Sobe na pasta da manutenção e registra o vínculo em new_fotomanutencao; devolve o link de compartilhamento. */
  enviarArquivoManutencao(alvo: AlvoArquivo, arquivo: File, origem: OrigemArquivo, ordem: number): Promise<ArquivoEnviado>
  /** Sobe a nota na pasta da despesa, cria os anexos e grava cr40f_statusanexo (enviado; em falha, falhou). */
  anexarNotaFiscalDespesa(despesaId: string, arquivos: File[], enviadoPorId: string): Promise<void>
  /** Funcionários ativos pelo nome (até 50). Texto vazio = os primeiros por ordem alfabética. */
  buscarFuncionarios(texto: string): Promise<OpcaoBusca[]>
  /** Cidades ativas pelo nome (até 50), como "São José dos Campos - SP". */
  buscarCidades(texto: string): Promise<OpcaoBusca[]>
}
```

- [ ] **Step 3: Funções puras**

```ts
// apps/shell/src/pages/frota/data/arquivosManutencao.ts
import type { OrigemArquivo } from './source'

/** "Flow Salvar Arquivos OneDrive", o mesmo das fotos da manutenção no App (data/dataverse/flow.ts). */
export const VAR_FLOW_ARQUIVOS = 'new_FlowURLFlowSalvarArquivosOnedrive'

/** Trecho de caminho sem os caracteres que o OneDrive recusa (mesma regra do App: sanitizePathSegment). */
export function segmentoPasta(valor: string | null | undefined, padrao: string) {
  const limpo = String(valor ?? '').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, ' ').replace(/\.+$/g, '')
  return limpo || padrao
}

const prefixo = (envLabel: string) => (envLabel === 'DEV' ? 'DEV/' : '')

/** Mesma pasta do App (buildMaintenancePhotoFolder): Manutenções/[DEV/]<modelo - placa>/<código>. */
export function pastaManutencao(envLabel: string, modelo: string | null, placa: string | null, codigo: string) {
  const veiculo = `${(modelo ?? '').trim() || 'Sem modelo'} - ${(placa ?? '').trim() || 'Sem placa'}`
  return `Manutenções/${prefixo(envLabel)}${segmentoPasta(veiculo, 'Sem modelo - Sem placa')}/${segmentoPasta(codigo, 'Sem ID')}`
}

/** Mesma pasta do App (uploadExpenseInvoiceRemote): Despesas/[DEV/]<nome da despesa>. */
export const pastaDespesa = (envLabel: string, nome: string) => `Despesas/${prefixo(envLabel)}${segmentoPasta(nome, 'Sem nome')}`

const EXTENSOES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' }

export function extensaoDe(arquivo: Pick<File, 'type' | 'name'>) {
  const porTipo = EXTENSOES[arquivo.type.toLowerCase()]
  if (porTipo) return porTipo
  return /\.([a-z0-9]+)$/i.exec(arquivo.name)?.[1]?.toLowerCase() || 'bin'
}

/** new_tipofoto igual ao do App: NOTAFISCAL, NOTAFISCAL_2…; FOTO1 a FOTO3. */
export const tipoFoto = (origem: OrigemArquivo, ordem: number) => (origem === 'NOTA_FISCAL' ? (ordem === 1 ? 'NOTAFISCAL' : `NOTAFISCAL_${ordem}`) : `FOTO${ordem}`)

const CHAVES_LINK = ['shareLink', 'link', 'webUrl', 'url', 'fileLink', 'sharedLink', 'href'] as const

/** Link de compartilhamento na resposta do Flow (mesmas chaves que o App aceita em requireFlowLink). */
export function linkDoFlow(resultado: unknown): string {
  if (typeof resultado === 'string') {
    try { return linkDoFlow(JSON.parse(resultado)) } catch { return '' }
  }
  if (!resultado || typeof resultado !== 'object') return ''
  const r = resultado as Record<string, unknown>
  for (const chave of CHAVES_LINK) {
    const valor = r[chave]
    if (typeof valor === 'string' && /^https?:\/\//i.test(valor.trim())) return valor.trim()
  }
  for (const chave of ['link', 'shareLink'] as const) {
    const valor = r[chave]
    if (valor && typeof valor === 'object') {
      const aninhado = linkDoFlow(valor)
      if (aninhado) return aninhado
    }
  }
  const corpo = r.body ?? r.Body ?? r.responseText
  return corpo ? linkDoFlow(corpo) : ''
}

/** O Flow responde 200 mesmo em falha, com status/resultado no corpo (como o assertFlowSuccess do App). */
export function exigirSucessoDoFlow(resultado: unknown) {
  if (!resultado || typeof resultado !== 'object') return
  const r = resultado as Record<string, unknown>
  const status = String(r.status ?? r.Status ?? r.resultado ?? r.Resultado ?? '').trim()
  if (!status) return
  const normal = status.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (normal === 'sucesso' || normal === 'success' || normal === 'ok') return
  throw new Error(String(r.message ?? r.mensagem ?? r.error ?? r.erro ?? `O Flow de arquivos respondeu ${status}`))
}
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data/arquivosManutencao.test.ts`
Expected: PASS.

- [ ] **Step 4: Testes que falham (Dataverse)**

Em `manutencaoDataverse.test.ts`, troque o `import` de `./manutencaoDataverse` por:

```ts
import { criarArquivosXrm, criarComandosXrm, type DepsXrm } from './manutencaoDataverse'
```

e acrescente no fim:

```ts
describe('arquivos, anexo da despesa e buscas', () => {
  const arquivo = (nome: string, tipo = 'image/jpeg') => new File(['conteudo'], nome, { type: tipo })
  const alvo = { id: ID, codigo: 'MAN-0042', veiculo: { id: '{11111111-1111-4111-8111-111111111111}', label: 'ABC1D23' } }
  const DESPESA = '{CCCCCCCC-1111-2222-3333-444444444444}'
  const DESPESA_LIMPA = 'cccccccc-1111-2222-3333-444444444444'
  const PESSOA = '{EEEEEEEE-1111-2222-3333-444444444444}'
  const navegacao = vi.fn(async () => ({ value: [
    { ReferencingAttribute: 'cr40f_despesa', ReferencingEntityNavigationPropertyName: 'cr40f_Despesa' },
    { ReferencingAttribute: 'cr40f_enviadopor', ReferencingEntityNavigationPropertyName: 'cr40f_EnviadoPor' },
  ] })) as unknown as DepsXrm['metadata']

  it('envia pelo flow do OneDrive na pasta do App e registra o vínculo da foto', async () => {
    const f = resposta(true, 200, { shareLink: 'https://1drv.ms/nf1' })
    vi.stubGlobal('fetch', f)
    const { d, webApi } = criarDeps()
    webApi.retrieveRecord.mockResolvedValueOnce({ cr40f_modelo: 'Corolla', cr40f_placa: 'ABC1D23' })
    const r = await criarArquivosXrm(d).enviarArquivoManutencao(alvo, arquivo('nota.jpg'), 'NOTA_FISCAL', 1)
    expect(r).toEqual({ link: 'https://1drv.ms/nf1', nomeArquivo: 'nota-fiscal-1.jpg', caminho: 'Manutenções/DEV/Corolla - ABC1D23/MAN-0042' })
    expect(d.lerVariavel).toHaveBeenCalledWith('new_FlowURLFlowSalvarArquivosOnedrive')
    expect(f.mock.calls[0][0]).toBe('https://flow.invalid/arquivos?sig=SEGREDO')
    expect(f.mock.calls[0][1]).not.toHaveProperty('credentials')
    expect(corpo(f)).toMatchObject({ caminhoCompleto: 'Manutenções/DEV/Corolla - ABC1D23/MAN-0042', nomeArquivo: 'nota-fiscal-1.jpg', mimeType: 'image/jpeg', metadados: { manutencaoId: 'MAN-0042', manutencaoGuid: LIMPO, tipoFoto: 'NOTAFISCAL', origem: 'TELA_FROTA' } })
    expect(corpo(f).conteudoBase64).toBe(btoa('conteudo'))
    expect(webApi.createRecord).toHaveBeenCalledWith('new_fotomanutencao', {
      new_name: 'MAN-0042 - NOTA_FISCAL - 1', new_tipofoto: 'NOTAFISCAL', new_origem: 'NOTA_FISCAL', new_link: 'https://1drv.ms/nf1',
      new_caminho: 'Manutenções/DEV/Corolla - ABC1D23/MAN-0042', new_nomearquivo: 'nota-fiscal-1.jpg', new_ordem: 1,
      'new_Manutencao@odata.bind': `/cr40f_manutencoeses(${LIMPO})`,
    })
  })

  it('arquivo acima de 10 MB é recusado antes de subir', async () => {
    const f = resposta(true, 200, {})
    vi.stubGlobal('fetch', f)
    const grande = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.jpg', { type: 'image/jpeg' })
    await expect(criarArquivosXrm(criarDeps().d).enviarArquivoManutencao({ ...alvo, veiculo: null }, grande, 'POS_MANUTENCAO', 1)).rejects.toThrow('grande.jpg passa de 10 MB')
    expect(f).not.toHaveBeenCalled()
  })

  it('flow sem link: erro e nenhum vínculo gravado', async () => {
    vi.stubGlobal('fetch', resposta(true, 200, { status: 'Sucesso' }))
    const { d, webApi } = criarDeps()
    await expect(criarArquivosXrm(d).enviarArquivoManutencao({ ...alvo, veiculo: null }, arquivo('f.jpg'), 'POS_MANUTENCAO', 1)).rejects.toThrow(/não devolveu o link/)
    expect(webApi.createRecord).not.toHaveBeenCalled()
  })

  it('variável do flow vazia: mensagem de configuração, sem chamar nada', async () => {
    const f = resposta(true, 200, {})
    vi.stubGlobal('fetch', f)
    const { d } = criarDeps()
    d.lerVariavel = vi.fn(async () => null)
    await expect(criarArquivosXrm(d).enviarArquivoManutencao({ ...alvo, veiculo: null }, arquivo('f.jpg'), 'POS_MANUTENCAO', 1)).rejects.toThrow('Envio de arquivos não configurado neste ambiente (variável new_FlowURLFlowSalvarArquivosOnedrive)')
    expect(f).not.toHaveBeenCalled()
  })

  it('anexa a nota na pasta da despesa com os vínculos lidos na metadata e marca o anexo como enviado', async () => {
    const f = resposta(true, 200, { shareLink: 'https://1drv.ms/d1' })
    vi.stubGlobal('fetch', f)
    const { d, webApi } = criarDeps()
    d.metadata = navegacao
    webApi.retrieveRecord.mockResolvedValueOnce({ cr40f_nome: 'Manutenção ABC1D23' })
    await criarArquivosXrm(d).anexarNotaFiscalDespesa(DESPESA, [arquivo('nf.pdf', 'application/pdf')], PESSOA)
    expect(corpo(f)).toMatchObject({ caminhoCompleto: 'Despesas/DEV/Manutenção ABC1D23', nomeArquivo: 'nota-fiscal-manutencao-1.pdf', mimeType: 'application/pdf', metadados: { despesaGuid: DESPESA_LIMPA, despesaNome: 'Manutenção ABC1D23', tipo: 'COMPROVANTE', indice: 1 } })
    expect(webApi.createRecord).toHaveBeenCalledWith('cr40f_anexodespesaoperacional', expect.objectContaining({
      cr40f_nome: 'Comprovante 1 - Manutenção ABC1D23', cr40f_nomearquivo: 'nota-fiscal-manutencao-1', cr40f_urlsharepoint: 'https://1drv.ms/d1', cr40f_sharelink: 'https://1drv.ms/d1',
      cr40f_ordem: 1, cr40f_status: 100000001, cr40f_tipo: 100000000,
      'cr40f_Despesa@odata.bind': `/cr40f_despesaoperacionals(${DESPESA_LIMPA})`, 'cr40f_EnviadoPor@odata.bind': '/cr40f_funcionarioses(eeeeeeee-1111-2222-3333-444444444444)',
    }))
    expect(webApi.updateRecord).toHaveBeenCalledWith('cr40f_despesaoperacional', DESPESA_LIMPA, { cr40f_statusanexo: 100000002 })
  })

  it('falha ao anexar marca o anexo da despesa como falhou e repassa o erro', async () => {
    vi.stubGlobal('fetch', resposta(false, 500, {}))
    const { d, webApi } = criarDeps()
    d.metadata = navegacao
    webApi.retrieveRecord.mockResolvedValueOnce({ cr40f_nome: 'Manutenção' })
    await expect(criarArquivosXrm(d).anexarNotaFiscalDespesa(DESPESA, [arquivo('nf.jpg')], PESSOA)).rejects.toThrow('O envio do arquivo falhou (HTTP 500)')
    expect(webApi.updateRecord).toHaveBeenCalledWith('cr40f_despesaoperacional', DESPESA_LIMPA, { cr40f_statusanexo: 100000003 })
  })

  it('busca funcionários ativos e cidades ativas pelo nome, com aspas escapadas', async () => {
    const { d, webApi } = criarDeps()
    webApi.retrieveMultipleRecords.mockResolvedValueOnce({ entities: [{ cr40f_funcionariosid: '{F1}', cr40f_nomecompleto: "Ana D'Ávila" }] })
    webApi.retrieveMultipleRecords.mockResolvedValueOnce({ entities: [{ cr40f_cidadeid: 'C1', cr40f_nome: 'São José dos Campos', cr40f_uf: 'SP' }] })
    const arquivos = criarArquivosXrm(d)
    expect(await arquivos.buscarFuncionarios("d'á")).toEqual([{ id: 'f1', nome: "Ana D'Ávila" }])
    expect(await arquivos.buscarCidades('são')).toEqual([{ id: 'c1', nome: 'São José dos Campos - SP' }])
    expect(webApi.retrieveMultipleRecords.mock.calls[0][0]).toBe('cr40f_funcionarios')
    expect(webApi.retrieveMultipleRecords.mock.calls[0][1]).toContain(`contains(cr40f_nomecompleto,'${encodeURIComponent("d''á")}')`)
    expect(webApi.retrieveMultipleRecords.mock.calls[0][1]).toContain('statecode eq 0 and cr40f_status eq 0')
    expect(webApi.retrieveMultipleRecords.mock.calls[1][0]).toBe('cr40f_cidade')
    expect(webApi.retrieveMultipleRecords.mock.calls[1][1]).toContain('cr40f_ativa eq true')
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data/manutencaoDataverse.test.ts`
Expected: FAIL (`criarArquivosXrm` não existe).

- [ ] **Step 5: `criarArquivosXrm`**

Em `manutencaoDataverse.ts`, troque os `import` por:

```ts
import { exigirSucessoDoFlow, extensaoDe, linkDoFlow, pastaDespesa, pastaManutencao, tipoFoto, VAR_FLOW_ARQUIVOS } from './arquivosManutencao'
import { chamarCustomApi } from './customApi'
import type { DateBehavior } from './dates'
import { cleanId, mapDetalheManutencao, SELECT_DETALHE_MANUTENCAO } from './mappers'
import { ANEXO_DESPESA, ENTITY_SET, MANUT, TABLE } from './schema'
import { FOTO_MAX_BYTES, fileToBase64 } from './sharepoint'
import type { ArquivosManutencao, ComandosManutencao } from './source'
import { errorMessage, type XrmWebApi } from './xrm'
```

e acrescente no fim do arquivo:

```ts
const TABELA_FOTO = 'new_fotomanutencao'
const TABELA_ANEXO = 'cr40f_anexodespesaoperacional'
const TABELA_DESPESA = 'cr40f_despesaoperacional'
/** Mesmos valores que o App grava no anexo do comprovante (uploadExpenseInvoiceRemote). */
const ANEXO_STATUS_ENVIADO = 100000001
const ANEXO_TIPO_COMPROVANTE = 100000000

/** Texto da busca dentro do OData: aspas simples dobradas e codificado para a URL. */
const termo = (texto: string) => encodeURIComponent(texto.trim().replace(/'/g, "''"))

export function criarArquivosXrm(deps: DepsXrm): ArquivosManutencao {
  const { api } = deps
  // A URL do flow tem assinatura: fica só em memória, nunca em mensagem ou log.
  let urlFlow: string | null = null

  async function enviarPeloFlow(corpo: Record<string, unknown>) {
    if (!urlFlow) {
      const url = await deps.lerVariavel(VAR_FLOW_ARQUIVOS)
      if (!url || !/^https:\/\//i.test(url)) throw new Error(`Envio de arquivos não configurado neste ambiente (variável ${VAR_FLOW_ARQUIVOS})`)
      urlFlow = url
    }
    let resposta: Response
    try {
      resposta = await fetch(urlFlow, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    } catch {
      throw new Error('Não foi possível enviar o arquivo (rede ou bloqueio do navegador)')
    }
    let resultado: unknown = {}
    try { resultado = await resposta.json() } catch { /* corpo vazio */ }
    if (!resposta.ok) throw new Error(`O envio do arquivo falhou (HTTP ${resposta.status})`)
    exigirSucessoDoFlow(resultado)
    const link = linkDoFlow(resultado)
    if (!link) throw new Error('O arquivo foi salvo, mas o Flow não devolveu o link. Nada foi gravado')
    return link
  }

  let navegacao: Promise<{ despesa: string; enviadoPor: string }> | null = null
  /** Nome dos vínculos do anexo para o @odata.bind, lido da metadata (como o App faz). */
  function navegacaoAnexo() {
    if (!navegacao) {
      const lido = deps.metadata<{ value: { ReferencingAttribute: string; ReferencingEntityNavigationPropertyName: string }[] }>(`EntityDefinitions(LogicalName='${TABELA_ANEXO}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName`)
        .then((r) => {
          const nome = (atributo: string) => r.value.find((rel) => rel.ReferencingAttribute === atributo)?.ReferencingEntityNavigationPropertyName
          const despesa = nome('cr40f_despesa')
          const enviadoPor = nome('cr40f_enviadopor')
          if (!despesa || !enviadoPor) throw new Error('Os anexos de despesa estão sem os vínculos de despesa e de quem enviou')
          return { despesa, enviadoPor }
        })
      lido.catch(() => { navegacao = null })
      navegacao = lido
    }
    return navegacao
  }

  return {
    async enviarArquivoManutencao(alvo, arquivo, origem, ordem) {
      if (arquivo.size > FOTO_MAX_BYTES) throw new Error(`${arquivo.name} passa de 10 MB`)
      const id = guid(alvo.id)
      let modelo: string | null = null
      let placa: string | null = null
      if (alvo.veiculo) {
        const v = await api.retrieveRecord(TABLE.veiculos, guid(alvo.veiculo.id), '?$select=cr40f_modelo,cr40f_placa')
        modelo = typeof v.cr40f_modelo === 'string' ? v.cr40f_modelo : null
        placa = typeof v.cr40f_placa === 'string' ? v.cr40f_placa : null
      }
      const caminho = pastaManutencao(deps.envLabel, modelo, placa, alvo.codigo)
      const nomeArquivo = `${origem === 'NOTA_FISCAL' ? 'nota-fiscal' : 'foto'}-${ordem}.${extensaoDe(arquivo)}`
      const tipo = tipoFoto(origem, ordem)
      const link = await enviarPeloFlow({
        caminhoCompleto: caminho, nomeArquivo, conteudoBase64: await fileToBase64(arquivo), mimeType: arquivo.type || 'application/octet-stream',
        metadados: { manutencaoId: alvo.codigo, manutencaoGuid: id, tipoFoto: tipo, origem: 'TELA_FROTA' },
      })
      await api.createRecord(TABELA_FOTO, {
        new_name: `${alvo.codigo || id} - ${origem} - ${ordem}`, new_tipofoto: tipo, new_origem: origem, new_link: link,
        new_caminho: caminho, new_nomearquivo: nomeArquivo, new_ordem: ordem,
        'new_Manutencao@odata.bind': `/${ENTITY_SET.manutencoes}(${id})`,
      })
      return { link, nomeArquivo, caminho }
    },

    async anexarNotaFiscalDespesa(despesaId, arquivos, enviadoPorId) {
      const id = guid(despesaId)
      const pessoa = guid(enviadoPorId)
      const despesa = await api.retrieveRecord(TABELA_DESPESA, id, '?$select=cr40f_nome')
      const nome = typeof despesa.cr40f_nome === 'string' && despesa.cr40f_nome ? despesa.cr40f_nome : 'Manutenção'
      const caminho = pastaDespesa(deps.envLabel, nome)
      try {
        const nav = await navegacaoAnexo()
        for (const [indice, arquivo] of arquivos.entries()) {
          const ordem = indice + 1
          const base = `nota-fiscal-manutencao-${ordem}`
          const link = await enviarPeloFlow({
            caminhoCompleto: caminho, nomeArquivo: `${base}.${extensaoDe(arquivo)}`, conteudoBase64: await fileToBase64(arquivo), mimeType: arquivo.type || 'application/octet-stream',
            metadados: { despesaGuid: id, despesaNome: nome, tipo: 'COMPROVANTE', indice: ordem },
          })
          await api.createRecord(TABELA_ANEXO, {
            cr40f_nome: `Comprovante ${ordem} - ${nome}`, cr40f_nomearquivo: base, cr40f_urlsharepoint: link, cr40f_sharelink: link,
            cr40f_dataenvio: new Date().toISOString(), cr40f_ordem: ordem, cr40f_status: ANEXO_STATUS_ENVIADO, cr40f_tipo: ANEXO_TIPO_COMPROVANTE,
            [`${nav.despesa}@odata.bind`]: `/${ENTITY_SET.despesas}(${id})`,
            [`${nav.enviadoPor}@odata.bind`]: `/${ENTITY_SET.funcionarios}(${pessoa})`,
          })
        }
        await api.updateRecord(TABELA_DESPESA, id, { cr40f_statusanexo: ANEXO_DESPESA.ENVIADO })
      } catch (reason) {
        await api.updateRecord(TABELA_DESPESA, id, { cr40f_statusanexo: ANEXO_DESPESA.FALHOU }).catch(() => undefined)
        throw reason
      }
    },

    async buscarFuncionarios(texto) {
      const filtro = `statecode eq 0 and cr40f_status eq 0${texto.trim() ? ` and contains(cr40f_nomecompleto,'${termo(texto)}')` : ''}`
      const r = await api.retrieveMultipleRecords('cr40f_funcionarios', `?$select=cr40f_funcionariosid,cr40f_nomecompleto&$filter=${filtro}&$orderby=cr40f_nomecompleto asc&$top=50`)
      return r.entities.map((row) => ({ id: cleanId(row.cr40f_funcionariosid), nome: String(row.cr40f_nomecompleto ?? '') })).filter((o) => o.nome)
    },

    async buscarCidades(texto) {
      const filtro = `cr40f_ativa eq true${texto.trim() ? ` and contains(cr40f_nome,'${termo(texto)}')` : ''}`
      const r = await api.retrieveMultipleRecords('cr40f_cidade', `?$select=cr40f_cidadeid,cr40f_nome,cr40f_uf&$filter=${filtro}&$orderby=cr40f_nome asc&$top=50`)
      return r.entities
        .map((row) => ({ id: cleanId(row.cr40f_cidadeid), nome: [row.cr40f_nome, row.cr40f_uf].filter((v): v is string => typeof v === 'string' && v !== '').join(' - ') }))
        .filter((o) => o.nome)
    },
  }
}
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data/manutencaoDataverse.test.ts src/pages/frota/data/arquivosManutencao.test.ts && pnpm --filter @betinhos/shell typecheck`
Expected: PASS e typecheck sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/frota/data
git commit -m "feat(frota): envio da nota e das fotos pelo flow do App, anexo na despesa e buscas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 13: `DataSource` completa: Dataverse, mock e fontes falsas dos testes

**Files:**
- Modify: `apps/shell/src/pages/frota/data/source.ts`, `data/dataverse.ts`, `data/hostSource.ts`, `data/mock.ts`
- Create: `apps/shell/src/pages/frota/data/mock.test.ts`
- Modify: `apps/shell/src/pages/frota/testUtils.ts`
- Modify: `apps/shell/src/pages/frota/domain/transitions.test.ts`, `components/StatusPanel.test.tsx`, `components/RegistroDrawer.test.tsx`, `FrotaPage.test.tsx` (fontes falsas)

**Interfaces:**
- Consumes: `ComandosManutencao` (Tarefa 11), `ArquivosManutencao` (Tarefa 12), `janelaValida`, `segundaDe` e `somarDias` (Tarefa 6).
- Produces: `DataSource extends ComandosManutencao, ArquivosManutencao`; mock com fila de exemplo (m1 Urgente, m7 Alta parada, m8 Baixa), m2 Agendado na próxima semana e m3 Programado atrasado; `manutencaoFalsa()` em `testUtils.ts`.

- [ ] **Step 1: Teste do mock (falha)**

```ts
// apps/shell/src/pages/frota/data/mock.test.ts
import { describe, expect, it } from 'vitest'
import { segundaDe, somarDias } from '../domain/janela'
import { todaySP } from './dates'
import { createMockSource } from './mock'
import { ANEXO_DESPESA, MANUT } from './schema'
import type { PedidoConclusao } from './source'

const pedido = (id: string, extra: Partial<PedidoConclusao> = {}): PedidoConclusao => ({ manutencaoId: id, servicos: [100000007], km: 51000, data: '2026-11-17T10:00:00-03:00', valor: 350.5, pagamento: 202410003, estabelecimento: 'Oficina Teste', cidadeId: 'c1', realizadoPorId: 'f1', servicoRealizado: null, comentario: null, linkNotaFiscal: 'https://example.invalid/nf', linkFotoFinal1: null, linkFotoFinal2: null, linkFotoFinal3: null, ...extra })

describe('mock das manutenções', () => {
  it('a fila de exemplo tem pedidos de graus diferentes, e o detalhe do m1 tem fotos', async () => {
    const source = createMockSource()
    const { data } = await source.load()
    expect(data.manutencoes.filter((m) => m.status === MANUT.SOLICITADO).map((m) => m.id)).toEqual(expect.arrayContaining(['m1', 'm7', 'm8']))
    expect(data.manutencoes.find((m) => m.id === 'm3')).toMatchObject({ status: MANUT.PROGRAMADO })
    expect((await source.detalheManutencao('m1'))?.fotosPedido).toHaveLength(2)
    expect(await source.detalheManutencao('nao-existe')).toBeNull()
  })

  it('encaixa só janela válida e grava a data do encaixe e o comentário', async () => {
    const source = createMockSource()
    await expect(source.agendarManutencao({ manutencaoId: 'm1', inicio: '2026-11-17', fim: '2026-11-23', comentario: null })).rejects.toThrow('A janela precisa ser um dia ou uma semana de segunda a domingo.')
    const inicio = segundaDe(somarDias(todaySP(), 7))
    await source.agendarManutencao({ manutencaoId: 'm1', inicio, fim: somarDias(inicio, 6), comentario: 'Levar cedo' })
    expect(await source.detalheManutencao('m1')).toMatchObject({ status: MANUT.AGENDADO, janelaInicio: inicio, janelaFim: somarDias(inicio, 6), dataAprovacao: todaySP(), comentarioAoMotorista: 'Levar cedo' })
  })

  it('reprova só Solicitado e exige o motivo', async () => {
    const source = createMockSource()
    await expect(source.reprovarManutencao('m2', 'Sem verba')).rejects.toThrow('Só dá para reprovar uma manutenção que ainda não foi encaixada.')
    await expect(source.reprovarManutencao('m8', ' ')).rejects.toThrow('Escreva o motivo da reprovação.')
    await source.reprovarManutencao('m8', 'Sem verba')
    expect(await source.detalheManutencao('m8')).toMatchObject({ status: MANUT.REPROVADO, comentarioAprovador: 'Sem verba' })
  })

  it('conclui com a nota, devolve a despesa com anexo pendente e grava a classificação manual', async () => {
    const source = createMockSource()
    await expect(source.concluirManutencao(pedido('m2', { linkNotaFiscal: null }))).rejects.toThrow('Falta a foto da nota fiscal.')
    expect(await source.concluirManutencao(pedido('m2'))).toEqual({ despesaId: 'd-m2', statusAnexo: ANEXO_DESPESA.PENDENTE, geralId: null })
    expect(await source.detalheManutencao('m2')).toMatchObject({ status: MANUT.REALIZADO, servicos: [100000007], categorias: [100000001], kmRealizado: 51000, valor: 350.5, pagamento: 202410003, realizadoPor: { id: 'f1' }, linkNotaFiscal: 'https://example.invalid/nf' })
  })

  it('cria a manutenção Solicitada no veículo escolhido', async () => {
    const source = createMockSource()
    const id = await source.criarManutencao({ veiculoId: 'v2', descricao: 'Pneu furado', grau: 3, tipo: null, km: 40000, solicitanteId: null })
    expect(await source.detalheManutencao(id)).toMatchObject({ descricao: 'Pneu furado', status: MANUT.SOLICITADO, veiculo: { id: 'v2', label: 'TST2B22' }, solicitante: null, km: 40000, grau: 3 })
  })

  it('buscas devolvem pessoas e cidades de exemplo pelo nome', async () => {
    const source = createMockSource()
    expect((await source.buscarFuncionarios('ana')).map((o) => o.id)).toEqual(['f1'])
    expect((await source.buscarCidades('')).length).toBeGreaterThan(1)
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data/mock.test.ts`
Expected: FAIL (o mock não tem os métodos).

- [ ] **Step 2: `DataSource` completa**

Em `source.ts`, troque a linha `export interface DataSource {` por:

```ts
export interface DataSource extends ComandosManutencao, ArquivosManutencao {
```

Em `hostSource.ts`, troque `GRAVACOES` por:

```ts
const GRAVACOES = ['update', 'runFlow', 'salvarItemPlano', 'inativarItemPlano', 'salvarBaseline', 'openForm', 'enviarTermoMulta', 'cancelarTermoMulta', 'criarManutencao', 'agendarManutencao', 'reprovarManutencao', 'cancelarManutencao', 'concluirManutencao', 'anexarNotaFiscalDespesa'] as const
```

Em `dataverse.ts`, acrescente `import { criarArquivosXrm, criarComandosXrm, type DepsXrm } from './manutencaoDataverse'`. Logo antes do `return {` de `createXrmSource`, acrescente:

```ts
  const deps: DepsXrm = { api, apiUrl, envLabel, lerVariavel: readEnvVar, metadata: getJson, comportamentos: () => loadBehaviors(TABLE.manutencoes) }
```

e, no objeto devolvido, logo depois de `envLabel,`:

```ts
    ...criarComandosXrm(deps),
    ...criarArquivosXrm(deps),
```

- [ ] **Step 3: Mock**

Em `mock.ts`, troque os `import` do topo por:

```ts
import { mockVolume } from '../../../app/mockVolume'
import { categoriasDe, CAMPO, lerMulti, ORIGEM } from '../domain/manutencaoCatalogo'
import { janelaValida, segundaDe, somarDias } from '../domain/janela'
import { addMonths, todaySP } from './dates'
import { ANEXO_DESPESA, COLISAO, MANUT, MULTA, STATUS_FIELD, VEICULO } from './schema'
import type { Acordo } from '../domain/termoMulta'
import type { DataSource, FlowId, OpcaoBusca } from './source'
import type { Colisao, DespesaCombustivel, DetalheManutencao, FrotaData, ItemPlano, Kind, Manutencao, Multa, Ref, TelemetriaKm, TermoMulta } from './types'
import { latenciaMock } from '../../../app/latenciaMock'
```

No `seed()`, troque as linhas de `m2` e `m3` por:

```ts
      manut('m2', v2, { status: MANUT.AGENDADO, comentarioAprovador: 'Ok', janelaInicio: segundaDe(offset(7)), janelaFim: somarDias(segundaDe(offset(7)), 6), dataAprovacao: offset(-1) }),
      manut('m3', v1, { status: MANUT.PROGRAMADO, janelaInicio: offset(-3), janelaFim: offset(-3), dataAprovacao: offset(-6) }),
```

e, depois da linha de `m6`:

```ts
      // Fila "A encaixar" de exemplo: Urgente (m1), Alta parada há 5 dias (m7) e Baixa de ontem (m8).
      manut('m7', v2, { grau: 3, descricao: 'Ar-condicionado sem gelar (fictício)', criadoEm: iso(-5) }),
      manut('m8', v1, { grau: 1, descricao: 'Lâmpada da placa queimada (fictício)', criadoEm: iso(-1) }),
```

Logo depois de `const delay = () => ...` em `createMockSource`, acrescente:

```ts
  // O que só a gaveta mostra (fotos, nota, pagamento, comentários), por manutenção.
  const extras = new Map<string, Partial<DetalheManutencao>>([
    ['m1', { fotosPedido: ['https://example.invalid/fotos/m1-1.jpg', 'https://example.invalid/fotos/m1-2.jpg'] }],
    ['m4', { pagamento: 202410000, realizadoPor: bruno, linkNotaFiscal: 'https://example.invalid/fotos/m4-nf.jpg', fotosFinais: ['https://example.invalid/fotos/m4-final-1.jpg'], comentarioColaborador: 'Troca feita sem intercorrências (fictício).' }],
  ])
  const extra = (id: string) => {
    let e = extras.get(id)
    if (!e) { e = {}; extras.set(id, e) }
    return e
  }
  const manutencaoDoMock = (id: string) => {
    const m = data.manutencoes.find((item) => item.id === id)
    if (!m) throw new Error('Registro não encontrado no mock.')
    return m
  }
  const encerrada = (status: number | null) => status === MANUT.REALIZADO || status === MANUT.REPROVADO || status === MANUT.CANCELADO
  const pessoas: Ref[] = [ana, bruno]
  const CIDADES: OpcaoBusca[] = [{ id: 'c1', nome: 'São José dos Campos - SP' }, { id: 'c2', nome: 'São Paulo - SP' }, { id: 'c3', nome: 'Taubaté - SP' }]
  const contem = (nome: string, texto: string) => nome.toLowerCase().includes(texto.trim().toLowerCase())
```

No objeto devolvido, depois de `listarParcelasTermo`, acrescente (as mensagens são as mesmas do `Ciclo.cs`):

```ts
    async detalheManutencao(id) {
      await delay()
      const m = data.manutencoes.find((item) => item.id === id)
      if (!m) return null
      return structuredClone({ ...m, comentarioAoMotorista: null, comentarioColaborador: null, pagamento: null, realizadoPor: null, fotosPedido: [], linkNotaFiscal: null, fotosFinais: [], ...extras.get(id) })
    },
    async criarManutencao(input) {
      await delay()
      const veiculo = data.veiculos.find((v) => v.id === input.veiculoId)
      if (!veiculo) throw new Error('Veículo não encontrado no mock.')
      const id = `mn${data.manutencoes.length + 1}`
      data.manutencoes.unshift(manut(id, { id: veiculo.id, label: veiculo.placa }, { descricao: input.descricao, grau: input.grau, tipo: input.tipo, km: input.km, solicitante: pessoas.find((p) => p.id === input.solicitanteId) ?? null, criadoEm: new Date().toISOString() }))
      return id
    },
    async agendarManutencao({ manutencaoId, inicio, fim, comentario }) {
      await delay()
      const m = manutencaoDoMock(manutencaoId)
      if (!janelaValida({ inicio, fim })) throw new Error('A janela precisa ser um dia ou uma semana de segunda a domingo.')
      if (m.status !== MANUT.SOLICITADO && m.status !== MANUT.AGENDADO && m.status !== MANUT.PROGRAMADO) throw new Error('Só dá para encaixar uma manutenção em aberto.')
      if (!m.veiculo) throw new Error('A manutenção não tem veículo. Informe o veículo antes de encaixar.')
      Object.assign(m, { status: MANUT.AGENDADO, janelaInicio: inicio, janelaFim: fim, dataAprovacao: m.dataAprovacao ?? todaySP() })
      if (comentario) extra(manutencaoId).comentarioAoMotorista = comentario
    },
    async reprovarManutencao(id, comentario) {
      await delay()
      const m = manutencaoDoMock(id)
      if (!comentario.trim()) throw new Error('Escreva o motivo da reprovação.')
      if (m.status !== MANUT.SOLICITADO) throw new Error('Só dá para reprovar uma manutenção que ainda não foi encaixada.')
      Object.assign(m, { status: MANUT.REPROVADO, comentarioAprovador: comentario.trim() })
    },
    async cancelarManutencao(id, comentario) {
      await delay()
      const m = manutencaoDoMock(id)
      if (encerrada(m.status)) throw new Error('Esta manutenção já foi encerrada.')
      m.status = MANUT.CANCELADO
      if (comentario?.trim()) m.comentarioAprovador = comentario.trim()
    },
    async concluirManutencao(p) {
      await delay()
      const m = manutencaoDoMock(p.manutencaoId)
      if (m.status === MANUT.REPROVADO || m.status === MANUT.CANCELADO) throw new Error('Esta manutenção já foi encerrada.')
      if (m.status !== MANUT.REALIZADO) {
        const e = extra(p.manutencaoId)
        if (!p.linkNotaFiscal && !e.linkNotaFiscal) throw new Error('Falta a foto da nota fiscal.')
        const servicos = [...new Set(p.servicos)]
        Object.assign(m, { status: MANUT.REALIZADO, servicos, categorias: categoriasDe(servicos), origemClassificacao: ORIGEM.MANUAL, confiancaIa: null, kmRealizado: p.km, valor: p.valor, estabelecimento: p.estabelecimento, dataManutencao: p.data, servicoRealizado: p.servicoRealizado ?? m.servicoRealizado })
        Object.assign(e, {
          pagamento: p.pagamento, realizadoPor: pessoas.find((f) => f.id === p.realizadoPorId) ?? { id: p.realizadoPorId, label: '' }, comentarioColaborador: p.comentario,
          linkNotaFiscal: p.linkNotaFiscal ?? e.linkNotaFiscal ?? null, fotosFinais: [p.linkFotoFinal1, p.linkFotoFinal2, p.linkFotoFinal3].filter((l): l is string => Boolean(l)),
        })
      }
      return { despesaId: `d-${p.manutencaoId}`, statusAnexo: ANEXO_DESPESA.PENDENTE, geralId: null }
    },
    async enviarArquivoManutencao(alvo, arquivo, origem, ordem) {
      await delay()
      const caminho = `Manutenções/MOCK/${alvo.codigo || alvo.id}`
      return { link: `https://example.invalid/manutencoes/${encodeURIComponent(alvo.codigo || alvo.id)}/${origem.toLowerCase()}-${ordem}-${encodeURIComponent(arquivo.name)}`, nomeArquivo: arquivo.name, caminho }
    },
    async anexarNotaFiscalDespesa() {
      await delay()
    },
    async buscarFuncionarios(texto) {
      await delay()
      return pessoas.filter((p) => contem(p.label, texto)).map((p) => ({ id: p.id, nome: p.label }))
    },
    async buscarCidades(texto) {
      await delay()
      return CIDADES.filter((c) => contem(c.nome, texto))
    },
```

- [ ] **Step 4: Fontes falsas dos testes**

Em `testUtils.ts`, acrescente:

```ts
import { vi } from 'vitest'
import type { ArquivosManutencao, ComandosManutencao } from './data/source'

/** Métodos da manutenção para as fontes falsas dos testes que não os exercitam. */
export function manutencaoFalsa(): ComandosManutencao & ArquivosManutencao {
  return {
    detalheManutencao: vi.fn(async () => null),
    criarManutencao: vi.fn(async () => 'nova'),
    agendarManutencao: vi.fn(async () => {}),
    reprovarManutencao: vi.fn(async () => {}),
    cancelarManutencao: vi.fn(async () => {}),
    concluirManutencao: vi.fn(async () => ({ despesaId: 'd1', statusAnexo: 100000002, geralId: null })),
    enviarArquivoManutencao: vi.fn(async (_alvo: unknown, arquivo: File) => ({ link: `https://example.invalid/${arquivo.name}`, nomeArquivo: arquivo.name, caminho: 'Manutenções/TESTE' })),
    anexarNotaFiscalDespesa: vi.fn(async () => {}),
    buscarFuncionarios: vi.fn(async () => []),
    buscarCidades: vi.fn(async () => []),
  }
}
```

Nas fontes falsas tipadas, acrescente `...manutencaoFalsa(),` logo depois de `mode: ..., envLabel: ...,` e importe `manutencaoFalsa` de `../testUtils` (ou `./testUtils` em `FrotaPage.test.tsx`):
- `domain/transitions.test.ts` (função `fakeSource`);
- `components/StatusPanel.test.tsx` (função `fakeSource`);
- `components/RegistroDrawer.test.tsx` (função `fakeSource`);
- `FrotaPage.test.tsx` (função `fakeSource`).

- [ ] **Step 5: Rodar (Betinhos-Renan)**

Run: `pnpm --filter @betinhos/shell typecheck && pnpm --filter @betinhos/shell exec vitest run src/pages/frota src/pages/documentos src/app`
Expected: typecheck sem erros; PASS em todos (`mock.test.ts` inclusive).

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/frota
git commit -m "feat(frota): DataSource com as ações da manutenção no Dataverse e no mock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Tarefa 14: Conclusão pelo shell: validação e orquestração (`domain/conclusao.ts`)

**Files:**
- Create: `apps/shell/src/pages/frota/domain/conclusao.ts`
- Test: `apps/shell/src/pages/frota/domain/conclusao.test.ts`

**Interfaces:**
- Consumes: `PedidoConclusao`, `RespostaConclusao`, `AlvoArquivo`, `ComandosManutencao` e `ArquivosManutencao` (Tarefas 11 e 12); `ANEXO_DESPESA`, `LIMITE` e `PAGAMENTO` (Tarefa 4).
- Produces:
  - tipos `ValoresConclusao`, `ErrosConclusao`, `BaseConclusao` (o `PedidoConclusao` sem os links) e `ContextoConclusao`;
  - `MAX_FOTOS_FINAIS = 3`;
  - `agoraLocalSP(agora)`, `valoresConclusaoIniciais(m, agora)` e `validarConclusao(v, ctx) -> { erros, aviso, pedido }`;
  - `concluirPeloShell(source, alvo, pedido, { notas, fotos }) -> { resposta, avisoNota }`.

- [ ] **Step 1: Testes que falham**

```ts
// apps/shell/src/pages/frota/domain/conclusao.test.ts
import { describe, expect, it, vi } from 'vitest'
import { ANEXO_DESPESA, MANUT, PAGAMENTO } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { agoraLocalSP, concluirPeloShell, validarConclusao, valoresConclusaoIniciais, type ValoresConclusao } from './conclusao'

const detalhe = (extra: Partial<DetalheManutencao> = {}): DetalheManutencao => ({ id: 'm1', codigo: 'MAN-1', descricao: 'Freio', status: MANUT.AGENDADO, grau: 3, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: 85000, veiculo: { id: 'v1', label: 'ABC1D23' }, solicitante: null, criadoEm: '2026-11-10T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, comentarioAoMotorista: null, comentarioColaborador: null, pagamento: null, realizadoPor: null, fotosPedido: [], linkNotaFiscal: null, fotosFinais: [], ...extra })
const nota = new File(['nf'], 'nf.jpg', { type: 'image/jpeg' })
const validos = (extra: Partial<ValoresConclusao> = {}): ValoresConclusao => ({ servicos: [100000007, 100000007], km: '85200', data: '2026-11-17T10:00', valor: '350,5', pagamento: String(PAGAMENTO.DINHEIRO), estabelecimento: ' Oficina Teste ', cidadeId: 'c1', realizadoPorId: 'f1', servicoRealizado: '', comentario: ' ok ', notas: [nota], fotos: [], ...extra })
const ctx = { manutencaoId: 'm1', kmPedido: 85000, temNotaGravada: false }

describe('validarConclusao', () => {
  it('monta o pedido da Custom API: serviços sem repetição, data com fuso, valor com vírgula e textos aparados', () => {
    expect(validarConclusao(validos(), ctx)).toEqual({ erros: {}, aviso: null, pedido: { manutencaoId: 'm1', servicos: [100000007], km: 85200, data: '2026-11-17T10:00:00-03:00', valor: 350.5, pagamento: 202410003, estabelecimento: 'Oficina Teste', cidadeId: 'c1', realizadoPorId: 'f1', servicoRealizado: null, comentario: 'ok' } })
  })

  it('exige serviços, km, data, valor, pagamento, estabelecimento, cidade, quem realizou e a nota', () => {
    const r = validarConclusao({ servicos: [], km: '', data: '', valor: '0', pagamento: '', estabelecimento: ' ', cidadeId: '', realizadoPorId: '', servicoRealizado: '', comentario: '', notas: [], fotos: [] }, ctx)
    expect(r.pedido).toBeNull()
    expect(r.erros).toEqual({
      servicos: 'Escolha pelo menos um serviço realizado', km: 'Informe o km do veículo (número inteiro)', data: 'Informe a data e a hora', valor: 'Informe o valor pago',
      pagamento: 'Escolha a forma de pagamento', estabelecimento: 'Informe o estabelecimento', cidadeId: 'Escolha a cidade', realizadoPorId: 'Escolha quem realizou', notas: 'Anexe a nota fiscal',
    })
  })

  it('nota já gravada na manutenção dispensa outra; mais de 3 fotos é recusado', () => {
    expect(validarConclusao(validos({ notas: [] }), { ...ctx, temNotaGravada: true }).erros).toEqual({})
    const foto = new File(['f'], 'f.jpg', { type: 'image/jpeg' })
    expect(validarConclusao(validos({ fotos: [foto, foto, foto, foto] }), ctx).erros).toEqual({ fotos: 'No máximo 3 fotos' })
  })

  it('km menor que o do pedido avisa, sem bloquear', () => {
    const r = validarConclusao(validos({ km: '84000' }), ctx)
    expect(r.aviso).toBe('O km informado (84.000) é menor que o km do pedido (85.000). Confira antes de concluir.')
    expect(r.pedido).not.toBeNull()
  })

  it('valores iniciais vêm do que a manutenção já tem; a data é agora em São Paulo', () => {
    const v = valoresConclusaoIniciais(detalhe({ servicos: [100000007], valor: 200, pagamento: 202410002, estabelecimento: 'Oficina', realizadoPor: { id: 'f2', label: 'Bruno' } }), new Date('2026-11-17T13:05:00Z'))
    expect(v).toMatchObject({ servicos: [100000007], km: '', data: '2026-11-17T10:05', valor: '200', pagamento: '202410002', estabelecimento: 'Oficina', realizadoPorId: 'f2', cidadeId: '', notas: [], fotos: [] })
    expect(agoraLocalSP(new Date('2026-11-18T02:30:00Z'))).toBe('2026-11-17T23:30')
  })
})

describe('concluirPeloShell', () => {
  const pedido = validarConclusao(validos(), ctx).pedido!
  const alvo = { id: 'm1', codigo: 'MAN-1', veiculo: { id: 'v1', label: 'ABC1D23' } }
  const foto = (n: number) => new File(['f'], `f${n}.jpg`, { type: 'image/jpeg' })
  function fonte(statusAnexo: number) {
    return {
      enviarArquivoManutencao: vi.fn(async (_alvo: unknown, arquivo: File, origem: string, ordem: number) => ({ link: `https://x.invalid/${origem}/${ordem}/${arquivo.name}`, nomeArquivo: arquivo.name, caminho: 'p' })),
      concluirManutencao: vi.fn(async () => ({ despesaId: 'd1', statusAnexo, geralId: 'g1' })),
      anexarNotaFiscalDespesa: vi.fn(async () => {}),
    }
  }

  it('sobe notas e fotos antes da Custom API, junta os links e anexa a nota na despesa pendente', async () => {
    const source = fonte(ANEXO_DESPESA.PENDENTE)
    const nota2 = new File(['nf2'], 'nf2.jpg', { type: 'image/jpeg' })
    const r = await concluirPeloShell(source, alvo, pedido, { notas: [nota, nota2], fotos: [foto(1), foto(2)] })
    expect(source.enviarArquivoManutencao.mock.calls.map((c) => [c[2], c[3]])).toEqual([['NOTA_FISCAL', 1], ['NOTA_FISCAL', 2], ['POS_MANUTENCAO', 1], ['POS_MANUTENCAO', 2]])
    expect(source.concluirManutencao).toHaveBeenCalledWith({ ...pedido, linkNotaFiscal: 'https://x.invalid/NOTA_FISCAL/1/nf.jpg\nhttps://x.invalid/NOTA_FISCAL/2/nf2.jpg', linkFotoFinal1: 'https://x.invalid/POS_MANUTENCAO/1/f1.jpg', linkFotoFinal2: 'https://x.invalid/POS_MANUTENCAO/2/f2.jpg', linkFotoFinal3: null })
    expect(Math.max(...source.enviarArquivoManutencao.mock.invocationCallOrder)).toBeLessThan(source.concluirManutencao.mock.invocationCallOrder[0])
    expect(source.anexarNotaFiscalDespesa).toHaveBeenCalledWith('d1', [nota, nota2], 'f1')
    expect(r).toEqual({ resposta: { despesaId: 'd1', statusAnexo: ANEXO_DESPESA.PENDENTE, geralId: 'g1' }, avisoNota: null })
  })

  it('despesa que já tem o comprovante não recebe a nota de novo', async () => {
    const source = fonte(ANEXO_DESPESA.ENVIADO)
    expect((await concluirPeloShell(source, alvo, pedido, { notas: [nota], fotos: [] })).avisoNota).toBeNull()
    expect(source.anexarNotaFiscalDespesa).not.toHaveBeenCalled()
  })

  it('falha no envio de arquivo não chega à Custom API', async () => {
    const source = fonte(ANEXO_DESPESA.PENDENTE)
    source.enviarArquivoManutencao.mockRejectedValueOnce(new Error('O envio do arquivo falhou (HTTP 500)'))
    await expect(concluirPeloShell(source, alvo, pedido, { notas: [nota], fotos: [] })).rejects.toThrow('O envio do arquivo falhou (HTTP 500)')
    expect(source.concluirManutencao).not.toHaveBeenCalled()
  })

  it('falha ao anexar a nota na despesa vira aviso, sem desfazer a conclusão', async () => {
    const source = fonte(ANEXO_DESPESA.PENDENTE)
    source.anexarNotaFiscalDespesa.mockRejectedValueOnce(new Error('Sem privilégio'))
    const r = await concluirPeloShell(source, alvo, pedido, { notas: [nota], fotos: [] })
    expect(r.resposta.despesaId).toBe('d1')
    expect(r.avisoNota).toBe('A manutenção foi concluída, mas a nota fiscal não subiu na despesa (Sem privilégio). Anexe a nota na tela Despesas.')
  })

  it('despesa pendente sem nota nova (a nota já estava gravada) avisa para anexar em Despesas', async () => {
    const source = fonte(ANEXO_DESPESA.PENDENTE)
    const r = await concluirPeloShell(source, alvo, pedido, { notas: [], fotos: [] })
    expect(source.concluirManutencao).toHaveBeenCalledWith(expect.objectContaining({ linkNotaFiscal: null }))
    expect(r.avisoNota).toBe('A manutenção foi concluída, mas a despesa ficou sem a nota fiscal. Anexe a nota na tela Despesas.')
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/conclusao.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 2: Implementação**

```ts
// apps/shell/src/pages/frota/domain/conclusao.ts
import { ANEXO_DESPESA, LIMITE, PAGAMENTO } from '../data/schema'
import type { AlvoArquivo, ArquivoEnviado, ArquivosManutencao, ComandosManutencao, OrigemArquivo, PedidoConclusao, RespostaConclusao } from '../data/source'
import type { DetalheManutencao } from '../data/types'
import { errorMessage } from '../data/xrm'

/** Campos da conclusão: os mesmos do App (serviços do catálogo, km, data, valor, pagamento, estabelecimento, cidade, quem realizou, comentário, nota e fotos). */
export type ValoresConclusao = { servicos: number[]; km: string; data: string; valor: string; pagamento: string; estabelecimento: string; cidadeId: string; realizadoPorId: string; servicoRealizado: string; comentario: string; notas: File[]; fotos: File[] }
export type ErrosConclusao = Partial<Record<keyof ValoresConclusao, string>>
/** O pedido do cr40f_ManutencaoConcluir antes do envio dos arquivos (os links entram depois). */
export type BaseConclusao = Omit<PedidoConclusao, 'linkNotaFiscal' | 'linkFotoFinal1' | 'linkFotoFinal2' | 'linkFotoFinal3'>
export type ContextoConclusao = { manutencaoId: string; kmPedido: number | null; temNotaGravada: boolean }
export type LeituraConclusao = { erros: ErrosConclusao; aviso: string | null; pedido: BaseConclusao | null }

export const MAX_FOTOS_FINAIS = 3
const PAGAMENTOS: number[] = Object.values(PAGAMENTO)
const DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

const formatoSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** Agora em São Paulo no formato do campo datetime-local (YYYY-MM-DDTHH:mm). */
export function agoraLocalSP(agora = new Date()) {
  const p = Object.fromEntries(formatoSP.formatToParts(agora).map((parte) => [parte.type, parte.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

export function valoresConclusaoIniciais(m: DetalheManutencao, agora = new Date()): ValoresConclusao {
  return {
    servicos: [...m.servicos],
    km: m.kmRealizado !== null ? String(m.kmRealizado) : '',
    data: agoraLocalSP(agora),
    valor: m.valor !== null ? String(m.valor) : '',
    pagamento: m.pagamento !== null ? String(m.pagamento) : '',
    estabelecimento: m.estabelecimento ?? '',
    cidadeId: '',
    realizadoPorId: m.realizadoPor?.id ?? '',
    servicoRealizado: m.servicoRealizado ?? '',
    comentario: m.comentarioColaborador ?? '',
    notas: [],
    fotos: [],
  }
}

const numeroBR = (n: number) => n.toLocaleString('pt-BR')

/** Mesmas exigências do Ciclo.ValidarConclusao (servidor), com o km menor que o do pedido só como aviso (spec). */
export function validarConclusao(v: ValoresConclusao, ctx: ContextoConclusao): LeituraConclusao {
  const erros: ErrosConclusao = {}
  if (v.servicos.length === 0) erros.servicos = 'Escolha pelo menos um serviço realizado'
  const km = /^\d+$/.test(v.km.trim()) ? Number(v.km.trim()) : Number.NaN
  if (!(km > 0)) erros.km = 'Informe o km do veículo (número inteiro)'
  const data = DATA_HORA.test(v.data) && !Number.isNaN(new Date(`${v.data}:00-03:00`).getTime()) ? `${v.data}:00-03:00` : null
  if (!data) erros.data = 'Informe a data e a hora'
  const valor = Number(v.valor.trim().replace(',', '.'))
  if (!v.valor.trim() || !Number.isFinite(valor) || valor <= 0) erros.valor = 'Informe o valor pago'
  const pagamento = Number(v.pagamento)
  if (!PAGAMENTOS.includes(pagamento)) erros.pagamento = 'Escolha a forma de pagamento'
  const estabelecimento = v.estabelecimento.trim()
  if (!estabelecimento) erros.estabelecimento = 'Informe o estabelecimento'
  else if (estabelecimento.length > LIMITE.estabelecimento) erros.estabelecimento = `Máximo de ${LIMITE.estabelecimento} caracteres`
  if (!v.cidadeId) erros.cidadeId = 'Escolha a cidade'
  if (!v.realizadoPorId) erros.realizadoPorId = 'Escolha quem realizou'
  const servicoRealizado = v.servicoRealizado.trim()
  if (servicoRealizado.length > LIMITE.servicoRealizado) erros.servicoRealizado = `Máximo de ${LIMITE.servicoRealizado} caracteres`
  const comentario = v.comentario.trim()
  if (comentario.length > LIMITE.comentarioColaborador) erros.comentario = `Máximo de ${LIMITE.comentarioColaborador} caracteres`
  if (!ctx.temNotaGravada && v.notas.length === 0) erros.notas = 'Anexe a nota fiscal'
  if (v.fotos.length > MAX_FOTOS_FINAIS) erros.fotos = `No máximo ${MAX_FOTOS_FINAIS} fotos`
  const aviso = km > 0 && ctx.kmPedido !== null && km < ctx.kmPedido ? `O km informado (${numeroBR(km)}) é menor que o km do pedido (${numeroBR(ctx.kmPedido)}). Confira antes de concluir.` : null
  if (Object.keys(erros).length || !data) return { erros, aviso, pedido: null }
  return {
    erros, aviso,
    pedido: { manutencaoId: ctx.manutencaoId, servicos: [...new Set(v.servicos)], km, data, valor: Math.round(valor * 100) / 100, pagamento, estabelecimento, cidadeId: v.cidadeId, realizadoPorId: v.realizadoPorId, servicoRealizado: servicoRealizado || null, comentario: comentario || null },
  }
}

type FonteConclusao = Pick<ComandosManutencao, 'concluirManutencao'> & Pick<ArquivosManutencao, 'enviarArquivoManutencao' | 'anexarNotaFiscalDespesa'>

/** Um arquivo por vez: menos chamadas simultâneas ao flow e a ordem dos links é a da escolha. */
async function enviarTodos(source: FonteConclusao, alvo: AlvoArquivo, arquivos: File[], origem: OrigemArquivo) {
  const enviados: ArquivoEnviado[] = []
  for (const [indice, arquivo] of arquivos.entries()) enviados.push(await source.enviarArquivoManutencao(alvo, arquivo, origem, indice + 1))
  return enviados
}

/**
 * Concluir pelo shell, no mesmo caminho do App: sobe a nota e as fotos finais na pasta da manutenção, chama o
 * cr40f_ManutencaoConcluir e, se a despesa ainda espera o comprovante, sobe a nota nela. Falha antes da Custom API não
 * conclui nada. Falha depois (só na nota da despesa) não desfaz a conclusão e volta como aviso.
 */
export async function concluirPeloShell(source: FonteConclusao, alvo: AlvoArquivo, pedido: BaseConclusao, arquivos: { notas: File[]; fotos: File[] }): Promise<{ resposta: RespostaConclusao; avisoNota: string | null }> {
  const notas = await enviarTodos(source, alvo, arquivos.notas, 'NOTA_FISCAL')
  const fotos = await enviarTodos(source, alvo, arquivos.fotos.slice(0, MAX_FOTOS_FINAIS), 'POS_MANUTENCAO')
  const resposta = await source.concluirManutencao({
    ...pedido,
    linkNotaFiscal: notas.length ? notas.map((n) => n.link).join('\n') : null,
    linkFotoFinal1: fotos[0]?.link ?? null,
    linkFotoFinal2: fotos[1]?.link ?? null,
    linkFotoFinal3: fotos[2]?.link ?? null,
  })
  if (resposta.statusAnexo !== ANEXO_DESPESA.PENDENTE) return { resposta, avisoNota: null }
  if (!arquivos.notas.length) return { resposta, avisoNota: 'A manutenção foi concluída, mas a despesa ficou sem a nota fiscal. Anexe a nota na tela Despesas.' }
  try {
    await source.anexarNotaFiscalDespesa(resposta.despesaId, arquivos.notas, pedido.realizadoPorId)
    return { resposta, avisoNota: null }
  } catch (reason) {
    return { resposta, avisoNota: `A manutenção foi concluída, mas a nota fiscal não subiu na despesa (${errorMessage(reason)}). Anexe a nota na tela Despesas.` }
  }
}
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/conclusao.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/shell/src/pages/frota/domain/conclusao.ts apps/shell/src/pages/frota/domain/conclusao.test.ts
git commit -m "feat(frota): validação e envio da conclusão pelo shell no caminho do App

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 15: Peças de formulário: `GradeServicos`, `JanelaCampos` e `useOpcoesBusca`

**Files:**
- Create: `apps/shell/src/pages/frota/components/GradeServicos.tsx`
- Modify: `apps/shell/src/pages/frota/components/ClassificacaoManutencao.tsx` (usa a grade)
- Create: `apps/shell/src/pages/frota/components/JanelaCampos.tsx`
- Create: `apps/shell/src/pages/frota/components/useOpcoesBusca.ts`
- Modify: `apps/shell/src/pages/frota/frota.css`
- Test: `apps/shell/src/pages/frota/components/CamposManutencao.test.tsx`

**Interfaces:**
- Consumes: `semanasAPartirDe`, `semanaDe`, `rotuloJanela`, `ValoresJanela` e `ErrosJanela` (Tarefa 6); `LIMITE` (Tarefa 4); `useLookupSearch` (Geral).
- Produces:
  - `GradeServicos({ selecionados, onChange, disabled?, erro? })`;
  - `JanelaCampos({ valores, erros, hoje, disabled?, onChange })`;
  - `useOpcoesBusca(buscar, escolhida) -> { opcoes, lista, carregando, onSearch }`.

- [ ] **Step 1: Testes que falham**

```tsx
// apps/shell/src/pages/frota/components/CamposManutencao.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ValoresJanela } from '../domain/janela'
import { GradeServicos } from './GradeServicos'
import { JanelaCampos } from './JanelaCampos'

afterEach(cleanup)

describe('GradeServicos', () => {
  it('marca e desmarca serviços do catálogo e mostra o erro do grupo', () => {
    const onChange = vi.fn()
    render(<GradeServicos selecionados={[100000007]} onChange={onChange} erro="Escolha pelo menos um serviço realizado" />)
    expect((screen.getByRole('checkbox', { name: 'Pastilhas de freio' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Discos de freio' }))
    expect(onChange).toHaveBeenLastCalledWith([100000007, 100000008])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pastilhas de freio' }))
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(screen.getByRole('alert').textContent).toBe('Escolha pelo menos um serviço realizado')
  })
})

describe('JanelaCampos', () => {
  function Controlado({ inicial }: { inicial: ValoresJanela }) {
    const [valores, setValores] = useState(inicial)
    return (
      <>
        <JanelaCampos valores={valores} erros={{}} hoje="2026-11-18" onChange={setValores} />
        <output data-testid="valores">{JSON.stringify(valores)}</output>
      </>
    )
  }
  const lidos = () => JSON.parse(screen.getByTestId('valores').textContent ?? '{}') as ValoresJanela

  it('começa em Semana (seletor de semanas) e troca para Dia (campo de data)', () => {
    render(<Controlado inicial={{ modo: 'semana', dia: '2026-11-18', semana: '2026-11-16', comentario: '' }} />)
    expect(screen.getByRole('combobox', { name: /Semana/ })).toBeTruthy()
    expect(document.querySelector('input[type="date"]')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Dia' }))
    expect(lidos().modo).toBe('dia')
    const data = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(data, { target: { value: '2026-11-20' } })
    expect(lidos().dia).toBe('2026-11-20')
  })

  it('guarda o comentário ao motorista', () => {
    render(<Controlado inicial={{ modo: 'dia', dia: '2026-11-18', semana: '2026-11-16', comentario: '' }} />)
    fireEvent.change(screen.getByLabelText(/Comentário ao motorista/), { target: { value: 'Levar cedo' } })
    expect(lidos().comentario).toBe('Levar cedo')
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/components/CamposManutencao.test.tsx`
Expected: FAIL (componentes não existem).

- [ ] **Step 2: `GradeServicos` e uso na classificação**

```tsx
// apps/shell/src/pages/frota/components/GradeServicos.tsx
import { Checkbox } from '@betinhos/ui'
import { CATEGORIAS_MANUT, SERVICOS_MANUT } from '../domain/manutencaoCatalogo'

const GRUPOS = CATEGORIAS_MANUT.map((categoria) => ({ ...categoria, servicos: SERVICOS_MANUT.filter((servico) => servico.categoria === categoria.value) }))

/** Serviços do catálogo agrupados por categoria (manutencaoCatalogo.json, o mesmo do App e do plugin). */
export function GradeServicos({ selecionados, onChange, disabled = false, erro }: { selecionados: number[]; onChange: (servicos: number[]) => void; disabled?: boolean; erro?: string }) {
  const alternar = (value: number) => onChange(selecionados.includes(value) ? selecionados.filter((v) => v !== value) : [...selecionados, value])
  return (
    <div className="frota-stack">
      <div className="frota-classif__grade">
        {GRUPOS.map((grupo) => (
          <fieldset key={grupo.value} className="frota-classif__cat">
            <legend>{grupo.label}</legend>
            {grupo.servicos.map((servico) => (
              <Checkbox key={servico.value} label={servico.label} checked={selecionados.includes(servico.value)} onChange={() => alternar(servico.value)} disabled={disabled} />
            ))}
          </fieldset>
        ))}
      </div>
      {erro ? <p className="frota-erro" role="alert">{erro}</p> : null}
    </div>
  )
}
```

Em `ClassificacaoManutencao.tsx`:
- troque o `import { Button, Checkbox, StatusBadge } from '@betinhos/ui'` por `import { Button, StatusBadge } from '@betinhos/ui'`;
- acrescente `import { GradeServicos } from './GradeServicos'`;
- apague a função `alternar`;
- no bloco `if (editando)`, troque o `<div className="frota-classif__grade">...</div>` inteiro por:

```tsx
        <GradeServicos selecionados={selecionados} onChange={setSelecionados} disabled={salvando} />
```

A constante `grupos` continua, porque a leitura (`porCategoria`) usa.

- [ ] **Step 3: `JanelaCampos`**

```tsx
// apps/shell/src/pages/frota/components/JanelaCampos.tsx
import { Field, Input, SegmentedControl, Select, Textarea } from '@betinhos/ui'
import { LIMITE } from '../data/schema'
import { rotuloJanela, semanaDe, semanasAPartirDe, type ErrosJanela, type ModoJanela, type ValoresJanela } from '../domain/janela'

const SEMANAS_OFERECIDAS = 8

type Props = { valores: ValoresJanela; erros: ErrosJanela; hoje: string; disabled?: boolean; onChange: (valores: ValoresJanela) => void }

/** Encaixe num dia ou numa semana de segunda a domingo, com o comentário ao motorista (vai para a programação na Geral). */
export function JanelaCampos({ valores, erros, hoje, disabled = false, onChange }: Props) {
  const set = (patch: Partial<ValoresJanela>) => onChange({ ...valores, ...patch })
  const semanas = semanasAPartirDe(hoje, SEMANAS_OFERECIDAS)
  // A semana já gravada (reagendar) aparece mesmo fora das próximas oito.
  const lista = valores.semana && !semanas.some((s) => s.inicio === valores.semana) ? [semanaDe(valores.semana), ...semanas] : semanas
  const opcoes = lista.map((s) => ({ value: s.inicio, label: rotuloJanela(s) }))
  return (
    <div className="frota-fields">
      <div className="frota-fields__wide">
        <SegmentedControl<ModoJanela> aria-label="Encaixar em" value={valores.modo} onChange={(modo) => set({ modo })}
          options={[{ value: 'dia', label: 'Dia', disabled }, { value: 'semana', label: 'Semana (seg–dom)', disabled }]} />
      </div>
      {valores.modo === 'dia' ? (
        <Field label="Dia" required error={erros.dia} disabled={disabled}>
          <Input type="date" min={hoje} value={valores.dia} onChange={(event) => set({ dia: event.target.value })} />
        </Field>
      ) : (
        <Field label="Semana" required error={erros.semana} disabled={disabled}>
          <Select options={opcoes} searchable={false} clearable={false} placeholder="Escolha a semana" value={valores.semana || null} onChange={(semana) => set({ semana: semana ?? '' })} />
        </Field>
      )}
      <Field className="frota-fields__wide" label="Comentário ao motorista" hint="Vai para a programação na Geral; o motorista vê quando a manutenção for programada com o nome dele." error={erros.comentario} disabled={disabled}>
        <Textarea rows={2} maxLength={LIMITE.comentarioAoMotorista} value={valores.comentario} onChange={(event) => set({ comentario: event.target.value })} />
      </Field>
    </div>
  )
}
```

- [ ] **Step 4: `useOpcoesBusca`**

```ts
// apps/shell/src/pages/frota/components/useOpcoesBusca.ts
import { useEffect, useState } from 'react'
import { useLookupSearch } from '../../geral/components/useLookupSearch'
import type { OpcaoBusca } from '../data/source'

/**
 * Opções de uma busca no servidor (funcionário, cidade) para o Select do DS: lista inicial ao abrir, refinada ao
 * digitar (useLookupSearch da Geral, com pausa e descarte de resposta velha). A escolhida fica sempre na lista.
 * `buscar` precisa ser estável (useCallback).
 */
export function useOpcoesBusca(buscar: (texto: string) => Promise<OpcaoBusca[]>, escolhida: OpcaoBusca | null) {
  const busca = useLookupSearch(buscar)
  const [iniciais, setIniciais] = useState<OpcaoBusca[]>([])
  useEffect(() => {
    let vivo = true
    buscar('').then((lista) => { if (vivo) setIniciais(lista) }, () => undefined)
    return () => { vivo = false }
  }, [buscar])
  const encontradas = busca.found ?? iniciais
  const lista = escolhida && !encontradas.some((o) => o.id === escolhida.id) ? [escolhida, ...encontradas] : encontradas
  return { opcoes: lista.map((o) => ({ value: o.id, label: o.nome })), lista, carregando: busca.searching, onSearch: busca.onSearch }
}
```

- [ ] **Step 5: CSS**

No fim de `frota.css`:

```css
/* Manutenções v2: erro de um grupo de campos, rótulo de grupo e links das fotos na gaveta */
.frota-erro { margin: 0; font-size: var(--bt-font-size-12); color: var(--bt-color-danger); }
.frota-campo__rotulo { font-size: var(--bt-font-size-13); font-weight: var(--bt-font-weight-bold); color: var(--bt-color-text-primary); }
.frota-fotos { margin: 0; font-size: var(--bt-font-size-13); }
.frota-fotos .frota-link { display: inline-flex; align-items: center; gap: var(--bt-space-1); }
```

- [ ] **Step 6: Rodar (Betinhos-Renan)**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/components && pnpm --filter @betinhos/shell typecheck`
Expected: PASS (inclusive os testes de classificação do `RegistroDrawer.test.tsx`, que passam pela grade nova) e typecheck sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/shell/src/pages/frota
git commit -m "feat(frota): grade de serviços, campos de janela e busca de opções para as gavetas de manutenção

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 16: Formulário "Concluir" (`ConcluirManutencaoForm`)

**Files:**
- Create: `apps/shell/src/pages/frota/components/ConcluirManutencaoForm.tsx`
- Test: `apps/shell/src/pages/frota/components/ConcluirManutencaoForm.test.tsx`

**Interfaces:**
- Consumes: `validarConclusao`, `valoresConclusaoIniciais`, `concluirPeloShell` e `MAX_FOTOS_FINAIS` (Tarefa 14); `GradeServicos` e `useOpcoesBusca` (Tarefa 15); `executarAcaoManutencao` e `StaleError` (Tarefa 10).
- Produces: `ConcluirManutencaoForm({ source, detalhe, onConcluida(avisoNota), onVoltar, onDesatualizada })`; `ACCEPT_NOTA`.

- [ ] **Step 1: Testes que falham**

```tsx
// apps/shell/src/pages/frota/components/ConcluirManutencaoForm.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { createMockSource } from '../data/mock'
import { MANUT } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { escolher } from '../testUtils'
import { ConcluirManutencaoForm } from './ConcluirManutencaoForm'

afterEach(cleanup)

/** O mock responde depois de um setTimeout(0): deixa as listas iniciais de cidade e funcionário chegarem. */
const esperarMock = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

async function montar(id = 'm2') {
  const source = createMockSource()
  const detalhe = (await source.detalheManutencao(id)) as DetalheManutencao
  vi.spyOn(source, 'concluirManutencao')
  vi.spyOn(source, 'enviarArquivoManutencao')
  vi.spyOn(source, 'anexarNotaFiscalDespesa')
  const onConcluida = vi.fn()
  const onDesatualizada = vi.fn()
  render(<ToastProvider><ConcluirManutencaoForm source={source} detalhe={detalhe} onConcluida={onConcluida} onVoltar={() => {}} onDesatualizada={onDesatualizada} /></ToastProvider>)
  await esperarMock()
  return { source, onConcluida, onDesatualizada }
}

async function preencher(nota: File) {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Pastilhas de freio' }))
  fireEvent.change(screen.getByLabelText(/Km do veículo/), { target: { value: '51000' } })
  fireEvent.change(screen.getByLabelText(/Valor pago/), { target: { value: '350.5' } })
  escolher('Forma de pagamento', 'Dinheiro')
  fireEvent.change(screen.getByLabelText(/^Estabelecimento/), { target: { value: 'Oficina Teste' } })
  escolher('Cidade', 'São José dos Campos - SP')
  escolher('Quem realizou', 'Ana Souza (fictício)')
  const [entradaNota] = Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[]
  await act(async () => { fireEvent.change(entradaNota, { target: { files: [nota] } }) })
}

describe('ConcluirManutencaoForm', () => {
  it('não conclui sem os campos obrigatórios e mostra o que falta', async () => {
    const { source } = await montar()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Concluir manutenção' })) })
    expect(screen.getByText('Escolha pelo menos um serviço realizado')).toBeTruthy()
    expect(screen.getByText('Anexe a nota fiscal')).toBeTruthy()
    expect(screen.getByText('Informe o km do veículo (número inteiro)')).toBeTruthy()
    expect(source.concluirManutencao).not.toHaveBeenCalled()
  })

  it('avisa, sem bloquear, quando o km é menor que o do pedido', async () => {
    await montar()
    fireEvent.change(screen.getByLabelText(/Km do veículo/), { target: { value: '40000' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Concluir manutenção' })) })
    expect(screen.getByText(/O km informado \(40\.000\) é menor que o km do pedido \(50\.000\)/)).toBeTruthy()
  })

  it('conclui: sobe a nota, chama a Custom API com Dinheiro e anexa a nota na despesa', async () => {
    const { source, onConcluida } = await montar()
    const nota = new File(['nf'], 'nota.jpg', { type: 'image/jpeg' })
    await preencher(nota)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Concluir manutenção' })) })
    await waitFor(() => expect(onConcluida).toHaveBeenCalledWith(null))
    expect(source.enviarArquivoManutencao).toHaveBeenCalledWith(expect.objectContaining({ id: 'm2' }), nota, 'NOTA_FISCAL', 1)
    expect(source.concluirManutencao).toHaveBeenCalledWith(expect.objectContaining({
      manutencaoId: 'm2', servicos: [100000007], km: 51000, valor: 350.5, pagamento: 202410003, estabelecimento: 'Oficina Teste', cidadeId: 'c1', realizadoPorId: 'f1',
      linkNotaFiscal: expect.stringContaining('https://example.invalid/'),
    }))
    expect(source.anexarNotaFiscalDespesa).toHaveBeenCalledWith('d-m2', [nota], 'f1')
  })

  it('outra pessoa mudou a manutenção: não envia nada e pede recarga', async () => {
    const { source, onDesatualizada } = await montar()
    vi.spyOn(source, 'currentStatus').mockResolvedValue(MANUT.CANCELADO)
    await preencher(new File(['nf'], 'nota.jpg', { type: 'image/jpeg' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Concluir manutenção' })) })
    await waitFor(() => expect(onDesatualizada).toHaveBeenCalledTimes(1))
    expect(source.enviarArquivoManutencao).not.toHaveBeenCalled()
    expect(source.concluirManutencao).not.toHaveBeenCalled()
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/components/ConcluirManutencaoForm.test.tsx`
Expected: FAIL (componente não existe).

- [ ] **Step 2: Implementação**

```tsx
// apps/shell/src/pages/frota/components/ConcluirManutencaoForm.tsx
import { useCallback, useState } from 'react'
import { Alert, Button, Field, Input, Select, Textarea, Upload, type UploadFile } from '@betinhos/ui'
import { LIMITE, PAGAMENTO_MANUT } from '../data/schema'
import { FOTO_MAX_BYTES } from '../data/sharepoint'
import type { DataSource, OpcaoBusca } from '../data/source'
import type { DetalheManutencao } from '../data/types'
import { errorMessage } from '../data/xrm'
import { concluirPeloShell, MAX_FOTOS_FINAIS, validarConclusao, valoresConclusaoIniciais, type ErrosConclusao, type ValoresConclusao } from '../domain/conclusao'
import { executarAcaoManutencao, StaleError } from '../domain/transitions'
import { GradeServicos } from './GradeServicos'
import { useOpcoesBusca } from './useOpcoesBusca'

/** Nota fiscal: foto ou PDF (NF eletrônica). Fotos da manutenção: só imagem. */
export const ACCEPT_NOTA = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf'
const ACCEPT_FOTO = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'
const OPCOES_PAGAMENTO = PAGAMENTO_MANUT.map((opcao) => ({ value: String(opcao.value), label: opcao.label }))

type CampoTexto = 'km' | 'data' | 'valor' | 'estabelecimento' | 'servicoRealizado' | 'comentario'

type Props = {
  source: DataSource
  detalhe: DetalheManutencao
  /** Concluída. `avisoNota`: a nota não subiu na despesa (a conclusão vale assim mesmo). */
  onConcluida: (avisoNota: string | null) => void
  onVoltar: () => void
  /** Outra pessoa mudou a manutenção: a gaveta recarrega. */
  onDesatualizada: () => void
}

/** "Concluir" com os mesmos campos do App; grava pelo cr40f_ManutencaoConcluir (manutenção, despesa e linha da Geral). */
export function ConcluirManutencaoForm({ source, detalhe, onConcluida, onVoltar, onDesatualizada }: Props) {
  const [valores, setValores] = useState<ValoresConclusao>(() => valoresConclusaoIniciais(detalhe))
  const [erros, setErros] = useState<ErrosConclusao>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [cidade, setCidade] = useState<OpcaoBusca | null>(null)
  const [pessoa, setPessoa] = useState<OpcaoBusca | null>(detalhe.realizadoPor ? { id: detalhe.realizadoPor.id, nome: detalhe.realizadoPor.label } : null)
  const cidades = useOpcoesBusca(useCallback((texto: string) => source.buscarCidades(texto), [source]), cidade)
  const pessoas = useOpcoesBusca(useCallback((texto: string) => source.buscarFuncionarios(texto), [source]), pessoa)
  const set = (patch: Partial<ValoresConclusao>) => setValores((atual) => ({ ...atual, ...patch }))
  const texto = (campo: CampoTexto) => (event: { target: { value: string } }) => set({ [campo]: event.target.value })

  // O Upload devolve os mesmos objetos que recebeu, menos o removido: reconcilia por posição (como no RenovarDrawer).
  const notasUpload: UploadFile[] = valores.notas.map((f) => ({ name: f.name, size: f.size, type: f.type }))
  const fotosUpload: UploadFile[] = valores.fotos.map((f) => ({ name: f.name, size: f.size, type: f.type }))

  async function concluir() {
    if (salvando) return
    const leitura = validarConclusao(valores, { manutencaoId: detalhe.id, kmPedido: detalhe.km, temNotaGravada: Boolean(detalhe.linkNotaFiscal) })
    setErros(leitura.erros)
    setAviso(leitura.aviso)
    const pedido = leitura.pedido
    if (!pedido) return
    setSalvando(true)
    setFalha(null)
    try {
      const { avisoNota } = await executarAcaoManutencao(source, { id: detalhe.id, status: detalhe.status }, 'concluir', () => concluirPeloShell(source, detalhe, pedido, { notas: valores.notas, fotos: valores.fotos }))
      onConcluida(avisoNota)
    } catch (reason) {
      if (reason instanceof StaleError) onDesatualizada()
      else setFalha(errorMessage(reason))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="frota-stack" noValidate onSubmit={(event) => { event.preventDefault(); void concluir() }}>
      <strong>Concluir</strong>
      <p className="frota-muted">Os mesmos campos do App. Ao concluir, a despesa da manutenção é criada e a linha da Geral é concluída.</p>
      {falha ? <Alert tone="danger" title="Não foi possível concluir">{falha}. O que você preencheu foi mantido.</Alert> : null}
      {aviso ? <Alert tone="warning">{aviso}</Alert> : null}
      <div className="frota-fields">
        <div className="frota-fields__wide frota-stack">
          <span className="frota-campo__rotulo">Serviços realizados *</span>
          <GradeServicos selecionados={valores.servicos} onChange={(servicos) => set({ servicos })} disabled={salvando} erro={erros.servicos} />
        </div>
        <Field label="Km do veículo" required error={erros.km} disabled={salvando} hint={detalhe.km !== null ? `No pedido: ${detalhe.km.toLocaleString('pt-BR')} km` : undefined}>
          <Input type="number" inputMode="numeric" min={1} step={1} suffix="km" value={valores.km} onChange={texto('km')} />
        </Field>
        <Field label="Data e hora da manutenção" required error={erros.data} disabled={salvando}>
          <Input type="datetime-local" value={valores.data} onChange={texto('data')} />
        </Field>
        <Field label="Valor pago" required error={erros.valor} disabled={salvando}>
          <Input type="number" inputMode="decimal" min={0} step={0.01} prefix="R$" value={valores.valor} onChange={texto('valor')} />
        </Field>
        <Field label="Forma de pagamento" required error={erros.pagamento} disabled={salvando}>
          <Select options={OPCOES_PAGAMENTO} searchable={false} clearable={false} placeholder="Selecione" value={valores.pagamento || null} onChange={(v) => set({ pagamento: v ?? '' })} />
        </Field>
        <Field label="Estabelecimento" required error={erros.estabelecimento} disabled={salvando}>
          <Input maxLength={LIMITE.estabelecimento} value={valores.estabelecimento} onChange={texto('estabelecimento')} />
        </Field>
        <Field label="Cidade" required error={erros.cidadeId} disabled={salvando}>
          <Select options={cidades.opcoes} searchable clearable placeholder="Digite a cidade" loading={cidades.carregando} onSearchChange={cidades.onSearch} value={valores.cidadeId || null}
            onChange={(v) => { setCidade(cidades.lista.find((o) => o.id === v) ?? null); set({ cidadeId: v ?? '' }) }} />
        </Field>
        <Field label="Quem realizou" required error={erros.realizadoPorId} disabled={salvando}>
          <Select options={pessoas.opcoes} searchable clearable placeholder="Digite o nome" loading={pessoas.carregando} onSearchChange={pessoas.onSearch} value={valores.realizadoPorId || null}
            onChange={(v) => { setPessoa(pessoas.lista.find((o) => o.id === v) ?? null); set({ realizadoPorId: v ?? '' }) }} />
        </Field>
        <Field label="Serviço realizado (texto livre)" error={erros.servicoRealizado} disabled={salvando}>
          <Input maxLength={LIMITE.servicoRealizado} value={valores.servicoRealizado} onChange={texto('servicoRealizado')} />
        </Field>
        <Field className="frota-fields__wide" label="Comentário" error={erros.comentario} disabled={salvando}>
          <Textarea rows={3} maxLength={LIMITE.comentarioColaborador} value={valores.comentario} onChange={texto('comentario')} />
        </Field>
        <div className="frota-fields__wide frota-stack">
          <Upload
            label="Nota fiscal"
            hint={detalhe.linkNotaFiscal ? 'Já há nota gravada; anexe outra só para trocar. JPG, PNG ou PDF até 10 MB cada.' : 'Obrigatória. JPG, PNG ou PDF até 10 MB cada.'}
            accept={ACCEPT_NOTA}
            maxSize={FOTO_MAX_BYTES}
            files={notasUpload}
            disabled={salvando}
            onChange={(files, added) => set({ notas: [...valores.notas.filter((_, i) => files.includes(notasUpload[i])), ...added] })}
          />
          {erros.notas ? <p className="frota-erro" role="alert">{erros.notas}</p> : null}
        </div>
        <div className="frota-fields__wide frota-stack">
          <Upload
            label="Fotos da manutenção"
            hint={`Opcional, até ${MAX_FOTOS_FINAIS}. JPG ou PNG até 10 MB cada.`}
            accept={ACCEPT_FOTO}
            maxSize={FOTO_MAX_BYTES}
            maxFiles={MAX_FOTOS_FINAIS}
            files={fotosUpload}
            disabled={salvando}
            onChange={(files, added) => set({ fotos: [...valores.fotos.filter((_, i) => files.includes(fotosUpload[i])), ...added] })}
          />
          {erros.fotos ? <p className="frota-erro" role="alert">{erros.fotos}</p> : null}
        </div>
      </div>
      <div className="frota-cluster">
        <Button type="submit" loading={salvando}>Concluir manutenção</Button>
        <Button variant="secondary" disabled={salvando} onClick={onVoltar}>Voltar</Button>
      </div>
    </form>
  )
}
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/components/ConcluirManutencaoForm.test.tsx && pnpm --filter @betinhos/shell typecheck`
Expected: PASS e typecheck sem erros. Se o `Upload` do DS não expuser `input[type=file]` no jsdom, ajuste só o `preencher` do teste para o seletor real do componente (veja `DocumentosArquivos.test.tsx`); a regra da tela não muda.

- [ ] **Step 3: Commit**

```bash
git add apps/shell/src/pages/frota/components/ConcluirManutencaoForm.tsx apps/shell/src/pages/frota/components/ConcluirManutencaoForm.test.tsx
git commit -m "feat(frota): concluir a manutenção pelo shell com os campos do App

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 17: Gaveta única da manutenção (`GavetaManutencao`)

**Files:**
- Create: `apps/shell/src/pages/frota/components/GavetaManutencao.tsx`
- Test: `apps/shell/src/pages/frota/components/GavetaManutencao.test.tsx`

**Interfaces:**
- Consumes: `detalheManutencao`, `agendarManutencao`, `reprovarManutencao` e `cancelarManutencao` (Tarefa 13); `JanelaCampos` (Tarefa 15); `ConcluirManutencaoForm` (Tarefa 16); `ClassificacaoManutencao` (já existe); `acoesManutencao`, `rotuloAcao` e `executarAcaoManutencao` (Tarefa 10); `atrasada`, `lerJanela` e `valoresJanelaIniciais` (Tarefa 6).
- Produces: `GavetaManutencao({ source, id, hoje, onClose, onChanged, onClassificado?, onOpenVeiculo? })`, usada pela Frota (Tarefa 19) e pelo hospedeiro de gavetas (Tarefa 20).

- [ ] **Step 1: Testes que falham**

```tsx
// apps/shell/src/pages/frota/components/GavetaManutencao.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { todaySP } from '../data/dates'
import { createMockSource } from '../data/mock'
import { MANUT } from '../data/schema'
import type { DataSource } from '../data/source'
import { segundaDe, somarDias } from '../domain/janela'
import { GavetaManutencao } from './GavetaManutencao'

const hoje = todaySP()
afterEach(cleanup)

function montar(id: string, source: DataSource = createMockSource()) {
  const onChanged = vi.fn()
  const onClassificado = vi.fn()
  render(<ToastProvider><GavetaManutencao source={source} id={id} hoje={hoje} onClose={() => {}} onChanged={onChanged} onClassificado={onClassificado} /></ToastProvider>)
  return { source, onChanged, onClassificado }
}
const gaveta = (nome: string) => screen.findByRole('dialog', { name: nome })

describe('GavetaManutencao', () => {
  it('mostra o pedido, os links das fotos e as ações de uma solicitada', async () => {
    montar('m1')
    const g = await gaveta('Freio com ruído (fictício)')
    expect(within(g).getByText('Solicitado')).toBeTruthy()
    for (const nome of ['Encaixar', 'Reprovar', 'Cancelar manutenção', 'Concluir']) expect(within(g).getByRole('button', { name: nome })).toBeTruthy()
    expect(within(g).getByText('TST1A11')).toBeTruthy()
    expect(within(g).getAllByRole('link', { name: /Fotos do pedido, arquivo/ })).toHaveLength(2)
  })

  it('encaixa na semana de hoje (padrão) e passa a oferecer Reagendar', async () => {
    const source = createMockSource()
    const agendar = vi.spyOn(source, 'agendarManutencao')
    const { onChanged } = montar('m1', source)
    const g = await gaveta('Freio com ruído (fictício)')
    fireEvent.click(within(g).getByRole('button', { name: 'Encaixar' }))
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Confirmar' })) })
    const inicio = segundaDe(hoje)
    expect(agendar).toHaveBeenCalledWith({ manutencaoId: 'm1', inicio, fim: somarDias(inicio, 6), comentario: null })
    expect(await within(g).findByRole('button', { name: 'Reagendar' })).toBeTruthy()
    expect(within(g).getByText('Agendado')).toBeTruthy()
    expect(onChanged).toHaveBeenCalled()
  })

  it('encaixa num dia escolhido', async () => {
    const source = createMockSource()
    const agendar = vi.spyOn(source, 'agendarManutencao')
    montar('m1', source)
    const g = await gaveta('Freio com ruído (fictício)')
    fireEvent.click(within(g).getByRole('button', { name: 'Encaixar' }))
    fireEvent.click(within(g).getByRole('radio', { name: 'Dia' }))
    fireEvent.change(g.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: somarDias(hoje, 2) } })
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Confirmar' })) })
    expect(agendar).toHaveBeenCalledWith({ manutencaoId: 'm1', inicio: somarDias(hoje, 2), fim: somarDias(hoje, 2), comentario: null })
  })

  it('reprovar exige o motivo', async () => {
    const source = createMockSource()
    const reprovar = vi.spyOn(source, 'reprovarManutencao')
    montar('m1', source)
    const g = await gaveta('Freio com ruído (fictício)')
    fireEvent.click(within(g).getByRole('button', { name: 'Reprovar' }))
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Reprovar' })) })
    expect(within(g).getByText('Escreva o motivo da reprovação')).toBeTruthy()
    expect(reprovar).not.toHaveBeenCalled()
    fireEvent.change(within(g).getByLabelText(/Motivo da reprovação/), { target: { value: 'Sem verba' } })
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Reprovar' })) })
    expect(reprovar).toHaveBeenCalledWith('m1', 'Sem verba')
    expect(await within(g).findByText('Reprovado')).toBeTruthy()
  })

  it('programada com a janela vencida: selo Atrasada e Reagendar avisa que tira o motorista', async () => {
    montar('m3')
    const g = await gaveta('Manutenção fictícia m3')
    expect(within(g).getByText('Atrasada')).toBeTruthy()
    fireEvent.click(within(g).getByRole('button', { name: 'Reagendar' }))
    expect(within(g).getByText(/tira o motorista da programação/)).toBeTruthy()
  })

  it('outra pessoa mudou a manutenção: avisa, não grava e recarrega', async () => {
    const source = createMockSource()
    vi.spyOn(source, 'currentStatus').mockResolvedValue(MANUT.CANCELADO)
    const cancelar = vi.spyOn(source, 'cancelarManutencao')
    const { onChanged } = montar('m1', source)
    const g = await gaveta('Freio com ruído (fictício)')
    fireEvent.click(within(g).getByRole('button', { name: 'Cancelar manutenção' }))
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Cancelar manutenção' })) })
    expect(await screen.findByText(/alterado por outra pessoa/)).toBeTruthy()
    expect(cancelar).not.toHaveBeenCalled()
    expect(onChanged).toHaveBeenCalled()
  })

  it('mostra a classificação da IA e grava a correção manual', async () => {
    const source = createMockSource()
    const update = vi.spyOn(source, 'update')
    const { onClassificado } = montar('m1', source)
    const g = await gaveta('Freio com ruído (fictício)')
    expect(within(g).getByText('Classificado por IA · 93%')).toBeTruthy()
    fireEvent.click(within(g).getByRole('button', { name: 'Corrigir' }))
    fireEvent.click(within(g).getByRole('checkbox', { name: 'Discos de freio' }))
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Salvar correção' })) })
    expect(update).toHaveBeenCalledWith('manutencao', 'm1', { new_servicosmanutencao: '100000007,100000008', new_categoriasmanutencao: '100000001', new_classificacaoorigem: 100000001, new_confiancaia: null })
    await waitFor(() => expect(onClassificado).toHaveBeenCalledWith('m1', { servicos: [100000007, 100000008], categorias: [100000001], origem: 100000001, confianca: null }))
  })

  it('Concluir abre o formulário da conclusão', async () => {
    montar('m2')
    const g = await gaveta('Manutenção fictícia m2')
    fireEvent.click(within(g).getByRole('button', { name: 'Concluir' }))
    expect(within(g).getByRole('button', { name: 'Concluir manutenção' })).toBeTruthy()
  })

  it('manutenção que não existe mais avisa na própria gaveta', async () => {
    montar('nao-existe')
    expect(await gaveta('Manutenção não encontrada')).toBeTruthy()
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/components/GavetaManutencao.test.tsx`
Expected: FAIL (componente não existe).

- [ ] **Step 2: Implementação**

```tsx
// apps/shell/src/pages/frota/components/GavetaManutencao.tsx
import { ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, Drawer, EmptyState, Field, StatusBadge as Badge, Textarea } from '@betinhos/ui'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'
import { CarregandoRegistro } from '../../../app/BrandLoader'
import { diaSP, formatBR } from '../data/dates'
import { brl, NAO_INFORMADO } from '../data/format'
import { GRAU, LIMITE, MANUT, PAGAMENTO_MANUT, TIPO_REPARO, label } from '../data/schema'
import type { Classificacao, DataSource } from '../data/source'
import type { DetalheManutencao } from '../data/types'
import { errorMessage } from '../data/xrm'
import { atrasada, lerJanela, rotuloJanela, valoresJanelaIniciais, type ErrosJanela, type Janela, type ValoresJanela } from '../domain/janela'
import { acoesManutencao, executarAcaoManutencao, rotuloAcao, StaleError, type AcaoManutencao } from '../domain/transitions'
import { ClassificacaoManutencao } from './ClassificacaoManutencao'
import { ConcluirManutencaoForm } from './ConcluirManutencaoForm'
import { JanelaCampos } from './JanelaCampos'
import { useNotify } from './Toasts'
import { StatusBadge } from './Ui'

const texto = (valor: string | number | null | undefined) => (valor === null || valor === undefined || valor === '' ? NAO_INFORMADO : String(valor))
const dia = (iso: string | null) => formatBR(diaSP(iso)) || NAO_INFORMADO
const km = (valor: number | null) => (valor !== null ? `${valor.toLocaleString('pt-BR')} km` : NAO_INFORMADO)
const janelaDe = (m: DetalheManutencao): Janela | null => (m.janelaInicio && m.janelaFim ? { inicio: m.janelaInicio, fim: m.janelaFim } : null)
const linksDe = (valor: string | null) => (valor ?? '').split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l))

type Linha = [string, ReactNode]
type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'ok'; detalhe: DetalheManutencao | null }

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section className="frota-group" aria-labelledby={id}>
      <h3 id={id} className="frota-group__title">{titulo}</h3>
      {children}
    </section>
  )
}

function Linhas({ linhas }: { linhas: Linha[] }) {
  return <dl className="frota-detail">{linhas.map(([nome, valor]) => (<div key={nome} className="frota-detail__row"><dt>{nome}</dt><dd>{valor}</dd></div>))}</dl>
}

/** Fotos e nota como links do OneDrive (abrem em outra aba); ver D10 do plano 2. */
function Arquivos({ titulo, links }: { titulo: string; links: string[] }) {
  if (!links.length) return <p className="frota-muted">{titulo}: nenhum arquivo.</p>
  return (
    <p className="frota-cluster frota-fotos">
      <span className="frota-muted">{titulo}:</span>
      {links.map((link, i) => (
        <a key={link} className="frota-link" href={link} target="_blank" rel="noreferrer" aria-label={`${titulo}, arquivo ${i + 1} (abre em outra aba)`}>
          Arquivo {i + 1}<ExternalLink size={12} aria-hidden />
        </a>
      ))}
    </p>
  )
}

type FormProps = { source: DataSource; m: DetalheManutencao; onFeito: (mensagem: string) => void; onDesatualizada: () => void; onVoltar: () => void }

function EncaixeForm({ source, m, hoje, onFeito, onDesatualizada, onVoltar }: FormProps & { hoje: string }) {
  const [valores, setValores] = useState<ValoresJanela>(() => valoresJanelaIniciais(janelaDe(m), hoje, m.comentarioAoMotorista))
  const [erros, setErros] = useState<ErrosJanela>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const rotulo = rotuloAcao('encaixar', m.status)

  async function confirmar() {
    if (salvando) return
    const leitura = lerJanela(valores, hoje, LIMITE.comentarioAoMotorista)
    setErros(leitura.erros)
    const janela = leitura.janela
    if (!janela) return
    setSalvando(true)
    setFalha(null)
    try {
      await executarAcaoManutencao(source, { id: m.id, status: m.status }, 'encaixar', () => source.agendarManutencao({ manutencaoId: m.id, inicio: janela.inicio, fim: janela.fim, comentario: leitura.comentario }))
      onFeito(`Manutenção ${m.status === MANUT.SOLICITADO ? 'encaixada' : 'reagendada'}: ${rotuloJanela(janela)}.`)
    } catch (reason) {
      if (reason instanceof StaleError) onDesatualizada()
      else setFalha(errorMessage(reason))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="frota-stack" noValidate onSubmit={(event) => { event.preventDefault(); void confirmar() }}>
      <strong>{rotulo}</strong>
      {m.status === MANUT.PROGRAMADO ? <Alert tone="warning">Reagendar tira o motorista da programação na Geral; ele recebe o aviso de retirada.</Alert> : null}
      {falha ? <Alert tone="danger" title="Não foi possível gravar">{falha}</Alert> : null}
      <JanelaCampos valores={valores} erros={erros} hoje={hoje} disabled={salvando} onChange={setValores} />
      <div className="frota-cluster">
        <Button type="submit" loading={salvando}>Confirmar</Button>
        <Button variant="secondary" disabled={salvando} onClick={onVoltar}>Voltar</Button>
      </div>
    </form>
  )
}

function MotivoForm({ source, m, acao, onFeito, onDesatualizada, onVoltar }: FormProps & { acao: 'reprovar' | 'cancelar' }) {
  const [comentario, setComentario] = useState('')
  const [erro, setErro] = useState<string | undefined>()
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const reprovar = acao === 'reprovar'
  const rotulo = rotuloAcao(acao, m.status)

  async function confirmar() {
    if (salvando) return
    const motivo = comentario.trim()
    if (reprovar && !motivo) { setErro('Escreva o motivo da reprovação'); return }
    if (motivo.length > LIMITE.comentarioAprovador) { setErro(`Máximo de ${LIMITE.comentarioAprovador} caracteres`); return }
    setErro(undefined)
    setSalvando(true)
    setFalha(null)
    try {
      await executarAcaoManutencao(source, { id: m.id, status: m.status }, acao, () => (reprovar ? source.reprovarManutencao(m.id, motivo) : source.cancelarManutencao(m.id, motivo || null)))
      onFeito(reprovar ? 'Manutenção reprovada.' : 'Manutenção cancelada.')
    } catch (reason) {
      if (reason instanceof StaleError) onDesatualizada()
      else setFalha(errorMessage(reason))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="frota-stack" noValidate onSubmit={(event) => { event.preventDefault(); void confirmar() }}>
      <strong>{rotulo}</strong>
      <p className="frota-muted">{reprovar ? 'O pedido não será feito.' : 'A manutenção sai do ciclo.'} Se já houver linha na Geral, ela é cancelada.</p>
      {falha ? <Alert tone="danger" title="Não foi possível gravar">{falha}</Alert> : null}
      <Field label={reprovar ? 'Motivo da reprovação' : 'Motivo do cancelamento'} required={reprovar} error={erro} disabled={salvando}>
        <Textarea rows={2} maxLength={LIMITE.comentarioAprovador} value={comentario} onChange={(event) => setComentario(event.target.value)} />
      </Field>
      <div className="frota-cluster">
        <Button type="submit" variant="danger" loading={salvando}>{rotulo}</Button>
        <Button variant="secondary" disabled={salvando} onClick={onVoltar}>Voltar</Button>
      </div>
    </form>
  )
}

type Props = {
  source: DataSource
  id: string
  hoje: string
  onClose: () => void
  /** Depois de gravar (ação, classificação sem `onClassificado`, formulário nativo): quem abriu recarrega a lista. */
  onChanged: () => void
  onClassificado?: (id: string, classificacao: Classificacao) => void
  onOpenVeiculo?: (id: string) => void
}

/**
 * Gaveta única da manutenção (Frota e, no plano 3, Geral): pedido, encaixe, conclusão, classificação e histórico, e as
 * ações do ciclo novo pelas Custom APIs. Lê o detalhe no servidor ao abrir e de novo depois de cada gravação.
 */
export function GavetaManutencao({ source, id, hoje, onClose, onChanged, onClassificado, onOpenVeiculo }: Props) {
  const notify = useNotify()
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  const [acao, setAcao] = useState<AcaoManutencao | null>(null)
  const vivo = useRef(true)
  useEffect(() => {
    vivo.current = true
    return () => { vivo.current = false }
  }, [])

  const carregar = useCallback(async () => {
    try {
      const detalhe = await source.detalheManutencao(id)
      if (vivo.current) setEstado({ tipo: 'ok', detalhe })
    } catch (reason) {
      if (vivo.current) setEstado({ tipo: 'erro', mensagem: errorMessage(reason) })
    }
  }, [source, id])
  useEffect(() => { void carregar() }, [carregar])

  function gravado(mensagem: string) {
    notify('success', mensagem)
    setAcao(null)
    void carregar()
    onChanged()
  }

  function desatualizada() {
    notify('error', new StaleError().message)
    setAcao(null)
    void carregar()
    onChanged()
  }

  async function abrirFormulario() {
    try {
      await source.openForm('manutencao', id)
    } catch (reason) {
      notify('error', errorMessage(reason))
      return
    }
    void carregar()
    onChanged()
  }

  if (estado.tipo === 'carregando') return <CarregandoRegistro label="Carregando manutenção" onCancel={onClose} />
  if (estado.tipo === 'erro') {
    return (
      <Drawer open eyebrow="Manutenção" title="Não foi possível abrir" onClose={onClose}>
        <Alert tone="danger" title="Não foi possível abrir a manutenção" action={<Button variant="secondary" onClick={() => { setEstado({ tipo: 'carregando' }); void carregar() }}>Tentar de novo</Button>}>{estado.mensagem}</Alert>
      </Drawer>
    )
  }
  const m = estado.detalhe
  if (!m) {
    return (
      <Drawer open eyebrow="Manutenção" title="Manutenção não encontrada" onClose={onClose}>
        <EmptyState compact align="start" title="Esta manutenção não está mais disponível">Ela pode ter sido excluída ou desativada. Recarregue a lista.</EmptyState>
      </Drawer>
    )
  }

  const janela = janelaDe(m)
  const acoes = acoesManutencao(m.status)
  const veiculo = !m.veiculo ? NAO_INFORMADO
    : onOpenVeiculo ? <button type="button" className="frota-link" onClick={() => onOpenVeiculo(m.veiculo!.id)}>{m.veiculo.label || NAO_INFORMADO}</button>
    : m.veiculo.label || NAO_INFORMADO
  const encaixe: Linha[] = [
    ...(janela ? [['Janela', rotuloJanela(janela)] as Linha] : m.agendarPara ? [['Agendada para (antes das manutenções v2)', formatBR(m.agendarPara)] as Linha] : []),
    ['Comentário ao motorista', texto(m.comentarioAoMotorista)],
  ]

  let formulario: ReactNode = null
  if (acao === 'encaixar') formulario = <EncaixeForm source={source} m={m} hoje={hoje} onFeito={gravado} onDesatualizada={desatualizada} onVoltar={() => setAcao(null)} />
  else if (acao === 'reprovar' || acao === 'cancelar') formulario = <MotivoForm source={source} m={m} acao={acao} onFeito={gravado} onDesatualizada={desatualizada} onVoltar={() => setAcao(null)} />
  else if (acao === 'concluir') {
    formulario = (
      <ConcluirManutencaoForm source={source} detalhe={m} onVoltar={() => setAcao(null)} onDesatualizada={desatualizada}
        onConcluida={(avisoNota) => { gravado('Manutenção concluída. A despesa foi criada.'); if (avisoNota) notify('error', avisoNota) }} />
    )
  }

  return (
    <Drawer
      open
      size="wide"
      onClose={onClose}
      eyebrow={m.codigo ? `Manutenção ${m.codigo}` : 'Manutenção'}
      title={m.descricao || 'Manutenção'}
      actions={<BotaoAuditoria entity="cr40f_manutencoes" ids={[m.id]} name={m.descricao} />}
      footer={<>
        <span className="frota-muted">Edição completa no formulário do Dataverse.</span>
        <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => void abrirFormulario()}>Abrir formulário</Button>
      </>}
    >
      <div className="frota-drawer">
        <div className="frota-drawer__status frota-cluster">
          <StatusBadge kind="manutencao" value={m.status} />
          {atrasada(m, hoje) ? <Badge tone="danger">Atrasada</Badge> : null}
        </div>

        <Secao id={`${m.id}-acoes`} titulo="Ações">
          {formulario ?? (acoes.length === 0 ? <p className="frota-muted">Sem ações para esta manutenção.</p> : (
            <div className="frota-cluster">
              {acoes.map((a) => <Button key={a} variant={a === 'encaixar' ? 'primary' : 'secondary'} onClick={() => setAcao(a)}>{rotuloAcao(a, m.status)}</Button>)}
            </div>
          ))}
        </Secao>

        <Secao id={`${m.id}-pedido`} titulo="Pedido">
          <Linhas linhas={[
            ['Veículo', veiculo], ['Solicitante', texto(m.solicitante?.label)], ['Grau', label(GRAU, m.grau)], ['Tipo de reparo', label(TIPO_REPARO, m.tipo)],
            ['Km no pedido', km(m.km)], ['Descrição', texto(m.descricao)],
          ]} />
          <Arquivos titulo="Fotos do pedido" links={m.fotosPedido} />
        </Secao>

        {janela || m.agendarPara || m.comentarioAoMotorista ? (
          <Secao id={`${m.id}-encaixe`} titulo="Encaixe"><Linhas linhas={encaixe} /></Secao>
        ) : null}

        {m.status === MANUT.REALIZADO ? (
          <Secao id={`${m.id}-conclusao`} titulo="Conclusão">
            <Linhas linhas={[
              ['Km na realização', km(m.kmRealizado)], ['Valor', brl(m.valor)], ['Pagamento', label(PAGAMENTO_MANUT, m.pagamento)], ['Estabelecimento', texto(m.estabelecimento)],
              ['Quem realizou', texto(m.realizadoPor?.label)], ['Serviço realizado', texto(m.servicoRealizado)], ['Comentário', texto(m.comentarioColaborador)],
            ]} />
            <Arquivos titulo="Nota fiscal" links={linksDe(m.linkNotaFiscal)} />
            <Arquivos titulo="Fotos da manutenção" links={m.fotosFinais} />
          </Secao>
        ) : null}

        <Secao id={`${m.id}-classif`} titulo="Serviços e categorias">
          <ClassificacaoManutencao
            key={`${m.id}-${m.servicos.join(',')}-${m.origemClassificacao}`}
            source={source}
            item={m}
            onClassificado={(c) => {
              setEstado({ tipo: 'ok', detalhe: { ...m, servicos: c.servicos, categorias: c.categorias, origemClassificacao: c.origem, confiancaIa: c.confianca } })
              if (onClassificado) onClassificado(m.id, c)
              else onChanged()
            }}
          />
        </Secao>

        <Secao id={`${m.id}-historico`} titulo="Histórico">
          <Linhas linhas={[
            ['Solicitada em', dia(m.criadoEm)], ['Encaixada em', m.dataAprovacao ? formatBR(m.dataAprovacao) : NAO_INFORMADO],
            ['Realizada em', dia(m.dataManutencao)], ['Comentário do gestor', texto(m.comentarioAprovador)],
          ]} />
          <p className="frota-muted">As alterações uma a uma ficam na auditoria, no botão do alto da gaveta.</p>
        </Secao>
      </div>
    </Drawer>
  )
}
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/components/GavetaManutencao.test.tsx && pnpm --filter @betinhos/shell typecheck`
Expected: PASS e typecheck sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/shell/src/pages/frota/components/GavetaManutencao.tsx apps/shell/src/pages/frota/components/GavetaManutencao.test.tsx
git commit -m "feat(frota): gaveta única da manutenção com encaixe, reprovação, cancelamento e conclusão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Tarefa 18: "Nova manutenção" em gaveta própria

**Files:**
- Create: `apps/shell/src/pages/frota/domain/novaManutencao.ts`
- Test: `apps/shell/src/pages/frota/domain/novaManutencao.test.ts`
- Create: `apps/shell/src/pages/frota/components/NovaManutencaoDrawer.tsx`
- Test: `apps/shell/src/pages/frota/components/NovaManutencaoDrawer.test.tsx`

**Interfaces:**
- Consumes: `criarManutencao`, `agendarManutencao` e `buscarFuncionarios` (Tarefa 13); `JanelaCampos` e `useOpcoesBusca` (Tarefa 15); `lerJanela` e `valoresJanelaIniciais` (Tarefa 6).
- Produces:
  - `ValoresNova`, `ErrosNova`, `valoresNovaIniciais(hoje)` e `validarNova(v, hoje) -> { erros, input, encaixe }`;
  - `NovaManutencaoDrawer({ source, veiculos, hoje, onClose, onCriada(id) })`.

- [ ] **Step 1: Testes que falham (validação)**

```ts
// apps/shell/src/pages/frota/domain/novaManutencao.test.ts
import { describe, expect, it } from 'vitest'
import { validarNova, valoresNovaIniciais } from './novaManutencao'

const hoje = '2026-11-18'

describe('nova manutenção', () => {
  it('exige veículo, descrição, grau e km', () => {
    const r = validarNova(valoresNovaIniciais(hoje), hoje)
    expect(r.input).toBeNull()
    expect(r.erros).toEqual({ veiculoId: 'Escolha o veículo', descricao: 'Descreva o problema', grau: 'Escolha o grau', km: 'Informe o km atual (número inteiro)' })
  })

  it('monta a manutenção Solicitada; tipo e quem pediu são opcionais; sem encaixe', () => {
    const r = validarNova({ ...valoresNovaIniciais(hoje), veiculoId: 'v1', descricao: ' Freio rangendo ', grau: '3', km: '85000' }, hoje)
    expect(r).toEqual({ erros: {}, input: { veiculoId: 'v1', descricao: 'Freio rangendo', grau: 3, tipo: null, km: 85000, solicitanteId: null }, encaixe: null })
  })

  it('com "já encaixar", devolve a janela e o comentário; janela inválida bloqueia', () => {
    const base = { ...valoresNovaIniciais(hoje), veiculoId: 'v1', descricao: 'Freio', grau: '4', tipo: '2', km: '85000', solicitanteId: 'f1', encaixar: true }
    expect(validarNova({ ...base, janela: { modo: 'semana', dia: hoje, semana: '2026-11-23', comentario: 'Levar cedo' } }, hoje)).toEqual({
      erros: {}, input: { veiculoId: 'v1', descricao: 'Freio', grau: 4, tipo: 2, km: 85000, solicitanteId: 'f1' }, encaixe: { janela: { inicio: '2026-11-23', fim: '2026-11-29' }, comentario: 'Levar cedo' },
    })
    const ruim = validarNova({ ...base, janela: { modo: 'dia', dia: '2026-11-10', semana: '2026-11-16', comentario: '' } }, hoje)
    expect(ruim.input).toBeNull()
    expect(ruim.erros).toEqual({ janela: { dia: 'A janela não pode terminar antes de hoje' } })
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/novaManutencao.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 2: Validação**

```ts
// apps/shell/src/pages/frota/domain/novaManutencao.ts
import { LIMITE } from '../data/schema'
import type { NovaManutencao } from '../data/source'
import { lerJanela, valoresJanelaIniciais, type ErrosJanela, type Janela, type ValoresJanela } from './janela'

/** Mesmos campos obrigatórios do pedido no App (veículo, descrição, grau e km); o escritório pode já encaixar. */
export type ValoresNova = { veiculoId: string; descricao: string; grau: string; tipo: string; km: string; solicitanteId: string; encaixar: boolean; janela: ValoresJanela }
export type ErrosNova = Partial<Record<'veiculoId' | 'descricao' | 'grau' | 'km', string>> & { janela?: ErrosJanela }
export type LeituraNova = { erros: ErrosNova; input: NovaManutencao | null; encaixe: { janela: Janela; comentario: string | null } | null }

export const valoresNovaIniciais = (hoje: string): ValoresNova => ({ veiculoId: '', descricao: '', grau: '', tipo: '', km: '', solicitanteId: '', encaixar: false, janela: valoresJanelaIniciais(null, hoje, null) })

export function validarNova(v: ValoresNova, hoje: string): LeituraNova {
  const erros: ErrosNova = {}
  if (!v.veiculoId) erros.veiculoId = 'Escolha o veículo'
  const descricao = v.descricao.trim()
  if (!descricao) erros.descricao = 'Descreva o problema'
  else if (descricao.length > LIMITE.descricao) erros.descricao = `Máximo de ${LIMITE.descricao} caracteres`
  if (!v.grau) erros.grau = 'Escolha o grau'
  const km = /^\d+$/.test(v.km.trim()) ? Number(v.km.trim()) : Number.NaN
  if (!(km > 0)) erros.km = 'Informe o km atual (número inteiro)'
  let encaixe: LeituraNova['encaixe'] = null
  if (v.encaixar) {
    const lida = lerJanela(v.janela, hoje, LIMITE.comentarioAoMotorista)
    if (lida.janela) encaixe = { janela: lida.janela, comentario: lida.comentario }
    else erros.janela = lida.erros
  }
  if (Object.keys(erros).length) return { erros, input: null, encaixe: null }
  return { erros, input: { veiculoId: v.veiculoId, descricao, grau: Number(v.grau), tipo: v.tipo ? Number(v.tipo) : null, km, solicitanteId: v.solicitanteId || null }, encaixe }
}
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/domain/novaManutencao.test.ts`
Expected: PASS.

- [ ] **Step 3: Testes que falham (gaveta)**

```tsx
// apps/shell/src/pages/frota/components/NovaManutencaoDrawer.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { todaySP } from '../data/dates'
import { createMockSource } from '../data/mock'
import { segundaDe, somarDias } from '../domain/janela'
import { escolher } from '../testUtils'
import { NovaManutencaoDrawer } from './NovaManutencaoDrawer'

const hoje = todaySP()
afterEach(cleanup)

async function montar() {
  const source = createMockSource()
  const { data } = await source.load()
  vi.spyOn(source, 'criarManutencao')
  vi.spyOn(source, 'agendarManutencao')
  const onCriada = vi.fn()
  render(<ToastProvider><NovaManutencaoDrawer source={source} veiculos={data.veiculos} hoje={hoje} onClose={() => {}} onCriada={onCriada} /></ToastProvider>)
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  return { source, onCriada }
}

describe('NovaManutencaoDrawer', () => {
  it('não cria sem veículo, descrição, grau e km', async () => {
    const { source } = await montar()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar manutenção' })) })
    for (const erro of ['Escolha o veículo', 'Descreva o problema', 'Escolha o grau', 'Informe o km atual (número inteiro)']) expect(screen.getByText(erro)).toBeTruthy()
    expect(source.criarManutencao).not.toHaveBeenCalled()
  })

  it('veículo com hodômetro já preenche o km', async () => {
    await montar()
    escolher('Veículo', 'TST1A11 · Corolla')
    expect((screen.getByLabelText(/Km atual/) as HTMLInputElement).value).toBe('171000')
  })

  it('cria e já encaixa na semana de hoje', async () => {
    const { source, onCriada } = await montar()
    escolher('Veículo', 'TST2B22 · Virtus')
    fireEvent.change(screen.getByLabelText(/Descrição do problema/), { target: { value: 'Pneu furado' } })
    escolher('Grau', 'Alta')
    fireEvent.change(screen.getByLabelText(/Km atual/), { target: { value: '40000' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Já encaixar num dia ou numa semana' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar e encaixar' })) })
    await waitFor(() => expect(onCriada).toHaveBeenCalledTimes(1))
    expect(source.criarManutencao).toHaveBeenCalledWith({ veiculoId: 'v2', descricao: 'Pneu furado', grau: 3, tipo: null, km: 40000, solicitanteId: null })
    const id = onCriada.mock.calls[0][0] as string
    const inicio = segundaDe(hoje)
    expect(source.agendarManutencao).toHaveBeenCalledWith({ manutencaoId: id, inicio, fim: somarDias(inicio, 6), comentario: null })
  })

  it('encaixe que falha depois da criação avisa e abre a manutenção criada', async () => {
    const { source, onCriada } = await montar()
    vi.mocked(source.agendarManutencao).mockRejectedValueOnce(new Error('A manutenção não tem veículo.'))
    escolher('Veículo', 'TST2B22 · Virtus')
    fireEvent.change(screen.getByLabelText(/Descrição do problema/), { target: { value: 'Pneu furado' } })
    escolher('Grau', 'Alta')
    fireEvent.change(screen.getByLabelText(/Km atual/), { target: { value: '40000' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Já encaixar num dia ou numa semana' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar e encaixar' })) })
    await waitFor(() => expect(onCriada).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/A manutenção foi criada, mas o encaixe falhou/)).toBeTruthy()
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/components/NovaManutencaoDrawer.test.tsx`
Expected: FAIL (componente não existe).

- [ ] **Step 4: Gaveta**

```tsx
// apps/shell/src/pages/frota/components/NovaManutencaoDrawer.tsx
import { useCallback, useId, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Drawer, Field, Input, Select, Textarea } from '@betinhos/ui'
import { GRAU, LIMITE, TIPO_REPARO, VEICULO } from '../data/schema'
import type { DataSource, OpcaoBusca } from '../data/source'
import type { Veiculo } from '../data/types'
import { errorMessage } from '../data/xrm'
import { rotuloJanela } from '../domain/janela'
import { validarNova, valoresNovaIniciais, type ErrosNova, type ValoresNova } from '../domain/novaManutencao'
import { JanelaCampos } from './JanelaCampos'
import { useNotify } from './Toasts'
import { useOpcoesBusca } from './useOpcoesBusca'

const OPCOES_GRAU = GRAU.map((o) => ({ value: String(o.value), label: o.label }))
const OPCOES_TIPO = TIPO_REPARO.map((o) => ({ value: String(o.value), label: o.label }))

type Props = { source: DataSource; veiculos: Veiculo[]; hoje: string; onClose: () => void; onCriada: (id: string) => void }

/** "Nova manutenção" no lugar do formulário nativo: cria Solicitada e, se o gestor quiser, já encaixa. */
export function NovaManutencaoDrawer({ source, veiculos, hoje, onClose, onCriada }: Props) {
  const notify = useNotify()
  const formId = useId()
  const [valores, setValores] = useState<ValoresNova>(() => valoresNovaIniciais(hoje))
  const [erros, setErros] = useState<ErrosNova>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [solicitante, setSolicitante] = useState<OpcaoBusca | null>(null)
  const pessoas = useOpcoesBusca(useCallback((texto: string) => source.buscarFuncionarios(texto), [source]), solicitante)
  const opcoesVeiculos = useMemo(
    () => veiculos.filter((v) => v.status !== VEICULO.VENDIDO).sort((a, b) => a.placa.localeCompare(b.placa)).map((v) => ({ value: v.id, label: [v.placa, v.modelo].filter(Boolean).join(' · ') })),
    [veiculos],
  )
  const set = (patch: Partial<ValoresNova>) => setValores((atual) => ({ ...atual, ...patch }))

  function escolherVeiculo(id: string | null) {
    const veiculo = veiculos.find((v) => v.id === id)
    // Com hodômetro do Infleet, o km do pedido já vem preenchido (o gestor pode corrigir).
    setValores((atual) => ({ ...atual, veiculoId: id ?? '', ...(veiculo?.hodometro && !atual.km ? { km: String(Math.round(veiculo.hodometro)) } : {}) }))
  }

  async function criar() {
    if (salvando) return
    const leitura = validarNova(valores, hoje)
    setErros(leitura.erros)
    const input = leitura.input
    if (!input) return
    setSalvando(true)
    setFalha(null)
    let id: string
    try {
      id = await source.criarManutencao(input)
    } catch (reason) {
      setFalha(errorMessage(reason))
      setSalvando(false)
      return
    }
    if (leitura.encaixe) {
      try {
        await source.agendarManutencao({ manutencaoId: id, inicio: leitura.encaixe.janela.inicio, fim: leitura.encaixe.janela.fim, comentario: leitura.encaixe.comentario })
        notify('success', `Manutenção criada e encaixada: ${rotuloJanela(leitura.encaixe.janela)}.`)
      } catch (reason) {
        notify('error', `A manutenção foi criada, mas o encaixe falhou: ${errorMessage(reason)}. Encaixe pela gaveta dela.`)
      }
    } else notify('success', 'Manutenção criada. Ela está na fila A encaixar.')
    setSalvando(false)
    onCriada(id)
  }

  return (
    <Drawer
      open
      onClose={() => { if (!salvando) onClose() }}
      eyebrow="Manutenção"
      title="Nova manutenção"
      footer={<>
        <Button variant="secondary" disabled={salvando} onClick={onClose}>Cancelar</Button>
        <Button type="submit" form={formId} loading={salvando}>{valores.encaixar ? 'Criar e encaixar' : 'Criar manutenção'}</Button>
      </>}
    >
      <form id={formId} className="frota-stack" noValidate onSubmit={(event) => { event.preventDefault(); void criar() }}>
        {falha ? <Alert tone="danger" title="Não foi possível criar">{falha}. O que você preencheu foi mantido.</Alert> : null}
        <div className="frota-fields">
          <Field className="frota-fields__wide" label="Veículo" required error={erros.veiculoId} disabled={salvando}>
            <Select options={opcoesVeiculos} searchable clearable placeholder="Escolha o veículo" value={valores.veiculoId || null} onChange={escolherVeiculo} />
          </Field>
          <Field className="frota-fields__wide" label="Descrição do problema" required error={erros.descricao} disabled={salvando}>
            <Textarea rows={3} maxLength={LIMITE.descricao} value={valores.descricao} onChange={(event) => set({ descricao: event.target.value })} />
          </Field>
          <Field label="Grau" required error={erros.grau} disabled={salvando}>
            <Select options={OPCOES_GRAU} searchable={false} clearable={false} placeholder="Selecione" value={valores.grau || null} onChange={(v) => set({ grau: v ?? '' })} />
          </Field>
          <Field label="Tipo de reparo" disabled={salvando}>
            <Select options={OPCOES_TIPO} searchable={false} clearable placeholder="Opcional" value={valores.tipo || null} onChange={(v) => set({ tipo: v ?? '' })} />
          </Field>
          <Field label="Km atual" required error={erros.km} disabled={salvando}>
            <Input type="number" inputMode="numeric" min={1} step={1} suffix="km" value={valores.km} onChange={(event) => set({ km: event.target.value })} />
          </Field>
          <Field label="Quem pediu" disabled={salvando}>
            <Select options={pessoas.opcoes} searchable clearable placeholder="Opcional" loading={pessoas.carregando} onSearchChange={pessoas.onSearch} value={valores.solicitanteId || null}
              onChange={(v) => { setSolicitante(pessoas.lista.find((o) => o.id === v) ?? null); set({ solicitanteId: v ?? '' }) }} />
          </Field>
          <div className="frota-fields__wide">
            <Checkbox label="Já encaixar num dia ou numa semana" checked={valores.encaixar} disabled={salvando} onChange={() => set({ encaixar: !valores.encaixar })} />
          </div>
        </div>
        {valores.encaixar ? <JanelaCampos valores={valores.janela} erros={erros.janela ?? {}} hoje={hoje} disabled={salvando} onChange={(janela) => set({ janela })} /> : null}
      </form>
    </Drawer>
  )
}
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/components/NovaManutencaoDrawer.test.tsx src/pages/frota/domain/novaManutencao.test.ts && pnpm --filter @betinhos/shell typecheck`
Expected: PASS e typecheck sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/frota/domain/novaManutencao.ts apps/shell/src/pages/frota/domain/novaManutencao.test.ts apps/shell/src/pages/frota/components/NovaManutencaoDrawer.tsx apps/shell/src/pages/frota/components/NovaManutencaoDrawer.test.tsx
git commit -m "feat(frota): nova manutenção em gaveta própria, com encaixe opcional

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 19: Frota › Manutenções: fila "A encaixar", gaveta única e "Nova manutenção" na tela

**Files:**
- Create: `apps/shell/src/pages/frota/views/FilaEncaixe.tsx`
- Test: `apps/shell/src/pages/frota/views/FilaEncaixe.test.tsx`
- Modify: `apps/shell/src/pages/frota/FrotaPage.tsx` (+ `FrotaPage.test.tsx`)
- Modify: `apps/shell/src/pages/frota/views/Registros.tsx` (+ `Registros.test.tsx`)
- Modify: `apps/shell/src/pages/frota/components/RegistroDrawer.tsx` (+ `RegistroDrawer.test.tsx`)

**Interfaces:**
- Consumes: `filaEncaixe` e `diasEsperando` (Tarefa 7); `GavetaManutencao` (Tarefa 17); `NovaManutencaoDrawer` (Tarefa 18).
- Produces:
  - rota `#/frota-manutencoes` com a sub-aba `?sub=todas` (sem `sub` = "A encaixar") e `?novo=manutencao` (gaveta nova);
  - `?registro=manutencao:<id>` abre a `GavetaManutencao`;
  - `Registros` aceita `onNovo?: () => void`;
  - `RegistroDrawer` atende só `KindRegistro = Exclude<Kind, 'manutencao'>`.

- [ ] **Step 1: Testes que falham**

```tsx
// apps/shell/src/pages/frota/views/FilaEncaixe.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANUT } from '../data/schema'
import type { Manutencao } from '../data/types'
import { FilaEncaixe } from './FilaEncaixe'

const manut = (id: string, extra: Partial<Manutencao>): Manutencao => ({ id, codigo: id, descricao: id, status: MANUT.SOLICITADO, grau: 1, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: null, solicitante: null, criadoEm: '2026-11-10T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra })

afterEach(cleanup)

describe('FilaEncaixe', () => {
  it('lista as Solicitadas por grau e antiguidade, com veículo, grau e espera; o clique abre a manutenção', () => {
    const onOpen = vi.fn()
    render(<FilaEncaixe hoje="2026-11-18" onOpen={onOpen} onNovo={() => {}} manutencoes={[
      manut('baixa', { grau: 1, criadoEm: '2026-11-10T12:00:00Z' }),
      manut('urgente', { grau: 4, criadoEm: '2026-11-17T12:00:00Z', veiculo: { id: 'v1', label: 'ABC1D23' } }),
      manut('feita', { status: MANUT.REALIZADO }),
    ]} />)
    const itens = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(itens).toHaveLength(2)
    expect(itens[0]).toContain('urgente')
    expect(itens[0]).toContain('ABC1D23')
    expect(itens[0]).toContain('Urgente')
    expect(itens[0]).toContain('Há 1 dia')
    expect(itens[1]).toContain('Há 8 dias')
    fireEvent.click(screen.getByRole('button', { name: /urgente/ }))
    expect(onOpen).toHaveBeenCalledWith('urgente')
  })

  it('sem pedidos mostra o vazio; "Nova manutenção" chama a gaveta nova', () => {
    const onNovo = vi.fn()
    render(<FilaEncaixe hoje="2026-11-18" manutencoes={[]} onOpen={() => {}} onNovo={onNovo} />)
    expect(screen.getByText('Nenhuma manutenção esperando encaixe')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Nova manutenção' }))
    expect(onNovo).toHaveBeenCalledTimes(1)
  })
})
```

Em `Registros.test.tsx`, acrescente:

```tsx
  it('com onNovo, "Novo registro" abre a gaveta da tela e não o formulário nativo', () => {
    const onNovo = vi.fn()
    const nativo = { openForm: vi.fn(async () => {}) } as unknown as DataSource
    render(<Registros kinds={['manutencao']} data={data} source={nativo} onOpen={() => {}} onReload={() => {}} onNovo={onNovo} />)
    fireEvent.click(screen.getByRole('button', { name: /Novo/ }))
    expect(onNovo).toHaveBeenCalledTimes(1)
    expect(nativo.openForm).not.toHaveBeenCalled()
  })
```

Em `FrotaPage.test.tsx`, acrescente `import { createMockSource } from './data/mock'` e os testes:

```tsx
  it('Manutenções abre na fila A encaixar; a linha abre a gaveta única da manutenção', async () => {
    history.replaceState(null, '', '#/frota-manutencoes')
    renderFrota(createMockSource(), 'manutencoes')
    expect(await screen.findByRole('tab', { name: 'A encaixar (3)' })).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /Freio com ruído \(fictício\)/ }))
    const gaveta = await screen.findByRole('dialog', { name: 'Freio com ruído (fictício)' })
    expect(gaveta).toBeTruthy()
    expect(location.hash).toContain('registro=')
  })

  it('Todas mostra a lista; "Novo registro" abre a Nova manutenção, não o formulário nativo', async () => {
    const source = createMockSource()
    const openForm = vi.spyOn(source, 'openForm')
    history.replaceState(null, '', '#/frota-manutencoes?sub=todas')
    renderFrota(source, 'manutencoes')
    expect((await screen.findByRole('tab', { name: 'Todas' })).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(await screen.findByRole('button', { name: 'Novo registro' }))
    expect(await screen.findByRole('dialog', { name: 'Nova manutenção' })).toBeTruthy()
    expect(openForm).not.toHaveBeenCalled()
  })
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/frota/views/FilaEncaixe.test.tsx src/pages/frota/views/Registros.test.tsx src/pages/frota/FrotaPage.test.tsx`
Expected: FAIL.

- [ ] **Step 2: `FilaEncaixe`**

```tsx
// apps/shell/src/pages/frota/views/FilaEncaixe.tsx
import { CheckCircle2, ChevronRight, Plus, Wrench } from 'lucide-react'
import { useMemo } from 'react'
import { Button, EmptyState, StatusBadge as Badge, Surface } from '@betinhos/ui'
import { GRAU, label } from '../data/schema'
import type { Manutencao } from '../data/types'
import { diasEsperando, filaEncaixe } from '../domain/fila'

const TOM_GRAU: Record<number, 'danger' | 'warning' | 'info' | 'neutral'> = { 4: 'danger', 3: 'warning', 2: 'info', 1: 'neutral' }
/** Barra lateral da linha (a mesma das Pendências): vermelha no Urgente, âmbar no Alta. */
const URGENCIA: Record<number, 'atrasado' | 'hoje'> = { 4: 'atrasado', 3: 'hoje' }
const espera = (dias: number) => (dias === 0 ? 'Pedida hoje' : `Há ${dias} ${dias === 1 ? 'dia' : 'dias'}`)

type Props = { manutencoes: Manutencao[]; hoje: string; onOpen: (id: string) => void; onNovo: () => void }

/** Fila "A encaixar" do gestor de frota: Solicitadas, da mais urgente e mais antiga para a menos. */
export function FilaEncaixe({ manutencoes, hoje, onOpen, onNovo }: Props) {
  const fila = useMemo(() => filaEncaixe(manutencoes), [manutencoes])
  const novo = <div className="frota-cluster"><Button icon={<Plus size={16} />} onClick={onNovo}>Nova manutenção</Button></div>
  if (!fila.length) {
    return (
      <div className="frota-pend">
        {novo}
        <EmptyState align="start" icon={<CheckCircle2 size={36} />} title="Nenhuma manutenção esperando encaixe">Os pedidos do App e do escritório aparecem aqui, do mais urgente para o mais antigo.</EmptyState>
      </div>
    )
  }
  return (
    <div className="frota-pend">
      {novo}
      <Surface flush aria-label="Manutenções a encaixar" className="frota-pend__grupo">
        <header className="frota-pend__head">
          <h2>A encaixar</h2>
          <Badge tone="neutral">{fila.length}</Badge>
          <p>Solicitadas, do grau mais alto para o mais baixo e, no mesmo grau, da mais antiga para a mais nova. Encaixe num dia ou numa semana; quem programa motorista e horário é a operação, na Geral.</p>
        </header>
        <ul>
          {fila.map((m) => (
            <li key={m.id}>
              <button type="button" className="frota-pend__item" data-urgencia={URGENCIA[m.grau ?? 0]} onClick={() => onOpen(m.id)}>
                <span className="frota-pend__icone" aria-hidden><Wrench size={16} /></span>
                <span className="frota-pend__texto">
                  <strong>{m.descricao || 'Sem descrição'}</strong>
                  <span>{[m.veiculo?.label, m.solicitante?.label].filter(Boolean).join(' · ') || 'Sem veículo informado'}</span>
                </span>
                <Badge tone={TOM_GRAU[m.grau ?? 0] ?? 'neutral'}>{label(GRAU, m.grau, 'Sem grau')}</Badge>
                <span className="frota-muted frota-nowrap">{espera(diasEsperando(m, hoje))}</span>
                <ChevronRight size={16} className="frota-pend__seta" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  )
}
```

- [ ] **Step 3: `Registros` com `onNovo`**

Em `views/Registros.tsx`, troque o tipo `Props` (linha 38) por:

```ts
/** `onNovo`: a tela abre a gaveta própria de criação (Manutenções); sem ele, "Novo registro" abre o formulário nativo. */
type Props = { kinds: Kind[]; data: FrotaData; source: DataSource; host?: Host; onOpen: (kind: Kind, id: string) => void; onReload: () => void; loading?: boolean; onNovo?: () => void }
```

Troque a assinatura de `Lista` e o início de `novo()`:

```ts
function Lista({ kind, kinds, data, source, host = MOCK_HOST, onOpen, onReload, loading = false, onNovo }: Props & { kind: Kind }) {
```

```ts
  async function novo() {
    if (onNovo) {
      onNovo()
      return
    }
    try {
```

- [ ] **Step 4: `FrotaPage`**

Acrescente aos `import`:

```ts
import { GavetaManutencao } from './components/GavetaManutencao'
import { NovaManutencaoDrawer } from './components/NovaManutencaoDrawer'
import { filaEncaixe } from './domain/fila'
import { FilaEncaixe } from './views/FilaEncaixe'
```

Depois de `type SubMultas = 'multas' | 'infracoes'`:

```ts
/** Manutenções: a fila "A encaixar" (padrão) ou a lista de todas (`?sub=todas`). */
type SubManutencoes = 'encaixar' | 'todas'
```

Em `useFrotaRota`, logo depois da linha do `sub`:

```ts
  const subManut = lerOpcao<SubManutencoes>(query, 'sub', ['encaixar', 'todas'], 'encaixar')
```

Antes do `return`, acrescente `const novaManutencao = query.get('novo') === 'manutencao'` e troque o `return` por:

```ts
  return { tab, sub, subManut, veiculo, registro, secao, novaManutencao }
```

Depois de `abrirSub`:

```ts
const abrirSubManut = (sub: SubManutencoes) => patchHashQuery({ sub: sub === 'encaixar' ? null : sub, ficha: null, registro: null, secao: null, ...Object.fromEntries(FILTROS_DAS_VISOES.map((chave) => [chave, null])) })
const abrirNovaManutencao = () => patchHashQuery({ novo: 'manutencao' })
```

No `body`, troque a linha `{route.tab === 'manutencoes' && <Registros key="manutencoes" ... />}` por:

```tsx
      {route.tab === 'manutencoes' && (
        <Tabs aria-label="Manutenções" tabs={[{ value: 'encaixar', label: `A encaixar (${filaEncaixe(data.manutencoes).length})` }, { value: 'todas', label: 'Todas' }]} value={route.subManut} onChange={abrirSubManut}>
          {route.subManut === 'encaixar'
            ? <FilaEncaixe manutencoes={data.manutencoes} hoje={today} onOpen={(id) => onOpen('manutencao', id)} onNovo={abrirNovaManutencao} />
            : <Registros key="manutencoes" kinds={['manutencao']} data={data} source={source} host={host} onOpen={onOpen} onReload={onReload} loading={loading} onNovo={abrirNovaManutencao} />}
        </Tabs>
      )}
```

Troque a linha do `RegistroDrawer` (139) por:

```tsx
      {registro?.kind === 'manutencao' ? <GavetaManutencao key={registro.id} source={source} id={registro.id} hoje={today} onClose={() => setRegistro(null)} onChanged={onReload} onClassificado={aplicarClassificacao} onOpenVeiculo={onOpenVeiculo} /> : null}
      {registro && registro.kind !== 'manutencao' ? <RegistroDrawer key={`${registro.kind}-${registro.id}`} source={source} kind={registro.kind} id={registro.id} data={data} onClose={() => setRegistro(null)} onChanged={onReload} onOpenVeiculo={onOpenVeiculo} /> : null}
      {result && !fatal && route.novaManutencao ? <NovaManutencaoDrawer source={source} veiculos={data.veiculos} hoje={today} onClose={() => patchHashQuery({ novo: null })} onCriada={(id) => { patchHashQuery({ novo: null, registro: `manutencao:${id}` }); onReload() }} /> : null}
```

- [ ] **Step 5: `RegistroDrawer` só para multa e colisão**

Troque `components/RegistroDrawer.tsx` inteiro por:

```tsx
import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Drawer, EmptyState } from '@betinhos/ui'
import { diaSP, formatBR } from '../data/dates'
import { brl, NAO_INFORMADO } from '../data/format'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'
import { GRAVIDADE, KIND_LABEL, KIND_TABLE, label, TIPO_COLISAO } from '../data/schema'
import type { DataSource, FlowResult } from '../data/source'
import type { FrotaData, Kind, Ref } from '../data/types'
import { errorMessage } from '../data/xrm'
import { StatusPanel } from './StatusPanel'
import { TermoMultaPanel } from './TermoMultaPanel'
import { useNotify } from './Toasts'
import { StatusBadge } from './Ui'

/** Multa e colisão; a manutenção tem a gaveta própria (GavetaManutencao). */
export type KindRegistro = Exclude<Kind, 'manutencao'>

type Campo = [string, string]
type Detalhe = { titulo: string; status: number | null; veiculo: Ref | null; temMotorista: boolean; campos: Campo[] }

const texto = (value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? NAO_INFORMADO : String(value))
const dia = (iso: string | null) => formatBR(diaSP(iso)) || NAO_INFORMADO

function detalhe(kind: KindRegistro, id: string, data: FrotaData): Detalhe | null {
  if (kind === 'multa') {
    const item = data.multas.find((row) => row.id === id)
    const infracao = item?.infracaoId ? data.infracoes.find((row) => row.id === item.infracaoId) : undefined
    return !item ? null : { titulo: item.titulo, status: item.status, veiculo: item.veiculo, temMotorista: item.motorista !== null, campos: [
      ['Código', texto(item.codigo)], ['Motorista', texto(item.motorista?.label)], ['Data da infração', dia(item.dataHora)], ['Local', texto(item.local)],
      ['Infração', infracao ? `${infracao.codigo} · ${texto(infracao.descricao)}` : 'Sem código de infração'], ['Gravidade', infracao ? label(GRAVIDADE, infracao.gravidade) : NAO_INFORMADO],
      ['Valor', brl(infracao?.valor ?? null)], ['Pontos na CNH', texto(infracao?.pontos)],
      ['Prazo para indicar', formatBR(item.dataParaIndicar) || NAO_INFORMADO], ['Indicado', item.indicado ? 'Sim' : 'Não'],
      ['Aviso ao condutor', formatBR(item.dataAviso) || NAO_INFORMADO], ['Data de indicação', formatBR(item.dataIndicacao) || NAO_INFORMADO],
    ] }
  }
  const item = data.colisoes.find((row) => row.id === id)
  return item ? { titulo: item.titulo, status: item.status, veiculo: item.veiculo, temMotorista: true, campos: [
    ['Motorista', texto(item.motorista?.label)], ['Data', dia(item.dataHora)], ['Local', texto(item.local)], ['Tipo', label(TIPO_COLISAO, item.tipo)],
    ['Houve terceiro', item.houveTerceiro ? 'Sim' : 'Não'], ['Descrição', texto(item.descricao)],
  ] } : null
}

export function RegistroDrawer({ source, kind, id, data, onClose, onChanged, onOpenVeiculo }: { source: DataSource; kind: KindRegistro; id: string; data: FrotaData; onClose: () => void; onChanged: () => void; onOpenVeiculo: (id: string) => void }) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const notify = useNotify()
  const registro = detalhe(kind, id, data)
  const multa = kind === 'multa' ? data.multas.find((row) => row.id === id) : undefined
  const valorCatalogo = multa?.infracaoId ? data.infracoes.find((row) => row.id === multa.infracaoId)?.valor ?? null : null
  useEffect(() => { setShareUrl(null) }, [kind, id])

  async function abrirFormulario() {
    try {
      await source.openForm(kind, id)
    } catch (reason) {
      notify('error', errorMessage(reason))
      return
    }
    onChanged()
  }

  function concluido(result: FlowResult | null) {
    if (result?.shareUrl) setShareUrl(result.shareUrl)
    onChanged()
  }

  return (
    <Drawer
      open
      size="wide"
      onClose={onClose}
      actions={registro ? <BotaoAuditoria entity={KIND_TABLE[kind]} ids={[id]} name={registro.titulo} /> : null}
      eyebrow={KIND_LABEL[kind]}
      title={registro?.titulo || 'Registro não encontrado'}
      footer={<>
        <span className="frota-muted">Edição completa no formulário do Dataverse.</span>
        <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => void abrirFormulario()} disabled={!registro}>Abrir formulário</Button>
      </>}
    >
      {!registro ? <EmptyState compact align="start" title="Este registro não está mais na lista">Recarregue a tela.</EmptyState> : (
        <div className="frota-drawer">
          <div className="frota-drawer__status"><StatusBadge kind={kind} value={registro.status} /></div>
          <section className="frota-group" aria-labelledby={`${id}-acoes`}>
            <h3 id={`${id}-acoes`} className="frota-group__title">Ações de status</h3>
            {shareUrl && /^https?:\/\//i.test(shareUrl) && <p><a className="frota-link" href={shareUrl} target="_blank" rel="noreferrer">Abrir contrato gerado</a></p>}
            <StatusPanel
              key={`${id}-${registro.status}`}
              source={source}
              kind={kind}
              record={{ id, status: registro.status, temVeiculo: registro.veiculo !== null, temMotorista: registro.temMotorista }}
              onDone={concluido}
              onReload={onChanged}
            />
          </section>
          {multa && (
            <section className="frota-group" aria-labelledby={`${id}-termo`}>
              <h3 id={`${id}-termo`} className="frota-group__title">Termo de acordo</h3>
              <TermoMultaPanel key={id} source={source} multa={multa} valorCatalogo={valorCatalogo} onChanged={onChanged} />
            </section>
          )}
          <section className="frota-group" aria-labelledby={`${id}-dados`}>
            <h3 id={`${id}-dados`} className="frota-group__title">Dados</h3>
            <dl className="frota-detail">
              <dt>Veículo</dt>
              <dd>{registro.veiculo ? <button type="button" className="frota-link" onClick={() => onOpenVeiculo(registro.veiculo!.id)}>{registro.veiculo.label || NAO_INFORMADO}</button> : NAO_INFORMADO}</dd>
              {registro.campos.map(([nome, valor]) => (<div key={nome} className="frota-detail__row"><dt>{nome}</dt><dd>{valor}</dd></div>))}
            </dl>
          </section>
        </div>
      )}
    </Drawer>
  )
}
```

Em `RegistroDrawer.test.tsx`:
- apague os dois testes de classificação (`'mostra a classificação da IA...'` e `'manutenção sem classificação...'`), que agora estão em `GavetaManutencao.test.tsx`;
- apague a constante `manutencao` e tire-a de `data` (`const data: FrotaData = { ...EMPTY_DATA, multas: [multa], colisoes: [colisao] }`);
- tire `MANUT` e `Manutencao` dos `import`, e troque o tipo do parâmetro `kind` de `renderDrawer` por `KindRegistro` (`import { RegistroDrawer, type KindRegistro } from './RegistroDrawer'`); `Kind` sai do `import` de tipos.

- [ ] **Step 6: Rodar (Betinhos-Renan)**

Run: `pnpm --filter @betinhos/shell typecheck && pnpm --filter @betinhos/shell exec vitest run src/pages/frota src/pages/documentos`
Expected: typecheck sem erros; todos PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/shell/src/pages/frota
git commit -m "feat(frota): Manutenções com a fila A encaixar, a gaveta única e a Nova manutenção

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 20: Gaveta da manutenção no hospedeiro de gavetas do shell (para a Geral no plano 3)

**Files:**
- Create: `apps/shell/src/app/gavetas/GavetaManutencao.tsx`
- Modify: `apps/shell/src/app/registroAberto.ts`, `apps/shell/src/app/GavetaRegistro.tsx`
- Test: `apps/shell/src/app/GavetaRegistro.test.tsx`

**Interfaces:**
- Consumes: `GavetaManutencao` (Tarefa 17), `createFrotaSource` (cache por `host`, o mesmo da Frota).
- Produces: `abrirGavetaRegistro('cr40f_manutencoes', id)` abre a gaveta única por cima de qualquer lista. O link do lookup `cr40f_om` (`openGridRecord`) passa a abrir essa gaveta.

- [ ] **Step 1: Teste que falha**

Em `GavetaRegistro.test.tsx`, acrescente:

```tsx
it('manutenção abre a gaveta única da Frota por cima da lista, sem trocar a rota', async () => {
  render(<GavetaRegistro host={host} />)
  act(() => abrirGavetaRegistro('cr40f_manutencoes', 'm1'))
  const gaveta = await screen.findByRole('dialog', { name: 'Freio com ruído (fictício)' })
  expect(within(gaveta).getByRole('button', { name: 'Encaixar' })).toBeTruthy()
  expect(window.location.hash).toBe('#/geral?q=ana')
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/app/GavetaRegistro.test.tsx`
Expected: FAIL (o TypeScript recusa `'cr40f_manutencoes'` e, no runtime, nada abre).

- [ ] **Step 2: Adaptador e registro**

```tsx
// apps/shell/src/app/gavetas/GavetaManutencao.tsx
import { useMemo } from 'react'
import { Alert, Drawer } from '@betinhos/ui'
import { GavetaManutencao } from '../../pages/frota/components/GavetaManutencao'
import { todaySP } from '../../pages/frota/data/dates'
import { createFrotaSource } from '../../pages/frota/data/hostSource'
import '../../pages/frota/frota.css'
import { abrirGavetaRegistro } from '../registroAberto'
import { mensagem, type GavetaProps } from './comum'

/**
 * Gaveta única da manutenção (a mesma da Frota) por cima de outra lista. É a que a linha de manutenção da Geral abre
 * no plano 3. A fonte é a da Frota no mesmo `host`, então gravar aqui também vence o cache da tela Frota.
 */
export default function GavetaManutencaoAdaptador({ host, id, onClose }: GavetaProps) {
  const fonte = useMemo(() => {
    try { return { source: createFrotaSource(host), erro: null } } catch (reason) { return { source: null, erro: mensagem(reason) } }
  }, [host])
  if (!fonte.source) {
    return (
      <Drawer open eyebrow="Manutenção" title="Não foi possível abrir" onClose={onClose}>
        <Alert tone="danger" title="Não foi possível abrir a manutenção">{fonte.erro}</Alert>
      </Drawer>
    )
  }
  return <GavetaManutencao source={fonte.source} id={id} hoje={todaySP()} onClose={onClose} onChanged={() => undefined} onOpenVeiculo={(veiculoId) => abrirGavetaRegistro('cr40f_veiculos', veiculoId)} />
}
```

Em `registroAberto.ts`, acrescente `'cr40f_manutencoes',` ao fim de `TABELAS_COM_GAVETA`.

Em `GavetaRegistro.tsx`, acrescente ao `ADAPTADORES`:

```ts
  cr40f_manutencoes: lazy(() => import('./gavetas/GavetaManutencao')),
```

- [ ] **Step 3: Rodar (Betinhos-Renan)**

Run: `pnpm --filter @betinhos/shell exec vitest run src/app && pnpm --filter @betinhos/shell typecheck`
Expected: PASS (`abrirRegistro.test.ts` também cobre a tabela nova, porque percorre `TABELAS_COM_GAVETA`) e typecheck sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/shell/src/app
git commit -m "feat(shell): gaveta da manutenção no hospedeiro de gavetas (lookup cr40f_om)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 21: Roteiros, PR e verificação (mock e DEV)

**Files:**
- Modify: `.claude/skills/verificar-plugins/SKILL.md`, `.claude/skills/verificar-shell/SKILL.md`

- [ ] **Step 1: Roteiros de verificação**

Em `.claude/skills/verificar-plugins/SKILL.md`, item 4, troque `(prioridade, reincidência, preventiva, custo, hodômetro; "agendada" só as vencidas)` por:

```markdown
(prioridade, reincidência, preventiva, atrasada, custo, hodômetro; "atrasada" = janela do encaixe vencida em Agendado/Programado; a tela tem também "A encaixar", que a Custom API não devolve)
```

Em `.claude/skills/verificar-shell/SKILL.md`:
- no item 8b, troque `"Aguardando aprovação há 3 dias"` por `"Aguardando encaixe há 3 dias"`;
- no item 15, troque `Motorista, Veículo, Cliente, Pessoa, Equipamento, OP, Pagante ou Despesa` por ``Motorista, Veículo, Cliente, Pessoa, Equipamento, OP, Pagante, Despesa ou Manutenção (`cr40f_om`)``;
- depois do item 8i, acrescente:

```markdown
8j. Frota → Manutenções (`#/frota-manutencoes`, manutenções v2 plano 2, desde 17/11/2026; spec `docs/superpowers/specs/2026-11-16-manutencoes-v2-design.md`). Em `pnpm dev` (mock):
   - A aba "A encaixar (3)" lista Freio com ruído (Urgente), Ar-condicionado (Alta) e Lâmpada da placa (Baixa), nessa ordem. "Todas" (`?sub=todas`) é a lista com visões.
   - Clicar abre a gaveta única: ações Encaixar, Reprovar, Cancelar manutenção e Concluir.
   - "Encaixar" oferece Dia | Semana (seg–dom), começa na semana de hoje e recusa janela que já passou; confirmar deixa o selo "Agendado" e troca a ação para "Reagendar".
   - m3 (`?registro=manutencao:m3`) mostra o selo "Atrasada", e "Reagendar" avisa que tira o motorista.
   - "Concluir" tem os campos do App: serviços do catálogo, km (avisa se for menor que o do pedido), data, valor, pagamento com Dinheiro, estabelecimento, cidade, quem realizou, nota fiscal obrigatória e até 3 fotos.
   - "Novo registro" e "Nova manutenção" abrem a gaveta "Nova manutenção" (`?novo=manutencao`), não o formulário nativo.
   - Pendências: grupos "A encaixar" e "Manutenção atrasada"; não há "Programar".
   No DEV, as ações chamam as Custom APIs `cr40f_ManutencaoAgendar/Reprovar/Cancelar/Concluir` (plano 1); conferência na Tarefa 21 do plano 2.
```

- [ ] **Step 2: Rodar tudo (Betinhos-Renan)**

```bash
pnpm --filter @betinhos/shell typecheck
pnpm --filter @betinhos/shell test
pnpm --filter @betinhos/agentes-ia test
dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests
git diff --name-status -M origin/develop...HEAD | node packages/deploy/migrations-ci.mjs
```

Expected: typecheck sem erros; todos os testes PASS; a trava das migrations sai com código 0.

- [ ] **Step 3: Prints no mock, antes e depois (Betinhos-Renan; mostrar no chat)**

1. "Antes": numa worktree da `origin/develop` na Betinhos-Renan, rode `pnpm dev` e tire os prints `#/frota-manutencoes`, `#/frota-manutencoes?registro=manutencao:m1` e `#/frota`.
2. "Depois": na branch deste plano, rode `pnpm --filter @betinhos/shell dev` (porta 36472) e o script abaixo, salvo fora do repositório (por exemplo, `/tmp/prints-manutencoes.cjs`). Ajuste `PLAYWRIGHT_MODULE` e `CHROMIUM` como no `listas-grandes.cjs`.

```js
// node /tmp/prints-manutencoes.cjs <pasta-dos-prints> [http://localhost:36472/]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const OUT = process.argv[2] || '.'
const BASE = process.argv[3] || 'http://localhost:36472/'
;(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()) })

  await page.goto(`${BASE}#/frota-manutencoes`)
  await page.getByRole('tab', { name: /A encaixar/ }).waitFor()
  await page.screenshot({ path: `${OUT}/01-fila-a-encaixar.png` })

  await page.getByRole('button', { name: /Freio com ruído/ }).click()
  const gaveta = page.getByRole('dialog', { name: 'Freio com ruído (fictício)' })
  await gaveta.waitFor()
  await page.screenshot({ path: `${OUT}/02-gaveta-solicitada.png` })
  await gaveta.getByRole('button', { name: 'Encaixar' }).click()
  await page.screenshot({ path: `${OUT}/03-gaveta-encaixar.png` })
  await gaveta.getByRole('button', { name: 'Confirmar' }).click()
  await gaveta.getByRole('button', { name: 'Reagendar' }).waitFor()
  await page.screenshot({ path: `${OUT}/04-gaveta-agendada.png` })
  await gaveta.getByRole('button', { name: 'Concluir' }).click()
  await gaveta.getByRole('button', { name: 'Concluir manutenção' }).waitFor()
  await page.screenshot({ path: `${OUT}/05-gaveta-concluir.png`, fullPage: true })
  await page.keyboard.press('Escape')

  await page.goto(`${BASE}#/frota`)
  await page.getByRole('heading', { name: 'A encaixar' }).waitFor()
  await page.screenshot({ path: `${OUT}/06-pendencias.png`, fullPage: true })

  await page.goto(`${BASE}#/frota-manutencoes?sub=todas&novo=manutencao`)
  await page.getByRole('dialog', { name: 'Nova manutenção' }).waitFor()
  await page.screenshot({ path: `${OUT}/07-nova-manutencao.png` })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}#/frota-manutencoes?registro=manutencao:m3`)
  await page.getByRole('dialog', { name: 'Manutenção fictícia m3' }).waitFor()
  await page.screenshot({ path: `${OUT}/08-gaveta-atrasada-celular.png`, fullPage: true })

  console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erros no console')
  await browser.close()
})()
```

Expected: 8 prints e `sem erros no console`. Traga os prints para esta máquina e mostre no chat, antes e depois lado a lado:
- a lista antiga ao lado da fila "A encaixar";
- o drawer antigo, com "Aprovar e agendar", ao lado da gaveta nova;
- as Pendências antigas ao lado das novas.

Confira nos prints:
- a ordem da fila (Urgente, Alta, Baixa);
- o selo "Agendado" depois do encaixe;
- os campos do Concluir;
- "Manutenção atrasada" nas Pendências;
- a gaveta no celular sem rolagem horizontal.

- [ ] **Step 4: Abrir o PR para a `develop`**

```bash
git push -u origin HEAD
gh pr create --base develop --title "feat(frota): manutenções v2, Shell › Frota" --body "$(cat <<'EOF'
Plano 2 das manutenções v2 (spec: docs/superpowers/specs/2026-11-16-manutencoes-v2-design.md; plano: docs/superpowers/plans/2026-11-17-manutencoes-v2-2-frota.md).

- Frota › Manutenções: fila "A encaixar" (grau, depois a mais antiga), gaveta única (encaixar ou reagendar por dia ou semana, reprovar, cancelar, concluir com os campos do App, corrigir a classificação) e "Nova manutenção" em gaveta própria.
- Saem do shell: o flow "Agendar manutenção" (new_FlowUrlManutencao), a transição "Programar" e a escrita de cr40f_agendarpara. O rótulo "Aprovado" vira "Agendado" (Dashboard incluído).
- Pendências e Custom API cr40f_FrotaPendencias contam igual: "A encaixar" (só tela), "Atrasada" (janela vencida), prioridade parada desde o encaixe, preventiva com o km da realização; paridade no fixture.
- Agente: FrotaAgendadaVencida vira FrotaAtrasada no mesmo valor (migration do rótulo); e-mail semanal com "Manutenção atrasada".
- Gaveta da manutenção registrada no hospedeiro de gavetas (lookup cr40f_om), para a Geral no plano 3.

Privilégios do escritório (Tarefa 2): <cole o dry-run, ou "nada a conceder; migration não entrou">.

Pontos para o Renan: ExecutePrivilegeName (D6), privilégios concedidos (D7), PDF na nota fiscal (D9).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Vincule o PR à thread (`link_pull_request`) e acompanhe o CI.

- [ ] **Step 5: Depois do merge, conferir o Deploy**

Use a skill `verificar-deploy-dev`. O Deploy precisa mostrar:
- as migrations `20261117-1010-agente-frota-atrasada.ps1` e, se entrou, `20261117-1000-manutencoes-v2-privilegios.ps1` aplicadas;
- a tela publicada (versão nova no rodapé) e a peça `frota` (plugin) publicada;
- os flows "Frota | Resumo semanal" e "Flow Agentes | Executar" republicados.

- [ ] **Step 6: Conferir no DEV pelo shell publicado (Betinhos-Renan; prints no chat)**

Abra `https://org23b93544.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhos.html#/frota-manutencoes` e force o cache (`await fetch(location.pathname,{cache:'reload'}); location.reload()`). Use manutenções de teste criadas pela própria "Nova manutenção", com descrição começando por `TESTE plano 2`, num veículo de teste. Para cada passo, confira pela Web API:

```bash
BASE=https://org23b93544.crm2.dynamics.com; TOKEN=$(az account get-access-token --resource "$BASE/" --query accessToken -o tsv)
get() { curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" -H 'Prefer: odata.include-annotations="OData.Community.Display.V1.FormattedValue"' "$BASE/api/data/v9.2/$1"; echo; }
get "cr40f_manutencoeses($ID)?\$select=cr40f_status,cr40f_janelainicio,cr40f_janelafim,cr40f_datadaaprovacao,cr40f_comentariosaomotorista,cr40f_comentariosdoaprovador,cr40f_kmrealizado,new_servicosmanutencao,new_classificacaoorigem,cr40f_pagamento,new_linkdanotafiscal"
get "cr40f_reservadeveculoses?\$select=cr40f_status,cr40f_dataehorriodesada,_cr40f_motorista_value,cr40f_obsdeoperao,new_categoriadoitem&\$filter=_cr40f_om_value eq $ID"
get "cr40f_despesaoperacionals?\$select=cr40f_despesaoperacionalid,cr40f_nome,cr40f_valor,cr40f_statusanexo,_cr40f_formapagamento_value,_cr40f_categoria_value&\$filter=_cr40f_manutencao_value eq $ID"
get "cr40f_anexodespesaoperacionals?\$select=cr40f_nome,cr40f_sharelink,cr40f_status&\$filter=_cr40f_despesa_value eq $DESPESA"
get "new_fotomanutencaos?\$select=new_name,new_origem,new_tipofoto,new_link&\$filter=_new_manutencao_value eq $ID"
```

| Ação na tela | O que conferir |
|---|---|
| Nova manutenção sem encaixe | Aparece na fila "A encaixar" na posição do grau; status 0 |
| Encaixar numa semana, com comentário | Status 202410001 ("Agendado"); janela de segunda a domingo; `cr40f_datadaaprovacao` = hoje; uma linha na Geral de categoria Manutenção, sem motorista, saída às 03:00Z do início, `cr40f_obsdeoperao` com o comentário |
| Reagendar para um dia | Janela início = fim; a **mesma** linha da Geral com a saída nova; `cr40f_datadaaprovacao` não muda |
| Programar a linha na Geral (motorista e Programado) e reabrir a gaveta | Status 202410005 (espelho do plano 1) e ação "Reagendar" com o aviso de retirada |
| Reprovar outra manutenção de teste (sem motivo, depois com motivo) | Sem motivo a tela não deixa; com motivo, status 100000002 e `cr40f_comentariosdoaprovador` |
| Cancelar uma encaixada | Status 100000001 e linha da Geral cancelada (202410002) |
| Concluir pelo shell, com nota (imagem) e uma foto, pagamento Dinheiro | Status 202410002; `cr40f_kmrealizado`; `new_servicosmanutencao` e `new_classificacaoorigem` = 100000001; `new_linkdanotafiscal`. Na despesa: categoria Manutenção, forma "Particular (Reembolso)", `cr40f_statusanexo` = 100000002 e um anexo com o link. Na Geral: linha concluída (202410008). Em `new_fotomanutencao`: os vínculos `NOTA_FISCAL` e `POS_MANUTENCAO`. Os arquivos ficam em `Manutenções/DEV/<modelo - placa>/<código>` e `Despesas/DEV/<nome>` |
| Pendências (`#/frota`) | "A encaixar" e "Manutenção atrasada" (force uma janela vencida reagendando uma de teste para hoje e conferindo amanhã, ou usando uma antiga com `cr40f_agendarpara` vencida). A Custom API devolve as mesmas atrasadas e prioridades: `dotnet run --project packages/plugins/tools/Cr40f.Frota.Registrar -- --environmentUrl https://org23b93544.crm2.dynamics.com/ --testar` |
| Assistente da Frota | Propostas antigas do tipo 100000018 aparecem como "FrotaAtrasada" |
| Dashboard › Manutenções | "Em andamento" conta as Agendadas |

Se possível, repita encaixar e concluir com um usuário que tenha só o papel do escritório (`Acesso-Betinhos-MDA`). Esse teste confirma os privilégios da Tarefa 2. Se ninguém com esse papel puder testar, registre no PR como "não verificado com o papel do escritório".

Ao terminar, cancele as manutenções de teste que sobraram abertas.

- [ ] **Step 7: Registrar no PR**

Comente no PR o que foi conferido no DEV, com os prints, e o que ficou de fora. Fica de fora o App, que continua concluindo pelo caminho antigo até o plano 4. Fica de fora também a linha de manutenção desenhada na Geral, que é do plano 3.

---

## Autorrevisão

**Cobertura da spec:**

| Item da spec | Onde está |
|---|---|
| Fila "A encaixar" (grau, depois a mais antiga) | Tarefas 7 e 19 |
| Gaveta única, também para a Geral | Tarefas 17 e 20 |
| Encaixar ou reagendar (Dia \| Semana seg–dom + comentário) → `cr40f_ManutencaoAgendar` | Tarefas 6, 15 e 17 |
| Reprovar (comentário obrigatório) e Cancelar | Tarefa 17 |
| Concluir com os campos do App, nota e fotos pelo caminho do App, nota na despesa se `statusAnexo` pendente | Tarefas 12, 14 e 16 |
| Corrigir a classificação | Tarefas 15 e 17 |
| "Nova manutenção" em gaveta, podendo já encaixar | Tarefas 18 e 19 |
| Saem o flow, "Programar" e a escrita de `cr40f_agendarpara`; rótulo "Agendado" | Tarefas 4 e 10 |
| `StaleError` continua | Tarefa 10 |
| Pendências: "A encaixar", "Atrasada", sem "Programar", prioridade pelo encaixe, tela = API, paridade | Tarefa 9 |
| Agente `FrotaAtrasada` na mesma posição, rótulo no choice | Tarefa 3 |
| E-mail semanal | Tarefa 3 |
| Preventiva com `cr40f_kmrealizado` (TS e C#) | Tarefas 8 e 9 |
| `ExecutePrivilegeName` | D6 e Tarefa 1 |
| Create na Geral para o gestor | D7 e Tarefas 1 e 2 |
| Verificação no mock e no DEV | Tarefa 21 |

**Placeholders:** os únicos marcadores no plano são:
- os `<...>` da descoberta (Tarefa 1), que recebem a saída do script;
- o trecho do corpo do PR (Tarefa 21), que recebe o dry-run da Tarefa 2.

Nos dois casos, o conteúdo vem de comandos que o próprio plano manda rodar.

**Consistência de nomes:**
- `ComandosManutencao` e `ArquivosManutencao` são definidos nas Tarefas 11 e 12 e entram na `DataSource` na Tarefa 13. Os nomes dos métodos são os mesmos em `source.ts`, `manutencaoDataverse.ts`, `mock.ts` e `testUtils.ts`: `detalheManutencao`, `criarManutencao`, `agendarManutencao`, `reprovarManutencao`, `cancelarManutencao`, `concluirManutencao`, `enviarArquivoManutencao`, `anexarNotaFiscalDespesa`, `buscarFuncionarios` e `buscarCidades`.
- `PedidoConclusao` usa as mesmas chaves do `ConcluirPedido` (C#), e `BaseConclusao` é ele sem os links.
- `AcaoManutencao` tem os valores `encaixar`, `reprovar`, `cancelar` e `concluir`, iguais em `transitions.ts`, na gaveta e nos testes.

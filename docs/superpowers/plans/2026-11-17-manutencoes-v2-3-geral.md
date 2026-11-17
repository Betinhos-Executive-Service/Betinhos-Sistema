# Manutenções v2, plano 3: Shell › Geral (implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** levar a programação das manutenções para a Geral, onde o gestor de operação já programa os serviços. As linhas da Geral de categoria Manutenção aparecem misturadas com os serviços, na ordem da data, com outra cara e outra cor (desenho B). Nessas linhas só o motorista e a data e hora de saída editam, com o editor de célula que já existe. O selo "Atrasada" marca janela vencida. Clicar na linha abre a gaveta única da manutenção. Cada visão tem o liga/desliga "Mostrar manutenções", gravado no FetchXML dela. Junto entram duas pendências que caíram aqui: o texto do card "Em andamento" do Dashboard e a origem da despesa criada pelo "Concluir" do shell.

**Architecture:** a regra fica num módulo puro, `apps/shell/src/pages/geral/domain/manutencao.ts`, com quatro partes:
- a marca do liga/desliga no FetchXML da visão: ler, tirar e gravar;
- o padrão de cada visão;
- o FetchXML da consulta: ligado, o `link-entity` outer `bt_manut` por `cr40f_om`; desligado, o filtro que tira as manutenções;
- a leitura da linha: resumo, "Atrasada", "Fora da janela", trechos de célula e colunas editáveis.

`useGeral` tira a marca da visão antes de tudo, de modo que filtros, busca, contagem, paginação e "Agrupar por" trabalham sobre o FetchXML de sempre. O liga/desliga entra só no FetchXML efetivo da consulta. A tela desenha a linha de manutenção na `GeralTable` e nos `GeralCards`. Na tabela, motorista e saída usam o `Cell` de sempre e o resto das colunas vira trechos com `grid-column: span N`. O hospedeiro de gavetas ganha um evento de janela, `REGISTRO_ALTERADO`, que a Geral escuta para reler a lista depois de uma ação na gaveta.

**Tech Stack:** React 19 + TypeScript 5.9, `@betinhos/ui` (Switch, StatusBadge, Checkbox, Button, Sheet), `lucide-react`, Vitest 3 + Testing Library 16 + jsdom 27. A Tarefa 11, condicional, usa C# `net462` com xunit 2.9 e `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-16-manutencoes-v2-design.md`. Seção-alvo: "Shell › Geral". Valem também a decisão 4 ("outra cara e outra cor", liga/desliga por visão), a 7 (atrasada) e a regra "Programar fora da janela: a Geral avisa, mas não bloqueia".

**Depende de:** planos 1 e 2, já na `develop`:
- plano 1 (`docs/superpowers/plans/2026-11-16-manutencoes-v2-1-servidor.md`): a linha da Geral criada pela `cr40f_ManutencaoAgendar` e o espelho da programação;
- plano 2 (`docs/superpowers/plans/2026-11-17-manutencoes-v2-2-frota.md`): a `GavetaManutencao`, registrada no hospedeiro como `cr40f_manutencoes` (Tarefa 20), e `frota/domain/janela.ts`.

Os fatos do DEV estão em `docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md`.

## Decisões deste plano

Quando a spec, os planos anteriores e o código atual divergem, a spec decide. As decisões abaixo foram tomadas ao escrever este plano.

- **D1. O liga/desliga é uma marca no FetchXML da visão.** A marca é um `<filter type="or">` direto da entidade, só com condições de `new_categoriadoitem`:
  - **desligado:** `ne 100000001` ou `null`;
  - **ligado:** `eq 100000001` ou `ne 100000001` ou `null`, uma tautologia que nomeia a manutenção.

  O shell grava a marca explícita em todo "Salvar" e "Salvar como" (`gravarManutencoesNaVisao`). A `useGeral` reconhece a marca só nesse formato exato e a tira antes de tudo. Por isso ela não aparece como filtro só de leitura no painel e não vale duas vezes. Um filtro de categoria do usuário, como `eq 100000000`, não é a marca: continua filtro e continua valendo. As visões do sistema (`savedquery`) são só leitura no shell, então usam o padrão (D2). Mudar a chave nelas marca a visão como "Alterada", e "Salvar como" guarda a escolha numa visão pessoal, como já acontece com filtros. A mudança na tela vai para a URL (`m=0` ou `m=1`), só quando difere da visão.
- **D2. O padrão é uma regra objetiva:** ligado quando a visão mostra a coluna `cr40f_motorista` (layout) ou filtra o motorista (FetchXML), **e** nenhuma condição do FetchXML usa `cr40f_statusdefaturamento`. "Programação" é decidir motorista e horário, e visão de faturamento filtra o status de faturamento.
  - A visão "Sem motorista" filtra o motorista sem mostrar a coluna e fica ligada.
  - A visão de faturamento que mostra o motorista fica desligada.

  A Tarefa 1 lista as visões do DEV com o resultado da regra. O que ela classificar errado entra em `PADRAO_POR_VISAO` (id → valor), que começa vazio. O mesmo vale para as visões pessoais sem marca, criadas antes deste plano.
- **D3. O `link-entity` da manutenção só entra na consulta.** Ele não vai para a visão gravada nem para a carga de metadata: `loadAttributes` lê `view.fetchxml`, que não tem o link.
  - **Formato:** link outer `bt_manut`, `cr40f_manutencoes.cr40f_manutencoesid = cr40f_om`. Colunas: `cr40f_id`, `cr40f_descricao`, `cr40f_graudamanutencao`, `cr40f_status`, `cr40f_janelainicio`, `cr40f_janelafim` e `cr40f_agendarpara`. A raiz ganha `new_categoriadoitem`, `cr40f_om`, `cr40f_veiculo`, `cr40f_motorista` e `cr40f_dataehorriodesada`, para o desenho não depender das colunas da visão.
  - **Contagem e "Agrupar por" não mudam:** o join N:1 outer não multiplica linhas, e a consulta agregada já tira os atributos, inclusive os do link.
  - **Paginação por cookie e ordenação seguem:** a ordem continua na raiz.
  - **Busca:** continua nos campos da localização rápida. A descrição da manutenção não entra na busca.
- **D4. Desligado tira só a categoria Manutenção.** O filtro é `ne` **ou** `null`, porque `ne` não devolve vazio (como no SQL), e as linhas sem categoria continuam. Ligado não filtra nada: serviços, manutenções, trocas e linhas sem categoria aparecem.
- **D5. A linha de manutenção tem desenho próprio, com colunas com sentido** (decisão do Renan, 17/11/2026, ao rever a UI; substitui os trechos com `grid-column: span N`).
  - **Tabela:** uma célula por coluna da visão, e cada dado na coluna de mesmo sentido (`desenhoDaManutencao`):
    - fundo com a tinta suave do aviso do DS (`--bt-color-warning-soft` misturado à superfície) e barra de 3 px em `--bt-color-warning`;
    - primeira coluna: botão com a chave (`Wrench`), a placa em destaque e "Manutenção" embaixo; na densidade mínima, só a placa. O nome acessível começa pelo texto visível ("TST1A11 · Manutenção, abrir: <problema>"). Se a primeira coluna da visão for motorista ou saída, ela continua editável e o botão vai para a primeira célula que não edita;
    - Status de Op.: a etiqueta do status da manutenção e, embaixo, os alertas em texto com ponto, "● Atrasada" (perigo) e "● Fora da janela" (aviso);
    - Veículo: a placa;
    - problema e "grau · janela" no Trajeto ou, sem ele, na coluna livre mais larga da própria linha (nem virtual, como Portal e Comprovantes, nem de tabela ligada). Sem Status de Op., o status e os alertas vão junto do problema; sem coluna livre, o problema vai junto do botão. O clique no problema abre a mesma gaveta, mas ele fica fora do Tab e da árvore acessível (um alvo por linha);
    - motorista e saída ficam na própria coluna, com o `Cell` de sempre; as outras colunas ficam vazias.
  - **Cards:** placa e "Manutenção" numa linha, o problema, status e alertas, "grau · janela" e "Programar" no lugar de "Editar campos".
  - **Atrasada:** usa `atrasada()` de `frota/domain/janela.ts`, com o fim da janela ou, na falta dele, `cr40f_agendarpara`.
  - **Limite aceito:** na linha de manutenção as setas do teclado andam só entre as células que existem nela.
- **D6. Só motorista e saída editam, com o `Cell` de sempre.** Ele traz as regras de tipo, validação, proteção da Tenaris, releitura e "Tentar de novo". As outras colunas de serviço não aparecem na linha. No celular, "Programar" abre a `GeralSheet` só com os dois campos. Quando a visão não tem a coluna, a coluna é criada ali (`colunasDaManutencao`).
- **D7. Programar fora da janela avisa e não bloqueia.** Depois de gravar uma saída fora da janela, um toast avisa ("ficou fora da janela da manutenção") e a linha ganha o selo "Fora da janela". A gravação não é desfeita.
- **D8. Abrir a manutenção não muda a seleção.**
  - O rótulo e o resumo abrem a gaveta da manutenção (`abrirGavetaRegistro('cr40f_manutencoes', id)`).
  - O resto da linha seleciona, como nos serviços. Assim "Disparar" programa a linha de manutenção pelo `programarPatch` de sempre, e o espelho do plano 1 leva a manutenção para Programado.
  - "Editar" da seleção abre a gaveta quando a linha é de manutenção.
- **D9. A Geral relê a lista depois de uma ação na gaveta.** O adaptador da gaveta avisa por evento de janela, `REGISTRO_ALTERADO` (`app/registroAberto.ts`), no mesmo padrão de `DOCUMENTOS_ALTERADOS`. A Geral escuta com `useRegistroAlterado('cr40f_manutencoes', reload)`, que relê as páginas já carregadas e mantém a posição. Assim o `onChanged` do hospedeiro, hoje vazio, passa a ter efeito em qualquer lista que escute.
- **D10. Com manutenção na seleção, as ações só de serviço ficam inertes**, com o motivo "Ação só para serviços. Desmarque as manutenções.":
  - Gerar Voucher;
  - Liberar para o portal;
  - Gerar link;
  - Link de cadastro;
  - Gerar OP.

  Editar, Copiar, Desativar ou Ativar, Disparar e Registrar Erro continuam.
- **D11. O mock das manutenções é opcional.** `SourceOptions.manutencoes`, desligado por padrão, acrescenta duas linhas que apontam para as manutenções do mock da Frota, para a gaveta abrir o registro certo:
  - OS-9001 = m2, Agendado na semana que vem, sem motorista;
  - OS-9002 = m3, Programado num dia que já passou, ou seja, atrasada.

  A tela liga o mock com `createSource(host, { manutencoes: true })`. Os testes que já existem continuam sem as linhas, e os totais com `MOCK_ROW_COUNT` não mudam. O mock ganha também a visão "💲 Faturamento", que vem desligada. O mock não simula o espelho da programação.
- **D12. Dashboard:** o apoio do card "Em andamento" passa a ser "solicitadas, agendadas ou programadas". A contagem já trata "Agendado" desde o plano 2.
- **D13. A origem da despesa do "Concluir" pelo shell fica como está e vira decisão do Renan.**
  - **Como está hoje:** o plugin grava sempre `cr40f_origem` = 100000000 ("App Motoristas").
  - **Opção melhor no choice:** existe, 100000001 "Model-driven" (`apps/motoristas/scripts/repair-expense-schema-org23.ps1`; a Tarefa 1 confere no DEV).
  - **Por que não trocar já:** o gatilho do "Flow Despesas | Análise IA" só aceita origem 100000000, ou 100000002 conciliada (`provision-flow-despesas-ia.ps1`). Trocar sem mexer no gatilho tira essas despesas da conferência por IA.
  - **Pronto para entrar:** a Tarefa 11, condicional, entra só se o Renan escolher a opção B ("Pontos para o Renan"). O plugin passa a aceitar `origem: "shell"` no `RequestJson` do `cr40f_ManutencaoConcluir`. Ausente, a despesa continua "App Motoristas", então o App não muda. Na mesma tarefa, o gatilho da IA passa a aceitar 100000001.
- **D14. Cada tarefa compila sozinha.** O módulo de domínio cresce em duas tarefas (2 e 3). O mock e os ganchos de teste vêm antes do hook (5 e 6). Os componentes recebem a linha de manutenção por uma prop opcional (Tarefa 8), e a página liga tudo na Tarefa 9.

## Pontos para o Renan

1. **(D2) Quais visões vêm com "Mostrar manutenções" ligado.** A Tarefa 1 registra na descoberta a tabela das visões do DEV com o padrão que a regra dá. Confirme a tabela ou diga quais visões são exceção: elas entram em `PADRAO_POR_VISAO`.
2. **(D13) Origem da despesa criada pelo "Concluir" do shell.**
   - **A:** manter "App Motoristas", como hoje. A IA confere, mas o relatório mistura o shell com o App.
   - **B (recomendada):** "Model-driven" (100000001) e o gatilho da IA aceitando essa origem. A Tarefa 11 faz isso. A IA continua conferindo, e o financeiro passa a distinguir.
   - **C:** uma opção nova, "Sistema Betinhos", por migration, mais o gatilho. Muda o schema e passa pelo "Publicar soluções".

## Global Constraints

- **Nada pesado roda nesta máquina** (8 GB, regra do CLAUDE.md do usuário). Isso inclui:
  - test runners (`vitest`, `dotnet test`, `node --test`);
  - typecheck e builds;
  - `pnpm dev` e Chromium headless;
  - chamadas ao Dataverse DEV (`az`, `curl` com token).

  Tudo isso roda na máquina linkada **Betinhos-Renan** (T3 environmentId `0af2203c-6aba-4a53-8896-1d00fe75c6fa`), via `delegate_task` com `target.environmentId`. Prints feitos lá são trazidos para esta máquina e mostrados no chat.
- Comandos:
  - testes do shell: `pnpm --filter @betinhos/shell exec vitest run <caminho relativo a apps/shell>`;
  - suíte do shell: `pnpm --filter @betinhos/shell test`;
  - typecheck do shell: `pnpm --filter @betinhos/shell typecheck`;
  - C# (só na Tarefa 11): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`;
  - deploy (só na Tarefa 11): `pnpm --filter @betinhos/deploy test`.
- TDD em toda tarefa de código: teste que falha → código → teste passando → commit.
- UI só com o Design System `@betinhos/ui` e os tokens `--bt-*`. CSS novo só em `apps/shell/src/pages/geral/geral.css`. Nenhum componente do zero quando o DS ou o shell já tem um.
- Mensagens ao usuário em português, frase completa, sem jargão.
- Códigos de choice:
  - categoria da linha (`new_categoriadoitem`): Serviço `100000000`, **Manutenção `100000001`**, Troca de Veículos `100000002`;
  - status da Geral (`cr40f_status`): Confirmado (a programar) `202410001`, Programado `202410005`, Concluído `202410008`, Cancelado `202410002`;
  - status da manutenção: Solicitado `0`, Agendado `202410001`, Programado `202410005`, Realizado `202410002`, Reprovado `100000002`, Cancelado `100000001`;
  - faturamento: Pendente `202410005`, Não Faturável `202410011`.
- Fuso: São Paulo = UTC−3 sem horário de verão. Janela em `YYYY-MM-DD` (colunas DateOnly do plano 1).
- Sem `pnpm push`, `sitemap:*`, `push:plugin:*` nem script de `provision-*` à mão: o Deploy da `develop` publica a tela (e, se a Tarefa 11 entrar, o plugin e o flow da IA).
- UI mudou → print antes e depois no chat (CLAUDE.md do usuário).
- Commits em português no estilo `tipo(escopo): resumo`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `t3/manutencoes-v2-geral`, criada da `develop`. PR para a `develop`.
- **Promoção ao PROD:**
  - sem a Tarefa 11, o PR mexe só na tela, e a promoção vai pelo caminho "só a tela" (`push-front-prod.ps1`);
  - com a Tarefa 11, o flow da IA muda e o caminho é "Publicar soluções". O plugin vai junto: o código já existe no PROD.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| Modificar `docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md` | Seção "Plano 3": visões e padrão, contagens por categoria, formato do link, comportamento das datas, choices (Tarefa 1) |
| Criar `apps/shell/src/pages/geral/domain/manutencao.ts` (+ `manutencao.test.ts`) | Marca na visão, padrão, FetchXML da consulta, leitura da linha, atrasada, fora da janela, trechos e colunas |
| Modificar `apps/shell/src/pages/geral/domain/urlState.ts` (+ teste) | `m=0` / `m=1` |
| Modificar `apps/shell/src/pages/geral/data/mock.ts`, `data/source.ts`, `data/data.test.ts` | Linhas de manutenção (opcionais) e visão de faturamento no mock |
| Modificar `apps/shell/src/pages/geral/testUtils.ts` | `mockSource(..., { manutencoes })` e contador de páginas |
| Modificar `apps/shell/src/pages/geral/useGeral.ts`, `useGeralViewState.ts`; criar `useGeral.manutencao.test.tsx` | Liga/desliga na consulta, "Alterada", "Restaurar", URL |
| Modificar `apps/shell/src/app/registroAberto.ts`, `app/gavetas/GavetaManutencao.tsx`, `app/GavetaRegistro.test.tsx` | Evento `REGISTRO_ALTERADO` e `useRegistroAlterado` |
| Criar `apps/shell/src/pages/geral/components/ManutencaoResumo.tsx`, `components/ManutencaoLinha.test.tsx` | Resumo da manutenção (tabela e cards) |
| Modificar `apps/shell/src/pages/geral/components/GeralTable.tsx`, `GeralCards.tsx`, `GeralSheet.tsx`, `geral.css` | Desenho da linha, card e sheet de manutenção |
| Modificar `apps/shell/src/pages/geral/GeralPage.tsx`; criar `GeralPage.manutencao.test.tsx` | Chave, gaveta, aviso fora da janela, ações só de serviço, recarga |
| Modificar `apps/shell/src/pages/dashboard/components/abas/ManutencoesTab.tsx` (+ `motoristas-manutencoes-multas.test.tsx`) | "agendadas" no apoio do "Em andamento" |
| (Condicional, Tarefa 11) Modificar `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Contratos.cs`, `Esquema.cs`, `DespesaManutencao.cs`, `ManutencaoService.Concluir.cs`, `Cr40f.Frota.Plugin.Tests/ConcluirTests.cs`, `apps/shell/src/pages/frota/data/manutencaoDataverse.ts` (+ teste), `packages/deploy/provision-flow-despesas-ia.ps1`, `packages/deploy/flow-despesas-ia.test.mjs` | Origem "Model-driven" para a despesa do shell, com a IA conferindo |
| Modificar `.claude/skills/verificar-shell/SKILL.md` | Roteiro 5h (Geral com manutenções) |

---

### Tarefa 1: Conferência no DEV (só leitura)

Antes de fixar a regra do padrão (D2), o formato do link (D3) e as opções de origem (D13), confira no DEV. Tudo **roda na Betinhos-Renan** e precisa de `az login`.

**Files:**
- Modify: `docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md`

**Interfaces:**
- Produces:
  - a tabela das visões do sistema da Geral com o padrão da regra D2 (ponto 1 para o Renan) e as exceções candidatas a `PADRAO_POR_VISAO` (Tarefa 2);
  - a confirmação de que a contagem com o filtro de desligado mais a contagem das manutenções fecha o total (D4);
  - as chaves que o link `bt_manut` devolve, e em que formato vêm as datas (Tarefa 3);
  - as opções de `cr40f_graudamanutencao` e de `cr40f_despesaoperacional.cr40f_origem` (D13).

- [ ] **Step 1: Script de leitura (scratchpad da Betinhos-Renan, não versionado)**

```bash
cat > /tmp/conferir-plano3.py <<'PY'
import json, subprocess, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
BASE = "https://org23b93544.crm2.dynamics.com"
TOKEN = subprocess.check_output(["az", "account", "get-access-token", "--resource", BASE + "/", "--query", "accessToken", "-o", "tsv"], text=True).strip()
def get(path):
    req = urllib.request.Request(f"{BASE}/api/data/v9.2/{path}", headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/json", "Prefer": 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'})
    with urllib.request.urlopen(req) as r: return json.load(r)
q = urllib.parse.quote
ENT, SET = "cr40f_reservadeveculos", "cr40f_reservadeveculoses"

print("== Visoes do sistema da Geral (regra D2: motorista no layout ou no filtro, e nada de statusdefaturamento)")
views = get("savedqueries?$select=savedqueryid,name,isdefault,fetchxml,layoutxml&$filter=" + q(f"returnedtypecode eq '{ENT}' and querytype eq 0 and statecode eq 0") + "&$orderby=name asc")["value"]
for v in views:
    f = ET.fromstring(v["fetchxml"]); l = ET.fromstring(v["layoutxml"] or "<grid/>")
    conds = {c.get("attribute") for c in f.iter("condition")}
    cells = {c.get("name") for c in l.iter("cell") if c.get("ishidden") != "1"}
    motorista = "cr40f_motorista" in cells or "cr40f_motorista" in conds
    faturamento = "cr40f_statusdefaturamento" in conds
    categoria = [(c.get("operator"), c.get("value")) for c in f.iter("condition") if c.get("attribute") == "new_categoriadoitem"]
    print(f"{v['savedqueryid'].lower()} | {v['name']} | padrao={'sim' if v['isdefault'] else '-'} | motorista={motorista} | faturamento={faturamento} | categoria={categoria} | LIGADO={motorista and not faturamento}")

print("== Contagens de linhas ativas da Geral por categoria")
def contar(filtro):
    fx = f'<fetch aggregate="true"><entity name="{ENT}"><attribute name="cr40f_reservadeveculosid" alias="total" aggregate="count" /><filter type="and"><condition attribute="statecode" operator="eq" value="0" />{filtro}</filter></entity></fetch>'
    return get(f"{SET}?fetchXml=" + q(fx))["value"][0]["total"]
ativas = contar("")
manut = contar('<condition attribute="new_categoriadoitem" operator="eq" value="100000001" />')
sem_cat = contar('<condition attribute="new_categoriadoitem" operator="null" />')
desligado = contar('<filter type="or"><condition attribute="new_categoriadoitem" operator="ne" value="100000001" /><condition attribute="new_categoriadoitem" operator="null" /></filter>')
manut_sem_om = contar('<condition attribute="new_categoriadoitem" operator="eq" value="100000001" /><condition attribute="cr40f_om" operator="null" />')
print("ativas", ativas, "| manutencao", manut, "| sem categoria", sem_cat, "| desligado", desligado, "| manutencao sem cr40f_om", manut_sem_om, "| fecha:", desligado + manut == ativas)

print("== Link bt_manut (3 linhas de manutencao mais recentes)")
fx = f'''<fetch count="3"><entity name="{ENT}"><attribute name="cr40f_id" /><attribute name="new_categoriadoitem" /><attribute name="cr40f_om" /><attribute name="cr40f_veiculo" /><attribute name="cr40f_dataehorriodesada" />
<order attribute="cr40f_dataehorriodesada" descending="true" /><filter type="and"><condition attribute="new_categoriadoitem" operator="eq" value="100000001" /></filter>
<link-entity name="cr40f_manutencoes" from="cr40f_manutencoesid" to="cr40f_om" link-type="outer" alias="bt_manut"><attribute name="cr40f_id" /><attribute name="cr40f_descricao" /><attribute name="cr40f_graudamanutencao" /><attribute name="cr40f_status" /><attribute name="cr40f_janelainicio" /><attribute name="cr40f_janelafim" /><attribute name="cr40f_agendarpara" /></link-entity></entity></fetch>'''
for r in get(f"{SET}?fetchXml=" + q(fx))["value"]:
    print(json.dumps({k: v for k, v in r.items() if k.startswith(("bt_manut", "_cr40f_om", "new_categoria", "_cr40f_veiculo", "cr40f_dataehorriodesada"))}, ensure_ascii=False))

print("== Comportamento das datas da manutencao")
for col in ("cr40f_janelainicio", "cr40f_janelafim", "cr40f_agendarpara"):
    print(col, get(f"EntityDefinitions(LogicalName='cr40f_manutencoes')/Attributes(LogicalName='{col}')/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=DateTimeBehavior,Format")["DateTimeBehavior"])

print("== Opcoes")
def opcoes(tabela, coluna):
    os_ = get(f"EntityDefinitions(LogicalName='{tabela}')/Attributes(LogicalName='{coluna}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet,GlobalOptionSet")
    s = os_.get("OptionSet") or os_.get("GlobalOptionSet")
    return [(o["Value"], o["Label"]["LocalizedLabels"][0]["Label"]) for o in s["Options"]]
print("cr40f_manutencoes.cr40f_graudamanutencao", opcoes("cr40f_manutencoes", "cr40f_graudamanutencao"))
print("cr40f_manutencoes.cr40f_status", opcoes("cr40f_manutencoes", "cr40f_status"))
print("cr40f_despesaoperacional.cr40f_origem", opcoes("cr40f_despesaoperacional", "cr40f_origem"))
PY
python3 -I /tmp/conferir-plano3.py
```

Expected: as cinco seções impressas, sem exceção. Na contagem, `fecha: True`. As linhas do link trazem `bt_manut.cr40f_status` e a anotação `@OData.Community.Display.V1.FormattedValue`; as janelas vêm como `YYYY-MM-DD`. O grau tem 1 Baixa, 2 Média, 3 Alta e 4 Urgente, e a origem tem 100000001 "Model-driven".

- [ ] **Step 2: Registrar na descoberta**

Acrescente ao fim de `docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md`. O texto entre `<...>` é a saída do Step 1, copiada como veio:

```markdown
## 7. Plano 3 (17/11/2026)

Leitura apenas (GET), feita pela Tarefa 1 do plano `2026-11-17-manutencoes-v2-3-geral.md`, no DEV (`org23b93544`).

### Visões do sistema da Geral e o padrão de "Mostrar manutenções" (regra D2)

| Id | Visão | Padrão | Motorista | Faturamento | Condição de categoria | Ligado |
|---|---|---|---|---|---|---|
<uma linha por visão, da saída do Step 1>

### Linhas ativas por categoria

<ativas, manutenção, sem categoria, desligado, manutenção sem cr40f_om, "fecha">

### Link `bt_manut`

<as 3 linhas impressas; formato das datas>

### Datas e opções

- `DateTimeBehavior`: <janelainicio, janelafim, agendarpara>.
- Grau: <valores>. Status da manutenção: <valores>. Origem da despesa: <valores>.

### Decisões

- Exceções candidatas a `PADRAO_POR_VISAO`: <"nenhuma" ou a lista id → valor, com o motivo>. Vão para o Renan (ponto 1).
- Filtro de desligado: <"fecha o total" ou o desvio encontrado>.
- `toDateOnly` das janelas: <"DateOnly, chega YYYY-MM-DD" ou o formato lido>.
- Origem "Model-driven" (100000001): <existe / não existe> (ponto 2 para o Renan).
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md
git commit -m "docs(geral): conferência no DEV para o plano 3 das manutenções v2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Marca na visão, padrão e FetchXML da consulta (`domain/manutencao.ts`, parte 1)

**Files:**
- Create: `apps/shell/src/pages/geral/domain/manutencao.ts`
- Test: `apps/shell/src/pages/geral/domain/manutencao.test.ts`

**Interfaces:**
- Consumes: `parse` (`domain/fetch.ts`), `parseLayout` (`domain/layout.ts`), `View` (`domain/types.ts`).
- Produces:
  - constantes `CATEGORIA_ITEM`, `CATEGORIA_MANUTENCAO`, `MOTORISTA`, `SAIDA`, `ALIAS_MANUTENCAO`, `COLUNAS_MANUTENCAO`, `CAMPOS_DA_LINHA` e `PADRAO_POR_VISAO`;
  - tipo `ManutencoesDaVisao = { fetchxml; mostrar; gravado }`;
  - funções `padraoManutencoes(view, excecoes?)`, `lerManutencoesDaVisao(view)`, `gravarManutencoesNaVisao(fetchxml, mostrar)` e `aplicarManutencoes(fetchxml, mostrar)`.

- [ ] **Step 1: Testes que falham**

```ts
// apps/shell/src/pages/geral/domain/manutencao.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildCountFetch, buildFetch } from './fetch'
import { aplicarManutencoes, gravarManutencoesNaVisao, lerManutencoesDaVisao, padraoManutencoes } from './manutencao'

const ENT = 'cr40f_reservadeveculos'
const fetchDe = (filtro = '') => `<fetch version="1.0" mapping="logical"><entity name="${ENT}"><attribute name="cr40f_id" /><order attribute="cr40f_dataehorriodesada" descending="false" /><filter type="and"><condition attribute="statecode" operator="eq" value="0" />${filtro}</filter></entity></fetch>`
const layoutDe = (...cells: string[]) => `<grid name="resultset" jump="cr40f_id" select="1" icon="1" preview="1"><row name="result" id="cr40f_reservadeveculosid">${cells.map((c) => `<cell name="${c}" width="120" />`).join('')}</row></grid>`
const visao = (fetchxml: string, layoutxml = layoutDe('cr40f_id', 'cr40f_motorista'), id = 'v1') => ({ id, fetchxml, layoutxml })
const xml = (text: string) => new DOMParser().parseFromString(text, 'text/xml')
const norm = (text: string) => new XMLSerializer().serializeToString(xml(text))
const MARCA = 'entity > filter[type="or"] > condition[attribute="new_categoriadoitem"]'

describe('padrão de "Mostrar manutenções"', () => {
  it('ligado em visão de programação: mostra ou filtra o motorista e não filtra faturamento', () => {
    expect(padraoManutencoes(visao(fetchDe()))).toBe(true)
    expect(padraoManutencoes(visao(fetchDe('<condition attribute="cr40f_motorista" operator="null" />'), layoutDe('cr40f_id', 'cr40f_trajeto')))).toBe(true)
  })

  it('desligado em visão de faturamento (mesmo com motorista) ou sem motorista', () => {
    expect(padraoManutencoes(visao(fetchDe('<condition attribute="cr40f_statusdefaturamento" operator="eq" value="202410005" />')))).toBe(false)
    expect(padraoManutencoes(visao(fetchDe(), layoutDe('cr40f_id', 'cr40f_cotao')))).toBe(false)
  })

  it('a exceção pelo id da visão vence a regra', () => {
    expect(padraoManutencoes(visao(fetchDe(), undefined, 'ABC'), { abc: false })).toBe(false)
    expect(padraoManutencoes(visao(fetchDe(), layoutDe('cr40f_id'), 'abc'), { abc: true })).toBe(true)
  })
})

describe('marca na visão', () => {
  it('sem marca: FetchXML intacto e o padrão da visão', () => {
    const v = visao(fetchDe())
    expect(lerManutencoesDaVisao(v)).toEqual({ fetchxml: v.fetchxml, mostrar: true, gravado: false })
  })

  it('gravar e ler de volta: a marca sai do FetchXML que a tela usa', () => {
    const base = fetchDe('<condition attribute="cr40f_trajeto" operator="like" value="%GRU%" />')
    for (const mostrar of [false, true]) {
      const gravado = gravarManutencoesNaVisao(base, mostrar)
      expect(xml(gravado).querySelectorAll(MARCA).length).toBe(mostrar ? 3 : 2)
      const lido = lerManutencoesDaVisao(visao(gravado))
      expect(lido.mostrar).toBe(mostrar)
      expect(lido.gravado).toBe(true)
      expect(norm(lido.fetchxml)).toBe(norm(base))
    }
  })

  it('gravar de novo troca a marca, sem acumular', () => {
    const duas = gravarManutencoesNaVisao(gravarManutencoesNaVisao(fetchDe(), true), false)
    expect(xml(duas).querySelectorAll('entity > filter[type="or"]').length).toBe(1)
    expect(lerManutencoesDaVisao(visao(duas)).mostrar).toBe(false)
  })

  it('filtro de categoria do usuário não é a marca e continua valendo', () => {
    const v = visao(fetchDe('<condition attribute="new_categoriadoitem" operator="eq" value="100000000" />'))
    expect(lerManutencoesDaVisao(v)).toEqual({ fetchxml: v.fetchxml, mostrar: true, gravado: false })
  })

  it('FetchXML inválido não derruba a tela', () => {
    expect(lerManutencoesDaVisao(visao('<fetch>'))).toEqual({ fetchxml: '<fetch>', mostrar: false, gravado: false })
  })
})

describe('FetchXML da consulta', () => {
  it('desligado: filtro que tira as manutenções sem perder as linhas sem categoria', () => {
    const doc = xml(aplicarManutencoes(fetchDe(), false))
    expect(Array.from(doc.querySelectorAll(MARCA)).map((c) => c.getAttribute('operator'))).toEqual(['ne', 'null'])
    expect(doc.querySelector('link-entity')).toBeNull()
  })

  it('ligado: campos da linha e o link-entity da manutenção (outer, por cr40f_om), uma vez só', () => {
    const doc = xml(aplicarManutencoes(aplicarManutencoes(fetchDe(), true), true))
    const links = doc.querySelectorAll('link-entity[alias="bt_manut"]')
    expect(links.length).toBe(1)
    expect(links[0].getAttribute('name')).toBe('cr40f_manutencoes')
    expect(links[0].getAttribute('from')).toBe('cr40f_manutencoesid')
    expect(links[0].getAttribute('to')).toBe('cr40f_om')
    expect(links[0].getAttribute('link-type')).toBe('outer')
    expect(Array.from(links[0].querySelectorAll('attribute')).map((a) => a.getAttribute('name'))).toEqual(['cr40f_id', 'cr40f_descricao', 'cr40f_graudamanutencao', 'cr40f_status', 'cr40f_janelainicio', 'cr40f_janelafim', 'cr40f_agendarpara'])
    for (const nome of ['new_categoriadoitem', 'cr40f_om', 'cr40f_veiculo', 'cr40f_motorista', 'cr40f_dataehorriodesada']) expect(doc.querySelectorAll(`entity > attribute[name="${nome}"]`).length).toBe(1)
    expect(doc.querySelector(MARCA)).toBeNull()
  })

  it('com all-attributes não acrescenta atributos na raiz', () => {
    const doc = xml(aplicarManutencoes(`<fetch><entity name="${ENT}"><all-attributes /></entity></fetch>`, true))
    expect(doc.querySelectorAll('entity > attribute').length).toBe(0)
    expect(doc.querySelector('link-entity[alias="bt_manut"]')).toBeTruthy()
  })

  it('paginação e contagem seguem: a página leva as colunas do link; a contagem, o link sem colunas', () => {
    const ligado = aplicarManutencoes(fetchDe(), true)
    const pagina = xml(buildFetch(ligado, { page: 2, pageSize: 100, cookie: '<cookie page="1" />', sort: null, search: [] }))
    expect(pagina.documentElement.getAttribute('page')).toBe('2')
    expect(pagina.querySelector('link-entity[alias="bt_manut"] > attribute')).toBeTruthy()
    const contagem = xml(buildCountFetch(ligado, { search: [] }))
    expect(contagem.querySelector('link-entity[alias="bt_manut"]')).toBeTruthy()
    expect(contagem.querySelector('link-entity[alias="bt_manut"] > attribute')).toBeNull()
    expect(contagem.querySelectorAll('entity > attribute').length).toBe(1)
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/domain/manutencao.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 2: Implementação**

```ts
// apps/shell/src/pages/geral/domain/manutencao.ts
import { parse } from './fetch'
import { parseLayout } from './layout'
import type { View } from './types'

/**
 * Linhas de manutenção na Geral (manutenções v2, plano 3; spec 2026-11-16-manutencoes-v2-design.md, "Shell › Geral").
 * A linha é `cr40f_reservadeveculos` com `new_categoriadoitem` = Manutenção, ligada à manutenção por `cr40f_om`.
 */
export const CATEGORIA_ITEM = 'new_categoriadoitem'
export const CATEGORIA_MANUTENCAO = 100000001
export const MOTORISTA = 'cr40f_motorista'
export const SAIDA = 'cr40f_dataehorriodesada'
const FATURAMENTO = 'cr40f_statusdefaturamento'
/** Apelido do link-entity da manutenção na consulta: as colunas voltam como `bt_manut.<coluna>`. */
export const ALIAS_MANUTENCAO = 'bt_manut'
const TABELA_MANUTENCAO = 'cr40f_manutencoes'
const ID_MANUTENCAO = 'cr40f_manutencoesid'
const LIGACAO = 'cr40f_om'
/** Colunas da manutenção que o desenho da linha usa. */
export const COLUNAS_MANUTENCAO = ['cr40f_id', 'cr40f_descricao', 'cr40f_graudamanutencao', 'cr40f_status', 'cr40f_janelainicio', 'cr40f_janelafim', 'cr40f_agendarpara'] as const
/** Campos da própria linha que o desenho usa mesmo quando a visão não mostra a coluna. */
export const CAMPOS_DA_LINHA = [CATEGORIA_ITEM, LIGACAO, 'cr40f_veiculo', MOTORISTA, SAIDA] as const

/**
 * Exceções ao padrão de "Mostrar manutenções", pelo id da visão em minúsculas. Começa vazio: a Tarefa 1 do plano 3
 * lista as visões do DEV com o resultado da regra, e só a visão que ela classificar errado (confirmada pelo Renan) entra aqui.
 */
export const PADRAO_POR_VISAO: Readonly<Record<string, boolean>> = {}

const VALOR = String(CATEGORIA_MANUTENCAO)
const ESCONDIDAS = `ne:${VALOR}|null:`
const MOSTRADAS = `eq:${VALOR}|ne:${VALOR}|null:`
type Marca = 'escondidas' | 'mostradas'
const filhos = (el: Element) => Array.from(el.children)
const texto = (doc: Document) => new XMLSerializer().serializeToString(doc)

/** `<filter type="or">` só com condições de categoria, no formato que o shell grava; qualquer outro formato não é a marca. */
function lerMarca(el: Element): Marca | null {
  if (el.tagName !== 'filter' || el.getAttribute('type') !== 'or') return null
  const condicoes = filhos(el)
  if (!condicoes.length || condicoes.some((c) => c.tagName !== 'condition' || c.getAttribute('attribute') !== CATEGORIA_ITEM)) return null
  const chave = condicoes.map((c) => `${c.getAttribute('operator')}:${c.getAttribute('value') ?? ''}`).sort().join('|')
  return chave === ESCONDIDAS ? 'escondidas' : chave === MOSTRADAS ? 'mostradas' : null
}

/** Desligado: `ne` ou `null` (o `ne` sozinho não devolve linha sem categoria). Ligado: a tautologia que nomeia a manutenção. */
function criarMarca(doc: Document, mostrar: boolean) {
  const filtro = doc.createElement('filter')
  filtro.setAttribute('type', 'or')
  const operadores: [string, string | null][] = mostrar ? [['eq', VALOR], ['ne', VALOR], ['null', null]] : [['ne', VALOR], ['null', null]]
  for (const [operador, valor] of operadores) {
    const condicao = doc.createElement('condition')
    condicao.setAttribute('attribute', CATEGORIA_ITEM)
    condicao.setAttribute('operator', operador)
    if (valor != null) condicao.setAttribute('value', valor)
    filtro.appendChild(condicao)
  }
  return filtro
}

/**
 * Padrão da visão sem marca (D2): ligado quando ela é de programação (mostra a coluna Motorista ou filtra o motorista)
 * e não é de faturamento (nenhuma condição em `cr40f_statusdefaturamento`).
 */
export function padraoManutencoes(view: Pick<View, 'id' | 'fetchxml' | 'layoutxml'>, excecoes: Readonly<Record<string, boolean>> = PADRAO_POR_VISAO): boolean {
  const excecao = excecoes[view.id.toLowerCase()]
  if (excecao !== undefined) return excecao
  const { entity } = parse(view.fetchxml)
  const filtra = (attribute: string) => entity.querySelector(`condition[attribute="${attribute}"]`) != null
  const mostraMotorista = parseLayout(view.layoutxml).some((c) => !c.alias && c.attribute === MOTORISTA)
  return (mostraMotorista || filtra(MOTORISTA)) && !filtra(FATURAMENTO)
}

/** "Mostrar manutenções" da visão e o FetchXML dela sem a marca (o que a tela usa para filtros, busca e consulta). */
export type ManutencoesDaVisao = { fetchxml: string; mostrar: boolean; gravado: boolean }

/** Lê a marca gravada (e a tira do FetchXML); sem marca, o padrão da visão. FetchXML inválido fica como veio, desligado. */
export function lerManutencoesDaVisao(view: Pick<View, 'id' | 'fetchxml' | 'layoutxml'>): ManutencoesDaVisao {
  try {
    const { doc, entity } = parse(view.fetchxml)
    let marca: Marca | null = null
    for (const filtro of filhos(entity)) {
      const lida = lerMarca(filtro)
      if (!lida) continue
      marca = lida
      filtro.remove()
    }
    if (!marca) return { fetchxml: view.fetchxml, mostrar: padraoManutencoes(view), gravado: false }
    return { fetchxml: texto(doc), mostrar: marca === 'mostradas', gravado: true }
  } catch {
    return { fetchxml: view.fetchxml, mostrar: false, gravado: false }
  }
}

/** FetchXML para gravar na visão com o liga/desliga explícito; a marca anterior, se houver, sai. */
export function gravarManutencoesNaVisao(fetchxml: string, mostrar: boolean): string {
  const { doc, entity } = parse(fetchxml)
  for (const filtro of filhos(entity)) if (lerMarca(filtro)) filtro.remove()
  entity.appendChild(criarMarca(doc, mostrar))
  return texto(doc)
}

/**
 * FetchXML da consulta. Ligado: os campos da linha e o link-entity outer da manutenção (N:1 por `cr40f_om`, não muda a
 * contagem nem a paginação). Desligado: o filtro que tira só a categoria Manutenção.
 */
export function aplicarManutencoes(fetchxml: string, mostrar: boolean): string {
  const { doc, entity } = parse(fetchxml)
  if (!mostrar) {
    entity.appendChild(criarMarca(doc, false))
    return texto(doc)
  }
  const atuais = filhos(entity)
  if (!atuais.some((c) => c.tagName === 'all-attributes')) {
    for (const nome of CAMPOS_DA_LINHA) {
      if (atuais.some((c) => c.tagName === 'attribute' && c.getAttribute('name') === nome)) continue
      const atributo = doc.createElement('attribute')
      atributo.setAttribute('name', nome)
      entity.insertBefore(atributo, entity.firstChild)
    }
  }
  if (!atuais.some((c) => c.tagName === 'link-entity' && c.getAttribute('alias') === ALIAS_MANUTENCAO)) {
    const link = doc.createElement('link-entity')
    link.setAttribute('name', TABELA_MANUTENCAO)
    link.setAttribute('from', ID_MANUTENCAO)
    link.setAttribute('to', LIGACAO)
    link.setAttribute('link-type', 'outer')
    link.setAttribute('alias', ALIAS_MANUTENCAO)
    for (const nome of COLUNAS_MANUTENCAO) {
      const atributo = doc.createElement('attribute')
      atributo.setAttribute('name', nome)
      link.appendChild(atributo)
    }
    entity.appendChild(link)
  }
  return texto(doc)
}
```

Se a Tarefa 1 registrou exceções que o Renan aprovou (ponto 1), acrescente-as em `PADRAO_POR_VISAO`, com o id em minúsculas e um comentário com o nome da visão. Para cada exceção, acrescente ao teste "a exceção pelo id da visão vence a regra" uma linha `expect(padraoManutencoes(visao(fetchDe(), layoutDe('cr40f_id'), '<id>'))).toBe(<valor>)`, sem passar o segundo argumento.

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/domain/manutencao.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/shell/src/pages/geral/domain/manutencao.ts apps/shell/src/pages/geral/domain/manutencao.test.ts
git commit -m "feat(geral): liga/desliga de manutenções no FetchXML da visão e da consulta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Leitura da linha de manutenção (`domain/manutencao.ts`, parte 2)

**Files:**
- Modify: `apps/shell/src/pages/geral/domain/manutencao.ts`
- Test: `apps/shell/src/pages/geral/domain/manutencao.test.ts`

**Interfaces:**
- Consumes: `diaSP`, `formatBR`, `toDateOnly` (`frota/data/dates.ts`); `GRAU`, `STATUS_OPTIONS`, `TONE`, `label`, `Tone` (`frota/data/schema.ts`); `atrasada`, `rotuloJanela`, `Janela` (`frota/domain/janela.ts`).
- Produces:
  - tipos `LinhaManutencao` e `Trecho`;
  - funções `ehLinhaDeManutencao(row)`, `lerLinhaManutencao(row, hoje)`, `avisoForaDaJanela(saidaIso, m)`, `editavelNaManutencao(column)`, `trechosDaManutencao(columns)` e `colunasDaManutencao(columns)`.

- [ ] **Step 1: Testes que falham**

Acrescente ao fim de `manutencao.test.ts`. Junte os nomes novos ao `import` de `./manutencao` e acrescente o import de tipos:

```ts
import { avisoForaDaJanela, colunasDaManutencao, ehLinhaDeManutencao, lerLinhaManutencao, trechosDaManutencao } from './manutencao'
import type { Row } from '@betinhos/dataverse'
import type { Column } from './types'

const F = '@OData.Community.Display.V1.FormattedValue'
const HOJE = '2026-11-18'
const linha = (extra: Row = {}): Row => ({
  cr40f_reservadeveculosid: 'r1', new_categoriadoitem: 100000001, _cr40f_om_value: '{m1}', [`_cr40f_veiculo_value${F}`]: 'ABC1D23',
  cr40f_dataehorriodesada: '2026-11-23T03:00:00Z',
  'bt_manut.cr40f_id': 'M-1', 'bt_manut.cr40f_descricao': 'Freio com ruído', 'bt_manut.cr40f_graudamanutencao': 4,
  'bt_manut.cr40f_status': 202410001, 'bt_manut.cr40f_janelainicio': '2026-11-23', 'bt_manut.cr40f_janelafim': '2026-11-29',
  ...extra,
})
const coluna = (key: string, width = 120): Column => {
  const dot = key.indexOf('.')
  return { key, attribute: dot < 0 ? key : key.slice(dot + 1), alias: dot < 0 ? null : key.slice(0, dot), entity: null, width }
}

describe('linha de manutenção', () => {
  it('reconhece a linha pela categoria e pela ligação com a manutenção', () => {
    expect(ehLinhaDeManutencao(linha())).toBe(true)
    expect(ehLinhaDeManutencao(linha({ new_categoriadoitem: 100000000 }))).toBe(false)
    expect(ehLinhaDeManutencao(linha({ _cr40f_om_value: null }))).toBe(false)
    expect(lerLinhaManutencao({ new_categoriadoitem: 100000000 }, HOJE)).toBeNull()
  })

  it('lê o resumo: veículo, problema, grau, status, janela', () => {
    expect(lerLinhaManutencao(linha(), HOJE)).toEqual({
      manutencaoId: 'm1', codigo: 'M-1', veiculo: 'ABC1D23', descricao: 'Freio com ruído', grau: 'Urgente',
      status: 202410001, statusRotulo: 'Agendado', statusTom: 'info',
      janela: { inicio: '2026-11-23', fim: '2026-11-29' }, janelaRotulo: 'Semana de 23/11 a 29/11/2026',
      atrasada: false, foraDaJanela: false,
    })
  })

  it('atrasada: janela vencida em Agendado ou Programado; registro antigo usa a data de agendamento', () => {
    const programada = lerLinhaManutencao(linha({ 'bt_manut.cr40f_status': 202410005, 'bt_manut.cr40f_janelainicio': '2026-11-15', 'bt_manut.cr40f_janelafim': '2026-11-15', cr40f_dataehorriodesada: '2026-11-15T12:00:00Z' }), HOJE)
    expect(programada).toMatchObject({ statusRotulo: 'Programado', janelaRotulo: '15/11/2026', atrasada: true, foraDaJanela: false })
    const antiga = lerLinhaManutencao(linha({ 'bt_manut.cr40f_janelainicio': null, 'bt_manut.cr40f_janelafim': null, 'bt_manut.cr40f_agendarpara': '2026-11-10T03:00:00Z' }), HOJE)
    expect(antiga).toMatchObject({ janela: null, janelaRotulo: 'Agendada para 10/11/2026', atrasada: true })
    expect(lerLinhaManutencao(linha({ 'bt_manut.cr40f_status': 202410002, 'bt_manut.cr40f_janelafim': '2026-11-01' }), HOJE)?.atrasada).toBe(false)
  })

  it('sem dados da manutenção, rótulos legíveis no lugar', () => {
    const vazia = lerLinhaManutencao({ new_categoriadoitem: 100000001, _cr40f_om_value: 'm9' }, HOJE)
    expect(vazia).toMatchObject({ veiculo: 'Sem veículo', descricao: 'Sem descrição', grau: null, status: null, statusRotulo: 'Sem status', statusTom: 'neutral', janelaRotulo: 'Sem janela', atrasada: false })
  })

  it('fora da janela: selo na linha e aviso que não bloqueia', () => {
    const fora = lerLinhaManutencao(linha({ cr40f_dataehorriodesada: '2026-11-18T13:00:00Z' }), HOJE)!
    expect(fora.foraDaJanela).toBe(true)
    expect(avisoForaDaJanela('2026-11-18T13:00:00Z', fora)).toBe('A saída de 18/11/2026 ficou fora da janela da manutenção (Semana de 23/11 a 29/11/2026). A data foi gravada; confira com o gestor de frota.')
    expect(avisoForaDaJanela('2026-11-25T13:00:00Z', fora)).toBeNull()
    expect(avisoForaDaJanela(null, fora)).toBeNull()
    expect(avisoForaDaJanela('2026-11-18T13:00:00Z', { janela: null, janelaRotulo: 'Sem janela' })).toBeNull()
  })

  it('trechos: motorista e saída na própria coluna; o resto junta, o primeiro trecho com o resumo', () => {
    const cols = ['cr40f_id', 'cr40f_status', 'cr40f_cliente', 'cr40f_dataehorriodesada', 'cr40f_motorista', 'cr40f_trajeto', 'x__cr40f_Motorista.cr40f_motorista'].map((k) => coluna(k))
    expect(trechosDaManutencao(cols)).toEqual([
      { tipo: 'resumo', key: 'cr40f_status', span: 2 },
      { tipo: 'campo', column: cols[3] },
      { tipo: 'campo', column: cols[4] },
      { tipo: 'vazio', key: 'cr40f_trajeto', span: 2 },
    ])
    expect(trechosDaManutencao([coluna('cr40f_id')])).toEqual([])
    expect(trechosDaManutencao([coluna('cr40f_id'), coluna('cr40f_motorista')])).toEqual([{ tipo: 'campo', column: coluna('cr40f_motorista') }])
  })

  it('colunas da edição no celular: as da visão, ou criadas quando a visão não tem', () => {
    const motorista = coluna('cr40f_motorista', 200)
    expect(colunasDaManutencao([coluna('cr40f_id'), motorista])).toEqual([motorista, { key: 'cr40f_dataehorriodesada', attribute: 'cr40f_dataehorriodesada', alias: null, entity: null, width: 160 }])
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/domain/manutencao.test.ts`
Expected: FAIL (funções não existem).

- [ ] **Step 2: Implementação**

No topo de `manutencao.ts`, troque os imports por:

```ts
import type { Row } from '@betinhos/dataverse'
import { diaSP, formatBR, toDateOnly } from '../../frota/data/dates'
import { GRAU, STATUS_OPTIONS, TONE, label, type Tone } from '../../frota/data/schema'
import { atrasada, rotuloJanela, type Janela } from '../../frota/domain/janela'
import { parse } from './fetch'
import { parseLayout } from './layout'
import type { Column, View } from './types'
```

Acrescente ao fim do arquivo:

```ts
const F = '@OData.Community.Display.V1.FormattedValue'
const doLink = (coluna: (typeof COLUNAS_MANUTENCAO)[number]) => `${ALIAS_MANUTENCAO}.${coluna}`
const valorTexto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const valorNumero = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** O que o desenho da linha de manutenção mostra (tabela e cards). */
export type LinhaManutencao = {
  manutencaoId: string
  codigo: string | null
  veiculo: string
  descricao: string
  grau: string | null
  status: number | null
  statusRotulo: string
  statusTom: Tone
  janela: Janela | null
  janelaRotulo: string
  atrasada: boolean
  /** Saída programada fora da janela do encaixe: avisa, não bloqueia (spec). */
  foraDaJanela: boolean
}

export const ehLinhaDeManutencao = (row: Row) => valorNumero(row[CATEGORIA_ITEM]) === CATEGORIA_MANUTENCAO && valorTexto(row[`_${LIGACAO}_value`]) != null

/** Resumo da linha de manutenção; `null` para serviço, troca ou linha de manutenção sem a ligação `cr40f_om`. */
export function lerLinhaManutencao(row: Row, hoje: string): LinhaManutencao | null {
  if (!ehLinhaDeManutencao(row)) return null
  const status = valorNumero(row[doLink('cr40f_status')])
  const grau = valorNumero(row[doLink('cr40f_graudamanutencao')])
  const inicio = toDateOnly(row[doLink('cr40f_janelainicio')], 'DateOnly')
  const fim = toDateOnly(row[doLink('cr40f_janelafim')], 'DateOnly')
  const agendarPara = toDateOnly(row[doLink('cr40f_agendarpara')])
  const janela: Janela | null = inicio && fim ? { inicio, fim } : null
  const saida = diaSP(valorTexto(row[SAIDA]))
  return {
    manutencaoId: String(row[`_${LIGACAO}_value`]).replace(/[{}]/g, ''),
    codigo: valorTexto(row[doLink('cr40f_id')]),
    veiculo: valorTexto(row[`_cr40f_veiculo_value${F}`]) ?? 'Sem veículo',
    descricao: valorTexto(row[doLink('cr40f_descricao')]) ?? 'Sem descrição',
    grau: grau == null ? null : label(GRAU, grau, valorTexto(row[`${doLink('cr40f_graudamanutencao')}${F}`]) ?? String(grau)),
    status,
    statusRotulo: status == null ? 'Sem status' : label(STATUS_OPTIONS.manutencao, status, valorTexto(row[`${doLink('cr40f_status')}${F}`]) ?? String(status)),
    statusTom: status == null ? 'neutral' : TONE.manutencao[status] ?? 'neutral',
    janela,
    janelaRotulo: janela ? rotuloJanela(janela) : agendarPara ? `Agendada para ${formatBR(agendarPara)}` : 'Sem janela',
    atrasada: status != null && atrasada({ status, janelaFim: fim, agendarPara }, hoje),
    foraDaJanela: saida != null && janela != null && (saida < janela.inicio || saida > janela.fim),
  }
}

/** Texto do aviso depois de gravar uma saída fora da janela; `null` quando está dentro ou não há janela. */
export function avisoForaDaJanela(saidaIso: string | null, m: Pick<LinhaManutencao, 'janela' | 'janelaRotulo'>): string | null {
  const dia = diaSP(saidaIso)
  if (!dia || !m.janela || (dia >= m.janela.inicio && dia <= m.janela.fim)) return null
  return `A saída de ${formatBR(dia)} ficou fora da janela da manutenção (${m.janelaRotulo}). A data foi gravada; confira com o gestor de frota.`
}

/** Na linha de manutenção só o motorista e a saída da própria linha editam (spec). */
export const editavelNaManutencao = (column: Column) => !column.alias && (column.attribute === MOTORISTA || column.attribute === SAIDA)

/** Célula da linha de manutenção depois da primeira coluna: um campo editável ou um trecho que junta colunas vizinhas. */
export type Trecho = { tipo: 'campo'; column: Column } | { tipo: 'resumo' | 'vazio'; key: string; span: number }

/** Motorista e saída na própria coluna; as colunas vizinhas restantes viram um trecho só, e o primeiro trecho leva o resumo. */
export function trechosDaManutencao(columns: Column[]): Trecho[] {
  const trechos: Trecho[] = []
  let comResumo = false
  for (const column of columns.slice(1)) {
    if (editavelNaManutencao(column)) { trechos.push({ tipo: 'campo', column }); continue }
    const ultimo = trechos[trechos.length - 1]
    if (ultimo && ultimo.tipo !== 'campo') { ultimo.span += 1; continue }
    trechos.push({ tipo: comResumo ? 'vazio' : 'resumo', key: column.key, span: 1 })
    comResumo = true
  }
  return trechos
}

/** Colunas da edição da manutenção no celular: motorista e saída da visão, ou criadas aqui quando a visão não as tem. */
export function colunasDaManutencao(columns: Column[]): Column[] {
  return [MOTORISTA, SAIDA].map((attribute) => columns.find((c) => !c.alias && c.attribute === attribute) ?? { key: attribute, attribute, alias: null, entity: null, width: 160 })
}
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/domain/manutencao.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/shell/src/pages/geral/domain/manutencao.ts apps/shell/src/pages/geral/domain/manutencao.test.ts
git commit -m "feat(geral): resumo, atrasada e fora da janela da linha de manutenção

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: "Mostrar manutenções" na URL (`m=`)

**Files:**
- Modify: `apps/shell/src/pages/geral/domain/urlState.ts`
- Test: `apps/shell/src/pages/geral/domain/urlState.test.ts`

**Interfaces:**
- Produces: `UrlState.manutencoes?: boolean`, lido e escrito como `m=1` ou `m=0`.

- [ ] **Step 1: Teste que falha**

Acrescente ao `describe('urlState')`:

```ts
  it('"Mostrar manutenções" mudado na tela vai como m=1 ou m=0', () => {
    expect(new URLSearchParams(writeUrlState({ view: 'a', manutencoes: false })).get('m')).toBe('0')
    expect(readUrlState(new URLSearchParams(writeUrlState({ view: 'a', manutencoes: true })))).toEqual({ view: 'a', manutencoes: true })
    expect(readUrlState(new URLSearchParams('m=0'))).toEqual({ manutencoes: false })
    expect(readUrlState(new URLSearchParams('m=talvez'))).toEqual({})
    expect(new URLSearchParams(writeUrlState({ view: 'a' })).has('m')).toBe(false)
  })
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/domain/urlState.test.ts`
Expected: FAIL (o TypeScript recusa `manutencoes` e `m` não é lido).

- [ ] **Step 2: Implementação**

Em `urlState.ts`, troque a declaração do tipo:

```ts
/** Estado da tela que viaja na URL (`#/geral?view=…&q=…&sort=…&f=…&g=…&m=…`). `manutencoes`: só quando difere da visão. */
export type UrlState = { view?: string; q?: string; sort?: Sort; filters?: TableFilters; group?: ViewGroup; manutencoes?: boolean }
```

Em `readUrlState`, logo antes de `const f = params.get('f')`:

```ts
  const m = params.get('m')
  if (m === '1' || m === '0') state.manutencoes = m === '1'
```

Em `writeUrlState`, depois de `if (state.group) params.set('g', groupText(state.group))`:

```ts
  if (state.manutencoes != null) params.set('m', state.manutencoes ? '1' : '0')
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/domain/urlState.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/shell/src/pages/geral/domain/urlState.ts apps/shell/src/pages/geral/domain/urlState.test.ts
git commit -m "feat(geral): liga/desliga de manutenções no estado da URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Mock com linhas de manutenção e visão de faturamento

**Files:**
- Modify: `apps/shell/src/pages/geral/data/mock.ts`, `apps/shell/src/pages/geral/data/source.ts`, `apps/shell/src/pages/geral/testUtils.ts`
- Test: `apps/shell/src/pages/geral/data/data.test.ts`

**Interfaces:**
- Consumes: `ALIAS_MANUTENCAO`, `CATEGORIA_MANUTENCAO` (Tarefa 2); `segundaDe`, `somarDias` (`frota/domain/janela.ts`).
- Produces:
  - `createMockManutencoes(now)` e `MOCK_MANUTENCOES = 2` (OS-9001 = m2 e OS-9002 = m3, as manutenções do mock da Frota);
  - a visão `mock-faturamento` ("💲 Faturamento");
  - `SourceOptions.manutencoes?: boolean`, desligado por padrão;
  - em `testUtils`, `mockSource(actual, { manutencoes })` e o contador `hooks.paginas`.

- [ ] **Step 1: Testes que falham**

Em `data/data.test.ts`, troque o import do mock e acrescente o do domínio:

```ts
import { applyMockFetch, createMockManutencoes, createMockRows, createMockViews, MOCK_ATTRIBUTES, MOCK_MANUTENCOES, MOCK_ROW_COUNT } from './mock'
import { aplicarManutencoes } from '../domain/manutencao'
```

Acrescente ao fim do arquivo:

```ts
describe('mock — linhas de manutenção (manutenções v2, plano 3)', () => {
  it('m2 a programar e m3 programada, ligadas às manutenções do mock da Frota', () => {
    const [m2, m3] = createMockManutencoes(new Date('2026-11-18T15:00:00Z'))
    expect(createMockManutencoes(new Date()).length).toBe(MOCK_MANUTENCOES)
    expect(m2).toMatchObject({ cr40f_id: 'OS-9001', new_categoriadoitem: 100000001, _cr40f_om_value: 'm2', _cr40f_motorista_value: null, cr40f_status: 202410001, cr40f_dataehorriodesada: '2026-11-23T03:00:00.000Z', 'bt_manut.cr40f_janelainicio': '2026-11-23', 'bt_manut.cr40f_janelafim': '2026-11-29', 'bt_manut.cr40f_status': 202410001 })
    expect(m3).toMatchObject({ cr40f_id: 'OS-9002', _cr40f_om_value: 'm3', cr40f_status: 202410005, new_foiprogramado: true, 'bt_manut.cr40f_janelafim': '2026-11-15', 'bt_manut.cr40f_status': 202410005 })
  })

  it('só entram com `manutencoes: true`, e o filtro de desligado as tira', async () => {
    const sem = createSource({ mode: 'mock' }, { latency: 0 })
    const com = createSource({ mode: 'mock' }, { latency: 0, manutencoes: true })
    const agenda = (await com.views()).find((v) => v.padrao)!
    expect(await sem.count({ fetchxml: agenda.fetchxml, query: '', quickFind: [] })).toBe(MOCK_ROW_COUNT)
    expect(await com.count({ fetchxml: agenda.fetchxml, query: '', quickFind: [] })).toBe(MOCK_ROW_COUNT + MOCK_MANUTENCOES)
    expect(await com.count({ fetchxml: aplicarManutencoes(agenda.fetchxml, false), query: '', quickFind: [] })).toBe(MOCK_ROW_COUNT)
  })

  it('a visão de faturamento filtra o status de faturamento (vem com manutenções desligadas)', async () => {
    const views = await createSource({ mode: 'mock' }, { latency: 0 }).views()
    expect(views.find((v) => v.id === 'mock-faturamento')?.fetchxml).toContain('cr40f_statusdefaturamento')
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/data/data.test.ts`
Expected: FAIL (o mock não exporta `createMockManutencoes` e `SourceOptions` não tem `manutencoes`).

- [ ] **Step 2: Mock**

Em `data/mock.ts`, acrescente aos imports:

```ts
import { ALIAS_MANUTENCAO, CATEGORIA_MANUTENCAO } from '../domain/manutencao'
import { segundaDe, somarDias } from '../../frota/domain/janela'
```

Depois de `const SEM_MOTORISTA_COLS = [...]`, acrescente:

```ts
const FATURAMENTO_COLS = ['cr40f_id', 'cr40f_dataehorriodesada', 'cr40f_cliente', 'cr40f_motorista', 'cr40f_statusdefaturamento', 'cr40f_cotao']
```

Em `createMockViews`, acrescente como último item da lista, depois da visão `mock-sem-cr-tenaris`:

```ts
    // Visão de faturamento: filtra o status de faturamento, então "Mostrar manutenções" vem desligado (plano 3, D2),
    // mesmo com a coluna Motorista. Pendente e Não Faturável: com o liga/desliga ligado, as manutenções aparecem nela.
    { id: 'mock-faturamento', nome: '💲 Faturamento', grupo: 'sistema', padrao: false, fetchxml: fetch(FATURAMENTO_COLS, '<condition attribute="cr40f_statusdefaturamento" operator="in"><value>202410005</value><value>202410011</value></condition>'), layoutxml: layout(FATURAMENTO_COLS) },
```

Depois de `createMockRows`, acrescente:

```ts
/** Linhas de manutenção do mock (OS-9001 e OS-9002). */
export const MOCK_MANUTENCOES = 2

/**
 * Linhas da Geral de categoria Manutenção (manutenções v2, plano 3), com as colunas do link `bt_manut` já preenchidas,
 * como a consulta ligada devolve. Apontam para m2 e m3 do mock da Frota, para a gaveta abrir o registro certo.
 */
export function createMockManutencoes(now: Date): Row[] {
  const hoje = spDay(now)
  const proxima = segundaDe(somarDias(hoje, 7))
  const passada = somarDias(hoje, -3)
  const m = (campo: string) => `${ALIAS_MANUTENCAO}.${campo}`
  const linha = (n: number, saida: string, extra: Row): Row => ({
    [ID_ATTRIBUTE]: `aaaaaaaa-0000-4000-8000-9${String(n).padStart(11, '0')}`,
    cr40f_id: `OS-${9000 + n}`,
    statecode: 0,
    statuscode: 1,
    new_categoriadoitem: CATEGORIA_MANUTENCAO,
    [`new_categoriadoitem${F}`]: 'Manutenção',
    cr40f_dataehorriodesada: saida,
    [`cr40f_dataehorriodesada${F}`]: formatDateTime(saida),
    createdon: saida,
    [`createdon${F}`]: formatDateTime(saida),
    cr40f_trajeto: 'Serviço de manutenção do veículo',
    cr40f_endereodesada: 'Manutenção de Veículo',
    cr40f_destino: 'Manutenção de Veículo',
    cr40f_passageirosetelefonedecontato: 'Manutenção de Veículo',
    cr40f_statusdefaturamento: 202410011,
    [`cr40f_statusdefaturamento${F}`]: 'Não Faturável',
    cr40f_tipodeveiculo: 202410000,
    [`cr40f_tipodeveiculo${F}`]: 'Básico',
    [m('cr40f_graudamanutencao')]: 2,
    [`${m('cr40f_graudamanutencao')}${F}`]: 'Média',
    [m('cr40f_agendarpara')]: null,
    ...extra,
  })
  const carlos = MOCK_LOOKUPS.cr40f_motorista[0]
  return [
    // m2 da Frota: encaixada na semana que vem e ainda a programar (sem motorista; saída no início da janela).
    linha(1, `${proxima}T03:00:00.000Z`, {
      cr40f_status: 202410001, [`cr40f_status${F}`]: 'Confirmado', new_foiprogramado: false,
      _cr40f_om_value: 'm2', [`_cr40f_om_value${F}`]: 'M2',
      _cr40f_veiculo_value: 'v2', [`_cr40f_veiculo_value${F}`]: 'TST2B22',
      _cr40f_motorista_value: null,
      [m('cr40f_id')]: 'M2', [m('cr40f_descricao')]: 'Manutenção fictícia m2',
      [m('cr40f_status')]: 202410001, [`${m('cr40f_status')}${F}`]: 'Agendado',
      [m('cr40f_janelainicio')]: proxima, [m('cr40f_janelafim')]: somarDias(proxima, 6),
    }),
    // m3 da Frota: programada com motorista num dia que já passou e sem conclusão, ou seja, atrasada.
    linha(2, `${passada}T12:00:00.000Z`, {
      cr40f_status: 202410005, [`cr40f_status${F}`]: 'Programado', new_foiprogramado: true,
      _cr40f_om_value: 'm3', [`_cr40f_om_value${F}`]: 'M3',
      _cr40f_veiculo_value: 'v1', [`_cr40f_veiculo_value${F}`]: 'TST1A11',
      _cr40f_motorista_value: carlos.id, [`_cr40f_motorista_value${F}`]: carlos.nome,
      [m('cr40f_id')]: 'M3', [m('cr40f_descricao')]: 'Manutenção fictícia m3',
      [m('cr40f_status')]: 202410005, [`${m('cr40f_status')}${F}`]: 'Programado',
      [m('cr40f_janelainicio')]: passada, [m('cr40f_janelafim')]: passada,
    }),
  ]
}
```

- [ ] **Step 3: Fonte do mock**

Em `data/source.ts`, troque o import do mock:

```ts
import { MOCK_ATTRIBUTES, MOCK_BINDS, MOCK_LOOKUPS, applyMockFetch, applyMockGroups, createMockManutencoes, createMockRows, createMockViews, mockProtecao } from './mock'
```

Troque a definição de `SourceOptions`:

```ts
/**
 * Opções do mock. `latency` multiplica as esperas simuladas (1 = as de `pnpm dev`; 0 = resposta imediata, para testes).
 * `pageSize` troca o tamanho da página só no mock: os testes de tela usam páginas menores, porque no jsdom renderizar e
 * consultar por papel 100 linhas custa caro e a maioria dos testes não precisa de tantas.
 * `manutencoes` acrescenta as linhas de manutenção (OS-9001 e OS-9002; manutenções v2, plano 3). A tela liga; os testes
 * que contam linhas ficam sem elas.
 */
export type SourceOptions = { latency?: number; pageSize?: number; manutencoes?: boolean }
```

Em `createMockSource`, troque a assinatura e a linha das linhas:

```ts
function createMockSource({ latency = 1, pageSize = PAGE_SIZE, manutencoes = false }: SourceOptions = {}): Source {
  const wait = (ms: number) => (latency === 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms * latency)))
  const now = new Date()
  const rows = [...createMockRows(now), ...(manutencoes ? createMockManutencoes(now) : [])]
```

- [ ] **Step 4: Ganchos de teste**

Em `testUtils.ts`:
- em `hooks`, acrescente `paginas: 0,` depois de `programada: false,`;
- troque a assinatura de `mockSource` e a criação da fonte:

```ts
/** Fábrica do vi.mock de './data/source': a fonte do mock sem latência e com páginas menores, com os ganchos acima. `manutencoes` liga as linhas OS-9001 e OS-9002. */
export function mockSource(actual: SourceModule, { pageSize = TEST_PAGE_SIZE, manutencoes = false }: { pageSize?: number; manutencoes?: boolean } = {}): SourceModule {
  return {
    ...actual,
    createSource: (host: Parameters<SourceModule['createSource']>[0]): Source => {
      // Sem a latência simulada do pnpm dev: os testes não esperam timers artificiais.
      const source = actual.createSource(host, { latency: 0, pageSize, manutencoes })
```

- no `page` do retorno, a primeira linha passa a contar as páginas pedidas:

```ts
        page: async (request) => {
          hooks.paginas += 1
          const page = await source.page(request)
```

- no `afterEach` de `usarAmbienteGeral`, acrescente `hooks.paginas = 0` depois de `hooks.mixedState = false`.

- [ ] **Step 5: Rodar (Betinhos-Renan)**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/data src/pages/geral/domain`
Expected: PASS. Os testes antigos do mock continuam com `MOCK_ROW_COUNT`, porque as manutenções só entram com `manutencoes: true`.

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/geral/data apps/shell/src/pages/geral/testUtils.ts
git commit -m "test(geral): mock com linhas de manutenção (m2, m3) e visão de faturamento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: Liga/desliga na `useGeral`: consulta, "Alterada", "Restaurar" e URL

**Files:**
- Modify: `apps/shell/src/pages/geral/useGeral.ts`, `apps/shell/src/pages/geral/useGeralViewState.ts`
- Test: `apps/shell/src/pages/geral/useGeral.manutencao.test.tsx`

**Interfaces:**
- Consumes: `lerManutencoesDaVisao`, `aplicarManutencoes` e `gravarManutencoesNaVisao` (Tarefa 2), `UrlState.manutencoes` (Tarefa 4), `SourceOptions.manutencoes` (Tarefa 5).
- Produces:
  - em `GeralState`, `mostrarManutencoes` e `manutencoesAlteradas`;
  - no retorno de `useGeral`, `setMostrarManutencoes(next)`, `resetManutencoes()` e `comManutencoes(fetchxml)`;
  - em `useGeralViewState`, as opções `manutencoesAlteradas` e `resetManutencoes`.

- [ ] **Step 1: Testes que falham**

```tsx
// apps/shell/src/pages/geral/useGeral.manutencao.test.tsx
// @vitest-environment jsdom
import { act, configure, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Row } from '@betinhos/dataverse'
import { createSource } from './data/source'
import { gravarManutencoesNaVisao } from './domain/manutencao'
import { useGeral } from './useGeral'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const make = () => createSource({ mode: 'mock' }, { latency: 0, manutencoes: true })
const manutencoes = (rows: Row[]) => rows.map((r) => String(r.cr40f_id)).filter((c) => c.startsWith('OS-90'))

describe('useGeral › Mostrar manutenções', () => {
  it('a Agenda (programação) já vem com as manutenções, entre os serviços, e a consulta leva o link da manutenção', async () => {
    const source = make()
    const page = vi.fn(source.page)
    const { result } = renderHook(() => useGeral({ ...source, page }))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    expect(result.current.mostrarManutencoes).toBe(true)
    expect(result.current.manutencoesAlteradas).toBe(false)
    expect(page.mock.calls[0][0].fetchxml).toContain('alias="bt_manut"')
    // Ordem da visão (saída crescente): m3 (3 dias atrás) abre a lista; m2 (semana que vem) fica entre os serviços.
    expect(String(result.current.rows[0].cr40f_id)).toBe('OS-9002')
    expect(manutencoes(result.current.rows)).toEqual(['OS-9002', 'OS-9001'])
  })

  it('desligar tira as manutenções, marca a mudança e vai para a URL; voltar ao da visão limpa', async () => {
    const onStateChange = vi.fn()
    const { result } = renderHook(() => useGeral(make(), { onStateChange }))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    act(() => result.current.setMostrarManutencoes(false))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(manutencoes(result.current.rows)).toEqual([]))
    expect(result.current.manutencoesAlteradas).toBe(true)
    expect(onStateChange).toHaveBeenLastCalledWith({ view: 'mock-agenda', manutencoes: false })
    act(() => result.current.resetManutencoes())
    await waitFor(() => expect(result.current.manutencoesAlteradas).toBe(false))
    expect(onStateChange).toHaveBeenLastCalledWith({ view: 'mock-agenda' })
    await waitFor(() => expect(manutencoes(result.current.rows).length).toBe(2))
  })

  it('a visão de faturamento vem desligada; ligar traz as manutenções (não faturáveis) nela', async () => {
    const { result } = renderHook(() => useGeral(make()))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    act(() => result.current.selectView('mock-faturamento'))
    await waitFor(() => expect(result.current.view?.id).toBe('mock-faturamento'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mostrarManutencoes).toBe(false)
    expect(manutencoes(result.current.rows)).toEqual([])
    act(() => result.current.setMostrarManutencoes(true))
    await waitFor(() => expect(manutencoes(result.current.rows).length).toBe(2))
    // Trocar de visão volta ao padrão de cada uma.
    act(() => result.current.selectView('mock-agenda'))
    await waitFor(() => expect(result.current.view?.id).toBe('mock-agenda'))
    expect(result.current.manutencoesAlteradas).toBe(false)
  })

  it('o estado inicial da URL desliga', async () => {
    const { result } = renderHook(() => useGeral(make(), { initial: { manutencoes: false } }))
    await waitFor(() => expect(result.current.view?.padrao).toBe(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mostrarManutencoes).toBe(false)
    expect(result.current.manutencoesAlteradas).toBe(true)
    expect(manutencoes(result.current.rows)).toEqual([])
  })

  it('visão gravada com a marca abre como foi salva, e a marca não vira filtro nem condição só de leitura', async () => {
    const source = make()
    const [agenda] = await source.views()
    const salva = await source.createView({ name: 'Sem manutenções', fetchxml: gravarManutencoesNaVisao(agenda.fetchxml, false), layoutxml: agenda.layoutxml })
    const { result } = renderHook(() => useGeral(source, { initial: { view: salva.id } }))
    await waitFor(() => expect(result.current.view?.id).toBe(salva.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mostrarManutencoes).toBe(false)
    expect(result.current.manutencoesAlteradas).toBe(false)
    expect(result.current.view?.fetchxml).not.toContain('new_categoriadoitem')
    expect(result.current.viewFilters.locked.some((l) => l.label.startsWith('uma destas'))).toBe(false)
    expect(manutencoes(result.current.rows)).toEqual([])
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/useGeral.manutencao.test.tsx`
Expected: FAIL (`mostrarManutencoes` não existe).

- [ ] **Step 2: `useGeral.ts`**

1. Imports. Depois de `import { geralFilterFields, hasActiveFilters, injectTableFilters } from './domain/tableFilters'`:

```ts
import { aplicarManutencoes, lerManutencoesDaVisao } from './domain/manutencao'
```

2. Em `GeralState`, depois de `cells: Map<string, CellStatus>`:

```ts
  /** "Mostrar manutenções" valendo na tela: o gravado na visão, o padrão dela ou a mudança do usuário. */
  mostrarManutencoes: boolean
  /** O usuário mudou o liga/desliga em relação à visão (conta como "Alterada" e vai para a URL). */
  manutencoesAlteradas: boolean
```

3. Troque o bloco das colunas adicionadas e do `view`:

```ts
  const [extras, setExtras] = useState<ResolvedLinkColumn[]>([])
  const view = useMemo(() => {
    if (!baseView || !extras.length) return baseView
    try { return { ...baseView, fetchxml: addExtraLinks(baseView.fetchxml, extras) } } catch { return baseView }
  }, [baseView, extras])
```

por:

```ts
  const [extras, setExtras] = useState<ResolvedLinkColumn[]>([])
  /** "Mostrar manutenções" da visão (marca gravada ou o padrão dela) e o FetchXML sem a marca: é dele que filtros, busca e consulta partem. */
  const manutencoesDaVisao = useMemo(() => (baseView ? lerManutencoesDaVisao(baseView) : null), [baseView])
  const mostrarDaVisao = manutencoesDaVisao?.mostrar ?? false
  /** `null` = o da visão; mudar na tela vira um valor próprio (como os filtros) até trocar de visão ou regravá-la. */
  const [manutencoesOverride, setManutencoesState] = useState<boolean | null>(null)
  const mostrarManutencoes = manutencoesOverride ?? mostrarDaVisao
  const manutencoesAlteradas = manutencoesOverride != null && manutencoesOverride !== mostrarDaVisao
  const view = useMemo(() => {
    if (!baseView || !manutencoesDaVisao) return baseView
    const semMarca = manutencoesDaVisao.fetchxml === baseView.fetchxml ? baseView : { ...baseView, fetchxml: manutencoesDaVisao.fetchxml }
    if (!extras.length) return semMarca
    try { return { ...semMarca, fetchxml: addExtraLinks(semMarca.fetchxml, extras) } } catch { return semMarca }
  }, [baseView, manutencoesDaVisao, extras])
```

4. Troque o `effectiveFetch`:

```ts
  const effectiveFetch = useMemo(() => {
    if (!view) return null
    if (!attributes || !filtersOverride) return view.fetchxml
    if (!hasActiveFilters(filtersOverride)) return viewFilters.base
    try { return injectTableFilters(viewFilters.base, filtersOverride, filterFields) } catch { return view.fetchxml }
  }, [view, attributes, filtersOverride, filterFields, viewFilters.base])
```

por:

```ts
  /** FetchXML de consulta com "Mostrar manutenções": ligado leva o link da manutenção; desligado, o filtro que as tira. */
  const comManutencoes = useCallback((fetchxml: string) => {
    try { return aplicarManutencoes(fetchxml, mostrarManutencoes) } catch { return fetchxml }
  }, [mostrarManutencoes])
  const effectiveFetch = useMemo(() => {
    if (!view) return null
    const comFiltros = (() => {
      if (!attributes || !filtersOverride) return view.fetchxml
      if (!hasActiveFilters(filtersOverride)) return viewFilters.base
      try { return injectTableFilters(viewFilters.base, filtersOverride, filterFields) } catch { return view.fetchxml }
    })()
    return comManutencoes(comFiltros)
  }, [view, attributes, filtersOverride, filterFields, viewFilters.base, comManutencoes])
```

5. Em `enterView`, depois de `setExtras([])`:

```ts
    setManutencoesState(null)
```

6. No efeito 1 (estado inicial), depois de `if (initial.group) setGroupState(initial.group)`:

```ts
            if (initial.manutencoes != null) setManutencoesState(initial.manutencoes)
```

7. Depois de `const resetFilters = useCallback(() => setFiltersState(null), [])`:

```ts
  /** Liga ou desliga "Mostrar manutenções" na tela; vale até trocar de visão, e "Salvar" grava na visão. */
  const setMostrarManutencoes = useCallback((next: boolean) => setManutencoesState(next), [])
  /** Volta ao "Mostrar manutenções" da visão. */
  const resetManutencoes = useCallback(() => setManutencoesState(null), [])
```

8. No efeito que avisa `onStateChange`, troque o final:

```ts
    if (group) state.group = group
    onStateChange.current?.(state)
  }, [viewId, query, sort, filtersOverride, group])
```

por:

```ts
    if (group) state.group = group
    if (manutencoesAlteradas) state.manutencoes = mostrarManutencoes
    onStateChange.current?.(state)
  }, [viewId, query, sort, filtersOverride, group, manutencoesAlteradas, mostrarManutencoes])
```

9. No fim, troque a linha do `state`:

```ts
  const state: GeralState = { views, viewsError, view, columns, attributes, attributesError, quickFind, rows, total, more, pagesLoaded, loading, loadingMore, pageError, loadError, sort, query, filters, group, buckets, groupNotice, filterFields, selected, cells, mostrarManutencoes, manutencoesAlteradas }
```

No `return`, troque o início `return { ...state, filtersIgnored, defaultOrder,` por:

```ts
  return { ...state, filtersIgnored, defaultOrder, setMostrarManutencoes, resetManutencoes, comManutencoes,
```

O resto da linha não muda.

- [ ] **Step 3: `useGeralViewState.ts`**

Em `Options`, depois de `hiddenByDefault?: string[]`:

```ts
  /** "Mostrar manutenções" mudado na tela: conta como "Alterada"; "Restaurar" volta ao da visão. */
  manutencoesAlteradas?: boolean
  resetManutencoes?: () => void
```

Troque o bloco do `restore`:

```ts
  const { selectView, reloadViews, createView, updateView, renameView, deleteView, resetFilters } = o
```

por:

```ts
  const { selectView, reloadViews, createView, updateView, renameView, deleteView, resetFilters, resetManutencoes } = o
```

Dentro de `restore`, troque:

```ts
    setGroup(null)
  }, [views, active.id, selectView, setPrefs, setSort, setFilters, resetFilters, setGroup])
```

por:

```ts
    setGroup(null)
    resetManutencoes?.()
  }, [views, active.id, selectView, setPrefs, setSort, setFilters, resetFilters, setGroup, resetManutencoes])
```

No `state`, troque a linha do `dirty`:

```ts
    dirty: !sameConfig(withGroup(config, null), baseline) || Boolean(o.manutencoesAlteradas),
```

- [ ] **Step 4: Rodar (Betinhos-Renan)**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/useGeral.manutencao.test.tsx src/pages/geral/useGeral.test.tsx src/pages/geral/useGeral.agrupar.test.tsx && pnpm --filter @betinhos/shell typecheck`
Expected: PASS. Os testes antigos da `useGeral` continuam: o mock deles não tem manutenções, e o link a mais na consulta não muda o resultado do mock. O typecheck sai sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/geral/useGeral.ts apps/shell/src/pages/geral/useGeralViewState.ts apps/shell/src/pages/geral/useGeral.manutencao.test.tsx
git commit -m "feat(geral): Mostrar manutenções por visão na consulta, em Alterada e na URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: A gaveta avisa a lista que está atrás (`REGISTRO_ALTERADO`)

**Files:**
- Modify: `apps/shell/src/app/registroAberto.ts`, `apps/shell/src/app/gavetas/GavetaManutencao.tsx`
- Test: `apps/shell/src/app/GavetaRegistro.test.tsx`

**Interfaces:**
- Produces:
  - a constante `REGISTRO_ALTERADO = 'betinhos:registro-alterado'` e o tipo `RegistroAlterado = { table; id }`;
  - `avisarRegistroAlterado(table, id)` e `useRegistroAlterado(table, callback)`;
  - no adaptador da manutenção, o `onChanged` passa a avisar.

- [ ] **Step 1: Testes que falham**

Em `GavetaRegistro.test.tsx`, troque os imports:

```tsx
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GavetaRegistro } from './GavetaRegistro'
import { abrirGavetaRegistro, avisarRegistroAlterado, fecharGavetaRegistro, gavetaRegistroAberta, REGISTRO_ALTERADO, useRegistroAlterado } from './registroAberto'
```

Acrescente ao fim do arquivo:

```tsx
it('ação na gaveta da manutenção avisa a lista que está atrás (REGISTRO_ALTERADO)', async () => {
  const ouvido = vi.fn()
  const ouvir = (event: Event) => ouvido((event as CustomEvent).detail)
  window.addEventListener(REGISTRO_ALTERADO, ouvir)
  try {
    // Host novo: a fonte da Frota é guardada por host, e o teste anterior já cancelou a m1 no host do arquivo.
    render(<GavetaRegistro host={{ mode: 'mock' }} />)
    act(() => abrirGavetaRegistro('cr40f_manutencoes', 'm1'))
    const gaveta = await screen.findByRole('dialog', { name: 'Freio com ruído (fictício)' })
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Cancelar manutenção' }))
    await act(async () => { fireEvent.click(within(gaveta).getByRole('button', { name: 'Cancelar manutenção' })) })
    await waitFor(() => expect(ouvido).toHaveBeenCalledWith({ table: 'cr40f_manutencoes', id: 'm1' }))
  } finally {
    window.removeEventListener(REGISTRO_ALTERADO, ouvir)
  }
})

it('useRegistroAlterado chama só para a tabela pedida, com o id do registro', () => {
  const chamado = vi.fn()
  function Ouvinte() { useRegistroAlterado('cr40f_manutencoes', chamado); return null }
  render(<Ouvinte />)
  act(() => avisarRegistroAlterado('cr40f_veiculos', 'v1'))
  act(() => avisarRegistroAlterado('cr40f_manutencoes', 'm2'))
  expect(chamado).toHaveBeenCalledTimes(1)
  expect(chamado).toHaveBeenCalledWith('m2')
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/app/GavetaRegistro.test.tsx`
Expected: FAIL (`REGISTRO_ALTERADO` não existe).

- [ ] **Step 2: Implementação**

Em `registroAberto.ts`, troque `import { useSyncExternalStore } from 'react'` por:

```ts
import { useEffect, useRef, useSyncExternalStore } from 'react'
```

Acrescente ao fim do arquivo:

```ts
/**
 * Evento de janela: uma gaveta gravou num registro (ação da manutenção, por exemplo). A lista que está atrás relê; o
 * padrão é o de `DOCUMENTOS_ALTERADOS`. `detail` é `{ table, id }`.
 */
export const REGISTRO_ALTERADO = 'betinhos:registro-alterado'
export type RegistroAlterado = RegistroAberto

export function avisarRegistroAlterado(table: TabelaComGaveta, id: string) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent<RegistroAlterado>(REGISTRO_ALTERADO, { detail: { table, id } }))
}

/** Chama `callback(id)` quando uma gaveta grava num registro da tabela; `callback` pode mudar a cada render. */
export function useRegistroAlterado(table: TabelaComGaveta, callback: (id: string) => void) {
  const atual = useRef(callback)
  atual.current = callback
  useEffect(() => {
    const ouvir = (event: Event) => {
      const detalhe = (event as CustomEvent<RegistroAlterado>).detail
      if (detalhe?.table === table) atual.current(detalhe.id)
    }
    window.addEventListener(REGISTRO_ALTERADO, ouvir)
    return () => window.removeEventListener(REGISTRO_ALTERADO, ouvir)
  }, [table])
}
```

Em `app/gavetas/GavetaManutencao.tsx`, troque o import do registro:

```ts
import { abrirGavetaRegistro, avisarRegistroAlterado } from '../registroAberto'
```

Troque o comentário e o `return` final:

```tsx
/**
 * Gaveta única da manutenção (a mesma da Frota) por cima de outra lista. É a que a linha de manutenção da Geral abre
 * (plano 3) e a que o link do lookup `cr40f_om` abre em qualquer lista. A fonte é a da Frota no mesmo `host`, então
 * gravar aqui também vence o cache da tela Frota; cada ação avisa a lista de trás (`REGISTRO_ALTERADO`), que relê.
 * O hospedeiro (`GavetaRegistro`) já traz o `ToastProvider` que a gaveta usa para os avisos; o `hoje` é o da própria
 * gaveta (hoje em São Paulo).
 */
```

```tsx
  return <GavetaManutencao source={fonte.source} id={id} onClose={onClose} onChanged={() => avisarRegistroAlterado('cr40f_manutencoes', id)} onOpenVeiculo={(veiculoId) => abrirGavetaRegistro('cr40f_veiculos', veiculoId)} />
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/app`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/shell/src/app/registroAberto.ts apps/shell/src/app/gavetas/GavetaManutencao.tsx apps/shell/src/app/GavetaRegistro.test.tsx
git commit -m "feat(shell): gaveta avisa a lista de trás depois de gravar (REGISTRO_ALTERADO)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: Desenho da linha de manutenção (tabela, cards e sheet)

**Files:**
- Create: `apps/shell/src/pages/geral/components/ManutencaoResumo.tsx`
- Modify: `apps/shell/src/pages/geral/components/GeralTable.tsx`, `GeralCards.tsx`, `GeralSheet.tsx`, `apps/shell/src/pages/geral/geral.css`
- Test: `apps/shell/src/pages/geral/components/ManutencaoLinha.test.tsx`

**Interfaces:**
- Consumes: `LinhaManutencao`, `trechosDaManutencao`, `lerLinhaManutencao` (Tarefa 3) e `createMockManutencoes` (Tarefa 5).
- Produces:
  - o componente `ManutencaoResumo({ m, quebra? })`;
  - em `GeralTable` e `GeralCards`, a prop `manutencao?: { ler(row): LinhaManutencao | null; abrir(m): void }`;
  - em `GeralSheet`, a prop `manutencao?: { titulo: string }`;
  - as classes CSS `gr-row--manutencao`, `gr-card--manutencao`, `gr-manut__*` e `gr-manut-chave`.

- [ ] **Step 1: Testes que falham**

```tsx
// apps/shell/src/pages/geral/components/ManutencaoLinha.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockManutencoes, createMockRows } from '../data/mock'
import { lerLinhaManutencao } from '../domain/manutencao'
import type { Column } from '../domain/types'
import { GeralCards } from './GeralCards'
import { ManutencaoResumo } from './ManutencaoResumo'

afterEach(cleanup)
const NOW = new Date('2026-11-18T15:00:00Z')
const HOJE = '2026-11-18'
const [m2, m3] = createMockManutencoes(NOW)
const servico = createMockRows(NOW)[0]
const columns: Column[] = [{ key: 'cr40f_id', attribute: 'cr40f_id', alias: null, entity: null, width: 120 }]

describe('linha de manutenção', () => {
  it('o resumo mostra problema, grau, janela, status e o selo de atrasada', () => {
    render(<ManutencaoResumo m={lerLinhaManutencao(m3, HOJE)!} />)
    expect(screen.getByText('Manutenção fictícia m3')).toBeTruthy()
    expect(screen.getByText('Média')).toBeTruthy()
    expect(screen.getByText('15/11/2026')).toBeTruthy()
    expect(screen.getByText('Programado')).toBeTruthy()
    expect(screen.getByText('Atrasada')).toBeTruthy()
    expect(screen.queryByText('Fora da janela')).toBeNull()
  })

  it('nos cards, a manutenção tem cara própria, abre a gaveta e "Programar" abre a edição', () => {
    const abrir = vi.fn()
    const onEdit = vi.fn()
    const onOpen = vi.fn()
    render(<GeralCards rows={[servico, m2]} columns={columns} attributes={null} loading={false} selected={new Set()} onToggle={() => undefined} onOpen={onOpen} onEdit={onEdit} manutencao={{ ler: (row) => lerLinhaManutencao(row, HOJE), abrir }} />)
    const [cardServico, cardManutencao] = screen.getAllByRole('listitem')
    expect(cardServico.className).not.toContain('gr-card--manutencao')
    expect(cardManutencao.className).toContain('gr-card--manutencao')
    expect(within(cardManutencao).getByText('Sem motorista')).toBeTruthy()
    expect(within(cardManutencao).getByText('Semana de 23/11 a 29/11/2026')).toBeTruthy()
    fireEvent.click(within(cardManutencao).getByRole('button', { name: 'Abrir manutenção Manutenção fictícia m2 (TST2B22)' }))
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ manutencaoId: 'm2' }))
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(within(cardManutencao).getByRole('button', { name: 'Programar' }))
    expect(onEdit).toHaveBeenCalledWith(String(m2.cr40f_reservadeveculosid))
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/components/ManutencaoLinha.test.tsx`
Expected: FAIL (`ManutencaoResumo` não existe e `GeralCards` não conhece `manutencao`).

- [ ] **Step 2: `ManutencaoResumo`**

```tsx
// apps/shell/src/pages/geral/components/ManutencaoResumo.tsx
import { StatusBadge } from '@betinhos/ui'
import type { LinhaManutencao } from '../domain/manutencao'

/** Resumo da manutenção na linha da Geral: problema, grau, janela, status e os selos (spec, "Shell › Geral"). */
export function ManutencaoResumo({ m, quebra = false }: { m: LinhaManutencao; quebra?: boolean }) {
  return (
    <span className={quebra ? 'gr-manut__resumo gr-manut__resumo--quebra' : 'gr-manut__resumo'}>
      <span className="gr-manut__descricao">{m.descricao}</span>
      {m.grau ? <span className="gr-manut__meta">{m.grau}</span> : null}
      <span className="gr-manut__meta">{m.janelaRotulo}</span>
      <StatusBadge tone={m.statusTom}>{m.statusRotulo}</StatusBadge>
      {m.atrasada ? <StatusBadge tone="danger">Atrasada</StatusBadge> : null}
      {m.foraDaJanela ? <StatusBadge tone="warning">Fora da janela</StatusBadge> : null}
    </span>
  )
}
```

- [ ] **Step 3: `GeralCards`**

Acrescente aos imports:

```tsx
import { Wrench } from 'lucide-react'
import type { LinhaManutencao } from '../domain/manutencao'
import { ManutencaoResumo } from './ManutencaoResumo'
```

Em `Props`, depois de `grid?: boolean`:

```tsx
  /** Linhas de manutenção (manutenções v2): card próprio, que abre a gaveta da manutenção; `ler` devolve `null` para serviço. */
  manutencao?: { ler: (row: Row) => LinhaManutencao | null; abrir: (m: LinhaManutencao) => void }
```

Na assinatura, troque `footer, grid = false }: Props)` por `footer, grid = false, manutencao }: Props)`.

No `rows.map((row) => {`, logo depois de `const id = String(row[ID_ATTRIBUTE])`:

```tsx
          const m = manutencao?.ler(row) ?? null
          if (m && manutencao) {
            return (
              <li key={id} className={selected.has(id) ? 'gr-card gr-card--manutencao is-selected' : 'gr-card gr-card--manutencao'} onClick={(event: MouseEvent<HTMLLIElement>) => { if (!(event.target as HTMLElement).closest('button, input, a, label')) onToggle(id) }} onContextMenu={onCardContextMenu ? (event) => onCardContextMenu(id, event) : undefined}>
                <div className="gr-card__head">
                  <span className="gr-card__check">
                    <Checkbox label={<span className="gr-sr">Selecionar manutenção {m.veiculo}</span>} checked={selected.has(id)} onChange={() => onToggle(id)} />
                  </span>
                  <button type="button" className="gr-open gr-manut__abrir" aria-label={`Abrir manutenção ${m.descricao} (${m.veiculo})`} onClick={() => manutencao.abrir(m)}><Wrench size={14} aria-hidden="true" /><span>Manutenção · {m.veiculo}</span></button>
                </div>
                <p className="gr-card__line"><strong>{formatCell('datetime', row, DATA)}</strong></p>
                <ManutencaoResumo m={m} quebra />
                <p className="gr-card__line">
                  {row._cr40f_motorista_value == null ? <StatusBadge tone="warning">Sem motorista</StatusBadge> : <>Motorista: <strong>{formatCell('readonly', row, '_cr40f_motorista_value')}</strong></>}
                </p>
                <Button variant="secondary" size="touch" fullWidth onClick={() => onEdit(id)}>Programar</Button>
              </li>
            )
          }
```

- [ ] **Step 4: `GeralTable`**

Troque o import de ícones e acrescente os do domínio:

```tsx
import { ArrowDown, ArrowUp, ChevronRight, Wrench } from 'lucide-react'
import { trechosDaManutencao, type LinhaManutencao } from '../domain/manutencao'
import { ManutencaoResumo } from './ManutencaoResumo'
```

Em `Props`, depois de `grouping?: Grouping`:

```tsx
  /** Linhas de manutenção (manutenções v2): desenho próprio; motorista e saída usam `renderCell`, o resto vira o resumo. */
  manutencao?: { ler: (row: Row) => LinhaManutencao | null; abrir: (m: LinhaManutencao) => void }
```

Na assinatura de `GeralTable`, troque `density = 'dense', grouping }: Props)` por `density = 'dense', grouping, manutencao }: Props)`.

Logo depois de `const some = !all && ids.some((id) => selected.has(id))`:

```tsx
  // Trechos da linha de manutenção: dependem só das colunas visíveis, iguais para todas as linhas.
  const trechos = useMemo(() => trechosDaManutencao(columns), [columns])
```

No desenho da linha (`const { row } = item`), troque:

```tsx
            const isSelected = selected.has(id)
            return (
```

por:

```tsx
            const isSelected = selected.has(id)
            const m = manutencao?.ler(row) ?? null
            if (m && manutencao) {
              const abrir = () => manutencao.abrir(m)
              return (
                <div key={id} ref={measure} data-index={start + offset} aria-rowindex={measure ? start + offset + 2 : undefined} className={isSelected ? 'bt-table__row gr-row--manutencao is-selected' : 'bt-table__row gr-row--manutencao'} role="row" aria-selected={isSelected} onClick={rowClick(id)} onContextMenu={onRowContextMenu ? (event) => onRowContextMenu(id, event) : undefined}>
                  <div className="bt-table__cell gr-cell--select" role="gridcell">
                    <Checkbox label={<span className="gr-sr">Selecionar manutenção {m.veiculo}</span>} checked={isSelected} onChange={() => onToggle(id)} />
                  </div>
                  <div className="bt-table__cell gr-cell gr-cell--first" role="gridcell">
                    <button type="button" className="gr-open gr-manut__abrir" aria-label={`Abrir manutenção ${m.descricao} (${m.veiculo})`} title={m.descricao} onClick={abrir}><Wrench size={14} aria-hidden="true" /><span>Manutenção · {m.veiculo}</span></button>
                  </div>
                  {trechos.map((t) => (t.tipo === 'campo'
                    ? <Fragment key={t.column.key}>{renderCell(row, t.column)}</Fragment>
                    : (
                      <div key={t.key} role="gridcell" aria-colspan={t.span} className="bt-table__cell gr-cell gr-manut__trecho" style={{ gridColumn: `span ${t.span}` }}>
                        {t.tipo === 'resumo' ? <button type="button" tabIndex={-1} className="gr-manut__resumo-botao" onClick={abrir}><ManutencaoResumo m={m} /></button> : null}
                      </div>
                    )))}
                </div>
              )
            }
            return (
```

- [ ] **Step 5: `GeralSheet`**

Em `Props`, depois de `recebimentos: RecebimentosSource`:

```tsx
  /** Linha de manutenção: a sheet vira "Programar manutenção", sem os comprovantes de recebimento (são de serviço). */
  manutencao?: { titulo: string }
```

Troque a assinatura:

```tsx
export function GeralSheet({ row, columns, attributes, cellStatus, open, onClose, onSave, onReset, search, recebimentos, manutencao }: Props) {
```

Troque a abertura do `Sheet`:

```tsx
      <Sheet open={open} onClose={requestClose} eyebrow={manutencao ? 'Programar manutenção' : 'Editar campos'} expandLabel="Ver todos os campos" title={manutencao ? manutencao.titulo : `Serviço ${name}`}>
```

Troque a seção dos comprovantes:

```tsx
          {manutencao ? null : (
            <section className="gr-sheet__comprovantes" aria-labelledby="gr-sheet-comprovantes">
              <h3 id="gr-sheet-comprovantes">Comprovantes de recebimento</h3>
              <ComprovantesRecebimento source={recebimentos} reservaIds={[String(row[ID_ATTRIBUTE])]} />
            </section>
          )}
```

- [ ] **Step 6: CSS**

Acrescente ao fim de `apps/shell/src/pages/geral/geral.css`:

```css
/* Linhas de manutenção (manutenções v2, plano 3): barra e fundo no laranja de aviso do DS, ícone e resumo da manutenção. */
.gr-table .bt-table__row.gr-row--manutencao:not(.is-selected) .bt-table__cell { background-color: var(--bt-color-warning-soft); }
.gr-table .bt-table__row.gr-row--manutencao .gr-cell--select { box-shadow: inset 4px 0 0 var(--bt-color-warning); }
.gr-manut__abrir { display: inline-flex; align-items: center; gap: var(--bt-space-1); font-weight: 600; }
.gr-manut__abrir svg { flex: 0 0 auto; color: var(--bt-color-warning); }
.gr-manut__trecho { min-width: 0; }
.gr-manut__resumo-botao { display: flex; align-items: center; width: 100%; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.gr-manut__resumo { display: flex; align-items: center; gap: var(--bt-space-2); min-width: 0; overflow: hidden; white-space: nowrap; }
.gr-manut__resumo--quebra { flex-wrap: wrap; white-space: normal; }
.gr-manut__descricao { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--bt-color-text-primary); }
.gr-manut__meta { flex: 0 0 auto; font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.gr-card.gr-card--manutencao { box-shadow: inset 4px 0 0 var(--bt-color-warning); }
.gr-card.gr-card--manutencao:not(.is-selected) { background-color: var(--bt-color-warning-soft); }
.gr-manut-chave { display: inline-flex; flex: 0 0 auto; align-items: center; }
.gr-manut-chave--celular { padding: 0 var(--bt-space-1) var(--bt-space-2); }
```

- [ ] **Step 7: Rodar (Betinhos-Renan)**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/components && pnpm --filter @betinhos/shell typecheck`
Expected: PASS e typecheck sem erros. A página ainda não passa `manutencao`; isso fica para a Tarefa 9.

- [ ] **Step 8: Commit**

```bash
git add apps/shell/src/pages/geral/components apps/shell/src/pages/geral/geral.css
git commit -m "feat(geral): desenho da linha de manutenção na tabela, nos cards e na sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: Geral › liga/desliga, gaveta, aviso fora da janela e recarga

**Files:**
- Modify: `apps/shell/src/pages/geral/GeralPage.tsx`
- Test: `apps/shell/src/pages/geral/GeralPage.manutencao.test.tsx`

**Interfaces:**
- Consumes:
  - de `useGeral` (Tarefa 6): `mostrarManutencoes`, `manutencoesAlteradas`, `setMostrarManutencoes`, `resetManutencoes` e `comManutencoes`;
  - de `domain/manutencao` (Tarefas 2 e 3): `gravarManutencoesNaVisao`, `lerLinhaManutencao`, `ehLinhaDeManutencao`, `avisoForaDaJanela`, `colunasDaManutencao` e `SAIDA`;
  - `abrirGavetaRegistro` e `useRegistroAlterado` (Tarefa 7);
  - as props `manutencao` de `GeralTable`, `GeralCards` e `GeralSheet` (Tarefa 8).
- Produces: a Geral com as linhas de manutenção misturadas, a chave "Mostrar manutenções", a gaveta, o aviso fora da janela, as ações só de serviço e a recarga depois da gaveta.

- [ ] **Step 1: Testes que falham**

```tsx
// apps/shell/src/pages/geral/GeralPage.manutencao.test.tsx
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GavetaRegistro } from '../../app/GavetaRegistro'
import { avisarRegistroAlterado, fecharGavetaRegistro } from '../../app/registroAberto'
import { todaySP } from '../frota/data/dates'
import { GeralPage } from './GeralPage'
import { cellOf, hooks, usarAmbienteGeral, viewTrigger } from './testUtils'

vi.mock('./data/source', async (importOriginal) => (await import('./testUtils')).mockSource(await importOriginal<typeof import('./data/source')>(), { manutencoes: true }))
usarAmbienteGeral()
afterEach(() => { act(() => fecharGavetaRegistro()) })

const host = { mode: 'mock' } as const
// A busca deixa na lista só as duas linhas de manutenção do mock (OS-9001 e OS-9002).
beforeEach(() => { window.location.hash = '#/geral?q=OS-900' })
const abrirDe = (descricao: string) => screen.findByRole('button', { name: new RegExp(`^Abrir manutenção ${descricao}`), hidden: true })
const linhaDe = async (descricao: string) => (await abrirDe(descricao)).closest('[role="row"]') as HTMLElement

describe('Geral › linhas de manutenção', () => {
  it('aparecem com outra cara, com o selo de atrasada, e abrem a gaveta da manutenção pela Geral', async () => {
    render(<><GeralPage host={host} /><GavetaRegistro host={host} /></>)
    const m3 = await linhaDe('Manutenção fictícia m3')
    expect(m3.className).toContain('gr-row--manutencao')
    expect(within(m3).getByText('Programado')).toBeTruthy()
    expect(within(m3).getByText('Atrasada')).toBeTruthy()
    const m2 = await linhaDe('Manutenção fictícia m2')
    expect(within(m2).getByText('Agendado')).toBeTruthy()
    expect(within(m2).queryByText('Atrasada')).toBeNull()
    fireEvent.click(await abrirDe('Manutenção fictícia m3'))
    expect(await screen.findByRole('dialog', { name: 'Manutenção fictícia m3' })).toBeTruthy()
  })

  it('"Mostrar manutenções" desligado tira as linhas, marca a visão como Alterada e vai para a URL', async () => {
    render(<GeralPage host={host} />)
    await abrirDe('Manutenção fictícia m3')
    const chave = screen.getByLabelText('Mostrar manutenções') as HTMLInputElement
    expect(chave.checked).toBe(true)
    fireEvent.click(chave)
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Abrir manutenção/, hidden: true })).toBeNull())
    expect(viewTrigger().textContent).toContain('Alterada')
    await waitFor(() => expect(window.location.hash).toContain('m=0'))
  })

  it('só motorista e saída editam; saída fora da janela grava, avisa e marca a linha', async () => {
    render(<GeralPage host={host} />)
    const m2 = await linhaDe('Manutenção fictícia m2')
    const saida = await cellOf(m2, 'datetime')
    expect(within(m2).getAllByRole('gridcell').filter((c) => c.className.includes('gr-cell--editable'))).toHaveLength(2)
    expect(m2.querySelector('.gr-cell--money, .gr-cell--text, .gr-cell--choice')).toBeNull()
    fireEvent.keyDown(saida, { key: 'Enter' })
    const input = saida.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: `${todaySP()}T10:00` } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText(/ficou fora da janela da manutenção/)).toBeTruthy()
    expect(await within(m2).findByText('Fora da janela')).toBeTruthy()
  })

  it('com manutenção na seleção, as ações só de serviço ficam inertes com o motivo', async () => {
    render(<GeralPage host={host} />)
    fireEvent.click(within(await linhaDe('Manutenção fictícia m2')).getByRole('checkbox'))
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Comandos de serviços' })).getByRole('button', { name: /^Mais ações/ }))
    const op = await screen.findByRole('menuitem', { name: /^Gerar OP/, hidden: true })
    expect(op.getAttribute('aria-disabled') === 'true' || (op as HTMLButtonElement).disabled).toBe(true)
    expect(op.textContent).toContain('Ação só para serviços')
  })

  it('gravar na gaveta relê a lista da Geral', async () => {
    render(<GeralPage host={host} />)
    await abrirDe('Manutenção fictícia m3')
    const antes = hooks.paginas
    act(() => avisarRegistroAlterado('cr40f_manutencoes', 'm3'))
    await waitFor(() => expect(hooks.paginas).toBeGreaterThan(antes))
  })

  describe('no celular', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    })

    it('o card da manutenção tem o selo e "Programar" abre a edição só com motorista e saída', async () => {
      render(<GeralPage host={host} />)
      await screen.findByLabelText('Mostrar manutenções')
      const card = (await screen.findAllByRole('listitem')).find((c) => c.textContent?.includes('TST1A11')) as HTMLElement
      expect(card.className).toContain('gr-card--manutencao')
      expect(within(card).getByText('Atrasada')).toBeTruthy()
      fireEvent.click(within(card).getByRole('button', { name: 'Programar' }))
      const sheet = await screen.findByRole('dialog', { name: 'Manutenção · TST1A11' })
      expect(within(sheet).getByText('Motorista')).toBeTruthy()
      expect(within(sheet).getByLabelText('Data e horário de saída')).toBeTruthy()
      expect(within(sheet).queryByLabelText('Trajeto')).toBeNull()
      expect(within(sheet).queryByText('Comprovantes de recebimento')).toBeNull()
    })
  })
})
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral/GeralPage.manutencao.test.tsx`
Expected: FAIL. A página ainda não passa `manutencao` aos componentes, e a chave não existe.

- [ ] **Step 2: Imports e fonte**

Em `GeralPage.tsx`:
- no import de `@betinhos/ui`, acrescente `Switch, ` depois de `StatusBadge, `;
- troque `import { formatCell } from './domain/format'` por `import { formatCell, fromDateTimeLocal } from './domain/format'`;
- acrescente:

```tsx
import { abrirGavetaRegistro, useRegistroAlterado } from '../../app/registroAberto'
import { todaySP } from '../frota/data/dates'
import type { EditValue } from './domain/edit'
import { avisoForaDaJanela, colunasDaManutencao, ehLinhaDeManutencao, gravarManutencoesNaVisao, lerLinhaManutencao, SAIDA, type LinhaManutencao } from './domain/manutencao'
```

- troque `const source = useMemo(() => createSource(host), [host])` por:

```tsx
  // `manutencoes` só vale no mock (pnpm dev): as linhas OS-9001 e OS-9002 do plano 3. No Dataverse vêm da própria consulta.
  const source = useMemo(() => createSource(host, { manutencoes: true }), [host])
```

- [ ] **Step 3: Visão gravada e estado da visão**

No `viewPayload`, troque:

```tsx
    const fetchxml = buildViewFetch(geral.viewFilters.base, geral.filters, geral.sort, geral.filterFields)
```

por:

```tsx
    // "Mostrar manutenções" vai explícito na visão (marca no FetchXML; plano 3, D1).
    const fetchxml = gravarManutencoesNaVisao(buildViewFetch(geral.viewFilters.base, geral.filters, geral.sort, geral.filterFields), geral.mostrarManutencoes)
```

No array de dependências do mesmo `useCallback`, acrescente `geral.mostrarManutencoes` depois de `geral.filterFields`.

Na chamada de `useGeralViewState`, troque a linha `createView, updateView, renameView, deleteView, kv: source.kv,` por:

```tsx
    createView, updateView, renameView, deleteView, kv: source.kv,
    manutencoesAlteradas: geral.manutencoesAlteradas, resetManutencoes: geral.resetManutencoes,
```

- [ ] **Step 4: Abrir, recarregar e ações só de serviço**

Logo depois do `useMemo` de `selectedState`:

```tsx
  // Linhas de manutenção (manutenções v2, plano 3): desenho próprio; abrem a gaveta da manutenção pelo hospedeiro.
  const hoje = useMemo(() => todaySP(), [])
  const lerManutencao = useCallback((row: Row) => lerLinhaManutencao(row, hoje), [hoje])
  const abrirManutencao = useCallback((m: LinhaManutencao) => abrirGavetaRegistro('cr40f_manutencoes', m.manutencaoId), [])
  const manutencao = useMemo(() => ({ ler: lerManutencao, abrir: abrirManutencao }), [lerManutencao, abrirManutencao])
  /** Abre a linha: a manutenção na gaveta dela; o serviço no Formulário Geral. */
  const abrirLinha = useCallback((id: string) => {
    const row = rowOf(id)
    const m = row ? lerManutencao(row) : null
    if (m) abrirManutencao(m)
    else void openForm('edit', id)
  }, [rowOf, lerManutencao, abrirManutencao, openForm])
  // Ação na gaveta (encaixar, reprovar, cancelar, concluir): relê as páginas carregadas.
  useRegistroAlterado('cr40f_manutencoes', () => reload())
  /** Motivo das ações que só fazem sentido para serviço quando há manutenção na seleção (plano 3, D10). */
  const soServicos = useMemo(() => (selectedIds.some((id) => { const row = rowOf(id); return row != null && ehLinhaDeManutencao(row) }) ? 'Ação só para serviços. Desmarque as manutenções.' : null), [selectedIds, rowOf])
```

Em `selectionActions`:
- `editar`: troque `onSelect: () => { void openForm('edit', selectedIds[0]) }` por `onSelect: () => abrirLinha(selectedIds[0])`;
- `voucher`, `portal` e `op`: acrescente `blocked: soServicos, ` antes de `onSelect`;
- `link`: troque `blocked: linkBlock` por `blocked: soServicos ?? linkBlock`;
- `cadastro`: troque `blocked: cadastroBlock` por `blocked: soServicos ?? cadastroBlock`.

- [ ] **Step 5: Gravar com aviso fora da janela**

Logo depois de `const { save, resetCell, cells, selectOnly, selectRange, toggle } = geral`:

```tsx
  /** Grava como a célula sempre gravou; na linha de manutenção, saída fora da janela avisa e não bloqueia (spec). */
  const salvar = useCallback(async (id: string, column: Column, value: EditValue) => {
    const antes = rowOf(id)
    const ok = await save(id, column, value)
    const m = antes ? lerManutencao(antes) : null
    if (ok && m && !column.alias && column.attribute === SAIDA) {
      const aviso = avisoForaDaJanela(typeof value === 'string' && value ? fromDateTimeLocal(value) : null, m)
      if (aviso) toast({ tone: 'warning', message: aviso })
    }
    return ok
  }, [rowOf, save, lerManutencao, toast])
```

No `renderCell`, troque `onSave={save}` por `onSave={salvar}`. Na lista de dependências dele, troque `save` por `salvar`.

- [ ] **Step 6: Tabela, cards, sheet e contagem do painel**

Depois de `const editRow = editId == null ? undefined : rowOf(editId)`:

```tsx
  const editManutencao = editRow ? lerManutencao(editRow) : null
```

Em `<GeralCards`, acrescente a prop `manutencao={manutencao}` depois de `besideId={besideId}`. Em `<GeralTable`, acrescente `manutencao={manutencao}` depois de `renderCell={renderCell}`.

No `<GeralSheet`, troque:

```tsx
            columns={dataColumns}
```

por:

```tsx
            columns={editManutencao ? colunasDaManutencao(dataColumns) : dataColumns}
            manutencao={editManutencao ? { titulo: `Manutenção · ${editManutencao.veiculo}` } : undefined}
```

Ainda na `GeralSheet`, troque `onSave={(column, value) => save(String(editRow[ID_ATTRIBUTE]), column, value)}` por `onSave={(column, value) => salvar(String(editRow[ID_ATTRIBUTE]), column, value)}`.

No `countPreview`, troque:

```tsx
  const { viewFilters: { base: filtersBase }, query: geralQuery, quickFind } = geral
  const countPreview = useCallback(async (draft: TableFilters) => {
    if (!attributes || !view) return null
    return source.count({ fetchxml: injectTableFilters(filtersBase, draft, filterFields), query: geralQuery, quickFind })
  }, [attributes, view, source, filtersBase, filterFields, geralQuery, quickFind])
```

por:

```tsx
  const { viewFilters: { base: filtersBase }, query: geralQuery, quickFind, comManutencoes } = geral
  const countPreview = useCallback(async (draft: TableFilters) => {
    if (!attributes || !view) return null
    return source.count({ fetchxml: comManutencoes(injectTableFilters(filtersBase, draft, filterFields)), query: geralQuery, quickFind })
  }, [attributes, view, source, filtersBase, filterFields, geralQuery, quickFind, comManutencoes])
```

- [ ] **Step 7: Chave "Mostrar manutenções"**

Antes de `let body: ReactNode`:

```tsx
  // Liga/desliga por visão (spec): na linha de comando no desktop; no celular, acima dos cards.
  const chaveManutencoes = <Switch label="Mostrar manutenções" checked={geral.mostrarManutencoes} disabled={!view} onChange={(event) => geral.setMostrarManutencoes(event.target.checked)} />
```

No corpo dos cards, troque:

```tsx
            <div className={mobile ? (geral.selected.size > 0 ? 'gr-mobile has-selection' : 'gr-mobile') : 'gr-cardsview'}>
              <div ref={mobile ? undefined : cardsScrollRef} className={mobile ? undefined : 'gr-cardsview__scroll'}>
```

por:

```tsx
            <div className={mobile ? (geral.selected.size > 0 ? 'gr-mobile has-selection' : 'gr-mobile') : 'gr-cardsview'}>
              {mobile ? <div className="gr-manut-chave gr-manut-chave--celular">{chaveManutencoes}</div> : null}
              <div ref={mobile ? undefined : cardsScrollRef} className={mobile ? undefined : 'gr-cardsview__scroll'}>
```

Nos filhos da `ViewBar`, troque:

```tsx
          {source.mock && !mobile ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
```

por:

```tsx
          {!mobile ? <span className="gr-manut-chave">{chaveManutencoes}</span> : null}
          {source.mock && !mobile ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
```

- [ ] **Step 8: Rodar (Betinhos-Renan)**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/geral src/app && pnpm --filter @betinhos/shell typecheck`
Expected: PASS em todos os arquivos da Geral, os antigos inclusive (eles não ligam as manutenções do mock), e typecheck sem erros.

- [ ] **Step 9: Commit**

```bash
git add apps/shell/src/pages/geral/GeralPage.tsx apps/shell/src/pages/geral/GeralPage.manutencao.test.tsx
git commit -m "feat(geral): manutenções misturadas na Geral com gaveta, liga/desliga e aviso fora da janela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: Dashboard › "Em andamento" diz "agendadas"

**Files:**
- Modify: `apps/shell/src/pages/dashboard/components/abas/ManutencoesTab.tsx`
- Test: `apps/shell/src/pages/dashboard/components/abas/motoristas-manutencoes-multas.test.tsx`

- [ ] **Step 1: Teste que falha**

No teste `'mostra os cinco KPIs com % da receita e prazo médio'`, depois de `expect(within(kpi('Em andamento')).getByText('1')).toBeTruthy()`:

```tsx
    expect(within(kpi('Em andamento')).getByText('solicitadas, agendadas ou programadas')).toBeTruthy()
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/dashboard/components/abas/motoristas-manutencoes-multas.test.tsx`
Expected: FAIL (o texto ainda diz "aprovadas").

- [ ] **Step 2: Texto**

Em `ManutencoesTab.tsx`, troque `apoio={k ? 'solicitadas, aprovadas ou programadas' : undefined}` por:

```tsx
apoio={k ? 'solicitadas, agendadas ou programadas' : undefined}
```

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/dashboard`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/shell/src/pages/dashboard/components/abas
git commit -m "fix(dashboard): Em andamento conta manutenções agendadas, não aprovadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11 (condicional: só se o Renan escolher a opção B do ponto 2): origem "Model-driven" para a despesa do shell

Se o Renan escolher a opção A, pule esta tarefa e registre no PR "origem da despesa do shell: mantida em App Motoristas (decisão do Renan)". Se escolher a C, esta tarefa não serve: a C pede uma migration nova e vira outro plano.

**Files:**
- Modify: `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Contratos.cs`, `Manutencao/Esquema.cs`, `Manutencao/DespesaManutencao.cs`, `Manutencao/ManutencaoService.Concluir.cs`
- Modify: `apps/shell/src/pages/frota/data/manutencaoDataverse.ts`
- Modify: `packages/deploy/provision-flow-despesas-ia.ps1`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/ConcluirTests.cs`, `apps/shell/src/pages/frota/data/manutencaoDataverse.test.ts`, `packages/deploy/flow-despesas-ia.test.mjs`

**Interfaces:**
- Produces:
  - em `ConcluirPedido`, o campo opcional `origem`: `"shell"`, ou ausente para o App;
  - em `D`, a constante `OrigemModelDriven = 100000001`;
  - `DespesaManutencao.OrigemDe(string?)`;
  - o shell manda `origem: 'shell'`;
  - o gatilho da IA aceita a origem 100000001.

- [ ] **Step 1: Testes que falham**

Em `ConcluirTests.cs`, acrescente:

```cs
    [Fact]
    public void Despesa_do_shell_nasce_com_origem_Model_driven_e_a_do_App_com_App_Motoristas()
    {
        var shell = Base(M.Programado, Linha());
        Servico(shell).Concluir(Pedido(p => p.Origem = "shell"));
        Assert.Equal(D.OrigemModelDriven, shell.Todas(D.Tabela).Single().GetAttributeValue<OptionSetValue>(D.Origem).Value);

        var app = Base(M.Programado, Linha());
        Servico(app).Concluir(Pedido());
        Assert.Equal(D.OrigemApp, app.Todas(D.Tabela).Single().GetAttributeValue<OptionSetValue>(D.Origem).Value);
    }

    [Theory]
    [InlineData("shell", 100000001)]
    [InlineData(" Shell ", 100000001)]
    [InlineData(null, 100000000)]
    [InlineData("app", 100000000)]
    public void OrigemDe_so_reconhece_o_shell(string? origem, int esperado) => Assert.Equal(esperado, DespesaManutencao.OrigemDe(origem));
```

Em `manutencaoDataverse.test.ts`, no teste do concluir, troque a expectativa do `RequestJson`:

```ts
    expect(JSON.parse(corpo(f).RequestJson)).toEqual({ ...pedido, origem: 'shell', manutencaoId: LIMPO, cidadeId: 'dddddddd-1111-2222-3333-444444444444', realizadoPorId: 'eeeeeeee-1111-2222-3333-444444444444' })
```

Em `flow-despesas-ia.test.mjs`, troque o filtro esperado do primeiro teste:

```js
    "cr40f_statusanexo eq 100000002 and (cr40f_origem eq 100000000 or cr40f_origem eq 100000001 or (cr40f_origem eq 100000002 and cr40f_conciliadacartao eq true)) and (cr40f_iastatusanalise eq null or cr40f_iastatusanalise eq 100000000 or cr40f_iastatusanalise eq 100000003 or (cr40f_iastatusanalise eq 100000002 and (cr40f_statusoperacional eq 100000000 or cr40f_statusoperacional eq 100000001)))",
```

No nome do mesmo teste, troque `'gatilho aceita despesa do App e despesa do cartão conciliada,` por `'gatilho aceita despesa do App, do shell (Model-driven) e despesa do cartão conciliada,`.

Run (Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests && pnpm --filter @betinhos/shell exec vitest run src/pages/frota/data/manutencaoDataverse.test.ts && pnpm --filter @betinhos/deploy test`
Expected: FAIL nos três.

- [ ] **Step 2: Plugin**

Em `Contratos.cs`, dentro de `ConcluirPedido`, depois de `LinkFotoFinal3`:

```cs
    /// <summary>Quem chamou: "shell" (Sistema Betinhos) ou ausente (App Motoristas). Só vale para a despesa nova.</summary>
    [DataMember(Name = "origem")] public string? Origem { get; set; }
```

Em `Esquema.cs`, na classe `D`, depois da linha `public const int StatusInicial = ...`:

```cs
    /// <summary>cr40f_origem "Model-driven": despesa criada pelo Concluir do Sistema Betinhos (conferido na Tarefa 1 do plano 3).</summary>
    public const int OrigemModelDriven = 100000001;
```

Em `DespesaManutencao.cs`, troque `dados[D.Origem] = new OptionSetValue(D.OrigemApp);` por:

```cs
            dados[D.Origem] = new OptionSetValue(OrigemDe(p.Origem));
```

e acrescente, logo antes de `public static string[] NomesForma`:

```cs
    /// <summary>"shell" (Concluir pelo Sistema Betinhos) vira Model-driven; o resto, inclusive ausente (App), App Motoristas.</summary>
    public static int OrigemDe(string? origem) => string.Equals(origem?.Trim(), "shell", StringComparison.OrdinalIgnoreCase) ? D.OrigemModelDriven : D.OrigemApp;
```

Em `ManutencaoService.Concluir.cs`, dentro de `Gravados`, acrescente `Origem = p.Origem,` depois de `RealizadoPorId = p.RealizadoPorId,`. Assim a repetição que ainda cria a despesa mantém a origem de quem chamou.

- [ ] **Step 3: Shell e gatilho da IA**

Em `manutencaoDataverse.ts`, no `concluirManutencao`, troque o objeto do `comando`:

```ts
      const r = await comando('cr40f_ManutencaoConcluir', { ...p, origem: 'shell', manutencaoId: guid(p.manutencaoId), cidadeId: guid(p.cidadeId), realizadoPorId: guid(p.realizadoPorId) }, 'Não foi possível concluir a manutenção')
```

Em `provision-flow-despesas-ia.ps1`, troque a linha do `$triggerFilter`:

```powershell
$triggerFilter = 'cr40f_statusanexo eq 100000002 and (cr40f_origem eq 100000000 or cr40f_origem eq 100000001 or (cr40f_origem eq 100000002 and cr40f_conciliadacartao eq true)) and (cr40f_iastatusanalise eq null or cr40f_iastatusanalise eq 100000000 or cr40f_iastatusanalise eq 100000003 or (cr40f_iastatusanalise eq 100000002 and (cr40f_statusoperacional eq 100000000 or cr40f_statusoperacional eq 100000001)))'
```

O arquivo tem BOM. Edite só essa linha, e o BOM fica.

Run (Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests && pnpm --filter @betinhos/shell exec vitest run src/pages/frota && pnpm --filter @betinhos/deploy test`
Expected: PASS. O Deploy da `develop` republica o plugin da Frota e o "Flow Despesas | Análise IA" (`flows-dev.mjs`).

- [ ] **Step 4: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin packages/plugins/Cr40f.Frota.Plugin.Tests apps/shell/src/pages/frota/data packages/deploy/provision-flow-despesas-ia.ps1 packages/deploy/flow-despesas-ia.test.mjs
git commit -m "feat(frota): despesa do Concluir pelo shell com origem Model-driven, conferida pela IA

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 12: Roteiro, verificação (mock e DEV) e PR

**Files:**
- Modify: `.claude/skills/verificar-shell/SKILL.md`

- [ ] **Step 1: Roteiro de verificação**

Em `.claude/skills/verificar-shell/SKILL.md`, acrescente depois do item 5g, antes do item 6:

```markdown
5h. Geral, linhas de manutenção (manutenções v2 plano 3, desde 17/11/2026; spec `docs/superpowers/specs/2026-11-16-manutencoes-v2-design.md`, "Shell › Geral"). Em `pnpm dev` (mock com `createSource(host, { manutencoes: true })`):
   - Na Agenda, OS-9002 (m3, TST1A11) é a primeira linha: barra e fundo laranja (`gr-row--manutencao`), "Manutenção · TST1A11", resumo com problema, grau, janela, "Programado" e o selo "Atrasada". OS-9001 (m2, TST2B22) fica entre os serviços da semana que vem, "Agendado", sem motorista.
   - Só "Motorista" e "Data e horário de saída" editam nessas linhas; as outras colunas viram um trecho com o resumo. Saída fora da janela grava, avisa ("ficou fora da janela da manutenção") e mostra o selo "Fora da janela".
   - Clicar no rótulo ou no resumo abre a gaveta da manutenção (a mesma da Frota); uma ação nela relê a Geral (`REGISTRO_ALTERADO`).
   - "Mostrar manutenções" (chave na linha de comando; no celular, acima dos cards) vem ligado nas visões de programação e desligado em "💲 Faturamento"; mudar marca "Alterada" e vai para a URL (`m=0`/`m=1`). "Salvar" e "Salvar como" gravam a marca no FetchXML da visão (`<filter type="or">` só com `new_categoriadoitem`).
   - Com manutenção marcada, Gerar Voucher, Liberar para o portal, Gerar link, Link de cadastro e Gerar OP ficam inertes ("Ação só para serviços").
   - No celular, o card da manutenção tem "Programar", que abre a edição só com motorista e saída.
   No DEV, roteiro na Tarefa 12 do plano 3 (`docs/superpowers/plans/2026-11-17-manutencoes-v2-3-geral.md`).
```

- [ ] **Step 2: Rodar tudo (Betinhos-Renan)**

```bash
pnpm --filter @betinhos/shell typecheck
pnpm --filter @betinhos/shell test
# Só se a Tarefa 11 entrou:
dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests
pnpm --filter @betinhos/deploy test
```

Expected: typecheck sem erros e todos os testes PASS.

- [ ] **Step 3: Prints no mock, antes e depois (Betinhos-Renan; mostrar no chat)**

1. **Antes:** numa worktree da `origin/develop` na Betinhos-Renan, rode `pnpm --filter @betinhos/shell dev` e tire `00-antes-geral.png` de `#/geral` (1440x900).
2. **Depois:** na branch deste plano, rode `pnpm --filter @betinhos/shell dev` (porta 36472) e o script abaixo, salvo fora do repositório (por exemplo, `/tmp/prints-geral-manutencoes.cjs`). Ajuste `PLAYWRIGHT_MODULE` e `CHROMIUM` como no `listas-grandes.cjs`.

```js
// node /tmp/prints-geral-manutencoes.cjs <pasta-dos-prints> [http://localhost:36472/]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const OUT = process.argv[2] || '.'
const BASE = process.argv[3] || 'http://localhost:36472/'
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
;(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()) })
  const abrir = (descricao) => page.getByRole('button', { name: new RegExp(`^Abrir manutenção ${descricao}`) })

  // 1. Agenda: m3 (atrasada) abre a lista, misturada com os serviços.
  await page.goto(`${BASE}#/geral`)
  await abrir('Manutenção fictícia m3').waitFor()
  await page.screenshot({ path: `${OUT}/01-geral-m3-atrasada.png` })

  // 2. m2 entre os serviços da semana que vem (a lista é virtual: rola até ela aparecer).
  const m2 = abrir('Manutenção fictícia m2')
  for (let i = 0; i < 60 && !(await m2.count()); i += 1) await page.locator('.gr-grid').evaluate((el) => el.scrollBy(0, 600))
  await m2.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${OUT}/02-geral-m2-entre-servicos.png` })

  // 3. Liga/desliga: desligado tira as manutenções e marca "Alterada".
  await page.goto(`${BASE}#/geral?q=OS-900`)
  await abrir('Manutenção fictícia m2').waitFor()
  await page.screenshot({ path: `${OUT}/03-geral-so-manutencoes.png` })
  await page.getByLabel('Mostrar manutenções').click()
  await page.getByText('Nenhum serviço nesta visão').waitFor()
  await page.screenshot({ path: `${OUT}/04-geral-desligado.png` })
  await page.getByLabel('Mostrar manutenções').click()
  await abrir('Manutenção fictícia m2').waitFor()

  // 4. Edição: saída de m2 para hoje (fora da janela) avisa; motorista escolhido na célula.
  const linhaM2 = page.locator('[role="row"]', { has: abrir('Manutenção fictícia m2') })
  const saida = linhaM2.locator('.gr-cell--datetime')
  await saida.focus()
  await page.keyboard.press('Enter')
  await saida.locator('input').fill(`${hoje}T10:00`)
  await page.keyboard.press('Enter')
  await page.getByText(/ficou fora da janela da manutenção/).waitFor()
  await page.screenshot({ path: `${OUT}/05-geral-fora-da-janela.png` })
  const motorista = linhaM2.locator('.gr-cell--lookup')
  await motorista.focus()
  await page.keyboard.press('Enter')
  // O lookup só lista opções depois da busca (useLookupSearch): digita no campo de busca do painel, que abre com o foco.
  await page.keyboard.type('Ana')
  await page.getByRole('option', { name: 'Ana Souza' }).click()
  await linhaM2.getByText('Ana Souza').waitFor()
  await page.screenshot({ path: `${OUT}/06-geral-motorista.png` })

  // 5. Gaveta da manutenção aberta pela Geral.
  await abrir('Manutenção fictícia m3').click()
  await page.getByRole('dialog', { name: 'Manutenção fictícia m3' }).waitFor()
  await page.screenshot({ path: `${OUT}/07-gaveta-pela-geral.png` })
  await page.keyboard.press('Escape')

  // 6. Celular: cards e "Programar".
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}#/geral?q=OS-900`)
  await page.getByText('Manutenção · TST1A11').waitFor()
  await page.screenshot({ path: `${OUT}/08-celular-cards.png`, fullPage: true })
  await page.locator('li.gr-card--manutencao', { hasText: 'TST2B22' }).getByRole('button', { name: 'Programar' }).click()
  await page.getByRole('dialog', { name: 'Manutenção · TST2B22' }).waitFor()
  await page.screenshot({ path: `${OUT}/09-celular-programar.png` })

  console.log(erros.length ? `ERROS NO CONSOLE:\n${erros.join('\n')}` : 'sem erros no console')
  await browser.close()
})()
```

Expected: 9 prints e `sem erros no console`. Traga os prints para esta máquina e mostre no chat. Ponha `00-antes-geral.png` ao lado de `01-geral-m3-atrasada.png`. Confira nos prints:
- a barra e o fundo laranja só nas linhas de manutenção, e o selo "Atrasada" na m3;
- a m2 na data dela, entre os serviços;
- "Alterada" no título da visão depois de desligar;
- o aviso e o selo "Fora da janela";
- a gaveta por cima da Geral;
- no celular, sem rolagem horizontal, e a sheet "Programar manutenção" só com motorista e saída.

- [ ] **Step 4: Abrir o PR para a `develop`**

```bash
git push -u origin HEAD
gh pr create --base develop --title "feat(geral): manutenções v2, Shell › Geral" --body "$(cat <<'EOF'
Plano 3 das manutenções v2 (spec: docs/superpowers/specs/2026-11-16-manutencoes-v2-design.md; plano: docs/superpowers/plans/2026-11-17-manutencoes-v2-3-geral.md).

- Linhas da Geral de categoria Manutenção misturadas com os serviços, com outra cara (barra e fundo laranja, "Manutenção · placa", problema, grau, janela, status) e o selo "Atrasada".
- Só motorista e data/hora de saída editam nessas linhas (o editor de célula de sempre); saída fora da janela grava e avisa.
- Clicar abre a gaveta única da manutenção; ações na gaveta relêem a Geral (evento REGISTRO_ALTERADO do hospedeiro).
- "Mostrar manutenções" por visão: marca no FetchXML gravada em Salvar/Salvar como; padrão ligado nas visões de programação (motorista no layout ou no filtro, sem filtro de faturamento) e desligado nas de faturamento. Consulta com link-entity outer por cr40f_om; contagem, paginação, busca e "Agrupar por" não mudam.
- Ações só de serviço (Voucher, Portal, Link, Link de cadastro, Gerar OP) inertes com manutenção na seleção.
- Dashboard: "Em andamento" diz "agendadas".
- Origem da despesa do Concluir pelo shell: <"mantida em App Motoristas (decisão do Renan)" ou "Model-driven, com o gatilho da IA incluindo a origem (Tarefa 11)">.

Classificação das visões do DEV (Tarefa 1): <cole a tabela da descoberta e as exceções aprovadas>.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Vincule o PR à thread (`link_pull_request`) e acompanhe o CI.

- [ ] **Step 5: Depois do merge, conferir o Deploy**

Use a skill `verificar-deploy-dev`. O Deploy precisa mostrar a tela publicada, com a versão nova no rodapé. Se a Tarefa 11 entrou, precisa mostrar também a peça `frota` (plugin) e o flow "Flow Despesas | Análise IA" republicados.

- [ ] **Step 6: Conferir no DEV pelo shell publicado (Betinhos-Renan; prints no chat)**

Abra `https://org23b93544.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhos.html#/geral` e force o cache (`await fetch(location.pathname,{cache:'reload'}); location.reload()`). Use uma manutenção de teste num veículo de teste, criada na Frota pela "Nova manutenção" com descrição começando por `TESTE plano 3` e encaixada na semana que vem. Confira pela Web API:

```bash
BASE=https://org23b93544.crm2.dynamics.com; TOKEN=$(az account get-access-token --resource "$BASE/" --query accessToken -o tsv)
get() { curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" -H 'Prefer: odata.include-annotations="OData.Community.Display.V1.FormattedValue"' "$BASE/api/data/v9.2/$1"; echo; }
get "cr40f_manutencoeses($ID)?\$select=cr40f_status,cr40f_janelainicio,cr40f_janelafim"
get "cr40f_reservadeveculoses?\$select=cr40f_id,cr40f_status,cr40f_dataehorriodesada,_cr40f_motorista_value,new_foiprogramado,new_categoriadoitem&\$filter=_cr40f_om_value eq $ID"
get "userqueries?\$select=name,fetchxml&\$filter=name eq 'TESTE plano 3'"
```

| Ação na tela | O que conferir |
|---|---|
| Agenda (ou a visão de programação padrão) | A linha da manutenção aparece na data do início da janela, laranja, "Manutenção · <placa>", com "Agendado" e sem motorista. A contagem do rodapé inclui a linha |
| "Mostrar manutenções" numa visão de faturamento | Vem desligado (conforme a tabela da Tarefa 1); ligar traz a linha se a visão aceitar "Não Faturável" |
| Editar o motorista e a saída dentro da janela, depois "Disparar" | A linha fica Programado, com `new_foiprogramado` = true e o motorista certo. A manutenção vai a 202410005 (espelho do plano 1). O motorista recebe o push "Novo" (DriverNoticePlugin) |
| Editar a saída para fora da janela | Aviso "ficou fora da janela" e selo "Fora da janela"; a data fica gravada |
| Abrir a gaveta pela linha e "Reagendar" para outro dia | A gaveta fecha a ação, a Geral relê sozinha e a linha volta a "Agendado", sem motorista, na data nova |
| Janela vencida (reagendar para hoje e conferir amanhã, ou usar uma manutenção antiga com janela ou `cr40f_agendarpara` vencida) | Selo "Atrasada" na linha |
| "Salvar como" `TESTE plano 3` com "Mostrar manutenções" desligado, reabrir a visão | Vem desligado e sem "Alterada". O `fetchxml` da userquery tem o `<filter type="or">` com `new_categoriadoitem` `ne` e `null`. A visão abre também no model-driven sem erro |
| Selecionar a linha de manutenção e abrir "Mais ações" | Gerar Voucher, Liberar para o portal, Gerar link, Link de cadastro e Gerar OP inertes com "Ação só para serviços" |
| Agrupar por Status de Operação | A linha de manutenção aparece no grupo do status dela e as contagens dos grupos fecham o total |
| Dashboard › Manutenções | "Em andamento" com o apoio "solicitadas, agendadas ou programadas" |
| Se a Tarefa 11 entrou: concluir a manutenção de teste pela gaveta | Despesa com `cr40f_origem` = 100000001 ("Model-driven"); quando o anexo fica enviado, o "Flow Despesas \| Análise IA" roda nela |

Ao terminar, exclua a visão `TESTE plano 3` e cancele pela gaveta as manutenções de teste que sobraram abertas.

- [ ] **Step 7: Registrar no PR**

Comente no PR o que foi conferido no DEV, com os prints. Registre também o que ficou de fora:
- o App, que continua concluindo pelo caminho antigo até o plano 4;
- a virada (conversão dos registros antigos e retirada dos flows), que é do plano 5.

---

## Autorrevisão

**Cobertura da spec ("Shell › Geral" e regras ligadas):**

| Item da spec | Onde está |
|---|---|
| Linha de manutenção com outra cara e outra cor (barra e fundo laranja, ícone, "Manutenção · veículo", problema, grau, janela, status) | Tarefas 3, 8 e 9 |
| Dados da manutenção por `link-entity` por `cr40f_om`, acrescentado pelo código | Tarefas 2 (`aplicarManutencoes`) e 6 |
| Motorista e saída editáveis como nos serviços; os outros campos não aparecem | Tarefas 3 (`trechosDaManutencao`, `colunasDaManutencao`), 8 e 9 |
| Selo "atrasada" (`janela fim` < hoje, Agendado ou Programado) | Tarefa 3 (com `frota/domain/janela.ts`) |
| Clicar abre a gaveta da manutenção | Tarefas 8 e 9 |
| Recarga da Geral depois de ações na gaveta | Tarefas 7 e 9 |
| "Mostrar manutenções" salvo na visão, como condição de `new_categoriadoitem` | Tarefas 2, 6 e 9 |
| Ligado nas visões de programação, desligado nas demais | D2, Tarefas 1 e 2 |
| Ordenação, paginação, contagem e "Agrupar por" não mudam | D3; testes da Tarefa 2; roteiro DEV da Tarefa 12 |
| Programar fora da janela: avisa, não bloqueia | Tarefas 3 e 9 |
| Mock para dev, testes e prints | Tarefa 5 |
| Pendência: "Em andamento" diz "agendadas" | Tarefa 10 |
| Pendência: origem da despesa do Concluir pelo shell | D13, ponto 2 e Tarefa 11 (condicional) |
| Verificação: mock com prints e roteiro no DEV | Tarefa 12 |

**Placeholders:** os únicos marcadores no plano são:
- os `<...>` da descoberta (Tarefa 1), que recebem a saída do script;
- os dois trechos do corpo do PR (Tarefa 12), que recebem a decisão do ponto 2 e a tabela da Tarefa 1.

Nos dois casos, o conteúdo vem de comandos que o próprio plano manda rodar ou de decisões listadas em "Pontos para o Renan". `PADRAO_POR_VISAO` começa vazio de propósito (D2), e a Tarefa 2 diz quando ele recebe entradas.

**Consistência de nomes:**
- `domain/manutencao.ts` exporta `CATEGORIA_ITEM`, `CATEGORIA_MANUTENCAO`, `MOTORISTA`, `SAIDA`, `ALIAS_MANUTENCAO` (`bt_manut`), `COLUNAS_MANUTENCAO`, `CAMPOS_DA_LINHA` e `PADRAO_POR_VISAO`. Exporta também `padraoManutencoes`, `lerManutencoesDaVisao`, `gravarManutencoesNaVisao`, `aplicarManutencoes`, `ehLinhaDeManutencao`, `lerLinhaManutencao`, `avisoForaDaJanela`, `editavelNaManutencao`, `trechosDaManutencao`, `colunasDaManutencao` e os tipos `ManutencoesDaVisao`, `LinhaManutencao` e `Trecho`. São os mesmos nomes no mock, no hook, nos componentes e na página.
- `useGeral` devolve `mostrarManutencoes`, `manutencoesAlteradas`, `setMostrarManutencoes`, `resetManutencoes` e `comManutencoes`. `useGeralViewState` recebe `manutencoesAlteradas` e `resetManutencoes`.
- A prop `manutencao` tem o mesmo formato (`{ ler, abrir }`) em `GeralTable` e `GeralCards`. Em `GeralSheet` ela é `{ titulo }`.
- O hospedeiro usa `REGISTRO_ALTERADO`, `avisarRegistroAlterado(table, id)` e `useRegistroAlterado(table, callback)`, sempre com `'cr40f_manutencoes'`.
- O mock tem OS-9001 = m2 (TST2B22, Agendado, sem motorista) e OS-9002 = m3 (TST1A11, Programado, atrasada), com os mesmos ids do mock da Frota (`m2`, `m3`) e `MOCK_MANUTENCOES = 2`.

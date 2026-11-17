# Manutenções v2: descoberta no DEV (16/11/2026)

Leitura apenas (GET) em `org23b93544`, feita pela Tarefa 1 do plano `2026-11-16-manutencoes-v2-1-servidor.md`. E-mails e pessoas omitidos.

## 1. Flows de manutenção

| Flow | Estado | Papel |
|---|---|---|
| **Flow Criar Serviço de Manutenção na Geral** | ligado | É o "Agendar manutenção" (`new_FlowUrlManutencao`): cria a linha na Geral |
| Flow Forms de Manutenção -> App Betinhos | desligado | Forms → cria `cr40f_manutencoes`, e-mail e Planner |
| **Flow Dar Baixa Status Manutenções -> Geral** | ligado | Sincroniza o status da manutenção para a Geral |
| **Flow Dar Baixa Status Geral -> Manutenções** | ligado | Sincroniza o status da Geral para a manutenção |
| Flow Salvar Fotos Manutenção \| App Motoristas | ligado | Fotos (não analisado) |

### Flow Criar Serviço de Manutenção na Geral

O gatilho é HTTP, com corpo `{ "guids": "<id de UMA manutenção>" }`. Passos:

1. Lê a manutenção.
2. Lista as linhas da Geral com `_cr40f_om_value = id`.
3. **Apaga** as linhas encontradas, ou seja, regenera a linha em vez de reaproveitá-la.
4. Grava `cr40f_status = 202410001` na manutenção.
5. Responde 200 com `OM reservada. Agendado para dd/MM/yyyy`. A resposta sai antes de criar a linha.
6. Procura o funcionário com `_cr40f_veiculoatual_value` = placa (top 1).
7. Cria a linha da Geral com os campos da tabela em "Decisões".

Se falhar, manda e-mail de erro (financeiro e mais duas pessoas) e devolve 400. O flow não faz Teams, push nem cria outros registros.

### Flows de sincronização de status (ligados)

**Manutenção → Geral.** O gatilho é `cr40f_status` da manutenção, e as linhas são localizadas por `_cr40f_om_value`. Só atualiza a linha que ainda não está no status de destino.

| Manutenção | Geral |
|---|---|
| 202410001 | 202410001 Confirmado |
| 202410005 | 202410005 |
| 202410002 Realizado | 202410008 Concluído |
| 100000001 Cancelado | 202410002 Cancelado |
| 100000002 Reprovado | **apaga** as linhas |

**Geral → Manutenção.** O gatilho é `cr40f_status` da Geral, filtrando `_cr40f_om_value ne null`.

| Geral | Manutenção |
|---|---|
| rótulo contém "cancel" | 100000001 |
| 202410008 | 202410002 |
| 202410005 | 202410005 |
| 202410001 | 202410001 |
| qualquer outro | encerra sem fazer nada |

## 2. Regras de negócio de `cr40f_manutencoes`

São 6 regras (Solicitado ×2, Aprovado ×2, Realizado ×2), **todas desativadas**.

## 3. Metadados

- **Geral:** só tem colunas obrigatórias de sistema. Nenhuma é `ApplicationRequired`.
- **`cr40f_despesaoperacional`:**
  - `cr40f_valor` é **Money** e `cr40f_datagasto` é DateTime.
  - Obrigatórias de aplicação: `cr40f_categoria`, `cr40f_datagasto`, `cr40f_formapagamento`, `cr40f_motorista`, `cr40f_nome`, `cr40f_origem`, `cr40f_statusfinanceiro`, `cr40f_statusoperacional`, `cr40f_valor`.
- **`cr40f_manutencoes.cr40f_status`:** choice local `cr40f_manutencoes_cr40f_status`. Valores: 0 Solicitado, 202410001 Aprovado, 202410005 Programado, 202410002 Realizado, 100000001 Cancelado, 100000002 Reprovado.
- **`cr40f_manutencoes.cr40f_pagamento`:** choice **global** `cr40f_opcoes`. Valores: 202410000 Cartão de crédito, **202410001 Boleto**, 202410002 Pix.
  - 202410003 está livre.
  - O App e o shell chamam o 202410001 de "Pedido de compra".

## 4. Push dos serviços

O `Betinhos.DriverRecordSharing.DriverNoticePlugin` tem três steps:

| Step | Estágio | Filtro |
|---|---|---|
| Create | 40 | nenhum |
| Update | 40 | `cr40f_motorista,cr40f_status` |
| Update PreOperation | 20 | `cr40f_motorista` |

Ele **não filtra categoria**: uma linha de manutenção Programada com motorista dispara o aviso "Novo", e tirar o motorista de uma linha Programada dispara "Retirado". Os outros steps de Update da Geral (link de acompanhamento, compartilhamento, Proteção, ValorOp) não tratam manutenção nem `cr40f_om`.

## 5. Choices da Geral

- **`cr40f_status`** (global):
  - 202410000 Pré-reserva, 202410004 Solicitado, 202410001 Confirmado, 202410005 Programado;
  - 202410006 Em Execução, 202410008 Concluído;
  - 202410002 Cancelado, 202410010 Cancelado com Ressalvas, 100000001 Requer Análise.
- **`new_categoriadoitem`** (global): 100000000 Serviço, 100000001 Manutenção, 100000002 Troca de Veículos.
- **Usados pelo flow:**
  - `cr40f_tipodoservico` 202410006 (São José dos Campos);
  - `cr40f_tipodeveiculo` 202410000 (Básico);
  - `cr40f_statusdefaturamento` 202410011 (Não Faturável).

## Decisões para o código

**(a) Linha nova da Geral.** Campos que o flow grava hoje e o que o plugin faz com cada um:

| Campo | Valor no flow | No plugin |
|---|---|---|
| `new_categoriadoitem` | 100000001 | igual |
| `cr40f_om` | a manutenção | igual |
| `cr40f_veiculo` | placa da manutenção | igual |
| `cr40f_dataehorriodesada` | `cr40f_agendarpara` | **início da janela, 00:00 de Brasília** |
| `cr40f_status` | 202410001 Confirmado | igual (`G.StatusAProgramar`) |
| `cr40f_motorista` | 1º funcionário com o carro atual | **vazio**: quem define é o gestor de operação (spec) |
| `cr40f_solicitante` | null | não grava |
| `cr40f_statusdefaturamento` | 202410011 Não Faturável | igual |
| `cr40f_tipodeveiculo` | 202410000 Básico | igual |
| `cr40f_tipodoservico` | 202410006 | igual |
| `cr40f_destino`, `cr40f_endereodesada`, `cr40f_passageirosetelefonedecontato`, `cr40f_perfildopassageiro`, `new_observacaodefaturamento` | "Manutenção de Veículo" | igual |
| `cr40f_trajeto` | "Serviço de manutenção do veículo" | igual |
| `cr40f_obsdeoperao` | `cr40f_comentariosaomotorista` | igual, quando houver |
| `cr40f_observaointerna` | `cr40f_comentariosdoaprovador` | igual, quando houver |
| `new_foiprogramado` | (não grava) | false |

- **(b)** O status inicial da linha é 202410001 (Confirmado).
- **(c)** `cr40f_despesaoperacional.cr40f_valor` é Money: o código usa `new Money(...)`.
- **(d)** `cr40f_status` da manutenção é local. `cr40f_pagamento` é global (`cr40f_opcoes`), e a migration precisa publicar esse optionset depois de inserir a opção.
- **(e)** O push já se comporta como a spec quer (aviso só quando a linha é programada com o nome do motorista), sem mudar nada.
- **(f)** Os dois flows de sincronização usam o mesmo mapeamento do espelho e das Custom APIs:
  - convivem até a virada, com o efeito em dobro idempotente;
  - **saem na virada (plano 5)**, junto com o "Criar Serviço de Manutenção na Geral";
  - até lá, Reprovar apaga a linha da Geral pelo flow, depois de o plugin cancelá-la.

## 6. Plano 2 (17/11/2026)

Leitura apenas (GET), feita pela Tarefa 1 do plano `2026-11-17-manutencoes-v2-2-frota.md`, no DEV (`org23b93544`).

### Tamanho das colunas de texto

| Tabela.coluna | Tipo | MaxLength |
|---|---|---|
| `cr40f_manutencoes.cr40f_comentariosdoaprovador` | Texto | 100 |
| `cr40f_manutencoes.cr40f_comentariosaomotorista` | Texto | 1000 |
| `cr40f_manutencoes.cr40f_estabelecimento` | Texto | 100 |
| `cr40f_manutencoes.cr40f_servicorealizado` | Texto | 100 |
| `cr40f_manutencoes.new_comentariosdocolaborador` | Memo | 4000 |
| `cr40f_manutencoes.cr40f_descricao` | Texto | 4000 |
| `cr40f_reservadeveculos.new_observacaofinal` | Memo | 40000 |
| `cr40f_reservadeveculos.cr40f_obsdeoperao` | Memo | 40000 |

### Privilégios (1 Basic, 2 Local, 4 Deep, 8 Global; 0 = não tem)

Os dois papéis do escritório têm exatamente o mesmo conjunto. Todos os privilégios existem no DEV. Nas linhas que agrupam vários privilégios, cada um foi conferido um a um (`roleprivilegescollection` do papel) e todos têm o mesmo valor por papel; o agrupamento é só da apresentação.

| Privilégio | `Acesso-Betinhos-MDA` | `DEV - Usuário` | `Acesso-Motoristas` |
|---|---|---|---|
| Read / Write / Create / Append / AppendTo `cr40f_manutencoes` | 8 | 8 | 1 |
| Read / Write / Create / Append / AppendTo `cr40f_reservadeveculos` (a Geral) | 8 | 8 | 1 |
| Read / Write / Create / Append / AppendTo `cr40f_despesaoperacional` | **0** | **0** | 1 |
| Read / Create / Append `cr40f_anexodespesaoperacional` | **0** | **0** | 1 |
| Read / Create / Append `new_fotomanutencao` | **0** | **0** | 1 |
| Read / AppendTo `cr40f_veiculos` | 8 | 8 | 8 |
| Read / AppendTo `cr40f_funcionarios` | 8 | 8 | 1 |
| Read / AppendTo `cr40f_cidade` | **0** | **0** | 8 |
| Read / AppendTo `cr40f_categoriadespesaoperacional` | **0** | **0** | 8 |
| Read / AppendTo `cr40f_formapagamentodespesa` | **0** | **0** | 8 |

Papéis que têm Create/Write em `cr40f_despesaoperacional`, Create em `cr40f_anexodespesaoperacional` e Create em `new_fotomanutencao`: consulta à parte, também só leitura (para cada um desses privilégios, GET em `roleprivilegescollection?$filter=privilegeid eq <id>` e, para cada `roleid`, GET em `roles(<id>)`, mantendo só os papéis raiz, sem `_parentroleid_value`). Resultado: `Acesso-Motoristas` (1), `Administrador do Sistema`, `Gravador de Serviços` e `System Customizer` (8). Nenhum papel do escritório. A mesma consulta para `prvReadcr40f_cidade` listou também `Leitor de Serviços` e `Usuário de Suporte`.

### Agente

- Opção 100000018 de `cr40f_agenteproposta.cr40f_tipo`: rótulo atual `FrotaAgendadaVencida`; choice global: não (opção local da coluna).
- `executeprivilegename` das 4 Custom APIs da manutenção (`cr40f_ManutencaoAgendar`, `Reprovar`, `Cancelar`, `Concluir`): vazio nas quatro (`isprivate` falso).

### Decisões

- Privilégios do escritório: **falta** o que a "Concluir" pelo shell grava como o chamador e o que os lookups da despesa exigem. Para `Acesso-Betinhos-MDA` e `DEV - Usuário`: Read/Write/Create/Append/AppendTo em `cr40f_despesaoperacional`; Read/Create/Append em `cr40f_anexodespesaoperacional` e `new_fotomanutencao`; Read/AppendTo em `cr40f_cidade`, `cr40f_categoriadespesaoperacional` e `cr40f_formapagamentodespesa`. Create na Geral e Write em `cr40f_manutencoes` já existem (global) → Tarefa 2 **entra**, só com o que falta.
- `Acesso-Motoristas` tem `prvCreatecr40f_reservadeveculos`: **sim** (Basic, 1) → o ponto 1 para o Renan fica sem candidato: `ExecutePrivilegeName` nas APIs de gestor não separaria o motorista do escritório.
- `LIMITE` do shell: **troca o padrão do plano** para `{ comentarioAprovador: 100, comentarioAoMotorista: 1000, estabelecimento: 100, servicoRealizado: 100, comentarioColaborador: 4000, descricao: 4000 }` (valores do plano que diferem do DEV: `comentarioAoMotorista` 100 → 1000, `comentarioColaborador` 500 → 4000 e `descricao` 2000 → 4000; `comentarioAprovador`, `estabelecimento` e `servicoRealizado` já eram 100 e batem). O comentário ao motorista também vai para `cr40f_obsdeoperao` (memo, 40000), então o limite efetivo é o de `cr40f_comentariosaomotorista`.
- Rótulo da opção 100000018 (D8): ainda é `FrotaAgendadaVencida` → a migration `20261117-1010-agente-frota-atrasada.ps1` (`UpdateOptionValue`) é necessária.

### Colunas da despesa que a conclusão grava (conferência da revisão final, só leitura no DEV)

- `cr40f_despesaoperacional.cr40f_observacao`: memo, **4000** (a conclusão grava o comentário, até 4000: igual ao `LIMITE.comentarioColaborador`).
- `cr40f_despesaoperacional.cr40f_estabelecimento`: texto, **200** (a conclusão grava o estabelecimento, até 100 no shell: o limite da manutenção, 100, é o menor).
- Resultado: nenhum `LIMITE` do shell muda; os dois limites do shell já são o menor entre a manutenção e a despesa.


## 7. Plano 3 (17/11/2026)

Leitura apenas (GET), feita pela Tarefa 1 do plano `2026-11-17-manutencoes-v2-3-geral.md`, no DEV (`org23b93544`). Rodou nesta máquina, por pedido do Renan, com `az account get-access-token` (sem alterar nada). O script do plano precisou de um ajuste: `$orderby=name asc` sem codificar o espaço quebra a URL (usar `name%20asc`).

### Visões do sistema da Geral e o padrão de "Mostrar manutenções" (regra D2)

13 visões ativas (`savedquery`, `querytype = 0`). Nenhuma tem condição de `new_categoriadoitem`.

| Id | Visão | Padrão | Motorista | Faturamento | Condição de categoria | Ligado |
|---|---|---|---|---|---|---|
| 837476d8-2ef3-4449-8c13-6ea4ff274e47 | 🗓️ Agenda (Todos serviços) | não | sim | não | — | sim |
| bfe2c525-c71c-f111-8341-7ced8db0ece7 | 🗓️ Dia posterior | não | sim | não | — | sim |
| 0e8566e1-bffb-f011-8406-7ced8db10eca | 📤 Disparar | não | sim | não | — | sim |
| 56d43157-ca1c-f111-8341-7ced8db0ece7 | 🗓️ Final de semana e próxima segunda | não | sim | não | — | sim |
| 91b79045-c91c-f111-8341-7ced8db0ece7 | 🗓️ Hoje | não | sim | não | — | sim |
| fc9c63ee-f826-f111-88b4-7ced8da87663 | ℹ️ Sem CR da Tenaris | não | sim | não | — | sim |
| 0a8e5497-fa18-f111-8341-6045bd3c7605 | 📲 Visualização Mobile | não | não | não | — | **não** |
| c0a3edcc-4b1d-f111-8341-7ced8db131cd | 💲A receber | não | sim | não | — | sim (**exceção candidata**) |
| 8a9cf206-0c1e-f111-88b1-7ced8da7d478 | 🗓️Agenda | **sim** | sim | não | — | sim |
| fa8ae859-c91c-f111-8341-7ced8db0ece7 | 🚫Pedidos sem motorista designado | não | sim | não | — | sim |
| 7ccbf486-fc26-f111-88b4-7ced8da87663 | ⚠️Requer análise | não | sim | não | — | sim |
| b39a64fe-8a06-f111-8406-7ced8da8aedd | 💰View Composição de Preços | não | não | não (só no layout) | — | **não** |
| 2327de8c-5203-f111-8406-7ced8db12edc | Visualização Padrão | não | sim | não | — | sim |

Notas sobre a regra:
- A coluna "Faturamento" olha só as **condições** do FetchXML (D2). `🗓️Agenda` e `💰View Composição de Preços` mostram `cr40f_statusdefaturamento` no layout, mas não filtram por ele; a regra não olha o layout, então continuam como mostrado acima.
- `💲A receber` filtra `cr40f_receber = 1` e `cr40f_dataehorriodesada next-x-days 15`, e mostra `cr40f_motorista`. A regra liga, mas a visão é de cobrança, não de programação.
- `📲 Visualização Mobile` (saída hoje, 6 colunas, sem motorista) fica desligada pela regra. Não tem motorista para programar; se o Renan quiser ver as manutenções do dia no celular, é exceção para ligado.
- `🚫Pedidos sem motorista designado` filtra o motorista vazio sem mostrar a coluna, como previsto na D2: ligada.

### Linhas ativas por categoria

- Ativas: **233**. Manutenção: **5**. Sem categoria: **0**. Filtro de desligado (`ne 100000001` ou `null`): **228**.
- 228 + 5 = 233: **fecha** (D4 confirmada).
- Manutenção sem `cr40f_om`: **1** (OS-1957, status Concluído, com motorista). É linha legada sem manutenção ligada: com o liga/desliga ligado ela vira linha de manutenção **sem** dados do `bt_manut`; o domínio da Tarefa 3 precisa tolerar o link vazio.

### Link `bt_manut`

Chaves devolvidas pelo link `outer` (3 linhas de manutenção mais recentes pela saída):

- `bt_manut.cr40f_id`, `bt_manut.cr40f_descricao`, `bt_manut.cr40f_graudamanutencao` (número), `bt_manut.cr40f_status` (número) e `bt_manut.cr40f_agendarpara`; cada uma com a anotação `@OData.Community.Display.V1.FormattedValue` quando é choice ou data.
- `bt_manut.cr40f_janelainicio` e `bt_manut.cr40f_janelafim` **não vieram**: nenhuma manutenção do DEV tem janela preenchida (nem lendo `cr40f_manutencoes` direto, nem pelo link). O formato real das janelas em dado não foi observado; vale a metadata (`DateOnly`).
- Linha sem manutenção ligada (OS-1957): nenhuma chave `bt_manut.*` (o link outer não devolve nada).
- `cr40f_om` vem como `_cr40f_om_value` (GUID, com o `cr40f_id` da manutenção na anotação).
- Exemplo (sem GUIDs): `bt_manut.cr40f_id = "OM-1200"`, `bt_manut.cr40f_status = 202410001` (Agendado), `bt_manut.cr40f_graudamanutencao = 2` (Média), `bt_manut.cr40f_agendarpara = "2026-10-09T03:00:00Z"` (anotação `09/10/2026`).

### Datas e opções

- `DateTimeBehavior`: `cr40f_janelainicio` = **DateOnly**; `cr40f_janelafim` = **DateOnly**; `cr40f_agendarpara` = **UserLocal**.
- `cr40f_agendarpara` chega em UTC com `Z`: meia-noite de São Paulo vira `T03:00:00Z`. Quem compara com o fim da janela (`atrasada()`, "Fora da janela") precisa converter para a data de São Paulo antes de cortar em `YYYY-MM-DD`; cortar a string UTC erra só quando a hora passa das 21h local, mas a conversão evita o erro.
- Grau (`cr40f_graudamanutencao`): 1 Baixa, 2 Média, 3 Alta, 4 Urgente.
- Status da manutenção: 0 Solicitado, 202410001 Agendado, 202410005 Programado, 202410002 Realizado, 100000002 Reprovado, 100000001 Cancelado.
- Origem da despesa (`cr40f_despesaoperacional.cr40f_origem`): 100000000 App Motoristas, **100000001 Model-driven**, 100000002 Flow, 100000003 Importação.

### Decisões

- Exceções candidatas a `PADRAO_POR_VISAO` (ponto 1 para o Renan): `💲A receber` → desligado (é de cobrança). Dúvida: `📲 Visualização Mobile` → hoje desligada pela regra; só vira exceção (ligada) se o Renan quiser ver manutenções do dia no celular. As visões pessoais sem marca não foram listadas (a leitura cobre só as do sistema).
- Filtro de desligado: fecha o total (233 = 228 + 5).
- `toDateOnly` das janelas: DateOnly pela metadata (chega `YYYY-MM-DD`); sem dado de DEV para confirmar. `cr40f_agendarpara` é UserLocal e chega em UTC.
- Origem "Model-driven" (100000001): **existe** (ponto 2 para o Renan).

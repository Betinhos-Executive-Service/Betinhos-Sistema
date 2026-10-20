# Resumo diário de pendências — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um e-mail por dia útil, às 07:00, à operação, com as pendências de CNH vencida, ASO vencido, documento de veículo vencido e multa sem condutor, só quando houver itens.

**Architecture:** Um flow de Power Automate na solução AppBetinhos, com gatilho de recorrência. Ele consulta o Dataverse (serviços de hoje, motoristas, documentos, multas), cruza com quem está escalado, monta uma lista em HTML e envia pelo Office 365 Outlook. Sem tabela nova, sem Worker e sem app do Entra ID.

**Tech Stack:** Power Automate (Logic Apps JSON provisionado por PowerShell 5.1 pela Web API do Dataverse), Office 365 Outlook, Dataverse.

**Spec:** `docs/superpowers/specs/2026-10-15-alertas-operacao-proativos-design.md`, seção "Escopo remanescente: resumo diário de pendências". O resto da spec está substituído pelo módulo de vigilância do `whatsapp-inbox` (PR 93) e não é executado.

## Global Constraints

- Ambiente: somente DEV `https://org23b93544.crm2.dynamics.com` (OrganizationId `7e5f59f4-efce-f011-89f6-000d3ac0a3e1`), solução `AppBetinhos`. Nenhuma escrita em PROD e nenhuma consulta ao PROD neste plano.
- Teto de ações: o Renan tem 10.000 ações por mês no Power Automate. Este flow deve ficar em cerca de 400 a 600 por mês (18 a 26 por execução, 22 execuções). Se a prova medir mais de 40 ações por execução, pare e reporte.
- Segredos: o repositório é público. O valor de `cr40f_ResumoEmailOperacao` (e-mails da operação) é preenchido pelo Renan no maker portal; nenhum agente o lê nem o grava. O script falha com mensagem clara se faltar valor ou conexão.
- O e-mail só traz apelido de motorista, placa do veículo, nome do documento e código da multa. Nunca CPF, RG, telefone, e-mail de passageiro ou nome de passageiro.
- Status do serviço (`cr40f_reservadeveculos.cr40f_status`): Confirmado 202410001, Programado 202410005, Em Execução 202410006. Funcionário: `cr40f_status` 0 (Ativo), `cr40f_funcao` 202410000 (Motorista). Documento: `cr40f_situacao` 100000000 (Vigente). Multa: `cr40f_status` 202410000 (Notificar o Condutor).
- Textos em pt-BR com acentuação correta (UTF-8). Scripts PowerShell salvos em UTF-8 com BOM.
- Commits em português, detalhados, terminados com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (a atribuição desta sessão; quem executar com outro modelo usa a da própria sessão).
- O script `packages/deploy/provision-flow-agentes-agendado.ps1` existe só na branch `claude/compassionate-dubinsky-c4d8f9`. Para copiar suas funções auxiliares (`Dv`, `AssertSemMojibake`, `Backup`, `Apply`, `FlowRows`, `Include`, `-Restaurar`, `-SomenteValidar`, referência de conexão do Dataverse, criação, ativação e leitura de volta), use `git show claude/compassionate-dubinsky-c4d8f9:packages/deploy/provision-flow-agentes-agendado.ps1`; não faça checkout dessa branch.
- Nada neste plano altera o WebResource `new_formulario_geral.html`, o shell React ou o módulo de vigilância do `whatsapp-inbox`.

## Estrutura de arquivos

```
packages/deploy/provision-flow-resumo-diario.ps1    variável de ambiente, flow, validação e leitura de volta
```

---

### Task 1: Flow "Resumo diário" provisionado no DEV (desligado)

**Files:**
- Create: `packages/deploy/provision-flow-resumo-diario.ps1`
- Reference: `git show claude/compassionate-dubinsky-c4d8f9:packages/deploy/provision-flow-agentes-agendado.ps1`

**Interfaces:**
- Produces no DEV: variável de ambiente `cr40f_ResumoEmailOperacao` (só a definição, sem valor) e o flow `Flow Alertas | Resumo diário`, na AppBetinhos, **criado desligado**. A Task 2 liga.
- Pré-requisito do Renan: uma referência de conexão do **Office 365 Outlook** na solução AppBetinhos (conexão da mesma conta de serviço que é dona dos outros flows). Sem ela, o script falha com a instrução e a tarefa fica NEEDS_CONTEXT.

- [ ] **Step 1: Definição do flow**

No script, `$definitionText` é o JSON abaixo. `__PARAM_EMAIL__` vira `cr40f_ResumoEmailOperacao (cr40f_ResumoEmailOperacao)` (nome do parâmetro de ambiente, com o display name igual ao schema). Depois de `ConvertFrom-Json`, o script falha se sobrar algum `__[A-Z_]+__`.

```json
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "$authentication": { "defaultValue": {}, "type": "SecureObject" },
    "$connections": { "defaultValue": {}, "type": "Object" },
    "__PARAM_EMAIL__": { "defaultValue": "", "type": "String", "metadata": { "schemaName": "cr40f_ResumoEmailOperacao" } }
  },
  "triggers": {
    "Dias_uteis_07h": {
      "type": "Recurrence",
      "recurrence": { "frequency": "Week", "interval": 1, "timeZone": "E. South America Standard Time", "schedule": { "weekDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "hours": ["7"], "minutes": [0] } }
    }
  },
  "actions": {
    "Escopo_resumo": {
      "type": "Scope", "runAfter": {},
      "actions": {
        "Hoje": { "type": "Compose", "runAfter": {}, "inputs": "@convertTimeZone(utcNow(), 'UTC', 'E. South America Standard Time', 'yyyy-MM-dd')" },
        "Inicio_hoje": { "type": "Compose", "runAfter": { "Hoje": ["Succeeded"] }, "inputs": "@convertToUtc(concat(outputs('Hoje'), 'T00:00:00'), 'E. South America Standard Time')" },
        "Fim_hoje": { "type": "Compose", "runAfter": { "Inicio_hoje": ["Succeeded"] }, "inputs": "@addToTime(outputs('Inicio_hoje'), 1, 'Day')" },
        "Limite_aso": { "type": "Compose", "runAfter": { "Fim_hoje": ["Succeeded"] }, "inputs": "@formatDateTime(addToTime(outputs('Hoje'), -12, 'Month'), 'yyyy-MM-dd')" },
        "Limite_multa": { "type": "Compose", "runAfter": { "Limite_aso": ["Succeeded"] }, "inputs": "@formatDateTime(addToTime(outputs('Hoje'), 3, 'Day'), 'yyyy-MM-dd')" },
        "Escalados": {
          "type": "OpenApiConnection", "runAfter": { "Limite_multa": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_reservadeveculoses",
              "$select": "cr40f_reservadeveculosid,_cr40f_motorista_value,_cr40f_veiculo_value",
              "$filter": "statecode eq 0 and (cr40f_status eq 202410001 or cr40f_status eq 202410005 or cr40f_status eq 202410006) and cr40f_dataehorriodesada ge @{outputs('Inicio_hoje')} and cr40f_dataehorriodesada lt @{outputs('Fim_hoje')}",
              "$top": 150
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Ids_motoristas": { "type": "Select", "runAfter": { "Escalados": ["Succeeded"] }, "inputs": { "from": "@outputs('Escalados')?['body/value']", "select": "@toLower(coalesce(item()?['_cr40f_motorista_value'], ''))" } },
        "Ids_veiculos": { "type": "Select", "runAfter": { "Ids_motoristas": ["Succeeded"] }, "inputs": { "from": "@outputs('Escalados')?['body/value']", "select": "@toLower(coalesce(item()?['_cr40f_veiculo_value'], ''))" } },
        "Cnh": {
          "type": "OpenApiConnection", "runAfter": { "Ids_veiculos": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_funcionarioses",
              "$select": "cr40f_funcionariosid,new_apelido,cr40f_validadedacnh",
              "$filter": "statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq 202410000 and cr40f_validadedacnh lt @{outputs('Hoje')}",
              "$top": 150
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Aso": {
          "type": "OpenApiConnection", "runAfter": { "Cnh": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_funcionarioses",
              "$select": "cr40f_funcionariosid,new_apelido,cr40f_datadoaso",
              "$filter": "statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq 202410000 and cr40f_datadoaso lt @{outputs('Limite_aso')}",
              "$top": 150
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Docs": {
          "type": "OpenApiConnection", "runAfter": { "Aso": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_documentos",
              "$select": "cr40f_documentoid,cr40f_name,cr40f_validade,_cr40f_veiculo_value",
              "$filter": "statecode eq 0 and cr40f_situacao eq 100000000 and _cr40f_veiculo_value ne null and cr40f_validade lt @{outputs('Hoje')}",
              "$top": 150
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Multas": {
          "type": "OpenApiConnection", "runAfter": { "Docs": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_multases",
              "$select": "cr40f_multasid,cr40f_id_multa,cr40f_dataparaindicar",
              "$filter": "statecode eq 0 and cr40f_status eq 202410000 and _cr40f_motorista_value eq null and cr40f_dataparaindicar le @{outputs('Limite_multa')}",
              "$top": 150
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Cnh_escalados": { "type": "Query", "runAfter": { "Multas": ["Succeeded"] }, "inputs": { "from": "@outputs('Cnh')?['body/value']", "where": "@contains(body('Ids_motoristas'), toLower(item()?['cr40f_funcionariosid']))" } },
        "Aso_escalados": { "type": "Query", "runAfter": { "Cnh_escalados": ["Succeeded"] }, "inputs": { "from": "@outputs('Aso')?['body/value']", "where": "@contains(body('Ids_motoristas'), toLower(item()?['cr40f_funcionariosid']))" } },
        "Docs_escalados": { "type": "Query", "runAfter": { "Aso_escalados": ["Succeeded"] }, "inputs": { "from": "@outputs('Docs')?['body/value']", "where": "@contains(body('Ids_veiculos'), toLower(item()?['_cr40f_veiculo_value']))" } },
        "Total": {
          "type": "Compose", "runAfter": { "Docs_escalados": ["Succeeded"] },
          "inputs": "@add(add(length(body('Cnh_escalados')), length(body('Aso_escalados'))), add(length(body('Docs_escalados')), length(outputs('Multas')?['body/value'])))"
        },
        "Sem_itens": {
          "type": "If", "runAfter": { "Total": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@outputs('Total')", 0 ] } ] },
          "actions": { "Encerrar_sem_itens": { "type": "Terminate", "runAfter": {}, "inputs": { "runStatus": "Succeeded" } } },
          "else": { "actions": {} }
        },
        "Linhas_cnh": { "type": "Select", "runAfter": { "Sem_itens": ["Succeeded"] }, "inputs": { "from": "@body('Cnh_escalados')", "select": "@concat('CNH vencida: ', item()?['new_apelido'], ' (validade ', formatDateTime(item()?['cr40f_validadedacnh'], 'dd/MM/yyyy'), ')')" } },
        "Linhas_aso": { "type": "Select", "runAfter": { "Linhas_cnh": ["Succeeded"] }, "inputs": { "from": "@body('Aso_escalados')", "select": "@concat('ASO vencido: ', item()?['new_apelido'], ' (ASO de ', formatDateTime(item()?['cr40f_datadoaso'], 'dd/MM/yyyy'), ')')" } },
        "Linhas_docs": { "type": "Select", "runAfter": { "Linhas_aso": ["Succeeded"] }, "inputs": { "from": "@body('Docs_escalados')", "select": "@concat('Documento vencido do veículo ', coalesce(item()?['_cr40f_veiculo_value@OData.Community.Display.V1.FormattedValue'], ''), ': ', item()?['cr40f_name'], ' (validade ', formatDateTime(item()?['cr40f_validade'], 'dd/MM/yyyy'), ')')" } },
        "Linhas_multas": { "type": "Select", "runAfter": { "Linhas_docs": ["Succeeded"] }, "inputs": { "from": "@outputs('Multas')?['body/value']", "select": "@concat('Multa sem condutor: ', item()?['cr40f_id_multa'], ' (indicar até ', formatDateTime(item()?['cr40f_dataparaindicar'], 'dd/MM/yyyy'), ')')" } },
        "Resumo_html": {
          "type": "Compose", "runAfter": { "Linhas_multas": ["Succeeded"] },
          "inputs": "@concat('<p><b>Pendências da operação para hoje (', formatDateTime(outputs('Hoje'), 'dd/MM'), ')</b></p><ul><li>', join(union(body('Linhas_cnh'), body('Linhas_aso'), body('Linhas_docs'), body('Linhas_multas')), '</li><li>'), '</li></ul>')"
        },
        "Enviar_email": {
          "type": "OpenApiConnection", "runAfter": { "Resumo_html": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365", "connectionName": "shared_office365", "operationId": "SendEmailV2" },
            "parameters": {
              "emailMessage/To": "@parameters('__PARAM_EMAIL__')",
              "emailMessage/Subject": "@concat('[Operação] Pendências de hoje: ', outputs('Total'), if(equals(outputs('Total'), 1), ' item', ' itens'))",
              "emailMessage/Body": "@outputs('Resumo_html')",
              "emailMessage/Importance": "Normal"
            },
            "authentication": "@parameters('$authentication')"
          }
        }
      }
    }
  },
  "outputs": {}
}
```
Notas: `Docs` e as linhas de documento usam a anotação formatada do lookup (`..._value@OData.Community.Display.V1.FormattedValue`), que o `ListRecords` devolve; se vier vazia no DEV, a linha sai com o nome do documento e a validade, sem a placa, e a prova registra isso. `union` junta as listas sem repetir linhas idênticas, o que não afeta o resultado.

- [ ] **Step 2: Script de provisionamento**

Prólogo e funções auxiliares copiados do script de referência. Partes próprias:

1. **Variável de ambiente** `cr40f_ResumoEmailOperacao`: cria só a definição (String, `displayname` igual ao schema, sem valor padrão), recusa se existir valor padrão (iria no export da solução), inclui na solução com `AddSolutionComponent` (`ComponentType` 380). O script nunca lê nem grava o valor. Sem valor atual, o script avisa que o flow ficará desligado.
2. **Referência de conexão do Outlook:** consulta `connectionreferences` do DEV por `connectorid eq '/providers/Microsoft.PowerApps/apis/shared_office365'` e `statecode eq 0`. Sem resultado, falha com `Crie uma referência de conexão do Office 365 Outlook na solução AppBetinhos (maker portal) e rode de novo.` Com resultado, monta a entrada do `clientdata`: `@{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = <nome lógico> }; api = @{ name = 'shared_office365' } }`. A referência do Dataverse vem do flow `Flow Comprovantes Despesas Assincrono | App Motoristas`, como nos outros scripts.
3. **Flow:** `$flowName = 'Flow Alertas | Resumo diário'`; `clientdata` com `connectionReferences` de `shared_commondataserviceforapps` e `shared_office365`; backup do `clientdata` antes de alterar (recusa se houver `sig=`); criado **desligado** (não tente ativar sem valor na variável).
4. **`Conferir`** (leitura de volta do DEV): gatilho `Recurrence` com `timeZone` `E. South America Standard Time`, `weekDays` de segunda a sexta, `hours ["7"]`, `minutes [0]`; as seis consultas com `$top` 150 e os filtros exatos de CNH (`cr40f_validadedacnh lt`), ASO (`cr40f_datadoaso lt`), documento (`cr40f_situacao eq 100000000`, `_cr40f_veiculo_value ne null`), multa (`cr40f_status eq 202410000`, `_cr40f_motorista_value eq null`, `le`) e escalados (os três status); `Sem_itens` com `Terminate` `Succeeded` quando `Total` é 0; `Enviar_email` com `SendEmailV2` e `emailMessage/To` vindo do parâmetro; nenhuma ação referencia `telefone`, `celular`, `cpf` nem `rg`; o flow pertence à solução (`componenttype` 29).

- [ ] **Step 3: Validar sem gravar e depois criar**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-flow-resumo-diario.ps1 -SomenteValidar` (na primeira vez o flow não existe: o script avisa e segue para a criação) e depois sem o parâmetro.
Expected: `checkFlowErrors: []`, todas as linhas `ok:` do `Conferir` e `DEV: 'Flow Alertas | Resumo diário' gravado e DESLIGADO (<id>), na AppBetinhos.` Expressão que o validador rejeitar: corrija o mínimo necessário e registre a mudança no commit.

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/provision-flow-resumo-diario.ps1 packages/deploy/flows/backup
git commit -m "Alertas: flow Resumo diário de CNH, ASO, documento do veículo e multa sem condutor no DEV, desligado"
```
(Inclua o backup só se o script o gerar, como nos flows dos Assistentes.)

---

### Task 2: Prova no DEV e ativação

**Files:**
- Modify: `docs/superpowers/specs/2026-10-15-alertas-operacao-proativos-design.md` (seção final "Estado em <data>")

**Interfaces:**
- Consumes: Task 1 e o valor de `cr40f_ResumoEmailOperacao` que o Renan preencheu no DEV. **Pare com NEEDS_CONTEXT** se o valor ou a conexão do Outlook faltarem. Durante os testes, o Renan deve apontar o valor só para o próprio e-mail.
- Produces: resumo provado nos quatro tipos de item, flow ativo e número real de ações por execução.

- [ ] **Step 1: Ativar o flow**

Ative `Flow Alertas | Resumo diário` (`PATCH workflows(<id>)` com `statecode` 1, como o script do flow agendado dos Assistentes faz com o dele) e confirme `statecode` 1 por leitura.

- [ ] **Step 2: Execução sem itens**

Dispare o flow uma vez (`POST` no gatilho `Dias_uteis_07h` pela API do Power Automate, `api-version=2016-11-01`, token do recurso `https://service.flow.microsoft.com/`). Esperado: execução `Succeeded` que termina em `Encerrar_sem_itens` (se o DEV não tiver pendências para escalados de hoje) e nenhum e-mail enviado. Se o DEV já tiver itens, o e-mail chega: siga para o Step 3.

- [ ] **Step 3: Execução com os quatro tipos de item**

Com `describe` dos campos obrigatórios, crie no DEV dados de teste marcados `TESTE RESUMO`: um motorista (`cr40f_funcionarios`, status 0, função 202410000) com `cr40f_validadedacnh` ontem e outro com `cr40f_datadoaso` de 13 meses atrás; um veículo de teste com um `cr40f_documento` Vigente de validade ontem; um serviço de teste de hoje (status 202410001, saída hoje) com um desses motoristas e esse veículo; uma multa de teste (`cr40f_status` 202410000, motorista vazio, `cr40f_dataparaindicar` daqui a 2 dias). Dispare o flow e confirme, na caixa do Renan, um único e-mail `[Operação] Pendências de hoje: 4 itens` (ou o total real do DEV) com as quatro linhas e sem telefone nem CPF. Confirme também que um motorista com CNH vencida **sem** serviço hoje não aparece, e que uma segunda execução imediata reenvia o mesmo resumo (o flow é sem estado; um e-mail por dia é pelo gatilho).

- [ ] **Step 4: Medir as ações**

Leia o histórico da execução pela API do Power Automate (`.../flows/<id>/runs/<runId>/actions`) e conte as ações executadas nas duas execuções (sem itens e com itens). Meta: 26 ou menos por execução. Registre os números; se passar de 40, pare e reporte.

- [ ] **Step 5: Limpeza**

Apague os dados de teste (multa, documento, serviço, motorista e veículo de teste, nessa ordem) e peça ao Renan para repor em `cr40f_ResumoEmailOperacao` os e-mails reais da operação. Nenhum registro de teste fica no DEV.

- [ ] **Step 6: Registrar o estado e commitar**

Acrescente à spec, depois da seção do escopo remanescente, `## Estado em <data>`: o que foi provado, ações por execução (sem itens e com itens), o consumo mensal estimado frente aos 10.000 e pendências para o Renan (como a decisão de manter o flow em DEV ou levá-lo ao PROD, que exige pedido explícito).
```bash
git add docs/superpowers/specs/2026-10-15-alertas-operacao-proativos-design.md
git commit -m "Alertas: resumo diário provado no DEV, com as ações por execução e o estado registrado na spec"
```

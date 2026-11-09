# Importação de Serviços XLSX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** alinhar a importação XLSX de serviços ao contrato de `IMPORTACAO_SERVICOS.md`, sem reabrir a função de serviço manual dentro da PG.

**Architecture:** `scripts/xlsx_import_core.js` continua sendo a camada pura de parser, agrupamento, split, mesmo-carro, status e duplicidade. `app.js` continua responsável por UI, inspector, ações, Dataverse e bloqueios de interação. `webresource.html` é artefato gerado por `scripts/build_webresource.js`; nunca editar manualmente.

**Tech Stack:** vanilla HTML/CSS/JS, Node.js com `node:assert/strict`, Dataverse/Xrm Web API, web resource HTML empacotado.

---

## Leitura Direta Do MD

Você está errado se tratar a importação como upload simples.

A regra real é:

- XLSX entra como linhas.
- Linhas viram PGs.
- Cada PG vira um ou mais trechos revisáveis.
- O operador confirma, ignora, edita, separa ida/busca ou mescla como mesmo carro.
- `Agendar confirmados` salva só trechos confirmados.
- PG sozinha não bloqueia duplicidade.
- Serviço manual dentro da PG deve ser removido.

Contradição do MD:

- A seção 17 diz: `TIRE ESSA FUNÇÃO. NÃO QUERO QUE ELA EXISRTA.`
- Mas o fluxo geral, limites e mapa mental ainda citam `criar serviço manual`.
- O plano precisa corrigir essa contradição antes de qualquer ajuste visual.

## File Structure

- Modify: `IMPORTACAO_SERVICOS.md`
  - Responsabilidade: contrato operacional legível para Renan e para futuros agentes.
- Modify: `scripts/xlsx_import_core.js`
  - Responsabilidade: parser, normalização, agrupamento por PG, retorno validado, split, mesmo-carro, duplicidade e resumo de revisão.
- Modify: `app.js`
  - Responsabilidade: render da aba de importação, workbench, inspector, botões de decisão, bloqueios, salvar no Dataverse e ação `Agendar confirmados`.
- Modify: `scripts/xlsx_import_parser.test.js`
  - Responsabilidade: prova da regra operacional pura.
- Modify: `scripts/formulario_operational_features.test.js`
  - Responsabilidade: prova estática de contrato UI/source.
- Modify: `scripts/webresource_bundle.test.js`
  - Responsabilidade: prova de que `webresource.html` está sincronizado e não contém função proibida.
- Generate: `webresource.html`
  - Responsabilidade: bundle final para Dataverse. Gerar com `node scripts/build_webresource.js`.

## Task 1: Baseline Antes De Editar

**Files:**
- Test: `scripts/xlsx_import_parser.test.js`
- Test: `scripts/formulario_operational_features.test.js`
- Test: `scripts/webresource_bundle.test.js`
- Generate: `webresource.html`

- [ ] **Step 1: Rodar parser da importação**

Run:

```powershell
node scripts/xlsx_import_parser.test.js
```

Expected:

```text
xlsx_import_parser: ok
```

- [ ] **Step 2: Rodar contrato UI/source**

Run:

```powershell
node scripts/formulario_operational_features.test.js
```

Expected:

```text
formulario_operational_features: ok
```

- [ ] **Step 3: Regenerar bundle**

Run:

```powershell
node scripts/build_webresource.js
```

Expected:

```text
webresource.html gerado
```

- [ ] **Step 4: Validar bundle**

Run:

```powershell
node scripts/webresource_bundle.test.js
```

Expected:

```text
webresource_bundle: ok
```

## Task 2: Corrigir O Contrato Do MD

**Files:**
- Modify: `IMPORTACAO_SERVICOS.md`

- [ ] **Step 1: Remover serviço manual do fluxo geral**

Trocar:

```markdown
8. O usuário pode editar, confirmar, ignorar, separar ida/busca, criar serviço manual ou mesclar como mesmo carro.
```

Por:

```markdown
8. O usuário pode editar, confirmar, ignorar, separar ida/busca ou mesclar como mesmo carro.
```

- [ ] **Step 2: Reescrever a seção 17**

Substituir a seção atual por:

````markdown
## 17. Função removida: serviço manual dentro da PG

A importação não cria serviço manual dentro da PG.

Motivo:

> Serviço manual dentro da importação abre brecha para OS sem origem real na planilha e aumenta o risco de salvar trecho sem revisão operacional.

Alternativas permitidas:

1. Separar ida/busca.
2. Mesclar como mesmo carro.
3. Editar o trecho importado.
4. Ignorar o trecho e criar serviço fora do fluxo de importação.

Regra técnica:

```text
Não deve existir botão "+" para criar trecho manual na revisão da PG.
Não deve existir handler add-manual-trecho.
Não deve existir createManualImportedTrecho.
Não deve existir importOrigin: "manual".
```
````

- [ ] **Step 3: Remover citações restantes no final do MD**

Trocar:

```markdown
Nesse caso, use revisão manual, serviço manual ou ajuste direto.
```

Por:

```markdown
Nesse caso, use revisão manual, split, mesmo carro ou ajuste direto no trecho importado.
```

Trocar no mapa mental:

```text
  └─ criar serviço manual
```

Por:

```text
  └─ revisar manualmente sem criar trecho manual
```

- [ ] **Step 4: Validar que a contradição saiu**

Run:

```powershell
rg -n "criar serviço manual|O botão `\\+` cria|serviço manual ou|add-manual-trecho|createManualImportedTrecho|importOrigin: \"manual\"" IMPORTACAO_SERVICOS.md
```

Expected:

```text
no matches
```

## Task 3: Travar O Core Contra Serviço Manual

**Files:**
- Modify: `scripts/xlsx_import_core.js`
- Modify: `scripts/xlsx_import_parser.test.js`

- [ ] **Step 1: Confirmar que o core não exporta criação manual**

No final de `scripts/xlsx_import_core.js`, o objeto exportado não pode conter:

```javascript
createManualImportTrecho
```

O teste precisa manter este assert:

```javascript
assert.equal(importCore.createManualImportTrecho, undefined, "core nao deve expor criacao de servico manual na PG");
```

- [ ] **Step 2: Confirmar que o core mantém decisões permitidas**

O core deve manter só decisões operacionais válidas para importação:

```javascript
const IMPORT_OPERATIONAL_DECISIONS = Object.freeze({
  KEEP_ONE: "keep-one",
  KEEP_WAITING: "keep-waiting",
  SPLIT: "split",
  SPLIT_DRAFT: "split-draft",
  MANUAL_REVIEW: "manual-review"
});
```

`MANUAL_REVIEW` fica. Serviço manual não fica.

- [ ] **Step 3: Rodar parser**

Run:

```powershell
node scripts/xlsx_import_parser.test.js
```

Expected:

```text
xlsx_import_parser: ok
```

## Task 4: Provar Regras Operacionais Do Parser

**Files:**
- Modify: `scripts/xlsx_import_parser.test.js`
- Modify: `scripts/xlsx_import_core.js`

- [ ] **Step 1: Garantir colunas obrigatórias mínimas**

Manter teste com:

```javascript
assert.deepEqual(
  validateImportHeaders([
    "Data da Viagem (inicial)",
    "Número Programação",
    "Horário Passageiro",
    "Nome Passageiro",
    "Origem",
    "Destino"
  ]),
  [],
  "colunas obrigatorias minimas devem permitir importacao"
);
```

- [ ] **Step 2: Garantir que multi-coleta não vira retorno**

Manter teste com:

```javascript
assert.equal(multiPickupTrecho.operationalMode, IMPORT_OPERATIONAL_MODES.MULTI_PICKUP, "mesmo destino com pax diferentes deve ser classificado como multi-coleta");
assert.equal(multiPickupTrecho.retornoPrevistoHorario, "", "multi-coleta nao deve virar retorno previsto");
```

- [ ] **Step 3: Garantir retorno validado**

Manter teste com:

```javascript
assert.equal(validatedReturnTrecho.retornoPrevistoHorario, "18:30", "retorno validado deve preencher horario previsto");
assert.equal(validatedReturnTrecho.origem, "05:40 - MARCOS - Rua Francisco Ricci, 181 - Vila Ema, Sao Jose dos Campos, SP\n05:50 - DANIEL - Rua Benedito Osvaldo Lecques, 300 - Parque Residencial Aquarius, Sao Jose dos Campos, SP", "retorno validado nao deve incluir linhas do retorno no endereco de saida");
```

- [ ] **Step 4: Garantir retorno suspeito visível**

Manter teste com:

```javascript
assert.equal(invalidReturnTrecho.retornoPrevistoHorario, "18:30", "retorno suspeito ainda deve preencher horario previsto");
assert.equal(invalidReturnTrecho.origem, "05:40 - MARCOS - Rua Francisco Ricci, 181 - Vila Ema, Sao Jose dos Campos, SP\n18:30 - MARCOS - Shopping Morumbi, Sao Paulo, SP", "retorno suspeito deve continuar visivel no endereco de saida para revisao");
```

- [ ] **Step 5: Garantir mesmo-carro manual**

Manter teste com:

```javascript
assert.equal(sameCarMergedTrecho.key, "PGDIST/1|same-car|1", "merge mesmo carro deve criar chave estavel na PG");
assert.equal(sameCarMergedTrecho.operationalSuggestion, "Mesmo carro", "merge mesmo carro deve explicar a decisao do usuario");
assert.equal(sameCarMergedTrecho.retornoPrevistoHorario, "", "merge mesmo carro nao deve criar retorno previsto");
```

- [ ] **Step 6: Garantir split pendente**

Manter teste com:

```javascript
assert.equal(splitClone.importOrigin, "split", "Split deve marcar origem tecnica");
assert.equal(splitClone.reviewStatus, IMPORT_REVIEW_STATUSES.PENDING, "Split deve nascer pendente");
assert.equal(splitClone.horario, "17:00", "Split deve pre-preencher horario da busca quando houver linha de retorno clara");
```

- [ ] **Step 7: Rodar parser**

Run:

```powershell
node scripts/xlsx_import_parser.test.js
```

Expected:

```text
xlsx_import_parser: ok
```

## Task 5: Travar UI Contra Botão Ou Handler Manual

**Files:**
- Modify: `app.js`
- Modify: `scripts/formulario_operational_features.test.js`

- [ ] **Step 1: Remover qualquer botão de serviço manual se reaparecer**

`app.js` não pode conter:

```javascript
"add-manual-trecho"
"Adicionar serviço manual"
"function createManualImportedTrecho"
"originStatus: \"Manual\""
"importOrigin: \"manual\""
```

- [ ] **Step 2: Manter estes testes estáticos**

```javascript
excludes(app, "function createManualImportedTrecho", "importacao nao deve criar servico manual dentro da PG");
excludes(app, "add-manual-trecho", "acao de adicionar servico manual por PG deve ficar removida");
excludes(app, "Adicionar serviço manual", "botao de servico manual nao deve existir");
excludes(app, "originStatus: \"Manual\"", "trecho manual nao deve ser criado pela importacao");
excludes(app, "importOrigin: \"manual\"", "origem tecnica manual nao deve ser criada pela importacao");
```

- [ ] **Step 3: Não confundir com revisão manual**

`app.js` deve continuar contendo:

```javascript
"manual-operational-review"
"PG mantida pendente para revisão manual."
```

Motivo:

```text
Revisão manual é status/decisão.
Serviço manual é criação de trecho novo.
São coisas diferentes.
```

- [ ] **Step 4: Rodar contrato UI/source**

Run:

```powershell
node scripts/formulario_operational_features.test.js
```

Expected:

```text
formulario_operational_features: ok
```

## Task 6: Validar Botões Permitidos Da Revisão

**Files:**
- Modify: `app.js`
- Modify: `scripts/formulario_operational_features.test.js`
- Modify: `scripts/webresource_bundle.test.js`

- [ ] **Step 1: Manter botões operacionais permitidos**

`app.js` deve continuar contendo:

```javascript
"Manter 1 OS"
"Manter espera"
"Separar ida/busca"
"Revisar manual"
"É o mesmo carro"
"Agendar confirmados"
```

- [ ] **Step 2: Manter bloqueio de duplicidade**

Duplicidade `exact` deve bloquear edição e salvamento.

O contrato estático precisa continuar validando:

```javascript
includes(app, "async function checkImportedProgramDuplicates", "checagem de duplicidade por servico importado");
includes(app, "function scoreImportedTrechoDuplicate", "pontuacao de duplicidade por horario/trajeto/endereco/passageiros");
```

- [ ] **Step 3: Rodar testes estáticos**

Run:

```powershell
node scripts/formulario_operational_features.test.js
```

Expected:

```text
formulario_operational_features: ok
```

## Task 7: Regenerar E Validar Web Resource

**Files:**
- Generate: `webresource.html`
- Test: `scripts/webresource_bundle.test.js`

- [ ] **Step 1: Regenerar bundle**

Run:

```powershell
node scripts/build_webresource.js
```

Expected:

```text
webresource.html gerado
```

- [ ] **Step 2: Confirmar que o bundle não reintroduziu manual**

Manter estes asserts em `scripts/webresource_bundle.test.js`:

```javascript
assert.ok(!html.includes("function createManualImportedTrecho"), "bundle nao deve criar servico manual dentro da PG");
assert.ok(!html.includes("add-manual-trecho"), "bundle nao deve expor acao de adicionar servico manual");
assert.ok(!html.includes("Adicionar serviço manual"), "bundle nao deve exibir botao de servico manual");
```

- [ ] **Step 3: Rodar teste do bundle**

Run:

```powershell
node scripts/webresource_bundle.test.js
```

Expected:

```text
webresource_bundle: ok
```

## Task 8: UAT Operacional No Browser

**Files:**
- Verify: `index.html`
- Verify: `Relatorio - 2026-05-15T144227.698.xlsx`

- [ ] **Step 1: Abrir o app local**

Abrir:

```text
index.html
```

- [ ] **Step 2: Importar o XLSX real**

Arquivo:

```text
Relatorio - 2026-05-15T144227.698.xlsx
```

- [ ] **Step 3: Validar aceite visual**

Aceite:

```text
Aba de importação abre como página, não modal.
Lista/galeria fica à esquerda.
Inspector fica à direita no desktop.
Selecionar serviço não joga scroll para o topo.
Serviço salvo some da fila de revisão.
Duplicidade exata fica evidente e bloqueada.
Não existe botão "+" para criar serviço manual dentro da PG.
Revisar manual ainda existe.
Separar ida/busca ainda existe.
É o mesmo carro ainda existe.
Agendar confirmados salva só confirmados.
```

## Task 9: Fechamento

**Files:**
- Verify: `IMPORTACAO_SERVICOS.md`
- Verify: `scripts/xlsx_import_core.js`
- Verify: `app.js`
- Verify: `webresource.html`

- [ ] **Step 1: Rodar suíte mínima final**

Run:

```powershell
node scripts/xlsx_import_parser.test.js
node scripts/formulario_operational_features.test.js
node scripts/build_webresource.js
node scripts/webresource_bundle.test.js
```

Expected:

```text
xlsx_import_parser: ok
formulario_operational_features: ok
webresource.html gerado
webresource_bundle: ok
```

- [ ] **Step 2: Conferir diffs**

Run:

```powershell
git diff -- IMPORTACAO_SERVICOS.md scripts/xlsx_import_core.js app.js scripts/xlsx_import_parser.test.js scripts/formulario_operational_features.test.js scripts/webresource_bundle.test.js webresource.html
```

Expected:

```text
Diff focado em importação XLSX.
Nenhuma mudança em telefone, passageiros manuais, layout geral ou campos fora da aba de importação.
```

## Riscos E Armadilhas

- Não remover `manual-operational-review`. Isso é revisão manual, não serviço manual.
- Não remover lógica de cadastro manual de passageiro fora da importação.
- Não editar `webresource.html` manualmente.
- Não bloquear duplicidade por PG isolada.
- Não juntar serviços distantes automaticamente só porque têm mesmo destino.
- Não esconder retorno suspeito se a origem do retorno não bater com destino da ida.
- Não quebrar acentos em texto visível.

## Próximo Passo Recomendado

Faça a Task 1.

Se os testes passarem, implemente só a Task 2 primeiro.

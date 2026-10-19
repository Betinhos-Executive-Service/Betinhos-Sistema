# Leitura rápida do comprovante — plano de implementação

> Para agentes: execute com `superpowers:executing-plans` ou `subagent-driven-development`, tarefa por tarefa, em TDD. Spec: `docs/superpowers/specs/2026-10-15-leitura-rapida-comprovante-design.md`.

**Objetivo:** foto primeiro; leitura rápida (Haiku via flow DEV) pré-preenche o formulário de despesa; envio inalterado.
**Arquitetura:** lógica do modelo em `Sistema Betinhos/packages/despesas-ia/src/leitura-rapida/`; flow provisionado por script PowerShell no DEV; o app chama o flow pela URL SAS lida da variável Dataverse `new_FlowURLDespesaLeituraRapida`.
**Stack:** TypeScript, vitest (Sistema Betinhos), `node --test` (App Motoristas), React 18, Power Automate.

Caminhos base:
- `SB` = `C:/Users/mendo/Desktop/vscode/Sistema Betinhos/.claude/worktrees/ai-api-automation-3f3824` (branch `claude/ai-api-automation-3f3824`, onde já vive `packages/despesas-ia`).
- `AM` = `C:/Users/mendo/Desktop/vscode/App Motoristas/.worktrees/leitura-rapida-comprovante` (branch `feat/leitura-rapida-comprovante`, base `origin/develop`).

Gates humanos (Renan): **G1** antes de qualquer escrita no DEV; **G2** antes de `npm run push`; **G3** teste no celular.
Todos os commits em português com o trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sem push sem pedido.

---

## Parte A — Sistema Betinhos (prompt, schema, flow)

### Task A1: schema da leitura rápida

**Arquivos:** criar `SB/packages/despesas-ia/src/leitura-rapida/schema.ts` e `SB/packages/despesas-ia/src/leitura-rapida/leitura-rapida.test.ts`.

- [ ] Teste que falha:
```ts
import { describe, expect, it } from 'vitest'
import { schemaLeituraRapida } from './schema.ts'

describe('schemaLeituraRapida', () => {
  it('monta enum de categoria e forma de pagamento com as listas recebidas, aceitando null', () => {
    const s = schemaLeituraRapida(['Abastecimento', 'Pedágio'], ['Cartão de crédito'])
    expect(s.required).toEqual(Object.keys(s.properties))
    expect(s.additionalProperties).toBe(false)
    expect(s.properties.categoria_sugerida).toEqual({ anyOf: [{ type: 'string', enum: ['Abastecimento', 'Pedágio'] }, { type: 'null' }] })
    expect(s.properties.forma_pagamento_sugerida).toEqual({ anyOf: [{ type: 'string', enum: ['Cartão de crédito'] }, { type: 'null' }] })
    expect(s.properties.legivel).toEqual({ type: 'boolean' })
  })
})
```
- [ ] `cd "SB/packages/despesas-ia"; pnpm vitest run src/leitura-rapida` → FAIL (módulo ausente).
- [ ] Implementar:
```ts
const anulavel = (tipo: Record<string, unknown>) => ({ anyOf: [tipo, { type: 'null' }] })

export type LeituraRapida = {
  legivel: boolean
  valor: number | null
  data: string | null
  hora: string | null
  estabelecimento: string | null
  cnpj: string | null
  litros: number | null
  categoria_sugerida: string | null
  forma_pagamento_sugerida: string | null
  motivo_ilegivel: string | null
}

export function schemaLeituraRapida(categorias: string[], formasPagamento: string[]) {
  const properties = {
    legivel: { type: 'boolean' },
    valor: anulavel({ type: 'number' }),
    data: anulavel({ type: 'string', format: 'date' }),
    hora: anulavel({ type: 'string' }),
    estabelecimento: anulavel({ type: 'string' }),
    cnpj: anulavel({ type: 'string' }),
    litros: anulavel({ type: 'number' }),
    categoria_sugerida: anulavel({ type: 'string', enum: [...categorias] }),
    forma_pagamento_sugerida: anulavel({ type: 'string', enum: [...formasPagamento] }),
    motivo_ilegivel: anulavel({ type: 'string' }),
  }
  return { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) } as const
}
```
- [ ] Rodar de novo → PASS.
- [ ] Commit: `git add packages/despesas-ia/src/leitura-rapida` + `git commit` "Despesas IA: schema da leitura rápida do comprovante com enum dinâmico de categoria e forma de pagamento".

### Task A2: prompt e requisição (Haiku)

**Arquivos:** criar `SB/packages/despesas-ia/src/leitura-rapida/prompt.ts` e `requisicao.ts`; acrescentar testes em `leitura-rapida.test.ts`.

- [ ] Teste que falha:
```ts
import { montarRequisicaoLeitura, MODELO_LEITURA, MAX_TOKENS_LEITURA } from './requisicao.ts'
import { SYSTEM_PROMPT_LEITURA } from './prompt.ts'

describe('montarRequisicaoLeitura', () => {
  it('usa Haiku, só a imagem e saída estruturada', () => {
    const r = montarRequisicaoLeitura({ imagemBase64: 'AAAA', mime: 'image/jpeg', categorias: ['Pedágio'], formasPagamento: ['TicketLog'] })
    expect(MODELO_LEITURA).toBe('claude-haiku-5-5')
    expect(r.model).toBe(MODELO_LEITURA)
    expect(r.max_tokens).toBe(MAX_TOKENS_LEITURA)
    expect(r.system).toBe(SYSTEM_PROMPT_LEITURA)
    expect(r.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } })
    expect(r.output_config.format.type).toBe('json_schema')
  })
  it('recusa mime fora de imagem e base64 acima do limite', () => {
    expect(() => montarRequisicaoLeitura({ imagemBase64: 'AAAA', mime: 'application/pdf', categorias: [], formasPagamento: [] })).toThrow('Tipo de imagem não suportado')
    expect(() => montarRequisicaoLeitura({ imagemBase64: 'A'.repeat(2_900_000), mime: 'image/jpeg', categorias: [], formasPagamento: [] })).toThrow('Imagem acima do limite')
  })
})
```
- [ ] Rodar → FAIL.
- [ ] `prompt.ts`:
```ts
export const SYSTEM_PROMPT_LEITURA = `Você lê a foto de um comprovante de despesa (cupom fiscal, NFC-e, recibo, pedágio, estacionamento) de um motorista da Betinhos Executive Service, no Brasil.
Extraia apenas o que está escrito na imagem. Não invente nem deduza valores ausentes: use null.
- valor: total pago, em reais, número com ponto decimal (ex.: 85.4).
- data: AAAA-MM-DD; hora: HH:MM (24 h).
- estabelecimento: nome fantasia ou razão social impressa; cnpj: como impresso.
- litros: só para combustível; senão null.
- categoria_sugerida e forma_pagamento_sugerida: escolha um item das listas permitidas pelo schema, ou null se não houver evidência na imagem.
- legivel=false quando valor ou data não puderem ser lidos com segurança (foto cortada, borrada, escura, com reflexo ou que não é comprovante). Nesse caso explique em motivo_ilegivel, numa frase curta em português; senão motivo_ilegivel=null.`

export const TEXTO_USUARIO_LEITURA = 'Leia este comprovante.'
```
- [ ] `requisicao.ts`:
```ts
import { SYSTEM_PROMPT_LEITURA, TEXTO_USUARIO_LEITURA } from './prompt.ts'
import { schemaLeituraRapida } from './schema.ts'

export const MODELO_LEITURA = 'claude-haiku-5-5'
export const MAX_TOKENS_LEITURA = 1024
export const LIMITE_BASE64_LEITURA = 2_800_000
const MIMES = ['image/jpeg', 'image/png', 'image/webp']

export type EntradaLeitura = { imagemBase64: string; mime: string; categorias: string[]; formasPagamento: string[] }

export function montarRequisicaoLeitura(e: EntradaLeitura) {
  if (!MIMES.includes(e.mime)) throw new Error(`Tipo de imagem não suportado: ${e.mime}`)
  if (e.imagemBase64.length > LIMITE_BASE64_LEITURA) throw new Error('Imagem acima do limite da leitura rápida.')
  return {
    model: MODELO_LEITURA,
    max_tokens: MAX_TOKENS_LEITURA,
    system: SYSTEM_PROMPT_LEITURA,
    output_config: { format: { type: 'json_schema' as const, schema: schemaLeituraRapida(e.categorias, e.formasPagamento) } },
    messages: [{
      role: 'user' as const,
      content: [
        { type: 'image' as const, source: { type: 'base64' as const, media_type: e.mime, data: e.imagemBase64 } },
        { type: 'text' as const, text: TEXTO_USUARIO_LEITURA },
      ],
    }],
  }
}
```
- [ ] PASS. Commit: "Despesas IA: prompt e requisição da leitura rápida com Haiku e limite de imagem".

### Task A3: travas da resposta

**Arquivos:** criar `SB/packages/despesas-ia/src/leitura-rapida/resposta.ts`; testes.

- [ ] Teste que falha:
```ts
import { interpretarLeitura } from './resposta.ts'

const base = { legivel: true, valor: 85.4, data: '2026-10-12', hora: '14:32', estabelecimento: 'Posto X', cnpj: null, litros: 32.5, categoria_sugerida: 'Abastecimento', forma_pagamento_sugerida: null, motivo_ilegivel: null }
const msg = (o: unknown, stop = 'end_turn') => ({ stop_reason: stop, model: 'claude-haiku-5-5', content: [{ type: 'text', text: JSON.stringify(o) }] })

describe('interpretarLeitura', () => {
  it('aceita leitura válida', () => expect(interpretarLeitura(msg(base))).toEqual({ ok: true, leitura: base }))
  it('falha quando stop_reason não é end_turn', () => expect(interpretarLeitura(msg(base, 'max_tokens')).ok).toBe(false))
  it('legível sem valor vira ilegível', () => {
    expect(interpretarLeitura(msg({ ...base, valor: null }))).toEqual({ ok: true, leitura: { ...base, valor: null, legivel: false, motivo_ilegivel: 'Valor ou data não identificados.' } })
  })
  it('valor negativo ou data fora de AAAA-MM-DD falha', () => {
    expect(interpretarLeitura(msg({ ...base, valor: -1 })).ok).toBe(false)
    expect(interpretarLeitura(msg({ ...base, data: '12/10/2026' })).ok).toBe(false)
  })
})
```
- [ ] FAIL. Implementar:
```ts
import type { MensagemApi } from '../resposta.ts'
import type { LeituraRapida } from './schema.ts'

export type ResultadoLeitura = { ok: true; leitura: LeituraRapida } | { ok: false; erro: string }

export function interpretarLeitura(msg: MensagemApi): ResultadoLeitura {
  if (msg.stop_reason !== 'end_turn') return { ok: false, erro: `Resposta incompleta (stop_reason: ${msg.stop_reason}).` }
  let l: LeituraRapida
  try { l = JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '') } catch { return { ok: false, erro: 'Resposta não é JSON válido.' } }
  if (typeof l?.legivel !== 'boolean') return { ok: false, erro: 'Campo legivel ausente.' }
  if (l.valor !== null && !(typeof l.valor === 'number' && l.valor > 0)) return { ok: false, erro: `Valor inválido: ${l.valor}.` }
  if (l.data !== null && !/^\d{4}-\d{2}-\d{2}$/.test(l.data)) return { ok: false, erro: `Data inválida: ${l.data}.` }
  if (l.legivel && (l.valor === null || l.data === null)) return { ok: true, leitura: { ...l, legivel: false, motivo_ilegivel: 'Valor ou data não identificados.' } }
  return { ok: true, leitura: l }
}
```
As mesmas travas (legível exige valor e data) são replicadas no flow (Task A5).
- [ ] PASS. Commit: "Despesas IA: travas da resposta da leitura rápida (end_turn, valor, data)".

### Task A4: exportar constantes para o provisionamento

**Arquivos:** criar `SB/packages/despesas-ia/src/leitura-rapida/index.ts`; modificar `SB/packages/despesas-ia/src/index.ts` (acrescentar `export * from './leitura-rapida/index.ts'`); modificar `SB/packages/despesas-ia/scripts/gerar-constantes.ts` para também emitir `constantesDaLeituraRapida()` (ler o script antes e seguir o mesmo formato de saída que `provision-flow-despesas-ia.ps1` consome).

- [ ] Teste que falha: `expect(constantesDaLeituraRapida()).toEqual({ modelo: 'claude-haiku-5-5', maxTokens: 1024, systemPrompt: SYSTEM_PROMPT_LEITURA, textoUsuario: TEXTO_USUARIO_LEITURA, limiteBase64: 2_800_000 })`.
- [ ] `leitura-rapida/index.ts`:
```ts
import { SYSTEM_PROMPT_LEITURA, TEXTO_USUARIO_LEITURA } from './prompt.ts'
import { LIMITE_BASE64_LEITURA, MAX_TOKENS_LEITURA, MODELO_LEITURA } from './requisicao.ts'

export * from './prompt.ts'
export * from './requisicao.ts'
export * from './resposta.ts'
export * from './schema.ts'

export function constantesDaLeituraRapida() {
  return { modelo: MODELO_LEITURA, maxTokens: MAX_TOKENS_LEITURA, systemPrompt: SYSTEM_PROMPT_LEITURA, textoUsuario: TEXTO_USUARIO_LEITURA, limiteBase64: LIMITE_BASE64_LEITURA }
}
```
- [ ] `pnpm vitest run; pnpm typecheck` → PASS (os testes antigos de `despesas-ia.test.ts` continuam verdes). Commit: "Despesas IA: constantes da leitura rápida exportadas para o provisionamento".

### Task A5: script de provisionamento (sem executar no DEV)

**Arquivo:** criar `SB/packages/deploy/provision-flow-despesas-leitura-rapida.ps1`, copiando de `provision-flow-despesas-ia.ps1` as funções `Dv` (UTF-8), `AssertSemMojibake`, `Backup`, `Apply`, `FlowRows`, `Include` e a checagem de `new_AnthropicApiKey` (confere que a definição existe; nunca lê nem imprime o valor). Parâmetros: `[string] $Restaurar = '', [switch] $SomenteValidar`. Nome do flow: `Flow Despesas | Leitura rápida`. Constantes obtidas do pacote como no script atual.

Definição (`clientdata`):
- Gatilho `manual` (Request, método POST), schema `{ imagemBase64: string, mime: string, categorias: string[], formasPagamento: string[] }`, todos obrigatórios; condição de gatilho `@and(not(empty(triggerBody()?['imagemBase64'])), lessOrEquals(length(triggerBody()?['imagemBase64']), 2800000))`.
- `Montar_schema` (Compose): mesmo JSON de `schemaLeituraRapida`, com `enum` = `triggerBody()?['categorias']` e `triggerBody()?['formasPagamento']`.
- `Chamar_Claude` (HTTP): `POST https://api.anthropic.com/v1/messages`; headers `x-api-key: @parameters('__PARAM_KEY__')`, `anthropic-version: 2023-06-01`, `content-type: application/json`; body com `model`, `max_tokens`, `system`, `output_config.format = { type: 'json_schema', schema: outputs('Montar_schema') }` e mensagem com bloco `image` (base64 do gatilho) + texto; `limit.timeout: PT8S`; `retryPolicy: { type: 'none' }`; `runtimeConfiguration.secureData` em inputs e outputs.
- Scope `Tentar`: `Interpretar` (Compose `json(first(body('Chamar_Claude')?['content'])?['text'])`), condição `stop_reason == end_turn`, trava "legível exige valor e data"; `Responder_ok` (Response 200, `{ ok: true, leitura }`, header `Access-Control-Allow-Origin: *` igual aos flows HTTP atuais do app — conferir no export do "Flow Comprovantes Despesas Assincrono").
- Scope `Falhou` (`runAfter` Failed/TimedOut/Skipped de `Tentar`): `Responder_erro` (Response 200, `{ ok: false, erro: 'leitura_indisponivel' }`), sem repassar detalhe da API.
- Travas pós-geração (estilo de `'Chamar_Claude chave pela variável'`): `x-api-key` = parâmetro, `model` = `claude-haiku-5-5`, `secureData` presente, `retryPolicy none`, timeout `PT8S`.
- Variável de ambiente `new_FlowURLDespesaLeituraRapida` (Text, display "Flow URL Despesa Leitura Rápida"): criar a definição se ausente e incluir na solução AppBetinhos com `Include`. Valor gravado a partir de `listCallbackUrl` do gatilho, **sem imprimir a URL** (log só host + `sig=***`).
- `-SomenteValidar`: monta o JSON, roda travas e `AssertSemMojibake`, sem chamada de rede.

- [ ] `pwsh -File packages/deploy/provision-flow-despesas-leitura-rapida.ps1 -SomenteValidar` → sem erro e sem rede.
- [ ] Commit: "Deploy: script de provisionamento do Flow Despesas | Leitura rápida no DEV (ainda não executado)".

### Task A6 — GATE G1 (Renan): provisionar no DEV

- [ ] Pedir confirmação explícita para escrever no DEV (`org23b93544`).
- [ ] Rodar o script sem `-SomenteValidar`; conferir backup gerado, flow ativo, variável `new_FlowURLDespesaLeituraRapida` não vazia (sem exibir o valor) e pertencente à solução.
- [ ] Fumaça: 1 foto legível e 1 ilegível (fornecidas por Renan) por `curl`, com a URL lida do DEV em variável de shell, nunca colada em log. Medir tempo (meta ≤ 5 s). Registrar o resultado na mensagem do commit de ajuste, se houver.

---

## Parte B — App Motoristas

Antes de editar: consultar `graphify-out/graph.json` (AGENTS.md, "Graphify Context Gate") com `ExpenseScreen`, `confirmExpensePhoto`, `resolveFlowUrl`; antes da Task B5, ler `C:/Users/mendo/Desktop/vscode/DESIGN_SYSTEM.md` e `design-tokens.json` (CLAUDE.md do diretório pai). Se faltarem ou forem contraditórios, parar e reportar.

### Task B1: parser da resposta do flow

**Arquivos:** criar `AM/src/lib/receiptQuickRead.ts` e `AM/tests/receiptQuickRead.test.ts`.

- [ ] Teste que falha:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseQuickReadResponse } from "../src/lib/receiptQuickRead.ts";

const leitura = { legivel: true, valor: 85.4, data: "2026-10-12", hora: "14:32", estabelecimento: "Posto X", cnpj: null, litros: 32.5, categoria_sugerida: "Abastecimento", forma_pagamento_sugerida: null, motivo_ilegivel: null };

test("parseQuickReadResponse aceita ok:true com leitura legível", () => {
  assert.deepEqual(parseQuickReadResponse({ ok: true, leitura }), { kind: "lido", leitura });
});
test("parseQuickReadResponse trata legivel=false como ilegível", () => {
  assert.equal(parseQuickReadResponse({ ok: true, leitura: { ...leitura, legivel: false } }).kind, "ilegivel");
});
test("parseQuickReadResponse trata ok:false e corpo inválido como falha", () => {
  assert.equal(parseQuickReadResponse({ ok: false, erro: "x" }).kind, "falha");
  assert.equal(parseQuickReadResponse("texto").kind, "falha");
  assert.equal(parseQuickReadResponse({ ok: true, leitura: { legivel: "sim" } }).kind, "falha");
});
```
- [ ] `npm test` → FAIL. Implementar:
```ts
export type QuickReadLeitura = {
  legivel: boolean;
  valor: number | null;
  data: string | null;
  hora: string | null;
  estabelecimento: string | null;
  cnpj: string | null;
  litros: number | null;
  categoria_sugerida: string | null;
  forma_pagamento_sugerida: string | null;
  motivo_ilegivel: string | null;
};

export type QuickReadOutcome = { kind: "lido"; leitura: QuickReadLeitura } | { kind: "ilegivel" } | { kind: "falha" };

export function parseQuickReadResponse(body: unknown): QuickReadOutcome {
  if (!body || typeof body !== "object") return { kind: "falha" };
  const value = body as { ok?: unknown; leitura?: Partial<QuickReadLeitura> };
  if (value.ok !== true || !value.leitura || typeof value.leitura.legivel !== "boolean") return { kind: "falha" };
  if (!value.leitura.legivel) return { kind: "ilegivel" };
  return { kind: "lido", leitura: value.leitura as QuickReadLeitura };
}
```
- [ ] PASS. Commit: `feat(despesa): parser da leitura rapida do comprovante`.

### Task B2: aplicar a leitura ao rascunho sem sobrescrever

**Arquivos:** `AM/src/lib/receiptQuickRead.ts`, `AM/tests/receiptQuickRead.test.ts`.

- [ ] Antes: ler `src/components/common/FormFields.tsx` (`MoneyInputField`) e `parseCurrencyInput` em `src/lib/expenses.payload.ts` para confirmar o formato aceito ("12,30"). Se for outro, ajustar `formatDecimal` e o teste.
- [ ] Teste que falha:
```ts
import { applyQuickReadToDraft } from "../src/lib/receiptQuickRead.ts";
import { DEFAULT_EXPENSE_REFERENCE_DATA, type ExpenseDraft } from "../src/lib/expenses.ts";

const vazio: ExpenseDraft = { categoriaId: "", veiculoId: "", valor: "", dataGasto: "", formaPagamentoId: "", cidadeId: "", estabelecimento: "", descricao: "", kmInformado: "", litros: "" };

test("applyQuickReadToDraft preenche só campos vazios e casa categoria e pagamento por nome", () => {
  const draft = applyQuickReadToDraft({ ...vazio, valor: "90,00" }, { ...leitura, forma_pagamento_sugerida: "TicketLog" }, DEFAULT_EXPENSE_REFERENCE_DATA);
  assert.equal(draft.valor, "90,00");
  assert.equal(draft.dataGasto, "2026-10-12");
  assert.equal(draft.estabelecimento, "Posto X");
  assert.equal(draft.categoriaId, "local-abastecimento");
  assert.equal(draft.formaPagamentoId, "local-ticketlog");
  assert.equal(draft.litros, "32,5");
});
test("applyQuickReadToDraft formata valor em pt-BR e ignora litros quando a categoria não exige", () => {
  const draft = applyQuickReadToDraft(vazio, { ...leitura, categoria_sugerida: "Pedágio", valor: 12.3 }, DEFAULT_EXPENSE_REFERENCE_DATA);
  assert.equal(draft.valor, "12,30");
  assert.equal(draft.litros, "");
});
test("applyQuickReadToDraft ignora sugestão fora da lista", () => {
  assert.equal(applyQuickReadToDraft(vazio, { ...leitura, categoria_sugerida: "Bebida" }, DEFAULT_EXPENSE_REFERENCE_DATA).categoriaId, "");
});
```
- [ ] FAIL. Implementar:
```ts
import {
  findExpenseCategory,
  findExpenseCategoryByName,
  findExpensePaymentMethodByName,
  getExpenseCategoryRules,
  type ExpenseDraft,
  type ExpenseReferenceData
} from "./expenses.ts";

const formatDecimal = (value: number, digits: number) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });

export function applyQuickReadToDraft(draft: ExpenseDraft, leitura: QuickReadLeitura, referenceData: ExpenseReferenceData): ExpenseDraft {
  const next = { ...draft };
  if (!next.categoriaId && leitura.categoria_sugerida) next.categoriaId = findExpenseCategoryByName(referenceData, [leitura.categoria_sugerida])?.id ?? "";
  if (!next.formaPagamentoId && leitura.forma_pagamento_sugerida) next.formaPagamentoId = findExpensePaymentMethodByName(referenceData, [leitura.forma_pagamento_sugerida])?.id ?? "";
  if (!next.valor && leitura.valor !== null) next.valor = formatDecimal(leitura.valor, 2);
  if (!next.dataGasto && leitura.data) next.dataGasto = leitura.data;
  if (!next.estabelecimento && leitura.estabelecimento) next.estabelecimento = leitura.estabelecimento.trim();
  const rules = getExpenseCategoryRules(findExpenseCategory(referenceData, next.categoriaId));
  if (!next.litros && rules.exigeLitros && leitura.litros !== null) next.litros = formatDecimal(leitura.litros, 1).replace(/,0$/, "");
  return next;
}
```
- [ ] PASS. Commit: `feat(despesa): pre-preenche rascunho com a leitura sem sobrescrever o motorista`.

### Task B3: estado das tentativas

**Arquivos:** idem.

- [ ] Teste que falha:
```ts
import { INITIAL_QUICK_READ, nextQuickReadState, shouldRunQuickRead } from "../src/lib/receiptQuickRead.ts";

test("terceira foto ilegível libera manual e para de ler", () => {
  let s = nextQuickReadState(INITIAL_QUICK_READ, { kind: "ilegivel" });
  assert.deepEqual(s, { status: "ilegivel", tentativas: 1 });
  s = nextQuickReadState(s, { kind: "ilegivel" });
  s = nextQuickReadState(s, { kind: "ilegivel" });
  assert.deepEqual(s, { status: "manual", tentativas: 3 });
  assert.equal(shouldRunQuickRead(s), false);
});
test("falha vai para manual sem contar tentativa; lido encerra", () => {
  assert.deepEqual(nextQuickReadState(INITIAL_QUICK_READ, { kind: "falha" }), { status: "manual", tentativas: 0 });
  assert.deepEqual(nextQuickReadState(INITIAL_QUICK_READ, { kind: "lido", leitura }), { status: "preenchido", tentativas: 1 });
});
test("shouldRunQuickRead só em idle ou ilegivel", () => {
  assert.equal(shouldRunQuickRead(INITIAL_QUICK_READ), true);
  assert.equal(shouldRunQuickRead({ status: "ilegivel", tentativas: 2 }), true);
  assert.equal(shouldRunQuickRead({ status: "preenchido", tentativas: 1 }), false);
});
```
- [ ] FAIL. Implementar:
```ts
export const QUICK_READ_MAX_TENTATIVAS = 3;
export const QUICK_READ_TIMEOUT_MS = 10_000;

export type QuickReadStatus = "idle" | "lendo" | "preenchido" | "ilegivel" | "manual";
export type QuickReadState = { status: QuickReadStatus; tentativas: number };
export const INITIAL_QUICK_READ: QuickReadState = { status: "idle", tentativas: 0 };

export function shouldRunQuickRead(state: QuickReadState) {
  return state.status === "idle" || state.status === "ilegivel";
}

export function nextQuickReadState(state: QuickReadState, outcome: QuickReadOutcome): QuickReadState {
  if (outcome.kind === "lido") return { status: "preenchido", tentativas: state.tentativas + 1 };
  if (outcome.kind === "falha") return { status: "manual", tentativas: state.tentativas };
  const tentativas = state.tentativas + 1;
  return { status: tentativas >= QUICK_READ_MAX_TENTATIVAS ? "manual" : "ilegivel", tentativas };
}
```
- [ ] PASS. Commit: `feat(despesa): controla tentativas da leitura rapida (3a ilegivel libera manual)`.

### Task B4: chamada ao flow com timeout e redução da imagem

**Arquivos:** modificar `AM/src/lib/dataverse.ts` (`FLOW_URLS` ~l.251, `FLOW_DATAVERSE_ENVIRONMENT_VARIABLES` ~l.260, nova função depois de `runHttpFlow` ~l.3536); `AM/src/lib/receiptQuickRead.ts`; testes.

- [ ] Teste puro:
```ts
import { quickReadTargetSize } from "../src/lib/receiptQuickRead.ts";

test("quickReadTargetSize limita o maior lado a 1600 mantendo proporção", () => {
  assert.deepEqual(quickReadTargetSize(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(quickReadTargetSize(800, 600), { width: 800, height: 600 });
});
```
- [ ] Implementar em `receiptQuickRead.ts`:
```ts
export const QUICK_READ_MAX_SIDE = 1600;

export function quickReadTargetSize(width: number, height: number) {
  const scale = Math.min(1, QUICK_READ_MAX_SIDE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function downscaleForQuickRead(dataUrl: string): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const { width, height } = quickReadTargetSize(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.8).replace(/^data:image\/jpeg;base64,/, "");
}
```
- [ ] Em `dataverse.ts`: `quickRead: "VITE_FLOW_LEITURA_RAPIDA_URL"` em `FLOW_URLS`; `[FLOW_URLS.quickRead]: "new_FlowURLDespesaLeituraRapida"` em `FLOW_DATAVERSE_ENVIRONMENT_VARIABLES`; e exportar:
```ts
export async function readReceiptQuick(imagemBase64: string, categorias: string[], formasPagamento: string[], timeoutMs: number): Promise<unknown> {
  const url = await resolveFlowUrl(FLOW_URLS.quickRead);
  if (!url) return { ok: false, erro: "nao_configurado" };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ imagemBase64, mime: "image/jpeg", categorias, formasPagamento })
    });
    if (!response.ok) {
      dataverseWarn("Leitura rapida falhou.", { status: response.status, endpoint: describeFlowUrl(url) });
      return { ok: false };
    }
    return await response.json();
  } catch (error) {
    dataverseWarn("Leitura rapida sem resposta.", { endpoint: describeFlowUrl(url), error: error instanceof Error ? error.name : String(error) });
    return { ok: false };
  } finally {
    window.clearTimeout(timer);
  }
}
```
Não reutilizar `runHttpFlow`: não aceita `AbortSignal` e registra resumo de payload. Nunca logar a imagem nem a URL completa.
- [ ] `npm test` e `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` → PASS. Commit: `feat(despesa): chamada do Flow de leitura rapida com timeout de 10s`.

### Task B5: avisos na ExpenseScreen

**Arquivos:** modificar `AM/src/screens/ExpenseScreen.tsx` (`ExpenseScreenProps` e render logo após `{errorCount ? ... : null}` dentro do `fieldset`); `AM/src/screens/ButtonPreviewScreen.tsx` (~l.707) sem mudança obrigatória, pois as props são opcionais.

- [ ] Props novas:
```ts
  quickRead?: QuickReadState;
  onRetakeQuickReadPhoto?: () => void;
```
- [ ] Render (reaproveita `form-error-summary` e `ActionButton`; conferir em `src/components/common/ActionButton.tsx` a variante não primária existente e usá-la):
```tsx
{quickRead?.status === "lendo" ? <div className="form-error-summary" role="status" aria-live="polite">Lendo comprovante…</div> : null}
{quickRead?.status === "preenchido" ? <div className="form-error-summary" role="status">Confira os dados lidos do comprovante.</div> : null}
{quickRead?.status === "ilegivel" ? (
  <div className="form-error-summary" role="alert">
    Não consegui ler o comprovante. Tire outra foto mais perto, com luz e sem cortar.
    <ActionButton variant="secondary" idleLabel="TIRAR OUTRA FOTO" state="idle" onClick={() => onRetakeQuickReadPhoto?.()} />
  </div>
) : null}
{quickRead?.status === "manual" && quickRead.tentativas >= 3 ? <div className="form-error-summary" role="status">Preencha os dados do comprovante manualmente.</div> : null}
```
Nenhum CSS ou valor visual novo; se o Design System pedir outro componente de aviso, parar e reportar.
- [ ] `npx tsc ...` PASS. `npm run dev` e conferir os 4 estados forçando `quickRead` na `ButtonPreviewScreen` localmente (sem commitar o forçamento). Commit: `feat(despesa): avisos de leitura rapida na tela de gastos`.

### Task B6: foto primeiro e disparo da leitura no App

**Arquivo:** modificar `AM/src/App.tsx`.

- [ ] Estado perto de `expenseDraft` (~l.474): `const [expenseQuickRead, setExpenseQuickRead] = useState<QuickReadState>(INITIAL_QUICK_READ);`, `const expenseQuickReadSeqRef = useRef(0);`, `const expenseRetakeTargetIdRef = useRef("");`.
- [ ] Em todos os pontos que fazem `setExpenseDraft({ ...EMPTY_EXPENSE_DRAFT })` (~l.1255, ~1776; e o reset de ~l.1940), também `setExpenseQuickRead(INITIAL_QUICK_READ)` e `expenseQuickReadSeqRef.current++`.
- [ ] `navigateFromInitial` (~l.1752): antes de `setScreen(screenName)`, `if (screenName === "gastos" && !expenseSubmission && expensePhotos.length === 0) { setComunicadoOrigin(""); openExpenseCamera(); return; }`. Voltar da câmera sem foto já cai em `gastos` (`confirmExpensePhoto` ~l.2262): preenchimento manual.
- [ ] Função nova:
```ts
const runExpenseQuickRead = async (dataUrl: string) => {
  if (!remoteMode || !shouldRunQuickRead(expenseQuickRead)) return;
  if (navigator.onLine === false) { setExpenseQuickRead((s) => ({ ...s, status: "manual" })); return; }
  const seq = ++expenseQuickReadSeqRef.current;
  setExpenseQuickRead((s) => ({ ...s, status: "lendo" }));
  let outcome: QuickReadOutcome = { kind: "falha" };
  try {
    const base64 = await downscaleForQuickRead(dataUrl);
    outcome = parseQuickReadResponse(await readReceiptQuick(
      base64,
      expenseReferenceData.categories.map((c) => c.name),
      expenseReferenceData.paymentMethods.map((m) => m.name),
      QUICK_READ_TIMEOUT_MS
    ));
  } catch {
    outcome = { kind: "falha" };
  }
  if (seq !== expenseQuickReadSeqRef.current) return;
  setExpenseQuickRead((s) => nextQuickReadState(s, outcome));
  if (outcome.kind === "lido") setExpenseDraft((current) => applyQuickReadToDraft(current, outcome.leitura, expenseReferenceData));
};
```
- [ ] `confirmExpensePhoto`, ramo de foto nova (`else`): se `expenseRetakeTargetIdRef.current` estiver preenchido, substituir a foto com esse id (revogando `previewUrl` como no ramo de edição) em vez de anexar e limpar o ref. Depois de `setScreen("gastos")`: `if (!expensePhotoIsVideo && (expensePhotos.length === 0 || retaking)) void runExpenseQuickRead(expensePhotoDraft);` (capturar `retaking` antes de limpar o ref).
- [ ] `const retakeQuickReadPhoto = () => { expenseRetakeTargetIdRef.current = expensePhotos[0]?.id ?? ""; openExpenseCamera(); };`.
- [ ] Passar a `<ExpenseScreen>` (~l.2815): `quickRead={expenseQuickRead}` e `onRetakeQuickReadPhoto={retakeQuickReadPhoto}`. `onDraftChange` não muda; leitura que chega depois de o motorista digitar não sobrescreve (garantido por `applyQuickReadToDraft`).
- [ ] `npm test` e `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` → PASS. Commit: `feat(despesa): fluxo comeca pela foto e dispara leitura rapida do comprovante`.

### Task B7: verificação local

- [ ] `npm run dev` em modo mock: sem `remoteMode` a leitura não roda; foto → formulário, clique, foco, valor digitado e voltar funcionam.
- [ ] Após G1, teste no navegador com `window.__APP_FLOW_ENV = { VITE_FLOW_LEITURA_RAPIDA_URL: ... }` setado no console, sem gravar a URL em arquivo.
- [ ] `npm run check:hygiene`. Atualizar `graphify-out` (AGENTS.md) e commitar se versionado.

### Task B8 — GATE G2 (Renan): publicar no DEV

- [ ] Confirmar com Renan. `npm run build` (incrementa o PATCH a partir da versão atual de `package.json`; conferir `package.json` e `package-lock.json` sincronizados e que o rodapé mostra `vX.Y.Z · dd/mm/aaaa HH:mm`) e `npm run push` (ou `npm run push -- -DeviceCode`). Se o worktree não tiver `.env`, publicar do checkout principal após merge local.
- [ ] Informar a versão publicada.

### Task B9 — GATE G3 (Renan): teste no celular (DEV)

- [ ] Casos: cupom de combustível legível (valor, data, litros, categoria), pedágio, foto escura 3× (manual liberado na 3ª), modo avião (manual imediato), digitar valor antes da leitura terminar (não sobrescreve), envio completo (upload assíncrono e "Flow Despesas | Análise IA" rodam como antes).
- [ ] Medir o tempo de "Lendo comprovante…" (meta 3–5 s) e registrar no PR.

---

## Fora deste plano
PROD (exige promoção própria), leitura de vídeo/PDF, leitura de fotos adicionais, persistência da leitura no Dataverse.

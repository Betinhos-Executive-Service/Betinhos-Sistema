# Validação de despesas com IA: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada despesa enviada pelo App Motoristas é analisada pelo Claude (foto do comprovante + contexto) assim que o comprovante termina de subir, e a IA decide entre `Validado` e `Precisa corrigir`, vincula a OS e aponta duplicidade.

**Architecture:** um pacote TypeScript (`packages/despesas-ia`) guarda e testa o contrato com a IA (prompt, schema, montagem da requisição e validação da resposta) e gera as constantes que os flows usam. Os flows do Power Automate (provisionados por scripts PowerShell idempotentes, no padrão de `packages/deploy/provision-flow-consultar-onedrive.ps1`) fazem o upload no SharePoint, a prévia e a análise. Uma avaliação offline com ~30 comprovantes reais mede o acerto antes de ligar no PROD.

**Tech Stack:** TypeScript (Node 24, type stripping), Vitest, `@anthropic-ai/sdk` (só na avaliação), Power Automate (Dataverse, SharePoint, HTTP), Dataverse Web API, PowerShell + `az`.

**Spec:** `docs/superpowers/specs/2026-10-13-despesas-validacao-ia-design.md`

## Global Constraints
- Modelo `claude-opus-5-5`, `output_config.effort` = `medium`, `output_config.format` = `json_schema`, `max_tokens` 8000. No flow: `fallbacks: "default"` com header `anthropic-beta: server-side-fallback-2026-07-01`; gravar `body.model` em `cr40f_iamodelo`.
- A IA decide (abordagem B). O flow só monta contexto e trava falhas técnicas; nunca grava `Validado` em erro.
- Tolerância de valor R$ 0,50; sem teto de valor; motorista não é avisado; despesas antigas fora do escopo.
- Gatilho só para `cr40f_origem` = 100000000 (App Motoristas).
- Comprovantes novos no SharePoint (site e biblioteca do "Flow - Consultar Arquivos Sharepoint"), pasta `Despesas/AAAA/MM`. Arquivos antigos ficam no OneDrive. Contrato do App Motoristas não muda.
- Tudo é feito primeiro no DEV (`org23b93544.crm2.dynamics.com`, solução `AppBetinhos`). PROD só com ok explícito do Renan, por import da solução.
- Fuso America/Sao_Paulo; textos em pt-BR com acentos; commits em português, detalhados.
- Segredos (chave da API) nunca no repositório, em log ou em saída de flow (`secureData` nas ações HTTP).

---

### Task 1: Descoberta no DEV (somente leitura)

Confirma o que o plano assume e registra os valores exatos usados nas tasks 5–7.

**Files:**
- Create: `packages/deploy/inspecionar-despesas-ia.ps1`
- Create: `docs/superpowers/notes/2026-10-13-despesas-ia-descoberta.md`

**Interfaces:**
- Produces: nota com `SITE_URL`, `BIBLIOTECA` (nome e id), nome e trigger do flow de upload de comprovantes, ações de OneDrive nele, tamanho máximo e médio das fotos no DEV, e o nome do campo de cliente na reserva.

- [ ] **Step 1: Escrever o script de inspeção**

```powershell
# Somente leitura no DEV: lista o que o plano de despesas com IA precisa saber. Requer `az login`.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; Prefer = 'odata.include-annotations="*"' }
function Dv([string] $Path) { Invoke-RestMethod -Method GET -Uri "$environmentUrl/api/data/v9.2/$Path" -Headers $headers -TimeoutSec 60 }

$nomes = @('Flow Comprovantes Despesas Assincrono | App Motoristas', 'Flow Salvar Arquivos Onedrive', 'Flow - Consultar Arquivos Sharepoint', 'Flow - Consultar Arquivo OneDrive')
foreach ($nome in $nomes) {
  $wf = @((Dv "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$nome' and category eq 5").value)
  Write-Host "`n=== $nome ($($wf.Count) encontrado) ==="
  if (-not $wf.Count) { continue }
  $def = ($wf[0].clientdata | ConvertFrom-Json).properties.definition
  Write-Host "estado: $($wf[0].statecode)"
  Write-Host "trigger: $(($def.triggers | ConvertTo-Json -Depth 8 -Compress).Substring(0, [Math]::Min(600, ($def.triggers | ConvertTo-Json -Depth 8 -Compress).Length)))"
  # Ações de arquivo (OneDrive/SharePoint), com dataset e caminho quando houver.
  $json = $def | ConvertTo-Json -Depth 90 -Compress
  [regex]::Matches($json, '"operationId":"([A-Za-z]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique | ForEach-Object { Write-Host "operação: $_" }
  [regex]::Matches($json, '"dataset":"([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique | ForEach-Object { Write-Host "dataset: $_" }
  [regex]::Matches($json, '"(folderPath|table|path)":"([^"]+)"') | ForEach-Object { "$($_.Groups[1].Value)=$($_.Groups[2].Value)" } | Sort-Object -Unique | ForEach-Object { Write-Host "caminho: $_" }
}

$anexos = @((Dv "cr40f_anexodespesaoperacionals?`$select=cr40f_tamanhobytes,cr40f_mimetype,cr40f_urlsharepoint&`$top=200&`$orderby=createdon desc").value)
$tamanhos = @($anexos | Where-Object { $_.cr40f_tamanhobytes } | ForEach-Object { [int]$_.cr40f_tamanhobytes })
Write-Host "`nanexos lidos: $($anexos.Count); com tamanho: $($tamanhos.Count)"
if ($tamanhos.Count) { Write-Host "tamanho médio: $([int]($tamanhos | Measure-Object -Average).Average) bytes; máximo: $(($tamanhos | Measure-Object -Maximum).Maximum) bytes" }

$attrs = @((Dv "EntityDefinitions(LogicalName='cr40f_reservadeveculos')/Attributes?`$select=LogicalName,AttributeType&`$filter=AttributeType eq Microsoft.Dynamics.CRM.AttributeTypeCode'Lookup'").value)
Write-Host "`nlookups da reserva: $(($attrs | ForEach-Object { $_.LogicalName }) -join ', ')"
```

- [ ] **Step 2: Rodar e registrar**

Run: `powershell -File packages/deploy/inspecionar-despesas-ia.ps1`
Expected: saída com os 4 flows (estado, trigger, operações, dataset do SharePoint e caminhos), tamanho das fotos e lookups da reserva. Nenhuma escrita.

- [ ] **Step 3: Escrever a nota de descoberta** com os valores exatos: `SITE_URL` (dataset do "Flow - Consultar Arquivos Sharepoint"), `BIBLIOTECA`, flow que o App Motoristas chama para comprovante de despesa e se ele atende outros uploads, ação que grava no OneDrive (nome e `operationId`), contrato de entrada e resposta desse flow, tamanho máximo de foto, lookup de cliente na reserva (`_cr40f_cliente_value` esperado).

- [ ] **Step 4: Gate.** Mostrar a nota ao Renan e confirmar site/biblioteca antes da Task 5. Se o flow de upload também atende outros arquivos, registrar qual condição identifica despesa.

- [ ] **Step 5: Commit**

```bash
git add packages/deploy/inspecionar-despesas-ia.ps1 docs/superpowers/notes/2026-10-13-despesas-ia-descoberta.md
git commit -m "Despesas IA: inspeção somente leitura do DEV e nota de descoberta"
```

---

### Task 2: Pacote `@betinhos/despesas-ia` (contrato com a IA)

**Files:**
- Create: `packages/despesas-ia/package.json`
- Create: `packages/despesas-ia/tsconfig.json`
- Create: `packages/despesas-ia/src/schema.ts`
- Create: `packages/despesas-ia/src/contexto.ts`
- Create: `packages/despesas-ia/src/prompt.ts`
- Create: `packages/despesas-ia/src/requisicao.ts`
- Create: `packages/despesas-ia/src/resposta.ts`
- Create: `packages/despesas-ia/src/index.ts`
- Test: `packages/despesas-ia/src/despesas-ia.test.ts`

**Interfaces:**
- Produces:
  - `RESPOSTA_SCHEMA` (objeto JSON Schema), `DECISOES = ['validar','precisa_corrigir']`, `type RespostaIA`
  - `type ContextoDespesa`, `type Comprovante = { mime: string; base64: string }`
  - `SYSTEM_PROMPT: string`, `PREFIXO_USUARIO: string`, `montarTextoUsuario(ctx: ContextoDespesa): string`
  - `MODELO`, `MAX_TOKENS`, `EFFORT`, `LIMITE_BYTES_IMAGEM`, `montarRequisicao(ctx, comprovantes): RequisicaoMensagem`
  - `analisarMensagem(msg: MensagemApi, ctx: ContextoDespesa): Resultado` com `Resultado = { ok: true; resposta: RespostaIA } | { ok: false; erro: string }`

- [ ] **Step 1: Criar `package.json` e `tsconfig.json`**

```json
{
  "name": "@betinhos/despesas-ia",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json",
    "constantes": "node scripts/gerar-constantes.ts",
    "avaliar": "node scripts/avaliar.ts"
  },
  "devDependencies": {
    "@anthropic-ai/sdk": "latest",
    "@types/node": "^24.0.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "allowImportingTsExtensions": true, "lib": ["ES2022"], "types": ["node"] },
  "include": ["src", "scripts"]
}
```

Run: `pnpm install` na raiz. Conferir no `git diff pnpm-lock.yaml` que só entrou o pacote novo e suas dependências; fixar no `package.json` a versão exata do `@anthropic-ai/sdk` resolvida (no lugar de `latest`).

- [ ] **Step 2: Escrever os testes (falhando)**

```ts
import { describe, expect, it } from 'vitest'
import { RESPOSTA_SCHEMA, analisarMensagem, montarRequisicao, montarTextoUsuario, PREFIXO_USUARIO, type ContextoDespesa } from './index.ts'

const ctx: ContextoDespesa = {
  despesa: { id: 'd1', valor: 85.4, dataGasto: '2026-10-12', categoria: 'Combustível', formaPagamento: 'Cartão corporativo', estabelecimento: 'Posto X', litros: 32.5, km: 120345, observacao: null },
  reservas: [{ id: 'r1', saida: '2026-10-12T13:00:00Z', cliente: 'Embraer', status: 'Concluído' }],
  duplicatas: [],
  referencia: { categoria: 'Combustível', mediana: 180, maximo: 420, amostras: 210 },
}
const valida = { comprovante_legivel: true, tipo_comprovante: 'nfce', valor_lido: 85.4, data_lida: '2026-10-12', hora_lida: '14:32', cnpj_lido: null, estabelecimento_lido: 'Posto X', litros_lidos: 32.5, decisao: 'validar', motivos: [], reserva_id: 'r1', possivel_duplicidade: false, confianca: 0.93 }
const msg = (corpo: unknown, stop = 'end_turn') => ({ stop_reason: stop, model: 'claude-opus-5-5', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(corpo) }] })

describe('schema', () => {
  it('exige todos os campos e não aceita campos extras', () => {
    expect(RESPOSTA_SCHEMA.additionalProperties).toBe(false)
    expect([...RESPOSTA_SCHEMA.required].sort()).toEqual(Object.keys(RESPOSTA_SCHEMA.properties).sort())
  })
  it('não usa restrições numéricas nem de tamanho (não suportadas)', () => {
    expect(JSON.stringify(RESPOSTA_SCHEMA)).not.toMatch(/minimum|maximum|minLength|maxLength/)
  })
})

describe('montarRequisicao', () => {
  it('manda imagens antes do texto, com modelo, effort e schema', () => {
    const req = montarRequisicao(ctx, [{ mime: 'image/jpeg', base64: 'QUJD' }])
    expect(req.model).toBe('claude-opus-5-5')
    expect(req.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: RESPOSTA_SCHEMA } })
    expect(req.messages[0].content.map((b) => b.type)).toEqual(['image', 'text'])
  })
  it('PDF vira document', () => {
    const req = montarRequisicao(ctx, [{ mime: 'application/pdf', base64: 'QUJD' }])
    expect(req.messages[0].content[0]).toMatchObject({ type: 'document', source: { media_type: 'application/pdf' } })
  })
  it('usa no máximo 3 comprovantes', () => {
    const quatro = Array.from({ length: 4 }, () => ({ mime: 'image/png', base64: 'QUJD' }))
    expect(montarRequisicao(ctx, quatro).messages[0].content).toHaveLength(4)
  })
  it('recusa sem comprovante, tipo não suportado e arquivo acima de 5 MB', () => {
    expect(() => montarRequisicao(ctx, [])).toThrow('Despesa sem comprovante.')
    expect(() => montarRequisicao(ctx, [{ mime: 'image/heic', base64: 'QUJD' }])).toThrow('Tipo de comprovante não suportado: image/heic')
    expect(() => montarRequisicao(ctx, [{ mime: 'image/jpeg', base64: 'A'.repeat(7_100_000) }])).toThrow('Arquivo acima de 5 MB.')
  })
  it('texto do usuário é o prefixo seguido do contexto em JSON', () => {
    expect(montarTextoUsuario(ctx)).toBe(PREFIXO_USUARIO + JSON.stringify(ctx))
  })
})

describe('analisarMensagem', () => {
  it('aceita resposta válida', () => {
    expect(analisarMensagem(msg(valida), ctx)).toEqual({ ok: true, resposta: valida })
  })
  it('recusa stop_reason diferente de end_turn', () => {
    expect(analisarMensagem(msg(valida, 'max_tokens'), ctx)).toEqual({ ok: false, erro: 'Resposta incompleta (stop_reason: max_tokens).' })
  })
  it('recusa JSON inválido', () => {
    const quebrada = { stop_reason: 'end_turn', model: 'x', content: [{ type: 'text', text: '{"decisao":' }] }
    expect(analisarMensagem(quebrada, ctx)).toEqual({ ok: false, erro: 'Resposta não é JSON válido.' })
  })
  it('recusa OS fora do contexto', () => {
    expect(analisarMensagem(msg({ ...valida, reserva_id: 'r9' }), ctx)).toEqual({ ok: false, erro: 'OS indicada fora do contexto: r9.' })
  })
  it('exige motivos quando precisa corrigir', () => {
    expect(analisarMensagem(msg({ ...valida, decisao: 'precisa_corrigir', motivos: [] }), ctx)).toEqual({ ok: false, erro: 'Decisão "precisa_corrigir" sem motivos.' })
  })
  it('recusa decisão desconhecida e confiança fora de 0–1', () => {
    expect(analisarMensagem(msg({ ...valida, decisao: 'aprovar' }), ctx)).toEqual({ ok: false, erro: 'Decisão inválida: aprovar.' })
    expect(analisarMensagem(msg({ ...valida, confianca: 1.4 }), ctx)).toEqual({ ok: false, erro: 'Confiança fora de 0–1: 1.4.' })
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/despesas-ia test`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 4: Implementar `schema.ts`**

```ts
const anulavel = (tipo: Record<string, unknown>) => ({ anyOf: [tipo, { type: 'null' }] })

export const DECISOES = ['validar', 'precisa_corrigir'] as const
export const TIPOS_COMPROVANTE = ['cupom_fiscal', 'nfce', 'pedagio', 'estacionamento', 'recibo', 'outro'] as const

const properties = {
  comprovante_legivel: { type: 'boolean' },
  tipo_comprovante: { type: 'string', enum: [...TIPOS_COMPROVANTE] },
  valor_lido: anulavel({ type: 'number' }),
  data_lida: anulavel({ type: 'string', format: 'date' }),
  hora_lida: anulavel({ type: 'string' }),
  cnpj_lido: anulavel({ type: 'string' }),
  estabelecimento_lido: anulavel({ type: 'string' }),
  litros_lidos: anulavel({ type: 'number' }),
  decisao: { type: 'string', enum: [...DECISOES] },
  motivos: { type: 'array', items: { type: 'string' } },
  reserva_id: anulavel({ type: 'string' }),
  possivel_duplicidade: { type: 'boolean' },
  confianca: { type: 'number' },
}

/** Schema da saída estruturada (`output_config.format`). Sem minimum/maximum/minLength: a API não suporta; a validação fica em `analisarMensagem`. */
export const RESPOSTA_SCHEMA = {
  type: 'object',
  properties,
  required: Object.keys(properties) as (keyof typeof properties)[],
  additionalProperties: false,
} as const

export type Decisao = (typeof DECISOES)[number]
export type RespostaIA = {
  comprovante_legivel: boolean
  tipo_comprovante: (typeof TIPOS_COMPROVANTE)[number]
  valor_lido: number | null
  data_lida: string | null
  hora_lida: string | null
  cnpj_lido: string | null
  estabelecimento_lido: string | null
  litros_lidos: number | null
  decisao: Decisao
  motivos: string[]
  reserva_id: string | null
  possivel_duplicidade: boolean
  confianca: number
}
```

- [ ] **Step 5: Implementar `contexto.ts`**

```ts
/** Contexto que o flow monta para cada despesa. Datas em America/Sao_Paulo (YYYY-MM-DD); saída da OS em ISO UTC. */
export type ContextoDespesa = {
  despesa: {
    id: string
    valor: number
    dataGasto: string
    categoria: string
    formaPagamento: string
    estabelecimento: string | null
    litros: number | null
    km: number | null
    observacao: string | null
  }
  reservas: { id: string; saida: string; cliente: string; status: string }[]
  duplicatas: { id: string; valor: number; dataGasto: string; motivo: 'mesmo_arquivo' | 'mesmo_valor_data' }[]
  referencia: { categoria: string; mediana: number | null; maximo: number | null; amostras: number }
}

export type Comprovante = { mime: string; base64: string }
```

- [ ] **Step 6: Implementar `prompt.ts`**

```ts
import type { ContextoDespesa } from './contexto.ts'

export const SYSTEM_PROMPT = `Você confere despesas operacionais de motoristas da Betinhos Executive Service (transporte executivo, São Paulo).
Recebe a foto (ou PDF) do comprovante e o lançamento feito pelo motorista, com as OS dele no dia, possíveis duplicatas e a referência de valores da categoria.

Sua tarefa: ler o comprovante e decidir se a despesa pode ser validada.

Leitura:
- Extraia só o que estiver legível. Campo ilegível ou ausente = null. Nunca invente valor, data ou CNPJ.
- valor_lido é o total pago. data_lida no formato AAAA-MM-DD. Em combustível, leia os litros.

Decida "validar" somente se todas as condições forem verdadeiras:
1. O comprovante está legível e é coerente com a categoria lançada.
2. valor_lido difere do valor lançado em no máximo R$ 0,50.
3. data_lida é a data do gasto lançada, com tolerância de 1 dia.
4. Não há indício de duplicidade nas despesas enviadas em "duplicatas".
5. O valor é plausível frente à referência da categoria (mediana e máximo). Valor muito acima do máximo exige justificativa visível no comprovante ou na observação.
Em qualquer dúvida, decida "precisa_corrigir" e explique em "motivos" (frases curtas, em português, que o financeiro entenda sem abrir a foto).

OS: escolha reserva_id somente entre as OS enviadas no contexto, a mais coerente com a hora e o local do gasto. Se nenhuma for coerente, use null. A ausência de OS não impede validar.
possivel_duplicidade = true quando o comprovante parecer o mesmo de outra despesa ou houver duplicata com mesmo valor e data.
confianca: de 0 a 1, o quanto você confia na leitura e na decisão.`

export const PREFIXO_USUARIO = 'Lançamento e contexto da despesa (JSON):\n'

export function montarTextoUsuario(ctx: ContextoDespesa) {
  return PREFIXO_USUARIO + JSON.stringify(ctx)
}
```

- [ ] **Step 7: Implementar `requisicao.ts`**

```ts
import type { Comprovante, ContextoDespesa } from './contexto.ts'
import { montarTextoUsuario, SYSTEM_PROMPT } from './prompt.ts'
import { RESPOSTA_SCHEMA } from './schema.ts'

export const MODELO = 'claude-opus-5-5'
export const MAX_TOKENS = 8000
export const EFFORT = 'medium'
export const LIMITE_BYTES_IMAGEM = 5 * 1024 * 1024
const IMAGENS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

type Bloco =
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
  | { type: 'text'; text: string }

export type RequisicaoMensagem = {
  model: string
  max_tokens: number
  system: string
  output_config: { effort: string; format: { type: 'json_schema'; schema: typeof RESPOSTA_SCHEMA } }
  messages: [{ role: 'user'; content: Bloco[] }]
}

function bloco(c: Comprovante): Bloco {
  if (Math.floor((c.base64.length * 3) / 4) > LIMITE_BYTES_IMAGEM) throw new Error('Arquivo acima de 5 MB.')
  if (c.mime === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: c.base64 } }
  if (!IMAGENS.includes(c.mime)) throw new Error(`Tipo de comprovante não suportado: ${c.mime}`)
  return { type: 'image', source: { type: 'base64', media_type: c.mime, data: c.base64 } }
}

export function montarRequisicao(ctx: ContextoDespesa, comprovantes: Comprovante[]): RequisicaoMensagem {
  if (!comprovantes.length) throw new Error('Despesa sem comprovante.')
  return {
    model: MODELO,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: RESPOSTA_SCHEMA } },
    messages: [{ role: 'user', content: [...comprovantes.slice(0, 3).map(bloco), { type: 'text', text: montarTextoUsuario(ctx) }] }],
  }
}
```

- [ ] **Step 8: Implementar `resposta.ts`**

```ts
import type { ContextoDespesa } from './contexto.ts'
import { DECISOES, RESPOSTA_SCHEMA, type RespostaIA } from './schema.ts'

export type MensagemApi = { stop_reason: string | null; model: string; content: { type: string; text?: string }[] }
export type Resultado = { ok: true; resposta: RespostaIA } | { ok: false; erro: string }

/** Travas técnicas da resposta. As mesmas regras são replicadas no flow de análise (Task 7). */
export function analisarMensagem(msg: MensagemApi, ctx: ContextoDespesa): Resultado {
  if (msg.stop_reason !== 'end_turn') return { ok: false, erro: `Resposta incompleta (stop_reason: ${msg.stop_reason}).` }
  const texto = msg.content.find((b) => b.type === 'text')?.text ?? ''
  let r: RespostaIA
  try { r = JSON.parse(texto) } catch { return { ok: false, erro: 'Resposta não é JSON válido.' } }
  const faltando = RESPOSTA_SCHEMA.required.filter((campo) => !(campo in (r as object)))
  if (faltando.length) return { ok: false, erro: `Campos ausentes: ${faltando.join(', ')}.` }
  if (!(DECISOES as readonly string[]).includes(r.decisao)) return { ok: false, erro: `Decisão inválida: ${r.decisao}.` }
  if (r.decisao === 'precisa_corrigir' && !r.motivos.length) return { ok: false, erro: 'Decisão "precisa_corrigir" sem motivos.' }
  if (typeof r.confianca !== 'number' || r.confianca < 0 || r.confianca > 1) return { ok: false, erro: `Confiança fora de 0–1: ${r.confianca}.` }
  if (r.reserva_id !== null && !ctx.reservas.some((os) => os.id === r.reserva_id)) return { ok: false, erro: `OS indicada fora do contexto: ${r.reserva_id}.` }
  return { ok: true, resposta: r }
}
```

- [ ] **Step 9: `index.ts`**

```ts
export * from './contexto.ts'
export * from './prompt.ts'
export * from './requisicao.ts'
export * from './resposta.ts'
export * from './schema.ts'
```

- [ ] **Step 10: Rodar testes e typecheck**

Run: `pnpm --filter @betinhos/despesas-ia test && pnpm --filter @betinhos/despesas-ia typecheck`
Expected: PASS, sem erros de tipo.

- [ ] **Step 11: Commit**

```bash
git add packages/despesas-ia pnpm-lock.yaml
git commit -m "Despesas IA: pacote com prompt, schema, requisição e travas da resposta"
```

---

### Task 3: Constantes para os flows

O flow não executa TypeScript: ele recebe prompt, schema e parâmetros gerados deste pacote, para os dois lados nunca divergirem.

**Files:**
- Create: `packages/despesas-ia/scripts/gerar-constantes.ts`
- Modify: `.gitignore` (acrescentar `packages/despesas-ia/.local/`)
- Test: `packages/despesas-ia/src/despesas-ia.test.ts` (novo `describe`)

**Interfaces:**
- Consumes: `SYSTEM_PROMPT`, `PREFIXO_USUARIO`, `RESPOSTA_SCHEMA`, `MODELO`, `MAX_TOKENS`, `EFFORT` (Task 2).
- Produces: `packages/despesas-ia/dist/constantes.json` = `{ modelo, maxTokens, effort, systemPrompt, prefixoUsuario, schema }` e a função `constantesDoFlow()` exportada por `src/constantes.ts`.

- [ ] **Step 1: Teste (falhando)**

```ts
import { constantesDoFlow } from './constantes.ts'
describe('constantes do flow', () => {
  it('espelham o pacote', () => {
    expect(constantesDoFlow()).toEqual({ modelo: MODELO, maxTokens: MAX_TOKENS, effort: EFFORT, systemPrompt: SYSTEM_PROMPT, prefixoUsuario: PREFIXO_USUARIO, schema: RESPOSTA_SCHEMA })
  })
})
```
(Acrescentar `MODELO, MAX_TOKENS, EFFORT, SYSTEM_PROMPT` ao import do topo.)

Run: `pnpm --filter @betinhos/despesas-ia test` → FAIL.

- [ ] **Step 2: Implementar `src/constantes.ts`, exportar no `index.ts` e o script**

```ts
// src/constantes.ts
import { PREFIXO_USUARIO, SYSTEM_PROMPT } from './prompt.ts'
import { EFFORT, MAX_TOKENS, MODELO } from './requisicao.ts'
import { RESPOSTA_SCHEMA } from './schema.ts'

export function constantesDoFlow() {
  return { modelo: MODELO, maxTokens: MAX_TOKENS, effort: EFFORT, systemPrompt: SYSTEM_PROMPT, prefixoUsuario: PREFIXO_USUARIO, schema: RESPOSTA_SCHEMA }
}
```

```ts
// scripts/gerar-constantes.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { constantesDoFlow } from '../src/index.ts'

mkdirSync(new URL('../dist/', import.meta.url), { recursive: true })
writeFileSync(new URL('../dist/constantes.json', import.meta.url), JSON.stringify(constantesDoFlow(), null, 2), 'utf8')
console.log('dist/constantes.json gerado')
```

Em `index.ts`: `export * from './constantes.ts'`. Em `.gitignore`: linha `packages/despesas-ia/.local/`.

- [ ] **Step 3: Rodar**

Run: `pnpm --filter @betinhos/despesas-ia test && pnpm --filter @betinhos/despesas-ia constantes`
Expected: PASS e `dist/constantes.json gerado`.

- [ ] **Step 4: Commit**

```bash
git add packages/despesas-ia .gitignore
git commit -m "Despesas IA: constantes geradas para os flows a partir do pacote"
```

---

### Task 4: Colunas `cr40f_ia*` no DEV

**Files:**
- Create: `packages/deploy/provision-despesas-ia-schema.ps1`

**Interfaces:**
- Produces: colunas em `cr40f_despesaoperacional`, na solução AppBetinhos, publicadas:
  `cr40f_iastatusanalise` (Pendente 100000000, Processando 100000001, Concluída 100000002, Erro 100000003), `cr40f_iadecisao` (Validar 100000000, Precisa corrigir 100000001), `cr40f_iamotivos`, `cr40f_iavalorlido`, `cr40f_iadatalida`, `cr40f_iacnpjlido`, `cr40f_iaestabelecimentolido`, `cr40f_iaconfianca`, `cr40f_iajson`, `cr40f_iadataanalise`, `cr40f_iamodelo`.

- [ ] **Step 1: Escrever o script (idempotente, somente DEV)**

```powershell
# Cria no DEV as colunas da análise de despesas por IA em cr40f_despesaoperacional (solução AppBetinhos) e publica.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$entity = 'cr40f_despesaoperacional'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }
function Dv([string] $Method, [string] $Path, $Body = $null) {
  $p = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 120 }
  if ($null -ne $Body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 30 -Compress)); $p.ContentType = 'application/json; charset=utf-8' }
  Invoke-RestMethod @p
}
$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }

function Label([string] $t) { @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; LocalizedLabels = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; Label = $t; LanguageCode = 1046 }) } }
function Base([string] $type, [string] $schema, [string] $nome) {
  @{ '@odata.type' = "Microsoft.Dynamics.CRM.$type"; SchemaName = $schema; DisplayName = (Label $nome); Description = (Label "Análise de despesa por IA: $nome."); RequiredLevel = @{ Value = 'None'; CanBeChanged = $true } }
}
function Opcoes([string[]] $nomes) { $i = 0; @($nomes | ForEach-Object { @{ Value = 100000000 + $i++; Label = (Label $_) } }) }
function Choice([string] $schema, [string] $nome, [string[]] $opcoes) {
  $a = Base 'PicklistAttributeMetadata' $schema $nome
  $a.OptionSet = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.OptionSetMetadata'; IsGlobal = $false; OptionSetType = 'Picklist'; Options = (Opcoes $opcoes) }
  $a
}
function Texto([string] $schema, [string] $nome, [int] $max) { $a = Base 'StringAttributeMetadata' $schema $nome; $a.MaxLength = $max; $a.FormatName = @{ Value = 'Text' }; $a }
function Memo([string] $schema, [string] $nome) { $a = Base 'MemoAttributeMetadata' $schema $nome; $a.MaxLength = 100000; $a.Format = 'TextArea'; $a }

$colunas = @(
  (Choice 'cr40f_IaStatusAnalise' 'IA: status da análise' @('Pendente', 'Processando', 'Concluída', 'Erro')),
  (Choice 'cr40f_IaDecisao' 'IA: decisão' @('Validar', 'Precisa corrigir')),
  (Memo 'cr40f_IaMotivos' 'IA: motivos'),
  ((Base 'MoneyAttributeMetadata' 'cr40f_IaValorLido' 'IA: valor lido') + @{ PrecisionSource = 2 }),
  ((Base 'DateTimeAttributeMetadata' 'cr40f_IaDataLida' 'IA: data lida') + @{ Format = 'DateOnly'; DateTimeBehavior = @{ Value = 'DateOnly' } }),
  (Texto 'cr40f_IaCnpjLido' 'IA: CNPJ lido' 20),
  (Texto 'cr40f_IaEstabelecimentoLido' 'IA: estabelecimento lido' 200),
  ((Base 'DecimalAttributeMetadata' 'cr40f_IaConfianca' 'IA: confiança') + @{ Precision = 2; MinValue = 0; MaxValue = 1 }),
  (Memo 'cr40f_IaJson' 'IA: resposta bruta'),
  ((Base 'DateTimeAttributeMetadata' 'cr40f_IaDataAnalise' 'IA: data da análise') + @{ Format = 'DateAndTime'; DateTimeBehavior = @{ Value = 'UserLocal' } }),
  (Texto 'cr40f_IaModelo' 'IA: modelo' 60)
)
foreach ($c in $colunas) {
  $logical = $c.SchemaName.ToLower()
  $existe = $true
  try { Dv GET "EntityDefinitions(LogicalName='$entity')/Attributes(LogicalName='$logical')?`$select=LogicalName" | Out-Null } catch { $existe = $false }
  if ($existe) { Write-Host "[schema] $logical já existe"; continue }
  Write-Host "[schema] criando $logical"
  Dv POST "EntityDefinitions(LogicalName='$entity')/Attributes" $c | Out-Null
}
Dv POST PublishXml @{ ParameterXml = "<importexportxml><entities><entity>$entity</entity></entities></importexportxml>" } | Out-Null
foreach ($c in $colunas) { Dv GET "EntityDefinitions(LogicalName='$entity')/Attributes(LogicalName='$($c.SchemaName.ToLower())')?`$select=LogicalName" | Out-Null }
Write-Host '[schema] colunas conferidas e publicadas'
```

- [ ] **Step 2: Rodar duas vezes**

Run: `powershell -File packages/deploy/provision-despesas-ia-schema.ps1` (duas vezes)
Expected: 1ª execução cria as 11 colunas; 2ª só imprime "já existe" e termina com "colunas conferidas e publicadas".

- [ ] **Step 3: Conferir pertencimento à solução**

Run (MCP Dataverse_DEV, leitura): `describe('tables/cr40f_despesaoperacional')` mostra as 11 colunas; no maker portal, a solução AppBetinhos lista as colunas novas da tabela.

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/provision-despesas-ia-schema.ps1
git commit -m "Despesas IA: colunas cr40f_ia* da análise criadas no DEV via script"
```

---

### Task 5: Upload dos comprovantes no SharePoint

**Files:**
- Create: `packages/deploy/patch-flow-comprovantes-sharepoint.ps1`
- Create (gerado, no repo): `packages/deploy/flows/backup/<nome-do-flow>-<aaaammdd-hhmm>.json`

**Interfaces:**
- Consumes: da nota da Task 1: nome do flow de upload, nome da ação OneDrive `CreateFile`, `SITE_URL`, `BIBLIOTECA`.
- Produces: anexos novos com `cr40f_driveitemid` = id do item no SharePoint (`ItemId`), `cr40f_urlsharepoint` = link do item, `cr40f_sharelink` = mesmo link, `cr40f_mimetype`, `cr40f_tamanhobytes`. Resposta HTTP do flow igual à atual.

- [ ] **Step 1: Script com backup, troca da ação e PATCH**

O script (somente DEV, mesmo cabeçalho de autenticação da Task 4) faz:
1. `GET workflows?$filter=name eq '<flow de upload>' and category eq 5` → salva `clientdata` em `packages/deploy/flows/backup/` antes de qualquer mudança.
2. Na definição, substitui a ação de `operationId` `CreateFile` do OneDrive (nome vindo da nota) pela ação SharePoint abaixo, mantendo nome, `runAfter` e o conteúdo (`body`) da ação original:

```json
{
  "type": "OpenApiConnection",
  "inputs": {
    "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline", "connectionName": "shared_sharepointonline", "operationId": "CreateFile" },
    "parameters": {
      "dataset": "<SITE_URL da nota>",
      "folderPath": "/<BIBLIOTECA da nota>/Despesas/@{convertTimeZone(utcNow(), 'UTC', 'E. South America Standard Time', 'yyyy')}/@{convertTimeZone(utcNow(), 'UTC', 'E. South America Standard Time', 'MM')}",
      "name": "<mesma expressão de nome da ação original>",
      "body": "<mesma expressão de conteúdo da ação original>"
    },
    "authentication": "@parameters('$authentication')",
    "retryPolicy": { "type": "fixed", "count": 2, "interval": "PT5S" }
  }
}
```

3. Logo após a ação, acrescenta `Link_comprovante` (SharePoint `CreateSharingLink`, `type: view`, `scope: organization`, `id: @body('<ação>')?['ItemId']`) e ajusta a atualização do anexo no Dataverse para gravar `cr40f_driveitemid` = `@{body('<ação>')?['ItemId']}`, `cr40f_urlsharepoint` e `cr40f_sharelink` = `@{body('Link_comprovante')?['link']?['webUrl']}`, `cr40f_mimetype` = o tipo enviado pelo app (ou `image/jpeg` pela extensão), `cr40f_tamanhobytes` = `@{length(base64ToBinary(<conteúdo>))}`.
4. Acrescenta a connection reference `shared_sharepointonline` copiada do "Flow - Consultar Arquivos Sharepoint" (mesma técnica do `provision-flow-consultar-onedrive.ps1`) e faz `PATCH workflows(<id>)` com o `clientdata` novo; desativa e reativa o flow (`statecode` 0 → 1) para aplicar.
5. Se o flow atende outros uploads, a troca acontece só dentro do ramo de despesa identificado na nota.

- [ ] **Step 2: Rodar no DEV e testar com uma despesa de teste**

Run: `powershell -File packages/deploy/patch-flow-comprovantes-sharepoint.ps1`
Depois: enviar uma despesa de teste pelo App Motoristas no DEV com uma foto.
Expected: arquivo em `<BIBLIOTECA>/Despesas/AAAA/MM/`; anexo com `cr40f_driveitemid`, `cr40f_urlsharepoint`, `cr40f_sharelink`, `cr40f_mimetype`, `cr40f_tamanhobytes` preenchidos (conferir via MCP Dataverse_DEV); o app recebe a mesma resposta de antes, sem erro.

- [ ] **Step 3: Commit**

```bash
git add packages/deploy/patch-flow-comprovantes-sharepoint.ps1 packages/deploy/flows/backup
git commit -m "Despesas IA: comprovantes novos passam a ser salvos no SharePoint (DEV)"
```

---

### Task 6: Prévia dos comprovantes do SharePoint

**Files:**
- Modify: `packages/deploy/provision-flow-consultar-onedrive.ps1` (ramo SharePoint)
- Modify: `apps/shell/src/pages/despesas/data/arquivo.ts:30-45`
- Test: `apps/shell/src/pages/despesas/data/arquivo.test.ts`

**Interfaces:**
- Consumes: anexos da Task 5 (`driveItemId` = id do item no SharePoint, `url` do site, não `betinhos-my`).
- Produces: corpo do POST ao flow `{ id, nomeArquivo, origem: 'sharepoint' }` para itens do SharePoint; demais casos inalterados.

- [ ] **Step 1: Teste (falhando)**

```ts
  it('comprovante novo no SharePoint vai com origem sharepoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sucesso: true, nomeArquivo: 'd1-1.jpg', mimeType: 'image/jpeg', conteudoBase64: btoa('abc') }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:teste' }))
    const novo = { ...anexo, driveItemId: '42', url: 'https://betinhos.sharepoint.com/:i:/s/sistema/abc' }
    await createArquivos(client())(novo)
    expect(JSON.parse(String(((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body))).toEqual({ id: '42', nomeArquivo: 'cupom.jpg', origem: 'sharepoint' })
  })
```

Run: `pnpm --filter @betinhos/shell test -- arquivo` → FAIL.

- [ ] **Step 2: Implementar em `arquivo.ts`**

```ts
/** Comprovantes novos ficam no SharePoint do sistema; os antigos, no OneDrive do noreply (`betinhos-my`). */
const noSharePoint = (url: string | null) => !!url && /^https:\/\/[^/]+\.sharepoint\.com\//i.test(url) && !/^https:\/\/[^/]+-my\.sharepoint\.com\//i.test(url)
```

e trocar a montagem do corpo em `buscar`:

```ts
    const body = anexo.driveItemId
      ? { id: anexo.driveItemId, nomeArquivo: anexo.nome, ...(noSharePoint(anexo.url) ? { origem: 'sharepoint' } : {}) }
      : { link: anexo.url, nomeArquivo: anexo.nome }
```

- [ ] **Step 3: Ramo SharePoint no flow de consulta**

Em `provision-flow-consultar-onedrive.ps1`, acrescentar `origem` ao schema do trigger e, antes de `Resolver`, uma condição `ViaSharePoint` (`equals(triggerBody()?['origem'], 'sharepoint')`) que executa SharePoint `GetFileContent` (`dataset` = `SITE_URL` da nota, `id` = `triggerBody()?['id']`, `inferContentType: true`), confere que o caminho do item (`GetFileMetadata`) contém `/Despesas/`, responde no mesmo formato (`sucesso`, `nomeArquivo`, `mimeType`, `conteudoBase64`) e termina (`Terminate` Succeeded). O ramo OneDrive atual fica no `else`, sem mudança. Rodar o script (idempotente) no DEV.

- [ ] **Step 4: Testes, typecheck e publicação no DEV**

Run: `pnpm --filter @betinhos/shell test && pnpm typecheck && pnpm push`
Expected: PASS; `pnpm push` publica no DEV e informa a versão do build. Abrir Despesas no DEV autenticado: o comprovante da despesa de teste (Task 5) abre na prévia; um antigo (OneDrive) também.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/despesas/data packages/deploy/provision-flow-consultar-onedrive.ps1 apps/shell/package.json pnpm-lock.yaml
git commit -m "Despesas: prévia lê comprovantes novos do SharePoint sem quebrar os antigos do OneDrive"
```

---

### Task 7: Flow de análise por IA no DEV

**Files:**
- Create: `packages/deploy/provision-flow-despesas-ia.ps1`

**Interfaces:**
- Consumes: `packages/despesas-ia/dist/constantes.json` (Task 3), colunas da Task 4, anexos da Task 5.
- Produces: flow "Flow Despesas | Análise IA" (ativado, na AppBetinhos) e variável de ambiente `new_AnthropicApiKey` (texto, valor só no ambiente, nunca no export da solução).

- [ ] **Step 1: Variável da chave**

O script cria a definição `new_AnthropicApiKey` (tipo String, sem valor padrão) na AppBetinhos se não existir. O valor é preenchido pelo Renan no maker portal do DEV (Soluções → AppBetinhos → Variáveis de ambiente), nunca pelo script nem pelo repositório. O flow usa `parameters('new_AnthropicApiKey (new_AnthropicApiKey)')` e todas as ações que a tocam ficam com `runtimeConfiguration.secureData` em entradas e saídas.

- [ ] **Step 2: Definição do flow (gerada pelo script)**

O script lê `constantes.json`, monta a definição abaixo, cria ou atualiza o workflow (`category 5`, `type 1`) com as connection references do Dataverse e do SharePoint copiadas de flows existentes, inclui na solução (componente 29) e ativa. Ações, em ordem:

1. **Trigger** `Quando_comprovante_completo` (Dataverse `SubscribeWebhookTrigger`): `message` 4 (criar ou atualizar), `entityname` `cr40f_despesaoperacional`, `scope` 4, `filteringattributes` `cr40f_statusanexo`, `filterexpression` `cr40f_statusanexo eq 100000002 and cr40f_origem eq 100000000 and (cr40f_iastatusanalise eq null or cr40f_iastatusanalise eq 100000000)`; `runtimeConfiguration.concurrency.runs` = 1.
2. **Marcar_processando**: `UpdateRecord` `cr40f_iastatusanalise` = 100000001.
3. **Escopo_analise** (Scope) contendo:
   - `Dia_do_gasto` (Compose): `convertTimeZone(triggerOutputs()?['body/cr40f_datagasto'], 'UTC', 'E. South America Standard Time', 'yyyy-MM-dd')`.
   - `Comprovantes` (`ListRecords` `cr40f_anexodespesaoperacionals`): `$filter` `_cr40f_despesa_value eq @{id} and cr40f_tipo eq 100000000 and cr40f_status eq 100000001`, `$orderby` `cr40f_ordem asc`, `$top` 3.
   - Condição `Sem_comprovante` (`empty(...)`): `Terminate` Failed com mensagem "Despesa sem comprovante." (cai no tratamento de erro).
   - `Arquivos` (Apply to each, sequencial) → SharePoint `GetFileContent` (`dataset` = `SITE_URL`, `id` = `cr40f_driveitemid`) → `Bloco` (Compose): `if(equals(item()?['cr40f_mimetype'],'application/pdf'), json(concat('{"type":"document","source":{"type":"base64","media_type":"application/pdf","data":"', body('Conteudo')?['$content'], '"}}')), json(concat('{"type":"image","source":{"type":"base64","media_type":"', item()?['cr40f_mimetype'], '","data":"', body('Conteudo')?['$content'], '"}}')))`; antes, condição de tamanho: `cr40f_tamanhobytes` > 5242880 → `Terminate` Failed "Arquivo acima de 5 MB.".
   - `Reservas` (`ListRecords` `cr40f_reservadeveculoses`): `$filter` `_cr40f_motorista_value eq @{motorista} and cr40f_dataehorriodesada ge @{convertToUtc(concat(outputs('Dia_do_gasto'),'T00:00:00'),'E. South America Standard Time')} and cr40f_dataehorriodesada lt @{addDays(convertToUtc(concat(outputs('Dia_do_gasto'),'T00:00:00'),'E. South America Standard Time'),1)}`, `$select` `cr40f_reservadeveculosid,cr40f_dataehorriodesada,cr40f_status,_cr40f_cliente_value` (nome do lookup confirmado na Task 1).
   - `Duplicatas_valor_data` (`ListRecords` despesas): `cr40f_valor eq @{valor} and cr40f_despesaoperacionalid ne @{id} and cr40f_datagasto ge @{addDays(datagasto,-7)} and cr40f_datagasto le @{addDays(datagasto,7)}`, `$top` 10.
   - `Duplicatas_arquivo` (`ListRecords` anexos): `cr40f_tamanhobytes eq @{tamanho do 1º comprovante} and cr40f_mimetype eq '@{mime}' and _cr40f_despesa_value ne @{id}`, `$top` 10.
   - `Referencia` (`ListRecords` despesas da mesma categoria, `cr40f_datagasto ge addDays(utcNow(),-90)`, `$select` `cr40f_valor`, `$top` 500) → `Valores` (Select `item()?['cr40f_valor']`) → `Ordenados` (Compose `sort(body('Valores'))`) → mediana `if(empty(outputs('Ordenados')), null, outputs('Ordenados')[div(length(outputs('Ordenados')), 2)])` e máximo `if(empty(...), null, max(outputs('Ordenados')))`.
   - `Contexto` (Compose) no formato exato de `ContextoDespesa` (Task 2): `despesa` com os campos do trigger (categoria e forma pelos FormattedValue), `reservas` (Select: `id`, `saida`, `cliente` = FormattedValue do lookup, `status` = FormattedValue), `duplicatas` (união dos dois Selects com `motivo` `mesmo_valor_data`/`mesmo_arquivo`), `referencia`.
   - `Chamar_Claude` (HTTP, `secureData`, timeout `PT110S`, retry exponencial 2x para 429/5xx): `POST https://api.anthropic.com/v1/messages`, headers `x-api-key` = variável, `anthropic-version: 2023-06-01`, `anthropic-beta: server-side-fallback-2026-07-01`, `content-type: application/json`; body:

```json
{
  "model": "<constantes.modelo>",
  "max_tokens": "<constantes.maxTokens>",
  "system": "<constantes.systemPrompt>",
  "fallbacks": "default",
  "output_config": { "effort": "<constantes.effort>", "format": { "type": "json_schema", "schema": "<constantes.schema>" } },
  "messages": [{ "role": "user", "content": "@union(outputs('Blocos'), createArray(json(concat('{\"type\":\"text\",\"text\":', string(concat('<constantes.prefixoUsuario>', string(outputs('Contexto')))), '}'))))" }]
}
```
   (o script substitui os `<constantes.*>` pelos valores do JSON; `Blocos` é o Select dos `Bloco` do loop.)
   - `Texto_resposta` (Compose): `first(filter(body('Chamar_Claude')?['content'], ...type eq text))?['text']` via `Filter array` + `first()`.
   - Travas (cada uma `Terminate` Failed com a mesma mensagem de `analisarMensagem`): `stop_reason` ≠ `end_turn`; `json()` do texto falha (Scope com `Parse JSON` usando `constantes.schema`); `decisao` fora de `validar`/`precisa_corrigir`; `precisa_corrigir` com `motivos` vazio; `confianca` < 0 ou > 1; `reserva_id` não nulo e ausente de `Reservas`.
   - `Gravar_resultado` (`UpdateRecord`): `cr40f_statusoperacional` = `if(equals(decisao,'validar'),100000002,100000001)`, `cr40f_reserva@odata.bind` = `/cr40f_reservadeveculoses(<reserva_id>)` só quando não nulo, `cr40f_possivelduplicidade`, `cr40f_iadecisao`, `cr40f_iamotivos` (`join(motivos, decodeUriComponent('%0A'))`), `cr40f_iavalorlido`, `cr40f_iadatalida`, `cr40f_iacnpjlido`, `cr40f_iaestabelecimentolido`, `cr40f_iaconfianca`, `cr40f_iajson` (texto), `cr40f_iadataanalise` = `utcNow()`, `cr40f_iamodelo` = `body('Chamar_Claude')?['model']`, `cr40f_iastatusanalise` = 100000002.
4. **Tratar_erro** (`runAfter` `Escopo_analise`: Failed, TimedOut): `UpdateRecord` `cr40f_iastatusanalise` = 100000003, `cr40f_iamotivos` = mensagem do primeiro erro do Scope (`result('Escopo_analise')`, sem dados da chave), `cr40f_iadataanalise` = `utcNow()`. **Não** altera `cr40f_statusoperacional`.

- [ ] **Step 3: Provisionar**

Run: `pnpm --filter @betinhos/despesas-ia constantes && powershell -File packages/deploy/provision-flow-despesas-ia.ps1`
Expected: flow criado ou atualizado, ativado, na AppBetinhos; variável `new_AnthropicApiKey` existente sem valor no export.

- [ ] **Step 4: Gate.** Renan preenche o valor de `new_AnthropicApiKey` no DEV (workspace "Despesas" com limite de gasto mensal na Console Anthropic).

- [ ] **Step 5: Commit**

```bash
git add packages/deploy/provision-flow-despesas-ia.ps1
git commit -m "Despesas IA: flow de análise por IA provisionado no DEV"
```

---

### Task 8: Casos reais e avaliação offline

**Files:**
- Create: `packages/despesas-ia/scripts/avaliar.ts`
- Create: `packages/despesas-ia/scripts/casos.exemplo.json`
- Local, fora do git: `packages/despesas-ia/.local/casos/` (fotos + `casos.json`)

**Interfaces:**
- Consumes: `montarRequisicao`, `analisarMensagem`, `type ContextoDespesa` (Task 2).
- Produces: `.local/avaliacao-<aaaammdd-hhmm>.json` com cada caso e o resumo `{ total, acertos, taxaAcerto, validacoesIndevidas, errosTecnicos }`; exit code 1 se `validacoesIndevidas > 0` ou `taxaAcerto < 0.8`.

- [ ] **Step 1: Montar os casos (com ok do Renan para a leitura no PROD)**

Escolher 30 despesas do PROD (somente leitura, MCP Dataverse_PROD) cobrindo: foto boa, cupom térmico apagado, foto cortada, PDF, valor divergente, data divergente, comprovante de outra categoria, mesmo comprovante em duas despesas (há casos no PROD com o mesmo link). Baixar cada foto pelo "Flow - Consultar Arquivo OneDrive" do PROD (só leitura) para `.local/casos/`. Para cada uma, montar o `contexto` (mesmo formato do flow) e deixar `esperado: null`.

`casos.exemplo.json`:
```json
[
  {
    "id": "exemplo-1",
    "esperado": "validar",
    "arquivos": ["exemplo-1.jpg"],
    "contexto": {
      "despesa": { "id": "exemplo-1", "valor": 85.4, "dataGasto": "2026-10-12", "categoria": "Combustível", "formaPagamento": "Cartão corporativo", "estabelecimento": "Posto X", "litros": 32.5, "km": 120345, "observacao": null },
      "reservas": [{ "id": "r1", "saida": "2026-10-12T13:00:00Z", "cliente": "Embraer", "status": "Concluído" }],
      "duplicatas": [],
      "referencia": { "categoria": "Combustível", "mediana": 180, "maximo": 420, "amostras": 210 }
    }
  }
]
```

- [ ] **Step 2: Rotulagem humana.** Renan (ou o financeiro) preenche `esperado` (`validar` ou `precisa_corrigir`) em todos os casos.

- [ ] **Step 3: Escrever `avaliar.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { analisarMensagem, montarRequisicao, type ContextoDespesa, type Decisao } from '../src/index.ts'

type Caso = { id: string; esperado: Decisao | null; arquivos: string[]; contexto: ContextoDespesa }
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }
const pasta = new URL('../.local/casos/', import.meta.url)
const casos: Caso[] = JSON.parse(readFileSync(new URL('casos.json', pasta), 'utf8'))
const semRotulo = casos.filter((c) => !c.esperado)
if (semRotulo.length) throw new Error(`Casos sem "esperado": ${semRotulo.map((c) => c.id).join(', ')}`)

const client = new Anthropic()
const linhas = []
for (const caso of casos) {
  const comprovantes = caso.arquivos.map((nome) => ({ mime: MIME[nome.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream', base64: readFileSync(new URL(nome, pasta)).toString('base64') }))
  try {
    const msg = await client.messages.create(montarRequisicao(caso.contexto, comprovantes) as unknown as Anthropic.MessageCreateParamsNonStreaming)
    const r = analisarMensagem(msg as unknown as Parameters<typeof analisarMensagem>[0], caso.contexto)
    linhas.push({ id: caso.id, esperado: caso.esperado, obtido: r.ok ? r.resposta.decisao : null, erro: r.ok ? null : r.erro, resposta: r.ok ? r.resposta : null, uso: msg.usage })
  } catch (e) {
    linhas.push({ id: caso.id, esperado: caso.esperado, obtido: null, erro: e instanceof Error ? e.message : String(e), resposta: null, uso: null })
  }
  console.log(`${caso.id}: esperado ${caso.esperado}, obtido ${linhas.at(-1)!.obtido ?? 'ERRO'}`)
}
const acertos = linhas.filter((l) => l.obtido === l.esperado).length
const resumo = {
  total: linhas.length,
  acertos,
  taxaAcerto: acertos / linhas.length,
  validacoesIndevidas: linhas.filter((l) => l.esperado === 'precisa_corrigir' && l.obtido === 'validar').length,
  errosTecnicos: linhas.filter((l) => l.obtido === null).length,
}
const carimbo = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
writeFileSync(new URL(`../.local/avaliacao-${carimbo}.json`, import.meta.url), JSON.stringify({ resumo, linhas }, null, 2))
console.log(resumo)
if (resumo.validacoesIndevidas > 0 || resumo.taxaAcerto < 0.8) process.exit(1)
```

- [ ] **Step 4: Gate de custo e execução.** Informar ao Renan o custo estimado (30 casos × ~R$ 0,10 ≈ R$ 3) e rodar só com o ok dele.

Run: `ANTHROPIC_API_KEY` no ambiente (ou `ant auth login`), depois `pnpm --filter @betinhos/despesas-ia avaliar`
Expected: resumo com `validacoesIndevidas: 0` e `taxaAcerto >= 0.8`.

- [ ] **Step 5: Se falhar a meta:** ajustar só `SYSTEM_PROMPT` (Task 2), rodar testes, regenerar constantes, repetir a avaliação. Registrar cada rodada (taxa e indevidas) no corpo do commit. Não ligar no PROD sem a meta.

- [ ] **Step 6: Commit**

```bash
git add packages/despesas-ia/scripts
git commit -m "Despesas IA: avaliação offline com casos reais e meta de 0 validações indevidas"
```

---

### Task 9: Teste ponta a ponta no DEV

**Files:** nenhum novo (só verificação).

- [ ] **Step 1: Caso limpo.** Enviar pelo App Motoristas no DEV uma despesa com foto boa e valor correto. Expected (MCP Dataverse_DEV): `cr40f_iastatusanalise` = Concluída, `cr40f_statusoperacional` = Validado, colunas `cr40f_ia*` preenchidas, `cr40f_iamodelo` gravado; um único run do flow.
- [ ] **Step 2: Divergência.** Mesma foto com valor lançado R$ 5 maior. Expected: Precisa corrigir, motivo citando a diferença.
- [ ] **Step 3: Erro técnico.** Trocar temporariamente o valor de `new_AnthropicApiKey` por um inválido e enviar outra despesa. Expected: `cr40f_iastatusanalise` = Erro, status operacional continua Enviado, motivo sem a chave. Restaurar a chave.
- [ ] **Step 4: Prévia.** Abrir as três despesas na tela Despesas (DEV): comprovantes abrem.
- [ ] **Step 5: Registrar** o resultado no `docs/superpowers/notes/2026-10-13-despesas-ia-descoberta.md` (seção "Teste DEV") e commitar.

```bash
git add docs/superpowers/notes/2026-10-13-despesas-ia-descoberta.md
git commit -m "Despesas IA: teste ponta a ponta no DEV registrado"
```

---

### Task 10: PROD e acompanhamento da primeira semana

**Files:**
- Create: `packages/deploy/relatorio-despesas-ia.ps1` (somente leitura)

- [ ] **Step 1: Gate.** Apresentar ao Renan: resultado da avaliação (Task 8), teste DEV (Task 9) e o que será importado (colunas, flow de upload alterado, flow de consulta, flow de análise, variável sem valor). Prosseguir só com ok explícito para PROD.
- [ ] **Step 2: Import** gerenciado da AppBetinhos no PROD, no mesmo procedimento usado em 09/10/2026 (retirar valores de variáveis de DEV do zip). Renan preenche `new_AnthropicApiKey` no PROD. Conferir no PROD: colunas, flows ativados, connection references apontando para conexões do PROD.
- [ ] **Step 3: Relatório diário (somente leitura)**

```powershell
# Resumo das análises de despesas por IA nas últimas 24h (PROD, somente leitura).
$ErrorActionPreference = 'Stop'
$environmentUrl = $args[0]
if (-not $environmentUrl) { throw 'Informe a URL do ambiente (PROD).' }
$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; Prefer = 'odata.include-annotations="*"' }
$desde = (Get-Date).ToUniversalTime().AddDays(-1).ToString('yyyy-MM-ddTHH:mm:ssZ')
$rows = (Invoke-RestMethod -Uri "$environmentUrl/api/data/v9.2/cr40f_despesaoperacionals?`$select=cr40f_nome,cr40f_valor,cr40f_iavalorlido,cr40f_iastatusanalise,cr40f_iadecisao,cr40f_iamotivos,cr40f_iaconfianca&`$filter=cr40f_iadataanalise ge $desde&`$orderby=cr40f_iadataanalise desc" -Headers $headers).value
$rows | Group-Object { $_.'cr40f_iastatusanalise@OData.Community.Display.V1.FormattedValue' } | ForEach-Object { Write-Host "$($_.Name): $($_.Count)" }
$rows | Group-Object { $_.'cr40f_iadecisao@OData.Community.Display.V1.FormattedValue' } | ForEach-Object { Write-Host "decisão $($_.Name): $($_.Count)" }
$rows | Where-Object { $_.cr40f_iadecisao -eq 100000001 -or $_.cr40f_iastatusanalise -eq 100000003 } | Select-Object cr40f_nome, cr40f_valor, cr40f_iavalorlido, cr40f_iaconfianca, cr40f_iamotivos | Format-Table -Wrap
```

Run diariamente por 7 dias: `powershell -File packages/deploy/relatorio-despesas-ia.ps1 <url do PROD>`; o financeiro confere por amostragem as validadas e todas as "Precisa corrigir". Qualquer validação indevida: desativar o flow de análise (rascunho) e voltar à Task 8.

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/relatorio-despesas-ia.ps1
git commit -m "Despesas IA: relatório diário somente leitura para a primeira semana em PROD"
```

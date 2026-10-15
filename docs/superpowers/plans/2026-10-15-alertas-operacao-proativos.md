# Alertas proativos de operação — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um agente proativo que avisa a operação, por e-mail (e Teams, opcional), quando um motorista está atrasado ou não vai chegar ao embarque a tempo (com trânsito), e também em casos de serviço sem motorista e de documentos e multas pendentes.

**Architecture:** Um Cloudflare Worker no plano grátis, com dois cron triggers (a cada 5 min e resumo diário às 07:00 de Brasília). O Worker lê serviços e alertas no Dataverse por um app do Entra ID, geocodifica embarques, lê a frota no Infleet, calcula rotas no OSRM, consulta o Google com trânsito só quando necessário, decide com o pacote puro `alertas-operacao` e envia e-mail direto pelo Microsoft Graph. O caminho recorrente não usa Power Automate (teto de 10.000 ações por mês do Renan).

**Tech Stack:** pnpm workspace, TypeScript, vitest, Cloudflare Workers (`wrangler`), Dataverse Web API (client credentials), Infleet GraphQL, OSRM público, Google Routes API e Geocoding API, Microsoft Graph (`sendMail`).

**Spec:** `docs/superpowers/specs/2026-10-15-alertas-operacao-proativos-design.md`

## Global Constraints

- Ambiente: somente DEV `https://org23b93544.crm2.dynamics.com` (OrganizationId `7e5f59f4-efce-f011-89f6-000d3ac0a3e1`), solução `AppBetinhos`. Nenhuma escrita em PROD. Consultas em PROD só de leitura (`Dataverse_PROD`), apenas na Task 6.
- Segredos: o repositório é público. Só nomes de secrets, nunca valores. Os secrets do Worker (`INFLEET_TOKEN`, `GOOGLE_MAPS_KEY`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `SEGREDO_EXECUCAO_MANUAL`, `TEAMS_WEBHOOK_URL`) são definidos pelo Renan com `wrangler secret put`. Nenhum agente lê, copia, imprime ou grava esses valores nem o `.env`. Criar credenciais e consentimentos do Entra ID é tarefa do Renan. O primeiro `wrangler deploy` na conta Cloudflare do Renan exige a confirmação dele.
- A mensagem de alerta nunca contém telefone nem nome de passageiro. O texto enviado ao Google nunca contém nome de passageiro.
- Regras só avisam pessoas: nenhuma escrita em registros de negócio além de `cr40f_alertaoperacao` e das colunas de coordenada em `cr40f_reservadeveculos`.
- Constantes (verbatim da spec): margem 10 min; fator de trânsito 2,0; janela de 60 min antes a 180 min depois da saída; posição velha acima de 10 min; parado = até 3 km/h por 10 min; chegou = a até 150 m; sem motorista = a até 120 min da saída; atrasado = até 60 min após a saída; lembrete após 30 min; Google sempre nos últimos 30 min; parado só a mais de 500 m do embarque e a até 90 min da saída.
- Status do serviço (`cr40f_reservadeveculos.cr40f_status`): Confirmado 202410001, Programado 202410005, Em Execução 202410006. Sem motorista só vale para Confirmado e Programado.
- O Worker roda no plano grátis da Cloudflare: no máximo 50 chamadas externas e 10 ms de CPU por execução; o orçamento do Verificar é de 40 chamadas externas. O cron é em UTC (Brasília é UTC−3). O caminho recorrente não usa Power Automate.
- Textos em pt-BR com acentuação correta (UTF-8). Scripts PowerShell salvos em UTF-8 com BOM.
- Commits em português, detalhados, terminados com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (a atribuição desta sessão). Quem executar com outro modelo usa a linha de atribuição da própria sessão.
- O script `packages/deploy/provision-agentes-schema.ps1` dos Assistentes existe só na branch `claude/compassionate-dubinsky-c4d8f9`. Para copiar as funções auxiliares do schema (`Dv`, `Label`, `Base`, `Opcoes`, `Choice`, `Texto`, `Memo`, `Inteiro`, `DataHora`, `Tabela`, `Coluna`, `Lookup`), use `git show claude/compassionate-dubinsky-c4d8f9:packages/deploy/provision-agentes-schema.ps1`; não faça checkout dessa branch.
- Esta branch não altera o shell React. Não há versão de build do shell a publicar nesta entrega.
- Nada neste plano altera o WebResource `new_formulario_geral.html` (formulário ativo no model-driven e aberto pelo shell) nem a pasta `Tela Formulário Geral`. A mudança do campo de endereço é a Fase 0, fora deste plano, e vale só para uma cópia do formulário dentro do Sistema Betinhos. Aqui só se escrevem coordenadas em colunas novas de `cr40f_reservadeveculos`, pelo Worker.

## Estrutura de arquivos

```
packages/alertas-operacao/            regras puras e testadas
  package.json, tsconfig.json
  src/tipos.ts, src/constantes.ts, src/avaliar.ts, src/fixtures.ts, src/vetores.ts, src/index.ts
  src/avaliar.test.ts
apps/alertas-worker/                  Cloudflare Worker
  package.json, tsconfig.json, wrangler.toml
  src/env.ts            tipo Env (secrets e variáveis)
  src/orcamento.ts      contador de chamadas externas
  src/endereco.ts       limparTexto e classificarGeocoding
  src/entra.ts          token de aplicativo (Dataverse e Graph)
  src/dataverse.ts      leituras, mapeamento das linhas e lote de gravação ($batch)
  src/infleet.ts, src/osrm.ts, src/google.ts, src/graph.ts
  src/verificar.ts      orquestração do ciclo de 5 min
  src/notificar.ts      mensagens, e-mail, Teams opcional e falha ao TI
  src/resumo.ts         resumo diário de documentos e multas
  src/index.ts          scheduled(), POST /executar, GET /saude
  src/*.test.ts
packages/deploy/
  provision-alertas-schema.ps1          tabela e colunas de coordenada
  provision-alertas-acesso.ps1          usuário de aplicativo e papel de segurança
  medir-geocoding-alertas.ps1           medição com endereços do PROD (o Renan roda)
```

---

### Task 1: Pacote `alertas-operacao` — tipos, constantes e regras (TDD)

**Files:**
- Create: `packages/alertas-operacao/package.json`, `packages/alertas-operacao/tsconfig.json`, `src/tipos.ts`, `src/constantes.ts`, `src/avaliar.ts`, `src/fixtures.ts`, `src/index.ts`
- Test: `packages/alertas-operacao/src/avaliar.test.ts`

**Interfaces:**
- Produces: `avaliar(entrada: Entrada, c?: Constantes): Saida`; `CONSTANTES`; `chaveDe(regra, reservaId)`; builders `servico(over?)` e `entrada(servicos, abertos?, extra?)`; constante `AGORA`.

- [ ] **Step 1: Criar o pacote**

`packages/alertas-operacao/package.json`:
```json
{
  "name": "@betinhos/alertas-operacao",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```
`packages/alertas-operacao/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "allowImportingTsExtensions": true, "lib": ["ES2022"], "types": ["node"] },
  "include": ["src"]
}
```
Rode `pnpm install` na raiz e confira com `git diff --stat pnpm-lock.yaml` que só este pacote entrou. Re-resolução de peers de `@types/node` em outros importadores, sem mudança de versão, é aceitável.

- [ ] **Step 2: Tipos e constantes**

`src/tipos.ts`:
```ts
export type Regra = 'NaoChegaraATempo' | 'JaAtrasado' | 'MotoristaParado' | 'SemMotorista'
export const REGRAS: readonly Regra[] = ['NaoChegaraATempo', 'JaAtrasado', 'MotoristaParado', 'SemMotorista']
export type Severidade = 'media' | 'alta'

export type Rota = { minutos: number; metros: number }
export type EntradaServico = {
  id: string
  codigo: string
  status: number
  /** ISO 8601 em UTC. */
  saida: string
  motoristaId: string | null
  motoristaNome: string
  veiculoId: string | null
  placa: string
  cliente: string
  /** Última posição do veículo no Infleet; null quando o veículo não tem posição. */
  posicao: { velocidadeKmh: number; fixTime: string } | null
  /** Rota sem trânsito da posição até o embarque (OSRM); null quando indisponível. */
  rotaOsrm: Rota | null
  /** Rota com trânsito (Google); null enquanto não consultada. */
  rotaGoogle: Rota | null
  /** Minutos que o veículo está parado; null quando não calculado. */
  paradoMin: number | null
  /** Coordenada do embarque é aproximada (geocoding). */
  embarqueAproximado: boolean
}
export type Aberto = { chave: string; reservaId: string; severidade: Severidade; envios: number; ultimoEnvioEm: string }
export type Entrada = {
  /** ISO 8601 em UTC. */
  agora: string
  servicos: EntradaServico[]
  abertos: Aberto[]
  /** Quando presente, só avalia estas regras e não encerra alertas fora da janela (segunda chamada com o Google). */
  regras?: Regra[]
}
export type Alerta = { chave: string; regra: Regra; reservaId: string; severidade: Severidade; titulo: string; mensagem: string }
export type Acao = { acao: 'criar' | 'reenviar' | 'lembrar'; alerta: Alerta }
export type Saida = { precisaGoogle: string[]; acoes: Acao[]; resolver: string[] }
```

`src/constantes.ts`:
```ts
export const CONSTANTES = {
  margemMin: 10,
  fatorTransito: 2,
  posicaoVelhaMin: 10,
  paradoMin: 10,
  paradoVelKmh: 3,
  paradoLongeMetros: 500,
  paradoJanelaMin: 90,
  chegouMetros: 150,
  semMotoristaMin: 120,
  atrasadoAteMin: 60,
  lembreteMin: 30,
  forcarGoogleMin: 30,
  janelaAntesMin: 60,
  janelaDepoisMin: 180,
} as const
export type Constantes = typeof CONSTANTES

/** Status do serviço (cr40f_status) considerados pelas regras. */
export const STATUS = { confirmado: 202410001, programado: 202410005, emExecucao: 202410006 } as const
export const STATUS_ATIVOS: readonly number[] = [STATUS.confirmado, STATUS.programado, STATUS.emExecucao]
export const STATUS_SEM_MOTORISTA: readonly number[] = [STATUS.confirmado, STATUS.programado]
```

- [ ] **Step 3: Fixtures**

`src/fixtures.ts`:
```ts
import type { Aberto, Entrada, EntradaServico } from './tipos.ts'
import { STATUS } from './constantes.ts'

/** 13:00 em Brasília. */
export const AGORA = '2026-10-15T16:00:00Z'
const mais = (min: number) => new Date(Date.parse(AGORA) + min * 60_000).toISOString()

/** Serviço-base: saída em 60 min (14:00), veículo a 12 min sem trânsito, andando. */
export function servico(over: Partial<EntradaServico> & { saidaEmMin?: number; fixHaMin?: number } = {}): EntradaServico {
  const { saidaEmMin = 60, fixHaMin = 1, ...resto } = over
  return {
    id: 'r1',
    codigo: '1234',
    status: STATUS.confirmado,
    saida: mais(saidaEmMin),
    motoristaId: 'm1',
    motoristaNome: 'João',
    veiculoId: 'v1',
    placa: 'ABC1D23',
    cliente: 'Embraer',
    posicao: { velocidadeKmh: 40, fixTime: mais(-fixHaMin) },
    rotaOsrm: { minutos: 12, metros: 8000 },
    rotaGoogle: null,
    paradoMin: 0,
    embarqueAproximado: false,
    ...resto,
  }
}

export function entrada(servicos: EntradaServico[], abertos: Aberto[] = [], extra: Partial<Entrada> = {}): Entrada {
  return { agora: AGORA, servicos, abertos, ...extra }
}

export { mais }
```

- [ ] **Step 4: Escrever os testes que falham**

`src/avaliar.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { avaliar, chaveDe } from './avaliar.ts'
import { CONSTANTES } from './constantes.ts'
import { AGORA, entrada, mais, servico } from './fixtures.ts'
import { STATUS } from './constantes.ts'

const alertasDe = (s: Parameters<typeof servico>[0]) => avaliar(entrada([servico(s)]))

describe('constantes', () => {
  it('têm os valores da spec', () => {
    expect(CONSTANTES.margemMin).toBe(10)
    expect(CONSTANTES.fatorTransito).toBe(2)
    expect(CONSTANTES.chegouMetros).toBe(150)
  })
})

describe('NaoChegaraATempo e pré-filtro', () => {
  it('motorista folgado não gera alerta nem consulta ao Google', () => {
    // saída em 60 min, folga 50, rota 12 min x 2 = 24
    const r = alertasDe({})
    expect(r.acoes).toEqual([])
    expect(r.precisaGoogle).toEqual([])
  })
  it('pede o Google quando o tempo pessimista passa da folga', () => {
    const r = alertasDe({ rotaOsrm: { minutos: 30, metros: 20000 } }) // 60 > 50
    expect(r.precisaGoogle).toEqual(['r1'])
    expect(r.acoes).toEqual([])
  })
  it('nos últimos 30 minutos sempre pede o Google', () => {
    const r = alertasDe({ saidaEmMin: 25, rotaOsrm: { minutos: 5, metros: 3000 } }) // pessimista 10 <= folga 15
    expect(r.precisaGoogle).toEqual(['r1'])
  })
  it('alerta alto quando o Google prevê chegar depois da saída', () => {
    const r = alertasDe({ rotaOsrm: { minutos: 30, metros: 20000 }, rotaGoogle: { minutos: 62, metros: 20000 } })
    expect(r.precisaGoogle).toEqual([])
    expect(r.acoes).toHaveLength(1)
    const a = r.acoes[0]!
    expect(a.acao).toBe('criar')
    expect(a.alerta).toMatchObject({ chave: 'NaoChegaraATempo|r1', regra: 'NaoChegaraATempo', reservaId: 'r1', severidade: 'alta', titulo: 'Risco de atraso: OS 1234 às 14:00' })
    expect(a.alerta.mensagem).toBe('Motorista João, placa ABC1D23, cliente Embraer. Chegada prevista com trânsito às 14:02, 2 min depois da saída.')
  })
  it('alerta médio quando chega antes da saída mas abaixo da margem', () => {
    const r = alertasDe({ rotaOsrm: { minutos: 30, metros: 20000 }, rotaGoogle: { minutos: 55, metros: 20000 } })
    const a = r.acoes[0]!.alerta
    expect(a.severidade).toBe('media')
    expect(a.mensagem).toBe('Motorista João, placa ABC1D23, cliente Embraer. Chegada prevista com trânsito às 13:55, 5 min antes da saída, abaixo da margem de 10 min.')
  })
  it('sem alerta quando o Google cabe na folga', () => {
    expect(alertasDe({ rotaOsrm: { minutos: 30, metros: 20000 }, rotaGoogle: { minutos: 45, metros: 20000 } }).acoes).toEqual([])
  })
  it('avisa quando o local é aproximado', () => {
    const r = alertasDe({ rotaOsrm: { minutos: 30, metros: 20000 }, rotaGoogle: { minutos: 62, metros: 20000 }, embarqueAproximado: true })
    expect(r.acoes[0]!.alerta.mensagem.endsWith(' Local aproximado.')).toBe(true)
  })
  it('quem já chegou (a até 150 m) nunca alerta', () => {
    const r = alertasDe({ rotaOsrm: { minutos: 1, metros: 150 }, rotaGoogle: { minutos: 90, metros: 150 } })
    expect(r.acoes).toEqual([])
    expect(r.precisaGoogle).toEqual([])
  })
  it('posição velha (mais de 10 min) ou ausente não gera alerta de atraso', () => {
    expect(alertasDe({ fixHaMin: 11, rotaOsrm: { minutos: 60, metros: 40000 } })).toEqual({ precisaGoogle: [], acoes: [], resolver: [] })
    expect(alertasDe({ posicao: null, rotaOsrm: null })).toEqual({ precisaGoogle: [], acoes: [], resolver: [] })
    expect(alertasDe({ fixHaMin: 10, rotaOsrm: { minutos: 30, metros: 20000 } }).precisaGoogle).toEqual(['r1'])
  })
})

describe('JaAtrasado', () => {
  it('alerta alto até 60 min depois da saída', () => {
    const r = alertasDe({ saidaEmMin: -20, rotaOsrm: { minutos: 9, metros: 5000 } })
    expect(r.acoes).toHaveLength(1)
    const a = r.acoes[0]!.alerta
    expect(a).toMatchObject({ regra: 'JaAtrasado', severidade: 'alta', titulo: 'Atraso: OS 1234 saiu às 12:40' })
    expect(a.mensagem).toBe('Motorista João, placa ABC1D23, cliente Embraer. Passaram 20 min da saída e o veículo ainda está a 5,0 km do embarque.')
  })
  it('limites: 60 min ainda alerta, 61 não', () => {
    expect(alertasDe({ saidaEmMin: -60 }).acoes).toHaveLength(1)
    expect(alertasDe({ saidaEmMin: -61 }).acoes).toEqual([])
  })
})

describe('MotoristaParado', () => {
  const parado = { paradoMin: 12, posicao: { velocidadeKmh: 0, fixTime: mais(-1) }, rotaOsrm: { minutos: 8, metros: 3000 } }
  it('média a até 90 min da saída, alta nos últimos 30', () => {
    const m = alertasDe({ ...parado, saidaEmMin: 60 }).acoes.find((x) => x.alerta.regra === 'MotoristaParado')!
    expect(m.alerta.severidade).toBe('media')
    expect(m.alerta.titulo).toBe('Motorista parado: OS 1234 às 14:00')
    expect(m.alerta.mensagem).toBe('Motorista João, placa ABC1D23, cliente Embraer. Parado há 12 min, a 3,0 km do embarque, saída em 60 min.')
    const a = alertasDe({ ...parado, saidaEmMin: 25 }).acoes.find((x) => x.alerta.regra === 'MotoristaParado')!
    expect(a.alerta.severidade).toBe('alta')
  })
  it.each([
    ['parado há menos de 10 min', { paradoMin: 9 }],
    ['perto do embarque (500 m ou menos)', { rotaOsrm: { minutos: 1, metros: 500 } }],
    ['saída em mais de 90 min', { saidaEmMin: 100 }],
    ['em movimento agora', { posicao: { velocidadeKmh: 4, fixTime: mais(-1) } }],
  ])('não alerta: %s', (_nome, over) => {
    const r = alertasDe({ ...parado, ...over })
    expect(r.acoes.find((x) => x.alerta.regra === 'MotoristaParado')).toBeUndefined()
  })
})

describe('SemMotorista', () => {
  it('média de 120 a 61 min, alta a 60 min ou menos', () => {
    const m = alertasDe({ motoristaId: null, veiculoId: null, posicao: null, rotaOsrm: null, saidaEmMin: 90 }).acoes[0]!.alerta
    expect(m).toMatchObject({ regra: 'SemMotorista', severidade: 'media', titulo: 'Sem motorista: OS 1234 às 14:30' })
    expect(m.mensagem).toBe('Cliente Embraer. Saída em 90 min e o serviço está sem motorista.')
    expect(alertasDe({ motoristaId: null, posicao: null, rotaOsrm: null, saidaEmMin: 60 }).acoes[0]!.alerta.severidade).toBe('alta')
  })
  it.each([
    ['mais de 120 min', { saidaEmMin: 121 }],
    ['já passou da saída', { saidaEmMin: -5 }],
    ['serviço Em Execução', { status: STATUS.emExecucao }],
  ])('não alerta: %s', (_n, over) => {
    expect(alertasDe({ motoristaId: null, posicao: null, rotaOsrm: null, ...over }).acoes).toEqual([])
  })
})

describe('dedupe', () => {
  const base = { rotaOsrm: { minutos: 30, metros: 20000 }, rotaGoogle: { minutos: 62, metros: 20000 } }
  const aberto = (over = {}) => ({ chave: chaveDe('NaoChegaraATempo', 'r1'), reservaId: 'r1', severidade: 'alta' as const, envios: 1, ultimoEnvioEm: mais(-5), ...over })
  const acoes = (abertos: ReturnType<typeof aberto>[]) => avaliar(entrada([servico(base)], abertos)).acoes.map((a) => a.acao)

  it('chave é regra|id', () => expect(chaveDe('JaAtrasado', 'x')).toBe('JaAtrasado|x'))
  it('cria quando não há alerta aberto', () => expect(acoes([])).toEqual(['criar']))
  it('não repete antes de 30 min', () => expect(acoes([aberto()])).toEqual([]))
  it('lembra uma vez após 30 min', () => {
    expect(acoes([aberto({ ultimoEnvioEm: mais(-30) })])).toEqual(['lembrar'])
    expect(acoes([aberto({ ultimoEnvioEm: mais(-90), envios: 2 })])).toEqual([])
  })
  it('reenvia quando a severidade sobe', () => {
    expect(acoes([aberto({ severidade: 'media' })])).toEqual(['reenviar'])
  })
})

describe('encerramento', () => {
  const ab = (chave: string, reservaId: string) => ({ chave, reservaId, severidade: 'alta' as const, envios: 1, ultimoEnvioEm: mais(-5) })
  it('encerra quando a condição sumiu', () => {
    const r = avaliar(entrada([servico()], [ab('JaAtrasado|r1', 'r1')]))
    expect(r.resolver).toEqual(['JaAtrasado|r1'])
  })
  it('encerra quando o serviço saiu da janela', () => {
    const r = avaliar(entrada([servico()], [ab('SemMotorista|outro', 'outro')]))
    expect(r.resolver).toEqual(['SemMotorista|outro'])
  })
  it('mantém o alerta de atraso enquanto aguarda o Google', () => {
    const r = avaliar(entrada([servico({ rotaOsrm: { minutos: 30, metros: 20000 } })], [ab('NaoChegaraATempo|r1', 'r1')]))
    expect(r.precisaGoogle).toEqual(['r1'])
    expect(r.resolver).toEqual([])
  })
  it('segunda chamada (regras) não encerra o que está fora do seu escopo', () => {
    const e = entrada([servico({ rotaOsrm: { minutos: 30, metros: 20000 }, rotaGoogle: { minutos: 45, metros: 20000 } })], [ab('NaoChegaraATempo|r1', 'r1'), ab('NaoChegaraATempo|fora', 'fora'), ab('SemMotorista|r1', 'r1')], { regras: ['NaoChegaraATempo'] })
    const r = avaliar(e)
    expect(r.resolver).toEqual(['NaoChegaraATempo|r1'])
    expect(r.acoes).toEqual([])
  })
})

describe('agora', () => {
  it('as fixtures usam 13:00 de Brasília', () => expect(AGORA).toBe('2026-10-15T16:00:00Z'))
})
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/alertas-operacao test`
Expected: FAIL (`./avaliar.ts` não existe).

- [ ] **Step 6: Implementar `avaliar.ts` e `index.ts`**

`src/avaliar.ts`:
```ts
import { CONSTANTES, STATUS_SEM_MOTORISTA, type Constantes } from './constantes.ts'
import { REGRAS, type Aberto, type Acao, type Alerta, type Entrada, type EntradaServico, type Regra, type Saida, type Severidade } from './tipos.ts'

const MIN = 60_000
const minutosEntre = (de: string, ate: string) => (Date.parse(ate) - Date.parse(de)) / MIN
const hhmm = (iso: string) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
const km = (metros: number) => (metros / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const inteiro = (n: number) => String(Math.round(n))

export const chaveDe = (regra: Regra, reservaId: string) => `${regra}|${reservaId}`

function montar(regra: Regra, s: EntradaServico, severidade: Severidade, titulo: string, mensagem: string): Alerta {
  return { chave: chaveDe(regra, s.id), regra, reservaId: s.id, severidade, titulo, mensagem }
}
const quem = (s: EntradaServico) => `Motorista ${s.motoristaNome}, placa ${s.placa}, cliente ${s.cliente}.`

function avaliarServico(s: EntradaServico, agora: string, c: Constantes) {
  const alertas: Alerta[] = []
  let precisaGoogle = false
  const min = minutosEntre(agora, s.saida)
  const titulo = (prefixo: string) => `${prefixo}: OS ${s.codigo} às ${hhmm(s.saida)}`

  if (s.motoristaId === null && STATUS_SEM_MOTORISTA.includes(s.status) && min >= 0 && min <= c.semMotoristaMin) {
    alertas.push(montar('SemMotorista', s, min <= 60 ? 'alta' : 'media', titulo('Sem motorista'), `Cliente ${s.cliente}. Saída em ${inteiro(min)} min e o serviço está sem motorista.`))
  }

  const rastreado = s.posicao !== null && s.rotaOsrm !== null
  if (!rastreado) return { alertas, precisaGoogle }
  const posicao = s.posicao!
  const osrm = s.rotaOsrm!
  const fresca = minutosEntre(posicao.fixTime, agora) <= c.posicaoVelhaMin
  const chegou = osrm.metros <= c.chegouMetros
  if (!fresca || chegou) return { alertas, precisaGoogle }

  if (min < 0 && min >= -c.atrasadoAteMin) {
    alertas.push(montar('JaAtrasado', s, 'alta', `Atraso: OS ${s.codigo} saiu às ${hhmm(s.saida)}`, `${quem(s)} Passaram ${inteiro(-min)} min da saída e o veículo ainda está a ${km(osrm.metros)} km do embarque.`))
  }
  if (min >= 0) {
    const folga = min - c.margemMin
    const google = s.rotaGoogle
    if (!google) {
      if (osrm.minutos * c.fatorTransito > folga || min <= c.forcarGoogleMin) precisaGoogle = true
    } else if (google.minutos > folga) {
      const atraso = google.minutos - min
      const chegada = hhmm(new Date(Date.parse(agora) + google.minutos * MIN).toISOString())
      const diff = atraso > 0 ? `${inteiro(atraso)} min depois da saída` : `${inteiro(-atraso)} min antes da saída, abaixo da margem de ${c.margemMin} min`
      const aproximado = s.embarqueAproximado ? ' Local aproximado.' : ''
      alertas.push(montar('NaoChegaraATempo', s, atraso > 0 ? 'alta' : 'media', titulo('Risco de atraso'), `${quem(s)} Chegada prevista com trânsito às ${chegada}, ${diff}.${aproximado}`))
    }
    if (min <= c.paradoJanelaMin && (s.paradoMin ?? 0) >= c.paradoMin && posicao.velocidadeKmh <= c.paradoVelKmh && osrm.metros > c.paradoLongeMetros) {
      alertas.push(montar('MotoristaParado', s, min <= 30 ? 'alta' : 'media', titulo('Motorista parado'), `${quem(s)} Parado há ${inteiro(s.paradoMin ?? 0)} min, a ${km(osrm.metros)} km do embarque, saída em ${inteiro(min)} min.`))
    }
  }
  return { alertas, precisaGoogle }
}

const RANK: Record<Severidade, number> = { media: 1, alta: 2 }

function decidir(alerta: Alerta, aberto: Aberto | undefined, agora: string, c: Constantes): Acao['acao'] | null {
  if (!aberto) return 'criar'
  if (RANK[alerta.severidade] > RANK[aberto.severidade]) return 'reenviar'
  if (aberto.envios === 1 && minutosEntre(aberto.ultimoEnvioEm, agora) >= c.lembreteMin) return 'lembrar'
  return null
}

/** Decisão pura: sem chamadas externas. O Worker chama esta função; os vetores em vetores.ts cobrem os limites e o dedupe. */
export function avaliar(entrada: Entrada, c: Constantes = CONSTANTES): Saida {
  const completa = !entrada.regras
  const regras: readonly Regra[] = entrada.regras ?? REGRAS
  const idsNaJanela = new Set(entrada.servicos.map((s) => s.id))
  const alertas: Alerta[] = []
  const precisaGoogle: string[] = []

  for (const s of entrada.servicos) {
    const r = avaliarServico(s, entrada.agora, c)
    alertas.push(...r.alertas.filter((a) => regras.includes(a.regra)))
    if (r.precisaGoogle && regras.includes('NaoChegaraATempo')) precisaGoogle.push(s.id)
  }

  const abertosPorChave = new Map(entrada.abertos.map((a) => [a.chave, a]))
  const acoes: Acao[] = []
  for (const alerta of alertas) {
    const acao = decidir(alerta, abertosPorChave.get(alerta.chave), entrada.agora, c)
    if (acao) acoes.push({ acao, alerta })
  }

  const chavesAtuais = new Set(alertas.map((a) => a.chave))
  const aguardandoGoogle = new Set(precisaGoogle)
  const resolver: string[] = []
  for (const a of entrada.abertos) {
    const regra = a.chave.split('|')[0] as Regra
    if (!regras.includes(regra)) continue
    if (!idsNaJanela.has(a.reservaId)) { if (completa) resolver.push(a.chave); continue }
    if (completa && regra === 'NaoChegaraATempo' && aguardandoGoogle.has(a.reservaId)) continue
    if (!chavesAtuais.has(a.chave)) resolver.push(a.chave)
  }
  return { precisaGoogle, acoes, resolver }
}
```
`src/index.ts`:
```ts
export * from './tipos.ts'
export { CONSTANTES, STATUS, STATUS_ATIVOS, STATUS_SEM_MOTORISTA, type Constantes } from './constantes.ts'
export { avaliar, chaveDe } from './avaliar.ts'
export { AGORA, entrada, mais, servico } from './fixtures.ts'
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @betinhos/alertas-operacao test && pnpm --filter @betinhos/alertas-operacao typecheck`
Expected: PASS, sem erro de tipo. Se algum teste de borda falhar por arredondamento ou fuso, ajuste o código (não o fuso nem as constantes da spec) e registre.

- [ ] **Step 8: Commit**

```bash
git add packages/alertas-operacao pnpm-lock.yaml
git commit -m "Alertas: pacote alertas-operacao com as regras de atraso, parado, sem motorista, dedupe e encerramento"
```

---

### Task 2: Vetores de teste (tabela de casos)

**Files:**
- Create: `packages/alertas-operacao/src/vetores.ts`
- Modify: `packages/alertas-operacao/src/index.ts`, `packages/alertas-operacao/src/avaliar.test.ts`

**Interfaces:**
- Produces: `VETORES: { nome: string; entrada: Entrada }[]`, uma tabela de 31 casos nomeados que cobre as quatro regras, os limites, o dedupe, o encerramento e a segunda chamada com `regras`. O teste do Worker (Task 7) reaproveita esses casos como entradas realistas.

- [ ] **Step 1: Teste que falha**

Acrescente em `avaliar.test.ts`:
```ts
import { VETORES } from './vetores.ts'

describe('vetores de teste', () => {
  it('têm nomes únicos e cobrem as quatro regras, dedupe e encerramento', () => {
    const nomes = VETORES.map((v) => v.nome)
    expect(new Set(nomes).size).toBe(nomes.length)
    expect(VETORES.length).toBeGreaterThanOrEqual(20)
    const regras = new Set(VETORES.flatMap((v) => avaliar(v.entrada).acoes.map((a) => a.alerta.regra)))
    expect([...regras].sort()).toEqual(['JaAtrasado', 'MotoristaParado', 'NaoChegaraATempo', 'SemMotorista'])
    const tipos = new Set(VETORES.flatMap((v) => avaliar(v.entrada).acoes.map((a) => a.acao)))
    expect([...tipos].sort()).toEqual(['criar', 'lembrar', 'reenviar'])
    expect(VETORES.some((v) => avaliar(v.entrada).resolver.length > 0)).toBe(true)
    expect(VETORES.some((v) => avaliar(v.entrada).precisaGoogle.length > 0)).toBe(true)
  })
  it('são serializáveis em JSON sem perda', () => {
    for (const v of VETORES) expect(JSON.parse(JSON.stringify(v.entrada))).toEqual(v.entrada)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter @betinhos/alertas-operacao test` → FAIL (`./vetores.ts` ausente).

- [ ] **Step 3: Implementar**

`src/vetores.ts` (cada vetor é uma entrada completa; o oráculo é `avaliar`):
```ts
import { chaveDe } from './avaliar.ts'
import { STATUS } from './constantes.ts'
import { entrada, mais, servico } from './fixtures.ts'
import type { Aberto, Entrada } from './tipos.ts'

const aberto = (regra: Parameters<typeof chaveDe>[0], reservaId: string, over: Partial<Aberto> = {}): Aberto => ({
  chave: chaveDe(regra, reservaId), reservaId, severidade: 'alta', envios: 1, ultimoEnvioEm: mais(-5), ...over,
})
const longe = { rotaOsrm: { minutos: 30, metros: 20000 } }
const googleAtrasa = { ...longe, rotaGoogle: { minutos: 62, metros: 20000 } }
const parado = { paradoMin: 12, posicao: { velocidadeKmh: 0, fixTime: mais(-1) }, rotaOsrm: { minutos: 8, metros: 3000 } }
const semMotorista = { motoristaId: null, veiculoId: null, posicao: null, rotaOsrm: null }

export const VETORES: { nome: string; entrada: Entrada }[] = [
  { nome: 'folgado-sem-alerta', entrada: entrada([servico()]) },
  { nome: 'pede-google-pessimista', entrada: entrada([servico(longe)]) },
  { nome: 'pede-google-ultimos-30-min', entrada: entrada([servico({ saidaEmMin: 25, rotaOsrm: { minutos: 5, metros: 3000 } })]) },
  { nome: 'google-atrasa-alta', entrada: entrada([servico(googleAtrasa)]) },
  { nome: 'google-margem-media', entrada: entrada([servico({ ...longe, rotaGoogle: { minutos: 55, metros: 20000 } })]) },
  { nome: 'google-cabe-sem-alerta', entrada: entrada([servico({ ...longe, rotaGoogle: { minutos: 45, metros: 20000 } })]) },
  { nome: 'google-local-aproximado', entrada: entrada([servico({ ...googleAtrasa, embarqueAproximado: true })]) },
  { nome: 'ja-chegou-nao-alerta', entrada: entrada([servico({ rotaOsrm: { minutos: 1, metros: 150 }, rotaGoogle: { minutos: 90, metros: 150 } })]) },
  { nome: 'posicao-velha-nao-alerta', entrada: entrada([servico({ fixHaMin: 11, rotaOsrm: { minutos: 60, metros: 40000 } })]) },
  { nome: 'posicao-no-limite-10-min', entrada: entrada([servico({ fixHaMin: 10, ...longe })]) },
  { nome: 'sem-posicao', entrada: entrada([servico({ posicao: null, rotaOsrm: null })]) },
  { nome: 'atrasado-20-min', entrada: entrada([servico({ saidaEmMin: -20, rotaOsrm: { minutos: 9, metros: 5000 } })]) },
  { nome: 'atrasado-limite-60', entrada: entrada([servico({ saidaEmMin: -60 })]) },
  { nome: 'atrasado-61-nao-alerta', entrada: entrada([servico({ saidaEmMin: -61 })]) },
  { nome: 'parado-media', entrada: entrada([servico({ ...parado, saidaEmMin: 60 })]) },
  { nome: 'parado-alta-ultimos-30', entrada: entrada([servico({ ...parado, saidaEmMin: 25 })]) },
  { nome: 'parado-9-min-nao-alerta', entrada: entrada([servico({ ...parado, paradoMin: 9 })]) },
  { nome: 'parado-perto-nao-alerta', entrada: entrada([servico({ ...parado, rotaOsrm: { minutos: 1, metros: 500 } })]) },
  { nome: 'sem-motorista-media', entrada: entrada([servico({ ...semMotorista, saidaEmMin: 90 })]) },
  { nome: 'sem-motorista-alta', entrada: entrada([servico({ ...semMotorista, saidaEmMin: 60 })]) },
  { nome: 'sem-motorista-longe-nao-alerta', entrada: entrada([servico({ ...semMotorista, saidaEmMin: 121 })]) },
  { nome: 'sem-motorista-em-execucao-nao-alerta', entrada: entrada([servico({ ...semMotorista, status: STATUS.emExecucao })]) },
  { nome: 'dedupe-nao-repete', entrada: entrada([servico(googleAtrasa)], [aberto('NaoChegaraATempo', 'r1')]) },
  { nome: 'dedupe-lembra-apos-30-min', entrada: entrada([servico(googleAtrasa)], [aberto('NaoChegaraATempo', 'r1', { ultimoEnvioEm: mais(-30) })]) },
  { nome: 'dedupe-nao-lembra-duas-vezes', entrada: entrada([servico(googleAtrasa)], [aberto('NaoChegaraATempo', 'r1', { ultimoEnvioEm: mais(-90), envios: 2 })]) },
  { nome: 'dedupe-reenvia-severidade-sobe', entrada: entrada([servico(googleAtrasa)], [aberto('NaoChegaraATempo', 'r1', { severidade: 'media' })]) },
  { nome: 'encerra-condicao-sumiu', entrada: entrada([servico()], [aberto('JaAtrasado', 'r1')]) },
  { nome: 'encerra-fora-da-janela', entrada: entrada([servico()], [aberto('SemMotorista', 'outro')]) },
  { nome: 'mantem-enquanto-aguarda-google', entrada: entrada([servico(longe)], [aberto('NaoChegaraATempo', 'r1')]) },
  {
    nome: 'segunda-chamada-escopo-restrito',
    entrada: entrada(
      [servico({ ...longe, rotaGoogle: { minutos: 45, metros: 20000 } })],
      [aberto('NaoChegaraATempo', 'r1'), aberto('NaoChegaraATempo', 'fora'), aberto('SemMotorista', 'r1')],
      { regras: ['NaoChegaraATempo'] },
    ),
  },
  {
    nome: 'varios-servicos-mistos',
    entrada: entrada([
      servico({ id: 'a', codigo: '1', saidaEmMin: -10, rotaOsrm: { minutos: 5, metros: 2000 } }),
      servico({ id: 'b', codigo: '2', ...semMotorista, saidaEmMin: 40 }),
      servico({ id: 'c', codigo: '3', ...longe }),
      servico({ id: 'd', codigo: '4' }),
    ]),
  },
]
```
Em `src/index.ts` acrescente `export { VETORES } from './vetores.ts'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @betinhos/alertas-operacao test && pnpm --filter @betinhos/alertas-operacao typecheck`
Expected: PASS e sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add packages/alertas-operacao
git commit -m "Alertas: tabela de 31 vetores de teste das regras, do dedupe e do encerramento"
```

---

### Task 3: Schema no DEV (tabela de alertas e colunas de coordenada)

**Files:**
- Create: `packages/deploy/provision-alertas-schema.ps1`
- Reference: `git show claude/compassionate-dubinsky-c4d8f9:packages/deploy/provision-agentes-schema.ps1` (copie o prólogo e as funções `Dv`, `Label`, `Base`, `Opcoes`, `Choice`, `Texto`, `Memo`, `Inteiro`, `DataHora`, `Tabela`, `Coluna`, `Lookup`)

**Interfaces:**
- Produces no DEV: tabela `cr40f_alertaoperacao` (com as colunas da spec) publicada e na AppBetinhos; colunas `cr40f_embarquelatitude`, `cr40f_embarquelongitude`, `cr40f_embarqueprecisao`, `cr40f_embarquetexto`, `cr40f_embarquegeocodificadoem` em `cr40f_reservadeveculos`. O script imprime o `EntitySetName` real da tabela de alertas (esperado `cr40f_alertaoperacaos`); a Task 5 usa esse nome na constante `ALERTA_SET`.
- Valores dos choices (100000000 + índice, na ordem abaixo): `cr40f_regra` NaoChegaraATempo, JaAtrasado, MotoristaParado, SemMotorista, DocumentosResumo, FalhaDoAgente; `cr40f_severidade` Média, Alta; `cr40f_status` Aberto, Resolvido; `cr40f_resolucao` Condição encerrada, Fora da janela; `cr40f_embarqueprecisao` Informado, Geocodificado, Aproximado, Indisponível.

- [ ] **Step 1: Escrever o script**

Mesmo prólogo do script de agentes (somente DEV, token do `az`, WhoAmI com OrganizationId `7e5f59f4-efce-f011-89f6-000d3ac0a3e1`, `MSCRM.SolutionUniqueName = AppBetinhos`, função `Dv`). Acrescente a função de decimal e as listas abaixo.

```powershell
function Decimal([string] $schema, [string] $nome) {
  $a = Base 'DecimalAttributeMetadata' $schema $nome
  $a.Precision = 7; $a.MinValue = -180; $a.MaxValue = 180
  $a
}

$alerta = 'cr40f_alertaoperacao'
Tabela $alerta 'Alerta de operação' 'Alertas de operação' 'Aviso proativo gerado pelo agente de operação, com controle de envio e encerramento.'
foreach ($c in @(
  (Choice 'cr40f_Regra' 'Regra' @('NaoChegaraATempo', 'JaAtrasado', 'MotoristaParado', 'SemMotorista', 'DocumentosResumo', 'FalhaDoAgente')),
  (Texto 'cr40f_Chave' 'Chave' 200),
  (Choice 'cr40f_Severidade' 'Severidade' @('Média', 'Alta')),
  (Choice 'cr40f_Status' 'Status' @('Aberto', 'Resolvido')),
  (Choice 'cr40f_Resolucao' 'Resolução' @('Condição encerrada', 'Fora da janela')),
  (Memo 'cr40f_Mensagem' 'Mensagem'),
  (Inteiro 'cr40f_Envios' 'Envios'),
  (DataHora 'cr40f_UltimoEnvioEm' 'Último envio em'),
  (DataHora 'cr40f_ResolvidoEm' 'Resolvido em'),
  (Texto 'cr40f_Canais' 'Canais' 100)
)) { Coluna $alerta $c }
Lookup 'cr40f_reservadeveculos_alertaoperacao_reserva' $alerta 'cr40f_reservadeveculos' 'cr40f_Reserva' 'Serviço'

$res = 'cr40f_reservadeveculos'
foreach ($c in @(
  (Decimal 'cr40f_EmbarqueLatitude' 'Embarque: latitude'),
  (Decimal 'cr40f_EmbarqueLongitude' 'Embarque: longitude'),
  (Choice 'cr40f_EmbarquePrecisao' 'Embarque: precisão' @('Informado', 'Geocodificado', 'Aproximado', 'Indisponível')),
  (Texto 'cr40f_EmbarqueTexto' 'Embarque: texto geocodificado' 500),
  (DataHora 'cr40f_EmbarqueGeocodificadoEm' 'Embarque: geocodificado em')
)) { Coluna $res $c }

Dv POST PublishXml @{ ParameterXml = "<importexportxml><entities><entity>$alerta</entity><entity>$res</entity></entities></importexportxml>" } | Out-Null

# Conferência por leitura de volta.
$set = (Dv GET "EntityDefinitions(LogicalName='$alerta')?`$select=EntitySetName").EntitySetName
Write-Output "EntitySetName de ${alerta}: $set"
foreach ($col in 'cr40f_regra', 'cr40f_chave', 'cr40f_severidade', 'cr40f_status', 'cr40f_resolucao', 'cr40f_mensagem', 'cr40f_envios', 'cr40f_ultimoenvioem', 'cr40f_resolvidoem', 'cr40f_canais', 'cr40f_reserva') { Dv GET "EntityDefinitions(LogicalName='$alerta')/Attributes(LogicalName='$col')?`$select=LogicalName" | Out-Null }
foreach ($col in 'cr40f_embarquelatitude', 'cr40f_embarquelongitude', 'cr40f_embarqueprecisao', 'cr40f_embarquetexto', 'cr40f_embarquegeocodificadoem') { Dv GET "EntityDefinitions(LogicalName='$res')/Attributes(LogicalName='$col')?`$select=LogicalName" | Out-Null }
$regra = Dv GET "EntityDefinitions(LogicalName='$alerta')/Attributes(LogicalName='cr40f_regra')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)"
if (@($regra.OptionSet.Options).Count -ne 6) { throw 'cr40f_regra deveria ter 6 opções.' }
Write-Output "DEV: $alerta e as colunas de embarque em $res criadas e conferidas na $solutionName."
```
Salve em UTF-8 com BOM.

- [ ] **Step 2: Rodar duas vezes no DEV**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-alertas-schema.ps1` (duas vezes).
Expected: a primeira cria; a segunda só mostra "já existe" e termina com a mesma linha final. Anote o `EntitySetName` impresso. Se não for `cr40f_alertaoperacaos`, use o real em `ALERTA_SET` na Task 5.

- [ ] **Step 3: Conferir pelo MCP**

`describe('tables/cr40f_alertaoperacao')` mostra o lookup `cr40f_reserva`; `describe('tables/cr40f_reservadeveculos')` mostra as 5 colunas de embarque.

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/provision-alertas-schema.ps1
git commit -m "Alertas: schema no DEV (tabela de alertas e colunas de coordenada do embarque em cr40f_reservadeveculos)"
```

---

### Task 4: Usuário de aplicativo e papel de segurança no DEV

**Files:**
- Create: `packages/deploy/provision-alertas-acesso.ps1`

**Interfaces:**
- Consumes: Task 3 (tabelas) e o **Application (client) ID** do app do Entra ID que o Renan criou para o Worker (um GUID, não é segredo). **Se o Renan ainda não forneceu o GUID, pare com NEEDS_CONTEXT.** Criar o app, a credencial e o consentimento de `Mail.Send` é tarefa do Renan.
- Produces: papel `Alertas Worker` no DEV e usuário de aplicativo associado a ele. O Worker acessa o Dataverse só com esse papel.

Privilégios do papel (profundidade Global): Read em `cr40f_reservadeveculos`, `cr40f_funcionarios`, `cr40f_veiculos`, `cr40f_clientes1`, `cr40f_documento`, `cr40f_tipodocumento`, `cr40f_multas`; Write em `cr40f_reservadeveculos` (o Worker só altera as colunas de embarque; o Dataverse concede por tabela); Create, Read, Write, Append e AppendTo em `cr40f_alertaoperacao`; AppendTo em `cr40f_reservadeveculos` (para ligar o alerta ao serviço). Nada além disso.

- [ ] **Step 1: Escrever o script**

```powershell
param([Parameter(Mandatory)] [Guid] $ClientId)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }
function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[alertas-acesso] $Method $($Path.Split('?')[0])"
  $p = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 120 }
  if ($null -ne $Body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 20 -Compress)); $p.ContentType = 'application/json; charset=utf-8' }
  $bytes = (Invoke-WebRequest @p -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
}
if ((Dv GET WhoAmI).OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }

$bu = (Dv GET "businessunits?`$select=businessunitid&`$filter=parentbusinessunitid eq null").value
if ($bu.Count -ne 1) { throw 'Unidade de negócio raiz ausente ou ambígua.' }
$buId = $bu[0].businessunitid

# Papel (cria se faltar)
$nomePapel = 'Alertas Worker'
$papel = @((Dv GET "roles?`$select=roleid&`$filter=name eq '$nomePapel' and _businessunitid_value eq $buId").value)
if (-not $papel.Count) {
  Dv POST roles @{ name = $nomePapel; 'businessunitid@odata.bind' = "/businessunits($buId)" } | Out-Null
  $papel = @((Dv GET "roles?`$select=roleid&`$filter=name eq '$nomePapel' and _businessunitid_value eq $buId").value)
}
$roleId = $papel[0].roleid

function Priv([string] $nome) {
  $p = @((Dv GET "privileges?`$select=privilegeid&`$filter=name eq '$nome'").value)
  if ($p.Count -ne 1) { throw "Privilégio $nome ausente ou ambíguo." }
  @{ PrivilegeId = $p[0].privilegeid; Depth = 'Global' }
}
$ler = 'cr40f_reservadeveculos', 'cr40f_funcionarios', 'cr40f_veiculos', 'cr40f_clientes1', 'cr40f_documento', 'cr40f_tipodocumento', 'cr40f_multas', 'cr40f_alertaoperacao'
$nomes = @($ler | ForEach-Object { "prvRead$_" })
$nomes += 'prvWritecr40f_reservadeveculos', 'prvAppendTocr40f_reservadeveculos'
$nomes += 'prvCreatecr40f_alertaoperacao', 'prvWritecr40f_alertaoperacao', 'prvAppendcr40f_alertaoperacao', 'prvAppendTocr40f_alertaoperacao'
Dv POST "roles($roleId)/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = @($nomes | ForEach-Object { Priv $_ }) } | Out-Null

# Usuário de aplicativo (cria se faltar)
$usuario = @((Dv GET "systemusers?`$select=systemuserid&`$filter=applicationid eq $ClientId").value)
if (-not $usuario.Count) {
  try { Dv POST systemusers @{ applicationid = "$ClientId"; 'businessunitid@odata.bind' = "/businessunits($buId)" } | Out-Null }
  catch { throw "O Dataverse recusou criar o usuário de aplicativo pela API. Crie no Power Platform admin center (Ambiente > Configurações > Usuários > Usuários de aplicativo > Novo) com o Application ID informado e rode este script de novo para associar o papel. Erro: $($_.Exception.Message)" }
  $usuario = @((Dv GET "systemusers?`$select=systemuserid&`$filter=applicationid eq $ClientId").value)
}
$userId = $usuario[0].systemuserid

# Associa o papel (idempotente)
$ja = @((Dv GET "systemusers($userId)/systemuserroles_association?`$select=roleid&`$filter=roleid eq $roleId").value)
if (-not $ja.Count) { Dv POST "systemusers($userId)/systemuserroles_association/`$ref" @{ '@odata.id' = "$environmentUrl/api/data/v9.2/roles($roleId)" } | Out-Null }

# Conferência por leitura de volta
$ok = @((Dv GET "systemusers($userId)/systemuserroles_association?`$select=name&`$filter=roleid eq $roleId").value)
if (-not $ok.Count) { throw 'Papel não associado ao usuário de aplicativo.' }
$privs = @((Dv GET "roles($roleId)/roleprivileges_association?`$select=name").value)
if ($privs.Count -lt $nomes.Count) { throw "O papel tem $($privs.Count) privilégios; esperado pelo menos $($nomes.Count)." }
Write-Output "DEV: papel '$nomePapel' com $($privs.Count) privilégios associado ao usuário de aplicativo (Application ID informado)."
```
Salve em UTF-8 com BOM. Se algum nome de privilégio não existir, `Priv` falha com o nome: confira o nome lógico da tabela (por exemplo `cr40f_clientes1`) com `describe` antes de ajustar.

- [ ] **Step 2: Rodar**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-alertas-acesso.ps1 -ClientId <GUID do Renan>` (duas vezes: a segunda deve ser idempotente).
Expected: a linha final com o número de privilégios. A prova de que o app realmente consegue ler e gravar acontece na Task 10, com o Worker.

- [ ] **Step 3: Commit**

```bash
git add packages/deploy/provision-alertas-acesso.ps1
git commit -m "Alertas: usuário de aplicativo e papel de segurança mínimo para o Worker no DEV"
```

---

### Task 5: Projeto do Worker e clientes das integrações (TDD)

**Files:**
- Create: `apps/alertas-worker/package.json`, `tsconfig.json`, `wrangler.toml`, `src/env.ts`, `src/orcamento.ts`, `src/endereco.ts`, `src/entra.ts`, `src/dataverse.ts`, `src/infleet.ts`, `src/osrm.ts`, `src/google.ts`, `src/graph.ts`
- Test: `src/orcamento.test.ts`, `src/endereco.test.ts`, `src/dataverse.test.ts`, `src/integracoes.test.ts`

**Interfaces:**
- Produces: `Orcamento` e `Fetcher`; `limparTexto`, `classificarGeocoding`; `obterToken`; `Dataverse` (`listarServicos`, `listarAbertos`, `buscarPorChave`, `aplicar`) e os construtores `opGravarEmbarque`, `opCriarAlerta`, `opAtualizarAlerta`, `opResolver`, `montarBatch`; `listarVeiculos`, `posicoesRecentes`, `rotasOsrm`, `geocodificar`, `rotaComTransito`, `enviarEmail`. As Tasks 7 a 9 só usam estas assinaturas.

- [ ] **Step 1: Criar o projeto**

`apps/alertas-worker/package.json`:
```json
{
  "name": "@betinhos/alertas-worker",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json",
    "deploy": "wrangler deploy"
  },
  "dependencies": { "@betinhos/alertas-operacao": "workspace:*" },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20251001.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0",
    "wrangler": "^4.0.0"
  }
}
```
`tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "allowImportingTsExtensions": true, "lib": ["ES2022"], "types": ["@cloudflare/workers-types"], "noEmit": true },
  "include": ["src"]
}
```
`wrangler.toml` (sem segredos; `ALERTAS_LIGADO` começa em `nao`):
```toml
name = "betinhos-alertas-operacao"
main = "src/index.ts"
compatibility_date = "2026-10-01"
workers_dev = true

[triggers]
crons = ["*/5 7-23,0-2 * * *", "0 10 * * 1-5"]

[vars]
DATAVERSE_URL = "https://org23b93544.crm2.dynamics.com"
ALERTAS_LIGADO = "nao"
ALERTAS_CANAIS = "email"
EMAIL_REMETENTE = ""
EMAIL_OPERACAO = ""
EMAIL_TI = ""
```
Rode `pnpm install` na raiz e confira `git diff --stat pnpm-lock.yaml` (só pacotes novos e re-resolução de peers sem mudança de versão).

`src/env.ts`:
```ts
export type Env = {
  DATAVERSE_URL: string
  ALERTAS_LIGADO: string
  ALERTAS_CANAIS: string
  EMAIL_REMETENTE: string
  EMAIL_OPERACAO: string
  EMAIL_TI: string
  INFLEET_TOKEN: string
  GOOGLE_MAPS_KEY: string
  ENTRA_TENANT_ID: string
  ENTRA_CLIENT_ID: string
  ENTRA_CLIENT_SECRET: string
  SEGREDO_EXECUCAO_MANUAL: string
  TEAMS_WEBHOOK_URL?: string
}
```

- [ ] **Step 2: Escrever os testes que falham**

`src/orcamento.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Orcamento, OrcamentoEsgotado } from './orcamento.ts'

describe('Orcamento', () => {
  it('conta as chamadas e recusa depois do limite', async () => {
    const base = async () => new Response('{}')
    const o = new Orcamento(2, base as typeof fetch)
    await o.fetch('https://a')
    expect(o.restante()).toBe(1)
    await o.fetch('https://b')
    await expect(o.fetch('https://c')).rejects.toBeInstanceOf(OrcamentoEsgotado)
    expect(o.usado).toBe(2)
  })
})
```
`src/endereco.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { classificarGeocoding, limparTexto } from './endereco.ts'

describe('limparTexto', () => {
  it.each([
    ['Tenaris Tubos - Portaria 01', 'Tenaris Tubos - Portaria 01'],
    ['1. John - Aerop. Guarulhos no voo DL105', 'Aerop. Guarulhos no voo DL105'],
    ['1. Lucas de Souza - Avenida Martha 201, Pindamonhangaba; \n', 'Avenida Martha 201, Pindamonhangaba'],
    ['2. Sem separador', 'Sem separador'],
    ['Rua A, 10;\r\n2. Maria - Rua B, 20', 'Rua A, 10'],
    ['', ''],
    [null, ''],
  ])('%j -> %j', (entrada, esperado) => expect(limparTexto(entrada as string | null)).toBe(esperado))
  it('corta em 250 caracteres', () => expect(limparTexto('x'.repeat(300))).toHaveLength(250))
  it('não deixa passar nome de passageiro de item numerado', () => expect(limparTexto('1. Maria Souza - Av. Paulista, 1000')).not.toContain('Maria'))
})

describe('classificarGeocoding', () => {
  const resp = (tipo: string, parcial = false) => ({ results: [{ partial_match: parcial, geometry: { location_type: tipo, location: { lat: -23.5, lng: -46.6 } } }] })
  it('ROOFTOP e RANGE_INTERPOLATED sem correspondência parcial são Geocodificado', () => {
    expect(classificarGeocoding(resp('ROOFTOP'))).toEqual({ precisao: 'Geocodificado', lat: -23.5, lon: -46.6 })
    expect(classificarGeocoding(resp('RANGE_INTERPOLATED')).precisao).toBe('Geocodificado')
  })
  it('GEOMETRIC_CENTER ou correspondência parcial são Aproximado', () => {
    expect(classificarGeocoding(resp('GEOMETRIC_CENTER')).precisao).toBe('Aproximado')
    expect(classificarGeocoding(resp('ROOFTOP', true)).precisao).toBe('Aproximado')
  })
  it('APPROXIMATE e sem resultado são Indisponivel, sem coordenadas', () => {
    expect(classificarGeocoding(resp('APPROXIMATE'))).toEqual({ precisao: 'Indisponivel', lat: null, lon: null })
    expect(classificarGeocoding({ results: [] }).precisao).toBe('Indisponivel')
    expect(classificarGeocoding(null).precisao).toBe('Indisponivel')
  })
})
```
`src/dataverse.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Dataverse, caminhoServicos, mapAberto, mapServico, montarBatch, opCriarAlerta, opResolver } from './dataverse.ts'
import { limparCacheTokens } from './entra.ts'

const env = { DATAVERSE_URL: 'https://org.example/', ENTRA_TENANT_ID: 't', ENTRA_CLIENT_ID: 'c', ENTRA_CLIENT_SECRET: 's' }
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

describe('mapeamento', () => {
  it('mapeia o serviço com expand e anotações', () => {
    const s = mapServico({
      cr40f_reservadeveculosid: 'ABC', cr40f_idnovo: '1234', cr40f_status: 202410001, cr40f_dataehorriodesada: '2026-10-15T17:00:00Z',
      _cr40f_motorista_value: 'M1', _cr40f_veiculo_value: 'V1', cr40f_Motorista: { new_apelido: 'João' }, cr40f_Veiculo: { cr40f_placa: 'ABC1D23' },
      '_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue': 'Embraer', new_enderecodesaidapersonalizado: null, cr40f_endereodesada: 'Rua A',
      cr40f_embarquelatitude: -23.5, cr40f_embarquelongitude: -46.6, cr40f_embarqueprecisao: 100000001, cr40f_embarquetexto: 'Rua A', cr40f_embarquegeocodificadoem: '2026-10-14T10:00:00Z',
    })
    expect(s).toEqual({
      id: 'abc', codigo: '1234', status: 202410001, saida: '2026-10-15T17:00:00Z', motoristaId: 'm1', motoristaNome: 'João', veiculoId: 'v1', placa: 'ABC1D23', cliente: 'Embraer',
      textoEndereco: 'Rua A', embarque: { lat: -23.5, lon: -46.6, precisao: 'Geocodificado', texto: 'Rua A', geocodificadoEm: '2026-10-14T10:00:00Z' },
    })
  })
  it('serviço sem motorista e sem embarque', () => {
    const s = mapServico({ cr40f_reservadeveculosid: 'x', cr40f_status: 202410005, cr40f_dataehorriodesada: '2026-10-15T17:00:00Z', _cr40f_motorista_value: null })
    expect(s.motoristaId).toBeNull()
    expect(s.embarque).toEqual({ lat: null, lon: null, precisao: null, texto: null, geocodificadoEm: null })
  })
  it('mapeia o alerta aberto', () => {
    expect(mapAberto({ cr40f_alertaoperacaoid: 'A1', cr40f_chave: 'JaAtrasado|r1', _cr40f_reserva_value: 'R1', cr40f_severidade: 100000001, cr40f_envios: 2, cr40f_ultimoenvioem: '2026-10-15T16:00:00Z' }))
      .toEqual({ id: 'a1', chave: 'JaAtrasado|r1', reservaId: 'r1', severidade: 'alta', envios: 2, ultimoEnvioEm: '2026-10-15T16:00:00Z' })
  })
  it('o filtro dos serviços usa os três status e a janela', () => {
    const c = decodeURIComponent(caminhoServicos('2026-10-15T15:00:00Z', '2026-10-15T19:00:00Z'))
    expect(c).toContain('cr40f_status eq 202410001 or cr40f_status eq 202410005 or cr40f_status eq 202410006')
    expect(c).toContain('cr40f_dataehorriodesada ge 2026-10-15T15:00:00Z')
    expect(c).toContain('$top=150')
  })
})

describe('lote', () => {
  it('monta o corpo multipart com If-Match nos PATCH', () => {
    const { limite, corpo } = montarBatch([
      { metodo: 'PATCH', caminho: "cr40f_alertaoperacaos(a1)", corpo: { cr40f_envios: 2 } },
      { metodo: 'POST', caminho: 'cr40f_alertaoperacaos', corpo: { cr40f_chave: 'k' } },
    ], 'https://org.example/api/data/v9.2', 'xyz')
    expect(limite).toBe('batch_xyz')
    expect(corpo).toContain("PATCH https://org.example/api/data/v9.2/cr40f_alertaoperacaos(a1) HTTP/1.1")
    expect(corpo).toContain('If-Match: *')
    expect(corpo.match(/If-Match/g)).toHaveLength(1)
    expect(corpo.endsWith('--batch_xyz--\r\n')).toBe(true)
  })
  it('opCriarAlerta liga o serviço e usa o id informado', () => {
    const op = opCriarAlerta('id1', { chave: 'JaAtrasado|r1', regra: 'JaAtrasado', reservaId: 'r1', severidade: 'alta', titulo: 'T', mensagem: 'M' }, '2026-10-15T16:00:00Z', '')
    expect(op.corpo).toMatchObject({ cr40f_alertaoperacaoid: 'id1', cr40f_regra: 100000001, cr40f_severidade: 100000001, cr40f_status: 100000000, cr40f_envios: 1, 'cr40f_Reserva@odata.bind': '/cr40f_reservadeveculoses(r1)' })
  })
  it('opResolver grava status e resolução', () => {
    expect(opResolver('a1', '2026-10-15T16:00:00Z', 'foraDaJanela').corpo).toMatchObject({ cr40f_status: 100000001, cr40f_resolucao: 100000001 })
    expect(opResolver('a1', '2026-10-15T16:00:00Z', 'condicao').corpo).toMatchObject({ cr40f_resolucao: 100000000 })
  })
})

describe('Dataverse', () => {
  it('pede token do Entra, lê a lista e reaproveita o token', async () => {
    limparCacheTokens()
    const chamadas: string[] = []
    const f = async (url: string) => {
      chamadas.push(url.split('?')[0]!)
      if (url.includes('login.microsoftonline.com')) return json({ access_token: 'tok', expires_in: 3600 })
      return json({ value: [] })
    }
    const dv = new Dataverse(f, env)
    await dv.listarAbertos()
    await dv.listarAbertos()
    expect(chamadas.filter((c) => c.includes('login.microsoftonline.com'))).toHaveLength(1)
    expect(chamadas.filter((c) => c.includes('/api/data/v9.2/cr40f_alertaoperacaos'))).toHaveLength(2)
  })
  it('aplicar falha com o status quando uma operação do lote é recusada, sem vazar o token', async () => {
    limparCacheTokens()
    const f = async (url: string) => {
      if (url.includes('login.microsoftonline.com')) return json({ access_token: 'SEGREDO-TOKEN', expires_in: 3600 })
      return new Response('--r\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 204 No Content\r\n\r\n--r\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 403 Forbidden\r\n\r\n{"error":{"message":"sem privilégio"}}\r\n--r--', { status: 200, headers: { 'content-type': 'multipart/mixed; boundary=r' } })
    }
    const dv = new Dataverse(f, env)
    const erro = await dv.aplicar([{ metodo: 'POST', caminho: 'x', corpo: {} }, { metodo: 'POST', caminho: 'y', corpo: {} }]).catch((e: Error) => e)
    expect(erro).toBeInstanceOf(Error)
    expect((erro as Error).message).toContain('403')
    expect((erro as Error).message).not.toContain('SEGREDO-TOKEN')
  })
  it('aplicar sem operações não faz chamada', async () => {
    let n = 0
    const dv = new Dataverse(async () => { n++; return json({}) }, env)
    await dv.aplicar([])
    expect(n).toBe(0)
  })
})
```
`src/integracoes.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { geocodificar, rotaComTransito } from './google.ts'
import { enviarEmail } from './graph.ts'
import { listarVeiculos, normalizarPlaca, posicoesRecentes } from './infleet.ts'
import { rotasOsrm } from './osrm.ts'

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

describe('infleet', () => {
  it('normaliza placas', () => expect(normalizarPlaca('abc-1d23')).toBe('ABC1D23'))
  it('lista a frota em duas páginas só quando a primeira vem cheia', async () => {
    const pagina = (n: number, p: string) => Array.from({ length: n }, (_, i) => ({ id: `${p}v${i}`, plate: `${p}${String(i).padStart(4, '0')}`, location: { latitude: -23, longitude: -46, speed: 0, fixTime: '2026-10-15T16:00:00Z' } }))
    let chamadas = 0
    const f = async (_url: string, init?: RequestInit) => {
      chamadas++
      const offset = JSON.parse(String(init?.body)).variables.offset
      return json({ data: { listVehicles: offset === 0 ? pagina(100, 'AAA') : pagina(3, 'BBB') } })
    }
    const mapa = await listarVeiculos(f, 'tok')
    expect(chamadas).toBe(2)
    expect(mapa.size).toBe(103)
    const v = mapa.get('AAA0001')!
    expect(v).toMatchObject({ id: 'AAAv1', lat: -23, lon: -46, velocidadeKmh: 0 })
  })
  it('ignora veículo sem localização e usa o token só no cabeçalho', async () => {
    let cabecalho = ''
    const f = async (_u: string, init?: RequestInit) => { cabecalho = String((init?.headers as Record<string, string>).Authorization); return json({ data: { listVehicles: [{ id: 'v', plate: 'XYZ1A23', location: null }] } }) }
    expect((await listarVeiculos(f, 'tok')).size).toBe(0)
    expect(cabecalho).toBe('Bearer tok')
  })
  it('posições recentes com o filtro do Infleet', async () => {
    let corpo: any
    const f = async (_u: string, init?: RequestInit) => { corpo = JSON.parse(String(init?.body)); return json({ data: { listVehiclePositions: [{ fixTime: '2026-10-15T15:50:00Z', speed: 0 }] } }) }
    const r = await posicoesRecentes(f, 'tok', 'v1', '2026-10-15T15:40:00Z', '2026-10-15T16:00:00Z')
    expect(r).toEqual([{ fixTime: '2026-10-15T15:50:00Z', speed: 0 }])
    expect(corpo.variables.f).toEqual({ vehicleId: 'v1', fixTime: { startAt: '2026-10-15T15:40:00Z', endAt: '2026-10-15T16:00:00Z' } })
  })
})

describe('osrm', () => {
  it('lê a diagonal da matriz e converte para minutos e metros', async () => {
    let url = ''
    const f = async (u: string) => { url = u; return json({ durations: [[600, 90], [30, 1200]], distances: [[5000, 1], [2, 20000]] }) }
    const r = await rotasOsrm(f, [
      { id: 'a', origem: { lat: -23.5, lon: -46.6 }, destino: { lat: -23.6, lon: -46.7 } },
      { id: 'b', origem: { lat: -23.4, lon: -46.5 }, destino: { lat: -23.3, lon: -46.4 } },
    ])
    expect(r.get('a')).toEqual({ minutos: 10, metros: 5000 })
    expect(r.get('b')).toEqual({ minutos: 20, metros: 20000 })
    expect(url).toContain('/table/v1/driving/-46.6,-23.5;-46.5,-23.4;-46.7,-23.6;-46.4,-23.3')
    expect(url).toContain('sources=0;1&destinations=2;3&annotations=duration,distance')
  })
  it('falha do OSRM devolve mapa vazio sem lançar', async () => {
    const r = await rotasOsrm(async () => new Response('x', { status: 500 }), [{ id: 'a', origem: { lat: 0, lon: 0 }, destino: { lat: 1, lon: 1 } }])
    expect(r.size).toBe(0)
  })
})

describe('google', () => {
  it('rota com trânsito arredonda os minutos para cima e usa o field mask', async () => {
    let init: RequestInit | undefined
    const f = async (_u: string, i?: RequestInit) => { init = i; return json({ routes: [{ duration: '3601s', distanceMeters: 42000 }] }) }
    const r = await rotaComTransito(f, 'chave', { lat: -23.5, lon: -46.6 }, { lat: -23.2, lon: -46.9 })
    expect(r).toEqual({ minutos: 61, metros: 42000 })
    const h = init!.headers as Record<string, string>
    expect(h['X-Goog-FieldMask']).toBe('routes.duration,routes.distanceMeters')
    const corpo = JSON.parse(String(init!.body))
    expect(corpo.routingPreference).toBe('TRAFFIC_AWARE')
    expect(corpo.origin.location.latLng).toEqual({ latitude: -23.5, longitude: -46.6 })
  })
  it('sem rota devolve null; erro HTTP não vaza a chave', async () => {
    expect(await rotaComTransito(async () => json({}), 'chave', { lat: 0, lon: 0 }, { lat: 1, lon: 1 })).toBeNull()
    const erro = await geocodificar(async () => new Response('x', { status: 403 }), 'CHAVE-SECRETA', 'Rua A').catch((e: Error) => e)
    expect((erro as Error).message).toContain('403')
    expect((erro as Error).message).not.toContain('CHAVE-SECRETA')
  })
  it('geocodifica com região e país do Brasil e classifica', async () => {
    let url = ''
    const f = async (u: string) => { url = u; return json({ results: [{ partial_match: false, geometry: { location_type: 'ROOFTOP', location: { lat: -23.5, lng: -46.6 } } }] }) }
    expect(await geocodificar(f, 'k', 'Av. Paulista, 1000')).toEqual({ precisao: 'Geocodificado', lat: -23.5, lon: -46.6 })
    expect(url).toContain('region=br')
    expect(url).toContain('components=country:BR')
    expect(url).toContain(encodeURIComponent('Av. Paulista, 1000'))
  })
})

describe('graph', () => {
  it('envia e-mail HTML ao destinatário certo e aceita 202', async () => {
    let corpo: any, url = ''
    const f = async (u: string, init?: RequestInit) => { url = u; corpo = JSON.parse(String(init?.body)); return new Response(null, { status: 202 }) }
    await enviarEmail(f, 'tok', 'alertas@betinhos.com.br', ['op@betinhos.com.br', 'ti@betinhos.com.br'], '[Operação] Teste', '<p>oi</p>', 'high')
    expect(url).toBe('https://graph.microsoft.com/v1.0/users/alertas%40betinhos.com.br/sendMail')
    expect(corpo.message).toMatchObject({ subject: '[Operação] Teste', importance: 'high', body: { contentType: 'HTML', content: '<p>oi</p>' } })
    expect(corpo.message.toRecipients).toEqual([{ emailAddress: { address: 'op@betinhos.com.br' } }, { emailAddress: { address: 'ti@betinhos.com.br' } }])
    expect(corpo.saveToSentItems).toBe(false)
  })
  it('falha com o status, sem o corpo', async () => {
    await expect(enviarEmail(async () => new Response('detalhe', { status: 403 }), 'tok', 'a@b.c', ['x@y.z'], 's', 'h', 'normal')).rejects.toThrow('403')
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/alertas-worker test`
Expected: FAIL (módulos ausentes).

- [ ] **Step 4: Implementar**

`src/orcamento.ts`:
```ts
export class OrcamentoEsgotado extends Error {
  constructor(limite: number) { super(`Orçamento de ${limite} chamadas externas esgotado.`) }
}
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

/** Conta as chamadas externas da execução (o plano grátis permite 50 por execução). */
export class Orcamento {
  usado = 0
  constructor(readonly limite: number, private readonly base: typeof fetch = fetch) {}
  restante() { return this.limite - this.usado }
  fetch: Fetcher = async (input, init) => {
    if (this.usado >= this.limite) throw new OrcamentoEsgotado(this.limite)
    this.usado++
    return this.base(input, init)
  }
}
```
`src/endereco.ts`:
```ts
export type Precisao = 'Geocodificado' | 'Aproximado' | 'Indisponivel'
export type Geocodificacao = { precisao: Precisao; lat: number | null; lon: number | null }

/** Primeira linha ou item do texto livre; em item numerado ("1. Nome - endereço") fica só o endereço. Nome de passageiro não sai daqui. */
export function limparTexto(bruto: string | null | undefined): string {
  const linha = ((bruto ?? '').replace(/\r/g, '').replace(/;/g, '\n').split('\n')[0] ?? '').trim()
  let t = linha
  if (t.length > 3 && /\d/.test(t[0]!) && t.slice(1, 3) === '. ') {
    t = t.includes(' - ') ? t.split(' - ').slice(1).join(' - ').trim() : t.slice(3).trim()
  }
  return t.slice(0, 250)
}

export function classificarGeocoding(resposta: any): Geocodificacao {
  const r = resposta?.results?.[0]
  const tipo = r?.geometry?.location_type
  if (!r || tipo === 'APPROXIMATE') return { precisao: 'Indisponivel', lat: null, lon: null }
  const aproximado = r.partial_match === true || tipo === 'GEOMETRIC_CENTER'
  return { precisao: aproximado ? 'Aproximado' : 'Geocodificado', lat: r.geometry.location.lat, lon: r.geometry.location.lng }
}
```
`src/entra.ts`:
```ts
import type { Fetcher } from './orcamento.ts'

export type Credencial = { tenant: string; clientId: string; secret: string }
const cache = new Map<string, { token: string; expira: number }>()

/** Token de aplicativo (client credentials). Guarda em memória até 60 s antes de expirar. Nunca registra o token nem o corpo. */
export async function obterToken(f: Fetcher, c: Credencial, escopo: string, agora = Date.now()): Promise<string> {
  const chave = `${c.tenant}|${c.clientId}|${escopo}`
  const guardado = cache.get(chave)
  if (guardado && guardado.expira > agora + 60_000) return guardado.token
  const r = await f(`https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.secret, scope: escopo }),
  })
  if (!r.ok) throw new Error(`Falha ao obter token do Entra (${r.status}).`)
  const j = (await r.json()) as { access_token: string; expires_in: number }
  cache.set(chave, { token: j.access_token, expira: agora + j.expires_in * 1000 })
  return j.access_token
}
export const limparCacheTokens = () => cache.clear()
```
`src/dataverse.ts`:
```ts
import type { Alerta, Severidade } from '@betinhos/alertas-operacao'
import { obterToken } from './entra.ts'
import type { Env } from './env.ts'
import type { Fetcher } from './orcamento.ts'

export const ALERTA_SET = 'cr40f_alertaoperacaos' // use o EntitySetName impresso na Task 3
export const RESERVA_SET = 'cr40f_reservadeveculoses'
export type PrecisaoDv = 'Informado' | 'Geocodificado' | 'Aproximado' | 'Indisponivel'
const PRECISAO_VALOR: Record<PrecisaoDv, number> = { Informado: 100000000, Geocodificado: 100000001, Aproximado: 100000002, Indisponivel: 100000003 }
const PRECISAO_NOME: Record<number, PrecisaoDv> = { 100000000: 'Informado', 100000001: 'Geocodificado', 100000002: 'Aproximado', 100000003: 'Indisponivel' }
export const REGRA_VALOR = { NaoChegaraATempo: 100000000, JaAtrasado: 100000001, MotoristaParado: 100000002, SemMotorista: 100000003 } as const
const SEVERIDADE_VALOR: Record<Severidade, number> = { media: 100000000, alta: 100000001 }

export type ServicoDv = {
  id: string; codigo: string; status: number; saida: string
  motoristaId: string | null; motoristaNome: string; veiculoId: string | null; placa: string; cliente: string
  /** Texto bruto do local de saída (personalizado ou o principal). */
  textoEndereco: string
  embarque: { lat: number | null; lon: number | null; precisao: PrecisaoDv | null; texto: string | null; geocodificadoEm: string | null }
}
export type AbertoDv = { id: string; chave: string; reservaId: string; severidade: Severidade; envios: number; ultimoEnvioEm: string | null }
export type Operacao = { metodo: 'POST' | 'PATCH'; caminho: string; corpo: Record<string, unknown> }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const idDe = (v: unknown) => str(v).replace(/[{}]/g, '').toLowerCase()
const enc = encodeURIComponent

const SELECT_SERVICO = [
  'cr40f_reservadeveculosid', 'cr40f_idnovo', 'cr40f_id', 'cr40f_status', 'cr40f_dataehorriodesada', '_cr40f_motorista_value', '_cr40f_veiculo_value', '_cr40f_cliente_value',
  'cr40f_endereodesada', 'new_enderecodesaidapersonalizado', 'cr40f_embarquelatitude', 'cr40f_embarquelongitude', 'cr40f_embarqueprecisao', 'cr40f_embarquetexto', 'cr40f_embarquegeocodificadoem',
]

export const caminhoServicos = (inicio: string, fim: string) =>
  `${RESERVA_SET}?$select=${SELECT_SERVICO.join(',')}&$expand=${enc('cr40f_Motorista($select=new_apelido),cr40f_Veiculo($select=cr40f_placa)')}` +
  `&$filter=${enc(`statecode eq 0 and (cr40f_status eq 202410001 or cr40f_status eq 202410005 or cr40f_status eq 202410006) and cr40f_dataehorriodesada ge ${inicio} and cr40f_dataehorriodesada le ${fim}`)}` +
  `&$orderby=${enc('cr40f_dataehorriodesada asc')}&$top=150`
export const caminhoAbertos = () =>
  `${ALERTA_SET}?$select=cr40f_alertaoperacaoid,cr40f_chave,cr40f_severidade,cr40f_envios,cr40f_ultimoenvioem,_cr40f_reserva_value&$filter=${enc('cr40f_status eq 100000000 and cr40f_regra le 100000003')}&$top=500`

export function mapServico(row: Record<string, any>): ServicoDv {
  return {
    id: idDe(row.cr40f_reservadeveculosid),
    codigo: str(row.cr40f_idnovo) || str(row.cr40f_id),
    status: num(row.cr40f_status) ?? 0,
    saida: str(row.cr40f_dataehorriodesada),
    motoristaId: row._cr40f_motorista_value ? idDe(row._cr40f_motorista_value) : null,
    motoristaNome: str(row.cr40f_Motorista?.new_apelido),
    veiculoId: row._cr40f_veiculo_value ? idDe(row._cr40f_veiculo_value) : null,
    placa: str(row.cr40f_Veiculo?.cr40f_placa),
    cliente: str(row['_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue']),
    textoEndereco: str(row.new_enderecodesaidapersonalizado) || str(row.cr40f_endereodesada),
    embarque: {
      lat: num(row.cr40f_embarquelatitude), lon: num(row.cr40f_embarquelongitude),
      precisao: PRECISAO_NOME[num(row.cr40f_embarqueprecisao) ?? -1] ?? null,
      texto: typeof row.cr40f_embarquetexto === 'string' ? row.cr40f_embarquetexto : null,
      geocodificadoEm: typeof row.cr40f_embarquegeocodificadoem === 'string' ? row.cr40f_embarquegeocodificadoem : null,
    },
  }
}
export function mapAberto(row: Record<string, any>): AbertoDv {
  return {
    id: idDe(row.cr40f_alertaoperacaoid), chave: str(row.cr40f_chave), reservaId: idDe(row._cr40f_reserva_value),
    severidade: num(row.cr40f_severidade) === 100000001 ? 'alta' : 'media', envios: num(row.cr40f_envios) ?? 0,
    ultimoEnvioEm: typeof row.cr40f_ultimoenvioem === 'string' ? row.cr40f_ultimoenvioem : null,
  }
}

export const opGravarEmbarque = (reservaId: string, geo: { precisao: PrecisaoDv; lat: number | null; lon: number | null }, texto: string, agoraIso: string): Operacao => ({
  metodo: 'PATCH', caminho: `${RESERVA_SET}(${reservaId})`,
  corpo: { cr40f_embarquelatitude: geo.lat, cr40f_embarquelongitude: geo.lon, cr40f_embarqueprecisao: PRECISAO_VALOR[geo.precisao], cr40f_embarquetexto: texto, cr40f_embarquegeocodificadoem: agoraIso },
})
export const opCriarAlerta = (id: string, a: Alerta, agoraIso: string, canais: string): Operacao => ({
  metodo: 'POST', caminho: ALERTA_SET,
  corpo: {
    cr40f_alertaoperacaoid: id, cr40f_alertaoperacaonome: a.titulo.slice(0, 200), cr40f_regra: REGRA_VALOR[a.regra], cr40f_chave: a.chave,
    'cr40f_Reserva@odata.bind': `/${RESERVA_SET}(${a.reservaId})`, cr40f_severidade: SEVERIDADE_VALOR[a.severidade], cr40f_status: 100000000,
    cr40f_mensagem: a.mensagem, cr40f_envios: 1, cr40f_ultimoenvioem: agoraIso, cr40f_canais: canais,
  },
})
export const opAtualizarAlerta = (id: string, patch: Record<string, unknown>): Operacao => ({ metodo: 'PATCH', caminho: `${ALERTA_SET}(${id})`, corpo: patch })
export const opResolver = (id: string, agoraIso: string, resolucao: 'condicao' | 'foraDaJanela'): Operacao =>
  opAtualizarAlerta(id, { cr40f_status: 100000001, cr40f_resolvidoem: agoraIso, cr40f_resolucao: resolucao === 'condicao' ? 100000000 : 100000001 })
export const severidadeValor = (s: Severidade) => SEVERIDADE_VALOR[s]

export function montarBatch(ops: Operacao[], apiUrl: string, id: string = crypto.randomUUID()) {
  const limite = `batch_${id}`
  const partes = ops.map((op) => [
    `--${limite}`, 'Content-Type: application/http', 'Content-Transfer-Encoding: binary', '',
    `${op.metodo} ${apiUrl}/${op.caminho} HTTP/1.1`, 'Content-Type: application/json; type=entry', 'Accept: application/json',
    ...(op.metodo === 'PATCH' ? ['If-Match: *'] : []), '', JSON.stringify(op.corpo),
  ].join('\r\n'))
  return { limite, corpo: `${partes.join('\r\n')}\r\n--${limite}--\r\n` }
}

export class Dataverse {
  private readonly base: string
  constructor(private readonly f: Fetcher, private readonly env: Pick<Env, 'DATAVERSE_URL' | 'ENTRA_TENANT_ID' | 'ENTRA_CLIENT_ID' | 'ENTRA_CLIENT_SECRET'>) {
    this.base = env.DATAVERSE_URL.replace(/\/+$/, '')
  }
  private get api() { return `${this.base}/api/data/v9.2` }
  private token() {
    return obterToken(this.f, { tenant: this.env.ENTRA_TENANT_ID, clientId: this.env.ENTRA_CLIENT_ID, secret: this.env.ENTRA_CLIENT_SECRET }, `${this.base}/.default`)
  }
  private async ler(caminho: string): Promise<Record<string, any>[]> {
    const r = await this.f(`${this.api}/${caminho}`, {
      headers: { Authorization: `Bearer ${await this.token()}`, Accept: 'application/json', 'OData-Version': '4.0', Prefer: 'odata.include-annotations="*"' },
    })
    if (!r.ok) throw new Error(`Falha ao ler o Dataverse (${r.status}).`)
    return ((await r.json()) as { value: Record<string, any>[] }).value
  }
  async listarServicos(inicioIso: string, fimIso: string) { return (await this.ler(caminhoServicos(inicioIso, fimIso))).map(mapServico) }
  async listarAbertos() { return (await this.ler(caminhoAbertos())).map(mapAberto) }
  async buscarPorChave(chave: string) {
    const rows = await this.ler(`${ALERTA_SET}?$select=cr40f_alertaoperacaoid&$filter=${enc(`cr40f_chave eq '${chave.replace(/'/g, "''")}'`)}&$top=1`)
    return rows.length > 0
  }
  /** Grava em lote ($batch, até 100 operações por chamada). Falha com o status da primeira operação recusada. */
  async aplicar(ops: Operacao[]): Promise<void> {
    for (let i = 0; i < ops.length; i += 100) {
      const { limite, corpo } = montarBatch(ops.slice(i, i + 100), this.api)
      const r = await this.f(`${this.api}/$batch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': `multipart/mixed;boundary=${limite}`, Accept: 'application/json', 'OData-Version': '4.0' },
        body: corpo,
      })
      if (!r.ok) throw new Error(`Falha no lote do Dataverse (${r.status}).`)
      const texto = await r.text()
      const ruim = [...texto.matchAll(/HTTP\/1\.1 (\d{3})/g)].map((m) => Number(m[1])).filter((s) => s >= 400)
      if (ruim.length) {
        const msg = /"message":"([^"]{0,200})/.exec(texto)?.[1] ?? ''
        throw new Error(`Operação recusada no lote do Dataverse (${ruim[0]}${msg ? `: ${msg}` : ''}).`)
      }
    }
  }
}
```
`src/infleet.ts`:
```ts
import type { Fetcher } from './orcamento.ts'

export type VeiculoInfleet = { id: string; placa: string; lat: number; lon: number; velocidadeKmh: number; fixTime: string }
export const normalizarPlaca = (p: string) => p.replace(/-/g, '').toUpperCase()
const ENDPOINT = 'https://api.infleet.com.br/v1/graphql'

async function gql<T>(f: Fetcher, token: string, query: string, variables: unknown): Promise<T> {
  const r = await f(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ query, variables }) })
  if (!r.ok) throw new Error(`Falha na consulta ao Infleet (${r.status}).`)
  const j = (await r.json()) as { data?: T; errors?: { message: string }[] }
  if (j.errors?.length || !j.data) throw new Error('O Infleet devolveu erro na consulta.')
  return j.data
}

const LISTA = 'query($offset:Int){ listVehicles(limit:100, offset:$offset, filter:{ deactivated: WITHOUT_DEACTIVATED }){ id plate location { latitude longitude speed fixTime } } }'
type Linha = { id: string; plate: string; location: { latitude: number; longitude: number; speed: number | null; fixTime: string } | null }

export async function listarVeiculos(f: Fetcher, token: string): Promise<Map<string, VeiculoInfleet>> {
  const linhas: Linha[] = []
  for (const offset of [0, 100]) {
    const d = await gql<{ listVehicles: Linha[] }>(f, token, LISTA, { offset })
    linhas.push(...d.listVehicles)
    if (d.listVehicles.length < 100) break
  }
  const mapa = new Map<string, VeiculoInfleet>()
  for (const v of linhas) {
    if (!v.location) continue
    mapa.set(normalizarPlaca(v.plate), { id: v.id, placa: v.plate, lat: v.location.latitude, lon: v.location.longitude, velocidadeKmh: v.location.speed ?? 0, fixTime: v.location.fixTime })
  }
  return mapa
}

export async function posicoesRecentes(f: Fetcher, token: string, veiculoId: string, desdeIso: string, ateIso: string): Promise<{ fixTime: string; speed: number }[]> {
  const d = await gql<{ listVehiclePositions: { fixTime: string; speed: number | null }[] }>(
    f, token, 'query($f: ListVehiclePositionsFilterInput!){ listVehiclePositions(filter:$f){ fixTime speed } }',
    { f: { vehicleId: veiculoId, fixTime: { startAt: desdeIso, endAt: ateIso } } },
  )
  return d.listVehiclePositions.map((p) => ({ fixTime: p.fixTime, speed: p.speed ?? 0 }))
}
```
`src/osrm.ts`:
```ts
import type { Fetcher } from './orcamento.ts'

export type Ponto = { lat: number; lon: number }
export type Par = { id: string; origem: Ponto; destino: Ponto }
export type Rota = { minutos: number; metros: number }
const LOTE = 25

/** Uma chamada `table` por lote de até 25 pares: a diagonal da matriz é a rota de cada origem ao seu destino. Falha do servidor devolve menos rotas, sem lançar. */
export async function rotasOsrm(f: Fetcher, pares: Par[]): Promise<Map<string, Rota>> {
  const saida = new Map<string, Rota>()
  for (let i = 0; i < pares.length; i += LOTE) {
    const lote = pares.slice(i, i + LOTE)
    const n = lote.length
    const coords = [...lote.map((p) => p.origem), ...lote.map((p) => p.destino)].map((c) => `${c.lon},${c.lat}`).join(';')
    const sources = lote.map((_, k) => k).join(';')
    const destinations = lote.map((_, k) => n + k).join(';')
    let r: Response
    try { r = await f(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=${sources}&destinations=${destinations}&annotations=duration,distance`) } catch { continue }
    if (!r.ok) continue
    const j = (await r.json()) as { durations?: (number | null)[][]; distances?: (number | null)[][] }
    lote.forEach((p, k) => {
      const d = j.durations?.[k]?.[k]
      const m = j.distances?.[k]?.[k]
      if (typeof d === 'number' && typeof m === 'number') saida.set(p.id, { minutos: d / 60, metros: m })
    })
  }
  return saida
}
```
`src/google.ts`:
```ts
import { classificarGeocoding, type Geocodificacao } from './endereco.ts'
import type { Fetcher } from './orcamento.ts'
import type { Ponto, Rota } from './osrm.ts'

export async function geocodificar(f: Fetcher, chave: string, texto: string): Promise<Geocodificacao> {
  const r = await f(`https://maps.googleapis.com/maps/api/geocode/json?region=br&components=country:BR&address=${encodeURIComponent(texto)}&key=${chave}`)
  if (!r.ok) throw new Error(`Falha no geocoding do Google (${r.status}).`)
  return classificarGeocoding(await r.json())
}

/** Rota com trânsito em tempo real. Minutos arredondados para cima. Nunca inclui a chave em mensagens de erro. */
export async function rotaComTransito(f: Fetcher, chave: string, origem: Ponto, destino: Ponto): Promise<Rota | null> {
  const r = await f('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters' },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origem.lat, longitude: origem.lon } } },
      destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lon } } },
      travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', languageCode: 'pt-BR', units: 'METRIC',
    }),
  })
  if (!r.ok) throw new Error(`Falha na rota do Google (${r.status}).`)
  const rota = ((await r.json()) as { routes?: { duration: string; distanceMeters: number }[] }).routes?.[0]
  if (!rota) return null
  const segundos = Number(rota.duration.replace('s', ''))
  return { minutos: Math.ceil(segundos / 60), metros: rota.distanceMeters }
}
```
`src/graph.ts`:
```ts
import type { Fetcher } from './orcamento.ts'

export async function enviarEmail(f: Fetcher, token: string, remetente: string, para: string[], assunto: string, html: string, importancia: 'high' | 'normal'): Promise<void> {
  const r = await f(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(remetente)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: { subject: assunto, importance: importancia, body: { contentType: 'HTML', content: html }, toRecipients: para.map((address) => ({ emailAddress: { address } })) },
      saveToSentItems: false,
    }),
  })
  if (r.status !== 202) throw new Error(`Falha no envio de e-mail (${r.status}).`)
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @betinhos/alertas-worker test && pnpm --filter @betinhos/alertas-worker typecheck`
Expected: PASS e sem erro de tipo. Ajuste só o código se um teste de borda falhar por detalhe de plataforma (por exemplo `Response` com `multipart`), registrando a mudança.

- [ ] **Step 6: Commit**

```bash
git add apps/alertas-worker pnpm-lock.yaml
git commit -m "Alertas: projeto do Worker com orçamento de chamadas, token do Entra, Dataverse, Infleet, OSRM, Google e Graph (testados com fetch simulado)"
```

---

### Task 6: Medir a qualidade do geocoding com endereços reais (só leitura no PROD, o Renan roda)

**Files:**
- Create: `packages/deploy/medir-geocoding-alertas.ps1`

**Interfaces:**
- Produces: a taxa de endereços utilizáveis. **Portão:** se menos de 70% dos endereços ficarem Geocodificado ou Aproximado, pare e reporte ao Renan antes da Task 7: a Fase 0 vira pré-requisito dos alertas de atraso.
- A chave do Google nunca passa por você. O script lê a chave da variável de ambiente `GOOGLE_MAPS_KEY` do terminal do **Renan**; você escreve o script, colhe os endereços e entrega os comandos para ele rodar.

- [ ] **Step 1: Colher os endereços (leitura no PROD, pelo MCP `Dataverse_PROD`)**

Execute `read_query` (somente SELECT):
```sql
SELECT TOP 40 cr40f_endereodesada, new_enderecodesaidapersonalizado FROM cr40f_reservadeveculos WHERE cr40f_dataehorriodesada >= '2026-09-15' AND cr40f_status = 202410008
```
Salve o resultado como JSON (`[{ "cr40f_endereodesada": "...", "new_enderecodesaidapersonalizado": "..." }]`) em um arquivo no diretório scratchpad da sessão, nunca no repositório. Os textos podem conter nome de passageiro: não os copie para o relatório nem para commits.

- [ ] **Step 2: Script**

```powershell
param([Parameter(Mandatory)] [string] $Arquivo)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$chave = $env:GOOGLE_MAPS_KEY
if (-not $chave) { throw 'Defina GOOGLE_MAPS_KEY no seu terminal antes de rodar (a chave nunca é impressa).' }

# Mesma regra do Worker (apps/alertas-worker/src/endereco.ts).
function LimparTexto([string] $bruto) {
  $linha = (((($bruto -replace "`r", '') -replace ';', "`n") -split "`n")[0])
  if ($null -eq $linha) { return '' }
  $linha = $linha.Trim()
  if ($linha.Length -gt 3 -and $linha[0] -match '\d' -and $linha.Substring(1, 2) -eq '. ') {
    if ($linha.Contains(' - ')) { $linha = ($linha -split ' - ', 2)[1] } else { $linha = $linha.Substring(3) }
  }
  $linha = $linha.Trim()
  if ($linha.Length -gt 250) { $linha = $linha.Substring(0, 250) }
  return $linha
}
$linhas = [IO.File]::ReadAllText((Resolve-Path $Arquivo), [Text.Encoding]::UTF8) | ConvertFrom-Json
$cont = @{ Geocodificado = 0; Aproximado = 0; Indisponivel = 0; SemTexto = 0 }
foreach ($l in $linhas) {
  $bruto = if ($l.new_enderecodesaidapersonalizado) { $l.new_enderecodesaidapersonalizado } else { $l.cr40f_endereodesada }
  $texto = LimparTexto ([string]$bruto)
  if (-not $texto) { $cont.SemTexto++; Write-Host 'SemTexto'; continue }
  $url = 'https://maps.googleapis.com/maps/api/geocode/json?region=br&components=country:BR&address=' + [Uri]::EscapeDataString($texto) + '&key=' + $chave
  $r = Invoke-RestMethod -Uri $url -TimeoutSec 30
  $res = if ($r.results -and $r.results.Count) { $r.results[0] } else { $null }
  if (-not $res -or $res.geometry.location_type -eq 'APPROXIMATE') { $classe = 'Indisponivel' }
  elseif ($res.partial_match -eq $true -or $res.geometry.location_type -eq 'GEOMETRIC_CENTER') { $classe = 'Aproximado' }
  else { $classe = 'Geocodificado' }
  $cont[$classe]++
  $tipo = if ($res) { $res.geometry.location_type } else { 'sem resultado' }
  Write-Host ("{0,-14} {1,-20}" -f $classe, $tipo)
}
$total = $linhas.Count
$uteis = $cont.Geocodificado + $cont.Aproximado
Write-Host ("Geocodificado {0}, Aproximado {1}, Indisponível {2}, Sem texto {3}. Utilizáveis: {4} de {5} ({6:P0})." -f $cont.Geocodificado, $cont.Aproximado, $cont.Indisponivel, $cont.SemTexto, $uteis, $total, ($uteis / [Math]::Max(1, $total)))
```
O script imprime só a classe e o tipo (nenhum texto de endereço), então a saída pode ser colada sem expor nome de passageiro. Salve em UTF-8 com BOM.

- [ ] **Step 3: Entregar ao Renan e aplicar o portão**

Diga ao Renan para rodar, no terminal dele:
```powershell
$env:GOOGLE_MAPS_KEY = Read-Host "Chave do Google"
powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/medir-geocoding-alertas.ps1 -Arquivo "<caminho do JSON no scratchpad>"
```
Peça a linha final. Se `utilizáveis / total` for menor que 70%, pare com DONE_WITH_CONCERNS e a distribuição. Sem a resposta do Renan, esta tarefa fica pendente e as Tasks 7 e seguintes podem andar (elas não dependem do resultado), mas a Task 10 só liga o Worker depois do portão.

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/medir-geocoding-alertas.ps1
git commit -m "Alertas: script de medição do geocoding com endereços reais (leitura no PROD, chave só no terminal do Renan)"
```

---

### Task 7: Worker — orquestração do Verificar (coleta, avaliação e registro)

**Files:**
- Create: `apps/alertas-worker/src/verificar.ts`
- Test: `apps/alertas-worker/src/verificar.test.ts`

**Interfaces:**
- Consumes: Task 1 (`avaliar`, `CONSTANTES`), Task 5 (clientes, `Operacao`, builders, `limparTexto`, `normalizarPlaca`, tipos).
- Produces: `verificar(deps: Deps): Promise<Resultado>`, `precisaGeocodificar`, `Deps`, `Resultado`, constantes `MAX_GEOCODE`, `MAX_PARADO`, `MAX_GOOGLE`, `RESERVA_FINAL`. A Task 8 implementa `deps.notificar`; a Task 10 monta as dependências reais em `index.ts`.

- [ ] **Step 1: Escrever os testes que falham**

`src/verificar.test.ts`:
```ts
import type { Acao } from '@betinhos/alertas-operacao'
import { describe, expect, it, vi } from 'vitest'
import type { AbertoDv, Operacao, ServicoDv } from './dataverse.ts'
import { MAX_GEOCODE, precisaGeocodificar, verificar, type Deps } from './verificar.ts'

const AGORA = new Date('2026-10-15T16:00:00Z') // 13:00 em Brasília
const emMin = (min: number) => new Date(AGORA.getTime() + min * 60_000).toISOString().replace('.000Z', 'Z')

const servico = (over: Partial<ServicoDv> = {}): ServicoDv => ({
  id: 'r1', codigo: '1234', status: 202410001, saida: emMin(60), motoristaId: 'm1', motoristaNome: 'João', veiculoId: 'v1', placa: 'ABC1D23', cliente: 'Embraer',
  textoEndereco: 'Tenaris Tubos - Portaria 01',
  embarque: { lat: -23.5, lon: -46.6, precisao: 'Informado', texto: null, geocodificadoEm: null },
  ...over,
})
const veiculo = { id: 'vi1', placa: 'ABC1D23', lat: -23.4, lon: -46.5, velocidadeKmh: 40, fixTime: emMin(-1) }

function deps(o: { servicos?: ServicoDv[]; abertos?: AbertoDv[]; rotaOsrm?: { minutos: number; metros: number } | null; rotaGoogle?: { minutos: number; metros: number } | null; restante?: number; ligado?: boolean } = {}) {
  const lotes: Operacao[][] = []
  const avisos: Acao[] = []
  const d = {
    agora: () => AGORA,
    ligado: o.ligado ?? true,
    dv: { listarServicos: vi.fn(async () => o.servicos ?? []), listarAbertos: vi.fn(async () => o.abertos ?? []), aplicar: vi.fn(async (ops: Operacao[]) => { lotes.push(ops) }) },
    infleet: { listarVeiculos: vi.fn(async () => new Map([['ABC1D23', veiculo]])), posicoes: vi.fn(async () => [{ fixTime: emMin(-8), speed: 0 }, { fixTime: emMin(-1), speed: 0 }]) },
    osrm: { rotas: vi.fn(async (pares: { id: string }[]) => new Map(o.rotaOsrm === null ? [] : pares.map((p) => [p.id, o.rotaOsrm ?? { minutos: 12, metros: 8000 }] as const))) },
    google: {
      geocodificar: vi.fn(async () => ({ precisao: 'Geocodificado' as const, lat: -23.55, lon: -46.63 })),
      rota: vi.fn(async () => o.rotaGoogle ?? { minutos: 62, metros: 20000 }),
    },
    notificar: { alerta: vi.fn(async (a: Acao) => { avisos.push(a); return ['email'] }) },
    orcamento: { restante: () => o.restante ?? 40 },
  } satisfies Deps
  return { d, lotes, avisos }
}

describe('precisaGeocodificar', () => {
  const base = servico({ embarque: { lat: null, lon: null, precisao: null, texto: null, geocodificadoEm: null } })
  it('sem precisão ainda: geocodifica o texto limpo', () => expect(precisaGeocodificar(base, AGORA.getTime())).toBe('Tenaris Tubos - Portaria 01'))
  it('texto vazio nunca geocodifica', () => expect(precisaGeocodificar({ ...base, textoEndereco: '' }, AGORA.getTime())).toBeNull())
  it('Informado (Fase 0) nunca geocodifica', () => expect(precisaGeocodificar(servico(), AGORA.getTime())).toBeNull())
  it('texto igual ao já geocodificado não repete; texto alterado repete', () => {
    const ok = servico({ embarque: { lat: 1, lon: 1, precisao: 'Geocodificado', texto: 'Tenaris Tubos - Portaria 01', geocodificadoEm: emMin(-100) } })
    expect(precisaGeocodificar(ok, AGORA.getTime())).toBeNull()
    expect(precisaGeocodificar({ ...ok, textoEndereco: 'Outro lugar' }, AGORA.getTime())).toBe('Outro lugar')
  })
  it('Indisponível só tenta de novo depois de 24 h', () => {
    const e = (h: number) => servico({ embarque: { lat: null, lon: null, precisao: 'Indisponivel', texto: 'Tenaris Tubos - Portaria 01', geocodificadoEm: emMin(-h * 60) } })
    expect(precisaGeocodificar(e(23), AGORA.getTime())).toBeNull()
    expect(precisaGeocodificar(e(24), AGORA.getTime())).toBe('Tenaris Tubos - Portaria 01')
  })
})

describe('verificar', () => {
  it('desligado não faz nenhuma chamada', async () => {
    const { d } = deps({ ligado: false })
    expect((await verificar(d)).estado).toBe('desligado')
    expect(d.dv.listarServicos).not.toHaveBeenCalled()
  })
  it('sem serviços e sem alertas abertos encerra cedo, sem chamar o Infleet', async () => {
    const { d } = deps()
    expect((await verificar(d)).estado).toBe('ocioso')
    expect(d.infleet.listarVeiculos).not.toHaveBeenCalled()
  })
  it('motorista folgado: nenhum alerta e nenhuma consulta ao Google', async () => {
    const { d, avisos } = deps({ servicos: [servico()] })
    const r = await verificar(d)
    expect(r.criados).toBe(0)
    expect(d.google.rota).not.toHaveBeenCalled()
    expect(avisos).toEqual([])
  })
  it('não vai chegar a tempo: OSRM pessimista pede o Google, o Google confirma, grava e avisa', async () => {
    const { d, lotes, avisos } = deps({ servicos: [servico()], rotaOsrm: { minutos: 30, metros: 20000 }, rotaGoogle: { minutos: 62, metros: 20000 } })
    const r = await verificar(d)
    expect(d.google.rota).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ estado: 'ok', criados: 1, avisos: 1, consultasGoogle: 1 })
    expect(avisos[0]!.alerta).toMatchObject({ regra: 'NaoChegaraATempo', chave: 'NaoChegaraATempo|r1', severidade: 'alta' })
    const criar = lotes[0]!.find((o) => o.metodo === 'POST')!
    expect(criar.corpo).toMatchObject({ cr40f_chave: 'NaoChegaraATempo|r1', cr40f_regra: 100000000, cr40f_envios: 1, 'cr40f_Reserva@odata.bind': '/cr40f_reservadeveculoses(r1)' })
    // segundo lote registra os canais usados
    expect(lotes[1]![0]!.corpo).toEqual({ cr40f_canais: 'email' })
  })
  it('sem motorista alerta sem precisar de posição nem de Google', async () => {
    const { d, avisos } = deps({ servicos: [servico({ motoristaId: null, motoristaNome: '', placa: '', saida: emMin(90) })] })
    await verificar(d)
    expect(avisos.map((a) => a.alerta.regra)).toEqual(['SemMotorista'])
    expect(d.infleet.listarVeiculos).not.toHaveBeenCalled()
  })
  it('geocodifica o embarque novo, grava a coordenada e usa o resultado na rota', async () => {
    const novo = servico({ embarque: { lat: null, lon: null, precisao: null, texto: null, geocodificadoEm: null } })
    const { d, lotes } = deps({ servicos: [novo] })
    const r = await verificar(d)
    expect(d.google.geocodificar).toHaveBeenCalledWith('Tenaris Tubos - Portaria 01')
    expect(r.geocodificados).toBe(1)
    const patch = lotes[0]!.find((o) => o.caminho === 'cr40f_reservadeveculoses(r1)')!
    expect(patch.corpo).toMatchObject({ cr40f_embarquelatitude: -23.55, cr40f_embarquelongitude: -46.63, cr40f_embarqueprecisao: 100000001, cr40f_embarquetexto: 'Tenaris Tubos - Portaria 01' })
    expect(d.osrm.rotas).toHaveBeenCalledWith([{ id: 'r1', origem: { lat: -23.4, lon: -46.5 }, destino: { lat: -23.55, lon: -46.63 } }])
  })
  it('limita o geocoding por execução e registra o adiamento', async () => {
    const lista = Array.from({ length: MAX_GEOCODE + 2 }, (_, i) => servico({ id: `r${i}`, placa: '', embarque: { lat: null, lon: null, precisao: null, texto: null, geocodificadoEm: null } }))
    const { d } = deps({ servicos: lista })
    const r = await verificar(d)
    expect(d.google.geocodificar).toHaveBeenCalledTimes(MAX_GEOCODE)
    expect(r.adiado).toContain('geocoding')
  })
  it('com pouco orçamento adia o geocoding em vez de estourar', async () => {
    const { d } = deps({ servicos: [servico({ embarque: { lat: null, lon: null, precisao: null, texto: null, geocodificadoEm: null } })], restante: 12 })
    const r = await verificar(d)
    expect(d.google.geocodificar).not.toHaveBeenCalled()
    expect(r.adiado).toContain('geocoding')
  })
  it('se o OSRM falha, o Google faz o papel da rota sem trânsito', async () => {
    const { d } = deps({ servicos: [servico({ saida: emMin(-20) })], rotaOsrm: null, rotaGoogle: { minutos: 9, metros: 5000 } })
    await verificar(d)
    expect(d.google.rota).toHaveBeenCalled()
    expect((d.notificar.alerta as ReturnType<typeof vi.fn>).mock.calls[0]![0].alerta.regra).toBe('JaAtrasado')
  })
  it('motorista parado: consulta as posições e alerta', async () => {
    const parado = { ...veiculo, velocidadeKmh: 0 }
    const { d, avisos } = deps({ servicos: [servico({ saida: emMin(60) })], rotaOsrm: { minutos: 8, metros: 3000 } })
    d.infleet.listarVeiculos = vi.fn(async () => new Map([['ABC1D23', parado]]))
    d.infleet.posicoes = vi.fn(async () => [{ fixTime: emMin(-12), speed: 0 }, { fixTime: emMin(-1), speed: 0 }])
    await verificar(d)
    expect(d.infleet.posicoes).toHaveBeenCalledWith('vi1', emMin(-20), emMin(0))
    expect(avisos.map((a) => a.alerta.regra)).toContain('MotoristaParado')
  })
  it('encerra alerta cuja condição sumiu', async () => {
    const aberto: AbertoDv = { id: 'a1', chave: 'JaAtrasado|r1', reservaId: 'r1', severidade: 'alta', envios: 1, ultimoEnvioEm: emMin(-5) }
    const { d, lotes } = deps({ servicos: [servico()], abertos: [aberto] })
    const r = await verificar(d)
    expect(r.resolvidos).toBe(1)
    expect(lotes[0]![0]).toMatchObject({ metodo: 'PATCH', caminho: 'cr40f_alertaoperacaos(a1)', corpo: { cr40f_status: 100000001, cr40f_resolucao: 100000000 } })
  })
  it('alerta de serviço que saiu da janela é encerrado como "fora da janela"', async () => {
    const aberto: AbertoDv = { id: 'a2', chave: 'SemMotorista|outro', reservaId: 'outro', severidade: 'media', envios: 1, ultimoEnvioEm: emMin(-5) }
    const { d, lotes } = deps({ servicos: [], abertos: [aberto] })
    await verificar(d)
    expect(lotes[0]![0]!.corpo).toMatchObject({ cr40f_resolucao: 100000001 })
  })
  it('lembrete atualiza o alerta existente em vez de criar outro', async () => {
    const aberto: AbertoDv = { id: 'a3', chave: 'SemMotorista|r1', reservaId: 'r1', severidade: 'media', envios: 1, ultimoEnvioEm: emMin(-31) }
    const { d, lotes, avisos } = deps({ servicos: [servico({ motoristaId: null, placa: '', saida: emMin(90) })], abertos: [aberto] })
    const r = await verificar(d)
    expect(r).toMatchObject({ criados: 0, atualizados: 1 })
    expect(avisos[0]!.acao).toBe('lembrar')
    expect(lotes[0]![0]).toMatchObject({ metodo: 'PATCH', caminho: 'cr40f_alertaoperacaos(a3)', corpo: { cr40f_envios: 2 } })
  })
  it('falha no aviso não derruba o ciclo: o alerta fica gravado e o canal marcado com erro', async () => {
    const { d, lotes } = deps({ servicos: [servico({ motoristaId: null, placa: '', saida: emMin(90) })] })
    d.notificar.alerta = vi.fn(async () => { throw new Error('graph fora') })
    const r = await verificar(d)
    expect(r.criados).toBe(1)
    expect(lotes[1]![0]!.corpo).toEqual({ cr40f_canais: 'erro' })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter @betinhos/alertas-worker test` → FAIL (`./verificar.ts` ausente).

- [ ] **Step 3: Implementar `src/verificar.ts`**

```ts
import { avaliar, CONSTANTES, type Acao, type EntradaServico, type Saida } from '@betinhos/alertas-operacao'
import type { AbertoDv, Dataverse, Operacao, ServicoDv } from './dataverse.ts'
import { opAtualizarAlerta, opCriarAlerta, opGravarEmbarque, opResolver, severidadeValor } from './dataverse.ts'
import { limparTexto, type Geocodificacao } from './endereco.ts'
import { normalizarPlaca, type VeiculoInfleet } from './infleet.ts'
import type { Orcamento } from './orcamento.ts'
import type { Par, Ponto, Rota } from './osrm.ts'

export const MAX_GEOCODE = 5
export const MAX_PARADO = 5
export const MAX_GOOGLE = 5
/** Chamadas externas reservadas para gravar, avisar e registrar canais. */
export const RESERVA_FINAL = 12
const MIN = 60_000

export type Deps = {
  agora: () => Date
  ligado: boolean
  dv: Pick<Dataverse, 'listarServicos' | 'listarAbertos' | 'aplicar'>
  infleet: {
    listarVeiculos(): Promise<Map<string, VeiculoInfleet>>
    posicoes(veiculoId: string, desdeIso: string, ateIso: string): Promise<{ fixTime: string; speed: number }[]>
  }
  osrm: { rotas(pares: Par[]): Promise<Map<string, Rota>> }
  google: { geocodificar(texto: string): Promise<Geocodificacao>; rota(origem: Ponto, destino: Ponto): Promise<Rota | null> }
  notificar: { alerta(acao: Acao): Promise<string[]> }
  orcamento: Pick<Orcamento, 'restante'>
}
export type Resultado = {
  estado: 'desligado' | 'ocioso' | 'ok'
  servicos: number
  criados: number
  atualizados: number
  resolvidos: number
  geocodificados: number
  consultasGoogle: number
  avisos: number
  adiado: string[]
}

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
const podeGastar = (d: Deps) => d.orcamento.restante() - RESERVA_FINAL >= 1
const embarqueUsavel = (s: ServicoDv) => s.embarque.lat !== null && s.embarque.lon !== null && s.embarque.precisao !== null && s.embarque.precisao !== 'Indisponivel'

/** Texto a geocodificar, ou null quando não precisa (vazio, Informado, já geocodificado com o mesmo texto, Indisponível há menos de 24 h). */
export function precisaGeocodificar(s: ServicoDv, agoraMs: number): string | null {
  const texto = limparTexto(s.textoEndereco)
  if (!texto) return null
  const e = s.embarque
  if (e.precisao === 'Informado') return null
  if (e.precisao === null || e.texto !== texto) return texto
  if (e.precisao === 'Indisponivel' && agoraMs - Date.parse(e.geocodificadoEm ?? '1970-01-01T00:00:00Z') >= 24 * 60 * MIN) return texto
  return null
}

function minutosParado(posicoes: { fixTime: string; speed: number }[], agoraMs: number): number | null {
  if (!posicoes.length) return null
  if (Math.max(...posicoes.map((p) => p.speed)) > CONSTANTES.paradoVelKmh) return 0
  return (agoraMs - Math.min(...posicoes.map((p) => Date.parse(p.fixTime)))) / MIN
}

export async function verificar(d: Deps): Promise<Resultado> {
  const r: Resultado = { estado: 'ok', servicos: 0, criados: 0, atualizados: 0, resolvidos: 0, geocodificados: 0, consultasGoogle: 0, avisos: 0, adiado: [] }
  if (!d.ligado) return { ...r, estado: 'desligado' }
  const agora = d.agora().getTime()
  const agoraIso = iso(agora)
  const adiar = (o: string) => { if (!r.adiado.includes(o)) r.adiado.push(o) }

  const [servicos, abertos] = await Promise.all([
    d.dv.listarServicos(iso(agora - CONSTANTES.janelaAntesMin * MIN), iso(agora + CONSTANTES.janelaDepoisMin * MIN)),
    d.dv.listarAbertos(),
  ])
  r.servicos = servicos.length
  if (!servicos.length && !abertos.length) return { ...r, estado: 'ocioso' }
  const ops: Operacao[] = []

  // 1. Geocoding dos embarques novos ou alterados.
  let tentativasGeo = 0
  for (const s of servicos) {
    const texto = precisaGeocodificar(s, agora)
    if (!texto) continue
    if (tentativasGeo >= MAX_GEOCODE || !podeGastar(d)) { adiar('geocoding'); continue }
    tentativasGeo++
    try {
      const g = await d.google.geocodificar(texto)
      s.embarque = { lat: g.lat, lon: g.lon, precisao: g.precisao, texto, geocodificadoEm: agoraIso }
      ops.push(opGravarEmbarque(s.id, g, texto, agoraIso))
      r.geocodificados++
    } catch { /* o serviço será tentado de novo no próximo ciclo */ }
  }

  // 2. Posição da frota e rota sem trânsito.
  const veiculos = servicos.some((s) => s.placa) ? await d.infleet.listarVeiculos() : new Map<string, VeiculoInfleet>()
  const veiculoDe = (s: ServicoDv) => (s.placa ? veiculos.get(normalizarPlaca(s.placa)) : undefined)
  const rastreaveis = servicos.filter((s) => veiculoDe(s) && embarqueUsavel(s))
  const origemDe = (s: ServicoDv): Ponto => ({ lat: veiculoDe(s)!.lat, lon: veiculoDe(s)!.lon })
  const destinoDe = (s: ServicoDv): Ponto => ({ lat: s.embarque.lat!, lon: s.embarque.lon! })
  const rotas = rastreaveis.length
    ? await d.osrm.rotas(rastreaveis.map((s) => ({ id: s.id, origem: origemDe(s), destino: destinoDe(s) })))
    : new Map<string, Rota>()
  let consultasGoogle = 0
  for (const s of rastreaveis) {
    if (rotas.has(s.id)) continue
    if (consultasGoogle >= MAX_GOOGLE || !podeGastar(d)) { adiar('rota'); continue }
    consultasGoogle++
    try { const rota = await d.google.rota(origemDe(s), destinoDe(s)); if (rota) rotas.set(s.id, rota) } catch { /* sem rota neste ciclo */ }
  }

  // 3. Há quanto tempo está parado (só quando a regra poderia disparar).
  const parados = new Map<string, number | null>()
  let consultasParado = 0
  for (const s of rastreaveis) {
    const v = veiculoDe(s)!
    const min = (Date.parse(s.saida) - agora) / MIN
    if (v.velocidadeKmh > CONSTANTES.paradoVelKmh || !rotas.has(s.id) || min < 0 || min > CONSTANTES.paradoJanelaMin) continue
    if (consultasParado >= MAX_PARADO || !podeGastar(d)) { adiar('parado'); continue }
    consultasParado++
    try { parados.set(s.id, minutosParado(await d.infleet.posicoes(v.id, iso(agora - 20 * MIN), agoraIso), agora)) } catch { /* sem dado neste ciclo */ }
  }

  // 4. Avaliação (primeira passada) e, para quem precisa, Google com trânsito (segunda passada).
  const entradaServicos: EntradaServico[] = servicos.map((s) => {
    const v = veiculoDe(s)
    return {
      id: s.id, codigo: s.codigo, status: s.status, saida: s.saida, motoristaId: s.motoristaId, motoristaNome: s.motoristaNome, veiculoId: s.veiculoId, placa: s.placa, cliente: s.cliente,
      posicao: v ? { velocidadeKmh: v.velocidadeKmh, fixTime: v.fixTime } : null,
      rotaOsrm: rotas.get(s.id) ?? null, rotaGoogle: null, paradoMin: parados.get(s.id) ?? null,
      embarqueAproximado: s.embarque.precisao === 'Aproximado',
    }
  })
  const abertosEntrada = abertos.map((a) => ({ chave: a.chave, reservaId: a.reservaId, severidade: a.severidade, envios: a.envios, ultimoEnvioEm: a.ultimoEnvioEm ?? agoraIso }))
  const r1 = avaliar({ agora: agoraIso, servicos: entradaServicos, abertos: abertosEntrada })

  const rotasGoogle = new Map<string, Rota>()
  for (const id of r1.precisaGoogle) {
    if (consultasGoogle >= MAX_GOOGLE || !podeGastar(d)) { adiar('google'); continue }
    const s = rastreaveis.find((x) => x.id === id)
    if (!s) continue
    consultasGoogle++
    try { const rota = await d.google.rota(origemDe(s), destinoDe(s)); if (rota) rotasGoogle.set(id, rota) } catch { /* o avaliador mantém os alertas como estão */ }
  }
  const vazio: Saida = { precisaGoogle: [], acoes: [], resolver: [] }
  const r2 = rotasGoogle.size
    ? avaliar({
        agora: agoraIso,
        servicos: entradaServicos.filter((e) => rotasGoogle.has(e.id)).map((e) => ({ ...e, rotaGoogle: rotasGoogle.get(e.id)! })),
        abertos: abertosEntrada,
        regras: ['NaoChegaraATempo'],
      })
    : vazio
  r.consultasGoogle = consultasGoogle
  const acoes = [...r1.acoes, ...r2.acoes]
  const resolver = new Set([...r1.resolver, ...r2.resolver])

  // 5. Gravação em lote.
  const porChave = new Map<string, AbertoDv>(abertos.map((a) => [a.chave, a]))
  const naJanela = new Set(servicos.map((s) => s.id))
  const idsNovos = new Map<string, string>()
  for (const { acao, alerta } of acoes) {
    if (acao === 'criar') {
      const id = crypto.randomUUID()
      idsNovos.set(alerta.chave, id)
      ops.push(opCriarAlerta(id, alerta, agoraIso, ''))
      r.criados++
    } else {
      const a = porChave.get(alerta.chave)!
      ops.push(opAtualizarAlerta(a.id, {
        cr40f_envios: a.envios + 1, cr40f_ultimoenvioem: agoraIso,
        ...(acao === 'reenviar' ? { cr40f_severidade: severidadeValor(alerta.severidade), cr40f_mensagem: alerta.mensagem } : {}),
      }))
      r.atualizados++
    }
  }
  for (const chave of resolver) {
    const a = porChave.get(chave)
    if (!a) continue
    ops.push(opResolver(a.id, agoraIso, naJanela.has(a.reservaId) ? 'condicao' : 'foraDaJanela'))
    r.resolvidos++
  }
  await d.dv.aplicar(ops)

  // 6. Avisos; falha de canal não derruba o ciclo. Depois registra quais canais foram usados.
  const opsCanais: Operacao[] = []
  for (const a of acoes) {
    let canais: string[]
    try { canais = await d.notificar.alerta(a) } catch { canais = ['erro'] }
    r.avisos++
    const id = a.acao === 'criar' ? idsNovos.get(a.alerta.chave)! : porChave.get(a.alerta.chave)!.id
    opsCanais.push(opAtualizarAlerta(id, { cr40f_canais: canais.join(',') }))
  }
  await d.dv.aplicar(opsCanais)
  return r
}
```

- [ ] **Step 4: Rodar e ver passar** — `pnpm --filter @betinhos/alertas-worker test && pnpm --filter @betinhos/alertas-worker typecheck` → PASS. Se um teste de borda divergir do comportamento da Task 1, o pacote `alertas-operacao` é a autoridade.

- [ ] **Step 5: Commit**

```bash
git add apps/alertas-worker
git commit -m "Alertas: orquestração do Verificar no Worker (geocoding, Infleet, OSRM, Google com trânsito, avaliação, lote e avisos), com orçamento de chamadas"
```

---

### Task 8: Worker — avisos por e-mail, Teams opcional e falha do agente

**Files:**
- Create: `apps/alertas-worker/src/notificar.ts`
- Test: `apps/alertas-worker/src/notificar.test.ts`

**Interfaces:**
- Consumes: Task 5 (`enviarEmail`, `obterToken`, `Dataverse`, `ALERTA_SET`), Task 1 (`Acao`, `Alerta`), `Env`.
- Produces: `criarNotificador(f, env)` com `alerta(acao): Promise<string[]>` e `email(assunto, html, para): Promise<void>`; `corpoHtml`, `assunto`, `linkServico`, `cartaoTeams`, `chaveFalha`, `registrarFalha`.

- [ ] **Step 1: Testes que falham**

`src/notificar.test.ts`:
```ts
import type { Acao } from '@betinhos/alertas-operacao'
import { describe, expect, it, vi } from 'vitest'
import type { Env } from './env.ts'
import { limparCacheTokens } from './entra.ts'
import { assunto, cartaoTeams, chaveFalha, corpoHtml, criarNotificador, linkServico, registrarFalha } from './notificar.ts'

const env: Env = {
  DATAVERSE_URL: 'https://org.example', ALERTAS_LIGADO: 'sim', ALERTAS_CANAIS: 'email,teams', EMAIL_REMETENTE: 'alertas@betinhos.com.br', EMAIL_OPERACAO: 'op@betinhos.com.br;op2@betinhos.com.br', EMAIL_TI: 'ti@betinhos.com.br',
  INFLEET_TOKEN: 'x', GOOGLE_MAPS_KEY: 'x', ENTRA_TENANT_ID: 't', ENTRA_CLIENT_ID: 'c', ENTRA_CLIENT_SECRET: 's', SEGREDO_EXECUCAO_MANUAL: 'x', TEAMS_WEBHOOK_URL: 'https://teams.example/hook',
}
const acao = (over: Partial<Acao['alerta']> = {}, tipo: Acao['acao'] = 'criar'): Acao => ({
  acao: tipo, alerta: { chave: 'NaoChegaraATempo|r1', regra: 'NaoChegaraATempo', reservaId: 'r1', severidade: 'alta', titulo: 'Risco de atraso: OS 1234 às 14:00', mensagem: 'Motorista João <b>, placa ABC1D23.', ...over },
})

describe('textos', () => {
  it('assunto do lembrete e link do serviço', () => {
    expect(assunto(acao())).toBe('[Operação] Risco de atraso: OS 1234 às 14:00')
    expect(assunto(acao({}, 'lembrar'))).toBe('[Operação] Lembrete: Risco de atraso: OS 1234 às 14:00')
    expect(linkServico('https://org.example/', 'r1')).toBe('https://org.example/main.aspx?pagetype=entityrecord&etn=cr40f_reservadeveculos&id=r1')
  })
  it('o corpo escapa HTML e tem o link', () => {
    const html = corpoHtml(acao().alerta, 'https://x/y')
    expect(html).toContain('Motorista João &lt;b&gt;, placa ABC1D23.')
    expect(html).toContain('<a href="https://x/y">Abrir o serviço</a>')
  })
  it('o cartão do Teams é um AdaptiveCard com o texto', () => {
    const c = cartaoTeams('T', 'M', 'https://x')
    expect(c.attachments[0]!.contentType).toBe('application/vnd.microsoft.card.adaptive')
    expect(JSON.stringify(c)).toContain('M')
  })
})

describe('criarNotificador', () => {
  const montar = () => {
    limparCacheTokens()
    const chamadas: { url: string; init?: RequestInit }[] = []
    const f = async (url: string, init?: RequestInit) => {
      chamadas.push({ url, init })
      if (url.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
      if (url.includes('graph.microsoft.com')) return new Response(null, { status: 202 })
      return new Response('ok', { status: 200 })
    }
    return { f, chamadas }
  }
  it('envia e-mail com importância alta e Teams só para alerta alto', async () => {
    const { f, chamadas } = montar()
    const usados = await criarNotificador(f, env).alerta(acao())
    expect(usados).toEqual(['email', 'teams'])
    const mail = chamadas.find((c) => c.url.includes('sendMail'))!
    expect(JSON.parse(String(mail.init!.body)).message.importance).toBe('high')
    expect(JSON.parse(String(mail.init!.body)).message.toRecipients).toHaveLength(2)
    expect(chamadas.some((c) => c.url === 'https://teams.example/hook')).toBe(true)
  })
  it('alerta médio não vai ao Teams', async () => {
    const { f, chamadas } = montar()
    expect(await criarNotificador(f, env).alerta(acao({ severidade: 'media' }))).toEqual(['email'])
    expect(chamadas.some((c) => c.url === 'https://teams.example/hook')).toBe(false)
  })
  it('respeita ALERTAS_CANAIS e a ausência de webhook', async () => {
    const { f } = montar()
    expect(await criarNotificador(f, { ...env, ALERTAS_CANAIS: 'email', TEAMS_WEBHOOK_URL: undefined }).alerta(acao())).toEqual(['email'])
    expect(await criarNotificador(f, { ...env, ALERTAS_CANAIS: 'teams', TEAMS_WEBHOOK_URL: undefined }).alerta(acao())).toEqual([])
  })
  it('falha de canal vira marca de erro, não exceção', async () => {
    limparCacheTokens()
    const f = async (url: string) => (url.includes('login.microsoftonline.com') ? new Response(JSON.stringify({ access_token: 't', expires_in: 3600 })) : new Response('x', { status: 500 }))
    expect(await criarNotificador(f, env).alerta(acao())).toEqual(['email:erro', 'teams:erro'])
  })
})

describe('falha do agente', () => {
  it('a chave muda a cada hora de Brasília', () => {
    expect(chaveFalha(new Date('2026-10-15T16:20:00Z'))).toBe('FalhaDoAgente|2026-10-15-13')
    expect(chaveFalha(new Date('2026-10-15T02:59:00Z'))).toBe('FalhaDoAgente|2026-10-14-23')
  })
  it('grava uma linha e avisa o TI; na mesma hora não repete', async () => {
    const aplicar = vi.fn(async () => {})
    const email = vi.fn(async () => {})
    const dv = { buscarPorChave: vi.fn(async () => false), aplicar }
    const agora = new Date('2026-10-15T16:20:00Z')
    expect(await registrarFalha(dv, { email }, env, 'Falha ao ler o Dataverse (500).', agora)).toBe(true)
    expect(aplicar).toHaveBeenCalledTimes(1)
    expect(email).toHaveBeenCalledWith('[TI] Falha no agente de alertas de operação', expect.stringContaining('Falha ao ler o Dataverse (500).'), ['ti@betinhos.com.br'])
    dv.buscarPorChave = vi.fn(async () => true)
    expect(await registrarFalha(dv, { email }, env, 'outra', agora)).toBe(false)
    expect(email).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL (`./notificar.ts` ausente).

- [ ] **Step 3: Implementar `src/notificar.ts`**

```ts
import type { Acao, Alerta } from '@betinhos/alertas-operacao'
import { ALERTA_SET, type Dataverse } from './dataverse.ts'
import { obterToken } from './entra.ts'
import type { Env } from './env.ts'
import { enviarEmail } from './graph.ts'
import type { Fetcher } from './orcamento.ts'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const linkServico = (dataverseUrl: string, id: string) => `${dataverseUrl.replace(/\/+$/, '')}/main.aspx?pagetype=entityrecord&etn=cr40f_reservadeveculos&id=${id}`
export const assunto = (a: Acao) => `[Operação] ${a.acao === 'lembrar' ? 'Lembrete: ' : ''}${a.alerta.titulo}`
export const corpoHtml = (a: Alerta, link: string) => `<p><b>${esc(a.titulo)}</b></p><p>${esc(a.mensagem)}</p><p><a href="${link}">Abrir o serviço</a></p>`
export const cartaoTeams = (titulo: string, mensagem: string, link: string) => ({
  type: 'message',
  attachments: [{
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      type: 'AdaptiveCard', version: '1.4',
      body: [{ type: 'TextBlock', text: titulo, weight: 'Bolder', wrap: true }, { type: 'TextBlock', text: mensagem, wrap: true }],
      actions: [{ type: 'Action.OpenUrl', title: 'Abrir o serviço', url: link }],
    },
  }],
})

const lista = (v: string) => v.split(/[;,]/).map((x) => x.trim()).filter(Boolean)

export function criarNotificador(f: Fetcher, env: Env) {
  const canais = lista(env.ALERTAS_CANAIS.toLowerCase())
  const tokenGraph = () => obterToken(f, { tenant: env.ENTRA_TENANT_ID, clientId: env.ENTRA_CLIENT_ID, secret: env.ENTRA_CLIENT_SECRET }, 'https://graph.microsoft.com/.default')
  return {
    async email(assuntoTexto: string, html: string, para: string[], importancia: 'high' | 'normal' = 'normal') {
      await enviarEmail(f, await tokenGraph(), env.EMAIL_REMETENTE, para, assuntoTexto, html, importancia)
    },
    /** Devolve os canais usados, com ":erro" no que falhou. Nunca lança por falha de canal. */
    async alerta(a: Acao): Promise<string[]> {
      const usados: string[] = []
      const link = linkServico(env.DATAVERSE_URL, a.alerta.reservaId)
      const para = lista(env.EMAIL_OPERACAO)
      if (canais.includes('email') && env.EMAIL_REMETENTE && para.length) {
        try { await enviarEmail(f, await tokenGraph(), env.EMAIL_REMETENTE, para, assunto(a), corpoHtml(a.alerta, link), a.alerta.severidade === 'alta' ? 'high' : 'normal'); usados.push('email') } catch { usados.push('email:erro') }
      }
      if (canais.includes('teams') && env.TEAMS_WEBHOOK_URL && a.alerta.severidade === 'alta') {
        try {
          const r = await f(env.TEAMS_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cartaoTeams(a.alerta.titulo, a.alerta.mensagem, link)) })
          usados.push(r.ok ? 'teams' : 'teams:erro')
        } catch { usados.push('teams:erro') }
      }
      return usados
    },
  }
}

/** Chave de uma falha por hora de Brasília: impede mais de um e-mail ao TI por hora. */
export function chaveFalha(agora: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(agora)
  const g = (t: string) => partes.find((p) => p.type === t)!.value
  return `FalhaDoAgente|${g('year')}-${g('month')}-${g('day')}-${g('hour')}`
}

export async function registrarFalha(
  dv: Pick<Dataverse, 'buscarPorChave' | 'aplicar'>,
  n: { email(assunto: string, html: string, para: string[]): Promise<void> },
  env: Pick<Env, 'EMAIL_TI'>,
  erro: string,
  agora: Date,
): Promise<boolean> {
  const chave = chaveFalha(agora)
  if (await dv.buscarPorChave(chave)) return false
  const mensagem = erro.slice(0, 500)
  await dv.aplicar([{
    metodo: 'POST', caminho: ALERTA_SET,
    corpo: {
      cr40f_alertaoperacaonome: 'Falha do agente de operação', cr40f_regra: 100000005, cr40f_chave: chave, cr40f_severidade: 100000001, cr40f_status: 100000001,
      cr40f_resolucao: 100000000, cr40f_mensagem: mensagem, cr40f_envios: 1, cr40f_ultimoenvioem: agora.toISOString().replace(/\.\d{3}Z$/, 'Z'), cr40f_canais: 'email',
    },
  }])
  const para = lista(env.EMAIL_TI)
  if (para.length) await n.email('[TI] Falha no agente de alertas de operação', `<p>O agente de alertas de operação falhou: ${esc(mensagem)}</p>`, para)
  return true
}
```

- [ ] **Step 4: Rodar e ver passar** — `pnpm --filter @betinhos/alertas-worker test && pnpm --filter @betinhos/alertas-worker typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/alertas-worker
git commit -m "Alertas: avisos por e-mail (Graph) e Teams opcional, e registro de falha do agente com e-mail ao TI (um por hora)"
```

---

### Task 9: Worker — resumo diário (CNH, ASO, documento do veículo e multa sem condutor)

**Files:**
- Create: `apps/alertas-worker/src/resumo.ts`
- Modify: `apps/alertas-worker/src/dataverse.ts` (consultas do resumo)
- Test: `apps/alertas-worker/src/resumo.test.ts`

**Interfaces:**
- Consumes: Task 5 e Task 8.
- Produces: `montarResumo(dados, hojeBr)`, `rodarResumo(deps)`, e métodos de `Dataverse`: `listarEscalados(inicioIso, fimIso)`, `listarCnhVencida(hoje)`, `listarAsoVencido(limite)`, `listarDocumentosVencidos(hoje)`, `listarMultasSemCondutor(limite)`.

- [ ] **Step 1: Testes que falham**

`src/resumo.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { limitesDoDia, montarResumo, rodarResumo, type DadosResumo } from './resumo.ts'

const vazio: DadosResumo = { cnh: [], aso: [], documentos: [], multas: [] }

describe('montarResumo', () => {
  it('sem itens: total zero', () => expect(montarResumo(vazio, '2026-10-15').total).toBe(0))
  it('lista cada tipo com datas em dd/MM/yyyy e escapa HTML', () => {
    const r = montarResumo({
      cnh: [{ apelido: 'João <x>', validade: '2026-10-01' }], aso: [{ apelido: 'Maria', data: '2025-09-30' }],
      documentos: [{ veiculo: 'ABC1D23', nome: 'CRLV', validade: '2026-09-30' }], multas: [{ codigo: 'AIT-9', indicarAte: '2026-10-16' }],
    }, '2026-10-15')
    expect(r.total).toBe(4)
    expect(r.linhas).toEqual([
      'CNH vencida: João <x> (validade 01/10/2026)',
      'ASO vencido: Maria (ASO de 30/09/2025)',
      'Documento vencido do veículo ABC1D23: CRLV (validade 30/09/2026)',
      'Multa sem condutor: AIT-9 (indicar até 16/10/2026)',
    ])
    expect(r.html).toContain('João &lt;x&gt;')
    expect(r.html).toContain('<li>CNH vencida')
    expect(r.html).toContain('15/10')
  })
})

describe('limitesDoDia', () => {
  it('início e fim do dia de Brasília em UTC, ASO de 12 meses e multa em 3 dias', () => {
    expect(limitesDoDia(new Date('2026-10-15T10:00:00Z'))).toEqual({
      hoje: '2026-10-15', inicioIso: '2026-10-15T03:00:00Z', fimIso: '2026-10-16T03:00:00Z', limiteAso: '2025-10-15', limiteMulta: '2026-10-18',
    })
  })
})

describe('rodarResumo', () => {
  const montar = (dados: { cnh?: any[]; aso?: any[]; docs?: any[]; multas?: any[]; escalados?: { motoristaIds: string[]; veiculoIds: string[] } } = {}) => {
    const aplicar = vi.fn(async () => {})
    const email = vi.fn(async () => {})
    const dv = {
      listarEscalados: vi.fn(async () => dados.escalados ?? { motoristaIds: ['m1'], veiculoIds: ['v1'] }),
      listarCnhVencida: vi.fn(async () => dados.cnh ?? []), listarAsoVencido: vi.fn(async () => dados.aso ?? []),
      listarDocumentosVencidos: vi.fn(async () => dados.docs ?? []), listarMultasSemCondutor: vi.fn(async () => dados.multas ?? []), aplicar,
    }
    return { dv, aplicar, email, deps: { agora: () => new Date('2026-10-15T10:00:00Z'), dv, notificar: { email }, env: { EMAIL_OPERACAO: 'op@betinhos.com.br', EMAIL_TI: 'ti@betinhos.com.br' }, ligado: true } }
  }
  it('sem itens não envia nem grava', async () => {
    const { deps, email, aplicar } = montar()
    expect(await rodarResumo(deps)).toEqual({ enviado: false, total: 0 })
    expect(email).not.toHaveBeenCalled()
    expect(aplicar).not.toHaveBeenCalled()
  })
  it('só considera quem está escalado hoje', async () => {
    const { deps, email } = montar({
      cnh: [{ id: 'm1', apelido: 'João', validade: '2026-10-01' }, { id: 'm9', apelido: 'Fora', validade: '2026-10-01' }],
      docs: [{ veiculoId: 'v1', veiculo: 'ABC1D23', nome: 'CRLV', validade: '2026-09-30' }, { veiculoId: 'v9', veiculo: 'ZZZ', nome: 'CRLV', validade: '2026-09-30' }],
    })
    const r = await rodarResumo(deps)
    expect(r).toEqual({ enviado: true, total: 2 })
    const html = email.mock.calls[0]![1] as string
    expect(html).toContain('João')
    expect(html).not.toContain('Fora')
    expect(html).not.toContain('ZZZ')
  })
  it('multa sem condutor entra mesmo sem estar escalada; envia um e-mail e grava uma linha de histórico', async () => {
    const { deps, email, aplicar } = montar({ multas: [{ codigo: 'AIT-9', indicarAte: '2026-10-16' }] })
    expect(await rodarResumo(deps)).toEqual({ enviado: true, total: 1 })
    expect(email).toHaveBeenCalledTimes(1)
    expect(email.mock.calls[0]![0]).toBe('[Operação] Pendências de hoje: 1 item')
    expect(aplicar.mock.calls[0]![0][0].corpo).toMatchObject({ cr40f_regra: 100000004, cr40f_chave: 'DocumentosResumo|2026-10-15', cr40f_status: 100000001 })
  })
  it('desligado não consulta nada', async () => {
    const { deps, dv } = montar()
    expect(await rodarResumo({ ...deps, ligado: false })).toEqual({ enviado: false, total: 0 })
    expect(dv.listarEscalados).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL.

- [ ] **Step 3: Implementar**

Em `src/dataverse.ts`, dentro da classe `Dataverse`, acrescente (e exporte os tipos):
```ts
  async listarEscalados(inicioIso: string, fimIso: string) {
    const rows = await this.ler(`${RESERVA_SET}?$select=_cr40f_motorista_value,_cr40f_veiculo_value&$filter=${enc(`statecode eq 0 and (cr40f_status eq 202410001 or cr40f_status eq 202410005 or cr40f_status eq 202410006) and cr40f_dataehorriodesada ge ${inicioIso} and cr40f_dataehorriodesada lt ${fimIso}`)}&$top=150`)
    return { motoristaIds: rows.map((r) => idDe(r._cr40f_motorista_value)).filter(Boolean), veiculoIds: rows.map((r) => idDe(r._cr40f_veiculo_value)).filter(Boolean) }
  }
  async listarCnhVencida(hoje: string) {
    const rows = await this.ler(`cr40f_funcionarioses?$select=cr40f_funcionariosid,new_apelido,cr40f_validadedacnh&$filter=${enc(`statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq 202410000 and cr40f_validadedacnh lt ${hoje}`)}&$top=150`)
    return rows.map((r) => ({ id: idDe(r.cr40f_funcionariosid), apelido: str(r.new_apelido), validade: str(r.cr40f_validadedacnh).slice(0, 10) }))
  }
  async listarAsoVencido(limite: string) {
    const rows = await this.ler(`cr40f_funcionarioses?$select=cr40f_funcionariosid,new_apelido,cr40f_datadoaso&$filter=${enc(`statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq 202410000 and cr40f_datadoaso lt ${limite}`)}&$top=150`)
    return rows.map((r) => ({ id: idDe(r.cr40f_funcionariosid), apelido: str(r.new_apelido), data: str(r.cr40f_datadoaso).slice(0, 10) }))
  }
  async listarDocumentosVencidos(hoje: string) {
    const rows = await this.ler(`cr40f_documentos?$select=cr40f_documentoid,cr40f_name,cr40f_validade,_cr40f_veiculo_value&$filter=${enc(`statecode eq 0 and cr40f_situacao eq 100000000 and _cr40f_veiculo_value ne null and cr40f_validade lt ${hoje}`)}&$top=150`)
    return rows.map((r) => ({ veiculoId: idDe(r._cr40f_veiculo_value), veiculo: str(r['_cr40f_veiculo_value@OData.Community.Display.V1.FormattedValue']), nome: str(r.cr40f_name), validade: str(r.cr40f_validade).slice(0, 10) }))
  }
  async listarMultasSemCondutor(limite: string) {
    const rows = await this.ler(`cr40f_multases?$select=cr40f_multasid,cr40f_id_multa,cr40f_dataparaindicar&$filter=${enc(`statecode eq 0 and cr40f_status eq 202410000 and _cr40f_motorista_value eq null and cr40f_dataparaindicar le ${limite}`)}&$top=150`)
    return rows.map((r) => ({ codigo: str(r.cr40f_id_multa), indicarAte: str(r.cr40f_dataparaindicar).slice(0, 10) }))
  }
```
`src/resumo.ts`:
```ts
import type { Dataverse } from './dataverse.ts'
import { ALERTA_SET } from './dataverse.ts'

export type DadosResumo = {
  cnh: { apelido: string; validade: string }[]
  aso: { apelido: string; data: string }[]
  documentos: { veiculo: string; nome: string; validade: string }[]
  multas: { codigo: string; indicarAte: string }[]
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

export function montarResumo(d: DadosResumo, hojeBr: string) {
  const linhas = [
    ...d.cnh.map((x) => `CNH vencida: ${x.apelido} (validade ${br(x.validade)})`),
    ...d.aso.map((x) => `ASO vencido: ${x.apelido} (ASO de ${br(x.data)})`),
    ...d.documentos.map((x) => `Documento vencido do veículo ${x.veiculo}: ${x.nome} (validade ${br(x.validade)})`),
    ...d.multas.map((x) => `Multa sem condutor: ${x.codigo} (indicar até ${br(x.indicarAte)})`),
  ]
  const html = `<p><b>Pendências da operação para hoje (${hojeBr.slice(8, 10)}/${hojeBr.slice(5, 7)})</b></p><ul>${linhas.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
  return { total: linhas.length, linhas, html }
}

/** Dia de Brasília (UTC−3, sem horário de verão) e os limites de data do resumo. */
export function limitesDoDia(agora: Date) {
  const brasilia = new Date(agora.getTime() - 3 * 3_600_000)
  const hoje = brasilia.toISOString().slice(0, 10)
  const inicio = new Date(`${hoje}T03:00:00Z`)
  const fim = new Date(inicio.getTime() + 24 * 3_600_000)
  const aso = new Date(`${hoje}T00:00:00Z`); aso.setUTCFullYear(aso.getUTCFullYear() - 1)
  const multa = new Date(`${hoje}T00:00:00Z`); multa.setUTCDate(multa.getUTCDate() + 3)
  const s = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')
  return { hoje, inicioIso: s(inicio), fimIso: s(fim), limiteAso: aso.toISOString().slice(0, 10), limiteMulta: multa.toISOString().slice(0, 10) }
}

export type DepsResumo = {
  agora: () => Date
  ligado: boolean
  dv: Pick<Dataverse, 'listarEscalados' | 'listarCnhVencida' | 'listarAsoVencido' | 'listarDocumentosVencidos' | 'listarMultasSemCondutor' | 'aplicar'>
  notificar: { email(assunto: string, html: string, para: string[]): Promise<void> }
  env: { EMAIL_OPERACAO: string; EMAIL_TI: string }
}

export async function rodarResumo(d: DepsResumo): Promise<{ enviado: boolean; total: number }> {
  if (!d.ligado) return { enviado: false, total: 0 }
  const agora = d.agora()
  const l = limitesDoDia(agora)
  const [esc_, cnh, aso, docs, multas] = await Promise.all([
    d.dv.listarEscalados(l.inicioIso, l.fimIso), d.dv.listarCnhVencida(l.hoje), d.dv.listarAsoVencido(l.limiteAso),
    d.dv.listarDocumentosVencidos(l.hoje), d.dv.listarMultasSemCondutor(l.limiteMulta),
  ])
  const motoristas = new Set(esc_.motoristaIds)
  const veiculos = new Set(esc_.veiculoIds)
  const resumo = montarResumo({
    cnh: cnh.filter((x) => motoristas.has(x.id)), aso: aso.filter((x) => motoristas.has(x.id)),
    documentos: docs.filter((x) => veiculos.has(x.veiculoId)), multas,
  }, l.hoje)
  if (!resumo.total) return { enviado: false, total: 0 }
  const para = d.env.EMAIL_OPERACAO.split(/[;,]/).map((x) => x.trim()).filter(Boolean)
  await d.notificar.email(`[Operação] Pendências de hoje: ${resumo.total} ${resumo.total === 1 ? 'item' : 'itens'}`, resumo.html, para)
  await d.dv.aplicar([{
    metodo: 'POST', caminho: ALERTA_SET,
    corpo: {
      cr40f_alertaoperacaonome: 'Resumo diário de documentos e multas', cr40f_regra: 100000004, cr40f_chave: `DocumentosResumo|${l.hoje}`, cr40f_severidade: 100000000,
      cr40f_status: 100000001, cr40f_resolucao: 100000000, cr40f_mensagem: resumo.html, cr40f_envios: 1, cr40f_ultimoenvioem: agora.toISOString().replace(/\.\d{3}Z$/, 'Z'), cr40f_canais: 'email',
    },
  }])
  return { enviado: true, total: resumo.total }
}
```
O resumo menciona só apelido de motorista, placa, nome do documento e código da multa (sem CPF, RG nem telefone).

- [ ] **Step 4: Rodar e ver passar** — `pnpm --filter @betinhos/alertas-worker test && pnpm --filter @betinhos/alertas-worker typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/alertas-worker
git commit -m "Alertas: resumo diário de CNH, ASO, documento do veículo e multa sem condutor no Worker"
```

---

### Task 10: Ponto de entrada, publicação e prova ponta a ponta no DEV

**Files:**
- Create: `apps/alertas-worker/src/index.ts`, `apps/alertas-worker/src/index.test.ts`
- Modify: `docs/superpowers/specs/2026-10-15-alertas-operacao-proativos-design.md` (seção final "Estado em <data>")

**Interfaces:**
- Consumes: Tasks 5 a 9.
- Produces: Worker com `scheduled()`, `POST /executar?tarefa=verificar|resumo` (cabeçalho `x-segredo`) e `GET /saude`.

- [ ] **Step 1: Testes que falham**

`src/index.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Env } from './env.ts'
import worker, { segredoConfere } from './index.ts'

const env = { SEGREDO_EXECUCAO_MANUAL: 'segredo-de-teste', ALERTAS_LIGADO: 'nao' } as Env
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext

describe('segredoConfere', () => {
  it('compara sem aceitar vazio', () => {
    expect(segredoConfere('abc', 'abc')).toBe(true)
    expect(segredoConfere('abc', 'abd')).toBe(false)
    expect(segredoConfere('', '')).toBe(false)
    expect(segredoConfere(null, 'abc')).toBe(false)
  })
})

describe('rotas', () => {
  it('/saude responde sem dados de serviços', async () => {
    const r = await worker.fetch(new Request('https://w/saude'), env, ctx)
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, ligado: false })
  })
  it('/executar sem o segredo é 401', async () => {
    expect((await worker.fetch(new Request('https://w/executar', { method: 'POST' }), env, ctx)).status).toBe(401)
    expect((await worker.fetch(new Request('https://w/executar', { method: 'POST', headers: { 'x-segredo': 'errado' } }), env, ctx)).status).toBe(401)
  })
  it('rota desconhecida é 404', async () => {
    expect((await worker.fetch(new Request('https://w/x'), env, ctx)).status).toBe(404)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL (`./index.ts` ausente).

- [ ] **Step 3: Implementar `src/index.ts`**

```ts
import { Dataverse } from './dataverse.ts'
import type { Env } from './env.ts'
import { listarVeiculos, posicoesRecentes } from './infleet.ts'
import { geocodificar, rotaComTransito } from './google.ts'
import { criarNotificador, registrarFalha } from './notificar.ts'
import { Orcamento } from './orcamento.ts'
import { rotasOsrm } from './osrm.ts'
import { rodarResumo } from './resumo.ts'
import { verificar } from './verificar.ts'

type Tarefa = 'verificar' | 'resumo'
const CRON_RESUMO = '0 10 * * 1-5'
let ultimo: { tarefa: Tarefa; quando: string; estado: string } | null = null

/** Comparação em tempo constante; segredo vazio nunca confere. */
export function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido || !esperado || recebido.length !== esperado.length) return false
  let dif = 0
  for (let i = 0; i < esperado.length; i++) dif |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i)
  return dif === 0
}

export async function executar(env: Env, tarefa: Tarefa, agora = new Date()): Promise<Record<string, unknown>> {
  const orcamento = new Orcamento(tarefa === 'verificar' ? 40 : 30)
  const dv = new Dataverse(orcamento.fetch, env)
  const notificador = criarNotificador(orcamento.fetch, env)
  const ligado = env.ALERTAS_LIGADO === 'sim'
  try {
    const resultado = tarefa === 'resumo'
      ? await rodarResumo({ agora: () => agora, ligado, dv, notificar: notificador, env })
      : await verificar({
          agora: () => agora, ligado, dv, orcamento, notificar: notificador,
          infleet: { listarVeiculos: () => listarVeiculos(orcamento.fetch, env.INFLEET_TOKEN), posicoes: (id, de, ate) => posicoesRecentes(orcamento.fetch, env.INFLEET_TOKEN, id, de, ate) },
          osrm: { rotas: (pares) => rotasOsrm(orcamento.fetch, pares) },
          google: { geocodificar: (t) => geocodificar(orcamento.fetch, env.GOOGLE_MAPS_KEY, t), rota: (o, d) => rotaComTransito(orcamento.fetch, env.GOOGLE_MAPS_KEY, o, d) },
        })
    ultimo = { tarefa, quando: agora.toISOString(), estado: String((resultado as { estado?: string }).estado ?? (resultado as { enviado?: boolean }).enviado ?? 'ok') }
    return { ...resultado, chamadasExternas: orcamento.usado }
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e)
    ultimo = { tarefa, quando: agora.toISOString(), estado: 'erro' }
    // A falha usa um orçamento próprio: o da execução pode ter se esgotado.
    const falha = new Orcamento(6)
    try { await registrarFalha(new Dataverse(falha.fetch, env), criarNotificador(falha.fetch, env), env, mensagem, agora) } catch { /* sem como registrar: o erro vai no retorno */ }
    return { estado: 'erro', erro: mensagem.slice(0, 200) }
  }
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(executar(env, controller.cron === CRON_RESUMO ? 'resumo' : 'verificar'))
  },
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/saude') return Response.json({ ok: true, ligado: env.ALERTAS_LIGADO === 'sim', ultimo })
    if (request.method === 'POST' && url.pathname === '/executar') {
      if (!segredoConfere(request.headers.get('x-segredo'), env.SEGREDO_EXECUCAO_MANUAL)) return new Response('não autorizado', { status: 401 })
      return Response.json(await executar(env, url.searchParams.get('tarefa') === 'resumo' ? 'resumo' : 'verificar'))
    }
    return new Response('não encontrado', { status: 404 })
  },
}
```
O retorno de `/executar` traz só contagens (nenhum dado de serviço).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @betinhos/alertas-worker test && pnpm --filter @betinhos/alertas-worker typecheck && pnpm --filter @betinhos/alertas-operacao test && pnpm --filter @betinhos/alertas-operacao typecheck`
Expected: PASS nos dois pacotes. Rode também `pnpm -r test` para garantir que nada fora do escopo quebrou (a suíte do shell é lenta; se só `GeralPage.test.tsx` falhar por tempo, rode-o isolado e registre).

- [ ] **Step 5: Commit do código**

```bash
git add apps/alertas-worker
git commit -m "Alertas: ponto de entrada do Worker (cron do Verificar e do resumo, POST /executar protegido e GET /saude)"
```

- [ ] **Step 6: Publicação (com o Renan)**

Antes de qualquer `wrangler deploy`, confirme com o Renan (publicar na conta Cloudflare dele é ação externa). Pré-requisitos dele, nesta ordem: `wrangler login`; preencher `EMAIL_REMETENTE`, `EMAIL_OPERACAO` (use só o e-mail do próprio Renan durante os testes) e `EMAIL_TI` em `wrangler.toml` (commitável, sem segredo); definir os secrets com `wrangler secret put` dentro de `apps/alertas-worker` (`INFLEET_TOKEN`, `GOOGLE_MAPS_KEY`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `SEGREDO_EXECUCAO_MANUAL` e, se quiser Teams, `TEAMS_WEBHOOK_URL`); manter `ALERTAS_LIGADO = "nao"` no primeiro deploy. Depois: `pnpm --filter @betinhos/alertas-worker deploy`. Confirme que o Worker apareceu com os dois cron triggers (`wrangler triggers` ou o painel) e que `GET https://<subdomínio>.workers.dev/saude` responde `ligado: false`. Se algum secret faltar, o erro aparece na primeira execução manual e o agente reporta qual nome falta (nunca o valor).

- [ ] **Step 7: Prova ponta a ponta no DEV**

Com `ALERTAS_LIGADO` trocado para `sim` e redeploy (peça ao Renan), e `POST /executar` com o cabeçalho `x-segredo` (o Renan roda o `curl` com o segredo dele e cola só o JSON de contagens):
1. **NaoChegaraATempo, dedupe e encerramento:** com o MCP `infleet` (somente leitura), escolha um veículo ativo e em movimento (`frota_agora`) e anote placa e posição. No DEV, crie por Web API um serviço de teste: `cr40f_status` 202410001, saída em 40 minutos, lookups de motorista e veículo (a placa escolhida), `cr40f_embarquelatitude`/`longitude` de um ponto a cerca de 60 km do veículo, `cr40f_embarqueprecisao` 100000000, `cr40f_endereodesada` `TESTE ALERTA - não é serviço real`. No próximo cron (até 5 minutos) ou em `POST /executar`, esperado: um `cr40f_alertaoperacao` Aberto com chave `NaoChegaraATempo|<id>` e o e-mail na caixa do Renan. Confirme o **dedupe**: nos 25 minutos seguintes nenhum aviso repetido (`cr40f_envios` continua 1); aos 30 minutos chega um único lembrete (`cr40f_envios` 2); depois nada. **Encerre:** mova o embarque para onde o veículo está agora; no ciclo seguinte o alerta fica Resolvido (`cr40f_resolucao` 100000000).
2. **JaAtrasado:** serviço de teste com saída 15 minutos atrás e embarque longe: alerta alto.
3. **MotoristaParado:** use um veículo parado há mais de 10 minutos (`frota_agora` e `trajeto`), saída em 60 minutos, embarque a mais de 500 m: alerta médio.
4. **SemMotorista:** serviço de teste sem motorista, saída em 90 minutos: médio; a 50 minutos sobe para alto e é reenviado.
5. **Geocoding:** serviço de teste sem coordenada e com texto de local real: o Worker grava coordenada e precisão no serviço.
6. **Resumo diário:** `POST /executar?tarefa=resumo`. Para forçar um item, crie funcionário ou documento de teste vencido ligado ao serviço de teste de hoje e apague depois. Sem itens, não envia nada.
7. **Falha do agente:** peça ao Renan para trocar por cerca de 10 minutos o secret `INFLEET_TOKEN` por um texto inválido e rodar uma execução. Confirme um único e-mail de falha ao TI naquela hora e a linha `FalhaDoAgente`. Peça a ele para restaurar o valor correto. Você nunca lê nem grava o token.
8. **CPU e chamadas externas:** o Renan lê, no painel do Worker (Observability), o tempo de CPU por execução e o número de execuções com erro `Exceeded CPU`. Meta: abaixo de 10 ms no p99. O JSON do `/executar` mostra `chamadasExternas` (meta: 40 ou menos). Se a CPU estourar, pare e reporte: a saída é o plano pago (US$ 5 por mês) ou a Azure.

- [ ] **Step 8: Limpeza, ativação e estado**

Apague os serviços de teste e os alertas gerados (alertas primeiro, depois serviços). Volte `EMAIL_OPERACAO` para os destinatários reais, com o Renan. Deixe `ALERTAS_LIGADO = "sim"` só se o Renan pedir. Registre na spec a seção `## Estado em <data>`: o que foi provado, a taxa de geocoding da Task 6, CPU e chamadas externas observadas, o custo do Google medido por 7 dias (relatório do Google Cloud, a cargo do Renan) e as pendências (Teams e push, papel de segurança, Fase 0 e Fase 3).
```bash
git add docs/superpowers/specs/2026-10-15-alertas-operacao-proativos-design.md
git commit -m "Alertas: provas no DEV das sete regras, do dedupe e do encerramento, e estado registrado na spec"
```

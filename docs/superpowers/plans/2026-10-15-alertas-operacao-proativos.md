# Alertas proativos de operação — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um agente proativo que avisa a operação, por e-mail, Teams e notificação do Power Apps, quando um motorista está atrasado ou não vai chegar ao embarque a tempo (com trânsito), e também em casos de serviço sem motorista e de documentos e multas pendentes.

**Architecture:** Três flows de Power Automate na solução AppBetinhos. O avaliador (gatilho HTTP) é puro: recebe serviços já enriquecidos e devolve quais precisam do Google, as ações de aviso e os alertas a encerrar. O verificador (a cada 5 min) coleta Infleet, rota OSRM e Google, chama o avaliador e executa as ações. O resumo diário cuida de documentos e multas. As regras vivem em um pacote TS de referência com vetores de teste, e um script de conformidade confere o flow contra esses vetores.

**Tech Stack:** pnpm workspace, TypeScript, vitest, Power Automate (Logic Apps JSON provisionado por PowerShell 5.1 via Web API do Dataverse), Infleet GraphQL, OSRM público, Google Routes API e Geocoding API.

**Spec:** `docs/superpowers/specs/2026-10-15-alertas-operacao-proativos-design.md`

## Global Constraints

- Ambiente: somente DEV `https://org23b93544.crm2.dynamics.com` (OrganizationId `7e5f59f4-efce-f011-89f6-000d3ac0a3e1`), solução `AppBetinhos`. Nenhuma escrita em PROD. Consultas em PROD só de leitura (`Dataverse_PROD`), apenas nas Tasks 6 e 10 (contagens e endereços, sem alterar nada).
- Segredos: o repositório é público. Só nomes de variáveis de ambiente, nunca valores. Os valores de `new_InfleetToken` e `cr40f_GoogleMapsChave` são preenchidos pelo Renan no maker portal. Nenhum agente lê, copia ou imprime `.env` ou esses valores. Se um valor estiver ausente, o script falha com mensagem clara.
- A mensagem de alerta nunca contém telefone nem nome de passageiro. O texto enviado ao Google nunca contém nome de passageiro.
- Regras só avisam pessoas: nenhuma escrita em registros de negócio além de `cr40f_alertaoperacao` e das colunas de coordenada em `cr40f_reservadeveculos`.
- Constantes (verbatim da spec): margem 10 min; fator de trânsito 2,0; janela de 60 min antes a 180 min depois da saída; posição velha acima de 10 min; parado = até 3 km/h por 10 min; chegou = a até 150 m; sem motorista = a até 120 min da saída; atrasado = até 60 min após a saída; lembrete após 30 min; Google sempre nos últimos 30 min; parado só a mais de 500 m do embarque e a até 90 min da saída.
- Status do serviço (`cr40f_reservadeveculos.cr40f_status`): Confirmado 202410001, Programado 202410005, Em Execução 202410006. Sem motorista só vale para Confirmado e Programado.
- Logic Apps não tem trigonometria nem raiz quadrada: a lógica usa só comparações e aritmética simples. Ticks: 1 min = 600.000.000 ticks.
- Textos em pt-BR com acentuação correta (UTF-8). Scripts PowerShell salvos em UTF-8 com BOM.
- Commits em português, detalhados, terminados com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (a atribuição desta sessão). Quem executar com outro modelo usa a linha de atribuição da própria sessão.
- Os scripts de flow dos Assistentes (`packages/deploy/provision-flow-agentes-executar.ps1`, `provision-agentes-schema.ps1`) existem só na branch `claude/compassionate-dubinsky-c4d8f9`. Para copiar as funções auxiliares (`Dv`, `AssertSemMojibake`, `Backup`, `Apply`, `FlowRows`, `Include`, `-Restaurar`, `-SomenteValidar`, leitura de volta), use `git show claude/compassionate-dubinsky-c4d8f9:packages/deploy/<arquivo>`; não faça checkout dessa branch.
- Esta branch não altera o shell React. Não há versão de build do shell a publicar nesta entrega.
- Nada neste plano altera o WebResource `new_formulario_geral.html` (formulário ativo no model-driven e aberto pelo shell) nem a pasta `Tela Formulário Geral`. A mudança do campo de endereço é a Fase 0, fora deste plano, e vale só para uma cópia do formulário dentro do Sistema Betinhos. Aqui só se escrevem coordenadas em colunas novas de `cr40f_reservadeveculos`, pelo flow.

## Estrutura de arquivos

```
packages/alertas-operacao/
  package.json, tsconfig.json
  src/tipos.ts            Entrada, Saida, Alerta, Acao, Aberto, EntradaServico, Regra
  src/constantes.ts       CONSTANTES (limites) e constantesDoFlow()
  src/avaliar.ts          avaliar(entrada) -> Saida (regras, dedupe, encerramento)
  src/fixtures.ts         construtores servico()/entrada() usados por testes e vetores
  src/vetores.ts          VETORES: casos nomeados para teste e conformidade
  src/avaliar.test.ts
  scripts/gerar-artefatos.ts   escreve dist/constantes.json e dist/vetores.json
packages/deploy/
  provision-alertas-schema.ps1          tabela, colunas, variáveis de ambiente
  provision-flow-alertas-avaliar.ps1    flow HTTP avaliador
  conformidade-alertas.ps1              posta os vetores no avaliador e compara
  provision-flow-alertas-verificar.ps1  flow recorrente
  provision-flow-alertas-resumo.ps1     flow diário
  medir-geocoding-alertas.ps1           medição com endereços do PROD (leitura)
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
    "typecheck": "tsc -p tsconfig.json",
    "artefatos": "node scripts/gerar-artefatos.ts"
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
  "include": ["src", "scripts"]
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

export function constantesDoFlow() {
  return { ...CONSTANTES, status: STATUS }
}
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
import { CONSTANTES, constantesDoFlow } from './constantes.ts'
import { AGORA, entrada, mais, servico } from './fixtures.ts'
import { STATUS } from './constantes.ts'

const alertasDe = (s: Parameters<typeof servico>[0]) => avaliar(entrada([servico(s)]))

describe('constantes', () => {
  it('têm os valores da spec e nenhum @ nas constantes do flow', () => {
    expect(CONSTANTES.margemMin).toBe(10)
    expect(CONSTANTES.fatorTransito).toBe(2)
    expect(CONSTANTES.chegouMetros).toBe(150)
    expect(JSON.stringify(constantesDoFlow())).not.toContain('@')
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

/** Decisão pura: sem chamadas externas. O flow "Alertas | Avaliar" replica esta lógica; os vetores em vetores.ts garantem a equivalência. */
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
export { CONSTANTES, STATUS, STATUS_ATIVOS, STATUS_SEM_MOTORISTA, constantesDoFlow, type Constantes } from './constantes.ts'
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

### Task 2: Vetores de teste e artefatos para o flow

**Files:**
- Create: `packages/alertas-operacao/src/vetores.ts`, `packages/alertas-operacao/scripts/gerar-artefatos.ts`
- Modify: `packages/alertas-operacao/src/index.ts`, `packages/alertas-operacao/src/avaliar.test.ts`, `.gitignore` (raiz)

**Interfaces:**
- Produces: `VETORES: { nome: string; entrada: Entrada }[]`; comando `pnpm --filter @betinhos/alertas-operacao artefatos` que escreve `packages/alertas-operacao/dist/constantes.json` (objeto de `constantesDoFlow()`) e `dist/vetores.json` (`[{ nome, entrada, esperado }]`, com `esperado = avaliar(entrada)`). A Task 4 e a conformidade da Task 5 consomem os dois arquivos.

- [ ] **Step 1: Teste que falha**

Acrescente em `avaliar.test.ts`:
```ts
import { VETORES } from './vetores.ts'

describe('vetores de conformidade', () => {
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
`scripts/gerar-artefatos.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { avaliar } from '../src/avaliar.ts'
import { constantesDoFlow } from '../src/constantes.ts'
import { VETORES } from '../src/vetores.ts'

mkdirSync(new URL('../dist/', import.meta.url), { recursive: true })
writeFileSync(new URL('../dist/constantes.json', import.meta.url), JSON.stringify(constantesDoFlow(), null, 2), 'utf8')
writeFileSync(new URL('../dist/vetores.json', import.meta.url), JSON.stringify(VETORES.map((v) => ({ nome: v.nome, entrada: v.entrada, esperado: avaliar(v.entrada) })), null, 2), 'utf8')
console.log(`dist/constantes.json e dist/vetores.json gerados (${VETORES.length} vetores)`)
```
Em `index.ts` acrescente `export { VETORES } from './vetores.ts'`. Confira `.gitignore`: se `dist/` já estiver coberto (regra `dist/` na raiz), nada a fazer.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @betinhos/alertas-operacao test && pnpm --filter @betinhos/alertas-operacao typecheck && pnpm --filter @betinhos/alertas-operacao artefatos`
Expected: PASS; imprime `... gerados (31 vetores)`; `git status` não mostra `dist/`.

- [ ] **Step 5: Commit**

```bash
git add packages/alertas-operacao
git commit -m "Alertas: vetores de conformidade e geração dos artefatos JSON para os flows"
```

---

### Task 3: Schema no DEV (tabela de alertas, colunas de coordenada, variáveis de ambiente)

**Files:**
- Create: `packages/deploy/provision-alertas-schema.ps1`
- Reference: `git show claude/compassionate-dubinsky-c4d8f9:packages/deploy/provision-agentes-schema.ps1` (copie o prólogo e as funções `Dv`, `Label`, `Base`, `Opcoes`, `Choice`, `Texto`, `Memo`, `Inteiro`, `DataHora`, `Tabela`, `Coluna`, `Lookup`)

**Interfaces:**
- Produces no DEV: tabela `cr40f_alertaoperacao` com as colunas da spec, publicada e na AppBetinhos; colunas `cr40f_embarquelatitude`, `cr40f_embarquelongitude`, `cr40f_embarqueprecisao`, `cr40f_embarquetexto`, `cr40f_embarquegeocodificadoem` em `cr40f_reservadeveculos`; as 10 variáveis de ambiente (só definição, sem valor) na solução. O script imprime o `EntitySetName` real da tabela de alertas. Tasks 7 e 8 usam esse nome.

- [ ] **Step 1: Escrever o script**

Mesmo prólogo do script de agentes (DEV only, `az` token, WhoAmI com OrganizationId, `MSCRM.SolutionUniqueName = AppBetinhos`, `Dv`). Acrescente a função de decimal e as listas abaixo.

```powershell
function Decimal([string] $schema, [string] $nome) {
  $a = Base 'DecimalAttributeMetadata' $schema $nome
  $a.Precision = 7; $a.MinValue = -180; $a.MaxValue = 180
  $a
}

$exec = 'cr40f_alertaoperacao'
Tabela $exec 'Alerta de operação' 'Alertas de operação' 'Aviso proativo gerado pelo agente de operação, com controle de envio e encerramento.'
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
)) { Coluna $exec $c }
Lookup 'cr40f_reservadeveculos_alertaoperacao_reserva' $exec 'cr40f_reservadeveculos' 'cr40f_Reserva' 'Serviço'

$res = 'cr40f_reservadeveculos'
foreach ($c in @(
  (Decimal 'cr40f_EmbarqueLatitude' 'Embarque: latitude'),
  (Decimal 'cr40f_EmbarqueLongitude' 'Embarque: longitude'),
  (Choice 'cr40f_EmbarquePrecisao' 'Embarque: precisão' @('Informado', 'Geocodificado', 'Aproximado', 'Indisponível')),
  (Texto 'cr40f_EmbarqueTexto' 'Embarque: texto geocodificado' 500),
  (DataHora 'cr40f_EmbarqueGeocodificadoEm' 'Embarque: geocodificado em')
)) { Coluna $res $c }

Dv POST PublishXml @{ ParameterXml = "<importexportxml><entities><entity>$exec</entity><entity>$res</entity></entities></importexportxml>" } | Out-Null

# Variáveis de ambiente: só a definição (String, sem valor padrão). Os valores são do Renan.
$variaveis = [ordered]@{
  'new_InfleetToken'               = 'Token da API do Infleet (somente leitura de posição).'
  'cr40f_GoogleMapsChave'          = 'Chave do Google Maps Platform restrita às APIs Routes e Geocoding.'
  'cr40f_AlertasLigado'            = 'Chave geral dos alertas: sim ou não.'
  'cr40f_AlertasCanais'            = 'Canais ligados, separados por vírgula: email,teams,push.'
  'cr40f_AlertasEmailOperacao'     = 'E-mail(s) da operação que recebem os alertas, separados por ponto e vírgula.'
  'cr40f_AlertasEmailTI'           = 'E-mail do TI que recebe falhas do agente.'
  'cr40f_AlertasTeamsEquipeId'     = 'Id da equipe do Teams que recebe os alertas.'
  'cr40f_AlertasTeamsCanalId'      = 'Id do canal do Teams que recebe os alertas.'
  'cr40f_AlertasPushDestinatarios' = 'E-mails dos destinatários da notificação push, separados por ponto e vírgula.'
  'cr40f_FlowUrlAlertasAvaliar'    = 'URL do flow Alertas | Avaliar (preenchida pelo script do avaliador).'
}
foreach ($nome in $variaveis.Keys) {
  $def = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$nome'").value)
  if (-not $def.Count) {
    Dv POST environmentvariabledefinitions @{ schemaname = $nome; displayname = $nome; type = 100000000; description = $variaveis[$nome] } | Out-Null
    $def = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$nome'").value)
  }
  if ($def.Count -ne 1) { throw "Variável $nome ausente ou duplicada." }
  # Valor padrão iria no export da solução: recusa.
  if (@((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$nome' and defaultvalue ne null").value).Count) { throw "A variável $nome tem valor padrão; remova." }
  $id = $def[0].environmentvariabledefinitionid
  $filtro = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq 380 and objectid eq $id"
  if (-not @((Dv GET $filtro).value).Count) { Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = 380; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null }
}

# Conferência por leitura de volta.
$set = (Dv GET "EntityDefinitions(LogicalName='$exec')?`$select=EntitySetName").EntitySetName
Write-Output "EntitySetName de ${exec}: $set"
foreach ($col in 'cr40f_regra', 'cr40f_chave', 'cr40f_severidade', 'cr40f_status', 'cr40f_resolucao', 'cr40f_mensagem', 'cr40f_envios', 'cr40f_ultimoenvioem', 'cr40f_resolvidoem', 'cr40f_canais', 'cr40f_reserva') { Dv GET "EntityDefinitions(LogicalName='$exec')/Attributes(LogicalName='$col')?`$select=LogicalName" | Out-Null }
foreach ($col in 'cr40f_embarquelatitude', 'cr40f_embarquelongitude', 'cr40f_embarqueprecisao', 'cr40f_embarquetexto', 'cr40f_embarquegeocodificadoem') { Dv GET "EntityDefinitions(LogicalName='$res')/Attributes(LogicalName='$col')?`$select=LogicalName" | Out-Null }
$regra = Dv GET "EntityDefinitions(LogicalName='$exec')/Attributes(LogicalName='cr40f_regra')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)"
if (@($regra.OptionSet.Options).Count -ne 6) { throw 'cr40f_regra deveria ter 6 opções.' }
Write-Output "DEV: $exec, colunas de embarque em $res e $($variaveis.Count) variáveis de ambiente criadas e conferidas na $solutionName."
```
`$solutionId` vem da consulta da solução, como no script de flow dos Assistentes (`solutions?$filter=uniquename eq 'AppBetinhos'`); inclua essa consulta no prólogo. Salve o arquivo em UTF-8 com BOM.

- [ ] **Step 2: Rodar no DEV e repetir**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-alertas-schema.ps1` (duas vezes).
Expected: a primeira cria; a segunda só mostra "já existe" e termina com a mesma linha final. Anote o `EntitySetName` impresso (esperado `cr40f_alertaoperacaos`); se for outro, use o real nas Tasks 7 e 8.

- [ ] **Step 3: Conferir pelo MCP**

`describe('tables/cr40f_alertaoperacao')` mostra o lookup `cr40f_reserva`; `describe('tables/cr40f_reservadeveculos')` mostra as 5 colunas de embarque.

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/provision-alertas-schema.ps1
git commit -m "Alertas: schema no DEV (tabela de alertas, colunas de coordenada do embarque e variáveis de ambiente)"
```

---

### Task 4: Flow "Alertas | Avaliar" (avaliador puro, gatilho HTTP)

**Files:**
- Create: `packages/deploy/provision-flow-alertas-avaliar.ps1`
- Reference: `git show claude/compassionate-dubinsky-c4d8f9:packages/deploy/provision-flow-agentes-agendado.ps1` (prólogo, `Backup`, `Apply`, `FlowRows`, `Include`, `-Restaurar`, `-SomenteValidar`, criação, ativação e leitura de volta; este flow não tem variável secreta)

**Interfaces:**
- Consumes: `packages/alertas-operacao/dist/constantes.json` (Task 2).
- Produces: flow ativo com gatilho `When_an_HTTP_request_is_received` (POST). Entrada e saída exatamente como `Entrada` e `Saida` de `packages/alertas-operacao/src/tipos.ts`. O script grava a URL do gatilho (com assinatura) em `cr40f_FlowUrlAlertasAvaliar` sem imprimi-la. A Task 5 e a Task 7 leem a URL dessa variável.

**Regras de expressão do Logic Apps usadas aqui:** `ticks()` aceita ISO em UTC; 1 min = 600.000.000 ticks; `formatNumber(x, '0', 'en-US')` arredonda para inteiro; `formatNumber(x, '0.0', 'pt-BR')` dá vírgula decimal; `convertTimeZone(ts, 'UTC', 'E. South America Standard Time', 'HH:mm')` dá a hora de Brasília; `union()` de arrays de objetos junta sem repetir; `contains(array, valor)` serve para arrays de texto e de números. Os minutos do Google chegam inteiros (o verificador arredonda para cima).

- [ ] **Step 1: Definição do flow**

No script, `$definitionText` é o JSON abaixo, com os marcadores `__X__` trocados pelas constantes (números) de `dist/constantes.json`: `__MARGEM__` margemMin, `__FATOR__` fatorTransito, `__POSVELHA__` posicaoVelhaMin, `__PARADO_MIN__` paradoMin, `__PARADO_VEL__` paradoVelKmh, `__PARADO_LONGE__` paradoLongeMetros, `__PARADO_JANELA__` paradoJanelaMin, `__CHEGOU__` chegouMetros, `__SEMMOT__` semMotoristaMin, `__ATRASADO__` atrasadoAteMin, `__LEMBRETE__` lembreteMin, `__FORCAR__` forcarGoogleMin. Depois de `ConvertFrom-Json`, o script falha se sobrar algum `__[A-Z_]+__`.

```json
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": { "$authentication": { "defaultValue": {}, "type": "SecureObject" }, "$connections": { "defaultValue": {}, "type": "Object" } },
  "triggers": { "When_an_HTTP_request_is_received": { "type": "Request", "kind": "Http", "inputs": { "method": "POST", "schema": {} } } },
  "actions": {
    "Agora": { "type": "Compose", "runAfter": {}, "inputs": "@triggerBody()?['agora']" },
    "Completa": { "type": "Compose", "runAfter": { "Agora": ["Succeeded"] }, "inputs": "@equals(triggerBody()?['regras'], null)" },
    "Regras_pedidas": { "type": "Compose", "runAfter": { "Completa": ["Succeeded"] }, "inputs": "@coalesce(triggerBody()?['regras'], createArray('NaoChegaraATempo', 'JaAtrasado', 'MotoristaParado', 'SemMotorista'))" },
    "Iniciar_acoes": { "type": "InitializeVariable", "runAfter": { "Regras_pedidas": ["Succeeded"] }, "inputs": { "variables": [ { "name": "Acoes_lista", "type": "array", "value": [] } ] } },
    "Base": {
      "type": "Select", "runAfter": { "Iniciar_acoes": ["Succeeded"] },
      "inputs": {
        "from": "@coalesce(triggerBody()?['servicos'], createArray())",
        "select": {
          "id": "@item()?['id']",
          "codigo": "@item()?['codigo']",
          "status": "@item()?['status']",
          "saida": "@item()?['saida']",
          "motoristaId": "@item()?['motoristaId']",
          "motoristaNome": "@item()?['motoristaNome']",
          "placa": "@item()?['placa']",
          "cliente": "@item()?['cliente']",
          "aproximado": "@equals(item()?['embarqueAproximado'], true)",
          "min": "@div(float(sub(ticks(item()?['saida']), ticks(outputs('Agora')))), 600000000)",
          "rastreado": "@and(not(equals(item()?['posicao'], null)), not(equals(item()?['rotaOsrm'], null)))",
          "fixMin": "@if(equals(item()?['posicao'], null), 999999, div(float(sub(ticks(outputs('Agora')), ticks(item()?['posicao']?['fixTime']))), 600000000))",
          "vel": "@if(equals(item()?['posicao'], null), 0, item()?['posicao']?['velocidadeKmh'])",
          "osrmMin": "@if(equals(item()?['rotaOsrm'], null), 0, item()?['rotaOsrm']?['minutos'])",
          "osrmM": "@if(equals(item()?['rotaOsrm'], null), 0, item()?['rotaOsrm']?['metros'])",
          "temGoogle": "@not(equals(item()?['rotaGoogle'], null))",
          "googleMin": "@if(equals(item()?['rotaGoogle'], null), 0, item()?['rotaGoogle']?['minutos'])",
          "paradoMin": "@coalesce(item()?['paradoMin'], 0)"
        }
      }
    },
    "Ids_janela": { "type": "Select", "runAfter": { "Base": ["Succeeded"] }, "inputs": { "from": "@body('Base')", "select": "@item()?['id']" } },
    "Elegiveis": {
      "type": "Query", "runAfter": { "Ids_janela": ["Succeeded"] },
      "inputs": { "from": "@body('Base')", "where": "@and(item()?['rastreado'], lessOrEquals(item()?['fixMin'], __POSVELHA__), greater(item()?['osrmM'], __CHEGOU__))" }
    },
    "F_sem_motorista": {
      "type": "Query", "runAfter": { "Elegiveis": ["Succeeded"] },
      "inputs": { "from": "@body('Base')", "where": "@and(equals(item()?['motoristaId'], null), contains(createArray(202410001, 202410005), item()?['status']), greaterOrEquals(item()?['min'], 0), lessOrEquals(item()?['min'], __SEMMOT__))" }
    },
    "A_sem_motorista": {
      "type": "Select", "runAfter": { "F_sem_motorista": ["Succeeded"] },
      "inputs": {
        "from": "@body('F_sem_motorista')",
        "select": {
          "chave": "@concat('SemMotorista|', item()?['id'])", "regra": "SemMotorista", "reservaId": "@item()?['id']",
          "severidade": "@if(lessOrEquals(item()?['min'], 60), 'alta', 'media')",
          "titulo": "@concat('Sem motorista: OS ', item()?['codigo'], ' às ', convertTimeZone(item()?['saida'], 'UTC', 'E. South America Standard Time', 'HH:mm'))",
          "mensagem": "@concat('Cliente ', item()?['cliente'], '. Saída em ', formatNumber(item()?['min'], '0', 'en-US'), ' min e o serviço está sem motorista.')"
        }
      }
    },
    "F_atrasado": {
      "type": "Query", "runAfter": { "A_sem_motorista": ["Succeeded"] },
      "inputs": { "from": "@body('Elegiveis')", "where": "@and(less(item()?['min'], 0), greaterOrEquals(item()?['min'], sub(0, __ATRASADO__)))" }
    },
    "A_atrasado": {
      "type": "Select", "runAfter": { "F_atrasado": ["Succeeded"] },
      "inputs": {
        "from": "@body('F_atrasado')",
        "select": {
          "chave": "@concat('JaAtrasado|', item()?['id'])", "regra": "JaAtrasado", "reservaId": "@item()?['id']", "severidade": "alta",
          "titulo": "@concat('Atraso: OS ', item()?['codigo'], ' saiu às ', convertTimeZone(item()?['saida'], 'UTC', 'E. South America Standard Time', 'HH:mm'))",
          "mensagem": "@concat('Motorista ', item()?['motoristaNome'], ', placa ', item()?['placa'], ', cliente ', item()?['cliente'], '. Passaram ', formatNumber(sub(0, item()?['min']), '0', 'en-US'), ' min da saída e o veículo ainda está a ', formatNumber(div(float(item()?['osrmM']), 1000), '0.0', 'pt-BR'), ' km do embarque.')"
        }
      }
    },
    "F_precisa_google": {
      "type": "Query", "runAfter": { "A_atrasado": ["Succeeded"] },
      "inputs": { "from": "@body('Elegiveis')", "where": "@and(greaterOrEquals(item()?['min'], 0), not(item()?['temGoogle']), or(greater(mul(item()?['osrmMin'], __FATOR__), sub(item()?['min'], __MARGEM__)), lessOrEquals(item()?['min'], __FORCAR__)))" }
    },
    "Aguardando_google": { "type": "Select", "runAfter": { "F_precisa_google": ["Succeeded"] }, "inputs": { "from": "@body('F_precisa_google')", "select": "@item()?['id']" } },
    "Precisa_google": { "type": "Compose", "runAfter": { "Aguardando_google": ["Succeeded"] }, "inputs": "@if(contains(outputs('Regras_pedidas'), 'NaoChegaraATempo'), body('Aguardando_google'), createArray())" },
    "F_nao_chegara": {
      "type": "Query", "runAfter": { "Precisa_google": ["Succeeded"] },
      "inputs": { "from": "@body('Elegiveis')", "where": "@and(greaterOrEquals(item()?['min'], 0), item()?['temGoogle'], greater(item()?['googleMin'], sub(item()?['min'], __MARGEM__)))" }
    },
    "A_nao_chegara": {
      "type": "Select", "runAfter": { "F_nao_chegara": ["Succeeded"] },
      "inputs": {
        "from": "@body('F_nao_chegara')",
        "select": {
          "chave": "@concat('NaoChegaraATempo|', item()?['id'])", "regra": "NaoChegaraATempo", "reservaId": "@item()?['id']",
          "severidade": "@if(greater(item()?['googleMin'], item()?['min']), 'alta', 'media')",
          "titulo": "@concat('Risco de atraso: OS ', item()?['codigo'], ' às ', convertTimeZone(item()?['saida'], 'UTC', 'E. South America Standard Time', 'HH:mm'))",
          "mensagem": "@concat('Motorista ', item()?['motoristaNome'], ', placa ', item()?['placa'], ', cliente ', item()?['cliente'], '. Chegada prevista com trânsito às ', convertTimeZone(addToTime(outputs('Agora'), int(item()?['googleMin']), 'Minute'), 'UTC', 'E. South America Standard Time', 'HH:mm'), ', ', if(greater(item()?['googleMin'], item()?['min']), concat(formatNumber(sub(item()?['googleMin'], item()?['min']), '0', 'en-US'), ' min depois da saída'), concat(formatNumber(sub(item()?['min'], item()?['googleMin']), '0', 'en-US'), ' min antes da saída, abaixo da margem de __MARGEM__ min')), '.', if(item()?['aproximado'], ' Local aproximado.', ''))"
        }
      }
    },
    "F_parado": {
      "type": "Query", "runAfter": { "A_nao_chegara": ["Succeeded"] },
      "inputs": { "from": "@body('Elegiveis')", "where": "@and(greaterOrEquals(item()?['min'], 0), lessOrEquals(item()?['min'], __PARADO_JANELA__), greaterOrEquals(item()?['paradoMin'], __PARADO_MIN__), lessOrEquals(item()?['vel'], __PARADO_VEL__), greater(item()?['osrmM'], __PARADO_LONGE__))" }
    },
    "A_parado": {
      "type": "Select", "runAfter": { "F_parado": ["Succeeded"] },
      "inputs": {
        "from": "@body('F_parado')",
        "select": {
          "chave": "@concat('MotoristaParado|', item()?['id'])", "regra": "MotoristaParado", "reservaId": "@item()?['id']",
          "severidade": "@if(lessOrEquals(item()?['min'], 30), 'alta', 'media')",
          "titulo": "@concat('Motorista parado: OS ', item()?['codigo'], ' às ', convertTimeZone(item()?['saida'], 'UTC', 'E. South America Standard Time', 'HH:mm'))",
          "mensagem": "@concat('Motorista ', item()?['motoristaNome'], ', placa ', item()?['placa'], ', cliente ', item()?['cliente'], '. Parado há ', formatNumber(item()?['paradoMin'], '0', 'en-US'), ' min, a ', formatNumber(div(float(item()?['osrmM']), 1000), '0.0', 'pt-BR'), ' km do embarque, saída em ', formatNumber(item()?['min'], '0', 'en-US'), ' min.')"
        }
      }
    },
    "Alertas": {
      "type": "Compose", "runAfter": { "A_parado": ["Succeeded"] },
      "inputs": "@union(if(contains(outputs('Regras_pedidas'), 'SemMotorista'), body('A_sem_motorista'), createArray()), if(contains(outputs('Regras_pedidas'), 'JaAtrasado'), body('A_atrasado'), createArray()), if(contains(outputs('Regras_pedidas'), 'NaoChegaraATempo'), body('A_nao_chegara'), createArray()), if(contains(outputs('Regras_pedidas'), 'MotoristaParado'), body('A_parado'), createArray()))"
    },
    "Chaves_atuais": { "type": "Select", "runAfter": { "Alertas": ["Succeeded"] }, "inputs": { "from": "@outputs('Alertas')", "select": "@item()?['chave']" } },
    "Cada_alerta": {
      "type": "Foreach", "runAfter": { "Chaves_atuais": ["Succeeded"] }, "foreach": "@outputs('Alertas')",
      "runtimeConfiguration": { "concurrency": { "repetitions": 1 } },
      "actions": {
        "Aberto_da_chave": { "type": "Query", "runAfter": {}, "inputs": { "from": "@coalesce(triggerBody()?['abertos'], createArray())", "where": "@equals(item()?['chave'], items('Cada_alerta')?['chave'])" } },
        "Decisao": {
          "type": "Compose", "runAfter": { "Aberto_da_chave": ["Succeeded"] },
          "inputs": "@if(empty(body('Aberto_da_chave')), 'criar', if(greater(if(equals(items('Cada_alerta')?['severidade'], 'alta'), 2, 1), if(equals(first(body('Aberto_da_chave'))?['severidade'], 'alta'), 2, 1)), 'reenviar', if(and(equals(first(body('Aberto_da_chave'))?['envios'], 1), greaterOrEquals(div(float(sub(ticks(outputs('Agora')), ticks(first(body('Aberto_da_chave'))?['ultimoEnvioEm']))), 600000000), __LEMBRETE__)), 'lembrar', 'nada')))"
        },
        "Registrar_acao": {
          "type": "If", "runAfter": { "Decisao": ["Succeeded"] },
          "expression": { "and": [ { "not": { "equals": [ "@outputs('Decisao')", "nada" ] } } ] },
          "actions": { "Acrescentar_acao": { "type": "AppendToArrayVariable", "runAfter": {}, "inputs": { "name": "Acoes_lista", "value": { "acao": "@outputs('Decisao')", "alerta": "@items('Cada_alerta')" } } } },
          "else": { "actions": {} }
        }
      }
    },
    "Filtro_resolver": {
      "type": "Query", "runAfter": { "Cada_alerta": ["Succeeded"] },
      "inputs": {
        "from": "@coalesce(triggerBody()?['abertos'], createArray())",
        "where": "@and(contains(outputs('Regras_pedidas'), first(split(item()?['chave'], '|'))), if(contains(body('Ids_janela'), item()?['reservaId']), and(not(and(outputs('Completa'), equals(first(split(item()?['chave'], '|')), 'NaoChegaraATempo'), contains(body('Aguardando_google'), item()?['reservaId']))), not(contains(body('Chaves_atuais'), item()?['chave']))), outputs('Completa')))"
      }
    },
    "Resolver": { "type": "Select", "runAfter": { "Filtro_resolver": ["Succeeded"] }, "inputs": { "from": "@body('Filtro_resolver')", "select": "@item()?['chave']" } },
    "Resposta": {
      "type": "Response", "runAfter": { "Resolver": ["Succeeded"] },
      "inputs": { "statusCode": 200, "headers": { "Content-Type": "application/json" }, "body": { "precisaGoogle": "@outputs('Precisa_google')", "acoes": "@variables('Acoes_lista')", "resolver": "@body('Resolver')" } }
    }
  },
  "outputs": {}
}
```

- [ ] **Step 2: Script de provisionamento**

Prólogo e helpers copiados do script de referência (backup com recusa de `sig=`, `Apply` com reativação em `finally`, `FlowRows`, `Include`). Partes próprias:

```powershell
$flowName = 'Flow Alertas | Avaliar'
$constantesPath = Join-Path $PSScriptRoot '../alertas-operacao/dist/constantes.json'
if (-not (Test-Path $constantesPath)) { throw 'constantes.json ausente: rode pnpm --filter @betinhos/alertas-operacao artefatos.' }
$c = ([IO.File]::ReadAllText((Resolve-Path $constantesPath), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)) | ConvertFrom-Json
$troca = @{ '__MARGEM__' = $c.margemMin; '__FATOR__' = $c.fatorTransito; '__POSVELHA__' = $c.posicaoVelhaMin; '__PARADO_MIN__' = $c.paradoMin; '__PARADO_VEL__' = $c.paradoVelKmh; '__PARADO_LONGE__' = $c.paradoLongeMetros; '__PARADO_JANELA__' = $c.paradoJanelaMin; '__CHEGOU__' = $c.chegouMetros; '__SEMMOT__' = $c.semMotoristaMin; '__ATRASADO__' = $c.atrasadoAteMin; '__LEMBRETE__' = $c.lembreteMin; '__FORCAR__' = $c.forcarGoogleMin }
foreach ($k in $troca.Keys) { $definitionText = $definitionText.Replace($k, ([string]$troca[$k]).Replace(',', '.')) }
if ($definitionText -match '__[A-Z_]+__') { throw "Marcador não substituído: $($Matches[0])" }
```
Connection reference: este flow não usa conectores (só Request e Response). Mantenha `connectionReferences = @{}` no `clientdata`. Depois de criar e ativar o flow, grave a URL do gatilho sem imprimi-la:

```powershell
$flowToken = & az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
$api = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$environmentId/flows/$flowId"
$cb = Invoke-RestMethod -Method POST -Uri "$api/triggers/When_an_HTTP_request_is_received/listCallbackUrl?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $flowToken" }
if (-not $cb.response.value) { throw 'O gatilho não devolveu URL de callback (verifique a política de autenticação do tenant para gatilhos HTTP).' }
$varDef = (Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq 'cr40f_FlowUrlAlertasAvaliar'").value[0].environmentvariabledefinitionid
$existente = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $varDef").value)
if ($existente.Count) { Dv PATCH "environmentvariablevalues($($existente[0].environmentvariablevalueid))" @{ value = $cb.response.value } | Out-Null }
else { Dv POST environmentvariablevalues @{ value = $cb.response.value; 'EnvironmentVariableDefinitionId@odata.bind' = "/environmentvariabledefinitions($varDef)" } | Out-Null }
Write-Host '[alertas-avaliar] URL do gatilho gravada em cr40f_FlowUrlAlertasAvaliar (valor não exibido).'
```
Cuidado: `Dv` imprime só método e caminho, nunca o corpo. Não use `Write-Output` com a URL.

`Conferir` (leitura de volta) deve checar: gatilho `Request` método POST; existência das 25 ações da definição (nomes iguais aos de cima); `Resposta` do tipo `Response` com `statusCode 200`; ausência de qualquer `__X__`; constantes aplicadas: o texto do filtro `Elegiveis` contém `lessOrEquals(item()?['fixMin'], 10)` e `greater(item()?['osrmM'], 150)`, o filtro `F_sem_motorista` contém `lessOrEquals(item()?['min'], 120)`, `F_atrasado` contém `sub(0, 60)`, `F_precisa_google` contém `mul(item()?['osrmMin'], 2)` e `lessOrEquals(item()?['min'], 30)`; o flow pertence à solução (componenttype 29).

- [ ] **Step 3: Gerar artefatos, validar e criar**

Run: `pnpm --filter @betinhos/alertas-operacao artefatos` e depois `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-flow-alertas-avaliar.ps1`.
Expected: `checkFlowErrors: []`, todas as linhas `ok:` do `Conferir`, a linha de URL gravada, e `DEV: 'Flow Alertas | Avaliar' ativo (<id>), na AppBetinhos.` Se `checkFlowErrors` rejeitar alguma expressão, corrija a expressão mínima necessária e registre a mudança no relatório e no commit; a Task 5 é a autoridade sobre a lógica.

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/provision-flow-alertas-avaliar.ps1 packages/deploy/flows/backup
git commit -m "Alertas: flow avaliador por HTTP provisionado no DEV com as constantes do pacote"
```
(Inclua o backup do flow só se o script o tiver gerado, como nos flows dos Assistentes.)

---

### Task 5: Conformidade do flow avaliador contra os vetores

**Files:**
- Create: `packages/deploy/conformidade-alertas.ps1`

**Interfaces:**
- Consumes: `packages/alertas-operacao/dist/vetores.json` (Task 2), URL em `cr40f_FlowUrlAlertasAvaliar` (Task 4).
- Produces: relatório por vetor e código de saída 1 se algum diferir. A Task 7 só começa com esta conformidade verde.

- [ ] **Step 1: Script**

```powershell
# Posta cada vetor no flow avaliador do DEV e compara com o esperado do pacote TS. Não imprime a URL.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$h = @{ Authorization = "Bearer $token"; Accept = 'application/json' }
$def = (Invoke-RestMethod -Headers $h -Uri "$environmentUrl/api/data/v9.2/environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq 'cr40f_FlowUrlAlertasAvaliar'").value
if ($def.Count -ne 1) { throw 'Variável cr40f_FlowUrlAlertasAvaliar ausente.' }
$val = (Invoke-RestMethod -Headers $h -Uri "$environmentUrl/api/data/v9.2/environmentvariablevalues?`$select=value&`$filter=_environmentvariabledefinitionid_value eq $($def[0].environmentvariabledefinitionid)").value
if (-not $val.Count -or -not $val[0].value) { throw 'cr40f_FlowUrlAlertasAvaliar sem valor: rode provision-flow-alertas-avaliar.ps1.' }
$url = $val[0].value

function Canon($o) {
  if ($null -eq $o) { return $null }
  if ($o -is [System.Collections.IEnumerable] -and $o -isnot [string] -and $o -isnot [pscustomobject]) { return @($o | ForEach-Object { Canon $_ }) }
  if ($o -is [pscustomobject]) { $r = [ordered]@{}; foreach ($p in ($o.PSObject.Properties | Sort-Object Name)) { $r[$p.Name] = Canon $p.Value }; return $r }
  return $o
}
function Normalizar($saida) {
  $acoes = @($saida.acoes | Sort-Object { $_.alerta.chave })
  [pscustomobject]@{ precisaGoogle = @($saida.precisaGoogle | Sort-Object); acoes = $acoes; resolver = @($saida.resolver | Sort-Object) }
}
function Json($o) { (Canon $o) | ConvertTo-Json -Depth 30 -Compress }

$vetoresPath = Join-Path $PSScriptRoot '../alertas-operacao/dist/vetores.json'
if (-not (Test-Path $vetoresPath)) { throw 'vetores.json ausente: rode pnpm --filter @betinhos/alertas-operacao artefatos.' }
$vetores = [IO.File]::ReadAllText((Resolve-Path $vetoresPath), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json
$falhas = 0
foreach ($v in $vetores) {
  $corpo = [Text.Encoding]::UTF8.GetBytes(($v.entrada | ConvertTo-Json -Depth 30 -Compress))
  try {
    $r = Invoke-WebRequest -Method POST -Uri $url -ContentType 'application/json; charset=utf-8' -Body $corpo -UseBasicParsing -TimeoutSec 120
    $obtido = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
  } catch { Write-Host "FALHA  $($v.nome): chamada recusada ($($_.Exception.Message))"; $falhas++; continue }
  $a = Json (Normalizar $obtido); $e = Json (Normalizar $v.esperado)
  if ($a -ceq $e) { Write-Host "ok     $($v.nome)" }
  else { Write-Host "FALHA  $($v.nome)"; Write-Host "  esperado: $e"; Write-Host "  obtido:   $a"; $falhas++ }
}
Write-Host "$($vetores.Count - $falhas) de $($vetores.Count) vetores conferem."
if ($falhas) { exit 1 }
```
Salve em UTF-8 com BOM. Uma lista vazia no JSON de saída chega como `[]`; `Canon` mantém `@()` e `ConvertTo-Json` preserva arrays vazios. Se `ConvertTo-Json` achatar arrays de um elemento, envolva com `,@(...)` nas propriedades de `Normalizar`.

- [ ] **Step 2: Rodar**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/conformidade-alertas.ps1`
Expected: `31 de 31 vetores conferem.` Cada divergência mostra esperado e obtido. Corrija o flow (Task 4) quando o TS estiver certo pelos testes unitários; corrija o TS (e regenere os artefatos) somente se o teste unitário da regra provar o erro no código de referência. Repita até 31 de 31.

- [ ] **Step 3: Commit**

```bash
git add packages/deploy/conformidade-alertas.ps1 packages/deploy/provision-flow-alertas-avaliar.ps1
git commit -m "Alertas: script de conformidade que confere o avaliador do DEV contra os vetores do pacote"
```

---

### Task 6: Medir a qualidade do geocoding com endereços reais (só leitura no PROD)

**Files:**
- Create: `packages/deploy/medir-geocoding-alertas.ps1`

**Interfaces:**
- Consumes: variável `cr40f_GoogleMapsChave` com valor no DEV (pré-requisito do Renan). Se estiver sem valor, pare com status NEEDS_CONTEXT pedindo o valor ao Renan.
- Produces: a taxa de endereços utilizáveis. **Portão:** se menos de 70% dos endereços ficarem Geocodificado ou Aproximado, pare e reporte ao Renan antes da Task 7: a Fase 0 vira pré-requisito dos alertas de atraso.

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
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$h = @{ Authorization = "Bearer $token"; Accept = 'application/json' }
$def = (Invoke-RestMethod -Headers $h -Uri "$environmentUrl/api/data/v9.2/environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq 'cr40f_GoogleMapsChave'").value
if ($def.Count -ne 1) { throw 'Variável cr40f_GoogleMapsChave ausente: rode provision-alertas-schema.ps1.' }
$val = (Invoke-RestMethod -Headers $h -Uri "$environmentUrl/api/data/v9.2/environmentvariablevalues?`$select=value&`$filter=_environmentvariabledefinitionid_value eq $($def[0].environmentvariabledefinitionid)").value
if (-not $val.Count -or -not $val[0].value) { throw 'NEEDS_CONTEXT: cr40f_GoogleMapsChave sem valor no DEV. O Renan precisa preenchê-lo no maker portal.' }
$chave = $val[0].value

# Mesma regra do flow Verificar: primeira linha/item; se começa com "N. ", usa o que vem depois do primeiro " - " (ou remove o número).
function LimparTexto([string] $bruto) {
  $linha = (($bruto -replace "`r", '') -replace ';', "`n" -split "`n")[0]
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
  Write-Host ("{0,-14} {1,-20} {2}" -f $classe, $tipo, $texto.Substring(0, [Math]::Min(50, $texto.Length)))
}
$total = $linhas.Count
$uteis = $cont.Geocodificado + $cont.Aproximado
Write-Host ("Geocodificado {0}, Aproximado {1}, Indisponível {2}, Sem texto {3}. Utilizáveis: {4} de {5} ({6:P0})." -f $cont.Geocodificado, $cont.Aproximado, $cont.Indisponivel, $cont.SemTexto, $uteis, $total, ($uteis / [Math]::Max(1, $total)))
```
A chave nunca é impressa: o script imprime só a classe, o tipo e os 50 primeiros caracteres do texto já limpo. Se algum texto limpo ainda tiver nome de pessoa e você for colar a saída no relatório, troque por "(texto omitido)".

- [ ] **Step 3: Rodar e aplicar o portão**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/medir-geocoding-alertas.ps1 -Arquivo <caminho do JSON no scratchpad>`
Expected: a linha final com a taxa. Se `utilizáveis / total` for menor que 70%, pare e reporte (status DONE_WITH_CONCERNS com a distribuição e três exemplos de falha sem nomes).

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/medir-geocoding-alertas.ps1
git commit -m "Alertas: script de medição do geocoding com endereços reais (leitura no PROD, chave só no DEV)"
```

---

### Task 7: Flow "Alertas | Verificar" — coleta, avaliação e registro dos alertas

**Files:**
- Create: `packages/deploy/provision-flow-alertas-verificar.ps1`
- Reference: `git show claude/compassionate-dubinsky-c4d8f9:packages/deploy/provision-flow-agentes-executar.ps1` (prólogo, `Backup`, `Apply`, `FlowRows`, `Include`, variáveis de ambiente como parâmetros `schemaname (schemaname)`, referência de conexão do Dataverse lida do flow `Flow Comprovantes Despesas Assincrono | App Motoristas`, `-SomenteValidar`, `-Restaurar`, `Conferir` por leitura de volta)

**Interfaces:**
- Consumes: Task 3 (tabela `cr40f_alertaoperacaos` ou o nome real impresso lá, colunas e variáveis), Task 4 e Task 5 (avaliador conforme, URL na variável), constantes do pacote.
- Produces: flow `Flow Alertas | Verificar`, **criado desligado** (a Task 10 liga). Ele coleta, geocodifica, chama o avaliador (uma ou duas vezes), grava e encerra alertas em `cr40f_alertaoperacao`. Os avisos nos canais entram na Task 8.

Contrato dos parâmetros do flow: um parâmetro por variável de ambiente, com nome `"<schema> (<schema>)"` e `metadata.schemaName` igual ao schema, como no flow dos Assistentes. No texto abaixo, `P('x')` significa `parameters('x (x)')`.

Helper de texto JSON seguro, usado para montar objetos-mapa por chave (o Logic Apps não tem dicionário): `JS(e)` = `substring(string(createArray(e)), 1, sub(length(string(createArray(e))), 2))`, que devolve o texto de `e` já entre aspas e com escapes. O script PowerShell gera essa expressão com uma função e a substitui nos marcadores `__JS(...)__`.

- [ ] **Step 1: Definição do flow (parte de coleta e registro)**

Gatilho: recorrência a cada 5 minutos, 04:00 a 23:59 em Brasília.
```json
"triggers": { "A_cada_5_min": { "type": "Recurrence", "recurrence": { "frequency": "Day", "interval": 1, "timeZone": "E. South America Standard Time", "schedule": { "hours": [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23], "minutes": [0,5,10,15,20,25,30,35,40,45,50,55] } } } }
```
Variáveis (todas no nível raiz, antes do escopo): `Geocodificados`, `Rotas_osrm`, `Parados`, `Rotas_google`, `Notificados` (arrays) e `Motivo_erro` (string).

Escopo `Escopo_verificar` (as ações abaixo ficam dentro dele, encadeadas por `runAfter` na ordem listada). Todas as chamadas Dataverse usam `OpenApiConnection` com `operationId` `ListRecords`, `CreateRecord` ou `UpdateRecord` e `authentication` `@parameters('$authentication')`, como nos flows dos Assistentes.

1. **`Se_desligado`** (If): `not(equals(toLower(P('cr40f_AlertasLigado')), 'sim'))` → `Terminate` com `runStatus` `Succeeded`.
2. **`Agora`** `utcNow('yyyy-MM-ddTHH:mm:ssZ')`; **`Inicio`** `addToTime(outputs('Agora'), -60, 'Minute')`; **`Fim`** `addToTime(outputs('Agora'), 180, 'Minute')` (formato `yyyy-MM-ddTHH:mm:ssZ`).
3. **`Servicos`** ListRecords `cr40f_reservadeveculoses`: `$select` = `cr40f_reservadeveculosid,cr40f_idnovo,cr40f_id,cr40f_status,cr40f_dataehorriodesada,_cr40f_motorista_value,_cr40f_veiculo_value,_cr40f_cliente_value,cr40f_endereodesada,new_enderecodesaidapersonalizado,cr40f_embarquelatitude,cr40f_embarquelongitude,cr40f_embarqueprecisao,cr40f_embarquetexto,cr40f_embarquegeocodificadoem`; `$expand` = `cr40f_Motorista($select=new_apelido),cr40f_Veiculo($select=cr40f_placa)`; `$filter` = `statecode eq 0 and (cr40f_status eq 202410001 or cr40f_status eq 202410005 or cr40f_status eq 202410006) and cr40f_dataehorriodesada ge @{outputs('Inicio')} and cr40f_dataehorriodesada le @{outputs('Fim')}`; `$orderby` = `cr40f_dataehorriodesada asc`; `$top` 150.
4. **`Abertos`** ListRecords `cr40f_alertaoperacaos`: `$select` = `cr40f_alertaoperacaoid,cr40f_chave,cr40f_severidade,cr40f_envios,cr40f_ultimoenvioem,_cr40f_reserva_value,cr40f_regra`; `$filter` = `cr40f_status eq 100000000 and cr40f_regra le 100000003`; `$top` 500.
5. **`Sem_nada`** (If): `and(empty(outputs('Servicos')?['body/value']), empty(outputs('Abertos')?['body/value']))` → Terminate Succeeded (caminho barato).
6. **`T1`** Select de `outputs('Servicos')?['body/value']`: `{ "s": "@item()", "linha": "@trim(first(split(replace(replace(coalesce(item()?['new_enderecodesaidapersonalizado'], item()?['cr40f_endereodesada'], ''), ';', decodeUriComponent('%0A')), decodeUriComponent('%0D'), ''), decodeUriComponent('%0A'))))" }`.
   **`T2`** Select de `body('T1')`: `{ "s": "@item()?['s']", "texto": "@take(if(and(greater(length(item()?['linha']), 3), isInt(substring(item()?['linha'], 0, 1)), equals(substring(item()?['linha'], 1, 2), '. ')), if(contains(item()?['linha'], ' - '), trim(join(skip(split(item()?['linha'], ' - '), 1), ' - ')), trim(substring(item()?['linha'], 3, sub(length(item()?['linha']), 3)))), item()?['linha']), 250)" }`.
7. **`Precisam_geo`** Query de `body('T2')`: `@and(not(equals(item()?['texto'], '')), not(equals(item()?['s']?['cr40f_embarqueprecisao'], 100000000)), or(equals(item()?['s']?['cr40f_embarqueprecisao'], null), not(equals(item()?['texto'], item()?['s']?['cr40f_embarquetexto'])), and(equals(item()?['s']?['cr40f_embarqueprecisao'], 100000003), less(ticks(coalesce(item()?['s']?['cr40f_embarquegeocodificadoem'], '1970-01-01T00:00:00Z')), ticks(addToTime(outputs('Agora'), -24, 'Hour'))))))`.
8. **`Cada_geo`** Foreach de `body('Precisam_geo')`, `repetitions` 4, com:
   - `Geocodificar` HTTP GET `https://maps.googleapis.com/maps/api/geocode/json?region=br&components=country:BR&address=@{encodeUriComponent(item()?['texto'])}&key=@{P('cr40f_GoogleMapsChave')}`, `runtimeConfiguration.secureData.properties = ["inputs","outputs"]`, retry exponencial 2x.
   - `Classe` Compose: `@if(or(empty(body('Geocodificar')?['results']), equals(first(body('Geocodificar')?['results'])?['geometry']?['location_type'], 'APPROXIMATE')), 100000003, if(or(equals(first(body('Geocodificar')?['results'])?['partial_match'], true), equals(first(body('Geocodificar')?['results'])?['geometry']?['location_type'], 'GEOMETRIC_CENTER')), 100000002, 100000001))`.
   - `Gravar_geo` UpdateRecord em `cr40f_reservadeveculoses`, `recordId` `@items('Cada_geo')?['s']?['cr40f_reservadeveculosid']`: `item/cr40f_embarquelatitude` e `item/cr40f_embarquelongitude` = `@if(equals(outputs('Classe'), 100000003), null, first(body('Geocodificar')?['results'])?['geometry']?['location']?['lat'])` (e `lng`), `item/cr40f_embarqueprecisao` `@outputs('Classe')`, `item/cr40f_embarquetexto` `@items('Cada_geo')?['texto']`, `item/cr40f_embarquegeocodificadoem` `@outputs('Agora')`.
   - Se o `Geocodificar` falhar (`runAfter` Failed/TimedOut): `Acrescentar_falha_geo` não faz nada além de seguir (o serviço fica sem coordenada e será tentado no próximo ciclo). Não derrube o escopo por uma falha de geocoding.
   - `Acrescentar_geo` AppendToArrayVariable em `Geocodificados` com `@items('Cada_geo')?['s']?['cr40f_reservadeveculosid']`.
9. **`Reler`** (If): `greater(length(variables('Geocodificados')), 0)` → ação `Servicos_2`, ListRecords idêntica à `Servicos`; else vazio. **`Servicos_final`** Compose: `@coalesce(actions('Servicos_2')?['outputs']?['body']?['value'], outputs('Servicos')?['body/value'])`.
10. Infleet: **`Veiculos_1`** e **`Veiculos_2`** HTTP POST `https://api.infleet.com.br/v1/graphql`, cabeçalhos `Content-Type: application/json` e `Authorization: Bearer @{P('new_InfleetToken')}`, `secureData` em inputs e outputs, corpo `{ "query": "query($offset:Int){ listVehicles(limit:100, offset:$offset, filter:{ deactivated: WITHOUT_DEACTIVATED }){ id plate location { latitude longitude speed fixTime } } }", "variables": { "offset": 0 } }` (e `100` na segunda). **`Veiculos`** Compose `@union(coalesce(body('Veiculos_1')?['data']?['listVehicles'], createArray()), coalesce(body('Veiculos_2')?['data']?['listVehicles'], createArray()))`. **`Pares_veiculo`** Select de `outputs('Veiculos')` com `where` implícito por `Filtro_veiculo` (Query `not(equals(item()?['location'], null))`): `concat('"', toUpper(replace(item()?['plate'], '-', '')), '":', string(item()))`. **`Mapa_veiculo`** Compose `@json(concat('{', join(body('Pares_veiculo'), ','), '}'))`.
11. **`Servicos_uso`** Select de `outputs('Servicos_final')`, com `pos` = `@outputs('Mapa_veiculo')?[toUpper(replace(coalesce(item()?['cr40f_Veiculo']?['cr40f_placa'], ''), '-', ''))]`, e os campos: `id` `cr40f_reservadeveculosid`; `codigo` `coalesce(cr40f_idnovo, cr40f_id, '')`; `status`; `saida` `cr40f_dataehorriodesada`; `motoristaId` `_cr40f_motorista_value`; `motoristaNome` `coalesce(cr40f_Motorista?['new_apelido'], '')`; `veiculoId` `_cr40f_veiculo_value`; `placa`; `cliente` `coalesce(item()?['_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue'], '')`; `lat`/`lon`/`precisao` das colunas de embarque; `aproximado` `equals(precisao, 100000002)`. **`Servicos_pos`** Select de `body('Servicos_uso')` acrescentando `usavel` = `@and(not(equals(item()?['pos'], null)), not(equals(item()?['lat'], null)), not(equals(item()?['lon'], null)), not(equals(item()?['precisao'], 100000003)))`.
12. OSRM: **`Para_osrm`** Query `usavel` de `body('Servicos_pos')`; **`Cada_osrm`** Foreach (4) com `OSRM` HTTP GET `https://router.project-osrm.org/route/v1/driving/@{item()?['pos']?['location']?['longitude']},@{item()?['pos']?['location']?['latitude']};@{item()?['lon']},@{item()?['lat']}?overview=false`; sucesso → `Acrescentar_osrm` em `Rotas_osrm` `{ "id": "@items('Cada_osrm')?['id']", "minutos": "@div(float(first(body('OSRM')?['routes'])?['duration']), 60)", "metros": "@first(body('OSRM')?['routes'])?['distance']" }`; falha (`runAfter` Failed) → `Google_reserva` com a mesma chamada da etapa 15 e `Acrescentar_osrm_reserva` com os números do Google (a spec manda cair no Google quando o OSRM falha). **`Mapa_osrm`** Compose `@json(concat('{', join(body('Pares_osrm'), ','), '}'))` com `Pares_osrm` Select de `variables('Rotas_osrm')`: `concat('"', item()?['id'], '":', string(item()))`.
13. Parado: **`Para_parado`** Query de `body('Servicos_pos')` `@and(item()?['usavel'], lessOrEquals(item()?['pos']?['location']?['speed'], __PARADO_VEL__))`; **`Cada_parado`** Foreach (4) com HTTP POST Infleet `{ "query": "query($f: ListVehiclePositionsFilterInput!){ listVehiclePositions(filter:$f){ fixTime speed } }", "variables": { "f": { "vehicleId": "@{items('Cada_parado')?['pos']?['id']}", "fixTime": { "startAt": "@{addToTime(outputs('Agora'), -20, 'Minute')}", "endAt": "@{outputs('Agora')}" } } } }`; `Velocidades` Select `item()?['speed']`; `Ticks` Select `ticks(item()?['fixTime'])`; `Acrescentar_parado` em `Parados` `{ "id": ..., "paradoMin": "@if(or(empty(body('Posicoes')?['data']?['listVehiclePositions']), greater(max(body('Velocidades')), __PARADO_VEL__)), 0, div(float(sub(ticks(outputs('Agora')), min(body('Ticks')))), 600000000))" }`; **`Mapa_parado`** análogo ao `Mapa_osrm`.
14. **`Entrada1`** Select de `body('Servicos_pos')` no formato exato de `EntradaServico`: `id`, `codigo`, `status`, `saida`, `motoristaId`, `motoristaNome`, `veiculoId`, `placa`, `cliente`; `posicao` `@if(equals(item()?['pos'], null), null, json(concat('{"velocidadeKmh":', string(item()?['pos']?['location']?['speed']), ',"fixTime":"', item()?['pos']?['location']?['fixTime'], '"}')))`; `rotaOsrm` `@if(contains(outputs('Mapa_osrm'), item()?['id']), outputs('Mapa_osrm')?[item()?['id']], null)`; `rotaGoogle` `null`; `paradoMin` `@if(contains(outputs('Mapa_parado'), item()?['id']), outputs('Mapa_parado')?[item()?['id']]?['paradoMin'], null)`; `embarqueAproximado` `@item()?['aproximado']`. **`Abertos_aval`** Select de `outputs('Abertos')?['body/value']`: `{ "chave": "@item()?['cr40f_chave']", "reservaId": "@item()?['_cr40f_reserva_value']", "severidade": "@if(equals(item()?['cr40f_severidade'], 100000001), 'alta', 'media')", "envios": "@coalesce(item()?['cr40f_envios'], 0)", "ultimoEnvioEm": "@coalesce(item()?['cr40f_ultimoenvioem'], outputs('Agora'))" }`.
    Para o serviço sem posição, `pos` nulo faz `usavel` falso e `rotaOsrm` nulo: o avaliador não alerta atraso (lacuna explícita da spec).
15. **`Aval1`** HTTP POST em `@P('cr40f_FlowUrlAlertasAvaliar')` com corpo `{ "agora": "@outputs('Agora')", "servicos": "@body('Entrada1')", "abertos": "@body('Abertos_aval')" }`, `secureData` em inputs e outputs (a URL tem assinatura), timeout `PT60S`, retry exponencial 2x. **`Para_google`** Query de `body('Entrada1')` `@contains(body('Aval1')?['precisaGoogle'], item()?['id'])`. **`Cada_google`** Foreach (4) de `body('Para_google')` com `Google` HTTP POST `https://routes.googleapis.com/directions/v2:computeRoutes`, cabeçalhos `X-Goog-Api-Key: @{P('cr40f_GoogleMapsChave')}`, `X-Goog-FieldMask: routes.duration,routes.distanceMeters`, corpo `{ "origin": { "location": { "latLng": { "latitude": <posição>, "longitude": <posição> } } }, "destination": { "location": { "latLng": { "latitude": <lat do serviço>, "longitude": <lon> } } }, "travelMode": "DRIVE", "routingPreference": "TRAFFIC_AWARE", "languageCode": "pt-BR", "units": "METRIC" }`, `secureData`. As coordenadas vêm do item correspondente em `body('Servicos_pos')` (`first(Query por id)`). `Acrescentar_google` em `Rotas_google` `{ "id": ..., "minutos": "@int(add(div(sub(int(replace(first(body('Google')?['routes'])?['duration'], 's', '')), mod(int(replace(first(body('Google')?['routes'])?['duration'], 's', '')), 60)), 60), if(equals(mod(int(replace(first(body('Google')?['routes'])?['duration'], 's', '')), 60), 0), 0, 1)))", "metros": "@first(body('Google')?['routes'])?['distanceMeters']" }` (arredonda os minutos para cima). **`Mapa_google`** análogo. **`Entrada2`** Select de `body('Para_google')` com os mesmos campos de `Entrada1`, trocando `rotaGoogle` por `@if(contains(outputs('Mapa_google'), item()?['id']), outputs('Mapa_google')?[item()?['id']], null)`. **`Aval2`** (If `greater(length(variables('Rotas_google')), 0)`): HTTP POST como o `Aval1` com `{ "agora", "servicos": "@body('Entrada2')", "abertos": "@body('Abertos_aval')", "regras": ["NaoChegaraATempo"] }`. Se a chamada ao Google falhar, o serviço fica sem `rotaGoogle` e o avaliador não decide o atraso (os alertas abertos dele ficam como estão).
16. **`Acoes_total`** Compose `@union(coalesce(body('Aval1')?['acoes'], createArray()), coalesce(actions('Aval2')?['outputs']?['body']?['acoes'], createArray()))`; **`Resolver_total`** análogo com `resolver`. **`Mapa_regra`** Compose `{ "NaoChegaraATempo": 100000000, "JaAtrasado": 100000001, "MotoristaParado": 100000002, "SemMotorista": 100000003 }`.
17. **`Cada_acao`** Foreach (1) de `outputs('Acoes_total')`:
    - `Aberto_da_chave` Query de `outputs('Abertos')?['body/value']` `equals(item()?['cr40f_chave'], items('Cada_acao')?['alerta']?['chave'])`.
    - Se `acao` é `criar`: `Criar_alerta` CreateRecord em `cr40f_alertaoperacaos`: `item/cr40f_alertaoperacaonome` (`take(titulo, 200)`), `item/cr40f_regra` `@outputs('Mapa_regra')?[items('Cada_acao')?['alerta']?['regra']]`, `item/cr40f_chave`, `item/cr40f_Reserva@odata.bind` `@concat('/cr40f_reservadeveculoses(', items('Cada_acao')?['alerta']?['reservaId'], ')')`, `item/cr40f_severidade` `@if(equals(items('Cada_acao')?['alerta']?['severidade'], 'alta'), 100000001, 100000000)`, `item/cr40f_status` 100000000, `item/cr40f_mensagem`, `item/cr40f_envios` 1, `item/cr40f_ultimoenvioem` `@outputs('Agora')`.
    - Se `reenviar` ou `lembrar`: `Atualizar_alerta` UpdateRecord em `cr40f_alertaoperacaos` com `recordId` `@first(body('Aberto_da_chave'))?['cr40f_alertaoperacaoid']`: `cr40f_envios` `@add(coalesce(first(body('Aberto_da_chave'))?['cr40f_envios'], 0), 1)`, `cr40f_ultimoenvioem`, e quando `reenviar` também `cr40f_severidade` e `cr40f_mensagem`.
    - `Acrescentar_notificado` em `Notificados` com `{ acao, alerta }` (a Task 8 envia os avisos a partir daqui, dentro do mesmo loop).
18. **`Cada_resolver`** Foreach (1) de `outputs('Resolver_total')`: `Aberto_resolver` Query em `Abertos` por chave; `Resolver_alerta` UpdateRecord: `cr40f_status` 100000001, `cr40f_resolvidoem` `@outputs('Agora')`, `cr40f_resolucao` `@if(contains(body('Ids_servicos'), first(body('Aberto_resolver'))?['_cr40f_reserva_value']), 100000000, 100000001)` com `Ids_servicos` Select de `outputs('Servicos_final')` `cr40f_reservadeveculosid`.
19. **`Tratar_erro`** (Scope, `runAfter` Failed/TimedOut do `Escopo_verificar`): grava `FalhaDoAgente` (a Task 8 acrescenta o e-mail ao TI) e `Encerrar_com_erro` (Terminate Failed) como nos flows dos Assistentes.

- [ ] **Step 2: Script de provisionamento**

Mesmo molde do script do avaliador: constantes de `dist/constantes.json` (`__PARADO_VEL__`), parâmetros de ambiente (os 10 da Task 3 que o flow usa: `new_InfleetToken`, `cr40f_GoogleMapsChave`, `cr40f_AlertasLigado`, `cr40f_FlowUrlAlertasAvaliar`; os demais entram na Task 8), referência de conexão do Dataverse como nos flows dos Assistentes, inclusão das variáveis e do flow na solução, criação **desligada** (não ative: sem os valores das variáveis o Power Automate recusa ativar, e a Task 10 liga). `Conferir` por leitura de volta: gatilho Recurrence com timezone `E. South America Standard Time`, 20 horas de 4 a 23 e 12 minutos; `Se_desligado` e `Sem_nada` com `Terminate`; todas as chamadas `Http` com `secureData` `inputs,outputs`; `Aval1` usa `P('cr40f_FlowUrlAlertasAvaliar')`; a chamada ao Google usa `TRAFFIC_AWARE` e o `X-Goog-FieldMask` exato; `$top` 150 em `Servicos` e 500 em `Abertos`; os valores de choice 100000000 a 100000003 em `Mapa_regra`; nenhuma ação lê `cr40f_endereodesada` além do `T1`; nenhum corpo de e-mail com `telefone` (a Task 8 confere o resto).

- [ ] **Step 3: Validar e criar**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-flow-alertas-verificar.ps1 -SomenteValidar` e depois sem o parâmetro.
Expected: `checkFlowErrors: []`, todas as linhas `ok:`, `DEV: 'Flow Alertas | Verificar' gravado e DESLIGADO (<id>), na AppBetinhos.` Expressões que o validador rejeitar: corrija o mínimo e registre cada mudança no relatório.

- [ ] **Step 4: Execução de prova pontual (sem ligar o agendamento)**

Sem valores de variáveis o flow não roda. Se o Renan já preencheu `new_InfleetToken`, `cr40f_GoogleMapsChave` e `cr40f_AlertasLigado = sim`, dispare uma execução manual pela API do Power Automate (`POST .../flows/{id}/triggers/A_cada_5_min/run`, `api-version=2016-11-01`) e leia o resultado da execução (`.../runs?$top=1`): esperado `Succeeded` e, sem serviços na janela, término cedo em `Sem_nada`. Se os valores ainda não existirem, registre isso e deixe a prova para a Task 10.

- [ ] **Step 5: Commit**

```bash
git add packages/deploy/provision-flow-alertas-verificar.ps1 packages/deploy/flows/backup
git commit -m "Alertas: flow Verificar no DEV (coleta Infleet/OSRM/Google, geocoding, avaliador e registro de alertas), desligado"
```

---

### Task 8: Avisos nos canais e falha do agente (no flow Verificar)

**Files:**
- Modify: `packages/deploy/provision-flow-alertas-verificar.ps1`

**Interfaces:**
- Consumes: Task 7 (loop `Cada_acao` com `Acrescentar_notificado`), variáveis `cr40f_AlertasCanais`, `cr40f_AlertasEmailOperacao`, `cr40f_AlertasEmailTI`, `cr40f_AlertasTeamsEquipeId`, `cr40f_AlertasTeamsCanalId`, `cr40f_AlertasPushDestinatarios`.
- Produces: avisos por e-mail, Teams e push dentro do `Cada_acao`, atualização de `cr40f_canais`, e o e-mail de falha ao TI (no máximo um por hora).

**Referências de conexão:** o script procura, na tabela `connectionreferences` do DEV, uma referência por conector (`/providers/Microsoft.PowerApps/apis/shared_office365`, `shared_teams` e `shared_powerappsnotification`) pertencente à AppBetinhos e, se faltar alguma, falha com a mensagem `Crie uma referência de conexão <conector> na solução AppBetinhos (maker portal) e rode de novo.` Isso é pré-requisito do Renan (conexões da conta de serviço dona dos outros flows).

- [ ] **Step 1: Ações de aviso dentro do `Cada_acao`**

Depois de `Criar_alerta`/`Atualizar_alerta`, acrescente:
- `Canais` Compose `@toLower(P('cr40f_AlertasCanais'))`.
- `Assunto` Compose `@concat('[Operação] ', if(equals(items('Cada_acao')?['acao'], 'lembrar'), 'Lembrete: ', ''), items('Cada_acao')?['alerta']?['titulo'])`.
- `Link` Compose `@concat('https://org23b93544.crm2.dynamics.com/main.aspx?pagetype=entityrecord&etn=cr40f_reservadeveculos&id=', items('Cada_acao')?['alerta']?['reservaId'])`.
- `Corpo_html` Compose `@concat('<p><b>', items('Cada_acao')?['alerta']?['titulo'], '</b></p><p>', items('Cada_acao')?['alerta']?['mensagem'], '</p><p><a href="', outputs('Link'), '">Abrir o serviço</a></p>')`.
- **`Email`** (If `contains(outputs('Canais'), 'email')`): Office 365 Outlook `SendEmailV2` (`apiId` `/providers/Microsoft.PowerApps/apis/shared_office365`, `connectionName` `shared_office365`) com `emailMessage/To` `@P('cr40f_AlertasEmailOperacao')`, `emailMessage/Subject` `@outputs('Assunto')`, `emailMessage/Body` `@outputs('Corpo_html')`, `emailMessage/Importance` `@if(equals(items('Cada_acao')?['alerta']?['severidade'], 'alta'), 'High', 'Normal')`.
- **`Teams`** (If `contains(outputs('Canais'), 'teams')`): Teams `PostMessageToConversation` (`apiId` `/providers/Microsoft.PowerApps/apis/shared_teams`) com `poster` `Flow bot`, `location` `Channel`, `body/recipient/groupId` `@P('cr40f_AlertasTeamsEquipeId')`, `body/recipient/channelId` `@P('cr40f_AlertasTeamsCanalId')`, `body/messageBody` `@outputs('Corpo_html')`.
- **`Push`** (If `contains(outputs('Canais'), 'push')`): conector Notificações do Power Apps (`shared_powerappsnotification`), ação de envio de notificação push com destinatários `@split(P('cr40f_AlertasPushDestinatarios'), ';')` e texto `@concat(titulo, ' - saída ', hora)`. Os nomes exatos de operação e parâmetros dessa ação não são conhecidos de antemão: leia a definição do conector (`GET https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/<envId>/apis/shared_powerappsnotification?api-version=2016-11-01&$expand=properties.swagger`, com token do Power Automate) e use o `operationId` e os parâmetros que o swagger declarar para envio de push a destinatários. Se o conector não oferecer envio a terceiros, deixe o canal `push` documentado como pendente com o motivo exato e conclua e-mail e Teams.
- Cada aviso roda com `runAfter` `Succeeded` do registro e **não pode derrubar o loop**: coloque cada If com `runAfter` do anterior em `Succeeded` e `Failed` e deixe falha de canal registrada (a falha vira e-mail ao TI no `Tratar_erro` só se o escopo falhar; uma falha de canal isolada é registrada em `cr40f_canais` como `<canal>:erro`).
- `Registrar_canais` UpdateRecord em `cr40f_alertaoperacaos` (criar: o id vem da saída do `Criar_alerta`; atualizar: id do aberto) com `cr40f_canais` = canais que enviaram (`concat` condicional por ação `Email`/`Teams`/`Push` com `actions('Email')?['status']`).

Os e-mails e mensagens usam só os textos do avaliador (sem telefone e sem nome de passageiro).

- [ ] **Step 2: Falha do agente no `Tratar_erro`**

Dentro do `Tratar_erro` (Task 7, etapa 19): `Chave_falha` Compose `@concat('FalhaDoAgente|', convertTimeZone(utcNow(), 'UTC', 'E. South America Standard Time', 'yyyy-MM-dd-HH'))`; `Falha_existente` ListRecords `cr40f_alertaoperacaos` com `$filter` `cr40f_chave eq '@{outputs('Chave_falha')}'` e `$top` 1; se vazio (no máximo um por hora): `Criar_falha` CreateRecord (`cr40f_regra` 100000005, `cr40f_chave`, `cr40f_status` 100000001, nome `Falha do agente de operação`, mensagem com o texto do erro do escopo) e `Email_ti` Outlook `SendEmailV2` para `@P('cr40f_AlertasEmailTI')` com assunto `[TI] Falha no agente de alertas de operação` e corpo com o motivo (`first(body('Falhas_escopo'))?['error']?['message']`, sem URLs assinadas: o `Falhas_escopo` é um `Query` com `secureData`, como nos flows dos Assistentes).

- [ ] **Step 3: Atualizar `Conferir` e reprovisionar**

Acrescente ao `Conferir`: `Cada_acao` contém `Email`, `Teams` e `Push` (ou o motivo do push pendente registrado no script); `SendEmailV2` e `PostMessageToConversation` com os parâmetros acima; `Tratar_erro` contém `Email_ti` e `Chave_falha`; as variáveis de e-mail, Teams e push entram nos parâmetros do flow; nenhum corpo de aviso referencia `telefone`, `celular` ou `passageiro`.
Run: `... -SomenteValidar` e depois a execução real (o flow continua desligado).
Expected: `checkFlowErrors: []` e todos os `ok:`.

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/provision-flow-alertas-verificar.ps1 packages/deploy/flows/backup
git commit -m "Alertas: avisos por e-mail, Teams e push no Verificar e e-mail de falha ao TI (no máximo um por hora)"
```

---

### Task 9: Flow "Alertas | Resumo diário" (CNH, ASO, documento do veículo e multa)

**Files:**
- Create: `packages/deploy/provision-flow-alertas-resumo.ps1`
- Reference: o script do Task 7 (prólogo, parâmetros de ambiente, conexões Dataverse e Outlook/Teams, `Conferir`)

**Interfaces:**
- Consumes: Task 3 e as referências de conexão da Task 8.
- Produces: flow de recorrência às 07:00 em dias úteis que manda um único resumo (e-mail e Teams, conforme `cr40f_AlertasCanais`) só quando há itens, e registra uma linha `DocumentosResumo` em `cr40f_alertaoperacao`.

- [ ] **Step 1: Definição**

Gatilho: `{ "type": "Recurrence", "recurrence": { "frequency": "Week", "interval": 1, "timeZone": "E. South America Standard Time", "schedule": { "weekDays": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "hours": ["7"], "minutes": [0] } } }`. Ações (todas dentro de `Escopo_resumo`, com `Se_desligado` como na Task 7):
1. `Hoje` Compose `@convertTimeZone(utcNow(), 'UTC', 'E. South America Standard Time', 'yyyy-MM-dd')`; `Inicio_hoje` `@convertToUtc(concat(outputs('Hoje'), 'T00:00:00'), 'E. South America Standard Time')`; `Fim_hoje` `@addToTime(outputs('Inicio_hoje'), 1, 'Day')`; `Limite_aso` `@formatDateTime(addToTime(outputs('Hoje'), -12, 'Month'), 'yyyy-MM-dd')`; `Limite_multa` `@formatDateTime(addToTime(outputs('Hoje'), 3, 'Day'), 'yyyy-MM-dd')`.
2. `Escalados` ListRecords `cr40f_reservadeveculoses` (`$select` `cr40f_reservadeveculosid,cr40f_idnovo,_cr40f_motorista_value,_cr40f_veiculo_value`, `$filter` `statecode eq 0 and (cr40f_status eq 202410001 or cr40f_status eq 202410005 or cr40f_status eq 202410006) and cr40f_dataehorriodesada ge @{outputs('Inicio_hoje')} and cr40f_dataehorriodesada lt @{outputs('Fim_hoje')}`, `$top` 150). `Ids_motoristas` Select `coalesce(item()?['_cr40f_motorista_value'], '')`; `Ids_veiculos` Select `coalesce(item()?['_cr40f_veiculo_value'], '')`.
3. `Cnh` ListRecords `cr40f_funcionarioses`: `$select` `cr40f_funcionariosid,new_apelido,cr40f_validadedacnh`, `$filter` `statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq 202410000 and cr40f_validadedacnh lt @{outputs('Hoje')}`, `$top` 150. `Aso` igual com `$select` `...,cr40f_datadoaso` e `$filter` `... and cr40f_datadoaso lt @{outputs('Limite_aso')}`. `Cnh_escalados` e `Aso_escalados`: Query dos resultados com `contains(body('Ids_motoristas'), item()?['cr40f_funcionariosid'])`.
4. `Docs` ListRecords `cr40f_documentos`: `$select` `cr40f_documentoid,cr40f_name,cr40f_validade,_cr40f_veiculo_value`, `$filter` `statecode eq 0 and cr40f_situacao eq 100000000 and _cr40f_veiculo_value ne null and cr40f_validade lt @{outputs('Hoje')}`, `$top` 150; `Docs_escalados` Query com `contains(body('Ids_veiculos'), item()?['_cr40f_veiculo_value'])`. O nome do veículo vem da anotação formatada `_cr40f_veiculo_value@OData.Community.Display.V1.FormattedValue`.
5. `Multas` ListRecords `cr40f_multases`: `$select` `cr40f_multasid,cr40f_id_multa,cr40f_dataparaindicar`, `$filter` `statecode eq 0 and cr40f_status eq 202410000 and _cr40f_motorista_value eq null and cr40f_dataparaindicar le @{outputs('Limite_multa')}`, `$top` 150.
6. `Total` Compose `@add(add(length(body('Cnh_escalados')), length(body('Aso_escalados'))), add(length(body('Docs_escalados')), length(outputs('Multas')?['body/value'])))`; `Sem_itens` If `equals(outputs('Total'), 0)` → Terminate Succeeded.
7. `Linhas_*` Selects com texto por item: CNH `concat('CNH vencida: ', item()?['new_apelido'], ' (validade ', formatDateTime(item()?['cr40f_validadedacnh'], 'dd/MM/yyyy'), ')')`; ASO `concat('ASO vencido: ', item()?['new_apelido'], ' (ASO de ', formatDateTime(item()?['cr40f_datadoaso'], 'dd/MM/yyyy'), ')')`; documento `concat('Documento vencido do veículo ', coalesce(item()?['_cr40f_veiculo_value@OData.Community.Display.V1.FormattedValue'], ''), ': ', item()?['cr40f_name'], ' (validade ', formatDateTime(item()?['cr40f_validade'], 'dd/MM/yyyy'), ')')`; multa `concat('Multa sem condutor: ', item()?['cr40f_id_multa'], ' (indicar até ', formatDateTime(item()?['cr40f_dataparaindicar'], 'dd/MM/yyyy'), ')')`. `Resumo_html` Compose: `concat('<p><b>Pendências da operação para hoje (', formatDateTime(utcNow(), 'dd/MM'), ')</b></p><ul><li>', join(union(body('Linhas_cnh'), body('Linhas_aso'), body('Linhas_docs'), body('Linhas_multas')), '</li><li>'), '</li></ul>')`.
8. `Email` e `Teams` como na Task 8 (assunto `[Operação] Pendências de hoje: <Total> itens`), controlados por `cr40f_AlertasCanais`. Sem push neste resumo.
9. `Registrar` CreateRecord em `cr40f_alertaoperacaos` (`cr40f_regra` 100000004, `cr40f_chave` `concat('DocumentosResumo|', outputs('Hoje'))`, `cr40f_status` 100000001, `cr40f_resolucao` 100000000, `cr40f_mensagem` o `Resumo_html`, `cr40f_envios` 1, nome `Resumo diário de documentos e multas`).
10. `Tratar_erro` como na Task 7 (registro e e-mail ao TI, um por hora).

- [ ] **Step 2: Script, validação e criação**

Mesmo molde dos scripts anteriores. `Conferir`: recorrência de segunda a sexta às 07:00 em Brasília; filtros de CNH (`cr40f_validadedacnh lt`), ASO (12 meses), documento (`cr40f_situacao eq 100000000`) e multa (`cr40f_status eq 202410000`, motorista nulo, 3 dias); `Sem_itens` encerra quando o total é 0; o resumo só cita apelido de motorista, placa do veículo, nome do documento e código da multa (sem CPF, RG nem telefone). Crie o flow **desligado**.
Run: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-flow-alertas-resumo.ps1 -SomenteValidar` e depois a real.
Expected: `checkFlowErrors: []`, todos os `ok:`.

- [ ] **Step 3: Commit**

```bash
git add packages/deploy/provision-flow-alertas-resumo.ps1 packages/deploy/flows/backup
git commit -m "Alertas: flow Resumo diário (CNH, ASO, documento do veículo e multa sem condutor) no DEV, desligado"
```

---

### Task 10: Prova ponta a ponta no DEV e ativação

**Files:**
- Modify: `docs/superpowers/specs/2026-10-15-alertas-operacao-proativos-design.md` (seção final "Estado em <data>")

**Interfaces:**
- Consumes: tudo acima e os valores que o Renan preencheu no DEV. **Pare com NEEDS_CONTEXT** se faltar qualquer um destes: `new_InfleetToken`, `cr40f_GoogleMapsChave`, `cr40f_AlertasLigado`, `cr40f_AlertasCanais`, `cr40f_AlertasEmailOperacao`, `cr40f_AlertasEmailTI`, `cr40f_AlertasTeamsEquipeId`, `cr40f_AlertasTeamsCanalId`, `cr40f_AlertasPushDestinatarios`, as conexões Outlook, Teams e Notificações. Durante os testes, peça ao Renan para apontar os destinatários só para ele mesmo.
- Produces: as sete regras provadas, dedupe provado, flows ligados, custo do Google em medição.

- [ ] **Step 1: Ligar os flows**

Ative `Flow Alertas | Verificar` e `Flow Alertas | Resumo diário` (`PATCH workflows(<id>)` com `statecode` 1, como o script do avaliador faz com o dele). Confirme `statecode` 1 por leitura.

- [ ] **Step 2: Prova de NaoChegaraATempo, dedupe e encerramento**

Com o MCP `infleet` (somente leitura), escolha um veículo ativo e em movimento (`frota_agora`) e anote placa e posição. No DEV, crie por Web API um serviço de teste: `cr40f_status` 202410001, saída em 40 minutos, lookups de motorista e veículo (a placa escolhida), `cr40f_embarquelatitude`/`longitude` de um ponto a cerca de 60 km do veículo, `cr40f_embarqueprecisao` 100000000, `cr40f_endereodesada` `TESTE ALERTA - não é serviço real`. Aguarde até 10 minutos. Esperado: um `cr40f_alertaoperacao` Aberto com `cr40f_regra` 100000000 e chave `NaoChegaraATempo|<id>`, e o aviso chegando nos canais (peça ao Renan para confirmar e-mail, Teams e push). Depois confirme o **dedupe**: nos 25 minutos seguintes, nenhum aviso repetido (`cr40f_envios` continua 1); aos 30 minutos chega um único lembrete (`cr40f_envios` 2); depois disso nada mais. Em seguida **encerre**: mova o embarque para o ponto onde o veículo está agora; no ciclo seguinte o alerta deve ficar Resolvido (`cr40f_resolucao` 100000000).

- [ ] **Step 3: Prova das demais regras**

- **JaAtrasado:** serviço de teste com saída 15 minutos atrás e embarque longe: alerta alto.
- **MotoristaParado:** use um veículo parado (velocidade 0 há mais de 10 minutos, via `frota_agora`/`trajeto`), saída em 60 minutos, embarque a mais de 500 m: alerta médio.
- **SemMotorista:** serviço de teste sem motorista, saída em 90 minutos: alerta médio; em 50 minutos o alerta sobe para alto e é reenviado.
- **Resumo diário:** dispare o `Alertas | Resumo diário` manualmente. Esperado: resumo só se houver CNH, ASO, documento ou multa pendentes para quem está escalado; sem itens, o flow termina sem enviar. Para forçar um item em DEV, crie um funcionário ou documento de teste com validade passada e escalado no serviço de teste de hoje, e apague depois.
- **Falha do agente:** peça ao Renan para trocar, por cerca de 10 minutos, o valor de `new_InfleetToken` por um texto inválido. Confirme que chega um único e-mail de falha ao TI naquela hora (a chave `FalhaDoAgente|<data-hora>` impede repetição) e peça a ele para restaurar o valor correto. Você nunca lê nem grava o valor do token.

- [ ] **Step 4: Limpeza**

Apague os serviços de teste e os `cr40f_alertaoperacao` gerados (alertas primeiro, depois serviços). Reponha os destinatários reais das variáveis com o Renan. Nenhum registro de teste fica no DEV.

- [ ] **Step 5: Medição do custo e do volume de ações**

Durante 7 dias (ou o que o Renan decidir), registre: consultas ao Google por dia (relatório de uso do Google Cloud, pedido ao Renan), número de execuções do Verificar e de ações por execução (histórico do Power Automate), e quantos serviços do PROD teriam entrado na janela. Compare com a estimativa da spec e com o limite de 40.000 ações por 24 h; se estourar, abra o item "migrar o Verificar para Azure Function".

- [ ] **Step 6: Registrar o estado na spec e commitar**

Acrescente à spec a seção `## Estado em <data>`: o que foi provado, a taxa de geocoding da Task 6, o custo observado até o momento, lacunas e pendências para o Renan (por exemplo, push pendente, papel de segurança da tabela de alertas, Fase 0 e Fase 3).
```bash
git add docs/superpowers/specs/2026-10-15-alertas-operacao-proativos-design.md
git commit -m "Alertas: provas no DEV das sete regras, dedupe e encerramento, e estado registrado na spec"
```

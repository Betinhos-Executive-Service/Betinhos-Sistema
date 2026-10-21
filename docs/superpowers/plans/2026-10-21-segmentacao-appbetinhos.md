# Segmentação da AppBetinhos em 4 soluções — plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** trocar a solução única AppBetinhos por `BetinhosCore`, `BetinhosAutomacao`, `BetinhosInterface` e `BetinhosMotoristas` no TEST e no PROD. Cada deploy passa a importar só o que mudou, sem perda de dado.

**Arquitetura:** no DEV, a AppBetinhos continua como caixa de entrada. Um distribuidor PowerShell classifica cada componente com regras em JSON (lógica pura em Node, testada) e o coloca na solução certa; uma conferência bloqueia deploy com componente sem dono ou com dependência para cima. Fotos JSON do ambiente, comparadas por um módulo Node, provam que nada se perde no ensaio do TEST e na migração do PROD. Depois da migração, um deploy por solução importa só os pacotes cujo conteúdo mudou.

**Stack:**
- Windows PowerShell 5.1 (MSAL.PS e `Invoke-RestMethod` na Web API v9.2);
- Node 24 só com módulos nativos (`node:test`, `node:fs`);
- pac CLI 2.11;
- padrão de testes do `packages/deploy` (`*.test.mjs` com `node --test`; `testa-*.ps1` com `Invoke-RestMethod` simulado).

**Spec:** `docs/superpowers/specs/2026-10-21-segmentacao-appbetinhos-design.md`

## Restrições globais

- Publisher das 4 soluções: o da AppBetinhos (`DefaultPublisherorg23b93544`, prefixo `new`).
- Soluções, nesta ordem de dependência: `BetinhosCore`, `BetinhosAutomacao`, `BetinhosInterface`, `BetinhosMotoristas`.
- Dependências permitidas:
  - Core: nenhuma das outras três;
  - Automação: Core;
  - Interface: Core e Automação;
  - Motoristas: Core e Automação.
- Escrita só no DEV (`org23b93544.crm2.dynamics.com`). TEST (`appbetinhostest.crm2.dynamics.com`) só nas tarefas da Fase 2 e com o ok de cópia do Renan. PROD (`orgf261ae8e.crm2.dynamics.com`) só leitura, salvo a Fase 4, com ok explícito no dia.
- Nunca rodar `pnpm push`, `pnpm wr` de publicação, `sitemap:*`, `push:plugin:*` ou `provision-*` fora da `main` no checkout principal (CLAUDE.md do repo).
- Valor de variável de ambiente (tipo 381) nunca viaja em solução. Fotos guardam só hash SHA-256 dos valores, nunca o valor.
- Scripts `.ps1` com mensagens sem acento: o Windows PowerShell 5.1 lê `.ps1` sem BOM como ANSI.
- Arquivos JSON gravados por PowerShell em UTF-8 sem BOM (`Write-JsonFile`). O Node remove BOM ao ler (`lerJson`).
- `ConvertTo-Json` sempre com `-InputObject` e `-Depth 12`; no PS 5.1, um array de um item vira objeto quando vem por pipe.
- Sem dependências npm novas.
- Antes de cada commit ou PR com código: skills `qualidade-antes-do-pr` e `verificacao-manter` (CLAUDE.md global).
- Commits em português e detalhados, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Desvio da spec decidido neste plano

A spec põe o upgrade da AppBetinhos vazia como caminho principal e a desinstalação como alternativa. Como a AppBetinhos continua viva no DEV como caixa de entrada, o DEV não consegue exportar uma AppBetinhos vazia sem esvaziar a caixa de entrada. Por isso, o plano usa a **desinstalação da AppBetinhos gerenciada** (`pac solution delete`) no TEST e no PROD: o Dataverse só exclui o componente que nenhuma outra solução gerenciada tem. A Tarefa 10 prova isso no TEST antes de qualquer coisa no PROD. Se a prova falhar, o plano para e volta para a spec.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/deploy/solucoes/regras.json` | Solução por tipo, exceções por nome/app/BPF, tipos proibidos, dependências permitidas, steps com configuração segura |
| `packages/deploy/solucoes/arquivo.mjs` | `lerJson(caminho)` sem BOM |
| `packages/deploy/solucoes/classificar.mjs` (+ `.test.mjs`) | `validarRegras`, `chaveTipo`, `classificar` e CLI |
| `packages/deploy/solucoes/conferir.mjs` (+ `.test.mjs`) | `conferirCobertura`, `conferirDependencias`, `conferenciaOk` e CLI (código 1 se falhar) |
| `packages/deploy/solucoes/comparar-fotos.mjs` (+ `.test.mjs`) | `compararFotos`, `temPerda` e CLI (código 1 se houver perda) |
| `packages/deploy/solucoes/qual-mudou.mjs` (+ `.test.mjs`) | `solucoesAlteradas` e CLI |
| `packages/deploy/solucoes/dataverse.ps1` | Conexão (secret de CI ou MSAL.PS), trava de host, leitura paginada, ações, JSON |
| `packages/deploy/solucoes/solucoes.ps1` | Ids de solução, componentes com nome, inclusão em solução, dependências ausentes, hash de pacote, perfil do pac, steps sem configuração segura |
| `packages/deploy/solucoes/testa-solucoes.ps1` | Testes do `solucoes.ps1` e `dataverse.ps1` com respostas simuladas |
| `packages/deploy/solucoes/distribuir-solucoes.ps1` | CLI: simulação, `-Aplicar`, `-SomenteConferir` (só DEV) |
| `packages/deploy/solucoes/foto-ambiente.ps1` | CLI: foto JSON de um ambiente (só leitura) |
| `packages/deploy/solucoes/ultimo-deploy-test.json`, `ultimo-deploy-prod.json` | Hash do pacote de cada solução no último deploy bem-sucedido |
| `packages/deploy/prod/deploy-solucoes.ps1` | Deploy por solução para TEST e PROD |
| `packages/deploy/package.json` | Script `test` inclui os novos testes |
| `.claude/skills/verificar-solucoes/SKILL.md` | Verificação da área (criada via `verificacao-criar`) |
| `docs/auditoria/ensaio-segmentacao-<data>.md` | Relatório do ensaio (Fase 2) |

---

## Fase 1 — Ferramentas no DEV

### Tarefa 1: regras e classificador

**Files:**
- Create: `packages/deploy/solucoes/regras.json`
- Create: `packages/deploy/solucoes/arquivo.mjs`
- Create: `packages/deploy/solucoes/classificar.mjs`
- Test: `packages/deploy/solucoes/classificar.test.mjs`

**Interfaces:**
- Produces:
  - `lerJson(caminho: string): Promise<any>`;
  - `validarRegras(regras): void` (lança erro);
  - `chaveTipo(c: {tipo:number, entidade?:string}): string`;
  - `classificar(componentes, regras): { atribuicoes: Array<C & {solucao}>, semRegra: C[], proibidos: Array<C & {motivo}> }`, com `C = {id, tipo, entidade, nome, app, bpf, comportamento}`;
  - CLI: `node classificar.mjs <componentes.json> <regras.json>` imprime o JSON do resultado.

- [ ] **Passo 1: escrever `regras.json`**

```json
{
  "solucoes": ["BetinhosCore", "BetinhosAutomacao", "BetinhosInterface", "BetinhosMotoristas"],
  "permitidas": {
    "BetinhosCore": [],
    "BetinhosAutomacao": ["BetinhosCore"],
    "BetinhosInterface": ["BetinhosCore", "BetinhosAutomacao"],
    "BetinhosMotoristas": ["BetinhosCore", "BetinhosAutomacao"]
  },
  "porTipo": {
    "1": "BetinhosCore",
    "9": "BetinhosCore",
    "20": "BetinhosCore",
    "70": "BetinhosCore",
    "372": "BetinhosCore",
    "380": "BetinhosCore",
    "431": "BetinhosCore",
    "dvtablesearch": "BetinhosCore",
    "dvtablesearchentity": "BetinhosCore",
    "29": "BetinhosAutomacao",
    "91": "BetinhosAutomacao",
    "92": "BetinhosAutomacao",
    "customapi": "BetinhosAutomacao",
    "customapirequestparameter": "BetinhosAutomacao",
    "customapiresponseproperty": "BetinhosAutomacao",
    "pluginpackage": "BetinhosAutomacao",
    "connectionreference": "BetinhosAutomacao",
    "60": "BetinhosInterface",
    "61": "BetinhosInterface",
    "62": "BetinhosInterface",
    "80": "BetinhosInterface",
    "300": "BetinhosInterface",
    "appaction": "BetinhosInterface",
    "appaction_appactionrule_classicrules": "BetinhosInterface",
    "appelement": "BetinhosInterface",
    "appsetting": "BetinhosInterface",
    "organizationsetting": "BetinhosInterface",
    "settingdefinition": "BetinhosInterface",
    "mcpserver": "BetinhosMotoristas"
  },
  "excecoes": [
    { "tipo": "61", "nomes": ["new_app-motoristas-v2", "new_appmotoristas_push_redirect.js", "new_comunicadodestinatario_redirect.js"], "solucao": "BetinhosMotoristas" },
    { "tipo": "80", "nomes": ["new_AppMotoristasv2"], "solucao": "BetinhosMotoristas" },
    { "tipo": "62", "nomes": ["new_AppMotoristasv2"], "solucao": "BetinhosMotoristas" },
    { "tipo": "300", "nomes": ["new_appbetinhosmotoristas_8fcab"], "solucao": "BetinhosMotoristas" },
    { "tipo": "appsetting", "app": "new_AppMotoristasv2", "solucao": "BetinhosMotoristas" },
    { "tipo": "appelement", "app": "new_AppMotoristasv2", "solucao": "BetinhosMotoristas" },
    { "tipo": "1", "bpf": true, "solucao": "BetinhosAutomacao" }
  ],
  "proibidos": {
    "381": "Valor de variavel de ambiente nao viaja em solucao: remova da AppBetinhos (RemoveSolutionComponent) e mantenha o valor em cada ambiente."
  },
  "stepsSeguros": [
    "Sincronizar veiculo atual pela Infleet",
    "Gerar link de acompanhamento",
    "Revogar link de acompanhamento ao sair de Programado",
    "Resolver veiculo do servico pela Infleet"
  ]
}
```

- [ ] **Passo 2: escrever o teste que falha** (`classificar.test.mjs`)

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chaveTipo, classificar, validarRegras } from './classificar.mjs'

const regras = JSON.parse(await readFile(new URL('./regras.json', import.meta.url), 'utf8'))
const c = (tipo, extra = {}) => ({ id: `id-${tipo}-${extra.nome ?? ''}`, tipo, entidade: null, nome: '', app: null, bpf: false, comportamento: 0, ...extra })
const solucaoDe = (comp) => classificar([comp], regras).atribuicoes[0]?.solucao

test('regras.json é válido', () => assert.doesNotThrow(() => validarRegras(regras)))
test('tipo abaixo de 10000 vira número em texto', () => assert.equal(chaveTipo({ tipo: 61 }), '61'))
test('tipo acima de 10000 usa a entidade', () => assert.equal(chaveTipo({ tipo: 10036, entidade: 'customapi' }), 'customapi'))
test('tabela vai para o Core', () => assert.equal(solucaoDe(c(1, { nome: 'cr40f_reservadeveculos' })), 'BetinhosCore'))
test('tabela de BPF vai para a Automação', () => assert.equal(solucaoDe(c(1, { bpf: true })), 'BetinhosAutomacao'))
test('fluxo vai para a Automação', () => assert.equal(solucaoDe(c(29)), 'BetinhosAutomacao'))
test('Custom API e parâmetros vão para a Automação', () => {
  assert.equal(solucaoDe(c(10036, { entidade: 'customapi' })), 'BetinhosAutomacao')
  assert.equal(solucaoDe(c(10037, { entidade: 'customapirequestparameter' })), 'BetinhosAutomacao')
})
test('WebResource comum vai para a Interface', () => assert.equal(solucaoDe(c(61, { nome: 'cr40f_SistemaBetinhos.html' })), 'BetinhosInterface'))
test('WebResource do app de motoristas vai para Motoristas', () => assert.equal(solucaoDe(c(61, { nome: 'new_app-motoristas-v2' })), 'BetinhosMotoristas'))
test('app e sitemap de motoristas vão para Motoristas', () => {
  assert.equal(solucaoDe(c(80, { nome: 'new_AppMotoristasv2' })), 'BetinhosMotoristas')
  assert.equal(solucaoDe(c(62, { nome: 'new_AppMotoristasv2' })), 'BetinhosMotoristas')
  assert.equal(solucaoDe(c(80, { nome: 'cr40f_ModelDrivenBetinhos' })), 'BetinhosInterface')
})
test('configuração de app segue o app pai', () => {
  assert.equal(solucaoDe(c(10091, { entidade: 'appsetting', app: 'new_AppMotoristasv2' })), 'BetinhosMotoristas')
  assert.equal(solucaoDe(c(10091, { entidade: 'appsetting', app: 'cr40f_ModelDrivenBetinhos' })), 'BetinhosInterface')
})
test('servidor MCP vai para Motoristas', () => assert.equal(solucaoDe(c(10288, { entidade: 'mcpserver' })), 'BetinhosMotoristas'))
test('valor de variável é proibido', () => {
  const r = classificar([c(381, { nome: 'new_EmailAdminAvisos' })], regras)
  assert.equal(r.proibidos.length, 1)
  assert.equal(r.atribuicoes.length, 0)
})
test('tipo sem regra não é adivinhado', () => {
  const r = classificar([c(10999, { entidade: 'tipo_novo' })], regras)
  assert.equal(r.semRegra.length, 1)
  assert.equal(r.atribuicoes.length, 0)
})
test('regra que aponta para solução desconhecida falha', () => {
  assert.throws(() => validarRegras({ ...regras, porTipo: { ...regras.porTipo, '61': 'Outra' } }), /Outra/)
})
```

- [ ] **Passo 3: rodar e ver falhar**

Rodar: `node --test packages/deploy/solucoes/classificar.test.mjs`
Esperado: FAIL com `Cannot find module ... classificar.mjs`.

- [ ] **Passo 4: implementar `arquivo.mjs` e `classificar.mjs`**

```js
// arquivo.mjs
import { readFile } from 'node:fs/promises'

// Os JSON vêm do PowerShell 5.1, que pode gravar com BOM.
export async function lerJson(caminho) {
  return JSON.parse((await readFile(caminho, 'utf8')).replace(/^﻿/, ''))
}
```

```js
// classificar.mjs
import { pathToFileURL } from 'node:url'
import { lerJson } from './arquivo.mjs'

// Decide a solução de cada componente da caixa de entrada (AppBetinhos no DEV).
// Tipos < 10000 são fixos no Dataverse; os >= 10000 mudam por ambiente e chegam pelo nome da entidade.
export function chaveTipo(c) {
  return c.tipo < 10000 ? String(c.tipo) : c.entidade
}

export function validarRegras(regras) {
  const conhecidas = new Set(regras.solucoes)
  const usadas = [...Object.values(regras.porTipo), ...regras.excecoes.map((e) => e.solucao), ...Object.keys(regras.permitidas)]
  const desconhecidas = usadas.filter((s) => !conhecidas.has(s))
  if (desconhecidas.length) throw new Error(`Solucao desconhecida em regras.json: ${[...new Set(desconhecidas)].join(', ')}`)
}

function casa(excecao, c) {
  if (excecao.nomes) return excecao.nomes.includes(c.nome)
  if (excecao.app) return excecao.app === c.app
  if (excecao.bpf) return c.bpf === true
  return false
}

export function classificar(componentes, regras) {
  const atribuicoes = []
  const semRegra = []
  const proibidos = []
  for (const c of componentes) {
    const chave = chaveTipo(c)
    if (regras.proibidos[chave]) {
      proibidos.push({ ...c, motivo: regras.proibidos[chave] })
      continue
    }
    const excecao = regras.excecoes.find((e) => e.tipo === chave && casa(e, c))
    const solucao = excecao ? excecao.solucao : regras.porTipo[chave]
    if (solucao) atribuicoes.push({ ...c, solucao })
    else semRegra.push(c)
  }
  return { atribuicoes, semRegra, proibidos }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [componentesPath, regrasPath] = process.argv.slice(2)
  const regras = await lerJson(regrasPath)
  validarRegras(regras)
  process.stdout.write(JSON.stringify(classificar(await lerJson(componentesPath), regras)))
}
```

- [ ] **Passo 5: rodar e ver passar**

Rodar: `node --test packages/deploy/solucoes/classificar.test.mjs`
Esperado: 15 testes passam.

- [ ] **Passo 6: commit**

```bash
git add packages/deploy/solucoes/regras.json packages/deploy/solucoes/arquivo.mjs packages/deploy/solucoes/classificar.mjs packages/deploy/solucoes/classificar.test.mjs
git commit -m "feat(solucoes): regras de distribuição e classificador das 4 soluções"
```

### Tarefa 2: conferência de cobertura e dependências

**Files:**
- Create: `packages/deploy/solucoes/conferir.mjs`
- Test: `packages/deploy/solucoes/conferir.test.mjs`

**Interfaces:**
- Consumes: `lerJson` (Tarefa 1).
- Produces:
  - `conferirCobertura({caixa: string[], porSolucao: {[sol]: string[]}, atribuicoes: {id, solucao}[]}): {semDono: string[], emDuas: {id, solucoes}[], foraDoLugar: {id, esta, deveria}[]}`;
  - `conferirDependencias({ausentes: {[sol]: {requerido, tipo}[]}, porSolucao, permitidas}): {solucao, requerido, tipo, donoDoRequerido}[]`;
  - `conferenciaOk(cobertura, violacoes): boolean`;
  - CLI: `node conferir.mjs <entrada.json>` imprime `{cobertura, violacoes, ok}` e sai com código 1 se `ok` for falso.

- [ ] **Passo 1: escrever o teste que falha** (`conferir.test.mjs`)

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conferenciaOk, conferirCobertura, conferirDependencias } from './conferir.mjs'

const permitidas = {
  BetinhosCore: [],
  BetinhosAutomacao: ['BetinhosCore'],
  BetinhosInterface: ['BetinhosCore', 'BetinhosAutomacao'],
  BetinhosMotoristas: ['BetinhosCore', 'BetinhosAutomacao'],
}

test('tudo distribuído e no lugar passa', () => {
  const cobertura = conferirCobertura({
    caixa: ['a', 'b'],
    porSolucao: { BetinhosCore: ['a'], BetinhosInterface: ['b'] },
    atribuicoes: [{ id: 'a', solucao: 'BetinhosCore' }, { id: 'b', solucao: 'BetinhosInterface' }],
  })
  assert.deepEqual(cobertura, { semDono: [], emDuas: [], foraDoLugar: [] })
  assert.equal(conferenciaOk(cobertura, []), true)
})
test('componente da caixa sem dono aparece', () => {
  const r = conferirCobertura({ caixa: ['a', 'x'], porSolucao: { BetinhosCore: ['a'] }, atribuicoes: [] })
  assert.deepEqual(r.semDono, ['x'])
})
test('componente em duas soluções aparece', () => {
  const r = conferirCobertura({ caixa: ['a'], porSolucao: { BetinhosCore: ['a'], BetinhosInterface: ['a'] }, atribuicoes: [] })
  assert.deepEqual(r.emDuas, [{ id: 'a', solucoes: ['BetinhosCore', 'BetinhosInterface'] }])
})
test('componente na solução errada aparece', () => {
  const r = conferirCobertura({ caixa: ['a'], porSolucao: { BetinhosInterface: ['a'] }, atribuicoes: [{ id: 'a', solucao: 'BetinhosCore' }] })
  assert.deepEqual(r.foraDoLugar, [{ id: 'a', esta: 'BetinhosInterface', deveria: 'BetinhosCore' }])
})
test('Interface depender de Core é permitido', () => {
  const v = conferirDependencias({ ausentes: { BetinhosInterface: [{ requerido: 't', tipo: 1 }] }, porSolucao: { BetinhosCore: ['t'] }, permitidas })
  assert.deepEqual(v, [])
})
test('Core depender de Interface é violação', () => {
  const v = conferirDependencias({ ausentes: { BetinhosCore: [{ requerido: 'w', tipo: 61 }] }, porSolucao: { BetinhosInterface: ['w'] }, permitidas })
  assert.deepEqual(v, [{ solucao: 'BetinhosCore', requerido: 'w', tipo: 61, donoDoRequerido: 'BetinhosInterface' }])
})
test('dependência de componente do sistema (fora das 4) é ignorada', () => {
  const v = conferirDependencias({ ausentes: { BetinhosCore: [{ requerido: 'systemuser', tipo: 1 }] }, porSolucao: {}, permitidas })
  assert.deepEqual(v, [])
})
test('violação reprova a conferência', () => assert.equal(conferenciaOk({ semDono: [], emDuas: [], foraDoLugar: [] }, [{}]), false))
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `node --test packages/deploy/solucoes/conferir.test.mjs`
Esperado: FAIL com módulo não encontrado.

- [ ] **Passo 3: implementar `conferir.mjs`**

```js
import { pathToFileURL } from 'node:url'
import { lerJson } from './arquivo.mjs'

function donosPorId(porSolucao) {
  const donos = new Map()
  for (const [solucao, ids] of Object.entries(porSolucao)) {
    for (const id of ids) donos.set(id, [...(donos.get(id) ?? []), solucao])
  }
  return donos
}

// Todo componente da caixa de entrada precisa estar em exatamente uma das 4, a que a regra indica.
export function conferirCobertura({ caixa, porSolucao, atribuicoes }) {
  const donos = donosPorId(porSolucao)
  const esperado = new Map(atribuicoes.map((a) => [a.id, a.solucao]))
  return {
    semDono: caixa.filter((id) => !donos.has(id)),
    emDuas: [...donos].filter(([, s]) => s.length > 1).map(([id, solucoes]) => ({ id, solucoes })),
    foraDoLugar: [...donos]
      .filter(([id, s]) => s.length === 1 && esperado.has(id) && s[0] !== esperado.get(id))
      .map(([id, s]) => ({ id, esta: s[0], deveria: esperado.get(id) })),
  }
}

// Dependência ausente que pertence a outra das 4 só é aceita se a camada permitir (nunca para cima).
export function conferirDependencias({ ausentes, porSolucao, permitidas }) {
  const donos = donosPorId(porSolucao)
  const violacoes = []
  for (const [solucao, deps] of Object.entries(ausentes)) {
    for (const d of deps) {
      const dono = donos.get(d.requerido)?.[0]
      if (dono && dono !== solucao && !permitidas[solucao].includes(dono)) {
        violacoes.push({ solucao, requerido: d.requerido, tipo: d.tipo, donoDoRequerido: dono })
      }
    }
  }
  return violacoes
}

export function conferenciaOk(cobertura, violacoes) {
  return !cobertura.semDono.length && !cobertura.emDuas.length && !cobertura.foraDoLugar.length && !violacoes.length
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const entrada = await lerJson(process.argv[2])
  const cobertura = conferirCobertura(entrada)
  const violacoes = conferirDependencias(entrada)
  const ok = conferenciaOk(cobertura, violacoes)
  process.stdout.write(JSON.stringify({ cobertura, violacoes, ok }))
  process.exitCode = ok ? 0 : 1
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `node --test packages/deploy/solucoes/conferir.test.mjs`
Esperado: 8 testes passam.

- [ ] **Passo 5: commit**

```bash
git add packages/deploy/solucoes/conferir.mjs packages/deploy/solucoes/conferir.test.mjs
git commit -m "feat(solucoes): conferência de cobertura e de dependências entre camadas"
```

### Tarefa 3: comparação de fotos

**Files:**
- Create: `packages/deploy/solucoes/comparar-fotos.mjs`
- Test: `packages/deploy/solucoes/comparar-fotos.test.mjs`

**Interfaces:**
- Consumes: `lerJson` (Tarefa 1).
- Produces:
  - formato de foto `Foto = { ambiente, quando, registros: {[tabela]: number}, aproximados: string[], fluxos: {[id]: {nome, estado}}, steps: {[id]: {nome, estado, seguro}}, variaveis: {[schema]: string|null}, componentes: {[id]: string[]}, versoes: {[item]: string} }`;
  - `compararFotos(antes: Foto, depois: Foto): Diferencas`;
  - `temPerda(d: Diferencas): boolean`;
  - CLI: `node comparar-fotos.mjs <antes.json> <depois.json>` imprime as diferenças e sai com código 1 se `temPerda`.

- [ ] **Passo 1: escrever o teste que falha** (`comparar-fotos.test.mjs`)

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararFotos, temPerda } from './comparar-fotos.mjs'

const foto = (extra = {}) => ({
  ambiente: 'x', quando: 't', aproximados: [],
  registros: { cr40f_a: 10, cr40f_b: 5 },
  fluxos: { f1: { nome: 'Fluxo 1', estado: 1 } },
  steps: { s1: { nome: 'Step 1', estado: 0, seguro: true } },
  variaveis: { new_X: 'h1' },
  componentes: { c1: ['AppBetinhos'] },
  versoes: { sistemaBetinhos: 'v0.0.43' },
  ...extra,
})

test('fotos iguais não têm perda', () => assert.equal(temPerda(compararFotos(foto(), foto())), false))
test('registro a mais não é perda, mas aparece', () => {
  const d = compararFotos(foto(), foto({ registros: { cr40f_a: 11, cr40f_b: 5 } }))
  assert.deepEqual(d.registrosMudaram, [{ tabela: 'cr40f_a', antes: 10, depois: 11 }])
  assert.equal(temPerda(d), false)
})
test('registro a menos é perda', () => assert.equal(temPerda(compararFotos(foto(), foto({ registros: { cr40f_a: 9, cr40f_b: 5 } }))), true))
test('tabela que sumiu é perda', () => {
  const d = compararFotos(foto(), foto({ registros: { cr40f_a: 10 } }))
  assert.deepEqual(d.tabelasSumiram, ['cr40f_b'])
  assert.equal(temPerda(d), true)
})
test('contagem aproximada não acusa queda', () => {
  const d = compararFotos(foto({ aproximados: ['cr40f_a'] }), foto({ aproximados: ['cr40f_a'], registros: { cr40f_a: 9, cr40f_b: 5 } }))
  assert.deepEqual(d.registrosCairam, [])
})
test('fluxo desligado é perda', () => assert.equal(temPerda(compararFotos(foto(), foto({ fluxos: { f1: { nome: 'Fluxo 1', estado: 0 } } }))), true))
test('step sem configuração segura é perda', () => {
  const d = compararFotos(foto(), foto({ steps: { s1: { nome: 'Step 1', estado: 0, seguro: false } } }))
  assert.deepEqual(d.stepsPerderamSeguro, [{ id: 's1', nome: 'Step 1' }])
  assert.equal(temPerda(d), true)
})
test('variável com valor diferente é perda', () => assert.equal(temPerda(compararFotos(foto(), foto({ variaveis: { new_X: 'h2' } }))), true))
test('troca de dono não é perda, mas aparece', () => {
  const d = compararFotos(foto(), foto({ componentes: { c1: ['BetinhosCore'] } }))
  assert.deepEqual(d.donosMudaram, [{ id: 'c1', antes: ['AppBetinhos'], depois: ['BetinhosCore'] }])
  assert.equal(temPerda(d), false)
})
test('componente sem nenhum dono é perda', () => assert.equal(temPerda(compararFotos(foto(), foto({ componentes: {} }))), true))
test('ordem dos donos não importa', () => {
  const d = compararFotos(foto({ componentes: { c1: ['B', 'A'] } }), foto({ componentes: { c1: ['A', 'B'] } }))
  assert.deepEqual(d.donosMudaram, [])
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `node --test packages/deploy/solucoes/comparar-fotos.test.mjs`
Esperado: FAIL com módulo não encontrado.

- [ ] **Passo 3: implementar `comparar-fotos.mjs`**

```js
import { pathToFileURL } from 'node:url'
import { lerJson } from './arquivo.mjs'

const ordenado = (lista) => [...lista].sort()

// Diferenças entre duas fotos do mesmo ambiente. Perda = algo que existia e sumiu, caiu ou mudou de valor.
export function compararFotos(antes, depois) {
  const d = {
    registrosCairam: [], registrosMudaram: [], tabelasSumiram: [],
    fluxosSumiram: [], fluxosMudaramEstado: [],
    stepsSumiram: [], stepsMudaramEstado: [], stepsPerderamSeguro: [],
    variaveisSumiram: [], variaveisMudaram: [],
    componentesSumiram: [], donosMudaram: [], versoes: [],
  }
  const aproximados = new Set([...(antes.aproximados ?? []), ...(depois.aproximados ?? [])])
  for (const [tabela, n] of Object.entries(antes.registros)) {
    if (!(tabela in depois.registros)) d.tabelasSumiram.push(tabela)
    else if (depois.registros[tabela] !== n) {
      const item = { tabela, antes: n, depois: depois.registros[tabela] }
      if (item.depois < n && !aproximados.has(tabela)) d.registrosCairam.push(item)
      else d.registrosMudaram.push(item)
    }
  }
  for (const [id, f] of Object.entries(antes.fluxos)) {
    const g = depois.fluxos[id]
    if (!g) d.fluxosSumiram.push({ id, nome: f.nome })
    else if (g.estado !== f.estado) d.fluxosMudaramEstado.push({ id, nome: f.nome, antes: f.estado, depois: g.estado })
  }
  for (const [id, s] of Object.entries(antes.steps)) {
    const t = depois.steps[id]
    if (!t) { d.stepsSumiram.push({ id, nome: s.nome }); continue }
    if (t.estado !== s.estado) d.stepsMudaramEstado.push({ id, nome: s.nome, antes: s.estado, depois: t.estado })
    if (s.seguro && !t.seguro) d.stepsPerderamSeguro.push({ id, nome: s.nome })
  }
  for (const [nome, hash] of Object.entries(antes.variaveis)) {
    if (!(nome in depois.variaveis)) d.variaveisSumiram.push(nome)
    else if (depois.variaveis[nome] !== hash) d.variaveisMudaram.push(nome)
  }
  for (const [id, donos] of Object.entries(antes.componentes)) {
    const novos = depois.componentes[id]
    if (!novos || !novos.length) d.componentesSumiram.push(id)
    else if (ordenado(novos).join() !== ordenado(donos).join()) d.donosMudaram.push({ id, antes: donos, depois: novos })
  }
  for (const item of Object.keys(antes.versoes)) {
    if (antes.versoes[item] !== depois.versoes[item]) d.versoes.push({ item, antes: antes.versoes[item], depois: depois.versoes[item] })
  }
  return d
}

export function temPerda(d) {
  return [d.registrosCairam, d.tabelasSumiram, d.fluxosSumiram, d.fluxosMudaramEstado, d.stepsSumiram, d.stepsMudaramEstado,
    d.stepsPerderamSeguro, d.variaveisSumiram, d.variaveisMudaram, d.componentesSumiram].some((lista) => lista.length > 0)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const d = compararFotos(await lerJson(process.argv[2]), await lerJson(process.argv[3]))
  process.stdout.write(JSON.stringify(d, null, 2))
  process.exitCode = temPerda(d) ? 1 : 0
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `node --test packages/deploy/solucoes/comparar-fotos.test.mjs`
Esperado: 11 testes passam.

- [ ] **Passo 5: commit**

```bash
git add packages/deploy/solucoes/comparar-fotos.mjs packages/deploy/solucoes/comparar-fotos.test.mjs
git commit -m "feat(solucoes): comparação de fotos do ambiente para provar que nada se perde"
```

### Tarefa 4: bibliotecas PowerShell (conexão e solução)

**Files:**
- Create: `packages/deploy/solucoes/dataverse.ps1`
- Create: `packages/deploy/solucoes/solucoes.ps1`
- Test: `packages/deploy/solucoes/testa-solucoes.ps1`

**Interfaces:**
- Produces (`dataverse.ps1`, dot-source):
  - `Connect-Dataverse([string] $EnvironmentUrl, [string[]] $HostsPermitidos) -> @{ Api; Url; Host; Headers }`;
  - `Read-DvAll($Dv, [string] $Path) -> object[]`, que segue `@odata.nextLink`;
  - `Invoke-DvAction($Dv, [string] $Name, $Body)`;
  - `Write-JsonFile([string] $Path, $Value)`;
  - `Read-JsonFile([string] $Path)`;
  - `Write-Step([string] $Message)`.
- Produces (`solucoes.ps1`, dot-source depois do `dataverse.ps1`):
  - `$script:Solucoes` (as 4, em ordem);
  - `Get-SolucaoId($Dv, $UniqueName) -> string|null`;
  - `Get-TiposPorEntidade($Dv) -> hashtable[int -> string]`;
  - `Get-ComponentesDaSolucao($Dv, $SolucaoId, $TiposPorEntidade) -> @{id;tipo;entidade;nome;app;bpf;comportamento}[]`;
  - `Add-ComponenteNaSolucao($Dv, $Componente, $Solucao)`;
  - `New-SolucaoSeFaltar($Dv, $UniqueName, $PublisherId) -> bool`;
  - `Get-DependenciasAusentes($Dv, $Solucao) -> @{requerido;tipo}[]`;
  - `Get-HashDoPacote([string] $ZipPath) -> string`;
  - `Select-PacProfile([string] $Url)`;
  - `Get-StepsSemConfigSegura($Dv, [string[]] $Nomes) -> string[]`.

- [ ] **Passo 1: confirmar nomes lógicos na metadata do DEV (só leitura).** Os lookups de app pai precisam existir antes de serem usados no código. Rodar:

```powershell
$t = az account get-access-token --resource https://org23b93544.crm2.dynamics.com --query accessToken -o tsv
$h = @{ Authorization = "Bearer $t"; Accept = "application/json" }
foreach ($e in "appsetting", "appelement") {
  (Invoke-RestMethod -Headers $h -Uri "https://org23b93544.crm2.dynamics.com/api/data/v9.2/EntityDefinitions(LogicalName='$e')/Attributes?`$select=LogicalName&`$filter=AttributeType eq Microsoft.Dynamics.CRM.AttributeTypeCode'Lookup'").value.LogicalName
}
```

Esperado: as duas listas contêm `parentappmoduleid`. Se o nome for outro, use o nome real em `Get-ComponentesDaSolucao` (passo 4) e registre no commit.

- [ ] **Passo 2: escrever o teste que falha** (`testa-solucoes.ps1`, no padrão do `testa-chunk-cleanup.ps1`)

```powershell
# Testa dataverse.ps1 e solucoes.ps1 com respostas simuladas, em StrictMode, sem tocar no Dataverse.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'dataverse.ps1')
. (Join-Path $PSScriptRoot 'solucoes.ps1')

$script:respostas = @()
$script:chamadas = @()
function Invoke-RestMethod {
  param($Method, $Uri, $Headers, $Body, $ContentType)
  $script:chamadas += [pscustomobject]@{ Method = $Method; Uri = $Uri; Body = $Body }
  $r = $script:respostas[0]
  $script:respostas = @($script:respostas | Select-Object -Skip 1)
  return $r
}
$dv = @{ Api = 'https://x/api/data/v9.2'; Url = 'https://x'; Host = 'x'; Headers = @{} }
$falhas = 0
function Confere([bool] $ok, [string] $nome) { if ($ok) { Write-Host "ok    $nome" } else { Write-Host "FALHA $nome"; $script:falhas++ } }

# Read-DvAll: uma pagina sem nextLink e duas paginas com nextLink
$script:respostas = @([pscustomobject]@{ value = @(1, 2) })
Confere ((Read-DvAll $dv 'a').Count -eq 2) 'pagina unica sem nextLink'
$script:respostas = @([pscustomobject]@{ value = @(1); '@odata.nextLink' = 'https://x/n' }, [pscustomobject]@{ value = @(2, 3) })
$script:chamadas = @()
Confere ((Read-DvAll $dv 'a').Count -eq 3 -and $script:chamadas[1].Uri -eq 'https://x/n') 'segue nextLink'

# Add-ComponenteNaSolucao: subcomponentes conforme o comportamento
$script:respostas = @($null); $script:chamadas = @()
Add-ComponenteNaSolucao $dv @{ id = 'abc'; tipo = 1; comportamento = 0 } 'BetinhosCore'
$b = $script:chamadas[0].Body | ConvertFrom-Json
Confere ($b.ComponentType -eq 1 -and $b.DoNotIncludeSubcomponents -eq $false -and $b.AddRequiredComponents -eq $false -and $b.SolutionUniqueName -eq 'BetinhosCore') 'tabela com subcomponentes'
$script:respostas = @($null); $script:chamadas = @()
Add-ComponenteNaSolucao $dv @{ id = 'def'; tipo = 1; comportamento = 1 } 'BetinhosCore'
Confere (($script:chamadas[0].Body | ConvertFrom-Json).DoNotIncludeSubcomponents -eq $true) 'tabela sem subcomponentes'

# Get-HashDoPacote: ignora solution.xml e a ordem das entradas; muda quando o conteudo muda
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Novo-Zip([string] $Caminho, [object[]] $Entradas) {
  if (Test-Path $Caminho) { Remove-Item $Caminho }
  $z = [IO.Compression.ZipFile]::Open($Caminho, 'Create')
  try { foreach ($e in $Entradas) { $w = New-Object IO.StreamWriter($z.CreateEntry($e[0]).Open()); $w.Write($e[1]); $w.Dispose() } } finally { $z.Dispose() }
}
$tmp = [IO.Path]::GetTempPath()
Novo-Zip "$tmp\h1.zip" @(@('solution.xml', '<v>1</v>'), @('customizations.xml', 'A'), @('WebResources/x', 'B'))
Novo-Zip "$tmp\h2.zip" @(@('WebResources/x', 'B'), @('customizations.xml', 'A'), @('solution.xml', '<v>2</v>'))
Novo-Zip "$tmp\h3.zip" @(@('solution.xml', '<v>1</v>'), @('customizations.xml', 'A'), @('WebResources/x', 'C'))
Confere ((Get-HashDoPacote "$tmp\h1.zip") -eq (Get-HashDoPacote "$tmp\h2.zip")) 'hash ignora versao e ordem'
Confere ((Get-HashDoPacote "$tmp\h1.zip") -ne (Get-HashDoPacote "$tmp\h3.zip")) 'hash muda com o conteudo'

if ($falhas) { throw "$falhas teste(s) falharam" }
```

- [ ] **Passo 3: rodar e ver falhar**

Rodar: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/testa-solucoes.ps1`
Esperado: erro de arquivo `dataverse.ps1` não encontrado.

- [ ] **Passo 4: implementar `dataverse.ps1`**

```powershell
# Conexao com a Web API do Dataverse para os scripts de solucoes (dot-source).
# Token: client credentials se DV_CLIENT_SECRET estiver no ambiente (CI); senao MSAL.PS com cache em disco.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$script:ClientIdPadrao = "51f81489-12ee-4a9e-aaae-a2591f45987d"

function Write-Step([string] $Message) { Write-Host "[solucoes] $Message" }

function Connect-Dataverse([string] $EnvironmentUrl, [string[]] $HostsPermitidos) {
  $base = $EnvironmentUrl.TrimEnd("/")
  $hostName = ([Uri] $base).Host.ToLowerInvariant()
  if ($HostsPermitidos -and ($HostsPermitidos -notcontains $hostName)) { throw "Host $hostName nao permitido aqui (permitidos: $($HostsPermitidos -join ', '))." }
  $secret = [Environment]::GetEnvironmentVariable("DV_CLIENT_SECRET")
  if ($secret) {
    $body = @{ grant_type = "client_credentials"; client_id = $env:DV_CLIENT_ID; client_secret = $secret; scope = "$base/.default" }
    $token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$($env:DV_TENANT_ID)/oauth2/v2.0/token" -Body $body).access_token
  }
  else {
    Import-Module MSAL.PS -ErrorAction Stop
    $client = New-MsalClientApplication -ClientId $script:ClientIdPadrao -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
    Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
    $scope = "$base/user_impersonation"
    $token = try { (Get-MsalToken -PublicClientApplication $client -Scopes $scope -Silent).AccessToken } catch { (Get-MsalToken -PublicClientApplication $client -Scopes $scope).AccessToken }
  }
  if (-not $token) { throw "Falha ao obter token para $hostName." }
  return @{
    Api = "$base/api/data/v9.2"; Url = $base; Host = $hostName
    Headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; Prefer = "odata.maxpagesize=5000" }
  }
}

function Read-DvAll($Dv, [string] $Path) {
  $items = @()
  $uri = "$($Dv.Api)/$Path"
  while ($uri) {
    $page = Invoke-RestMethod -Method Get -Uri $uri -Headers $Dv.Headers
    $items += @($page.value)
    $next = $page.PSObject.Properties['@odata.nextLink']
    $uri = if ($next) { $next.Value } else { $null }
  }
  return $items
}

function Invoke-DvAction($Dv, [string] $Name, $Body) {
  return Invoke-RestMethod -Method Post -Uri "$($Dv.Api)/$Name" -Headers $Dv.Headers -Body (ConvertTo-Json -InputObject $Body -Depth 12) -ContentType "application/json; charset=utf-8"
}

function Write-JsonFile([string] $Path, $Value) {
  [IO.File]::WriteAllText($Path, (ConvertTo-Json -InputObject $Value -Depth 12), (New-Object Text.UTF8Encoding $false))
}

function Read-JsonFile([string] $Path) { return ([IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) | ConvertFrom-Json) }
```

- [ ] **Passo 5: implementar `solucoes.ps1`**

```powershell
# Operacoes de solucao para a segmentacao da AppBetinhos (dot-source depois do dataverse.ps1).
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$script:Solucoes = @("BetinhosCore", "BetinhosAutomacao", "BetinhosInterface", "BetinhosMotoristas")

function Get-SolucaoId($Dv, [string] $UniqueName) {
  $rows = @(Read-DvAll $Dv "solutions?`$select=solutionid&`$filter=uniquename eq '$UniqueName'")
  if ($rows.Count -eq 0) { return $null }
  return [string] $rows[0].solutionid
}

function Get-TiposPorEntidade($Dv) {
  $map = @{}
  foreach ($d in Read-DvAll $Dv "solutioncomponentdefinitions?`$select=solutioncomponenttype,primaryentityname&`$filter=solutioncomponenttype ge 10000") {
    $map[[int] $d.solutioncomponenttype] = [string] $d.primaryentityname
  }
  return $map
}

function Get-Mapa($Dv, [string] $Set, [string] $Chave, [string] $Valor) {
  $map = @{}
  foreach ($r in Read-DvAll $Dv "$Set`?`$select=$Chave,$Valor") { $map[([string] $r.$Chave).ToLowerInvariant()] = [string] $r.$Valor }
  return $map
}

# Componentes raiz da solucao, com o que o classificador precisa: nome, entidade (tipos >= 10000), app pai e se e tabela de BPF.
function Get-ComponentesDaSolucao($Dv, [string] $SolucaoId, [hashtable] $TiposPorEntidade) {
  $nomes = @{
    61  = Get-Mapa $Dv "webresourceset" "webresourceid" "name"
    80  = Get-Mapa $Dv "appmodules" "appmoduleid" "uniquename"
    62  = Get-Mapa $Dv "sitemaps" "sitemapid" "sitemapnameunique"
    300 = Get-Mapa $Dv "canvasapps" "canvasappid" "name"
  }
  $apps = $nomes[80]
  $paiDoApp = @{}
  foreach ($par in @(@("appsettings", "appsettingid"), @("appelements", "appelementid"))) {
    foreach ($r in Read-DvAll $Dv "$($par[0])?`$select=$($par[1]),_parentappmoduleid_value") {
      $pai = [string] $r._parentappmoduleid_value
      if ($pai) { $paiDoApp[([string] $r.($par[1])).ToLowerInvariant()] = $apps[$pai.ToLowerInvariant()] }
    }
  }
  $bpf = @{}
  foreach ($e in Read-DvAll $Dv "EntityDefinitions?`$select=MetadataId,IsBPFEntity") { if ($e.IsBPFEntity) { $bpf[([string] $e.MetadataId).ToLowerInvariant()] = $true } }
  $resumo = @{}
  foreach ($r in Read-DvAll $Dv "msdyn_solutioncomponentsummaries?`$select=msdyn_objectid,msdyn_name&`$filter=msdyn_solutionid eq $SolucaoId") {
    $resumo[([string] $r.msdyn_objectid).ToLowerInvariant()] = [string] $r.msdyn_name
  }
  $lista = @()
  foreach ($c in Read-DvAll $Dv "solutioncomponents?`$select=objectid,componenttype,rootcomponentbehavior&`$filter=_solutionid_value eq $SolucaoId") {
    $id = ([string] $c.objectid).ToLowerInvariant()
    $tipo = [int] $c.componenttype
    $nome = if ($nomes.ContainsKey($tipo) -and $nomes[$tipo].ContainsKey($id)) { $nomes[$tipo][$id] } elseif ($resumo.ContainsKey($id)) { $resumo[$id] } else { "" }
    $lista += @{
      id = $id; tipo = $tipo; nome = $nome; comportamento = [int] $c.rootcomponentbehavior
      entidade = if ($tipo -ge 10000) { $TiposPorEntidade[$tipo] } else { $null }
      app = if ($paiDoApp.ContainsKey($id)) { $paiDoApp[$id] } else { $null }
      bpf = ($tipo -eq 1 -and $bpf.ContainsKey($id))
    }
  }
  return $lista
}

function Add-ComponenteNaSolucao($Dv, $Componente, [string] $Solucao) {
  Invoke-DvAction $Dv "AddSolutionComponent" @{
    ComponentId = $Componente.id; ComponentType = [int] $Componente.tipo; SolutionUniqueName = $Solucao
    AddRequiredComponents = $false; DoNotIncludeSubcomponents = ([int] $Componente.comportamento -ne 0); IncludedComponentSettingsValues = $null
  } | Out-Null
}

function New-SolucaoSeFaltar($Dv, [string] $UniqueName, [string] $PublisherId) {
  if (Get-SolucaoId $Dv $UniqueName) { return $false }
  $body = @{ uniquename = $UniqueName; friendlyname = $UniqueName; version = "1.0.0.0"; "publisherid@odata.bind" = "/publishers($PublisherId)" }
  Invoke-RestMethod -Method Post -Uri "$($Dv.Api)/solutions" -Headers $Dv.Headers -Body (ConvertTo-Json -InputObject $body) -ContentType "application/json; charset=utf-8" | Out-Null
  return $true
}

function Get-DependenciasAusentes($Dv, [string] $Solucao) {
  return @(Read-DvAll $Dv "RetrieveMissingDependencies(SolutionUniqueName='$Solucao')" | ForEach-Object {
      @{ requerido = ([string] $_.requiredcomponentobjectid).ToLowerInvariant(); tipo = [int] $_.requiredcomponenttype }
    })
}

# Hash do conteudo do pacote, sem solution.xml (versao) nem [Content_Types].xml: igual se nada mudou.
function Get-HashDoPacote([string] $ZipPath) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $buffer = New-Object IO.MemoryStream
    foreach ($e in ($zip.Entries | Where-Object { @("solution.xml", "[Content_Types].xml") -notcontains $_.FullName } | Sort-Object FullName)) {
      $nome = [Text.Encoding]::UTF8.GetBytes($e.FullName)
      $buffer.Write($nome, 0, $nome.Length)
      $s = $e.Open()
      try { $s.CopyTo($buffer) } finally { $s.Dispose() }
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    return -join ($sha.ComputeHash($buffer.ToArray()) | ForEach-Object { $_.ToString("x2") })
  }
  finally { $zip.Dispose() }
}

function Select-PacProfile([string] $Url) {
  $targetHost = ([Uri] $Url).Host.ToLowerInvariant()
  $line = @(pac auth list | Where-Object { $_ -match [regex]::Escape($targetHost) }) | Select-Object -First 1
  if (-not $line -or $line -notmatch '^\[(\d+)\]') { throw "Nenhum perfil do pac para $targetHost. Rode: pac auth create --environment $Url" }
  pac auth select --index $Matches[1] | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "pac auth select falhou para $targetHost." }
}

function Get-StepsSemConfigSegura($Dv, [string[]] $Nomes) {
  $faltando = @()
  foreach ($nome in $Nomes) {
    $rows = @(Read-DvAll $Dv "sdkmessageprocessingsteps?`$select=_sdkmessageprocessingstepsecureconfigid_value&`$filter=name eq '$($nome.Replace("'", "''"))'")
    if ($rows.Count -ne 1 -or -not $rows[0]._sdkmessageprocessingstepsecureconfigid_value) { $faltando += "$nome ($($rows.Count) step(s))" }
  }
  return $faltando
}
```

- [ ] **Passo 6: rodar e ver passar**

Rodar: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/testa-solucoes.ps1`
Esperado: 6 linhas `ok` e nenhuma `FALHA`.

- [ ] **Passo 7: commit**

```bash
git add packages/deploy/solucoes/dataverse.ps1 packages/deploy/solucoes/solucoes.ps1 packages/deploy/solucoes/testa-solucoes.ps1
git commit -m "feat(solucoes): bibliotecas PowerShell de conexão e operações de solução com testes"
```

### Tarefa 5: distribuidor e conferência no DEV

**Files:**
- Create: `packages/deploy/solucoes/distribuir-solucoes.ps1`

**Interfaces:**
- Consumes: tudo da Tarefa 4, `classificar.mjs` (Tarefa 1) e `conferir.mjs` (Tarefa 2).
- Produces: `distribuir-solucoes.ps1 [-EnvironmentUrl dev] [-CaixaDeEntrada AppBetinhos] [-Aplicar] [-SomenteConferir]`.
  - Sem parâmetros: simula e lista o que distribuiria.
  - `-Aplicar`: cria as soluções que faltam e distribui.
  - `-SomenteConferir`: não altera nada e sai com código 0 ou 1.

- [ ] **Passo 1: escrever o script**

```powershell
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com",
  [string] $CaixaDeEntrada = "AppBetinhos",
  [switch] $Aplicar,
  [switch] $SomenteConferir
)

# Distribui os componentes da caixa de entrada (AppBetinhos no DEV) nas 4 solucoes pelas regras de regras.json.
# Sem -Aplicar so mostra o que faria. -SomenteConferir nao altera nada e sai com codigo 1 se algo estiver fora do lugar.
# So roda no DEV. Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  $argumentos = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-EnvironmentUrl", $EnvironmentUrl, "-CaixaDeEntrada", $CaixaDeEntrada)
  if ($Aplicar) { $argumentos += "-Aplicar" }
  if ($SomenteConferir) { $argumentos += "-SomenteConferir" }
  & $ps @argumentos
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")

$dv = Connect-Dataverse $EnvironmentUrl @("org23b93544.crm2.dynamics.com")
$regrasPath = Join-Path $PSScriptRoot "regras.json"
$regras = Read-JsonFile $regrasPath
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("solucoes-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null

$caixaId = Get-SolucaoId $dv $CaixaDeEntrada
if (-not $caixaId) { throw "Solucao $CaixaDeEntrada nao encontrada no DEV." }
$componentes = @(Get-ComponentesDaSolucao $dv $caixaId (Get-TiposPorEntidade $dv))
Write-JsonFile "$tmp\componentes.json" $componentes
$saida = node (Join-Path $PSScriptRoot "classificar.mjs") "$tmp\componentes.json" $regrasPath
if ($LASTEXITCODE -ne 0) { throw "classificar.mjs falhou." }
$classe = $saida | ConvertFrom-Json
foreach ($p in @($classe.proibidos)) { Write-Warning "PROIBIDO tipo $($p.tipo) '$($p.nome)' ($($p.id)): $($p.motivo)" }
foreach ($s in @($classe.semRegra)) { Write-Warning "SEM REGRA tipo $($s.tipo) entidade '$($s.entidade)' nome '$($s.nome)' ($($s.id))" }

function Get-PorSolucao {
  $mapa = @{}
  foreach ($sol in $script:Solucoes) {
    $id = Get-SolucaoId $dv $sol
    $mapa[$sol] = if ($id) { @(Read-DvAll $dv "solutioncomponents?`$select=objectid&`$filter=_solutionid_value eq $id" | ForEach-Object { ([string] $_.objectid).ToLowerInvariant() }) } else { @() }
  }
  return $mapa
}
$porSolucao = Get-PorSolucao

if (-not $SomenteConferir) {
  $faltam = @($classe.atribuicoes | Where-Object { $porSolucao[$_.solucao] -notcontains $_.id })
  Write-Step "componentes na caixa de entrada: $($componentes.Count); a distribuir: $($faltam.Count)"
  foreach ($g in ($faltam | Group-Object solucao)) { Write-Step "  $($g.Name): $($g.Count)" }
  if (@($classe.semRegra).Count -or @($classe.proibidos).Count) { throw "Ha componentes sem regra ou proibidos (avisos acima). Ajuste regras.json ou a caixa de entrada antes de distribuir." }
  if (-not $Aplicar) { Write-Step "DRY RUN: use -Aplicar para criar as solucoes que faltam e distribuir."; return }
  $publisher = [string] (Read-DvAll $dv "solutions?`$select=_publisherid_value&`$filter=solutionid eq $caixaId")[0]._publisherid_value
  foreach ($sol in $script:Solucoes) { if (New-SolucaoSeFaltar $dv $sol $publisher) { Write-Step "criada $sol" } }
  $n = 0
  foreach ($a in $faltam) {
    Add-ComponenteNaSolucao $dv $a $a.solucao
    $n++
    if ($n % 50 -eq 0) { Write-Step "  $n de $($faltam.Count)" }
  }
  Write-Step "distribuidos: $n"
  $porSolucao = Get-PorSolucao
}

$ausentes = @{}
foreach ($sol in $script:Solucoes) { $ausentes[$sol] = if (Get-SolucaoId $dv $sol) { @(Get-DependenciasAusentes $dv $sol) } else { @() } }
Write-JsonFile "$tmp\conferir.json" @{
  caixa = @($componentes | ForEach-Object { $_.id }); porSolucao = $porSolucao
  atribuicoes = @($classe.atribuicoes); ausentes = $ausentes; permitidas = $regras.permitidas
}
$relatorio = (node (Join-Path $PSScriptRoot "conferir.mjs") "$tmp\conferir.json") | ConvertFrom-Json
$codigo = $LASTEXITCODE
Write-Step ("conferencia: sem dono {0}; em duas {1}; fora do lugar {2}; dependencias para cima {3}" -f @($relatorio.cobertura.semDono).Count, @($relatorio.cobertura.emDuas).Count, @($relatorio.cobertura.foraDoLugar).Count, @($relatorio.violacoes).Count)
Write-JsonFile "$tmp\relatorio.json" $relatorio
Write-Step "detalhes: $tmp\relatorio.json"
if (@($classe.semRegra).Count -or @($classe.proibidos).Count) { $codigo = 1 }
exit $codigo
```

- [ ] **Passo 2: simular no DEV.** Na primeira execução, o Renan faz o login do MSAL.PS (conta noreply). Rodar: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/distribuir-solucoes.ps1`.

  Esperado:
  - um aviso `PROIBIDO` para `new_EmailAdminAvisos` (valor de variável que voltou para a AppBetinhos);
  - nenhum `SEM REGRA`;
  - 846 componentes classificados, divididos perto de Core 202, Automação 368, Interface ≈ 269 e Motoristas ≈ 7. Configurações e elementos de app podem mudar alguns entre Interface e Motoristas. A Interface inclui 174 WebResources e 68 app actions.
  - A execução termina com o erro de "proibidos".

  Se aparecer `SEM REGRA`, acrescente a regra em `regras.json` e um teste na Tarefa 1 antes de seguir.

- [ ] **Passo 3: tirar da AppBetinhos o valor de variável** (reversível; segue a regra de 07/10 e 16/10/2026 de que valores não viajam). O valor continua no DEV.

```powershell
. packages/deploy/solucoes/dataverse.ps1
$dv = Connect-Dataverse "https://org23b93544.crm2.dynamics.com" @("org23b93544.crm2.dynamics.com")
$v = (Read-DvAll $dv "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=schemaname eq 'new_EmailAdminAvisos'")[0]
Invoke-DvAction $dv "RemoveSolutionComponent" @{ ComponentId = $v.environmentvariablevalueid; ComponentType = 381; SolutionUniqueName = "AppBetinhos" } | Out-Null
```

  Rodar a simulação de novo. Esperado: nenhum `PROIBIDO`, nenhum `SEM REGRA`, e a mensagem `DRY RUN`.

- [ ] **Passo 4: distribuir no DEV.** Rodar o script com `-Aplicar`. Esperado:
  - `criada BetinhosCore` (e as outras três);
  - `distribuidos: N`, com N igual ao total da simulação;
  - `conferencia: sem dono 0; em duas 0; fora do lugar 0; dependencias para cima 0`;
  - código de saída 0.

  Se a conferência apontar dependência para cima, não force a solução errada: registre o par no relatório da tarefa e ajuste a regra (por exemplo, um WebResource usado por um formulário do Core vai para o Core por exceção de nome). Rode de novo até dar 0.

- [ ] **Passo 5: conferir sem alterar.** Rodar com `-SomenteConferir`. Esperado: a mesma linha de conferência com zeros e código 0.

- [ ] **Passo 6: exportar as 4 gerenciadas do DEV** (só leitura no DEV). Os ZIPs levam o valor padrão das variáveis (Cielo, Graph e Jev), então antes acrescente `backup/` ao `.gitignore` da raiz e confirme com `git check-ignore backup/solucoes/x.zip`. Os comandos rodam a partir da raiz do repositório.

```powershell
foreach ($s in "BetinhosCore", "BetinhosAutomacao", "BetinhosInterface", "BetinhosMotoristas") {
  pac solution export --environment https://org23b93544.crm2.dynamics.com --name $s --managed --path "backup\solucoes\${s}_managed.zip" --overwrite --async
  if ($LASTEXITCODE -ne 0) { throw "export de $s falhou" }
}
```

  Esperado: 4 ZIPs sem erro. A AppBetinhos segue intacta como caixa de entrada.

- [ ] **Passo 7: commit**

```bash
git add packages/deploy/solucoes/distribuir-solucoes.ps1 packages/deploy/solucoes/regras.json .gitignore
git commit -m "feat(solucoes): distribuidor da caixa de entrada AppBetinhos nas 4 soluções do DEV"
```

### Tarefa 6: foto do ambiente

**Files:**
- Create: `packages/deploy/solucoes/foto-ambiente.ps1`

**Interfaces:**
- Consumes: `dataverse.ps1`, `solucoes.ps1` (Tarefa 4) e `regras.json` (`stepsSeguros`).
- Produces: `foto-ambiente.ps1 -EnvironmentUrl <url> -Saida <arquivo.json> [-Solucoes <nomes>]`, que grava uma `Foto` (formato da Tarefa 3). Só leitura, em qualquer ambiente.

- [ ] **Passo 1: escrever o script**

```powershell
param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [string] $Saida,
  [string[]] $Solucoes = @("AppBetinhos", "gerarpagantes", "BetinhosCore", "BetinhosAutomacao", "BetinhosInterface", "BetinhosMotoristas")
)

# Somente leitura. Grava em JSON o estado que a migracao nao pode perder: registros por tabela, fluxos, steps,
# configuracao segura, hash dos valores de variaveis, solucoes de cada componente e versoes servidas.
# Nunca grava o valor de variavel, so o hash SHA-256.

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  & $ps -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -EnvironmentUrl $EnvironmentUrl -Saida $Saida -Solucoes $Solucoes
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")
$dv = Connect-Dataverse $EnvironmentUrl $null

function Get-Sha256([string] $Texto) {
  if ($null -eq $Texto) { return $null }
  $sha = [Security.Cryptography.SHA256]::Create()
  return -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Texto)) | ForEach-Object { $_.ToString("x2") })
}

$foto = [ordered]@{ ambiente = $dv.Url; quando = (Get-Date).ToString("s"); registros = [ordered]@{}; aproximados = @(); fluxos = @{}; steps = @{}; variaveis = @{}; componentes = @{}; versoes = @{} }

# Registros: contagem exata por FetchXML; acima do limite de agregacao (50.000) usa a contagem do snapshot e marca como aproximada.
foreach ($e in (Read-DvAll $dv "EntityDefinitions?`$select=LogicalName,EntitySetName,PrimaryIdAttribute,IsCustomEntity,IsIntersect" | Where-Object { $_.IsCustomEntity -and -not $_.IsIntersect -and $_.LogicalName -match '^(cr40f|new)_' } | Sort-Object LogicalName)) {
  $fetch = "<fetch aggregate='true'><entity name='$($e.LogicalName)'><attribute name='$($e.PrimaryIdAttribute)' alias='n' aggregate='count'/></entity></fetch>"
  try { $foto.registros[$e.LogicalName] = [int] (Invoke-RestMethod -Method Get -Uri "$($dv.Api)/$($e.EntitySetName)?fetchXml=$([uri]::EscapeDataString($fetch))" -Headers $dv.Headers).value[0].n }
  catch {
    $r = Invoke-RestMethod -Method Get -Uri "$($dv.Api)/RetrieveTotalRecordCount(EntityNames=@p)?@p=$([uri]::EscapeDataString('["' + $e.LogicalName + '"]'))" -Headers $dv.Headers
    $foto.registros[$e.LogicalName] = [int] $r.EntityRecordCountCollection.Values[0]
    $foto.aproximados += $e.LogicalName
  }
}

# Componentes por solucao (so as solucoes que existem neste ambiente).
$fluxoIds = @{}; $stepIds = @{}
foreach ($sol in $Solucoes) {
  $id = Get-SolucaoId $dv $sol
  if (-not $id) { continue }
  foreach ($c in Read-DvAll $dv "solutioncomponents?`$select=objectid,componenttype&`$filter=_solutionid_value eq $id") {
    $oid = ([string] $c.objectid).ToLowerInvariant()
    if (-not $foto.componentes.ContainsKey($oid)) { $foto.componentes[$oid] = @() }
    $foto.componentes[$oid] += $sol
    if ([int] $c.componenttype -eq 29) { $fluxoIds[$oid] = $true }
    if ([int] $c.componenttype -eq 92) { $stepIds[$oid] = $true }
  }
}
foreach ($w in Read-DvAll $dv "workflows?`$select=workflowid,name,statecode&`$filter=type eq 1") {
  $oid = ([string] $w.workflowid).ToLowerInvariant()
  if ($fluxoIds.ContainsKey($oid)) { $foto.fluxos[$oid] = @{ nome = [string] $w.name; estado = [int] $w.statecode } }
}
# "seguro" = o step tem configuracao segura; o comparador acusa perda quando um step que tinha deixa de ter.
foreach ($s in Read-DvAll $dv "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,statecode,_sdkmessageprocessingstepsecureconfigid_value&`$filter=customizationlevel eq 1") {
  $oid = ([string] $s.sdkmessageprocessingstepid).ToLowerInvariant()
  if ($stepIds.ContainsKey($oid)) {
    $foto.steps[$oid] = @{ nome = [string] $s.name; estado = [int] $s.statecode; seguro = [bool] $s._sdkmessageprocessingstepsecureconfigid_value }
  }
}
foreach ($v in Read-DvAll $dv "environmentvariabledefinitions?`$select=schemaname&`$expand=environmentvariabledefinition_environmentvariablevalue(`$select=value)") {
  if ([string] $v.schemaname -notmatch '^(cr40f|new)_') { continue }
  $valores = @($v.environmentvariabledefinition_environmentvariablevalue)
  $foto.variaveis[[string] $v.schemaname] = if ($valores.Count) { Get-Sha256 ([string] $valores[0].value) } else { $null }
}

$sb = @(Read-DvAll $dv "webresourceset?`$select=description&`$filter=name eq 'cr40f_SistemaBetinhos.html'")
$foto.versoes["sistemaBetinhos"] = if ($sb.Count) { [string] $sb[0].description } else { "" }
$am = @(Read-DvAll $dv "webresourceset?`$select=content&`$filter=name eq 'new_app-motoristas-v2'")
$foto.versoes["appMotoristas"] = if ($am.Count) { [regex]::Match([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($am[0].content)), '\d+\.\d+\.\d+(?=["''])').Value } else { "" }

Write-JsonFile $Saida $foto
Write-Step ("foto gravada em {0}: {1} tabelas, {2} fluxos, {3} steps, {4} variaveis, {5} componentes" -f $Saida, $foto.registros.Count, $foto.fluxos.Count, $foto.steps.Count, $foto.variaveis.Count, $foto.componentes.Count)
```

- [ ] **Passo 2: rodar duas fotos do DEV e comparar:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/foto-ambiente.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -Saida backup\solucoes\foto-dev-1.json
powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/foto-ambiente.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -Saida backup\solucoes\foto-dev-2.json
node packages/deploy/solucoes/comparar-fotos.mjs backup\solucoes\foto-dev-1.json backup\solucoes\foto-dev-2.json
```

  Esperado:
  - a foto lista cerca de 95 tabelas, 117 processos, 61 steps e 37 variáveis;
  - a comparação sai com código 0 (pode haver `registrosMudaram` pelo uso normal do DEV);
  - `grep -c '"value"' foto-dev-1.json` dá 0, ou seja, nenhum valor de variável em claro.

- [ ] **Passo 3: commit**

```bash
git add packages/deploy/solucoes/foto-ambiente.ps1
git commit -m "feat(solucoes): foto do ambiente para comparar antes e depois de cada import"
```

### Tarefa 7: integração no pacote, skill de verificação e PR da Fase 1

**Files:**
- Modify: `packages/deploy/package.json` (script `test`)
- Create: `.claude/skills/verificar-solucoes/SKILL.md` (via skill `verificacao-criar`)
- Modify: `.claude/skills/verificar-index.md`

- [ ] **Passo 1: incluir os testes no `package.json`**

```json
"test": "node --test flows/documentos-resumo-semanal.test.mjs flows/aniversariantes-diario.test.mjs solucoes/classificar.test.mjs solucoes/conferir.test.mjs solucoes/comparar-fotos.test.mjs"
```

- [ ] **Passo 2: rodar a suíte do pacote.** Rodar: `pnpm --filter @betinhos/deploy test`. Esperado: todos passam.

- [ ] **Passo 3: criar `verificar-solucoes` com a skill `verificacao-criar`.** O roteiro mínimo:
  1. `pnpm --filter @betinhos/deploy test`;
  2. `powershell -File packages/deploy/solucoes/testa-solucoes.ps1`;
  3. `distribuir-solucoes.ps1 -SomenteConferir` no DEV com código 0;
  4. duas fotos do DEV comparadas sem perda.

  Como evidência, a linha de conferência e a saída do comparador. Como limite, o DEV não prova nada sobre TEST e PROD: isso é a Fase 2.

- [ ] **Passo 4: `qualidade-antes-do-pr`** (simplificação em 2 a 3 passadas, `karpathy-coder`, `/code-review high --fix`), e depois **`verificacao-manter`**.

- [ ] **Passo 5: commit e PR**

```bash
git add packages/deploy/package.json .claude/skills/verificar-solucoes .claude/skills/verificar-index.md
git commit -m "feat(solucoes): testes no pacote de deploy e skill verificar-solucoes"
gh pr create --title "Segmentação da AppBetinhos: ferramentas no DEV" --body "Classificador, conferência, fotos e distribuidor das 4 soluções (spec docs/superpowers/specs/2026-10-21-segmentacao-appbetinhos-design.md).

Verificação da spec:
- [x] 1. node --test packages/deploy/solucoes/ passa
- [x] 2. DEV: 4 soluções criadas; distribuir-solucoes.ps1 -SomenteConferir sai com 0
- [x] 3. DEV: as 4 exportam gerenciadas sem erro e sem dependência para cima

Nada foi importado em TEST ou PROD.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Fase 2 — Ensaio no TEST

Todas as tarefas desta fase gravam no TEST. Antes da Tarefa 8, confirme com o Renan o horário da cópia: ela sobrescreve o TEST, e isso foi aprovado em 21/10/2026. O resultado de cada tarefa vai para `docs/auditoria/ensaio-segmentacao-<data>.md`: comando, tempo, saída do comparador e decisão.

### Tarefa 8: copiar o PROD para o TEST e travar o TEST

- [ ] **Passo 1: perfil do pac para o TEST.** Rodar `pac auth create --environment https://appbetinhostest.crm2.dynamics.com --deviceCode`. O Renan conclui o login da conta noreply.
- [ ] **Passo 2: copiar.**

```powershell
pac admin copy --source-env https://orgf261ae8e.crm2.dynamics.com --target-env https://appbetinhostest.crm2.dynamics.com --type FullCopy --skip-audit-data --max-async-wait-time 180
```

  Esperado: a cópia termina com sucesso. Registrar a duração.
- [ ] **Passo 3: travar o TEST.** Rodar `pac admin set-runtime-state --environment https://appbetinhostest.crm2.dynamics.com --runtime-state AdminMode --background-operations Disabled`.
- [ ] **Passo 4: conferir que nenhum fluxo ficou ligado** (Web API do TEST):

```powershell
. packages/deploy/solucoes/dataverse.ps1
$dv = Connect-Dataverse "https://appbetinhostest.crm2.dynamics.com" @("appbetinhostest.crm2.dynamics.com")
$ligados = @(Read-DvAll $dv "workflows?`$select=workflowid,name&`$filter=category eq 5 and statecode eq 1")
$ligados | ForEach-Object { Invoke-RestMethod -Method Patch -Uri "$($dv.Api)/workflows($($_.workflowid))" -Headers $dv.Headers -Body '{"statecode":0,"statuscode":1}' -ContentType "application/json" }
"desligados: $($ligados.Count)"
```

  Esperado: depois do passo, `Read-DvAll` com `statecode eq 1` volta vazio.
- [ ] **Passo 5: foto 0.** Rodar `foto-ambiente.ps1 -EnvironmentUrl https://appbetinhostest.crm2.dynamics.com -Saida backup\solucoes\ensaio\foto0.json`. Esperado: as contagens batem com as do PROD de 21/10 (por exemplo, `cr40f_servicosporpassageiro` ≈ 26.024), com folga para o uso do dia.

### Tarefa 9: pré-requisitos e ensaio da promoção pendente

- [ ] **Passo 1: camadas Active.** Rodar `App Motoristas\scripts\audit-prod-layers.ps1 -EnvironmentUrl https://appbetinhostest.crm2.dynamics.com -OutFile backup\solucoes\ensaio\camadas-antes.csv`. Depois, para cada WebResource com `Active` no topo (esperados: `cr40f_SistemaBetinhos*`, `new_TelaComposicaoPreco.html`, `new_TelaPlanner.html`), rodar `App Motoristas\scripts\remove-prod-active-layer.ps1 -EnvironmentUrl https://appbetinhostest.crm2.dynamics.com -WebResourceName <nome> -Apply`.
- [ ] **Passo 2: excluir as 8 Custom APIs `cr40f_AI*V2` não gerenciadas do TEST.**

```powershell
. packages/deploy/solucoes/dataverse.ps1; . packages/deploy/solucoes/solucoes.ps1
$dv = Connect-Dataverse "https://appbetinhostest.crm2.dynamics.com" @("appbetinhostest.crm2.dynamics.com")
$v2 = @(Read-DvAll $dv "customapis?`$select=customapiid,uniquename&`$filter=startswith(uniquename,'cr40f_AI') and ismanaged eq false" | Where-Object { $_.uniquename -like '*V2' })
"apagar: $($v2.uniquename -join ', ')"
$v2 | ForEach-Object { Invoke-RestMethod -Method Delete -Uri "$($dv.Api)/customapis($($_.customapiid))" -Headers $dv.Headers }
```

  Esperado: 8 nomes listados e, depois, a mesma consulta volta vazia.
- [ ] **Passo 3: foto 1**, em `backup\solucoes\ensaio\foto1.json`.
- [ ] **Passo 4: ensaiar a promoção pendente, medindo o tempo.**

```powershell
. packages/deploy/solucoes/dataverse.ps1; . packages/deploy/solucoes/solucoes.ps1
Select-PacProfile https://org23b93544.crm2.dynamics.com
pac solution export --name AppBetinhos --managed --path backup\solucoes\ensaio\AppBetinhos_managed.zip --overwrite --async
Select-PacProfile https://appbetinhostest.crm2.dynamics.com
$t = Measure-Command { pac solution import --path backup\solucoes\ensaio\AppBetinhos_managed.zip --stage-and-upgrade --publish-changes --activate-plugins --async --max-async-wait-time 120 }
"tempo de referencia: $($t.ToString())"
```

  Esperado: o import termina sem erro. Esse tempo é a referência.
- [ ] **Passo 5: foto 2 e comparação.** Rodar `node comparar-fotos.mjs foto1.json foto2.json`. Esperado:
  - as perdas são só os componentes excluídos na limpeza de 21/10 (lista na seção 6 do relatório de auditoria);
  - `registrosCairam` só nas tabelas excluídas (`cr40f_contextooperacionalia` com 1 registro, `cr40f_registrodeviagem`);
  - nenhum fluxo que estava ligado desliga, porque no TEST todos estão desligados.

  Qualquer outra perda: **pare**, registre e investigue antes de seguir.

### Tarefa 10: migração e retirada da AppBetinhos no TEST

- [ ] **Passo 1: importar as 4 na ordem, medindo cada uma.** É a primeira instalação delas, então o import é sem `--stage-and-upgrade`:

```powershell
. packages/deploy/solucoes/dataverse.ps1; . packages/deploy/solucoes/solucoes.ps1
Select-PacProfile https://appbetinhostest.crm2.dynamics.com
foreach ($s in "BetinhosCore", "BetinhosAutomacao", "BetinhosInterface", "BetinhosMotoristas") {
  $t = Measure-Command { pac solution import --path "backup\solucoes\${s}_managed.zip" --publish-changes --activate-plugins --async --max-async-wait-time 120 }
  if ($LASTEXITCODE -ne 0) { throw "import de $s falhou" }
  "$s : $($t.ToString())"
}
```

  Os ZIPs são os da Tarefa 5, passo 6. Se o DEV mudou desde então, rode antes `distribuir-solucoes.ps1 -Aplicar` e o export do passo 6 de novo.
- [ ] **Passo 2: foto 3 e comparação com a foto 2.** Esperado: `temPerda` falso; `donosMudaram` mostra os componentes ganhando a solução nova ao lado da AppBetinhos.
- [ ] **Passo 3: desinstalar a AppBetinhos gerenciada.** Rodar `pac solution delete --solution-name AppBetinhos` no perfil do TEST, medindo o tempo.
- [ ] **Passo 4: foto 4 e comparação com a foto 3.** Esperado:
  - `temPerda` falso;
  - `componentesSumiram` vazio;
  - cada componente tem só uma das 4.

  Se algo sumir: pare. A desinstalação não serve, e o ensaio volta para a spec (upgrade vazio montado à mão).
- [ ] **Passo 5: desinstalar a `gerarpagantes`** com `pac solution delete --solution-name gerarpagantes`. Depois, foto 5 comparada com a foto 4, com a mesma expectativa.

### Tarefa 11: uso, ganho e relatório do ensaio

- [ ] **Passo 1: uso.** Ainda em modo de administração, com a conta admin:
  - abrir `https://appbetinhostest.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhos.html`: a Geral lista reservas reais e o rodapé mostra a versão de `foto4.versoes.sistemaBetinhos`;
  - abrir o App Motoristas (`new_app-motoristas-v2`);
  - abrir o app model-driven pelo menu;
  - chamar `POST cr40f_FrotaPendencias` na Web API do TEST e receber resposta 200.
- [ ] **Passo 2: ganho.** No DEV, mudar só a descrição de um WebResource que não muda tela. É a única escrita no DEV nesta tarefa e é restaurada no passo 3:

```powershell
. packages/deploy/solucoes/dataverse.ps1; . packages/deploy/solucoes/solucoes.ps1
$dvDev = Connect-Dataverse "https://org23b93544.crm2.dynamics.com" @("org23b93544.crm2.dynamics.com")
$wr = (Read-DvAll $dvDev "webresourceset?`$select=webresourceid,description&`$filter=name eq 'new_TelaFuncionariosLoader.html'")[0]
$script:descricaoAntes = [string] $wr.description
Invoke-RestMethod -Method Patch -Uri "$($dvDev.Api)/webresourceset($($wr.webresourceid))" -Headers $dvDev.Headers -Body (ConvertTo-Json @{ description = "$($script:descricaoAntes) (ensaio)" }) -ContentType "application/json"
Invoke-DvAction $dvDev "PublishXml" @{ ParameterXml = "<importexportxml><webresources><webresource>{$($wr.webresourceid)}</webresource></webresources></importexportxml>" } | Out-Null
Select-PacProfile https://org23b93544.crm2.dynamics.com
pac solution online-version --solution-name BetinhosInterface --solution-version 1.0.0.1
pac solution export --name BetinhosInterface --managed --path backup\solucoes\ensaio\BetinhosInterface_1_0_0_1_managed.zip --overwrite --async
Select-PacProfile https://appbetinhostest.crm2.dynamics.com
$t = Measure-Command { pac solution import --path backup\solucoes\ensaio\BetinhosInterface_1_0_0_1_managed.zip --stage-and-upgrade --publish-changes --async --max-async-wait-time 60 }
"so a Interface: $($t.ToString())"
```

  Esperado:
  - o tempo fica bem abaixo da referência da Tarefa 9;
  - a foto 6 só mostra a versão nova da Interface;
  - Core e Automação não mudam.
- [ ] **Passo 3: restaurar** a descrição original no DEV:

```powershell
Invoke-RestMethod -Method Patch -Uri "$($dvDev.Api)/webresourceset($($wr.webresourceid))" -Headers $dvDev.Headers -Body (ConvertTo-Json @{ description = $script:descricaoAntes }) -ContentType "application/json"
Invoke-DvAction $dvDev "PublishXml" @{ ParameterXml = "<importexportxml><webresources><webresource>{$($wr.webresourceid)}</webresource></webresources></importexportxml>" } | Out-Null
```
- [ ] **Passo 4: relatório.** Escrever `docs/auditoria/ensaio-segmentacao-<data>.md` com:
  - tempos (cópia, referência, cada uma das 4, desinstalações, ganho);
  - saídas do comparador;
  - desvios e decisões.

  Commitar e pedir a aprovação do Renan. **A Fase 4 só começa com esse relatório aprovado.**

---

## Fase 3 — Deploy por solução

### Tarefa 12: hashes do último deploy

**Files:**
- Create: `packages/deploy/solucoes/ultimo-deploy-test.json`
- Create: `packages/deploy/solucoes/ultimo-deploy-prod.json`

- [ ] **Passo 1: gravar o hash dos pacotes importados no TEST na Tarefa 10** (a referência para o próximo deploy):

```powershell
. packages/deploy/solucoes/dataverse.ps1; . packages/deploy/solucoes/solucoes.ps1
$h = [ordered]@{}; foreach ($s in $script:Solucoes) { $h[$s] = Get-HashDoPacote "backup\solucoes\${s}_managed.zip" }
Write-JsonFile packages\deploy\solucoes\ultimo-deploy-test.json $h
```

  O `ultimo-deploy-prod.json` começa como `{}` e é preenchido pela Fase 4.
- [ ] **Passo 2: commit**

```bash
git add packages/deploy/solucoes/ultimo-deploy-test.json packages/deploy/solucoes/ultimo-deploy-prod.json
git commit -m "chore(solucoes): hashes dos pacotes do último deploy no TEST"
```

### Tarefa 13: decidir quais soluções mudaram

**Files:**
- Create: `packages/deploy/solucoes/qual-mudou.mjs`
- Test: `packages/deploy/solucoes/qual-mudou.test.mjs`
- Modify: `packages/deploy/package.json` (acrescentar `solucoes/qual-mudou.test.mjs` ao `test`)

**Interfaces:**
- Consumes: `lerJson` (Tarefa 1).
- Produces:
  - `solucoesAlteradas({ ordem: string[], hashesAtuais: {[sol]: string}, hashesDestino: {[sol]: string}, forcar: string[] }): string[]`, na ordem de dependência;
  - CLI: `node qual-mudou.mjs <entrada.json>` imprime a lista em JSON.

- [ ] **Passo 1: escrever o teste que falha**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { solucoesAlteradas } from './qual-mudou.mjs'

const ordem = ['BetinhosCore', 'BetinhosAutomacao', 'BetinhosInterface', 'BetinhosMotoristas']
const atuais = { BetinhosCore: 'a', BetinhosAutomacao: 'b', BetinhosInterface: 'c', BetinhosMotoristas: 'd' }

test('nada mudou, nada a importar', () => assert.deepEqual(solucoesAlteradas({ ordem, hashesAtuais: atuais, hashesDestino: atuais, forcar: [] }), []))
test('só a Interface mudou', () => assert.deepEqual(solucoesAlteradas({ ordem, hashesAtuais: atuais, hashesDestino: { ...atuais, BetinhosInterface: 'x' }, forcar: [] }), ['BetinhosInterface']))
test('destino sem registro importa todas, na ordem', () => assert.deepEqual(solucoesAlteradas({ ordem, hashesAtuais: atuais, hashesDestino: {}, forcar: [] }), ordem))
test('forçar devolve na ordem de dependência', () => assert.deepEqual(solucoesAlteradas({ ordem, hashesAtuais: atuais, hashesDestino: atuais, forcar: ['BetinhosMotoristas', 'BetinhosCore'] }), ['BetinhosCore', 'BetinhosMotoristas']))
test('forçar solução desconhecida falha', () => assert.throws(() => solucoesAlteradas({ ordem, hashesAtuais: atuais, hashesDestino: atuais, forcar: ['AppBetinhos'] }), /AppBetinhos/))
test('hash atual faltando falha', () => assert.throws(() => solucoesAlteradas({ ordem, hashesAtuais: { BetinhosCore: 'a' }, hashesDestino: {}, forcar: [] }), /BetinhosAutomacao/))
```

- [ ] **Passo 2: rodar e ver falhar.** Rodar `node --test packages/deploy/solucoes/qual-mudou.test.mjs`. Esperado: FAIL com módulo não encontrado.
- [ ] **Passo 3: implementar**

```js
import { pathToFileURL } from 'node:url'
import { lerJson } from './arquivo.mjs'

// Solução muda quando o hash do pacote exportado agora difere do último importado no destino.
export function solucoesAlteradas({ ordem, hashesAtuais, hashesDestino, forcar }) {
  if (forcar?.length) {
    const desconhecidas = forcar.filter((s) => !ordem.includes(s))
    if (desconhecidas.length) throw new Error(`Solucao desconhecida: ${desconhecidas.join(', ')}`)
    return ordem.filter((s) => forcar.includes(s))
  }
  const semHash = ordem.filter((s) => !hashesAtuais[s])
  if (semHash.length) throw new Error(`Sem hash atual para: ${semHash.join(', ')}`)
  return ordem.filter((s) => hashesDestino[s] !== hashesAtuais[s])
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(solucoesAlteradas(await lerJson(process.argv[2]))))
}
```

- [ ] **Passo 4: rodar e ver passar.** Esperado: 6 testes passam. Acrescentar ao `package.json` e rodar `pnpm --filter @betinhos/deploy test`.
- [ ] **Passo 5: commit**

```bash
git add packages/deploy/solucoes/qual-mudou.mjs packages/deploy/solucoes/qual-mudou.test.mjs packages/deploy/package.json
git commit -m "feat(solucoes): decide quais soluções importar pelo hash do pacote"
```

### Tarefa 14: `deploy-solucoes.ps1`

**Files:**
- Create: `packages/deploy/prod/deploy-solucoes.ps1`

**Interfaces:**
- Consumes:
  - `dataverse.ps1` e `solucoes.ps1` (Tarefa 4);
  - `distribuir-solucoes.ps1 -SomenteConferir` (Tarefa 5);
  - `foto-ambiente.ps1` (Tarefa 6);
  - `comparar-fotos.mjs` (Tarefa 3);
  - `qual-mudou.mjs` (Tarefa 13);
  - `packages/deploy/scan-secrets.mjs`;
  - `App Motoristas/scripts/audit-prod-layers.ps1` (repositório irmão).
- Produces: `deploy-solucoes.ps1 -Ambiente TEST|PROD [-Solucoes <nomes>] [-Aplicar] [-SkipGitChecks]`.

- [ ] **Passo 1: escrever o script**

```powershell
param(
  [Parameter(Mandatory = $true)] [ValidateSet("TEST", "PROD")] [string] $Ambiente,
  [string[]] $Solucoes = @(),
  [switch] $Aplicar,
  [switch] $SkipGitChecks
)

# Deploy por solucao: exporta do DEV so as solucoes cujo pacote mudou desde o ultimo deploy no destino,
# importa na ordem de dependencia e prova com fotos antes/depois que nada se perdeu. Sem -Aplicar, so mostra o plano.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  $argumentos = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-Ambiente", $Ambiente)
  if ($Solucoes.Count) { $argumentos += @("-Solucoes") + $Solucoes }
  if ($Aplicar) { $argumentos += "-Aplicar" }
  if ($SkipGitChecks) { $argumentos += "-SkipGitChecks" }
  & $ps @argumentos
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$pasta = Join-Path $PSScriptRoot "..\solucoes"
. (Join-Path $pasta "dataverse.ps1")
. (Join-Path $pasta "solucoes.ps1")
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$devUrl = "https://org23b93544.crm2.dynamics.com"
$destUrl = if ($Ambiente -eq "PROD") { "https://orgf261ae8e.crm2.dynamics.com" } else { "https://appbetinhostest.crm2.dynamics.com" }
$regras = Read-JsonFile (Join-Path $pasta "regras.json")
$camadas = Join-Path (Split-Path $root -Parent) "App Motoristas\scripts\audit-prod-layers.ps1"
if (-not (Test-Path $camadas)) { throw "Repositorio App Motoristas nao encontrado ao lado do Sistema Betinhos ($camadas). Rode a partir do checkout principal." }
$dev = Connect-Dataverse $devUrl @("org23b93544.crm2.dynamics.com")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $root "backup\deploy-solucoes\$Ambiente-$stamp"
New-Item -ItemType Directory -Force $out | Out-Null

# 1. Pre-checagens
if (-not $SkipGitChecks) {
  Push-Location $root
  try {
    if ((git branch --show-current).Trim() -ne "main") { throw "Publique a partir da main." }
    if (git status --porcelain) { throw "Checkout com alteracoes; publique a partir da main limpa." }
    git fetch -q origin main
    if ((git rev-parse HEAD).Trim() -ne (git rev-parse origin/main).Trim()) { throw "HEAD diferente de origin/main." }
  } finally { Pop-Location }
}
& (Join-Path $pasta "distribuir-solucoes.ps1") -SomenteConferir
if ($LASTEXITCODE -ne 0) { throw "Conferencia das solucoes no DEV falhou; rode distribuir-solucoes.ps1 e corrija antes do deploy." }
$dest = Connect-Dataverse $destUrl $null
$semSeguro = @(Get-StepsSemConfigSegura $dest @($regras.stepsSeguros))
foreach ($s in $semSeguro) { Write-Warning "$Ambiente ja esta sem configuracao segura: $s" }

# 2. Export de todas para comparar o conteudo com o ultimo deploy
Select-PacProfile $devUrl
$hashes = [ordered]@{}
foreach ($s in $script:Solucoes) {
  $zip = Join-Path $out "${s}_atual.zip"
  pac solution export --name $s --managed --path $zip --overwrite --async | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Export de $s falhou." }
  $hashes[$s] = Get-HashDoPacote $zip
}
$ultimoPath = Join-Path $pasta ("ultimo-deploy-{0}.json" -f $Ambiente.ToLowerInvariant())
$ultimo = if (Test-Path $ultimoPath) { Read-JsonFile $ultimoPath } else { @{} }
Write-JsonFile "$out\qual-mudou.json" @{ ordem = $script:Solucoes; hashesAtuais = $hashes; hashesDestino = $ultimo; forcar = $Solucoes }
$alteradas = @((node (Join-Path $pasta "qual-mudou.mjs") "$out\qual-mudou.json") | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw "qual-mudou.mjs falhou." }
if (-not $alteradas.Count) { Write-Step "Nada mudou desde o ultimo deploy em $Ambiente."; return }
Write-Step "a importar em ${Ambiente}: $($alteradas -join ' > ')"
& (Join-Path $pasta "foto-ambiente.ps1") -EnvironmentUrl $destUrl -Saida "$out\foto-antes.json"
if (-not $Aplicar) { Write-Step "DRY RUN: use -Aplicar para subir versao, exportar e importar."; return }

# 3. Versao, export conferido e import, uma por vez
$instaladas = @(Read-DvAll $dest "solutions?`$select=uniquename" | ForEach-Object { $_.uniquename })
foreach ($s in $alteradas) {
  Select-PacProfile $devUrl
  $atual = [version] (Read-DvAll $dev "solutions?`$select=version&`$filter=uniquename eq '$s'")[0].version
  $next = [version]::new($atual.Major, $atual.Minor, $atual.Build, $atual.Revision + 1)
  pac solution online-version --solution-name $s --solution-version $next.ToString() | Out-Null
  $zip = Join-Path $out ("{0}_{1}_managed.zip" -f $s, ($next.ToString() -replace '\.', '_'))
  pac solution export --name $s --managed --path $zip --overwrite --async | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Export de $s falhou." }
  $pastaZip = Join-Path $out "$s-conteudo"
  Expand-Archive -Path $zip -DestinationPath $pastaZip -Force
  if (Get-ChildItem $pastaZip -Recurse -Filter "environmentvariablevalues.json") { throw "$s leva valor de variavel de ambiente; tire da solucao no DEV." }
  node (Join-Path $root "packages\deploy\scan-secrets.mjs") $pastaZip
  if ($LASTEXITCODE -ne 0) { throw "scan-secrets encontrou segredo em $s." }
  Select-PacProfile $destUrl
  $upgrade = if ($instaladas -contains $s) { @("--stage-and-upgrade") } else { @() }
  $t = Measure-Command { pac solution import --path $zip @upgrade --publish-changes --activate-plugins --async --max-async-wait-time 120 }
  if ($LASTEXITCODE -ne 0) { throw "Import de $s em $Ambiente falhou." }
  Write-Step "$s $next importada em $($t.ToString())"
  $hashes[$s] = Get-HashDoPacote $zip
}

# 4. Prova
& (Join-Path $pasta "foto-ambiente.ps1") -EnvironmentUrl $destUrl -Saida "$out\foto-depois.json"
node (Join-Path $pasta "comparar-fotos.mjs") "$out\foto-antes.json" "$out\foto-depois.json" | Set-Content -Encoding UTF8 "$out\diferencas.json"
if ($LASTEXITCODE -ne 0) { throw "Perda detectada em ${Ambiente}: veja $out\diferencas.json. Nao siga sem investigar." }
$semSeguroDepois = @(Get-StepsSemConfigSegura $dest @($regras.stepsSeguros))
if ($semSeguroDepois.Count -gt $semSeguro.Count) { throw "Import deixou step sem configuracao segura: $($semSeguroDepois -join '; ')" }
foreach ($s in $alteradas) { & $camadas -EnvironmentUrl $destUrl -SolutionUniqueName $s -OutFile "$out\camadas-$s.csv" }
$novo = [ordered]@{}
foreach ($s in $script:Solucoes) { $novo[$s] = if ($alteradas -contains $s) { $hashes[$s] } elseif ($ultimo.PSObject.Properties[$s]) { $ultimo.$s } else { $hashes[$s] } }
Write-JsonFile $ultimoPath $novo
Write-Step "Deploy em $Ambiente concluido. Commite $ultimoPath na main."
```

- [ ] **Passo 2: simular no TEST** com `deploy-solucoes.ps1 -Ambiente TEST -SkipGitChecks`. Esperado: `Nada mudou desde o ultimo deploy em TEST`.
- [ ] **Passo 3: provar o ganho pelo script.** Mudar a descrição no DEV (o mesmo WebResource neutro do ensaio):

```powershell
. packages/deploy/solucoes/dataverse.ps1; . packages/deploy/solucoes/solucoes.ps1
$dvDev = Connect-Dataverse "https://org23b93544.crm2.dynamics.com" @("org23b93544.crm2.dynamics.com")
$wr = (Read-DvAll $dvDev "webresourceset?`$select=webresourceid,description&`$filter=name eq 'new_TelaFuncionariosLoader.html'")[0]
$antes = [string] $wr.description
$publicar = { Invoke-DvAction $dvDev "PublishXml" @{ ParameterXml = "<importexportxml><webresources><webresource>{$($wr.webresourceid)}</webresource></webresources></importexportxml>" } | Out-Null }
Invoke-RestMethod -Method Patch -Uri "$($dvDev.Api)/webresourceset($($wr.webresourceid))" -Headers $dvDev.Headers -Body (ConvertTo-Json @{ description = "$antes (deploy por solucao)" }) -ContentType "application/json"; & $publicar
& packages\deploy\prod\deploy-solucoes.ps1 -Ambiente TEST -SkipGitChecks
```

  Esperado: `a importar em TEST: BetinhosInterface`. Rodar de novo com `-Aplicar`. Esperado: só a Interface é importada, a comparação sai com código 0 e o `ultimo-deploy-test.json` é atualizado. Depois, restaurar:

```powershell
Invoke-RestMethod -Method Patch -Uri "$($dvDev.Api)/webresourceset($($wr.webresourceid))" -Headers $dvDev.Headers -Body (ConvertTo-Json @{ description = $antes }) -ContentType "application/json"; & $publicar
```
- [ ] **Passo 4: `qualidade-antes-do-pr`, `verificacao-manter`** (atualizar `verificar-solucoes` com a simulação do deploy) e **`verificar-deploy-dev`** (citar o deploy por solução).
- [ ] **Passo 5: commit e PR**

```bash
git add packages/deploy/prod/deploy-solucoes.ps1 packages/deploy/solucoes/ultimo-deploy-test.json .claude/skills/verificar-solucoes .claude/skills/verificar-deploy-dev
git commit -m "feat(deploy): deploy por solução para TEST e PROD com prova por fotos"
gh pr create --title "Segmentação da AppBetinhos: deploy por solução" --body "Deploy por solução (packages/deploy/prod/deploy-solucoes.ps1), conforme a spec docs/superpowers/specs/2026-10-21-segmentacao-appbetinhos-design.md.

Verificação da spec:
- [x] 4. Ensaio completo no TEST (relatório em docs/auditoria/ensaio-segmentacao-<data>.md)
- [x] 5. Sem -Aplicar, lista só a BetinhosInterface depois da mudança de WebResource; com -Aplicar, importa só ela sem perda
- [x] 6. verificar-solucoes criada e verificar-deploy-dev atualizada

PROD não foi tocado; a migração no PROD é a Fase 4 do plano.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

  (Troque `<data>` pela data do relatório da Tarefa 11 antes de rodar.)

---

## Fase 4 — PROD (num domingo de manhã, depois da promoção pendente)

Pré-condições, todas obrigatórias:
- promoção pendente já no PROD e estável;
- relatório do ensaio (Tarefa 11) aprovado;
- PRs das Fases 1 e 3 mesclados;
- `main` limpa no checkout principal;
- ok explícito do Renan no dia.

### Tarefa 15: migração no PROD

- [ ] **Passo 1: backup e aviso.** O Renan avisa a equipe que o sistema pode ficar lento na janela. Depois, rodar `pac admin backup --environment https://orgf261ae8e.crm2.dynamics.com --label "antes-segmentacao-AAAA-MM-DD"` (com a data do dia) e confirmar no admin center que o backup aparece.
- [ ] **Passo 2: pré-requisitos no PROD**, com ok do Renan para cada exclusão:

```powershell
. packages/deploy/solucoes/dataverse.ps1; . packages/deploy/solucoes/solucoes.ps1
$p = "https://orgf261ae8e.crm2.dynamics.com"
& "..\App Motoristas\scripts\audit-prod-layers.ps1" -EnvironmentUrl $p -OutFile backup\solucoes\prod\camadas-antes.csv
# para cada WebResource com Active no topo (esperados: cr40f_SistemaBetinhos*, new_TelaComposicaoPreco.html, new_TelaPlanner.html):
& "..\App Motoristas\scripts\remove-prod-active-layer.ps1" -EnvironmentUrl $p -WebResourceName "<nome do CSV>" -Apply
$dvp = Connect-Dataverse $p @("orgf261ae8e.crm2.dynamics.com")
$v2 = @(Read-DvAll $dvp "customapis?`$select=customapiid,uniquename&`$filter=startswith(uniquename,'cr40f_AI') and ismanaged eq false" | Where-Object { $_.uniquename -like '*V2' })
"apagar no PROD: $($v2.uniquename -join ', ')"   # mostrar ao Renan e esperar o ok
$v2 | ForEach-Object { Invoke-RestMethod -Method Delete -Uri "$($dvp.Api)/customapis($($_.customapiid))" -Headers $dvp.Headers }
& packages\deploy\solucoes\foto-ambiente.ps1 -EnvironmentUrl $p -Saida backup\solucoes\prod\P1.json
```

- [ ] **Passo 3: reexportar as 4 do DEV**, porque a `main` pode ter mudado desde o ensaio:

```powershell
& packages\deploy\solucoes\distribuir-solucoes.ps1 -Aplicar
& packages\deploy\solucoes\distribuir-solucoes.ps1 -SomenteConferir; if ($LASTEXITCODE -ne 0) { throw "conferencia falhou" }
Select-PacProfile https://org23b93544.crm2.dynamics.com
foreach ($s in $script:Solucoes) { pac solution export --name $s --managed --path "backup\solucoes\prod\${s}_managed.zip" --overwrite --async; if ($LASTEXITCODE -ne 0) { throw "export de $s falhou" } }
```

- [ ] **Passo 4: importar as 4 na ordem, com foto e comparação depois de cada uma:**

```powershell
Select-PacProfile $p
$anterior = "backup\solucoes\prod\P1.json"
foreach ($s in $script:Solucoes) {
  $t = Measure-Command { pac solution import --path "backup\solucoes\prod\${s}_managed.zip" --publish-changes --activate-plugins --async --max-async-wait-time 120 }
  if ($LASTEXITCODE -ne 0) { throw "import de $s falhou; PARE (nada foi excluido)" }
  "$s : $($t.ToString())"
  & packages\deploy\solucoes\foto-ambiente.ps1 -EnvironmentUrl $p -Saida "backup\solucoes\prod\P-$s.json"
  node packages\deploy\solucoes\comparar-fotos.mjs $anterior "backup\solucoes\prod\P-$s.json"
  if ($LASTEXITCODE -ne 0) { throw "perda depois de $s; PARE e investigue (nada foi excluido)" }
  $anterior = "backup\solucoes\prod\P-$s.json"
}
Get-StepsSemConfigSegura $dvp @((Read-JsonFile packages\deploy\solucoes\regras.json).stepsSeguros)
```

  Esperado: cada comparação sai com código 0. `Get-StepsSemConfigSegura` volta vazio; se não, rode os `provision-*` que o `deploy-prod.ps1` lista, com `BETINHOS_ALLOW_DIRECT_PROD=1`. Se algo divergir, **pare**: nada foi excluído, e o PROD segue com os componentes também na AppBetinhos.
- [ ] **Passo 5: ponto sem volta.** Só se `node comparar-fotos.mjs P1.json P-BetinhosMotoristas.json` sair com 0 e o Renan der o ok:

```powershell
pac solution delete --solution-name AppBetinhos
& packages\deploy\solucoes\foto-ambiente.ps1 -EnvironmentUrl $p -Saida backup\solucoes\prod\P4.json
node packages\deploy\solucoes\comparar-fotos.mjs backup\solucoes\prod\P-BetinhosMotoristas.json backup\solucoes\prod\P4.json
pac solution delete --solution-name gerarpagantes
& packages\deploy\solucoes\foto-ambiente.ps1 -EnvironmentUrl $p -Saida backup\solucoes\prod\P5.json
node packages\deploy\solucoes\comparar-fotos.mjs backup\solucoes\prod\P4.json backup\solucoes\prod\P5.json
```

  Esperado: as duas comparações saem com 0, e cada componente aparece só nas 4.
- [ ] **Passo 6: uso no PROD:**
  - `https://orgf261ae8e.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhos.html` abre, a Geral lista as reservas e o rodapé mostra `P5.versoes.sistemaBetinhos`;
  - o App Motoristas abre;
  - o menu do app model-driven abre;
  - `POST cr40f_FrotaPendencias` responde 200.
- [ ] **Passo 7: rollback, se precisar.** Restaurar o backup do passo 1 pelo admin center. Avisar o Renan: perde-se o que foi digitado na janela.
- [ ] **Passo 8: registrar.** Gravar `ultimo-deploy-prod.json` com os hashes dos 4 pacotes importados. Atualizar o relatório do ensaio com a seção do PROD. Commitar na `main` (`build: segmentacao AppBetinhos aplicada no PROD`).

### Tarefa 16: virar a chave dos scripts de publicação

**Files:**
- Modify: `App Motoristas/scripts/deploy-prod.ps1` (PR no repositório App Motoristas)
- Modify: `CLAUDE.md` (seção de publicação do Sistema Betinhos)
- Modify: memórias `betinhos-sistema-ci-cd`, `prod-espera-checklist` e `appbetinhos-limpeza-segmentacao`

- [ ] **Passo 1: `deploy-prod.ps1` do App Motoristas.**
  - Manter as pré-checagens do app (versão servida no DEV igual ao `package.json`).
  - Trocar os passos 2 a 4 por `& (Join-Path $root "..\Sistema Betinhos\packages\deploy\prod\deploy-solucoes.ps1") -Ambiente PROD -Solucoes BetinhosMotoristas -Aplicar:$Apply`.
  - Manter a conferência da versão servida do app no PROD.
- [ ] **Passo 2: `CLAUDE.md`.** Na seção "Publicação", acrescentar: TEST e PROD recebem as 4 soluções pelo `packages/deploy/prod/deploy-solucoes.ps1`, a partir da `main`; a AppBetinhos fica só no DEV, como caixa de entrada; e `distribuir-solucoes.ps1 -Aplicar` roda no DEV antes de cada deploy.
- [ ] **Passo 3: memórias.** Registrar a data da migração, as 4 soluções e que a AppBetinhos não existe mais em TEST nem PROD.
- [ ] **Passo 4: commits e PRs** nos dois repositórios, com a skill `qualidade-antes-do-pr`.

### Tarefa 17: migração gradual dos repositórios (contínua)

- [ ] Ao mexer em cada um dos 20 repositórios do checklist da spec, trocar o `SolutionUniqueName` de cada script pela solução da regra:
  - schema → `BetinhosCore`;
  - plug-in, Custom API e fluxo → `BetinhosAutomacao`;
  - tela e WebResource → `BetinhosInterface`;
  - app de motoristas → `BetinhosMotoristas`.

  Script que cria tabela e fluxo juntos usa o cabeçalho `MSCRM.SolutionUniqueName` certo em cada chamada. Marcar o repositório no checklist da spec.
- [ ] Quando os 20 estiverem marcados e o `distribuir-solucoes.ps1` (simulação) mostrar `a distribuir: 0` por uma semana, excluir o contêiner AppBetinhos do DEV, com ok do Renan. Excluir solução não gerenciada não exclui componentes.

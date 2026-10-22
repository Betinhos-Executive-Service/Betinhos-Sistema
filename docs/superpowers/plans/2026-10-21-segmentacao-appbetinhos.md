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
- pac: todo comando que lê ou escreve num ambiente passa `--environment <url>`, pelo `Invoke-Pac <url> @(...)` de `solucoes.ps1` (confere o host com `pac org who --environment` antes) ou pelo `Export-SolucaoGerenciada`. O perfil selecionado do pac é global (compartilhado por todas as sessões da máquina): nunca use `pac auth select` antes de import, delete, online-version ou export.
- Escrita em solução pelas funções de `solucoes.ps1` (incluir, remover, criar) só no DEV: elas recusam outro host.
- Antes de cada commit ou PR com código: skills `qualidade-antes-do-pr` e `verificacao-manter` (CLAUDE.md global).
- Commits em português e detalhados, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Desvio da spec decidido neste plano

A spec põe o upgrade da AppBetinhos vazia como caminho principal e a desinstalação como alternativa. Como a AppBetinhos continua viva no DEV como caixa de entrada, o DEV não consegue exportar uma AppBetinhos vazia sem esvaziar a caixa de entrada. Por isso, o plano usa a **desinstalação da AppBetinhos gerenciada** (`pac solution delete`, pelo `Invoke-Pac`) no TEST e no PROD: o Dataverse só exclui o componente que nenhuma outra solução gerenciada tem. Antes de cada desinstalação, `conferir-retirada.mjs` precisa sair com 0 na foto tirada depois dos 4 imports: componente que só a AppBetinhos (ou a `gerarpagantes`) tem não muda nada no comparador de fotos, e é justamente o que a desinstalação apaga. A Tarefa 10 prova isso no TEST antes de qualquer coisa no PROD. Se a prova falhar, o plano para e volta para a spec.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/deploy/solucoes/regras.json` | Solução por tipo, exceções por nome/app/BPF, tipos proibidos, dependências permitidas, steps com configuração segura |
| `packages/deploy/solucoes/arquivo.mjs` | `lerJson(caminho)` sem BOM |
| `packages/deploy/solucoes/classificar.mjs` (+ `.test.mjs`) | `validarRegras`, `chaveTipo`, `classificar` e CLI |
| `packages/deploy/solucoes/conferir.mjs` (+ `.test.mjs`) | `conferirCobertura`, `conferirDependencias`, `conferenciaOk` e CLI (código 1 se falhar) |
| `packages/deploy/solucoes/comparar-fotos.mjs` (+ `.test.mjs`) | `compararFotos`, `temPerda`, listas `PERDA`/`INFORMATIVO` e CLI `[--travado]` (código 1 se houver perda) |
| `packages/deploy/solucoes/conferir-retirada.mjs` (+ `.test.mjs`) | `conferirRetirada` e CLI: código 1 se a desinstalação apagaria algo (`soNaCaixa`) ou se há componente em duas das 4 |
| `packages/deploy/solucoes/qual-mudou.mjs` (+ `.test.mjs`) | `solucoesAlteradas` e CLI |
| `packages/deploy/solucoes/dataverse.ps1` | Conexão (secret de CI ou MSAL.PS), trava de host, leitura paginada, ações, JSON |
| `packages/deploy/solucoes/solucoes.ps1` | Ids de solução, componentes com nome, inclusão/remoção em solução (só DEV), dependências ausentes com base e tabela pai, hash de pacote, pac com `--environment` (`Assert-PacAmbiente`, `Invoke-Pac`), export conferido (`Export-SolucaoGerenciada`), steps sensíveis, cobertura da foto |
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

> **Implementada na Fase 1.** O código vigente é o do repositório; os blocos desta tarefa mostram a versão original do plano. Mudanças depois dela: R8 (validação de `permitidas` e da forma das exceções), R11 (`rodandoComoCli`), R15 e R17 (regras de negócio, busca do Dataverse e WebResources no Core) e M1 (teste de cada regra, exceção, proibido e da matriz de dependências).

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
  return JSON.parse((await readFile(caminho, 'utf8')).replace(/^\uFEFF/, ''))
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

> **Implementada na Fase 1.** O código vigente é o do repositório; os blocos desta tarefa mostram a versão original do plano. Mudanças depois dela: I1: `conferirDependencias` resolve o dono pela tabela pai (`pai`) e acusa como `fora das 4` a dependência de componente próprio (base Active, `fd140aae-4df4-11dd-bd17-0019b9312238`) que não está em nenhuma das 4; a dependência do sistema (outra base) continua ignorada.

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

> **Implementada na Fase 1.** Os blocos foram trocados pela referência aos arquivos do repositório. Decisões: R11 (`rodandoComoCli`), R12 (perda é fluxo que desliga e step que desativa; ligar e habilitar são informativos), I3 (`--travado`: no TEST travado, fluxo novo ou alterado que fica ligado, exceto regra de negócio e BPF, e step novo ou alterado que fica habilitado são perda) e M2 (`PERDA`/`INFORMATIVO` exportadas; um teste por lista de perda).

**Files:**
- Create: `packages/deploy/solucoes/comparar-fotos.mjs`
- Test: `packages/deploy/solucoes/comparar-fotos.test.mjs`

**Interfaces:**
- Consumes: `lerJson` (Tarefa 1).
- Produces:
  - formato de foto `Foto = { ambiente, quando, registros: {[tabela]: number}, aproximados: string[], fluxos: {[id]: {nome, estado, categoria}}, steps: {[id]: {nome, estado, seguro}}, variaveis: {[schema]: string|null}, componentes: {[id]: string[]}, tipos: {[id]: number}, pacotes: {[assembly]: pacote}, stepsSeguros: {[nome]: {existe, steps, seguro}}, versoes: {[item]: string} }`;
  - `compararFotos(antes: Foto, depois: Foto, { travado }?): Diferencas`;
  - `temPerda(d: Diferencas): boolean` (qualquer lista de `PERDA` não vazia);
  - CLI: `node comparar-fotos.mjs [--travado] <antes.json> <depois.json>` imprime as diferenças e sai com código 1 se `temPerda`.

- [ ] **Passo 1: escrever o teste que falha** (`comparar-fotos.test.mjs`)

Código vigente: `packages/deploy/solucoes/comparar-fotos.test.mjs` (e os testes de CLI em `cli.test.mjs`).

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `node --test packages/deploy/solucoes/comparar-fotos.test.mjs`
Esperado: FAIL com módulo não encontrado.

- [ ] **Passo 3: implementar `comparar-fotos.mjs`**

Código vigente: `packages/deploy/solucoes/comparar-fotos.mjs`.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `node --test packages/deploy/solucoes/comparar-fotos.test.mjs`
Esperado: todos passam (35 em 21/10/2026, depois de I3 e M2).

- [ ] **Passo 5: commit**

```bash
git add packages/deploy/solucoes/comparar-fotos.mjs packages/deploy/solucoes/comparar-fotos.test.mjs
git commit -m "feat(solucoes): comparação de fotos do ambiente para provar que nada se perde"
```

### Tarefa 4: bibliotecas PowerShell (conexão e solução)

> **Implementada na Fase 1.** Os blocos de código foram trocados pela referência aos arquivos do repositório. Mudanças depois do plano original: R13 e M4 (`Initialize-ArquivoDeSaida`), R16 (`Get-ExcedentesDasSolucoes`, `Remove-ComponenteDaSolucao`), R18 (`Get-ContagemRegistros`), C1 (`Select-PacProfile` saiu; entram `Assert-PacAmbiente` e `Invoke-Pac`), I1 (`Get-DependenciasAusentes` com base, dependente e tabela pai), I4 (`Get-SituacaoStepsSeguros`, `Assert-CoberturaDaFoto`), I5 (`Export-SolucaoGerenciada`, `Get-ManifestoDoPacote`) e M6 (`Assert-HostDev` nas escritas).

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
  - `Initialize-ArquivoDeSaida([string] $Caminho) -> string` (absoluto pelo `$PWD`, arquivo antigo apagado, pasta criada);
  - `Write-Step([string] $Message)`.
- Produces (`solucoes.ps1`, dot-source depois do `dataverse.ps1`):
  - `$script:Solucoes` (as 4, em ordem);
  - `Get-SolucaoId($Dv, $UniqueName) -> string|null`;
  - `Get-TiposPorEntidade($Dv) -> hashtable[int -> string]`;
  - `Get-ComponentesDaSolucao($Dv, $SolucaoId, $TiposPorEntidade) -> @{id;tipo;entidade;nome;app;bpf;comportamento}[]`;
  - `Add-ComponenteNaSolucao($Dv, $Componente, $Solucao)`, `Remove-ComponenteDaSolucao($Dv, $Id, $Tipo, $Solucao)` e `New-SolucaoSeFaltar($Dv, $UniqueName, $PublisherId) -> bool`, que recusam host diferente do DEV;
  - `Get-ExcedentesDasSolucoes($Linhas, $DonoEsperado, $Ordem, $TiposProibidos)`;
  - `Get-DependenciasAusentes($Dv, $Solucao) -> @{requerido;tipo;base;pai;dependente;tipoDependente}[]`;
  - `Get-HashDoPacote([string] $ZipPath) -> string` e `Get-ManifestoDoPacote([string] $ZipPath) -> @{UniqueName;Version;Managed}`;
  - `Assert-PacAmbiente([string] $Url)` e `Invoke-Pac([string] $Url, [string[]] $Argumentos) -> string[]` (acrescenta `--environment $Url`; falha se o código do pac não for 0);
  - `Export-SolucaoGerenciada($Dv, $Nome, $Caminho) -> @{Caminho;Versao}`;
  - `Get-ContagemRegistros($Dv, $Entidade) -> @{Total;Paginada}`;
  - `Get-SituacaoStepsSeguros($Dv, [string[]] $Nomes)` e `Get-StepsSemConfigSegura($Dv, [string[]] $Nomes) -> string[]`;
  - `Assert-CoberturaDaFoto($Foto, $FluxoIds, $StepIds)`.

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

Código vigente: `packages/deploy/solucoes/testa-solucoes.ps1` (respostas simuladas do `Invoke-RestMethod` e `pac` simulado).

- [ ] **Passo 3: rodar e ver falhar**

Rodar: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/testa-solucoes.ps1`
Esperado: erro de arquivo `dataverse.ps1` não encontrado.

- [ ] **Passo 4: implementar `dataverse.ps1`**

Código vigente: `packages/deploy/solucoes/dataverse.ps1`.

- [ ] **Passo 5: implementar `solucoes.ps1`**

Código vigente: `packages/deploy/solucoes/solucoes.ps1`.

- [ ] **Passo 6: rodar e ver passar**

Rodar: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/testa-solucoes.ps1`
Esperado: só linhas `ok` (63 em 21/10/2026) e nenhuma `FALHA`.

- [ ] **Passo 7: commit**

```bash
git add packages/deploy/solucoes/dataverse.ps1 packages/deploy/solucoes/solucoes.ps1 packages/deploy/solucoes/testa-solucoes.ps1
git commit -m "feat(solucoes): bibliotecas PowerShell de conexão e operações de solução com testes"
```

### Tarefa 5: distribuidor e conferência no DEV

> **Implementada na Fase 1.** O bloco do script foi trocado pela referência ao arquivo do repositório. Mudanças depois do plano original: R10 (caixa vazia é erro), R14 (dois valores de variável tirados da AppBetinhos), R15 e R17 (regras), R16 (limpeza dos excedentes arrastados pelo `AddSolutionComponent`), assemblies empacotados fora da conferência e I1 (linha da conferência com `dependencias fora das 4` e um aviso por dependência acusada).

**Files:**
- Create: `packages/deploy/solucoes/distribuir-solucoes.ps1`

**Interfaces:**
- Consumes: tudo da Tarefa 4, `classificar.mjs` (Tarefa 1) e `conferir.mjs` (Tarefa 2).
- Produces: `distribuir-solucoes.ps1 [-EnvironmentUrl dev] [-CaixaDeEntrada AppBetinhos] [-Aplicar] [-SomenteConferir]`.
  - Sem parâmetros: simula e lista o que distribuiria.
  - `-Aplicar`: cria as soluções que faltam e distribui.
  - `-SomenteConferir`: não altera nada e sai com código 0 ou 1.

- [ ] **Passo 1: escrever o script**

Código vigente: `packages/deploy/solucoes/distribuir-solucoes.ps1`.

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
  - `conferencia: sem dono 0; em duas 0; fora do lugar 0; dependencias para cima 0; dependencias fora das 4 0`;
  - `valores de variavel dentro das 4 solucoes: 0; excedentes fora da caixa: 0; assemblies empacotados: N` (N informativo);
  - código de saída 0.

  Se a conferência apontar dependência para cima, não force a solução errada: registre o par no relatório da tarefa e ajuste a regra (por exemplo, um WebResource usado por um formulário do Core vai para o Core por exceção de nome). Rode de novo até dar 0.

- [ ] **Passo 5: conferir sem alterar.** Rodar com `-SomenteConferir`. Esperado: a mesma linha de conferência com zeros e código 0.

- [ ] **Passo 6: exportar as 4 gerenciadas do DEV** (só leitura no DEV). Os ZIPs levam o valor padrão das variáveis (Cielo, Graph e Jev), então antes acrescente `backup/` ao `.gitignore` da raiz e confirme com `git check-ignore backup/solucoes/x.zip`. Os comandos rodam a partir da raiz do repositório.

```powershell
. packages/deploy/solucoes/dataverse.ps1; . packages/deploy/solucoes/solucoes.ps1
$dv = Connect-Dataverse "https://org23b93544.crm2.dynamics.com" @("org23b93544.crm2.dynamics.com")
foreach ($s in $script:Solucoes) { Export-SolucaoGerenciada $dv $s "backup\solucoes\${s}_managed.zip" }
```

  Esperado: 4 ZIPs sem erro. A AppBetinhos segue intacta como caixa de entrada.

- [ ] **Passo 7: commit**

```bash
git add packages/deploy/solucoes/distribuir-solucoes.ps1 packages/deploy/solucoes/regras.json .gitignore
git commit -m "feat(solucoes): distribuidor da caixa de entrada AppBetinhos nas 4 soluções do DEV"
```

### Tarefa 6: foto do ambiente

> **Implementada na Fase 1.** O bloco do script foi trocado pela referência ao arquivo do repositório. Mudanças depois do plano original: R13 e M4 (caminho absoluto, arquivo antigo apagado no início, pasta criada), R18 (contagem sempre exata: FetchXML e, acima de 50.000, paginação de ids; qualquer outro erro interrompe a foto), I2 (`tipos` e `pacotes`), I3 (`categoria` de cada fluxo) e I4 (falha com 0 componentes ou com fluxo/step das soluções sem estado; `stepsSeguros` com a situação dos 4 steps sensíveis).

**Files:**
- Create: `packages/deploy/solucoes/foto-ambiente.ps1`

**Interfaces:**
- Consumes: `dataverse.ps1`, `solucoes.ps1` (Tarefa 4) e `regras.json` (`stepsSeguros`).
- Produces: `foto-ambiente.ps1 -EnvironmentUrl <url> -Saida <arquivo.json> [-Solucoes <nomes>]`, que grava uma `Foto` (formato da Tarefa 3). Só leitura, em qualquer ambiente.

- [ ] **Passo 1: escrever o script**

Código vigente: `packages/deploy/solucoes/foto-ambiente.ps1`.

- [ ] **Passo 2: rodar duas fotos do DEV e comparar:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/foto-ambiente.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -Saida backup\solucoes\foto-dev-1.json
powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/foto-ambiente.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -Saida backup\solucoes\foto-dev-2.json
node packages/deploy/solucoes/comparar-fotos.mjs backup\solucoes\foto-dev-1.json backup\solucoes\foto-dev-2.json
```

  Esperado:
  - a foto lista cerca de 102 tabelas, 116 fluxos, 62 steps, 38 variáveis e 863 componentes (DEV em 21/10/2026) e termina com `steps sensiveis sem configuracao segura: 0`;
  - a foto falha (código 1, sem arquivo) se nenhuma solução pedida existir ou se algum fluxo ou step das soluções ficar sem estado;
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

Regras desta fase:
- Pré-condição: `distribuir-solucoes.ps1 -SomenteConferir` no DEV sai com código 0. Em 21/10/2026 saía com 1 por `cr40f_cobrancastripe` (exigida pelo Core, primeiro só na Default e depois na AppBetinhos sem distribuição); a decisão é do Renan (R20).
- Todo comando do pac com `Invoke-Pac <url>` (ou `Export-SolucaoGerenciada`), que confere o host com `pac org who --environment` e passa `--environment`. Nenhum `pac auth select`.
- Todo comparador de fotos do TEST roda com `--travado` e grava a saída: `node packages/deploy/solucoes/comparar-fotos.mjs --travado <antes> <depois> | Set-Content -Encoding UTF8 <diferencas.json>`. Se `fluxosLigadosNoTravado` ou `stepsHabilitadosNoTravado` não vierem vazias, o passo seguinte é o passo 4b da Tarefa 8 (desligar o que foi acusado), uma foto nova e a comparação de novo com a mesma foto de antes, antes de qualquer outro passo.
- Antes de qualquer desinstalação, `node packages/deploy/solucoes/conferir-retirada.mjs <foto>` sai com código 0.

Abertura de sessão usada nas tarefas (PowerShell 5.1, raiz do repositório):

```powershell
. packages/deploy/solucoes/dataverse.ps1; . packages/deploy/solucoes/solucoes.ps1
$devUrl = "https://org23b93544.crm2.dynamics.com"; $testUrl = "https://appbetinhostest.crm2.dynamics.com"
$dvDev = Connect-Dataverse $devUrl @("org23b93544.crm2.dynamics.com")
```

### Tarefa 8: copiar o PROD para o TEST e travar o TEST

- [ ] **Passo 1: perfil do pac para o TEST.** Rodar `pac auth create --environment https://appbetinhostest.crm2.dynamics.com --deviceCode`. O Renan conclui o login da conta noreply. Depois, `Assert-PacAmbiente $testUrl` sem erro. Não rode `pac auth select`: os comandos seguintes levam `--environment` (os de `pac admin` abaixo já trazem o ambiente explícito).
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
- [ ] **Passo 4b (usado depois de cada comparação `--travado` que acusar): desligar o que foi acusado.**

```powershell
$dv = Connect-Dataverse $testUrl @("appbetinhostest.crm2.dynamics.com")
$d = Read-JsonFile "<diferencas.json da comparacao que acusou>"
foreach ($f in @($d.fluxosLigadosNoTravado)) { Invoke-RestMethod -Method Patch -Uri "$($dv.Api)/workflows($($f.id))" -Headers $dv.Headers -Body '{"statecode":0,"statuscode":1}' -ContentType "application/json" }
foreach ($s in @($d.stepsHabilitadosNoTravado)) { Invoke-RestMethod -Method Patch -Uri "$($dv.Api)/sdkmessageprocessingsteps($($s.id))" -Headers $dv.Headers -Body '{"statecode":1,"statuscode":2}' -ContentType "application/json" }
"desligados: $(@($d.fluxosLigadosNoTravado).Count) fluxos, $(@($d.stepsHabilitadosNoTravado).Count) steps"
```

  Depois, uma foto nova e a comparação `--travado` de novo com a mesma foto de antes: as duas listas precisam sair vazias. Registre no relatório o que foi desligado (o import no PROD vai ligar o mesmo: avalie com o Renan antes da Fase 4).
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
# Conferencia antes, export conferido do conjunto do ensaio (AppBetinhos e as 4) e conferencia depois: o DEV e vivo.
& packages\deploy\solucoes\distribuir-solucoes.ps1 -SomenteConferir; if ($LASTEXITCODE -ne 0) { throw "conferencia do DEV falhou; corrija antes de exportar" }
foreach ($s in @("AppBetinhos") + $script:Solucoes) { Export-SolucaoGerenciada $dvDev $s "backup\solucoes\ensaio\${s}_managed.zip" }
& packages\deploy\solucoes\distribuir-solucoes.ps1 -SomenteConferir; if ($LASTEXITCODE -ne 0) { throw "o DEV mudou durante o export; exporte de novo" }
$t = Measure-Command { Invoke-Pac $testUrl @("solution", "import", "--path", "backup\solucoes\ensaio\AppBetinhos_managed.zip", "--stage-and-upgrade", "--publish-changes", "--activate-plugins", "--async", "--max-async-wait-time", "120") | Out-Null }
"tempo de referencia: $($t.ToString())"
```

  Esperado: as duas conferências com código 0, os 5 ZIPs conferidos (UniqueName, versão e Managed) e o import sem erro. Esse tempo é a referência. Os ZIPs das 4 são os que a Tarefa 10 importa.
- [ ] **Passo 5: foto 2 e comparação.** Rodar `node packages/deploy/solucoes/comparar-fotos.mjs --travado backup\solucoes\ensaio\foto1.json backup\solucoes\ensaio\foto2.json | Set-Content -Encoding UTF8 backup\solucoes\ensaio\dif-1-2.json`. Se `fluxosLigadosNoTravado` ou `stepsHabilitadosNoTravado` vierem preenchidas, rode o passo 4b da Tarefa 8, tire a foto 2 de novo e compare de novo. Esperado:
  - as perdas são só os componentes excluídos na limpeza de 21/10 (lista na seção 6 do relatório de auditoria);
  - `registrosCairam` só nas tabelas excluídas (`cr40f_contextooperacionalia` com 1 registro, `cr40f_registrodeviagem`);
  - nenhum fluxo que estava ligado desliga, porque no TEST todos estão desligados;
  - `fluxosLigadosNoTravado` e `stepsHabilitadosNoTravado` vazias (depois do 4b, se precisou).

  Qualquer outra perda: **pare**, registre e investigue antes de seguir.

### Tarefa 10: migração e retirada da AppBetinhos no TEST

- [ ] **Passo 1: importar as 4 na ordem, medindo cada uma.** É a primeira instalação delas, então o import é sem `--stage-and-upgrade`:

```powershell
foreach ($s in $script:Solucoes) {
  $t = Measure-Command { Invoke-Pac $testUrl @("solution", "import", "--path", "backup\solucoes\ensaio\${s}_managed.zip", "--publish-changes", "--activate-plugins", "--async", "--max-async-wait-time", "120") | Out-Null }
  "$s : $($t.ToString())"
}
```

  Os ZIPs são os da Tarefa 9, passo 4 (exportados com a AppBetinhos, entre duas conferências com código 0). Se o DEV mudou desde então, refaça o passo 4 da Tarefa 9 inteiro antes (conferência, export conferido, conferência); não reaproveite ZIP de outra rodada.
- [ ] **Passo 2: foto 3, comparação com a foto 2 e conferência da retirada.**
  - `node packages/deploy/solucoes/comparar-fotos.mjs --travado foto2.json foto3.json | Set-Content -Encoding UTF8 dif-2-3.json` (caminhos em `backup\solucoes\ensaio\`). Esperado: código 0; `donosMudaram` mostra os componentes ganhando a solução nova ao lado da AppBetinhos. Se acusar fluxo ligado ou step habilitado: passo 4b da Tarefa 8, foto 3 de novo, comparação de novo.
  - `node packages/deploy/solucoes/conferir-retirada.mjs backup\solucoes\ensaio\foto3.json`. Esperado: código 0, `soNaCaixa` e `emDuasNovas` vazias (`peloPacote` informativo: assembly carregado por pacote da Automação). Se `soNaCaixa` vier preenchida, **pare**: a desinstalação apagaria esses componentes (o `tipo` explica, por exemplo 381 é valor de variável). Inclua o componente na solução certa no DEV, refaça o export da Tarefa 9 e o import.
- [ ] **Passo 3: desinstalar a AppBetinhos gerenciada**, só com a conferência da retirada do passo 2 em código 0, medindo o tempo: `$t = Measure-Command { Invoke-Pac $testUrl @("solution", "delete", "--solution-name", "AppBetinhos") | Out-Null }`.
- [ ] **Passo 4: foto 4 e comparação `--travado` com a foto 3.** Esperado:
  - `temPerda` falso;
  - `componentesSumiram` vazio;
  - cada componente tem só uma das 4.

  Se algo sumir: pare. A desinstalação não serve, e o ensaio volta para a spec (upgrade vazio montado à mão).
- [ ] **Passo 5: desinstalar a `gerarpagantes`.** Antes, `node packages/deploy/solucoes/conferir-retirada.mjs backup\solucoes\ensaio\foto4.json` com código 0. Depois, `Invoke-Pac $testUrl @("solution", "delete", "--solution-name", "gerarpagantes")` e foto 5 comparada (`--travado`) com a foto 4, com a mesma expectativa.

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
Invoke-Pac $devUrl @("solution", "online-version", "--solution-name", "BetinhosInterface", "--solution-version", "1.0.0.1") | Out-Null
$zip = (Export-SolucaoGerenciada $dvDev "BetinhosInterface" "backup\solucoes\ensaio\BetinhosInterface_1_0_0_1_managed.zip").Caminho
$t = Measure-Command { Invoke-Pac $testUrl @("solution", "import", "--path", $zip, "--stage-and-upgrade", "--publish-changes", "--async", "--max-async-wait-time", "60") | Out-Null }
"so a Interface: $($t.ToString())"
```

  Esperado:
  - o tempo fica bem abaixo da referência da Tarefa 9;
  - a foto 6, comparada com a foto 5 com `--travado`, sai com código 0 e só mostra a versão nova da Interface;
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

# 2. Export conferido de todas (ZIP novo, UniqueName, versao, Managed) para comparar o conteudo com o ultimo deploy
$hashes = [ordered]@{}
foreach ($s in $script:Solucoes) {
  $zip = (Export-SolucaoGerenciada $dev $s (Join-Path $out "${s}_atual.zip")).Caminho
  $hashes[$s] = Get-HashDoPacote $zip
}
& (Join-Path $pasta "distribuir-solucoes.ps1") -SomenteConferir
if ($LASTEXITCODE -ne 0) { throw "O DEV mudou durante o export (conferencia falhou); rode o deploy de novo." }
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
  $atual = [version] (Read-DvAll $dev "solutions?`$select=version&`$filter=uniquename eq '$s'")[0].version
  $next = [version]::new($atual.Major, $atual.Minor, $atual.Build, $atual.Revision + 1)
  Invoke-Pac $devUrl @("solution", "online-version", "--solution-name", $s, "--solution-version", $next.ToString()) | Out-Null
  # O helper confere que o ZIP traz a versao nova ($next), lida de novo no DEV.
  $zip = (Export-SolucaoGerenciada $dev $s (Join-Path $out ("{0}_{1}_managed.zip" -f $s, ($next.ToString() -replace '\.', '_')))).Caminho
  $pastaZip = Join-Path $out "$s-conteudo"
  Expand-Archive -Path $zip -DestinationPath $pastaZip -Force
  if (Get-ChildItem $pastaZip -Recurse -Filter "environmentvariablevalues.json") { throw "$s leva valor de variavel de ambiente; tire da solucao no DEV." }
  node (Join-Path $root "packages\deploy\scan-secrets.mjs") $pastaZip
  if ($LASTEXITCODE -ne 0) { throw "scan-secrets encontrou segredo em $s." }
  $upgrade = if ($instaladas -contains $s) { @("--stage-and-upgrade") } else { @() }
  $t = Measure-Command { Invoke-Pac $destUrl (@("solution", "import", "--path", $zip) + $upgrade + @("--publish-changes", "--activate-plugins", "--async", "--max-async-wait-time", "120")) | Out-Null }
  Write-Step "$s $next importada em $($t.ToString())"
  $hashes[$s] = Get-HashDoPacote $zip
}

# 4. Prova
& (Join-Path $pasta "foto-ambiente.ps1") -EnvironmentUrl $destUrl -Saida "$out\foto-depois.json"
# O TEST fica travado (modo de administracao, fluxos desligados) ate a migracao no PROD: fluxo ligado pelo import e perda.
$travado = if ($Ambiente -eq "TEST") { @("--travado") } else { @() }
node (Join-Path $pasta "comparar-fotos.mjs") @travado "$out\foto-antes.json" "$out\foto-depois.json" | Set-Content -Encoding UTF8 "$out\diferencas.json"
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
$devUrl = "https://org23b93544.crm2.dynamics.com"
$dvDev = Connect-Dataverse $devUrl @("org23b93544.crm2.dynamics.com")
& packages\deploy\solucoes\distribuir-solucoes.ps1 -Aplicar
& packages\deploy\solucoes\distribuir-solucoes.ps1 -SomenteConferir; if ($LASTEXITCODE -ne 0) { throw "conferencia falhou" }
foreach ($s in $script:Solucoes) { Export-SolucaoGerenciada $dvDev $s "backup\solucoes\prod\${s}_managed.zip" }
& packages\deploy\solucoes\distribuir-solucoes.ps1 -SomenteConferir; if ($LASTEXITCODE -ne 0) { throw "o DEV mudou durante o export; exporte de novo" }
```

- [ ] **Passo 4: importar as 4 na ordem, com foto e comparação depois de cada uma:**

```powershell
$anterior = "backup\solucoes\prod\P1.json"
foreach ($s in $script:Solucoes) {
  # Invoke-Pac confere com pac org who que $p e o PROD e passa --environment; se o import falhar, ele lanca: PARE (nada foi excluido).
  $t = Measure-Command { Invoke-Pac $p @("solution", "import", "--path", "backup\solucoes\prod\${s}_managed.zip", "--publish-changes", "--activate-plugins", "--async", "--max-async-wait-time", "120") | Out-Null }
  "$s : $($t.ToString())"
  & packages\deploy\solucoes\foto-ambiente.ps1 -EnvironmentUrl $p -Saida "backup\solucoes\prod\P-$s.json"
  node packages\deploy\solucoes\comparar-fotos.mjs $anterior "backup\solucoes\prod\P-$s.json"
  if ($LASTEXITCODE -ne 0) { throw "perda depois de $s; PARE e investigue (nada foi excluido)" }
  $anterior = "backup\solucoes\prod\P-$s.json"
}
Get-StepsSemConfigSegura $dvp @((Read-JsonFile packages\deploy\solucoes\regras.json).stepsSeguros)
```

  Esperado: cada comparação sai com código 0. `Get-StepsSemConfigSegura` volta vazio; se não, rode os `provision-*` que o `deploy-prod.ps1` lista, com `BETINHOS_ALLOW_DIRECT_PROD=1`. Se algo divergir, **pare**: nada foi excluído, e o PROD segue com os componentes também na AppBetinhos.
- [ ] **Passo 5: ponto sem volta.** Só se as duas barreiras saírem com código 0 e o Renan der o ok:
  - `node packages\deploy\solucoes\comparar-fotos.mjs backup\solucoes\prod\P1.json backup\solucoes\prod\P-BetinhosMotoristas.json`;
  - `node packages\deploy\solucoes\conferir-retirada.mjs backup\solucoes\prod\P-BetinhosMotoristas.json` (`soNaCaixa` e `emDuasNovas` vazias; se não, **pare**: a desinstalação apagaria esses componentes).

```powershell
Invoke-Pac $p @("solution", "delete", "--solution-name", "AppBetinhos") | Out-Null
& packages\deploy\solucoes\foto-ambiente.ps1 -EnvironmentUrl $p -Saida backup\solucoes\prod\P4.json
node packages\deploy\solucoes\comparar-fotos.mjs backup\solucoes\prod\P-BetinhosMotoristas.json backup\solucoes\prod\P4.json
if ($LASTEXITCODE -ne 0) { throw "perda depois de desinstalar a AppBetinhos; PARE e avalie o backup" }
node packages\deploy\solucoes\conferir-retirada.mjs backup\solucoes\prod\P4.json
if ($LASTEXITCODE -ne 0) { throw "a gerarpagantes ainda e dona unica de componentes; PARE antes de desinstala-la" }
Invoke-Pac $p @("solution", "delete", "--solution-name", "gerarpagantes") | Out-Null
& packages\deploy\solucoes\foto-ambiente.ps1 -EnvironmentUrl $p -Saida backup\solucoes\prod\P5.json
node packages\deploy\solucoes\comparar-fotos.mjs backup\solucoes\prod\P4.json backup\solucoes\prod\P5.json
```

  Esperado: as duas comparações e a conferência da retirada saem com 0, e cada componente aparece só nas 4. O PROD não é travado (os fluxos estão ligados), então aqui o comparador roda sem `--travado`.
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

# Acessos por perfil, plano 1 (backend) — plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans. Passos com checkbox (`- [ ]`).

**Objetivo:** criar no Dataverse DEV os papéis `Perfil - *`, os perfis de coluna de mesmo nome, a tabela de histórico e a Custom API `cr40f_AcessoDefinirPerfis`, sem tirar nada de ninguém.

**Arquitetura:** um mapa versionado (`acessosMapa.json` + `acessosColunas.json`) diz que tabelas e colunas cada perfil alcança. Um gerador em Node transforma o mapa em `perfis.gerado.json`; um motor em PowerShell aplica esse arquivo no ambiente por migration (papel, privilégios, perfil de coluna, permissões). A atribuição a pessoas é só pela Custom API, num plugin que roda como SYSTEM e grava o histórico.

**Stack:** Node 22 (`node:test`), vitest (shell), PowerShell 5.1/7 (migrations), C# `net462` (plugin) e `net48` + xUnit (testes), Dataverse Web API v9.2.

**Spec:** `docs/superpowers/specs/2026-11-23-acessos-por-perfil-design.md` (ler antes de começar).

**Planos irmãos:** 2 (shell: menu, guarda de rota, tela `#/acessos`), 3 (níveis dentro das telas), 4 (corte dos papéis antigos). Este plano não muda nenhuma tela.

## Restrições globais

- Comandos rodam a partir da raiz do worktree. Nunca `cd` para o checkout principal. Nunca `git stash` puro.
- **PROD é somente leitura.** Neste plano o PROD só recebe GET (`quem-le.mjs`). Nada de `pnpm push`, `pnpm wr`, `sitemap:*`, `push:plugin:*` nem `provision-*`.
- **Ninguém roda script de schema à mão:** migration e motor só em dry-run (sem `-Apply`) na máquina local. Quem aplica é o Deploy do DEV depois do merge na `develop`.
- **Repositório público:** nada de segredo, `sig=`, CPF, nome de pessoa ou id de usuário real em código, teste, plano, commit ou PR. Ids dos usuários de teste só por variável de ambiente. Token só por variável de ambiente, nunca impresso.
- Migration publicada é imutável. Antes de escrever uma, ler `packages/deploy/migrations/README.md`; se alguma regra de lá conflitar com este plano, parar e relatar.
- Migrations e motor: BOM UTF-8, só ASCII no arquivo (acento por `$([char]0x..)`), compatível com PowerShell 5.1 (sem ternário, sem `??`), idempotentes, toda escrita `Invoke-Dv` termina em `| Out-Null`.
- Os nomes `20261123-14xx` valem para o dia 23/11/2026. Em outro dia, trocar o prefixo de data mantendo a ordem (1400, 1405, 1410) e conferir que nenhuma migration da `develop` tem nome maior.
- Nenhum papel `Perfil - *` recebe privilégio de personalização nem lê `cr40f_segredo` (o gerador e o motor travam isso; não afrouxar a trava para fazer um teste passar).
- Commits em português, detalhados, terminando com a linha `Co-Authored-By` da sessão que executa. Se o hook bloquear o commit, seguir a skill `verificacao-manter` (evidência = saída dos testes da tarefa). Nunca criar `.verificacao/desativado`.
- Ferramentas fora do PATH: `~/.dotnet/dotnet` (8.0) e `~/.dotnet/tools/pwsh`. `az` em `/usr/bin/az`. Não há `jq`.
- Subagentes: nunca Fable. Sonnet para implementar, Haiku para busca.

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `packages/deploy/acessos/listar-tabelas.mjs` (novo) | Somente leitura: grava o catálogo de tabelas customizadas do ambiente |
| `packages/deploy/acessos/tabelas.json` (novo, gerado) | Catálogo versionado usado pelo teste do mapa |
| `apps/shell/src/nav/acessosMapa.json` (novo) | Fonte da verdade: tabelas por perfil e perfis por rota do menu |
| `apps/shell/src/nav/acessosMapa.test.ts` (novo) | Garante que cada rota alcança as tabelas que a tela usa |
| `apps/shell/src/nav/acessosColunas.json` (novo) | Fonte da verdade: colunas protegidas por perfil e nível |
| `packages/deploy/acessos/gerar.mjs` (novo) | Gera `perfis.gerado.json` a partir dos dois mapas |
| `packages/deploy/acessos/gerar.test.mjs` (novo) | Testa regras do gerador e trava o gerado em dia |
| `packages/deploy/acessos/perfis.gerado.json` (novo, gerado) | O que o motor aplica |
| `packages/deploy/acessos/aplicar-perfis.ps1` (novo) | Motor: cria/regrava papéis e perfis de coluna |
| `packages/deploy/acessos/quem-le.mjs` (novo) | Somente leitura: quem perde leitura com a proteção das colunas de passageiro |
| `packages/deploy/acessos/prova.mjs` (novo) | Prova no DEV, por impersonação, que cada perfil enxerga o que deve |
| `packages/deploy/migrations/_dv.ps1` | `Invoke-Dv` ganha `$ExtraHeaders` |
| `packages/deploy/migrations/20261123-1400-acessos-historico.ps1` (novo) | Tabela `cr40f_acessohistorico` |
| `packages/deploy/migrations/20261123-1405-acessos-passageiros-colunas.ps1` (novo) | Segurança de coluna em 4 colunas de `cr40f_bancodedados` |
| `packages/deploy/migrations/20261123-1410-acessos-perfis.ps1` (novo) | Chama o motor com o hash do gerado |
| `packages/deploy/solucoes/regras.json` | Tipo 71 (permissão de coluna) → BetinhosCore |
| `packages/deploy/package.json` | `acessos/gerar.test.mjs` no script `test` |
| `packages/plugins/Cr40f.Acesso.Plugin/PerfisDoUsuario.cs` (novo) | Modelo: áreas com nível + Administrador de acessos |
| `packages/plugins/Cr40f.Acesso.Plugin/AcessoCatalogo.cs` (novo) | Nomes dos papéis, leitura e escrita do JSON de perfis |
| `packages/plugins/Cr40f.Acesso.Plugin/PapeisDoUsuario.cs` (novo) | Papéis diretos e de equipe de um usuário |
| `packages/plugins/Cr40f.Acesso.Plugin/DefinirPerfisHandler.cs` (novo) | Regra: travas, diferença, associação, histórico |
| `packages/plugins/Cr40f.Acesso.Plugin/DefinirPerfisPlugin.cs` (novo) | Casca `IPlugin` da Custom API |
| `packages/plugins/Cr40f.Acesso.Plugin/JsonLeve.cs` | Ganha `LerLista` |
| `packages/plugins/Cr40f.Acesso.Plugin.Tests/FakeService.cs` | `Associate`/`Disassociate` de verdade |
| `packages/plugins/Cr40f.Acesso.Plugin.Tests/AcessoCatalogoTests.cs` (novo) | Testes do catálogo |
| `packages/plugins/Cr40f.Acesso.Plugin.Tests/DefinirPerfisHandlerTests.cs` (novo) | Testes da regra |
| `packages/plugins/tools/Cr40f.Acesso.Registrar/Program.cs` | Registra o tipo, a Custom API e o step |
| `.claude/skills/verificar-acessos/SKILL.md` (novo) | Roteiro de verificação da área |
| `.claude/skills/verificar-index.md` | Linha da área nova |
| `docs/superpowers/specs/2026-11-23-acessos-por-perfil-design.md` | Já corrigida junto com este plano (linha da prova do Financeiro Operador) |

## Vocabulário (vale para todas as tarefas)

- **Área:** `operacional`, `financeiro`, `frota`, `rh`. **Nível:** `operador`, `gestor`. **Perfil especial:** `acessos` (Administrador de acessos, sem nível).
- **Nome do papel e do perfil de coluna:** `Perfil - <Operacional|Financeiro|Frota|RH> - <Operador|Gestor>`. Sem nível e sem perfil de coluna: `Perfil - Base`, `Perfil - Administrador de acessos`.
- **Classes de tabela dentro de um módulo** (`acessosMapa.json`):

| Classe | Operador recebe | Gestor recebe a mais |
|---|---|---|
| `donas` | Read, Create, Write, Append, AppendTo | Delete |
| `filhas` (linhas-filhas que a tela apaga ao editar o pai) | Read, Create, Write, Delete, Append, AppendTo | nada |
| `cria` | Read, Create, Write, Append, AppendTo | nada |
| `edita` | Read, Write, Append, AppendTo | nada |
| `leitura` | Read, AppendTo | nada |

- **Pedido de perfis (JSON da Custom API):** lista de `{ "perfil": "<área>", "nivel": "<nível>" }` e, opcional, `{ "perfil": "acessos" }`. Lista vazia = só o Base.
- **`fieldpermission`:** `canread`/`cancreate`/`canupdate` valem `4` (permitido) ou `0` (não).

---

### Tarefa 1: trazer a develop e gerar o catálogo de tabelas

**Arquivos:**
- Criar: `packages/deploy/acessos/listar-tabelas.mjs`
- Criar (gerado): `packages/deploy/acessos/tabelas.json`

**Interfaces:**
- Produz: `tabelas.json`, lista ordenada de `{ "logico": string, "conjunto": string, "organizacao": boolean }` (uma por linha). A Tarefa 2 lê esse arquivo.

- [ ] **Passo 1: trazer a develop**

```bash
git fetch origin develop && git merge origin/develop
```

Esperado: merge sem conflito (a branch só tem a spec e os planos). Com conflito: parar e relatar.

- [ ] **Passo 2: escrever o script**

`packages/deploy/acessos/listar-tabelas.mjs`:

```js
// Somente leitura: lista as tabelas customizadas do ambiente para o catalogo usado pelo teste do mapa de acessos.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const url = process.env.DV_URL?.replace(/\/$/, '')
const token = process.env.DV_ACCESS_TOKEN
if (!url || !token) {
  console.error('Defina DV_URL e DV_ACCESS_TOKEN.')
  process.exit(1)
}
const destino = fileURLToPath(new URL('./tabelas.json', import.meta.url))
const resposta = await fetch(
  `${url}/api/data/v9.2/EntityDefinitions?$select=LogicalName,EntitySetName,OwnershipType&$filter=IsCustomEntity eq true`,
  { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
)
if (!resposta.ok) {
  console.error(`Falha ${resposta.status} ao listar tabelas.`)
  process.exit(1)
}
const tabelas = (await resposta.json()).value
  .map((t) => ({ logico: t.LogicalName, conjunto: t.EntitySetName, organizacao: t.OwnershipType === 'OrganizationOwned' }))
  .sort((a, b) => a.logico.localeCompare(b.logico))
writeFileSync(destino, `[\n${tabelas.map((t) => `  ${JSON.stringify(t)}`).join(',\n')}\n]\n`)
console.log(`${tabelas.length} tabelas em tabelas.json`)
```

- [ ] **Passo 3: gerar o catálogo no DEV (somente leitura)**

```bash
DV_URL=https://org23b93544.crm2.dynamics.com \
DV_ACCESS_TOKEN="$(az account get-access-token --resource https://org23b93544.crm2.dynamics.com --query accessToken -o tsv)" \
node packages/deploy/acessos/listar-tabelas.mjs
```

Esperado: `<n> tabelas em tabelas.json`, com n acima de 100. Conferir: `grep -c '"logico"' packages/deploy/acessos/tabelas.json` e `grep -n 'cr40f_financeiro"' packages/deploy/acessos/tabelas.json | head -2`. Sem `az login` válido: parar e relatar (o catálogo não pode ser inventado).

- [ ] **Passo 4: commit**

```bash
git add packages/deploy/acessos/listar-tabelas.mjs packages/deploy/acessos/tabelas.json
git commit -m "feat(acessos): catálogo de tabelas do DEV para o mapa de acessos"
```

---

### Tarefa 2: mapa de acessos (tabelas por perfil, perfis por rota)

**Arquivos:**
- Criar: `apps/shell/src/nav/acessosMapa.json`
- Criar: `apps/shell/src/nav/acessosMapa.test.ts`

**Interfaces:**
- Consome: `packages/deploy/acessos/tabelas.json` (Tarefa 1); `MENU` de `apps/shell/src/nav/menu.ts` (grupos com `items`, cada item com `id` e `kind`; item `kind: 'entity'` tem `entity`).
- Produz: `acessosMapa.json` com `{ base, modulos, rotas }`:
  - `base`: `{ leitura: string[], proprio: string[], cria: string[], donas: string[], sistema: Record<tabela, Record<ação, profundidade>> }`
  - `modulos.<área>`: `{ donas?, filhas?, cria?, edita?, leitura? }` (listas de nomes lógicos)
  - `rotas.<id do menu>`: `{ perfis?: string[], pastas: string[], ignorar?: { tabela, motivo }[] }`

- [ ] **Passo 1: escrever o teste**

`apps/shell/src/nav/acessosMapa.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import mapaJson from './acessosMapa.json'
import { MENU } from './menu'

type Classe = 'donas' | 'filhas' | 'cria' | 'edita' | 'leitura'
type Modulo = Partial<Record<Classe, string[]>>
type Rota = { perfis?: string[]; pastas: string[]; ignorar?: { tabela: string; motivo: string }[] }
type Base = { leitura: string[]; proprio: string[]; cria: string[]; donas: string[]; sistema: Record<string, Record<string, string>> }
type Mapa = { base: Base; modulos: Record<string, Modulo>; rotas: Record<string, Rota> }

const mapa = mapaJson as unknown as Mapa
const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url))
const catalogo = JSON.parse(readFileSync(join(RAIZ, 'packages/deploy/acessos/tabelas.json'), 'utf8')) as { logico: string; conjunto: string }[]
const porNome = new Map<string, string>()
for (const t of catalogo) {
  porNome.set(t.logico, t.logico)
  porNome.set(t.conjunto, t.logico)
}
const nomes = [...porNome.keys()].sort((a, b) => b.length - a.length)
const ACHA = new RegExp(`(?<![A-Za-z0-9_])(${nomes.join('|')})(?![A-Za-z0-9_])`, 'g')

const PERFIS = ['operacional', 'financeiro', 'frota', 'rh', 'acessos']
const SEM_PERFIL = ['inicio', 'planner']
const CLASSES: Classe[] = ['donas', 'filhas', 'cria', 'edita', 'leitura']
const FILHAS: Record<string, string[]> = {
  operacional: ['cr40f_cotacaoopcao', 'cr40f_cotacaoopcaoitem'],
  financeiro: ['cr40f_cotacaoopcao', 'cr40f_cotacaoopcaoitem', 'cr40f_itempagamentoaterceiro'],
  frota: ['cr40f_fotoequipamento'],
  rh: ['cr40f_treinamentoparticipacao'],
}

function arquivos(pasta: string): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho))
    else if (/\.(ts|tsx|js|mjs)$/.test(nome) && !nome.includes('.test.')) saida.push(caminho)
  }
  return saida
}

const itens = MENU.flatMap((g) => g.items)

function tabelasDaRota(id: string, rota: Rota): string[] {
  const achadas = new Set<string>()
  for (const pasta of rota.pastas)
    for (const arquivo of arquivos(join(RAIZ, pasta)))
      for (const m of readFileSync(arquivo, 'utf8').matchAll(ACHA)) {
        const logico = porNome.get(m[1] ?? '')
        if (logico) achadas.add(logico)
      }
  const item = itens.find((i) => i.id === id)
  if (item?.kind === 'entity') achadas.add(item.entity)
  return [...achadas].sort()
}

// base.cria nao entra: quem so cria nao le.
const daBase = new Set([...mapa.base.leitura, ...mapa.base.proprio, ...mapa.base.donas, ...Object.keys(mapa.base.sistema)])
const doModulo = (perfil: string) => new Set(CLASSES.flatMap((c) => mapa.modulos[perfil]?.[c] ?? []))

describe('mapa de acessos', () => {
  it('toda rota do mapa existe no menu', () => {
    const ids = new Set(itens.map((i) => i.id))
    expect(Object.keys(mapa.rotas).filter((id) => !ids.has(id))).toEqual([])
  })

  it('todo item do menu está no mapa e, fora das rotas livres, tem perfil', () => {
    expect(itens.filter((i) => !mapa.rotas[i.id]).map((i) => i.id)).toEqual([])
    const semPerfil = itens.filter((i) => !SEM_PERFIL.includes(i.id) && !mapa.rotas[i.id]?.perfis?.length).map((i) => i.id)
    expect(semPerfil).toEqual([])
  })

  it('só usa perfis conhecidos', () => {
    const usados = Object.values(mapa.rotas).flatMap((r) => r.perfis ?? [])
    expect([...new Set(usados)].filter((p) => !PERFIS.includes(p))).toEqual([])
    expect(Object.keys(mapa.modulos).sort()).toEqual(['financeiro', 'frota', 'operacional', 'rh'])
  })

  it('cada perfil da rota alcança as tabelas que a tela usa', () => {
    const falhas: string[] = []
    for (const [id, rota] of Object.entries(mapa.rotas)) {
      const ignoradas = new Set((rota.ignorar ?? []).map((i) => i.tabela))
      const tabelas = tabelasDaRota(id, rota).filter((t) => !ignoradas.has(t) && !daBase.has(t))
      const perfis: (string | null)[] = rota.perfis?.length ? rota.perfis : [null]
      for (const perfil of perfis)
        for (const tabela of tabelas) if (!perfil || !doModulo(perfil).has(tabela)) falhas.push(`${id}: ${tabela} (${perfil ?? 'base'})`)
    }
    expect(falhas).toEqual([])
  })

  it('uma tabela tem uma classe só dentro do módulo', () => {
    const repetidas: string[] = []
    for (const [nome, modulo] of Object.entries(mapa.modulos)) {
      const vistas = new Set<string>()
      for (const classe of CLASSES)
        for (const tabela of modulo[classe] ?? []) {
          if (vistas.has(tabela)) repetidas.push(`${nome}: ${tabela}`)
          vistas.add(tabela)
        }
    }
    expect(repetidas).toEqual([])
  })

  it('linhas-filhas (Operador exclui) são só as combinadas', () => {
    for (const [nome, modulo] of Object.entries(mapa.modulos)) expect([...(modulo.filhas ?? [])].sort(), nome).toEqual(FILHAS[nome])
  })

  it('toda tabela do mapa existe no catálogo', () => {
    const doMapa = [
      ...mapa.base.leitura,
      ...mapa.base.proprio,
      ...mapa.base.cria,
      ...mapa.base.donas,
      ...Object.values(mapa.modulos).flatMap((m) => CLASSES.flatMap((c) => m[c] ?? [])),
    ]
    const logicos = new Set(catalogo.map((t) => t.logico))
    expect([...new Set(doMapa)].filter((t) => !logicos.has(t)).sort()).toEqual([])
  })

  it('toda exceção tem motivo', () => {
    const semMotivo = Object.entries(mapa.rotas).flatMap(([id, r]) => (r.ignorar ?? []).filter((i) => !i.motivo?.trim()).map((i) => `${id}: ${i.tabela}`))
    expect(semMotivo).toEqual([])
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
(cd apps/shell && npx vitest run src/nav/acessosMapa.test.ts 2>&1 | tail -15)
```

Esperado: falha de import (`./acessosMapa.json` não existe).

- [ ] **Passo 3: escrever o mapa**

`apps/shell/src/nav/acessosMapa.json`:

```json
{
  "base": {
    "leitura": ["cr40f_cidade", "new_localdebase", "cr40f_tipoequipamento", "cr40f_tipodocumento", "cr40f_categoriadespesaoperacional", "cr40f_formapagamentodespesa", "cr40f_comunicadohome", "cr40f_noticiaexterna"],
    "proprio": ["cr40f_visaodetabela"],
    "cria": ["cr40f_errodosistema", "new_appmotoristaslog"],
    "donas": ["cr40f_plannertarefa", "cr40f_plannertarearesponsavel", "cr40f_plannertarearelacao", "cr40f_plannertarefaequipe", "cr40f_plannertarefaevento", "cr40f_plannerequipe", "cr40f_plannerequipemembro", "cr40f_plannernotificacao", "cr40f_plannertagpessoal", "cr40f_plannertagpessoaltarefa", "cr40f_plannerdisparo", "cr40f_boasideias"],
    "sistema": {
      "annotation": { "Read": "Global", "Create": "Global", "Write": "Global", "Append": "Global", "AppendTo": "Global", "Delete": "Basic" }
    }
  },
  "modulos": {
    "operacional": {
      "donas": ["cr40f_reservadeveculos", "cr40f_servicosporpassageiro", "cr40f_bancodedados", "cr40f_clientes1", "cr40f_trocasdecarro", "cr40f_validacaoservico", "new_comunicadomotorista", "new_comunicadodestinatario", "cr40f_errooperacional", "cr40f_errooperacionalarquivo", "cr40f_acaooperacional", "cr40f_pedidodecotacao", "cr40f_cotacaopropostaversao", "new_marketing"],
      "filhas": ["cr40f_cotacaoopcao", "cr40f_cotacaoopcaoitem"],
      "leitura": ["cr40f_funcionarios", "cr40f_veiculos", "cr40f_manutencoes", "cr40f_financeiro", "cr40f_anexorecebimento_v2", "new_possedeveiculo", "new_appmotoristaslog", "cr40f_errodosistema", "cr40f_agenteproposta", "cr40f_agenteexecucao"]
    },
    "financeiro": {
      "donas": ["cr40f_financeiro", "cr40f_pagantes", "cr40f_composicaodeprecos", "new_configuracaovisualizacaocomposicao", "new_formuladecelulacomposicao", "cr40f_anexorecebimento_v2", "cr40f_pagamentoaterceiro", "cr40f_eventopagamentoaterceiro", "cr40f_terceirofavorecido", "cr40f_vinculomotoristafavorecido", "cr40f_despesaoperacional", "cr40f_anexodespesaoperacional", "cr40f_transacaocartao", "cr40f_cartaocorporativo", "cr40f_validacaoservico", "cr40f_mensagemvalidacao", "cr40f_validadorcliente", "cr40f_fluxocaixalancamento", "cr40f_pedidodecotacao", "cr40f_cotacaopropostaversao", "cr40f_clientes1", "cr40f_bancodedados", "cr40f_categoriadespesaoperacional", "cr40f_formapagamentodespesa"],
      "filhas": ["cr40f_itempagamentoaterceiro", "cr40f_cotacaoopcao", "cr40f_cotacaoopcaoitem"],
      "edita": ["cr40f_reservadeveculos"],
      "leitura": ["cr40f_funcionarios", "cr40f_veiculos", "cr40f_servicosporpassageiro", "cr40f_manutencoes", "cr40f_agenteproposta", "cr40f_agenteexecucao"]
    },
    "frota": {
      "donas": ["cr40f_veiculos", "cr40f_manutencoes", "cr40f_multas", "cr40f_infracaodetransito", "cr40f_colisao_v2", "cr40f_baselinepreventiva", "cr40f_itemplanopreventivo", "new_checklistmodelo", "new_checklistmodeloitem", "new_checklistveiculo", "new_checklistveiculofoto", "new_fotomanutencao", "new_parcelamultafolha", "new_termomulta", "new_possedeveiculo", "cr40f_equipamento", "cr40f_despesaoperacional", "cr40f_anexodespesaoperacional"],
      "filhas": ["cr40f_fotoequipamento"],
      "cria": ["cr40f_reservadeveculos"],
      "leitura": ["cr40f_funcionarios", "new_telemetriadiariainfleet", "new_eventoinfleet", "new_viageminfleet", "cr40f_agenteproposta", "cr40f_agenteexecucao"]
    },
    "rh": {
      "donas": ["cr40f_funcionarios", "cr40f_documento", "cr40f_tipodocumento", "cr40f_avisodestinatario", "new_curriculo", "cr40f_treinamento", "new_parcelamultafolha", "new_possedeveiculo"],
      "filhas": ["cr40f_treinamentoparticipacao"],
      "edita": ["cr40f_multas"],
      "leitura": ["cr40f_veiculos", "new_termomulta", "cr40f_agenteproposta", "cr40f_agenteexecucao"]
    }
  },
  "rotas": {
    "inicio": { "pastas": ["apps/shell/src/pages/inicio"] },
    "geral": { "perfis": ["operacional"], "pastas": ["apps/shell/src/pages/geral"] },
    "dashboard": { "perfis": ["operacional"], "pastas": ["apps/shell/src/pages/dashboard"] },
    "operacional": { "perfis": ["operacional"], "pastas": ["apps/shell/src/pages/operacional"] },
    "funcoes-operacionais": { "perfis": ["operacional"], "pastas": ["apps/shell/src/pages/funcoes-operacionais"] },
    "comunicados": { "perfis": ["operacional"], "pastas": ["apps/shell/src/pages/comunicados"] },
    "qualidade": { "perfis": ["operacional"], "pastas": ["apps/shell/src/pages/qualidade"] },
    "infleet": { "perfis": ["operacional"], "pastas": [] },
    "planner": {
      "pastas": ["apps/shell/src/pages/planner"],
      "ignorar": [
        { "tabela": "cr40f_pedidodecotacao", "motivo": "cotações só para Operacional e Financeiro (plano 3)" },
        { "tabela": "cr40f_cotacaopropostaversao", "motivo": "cotações só para Operacional e Financeiro (plano 3)" },
        { "tabela": "cr40f_cotacaoopcao", "motivo": "cotações só para Operacional e Financeiro (plano 3)" },
        { "tabela": "cr40f_cotacaoopcaoitem", "motivo": "cotações só para Operacional e Financeiro (plano 3)" }
      ]
    },
    "composicao": { "perfis": ["financeiro"], "pastas": ["apps/shell/src/pages/composicao"] },
    "new_telacomposicaopreco": { "perfis": ["financeiro"], "pastas": [] },
    "ops": { "perfis": ["financeiro"], "pastas": ["apps/shell/src/pages/ops"] },
    "pagantes": { "perfis": ["financeiro"], "pastas": ["apps/shell/src/pages/pagantes", "apps/shell/src/pages/recebimentos"] },
    "pendencias": { "perfis": ["financeiro"], "pastas": ["apps/shell/src/pages/pendencias"] },
    "validacao-cliente": { "perfis": ["financeiro"], "pastas": ["apps/shell/src/pages/validacao-cliente"] },
    "pagamento-fornecedores": { "perfis": ["financeiro"], "pastas": ["apps/shell/src/pages/pagamento-fornecedores"] },
    "despesas-operacionais": { "perfis": ["financeiro"], "pastas": ["apps/shell/src/pages/despesas"] },
    "frota": { "perfis": ["frota"], "pastas": ["apps/shell/src/pages/frota"] },
    "frota-veiculos": { "perfis": ["frota"], "pastas": ["apps/shell/src/pages/frota"] },
    "frota-manutencoes": { "perfis": ["frota"], "pastas": ["apps/shell/src/pages/frota"] },
    "frota-multas": { "perfis": ["frota"], "pastas": ["apps/shell/src/pages/frota"] },
    "frota-infracoes": { "perfis": ["frota"], "pastas": ["apps/shell/src/pages/infracoes"] },
    "frota-colisoes": { "perfis": ["frota"], "pastas": ["apps/shell/src/pages/frota"] },
    "frota-indicadores": { "perfis": ["frota"], "pastas": ["apps/shell/src/pages/frota"] },
    "frota-plano": { "perfis": ["frota"], "pastas": ["apps/shell/src/pages/frota"] },
    "frota-checklists": { "perfis": ["frota"], "pastas": ["apps/shell/src/pages/frota"] },
    "pessoas": { "perfis": ["operacional", "financeiro"], "pastas": ["apps/shell/src/pages/pessoas"] },
    "clientes": { "perfis": ["operacional", "financeiro"], "pastas": ["apps/shell/src/pages/clientes"] },
    "funcionarios": { "perfis": ["rh"], "pastas": ["apps/shell/src/pages/funcionarios"] },
    "documentos": { "perfis": ["rh"], "pastas": ["apps/shell/src/pages/documentos"] },
    "curriculos": { "perfis": ["rh"], "pastas": ["apps/shell/src/pages/curriculos"] },
    "equipamentos": { "perfis": ["frota"], "pastas": ["apps/shell/src/pages/equipamentos"] },
    "treinamentos": { "perfis": ["rh"], "pastas": ["apps/shell/src/pages/treinamentos"] },
    "cartoes": { "perfis": ["financeiro"], "pastas": ["apps/shell/src/pages/cartoes"] },
    "rh-descontos": { "perfis": ["rh"], "pastas": ["apps/shell/src/pages/rh-descontos"] },
    "new_dashboard": { "perfis": ["operacional"], "pastas": [] },
    "logs-apps": { "perfis": ["operacional"], "pastas": ["apps/shell/src/pages/logs"] },
    "cr40f_categoriadespesaoperacional": { "perfis": ["financeiro"], "pastas": [] },
    "cr40f_formapagamentodespesa": { "perfis": ["financeiro"], "pastas": [] },
    "cr40f_gerenciarcomunicados": { "perfis": ["operacional"], "pastas": [] },
    "cr40f_pedidodecotacao": { "perfis": ["financeiro"], "pastas": [] },
    "cr40f_telafluxodecaixa": { "perfis": ["financeiro"], "pastas": [] },
    "cr40f_composicaodeprecos": { "perfis": ["financeiro"], "pastas": [] },
    "new_marketing": { "perfis": ["operacional"], "pastas": [] }
  }
}
```

- [ ] **Passo 4: rodar o teste e ajustar o mapa até passar**

```bash
(cd apps/shell && npx vitest run src/nav/acessosMapa.test.ts 2>&1 | tail -40)
```

O mapa acima foi montado com o menu e o DEV de 23/11/2026; o teste mostra o que mudou desde então. Regras para cada falha (não mexer no teste para passar):

| Falha | O que fazer |
|---|---|
| Item do menu sem rota no mapa | Acrescentar a rota. Perfil pelo grupo do menu: `operacional` → Operacional; `financeiro` → Financeiro; `frota` → Frota; `rh` → RH; `cadastros` e `back-end` → a área dona dos dados da tela. Pasta = a pasta da página em `apps/shell/src/pages/` (web resource ou tabela nativa: `"pastas": []`). |
| Rota do mapa que não existe no menu | Conferir o `id` em `menu.ts` e corrigir o mapa. |
| Tabela do mapa fora do catálogo | Corrigir o nome pelo `tabelas.json` (procurar pelo trecho comum com `grep`). Se a tabela não existe mesmo no DEV, tirar do mapa. |
| `rota: tabela (perfil)` e a tela **só lê** a tabela | Acrescentar a tabela em `leitura` do módulo do perfil. |
| `rota: tabela (perfil)` e a tela **grava** na tabela (create, update ou delete em `data/*.ts`) | **Parar e relatar ao Renan**: é decisão de acesso, não ajuste de mapa. |
| `rota: tabela (base)` (rota sem perfil, hoje `inicio` e `planner`) | Card ou trecho de outra área: acrescentar em `ignorar` da rota com motivo `"card de outra área, some sem perfil (plano 3)"`. Tabela de apoio que todos precisam ler: acrescentar em `base.leitura`. |
| Nome casou por engano (comentário, texto) | `ignorar` na rota, com o motivo. |

Limitações conhecidas do teste (não corrigir aqui): a varredura é por pasta, então código compartilhado fora de `pages/` não entra; campo de lookup escrito como `_cr40f_x_value` não casa.

Esperado ao final: `8 passed`.

- [ ] **Passo 5: typecheck e commit**

```bash
(cd apps/shell && npx tsc --noEmit 2>&1 | tail -5)
git add apps/shell/src/nav/acessosMapa.json apps/shell/src/nav/acessosMapa.test.ts
git commit -m "feat(acessos): mapa de tabelas por perfil e perfis por rota, com teste de cobertura"
```

No corpo do commit, listar cada ajuste feito no Passo 4 (rota acrescentada, tabela movida, exceção criada).

---

### Tarefa 3: mapa de colunas e gerador dos perfis

**Arquivos:**
- Criar: `apps/shell/src/nav/acessosColunas.json`
- Criar: `packages/deploy/acessos/gerar.mjs`
- Criar: `packages/deploy/acessos/gerar.test.mjs`
- Criar (gerado): `packages/deploy/acessos/perfis.gerado.json`
- Modificar: `packages/deploy/package.json:7` (script `test`)

**Interfaces:**
- Consome: `acessosMapa.json` (Tarefa 2).
- Produz:
  - `gerarPerfis(mapa, colunas)` → `{ proibido: string, copiarSem: string, papeis: Record<nome, { copiarDe: string[], app: string | null, tabelas: Record<tabela, Record<ação, 'Basic' | 'Global'>>, privilegios: Record<nomeDoPrivilegio, profundidade> }>, colunas: Record<nome, { tabela, coluna, ler: true, editar: boolean }[]> }`
  - `hashDe(texto)` → SHA-256 em hexadecimal do texto com `\r\n` normalizado para `\n`
  - `node packages/deploy/acessos/gerar.mjs` grava `perfis.gerado.json`; `node packages/deploy/acessos/gerar.mjs --hash` imprime o hash do arquivo gravado
  - Constantes exportadas: `CAMINHO_MAPA`, `CAMINHO_COLUNAS`, `CAMINHO_GERADO`, `PROIBIDO`, `COPIAR_SEM`

- [ ] **Passo 1: escrever o mapa de colunas**

`apps/shell/src/nav/acessosColunas.json` (só colunas que têm, ou vão ter na Tarefa 5, segurança de coluna; `cr40f_funcionarios.cr40f_loginsesenhas` fica de fora de propósito: nenhum perfil lê):

```json
{
  "grupos": {
    "cr40f_funcionarios": {
      "basico": ["cr40f_funcao", "cr40f_status", "cr40f_nomedaempresa", "new_apelido", "cr40f_veiculoatual", "cr40f_telefonecorporativo", "cr40f_emailbetinhos", "cr40f_emailmicrosoft"],
      "cnh": ["cr40f_cnh", "cr40f_validadedacnh"],
      "rh": ["cr40f_relacaotrabalhista", "cr40f_tipodevinculo", "cr40f_datadeadmissao", "cr40f_datadedemissao", "cr40f_datadoaso", "new_notificacoesfinanceiras", "new_notificacoesmotoristas", "new_notificacoesoperacionais", "cr40f_gerarrecibopersonalizado", "cr40f_folderid", "cr40f_assinatura"],
      "pessoal": ["cr40f_numerodocpf", "cr40f_numerodorg", "cr40f_enderecocompleto", "cr40f_filiacao", "cr40f_telefonepessoal", "cr40f_celular", "cr40f_telefonedeemergencia", "cr40f_datadeaniversario", "cr40f_linkparadocumentos"]
    },
    "cr40f_veiculos": {
      "basico": ["cr40f_id", "cr40f_marca", "cr40f_modelo", "cr40f_cor", "cr40f_anodefabricacao", "cr40f_anodemodelo", "cr40f_blindado", "new_categoriadoveiculo"],
      "operacao": ["cr40f_statusdoveiculo", "cr40f_motoristaatual", "cr40f_medidasdospneus", "cr40f_oleorecomendadopelofabricante", "cr40f_comentariosextras"],
      "patrimonio": ["cr40f_chassi", "cr40f_renavam", "cr40f_datadacompra", "cr40f_datadavenda", "cr40f_detalhesdocomprador", "cr40f_nomedaloja", "cr40f_notafiscaldacompra", "cr40f_notafiscaldavenda", "cr40f_valordacompra", "cr40f_valordavenda"]
    },
    "cr40f_reservadeveculos": {
      "operacao": ["cr40f_cr", "cr40f_endereodesada", "cr40f_observaointerna", "cr40f_tipodeveiculo"],
      "cotacao": ["cr40f_cotao", "cr40f_statusdefaturamento"],
      "composicao": ["new_composicaodepreco"]
    },
    "cr40f_financeiro": { "valor": ["cr40f_valor"] },
    "cr40f_bancodedados": {
      "contato": ["cr40f_datadenascimento", "cr40f_email", "cr40f_enderecodesaida", "cr40f_telefone"],
      "cr": ["cr40f_cr"]
    },
    "new_termomulta": { "pdf": ["new_pdf", "new_hashpdf"], "prova": ["new_selfie", "new_latitude", "new_longitude"] }
  },
  "perfis": {
    "operacional": {
      "operador": {
        "ler": ["cr40f_funcionarios.basico", "cr40f_veiculos.basico", "cr40f_veiculos.operacao"],
        "editar": ["cr40f_reservadeveculos.operacao", "cr40f_reservadeveculos.cotacao", "cr40f_bancodedados.contato", "cr40f_bancodedados.cr"]
      },
      "gestor": { "ler": [], "editar": [] }
    },
    "financeiro": {
      "operador": {
        "ler": ["cr40f_funcionarios.basico", "cr40f_veiculos.basico", "cr40f_reservadeveculos.*", "cr40f_financeiro.valor", "cr40f_bancodedados.contato", "cr40f_bancodedados.cr"],
        "editar": []
      },
      "gestor": { "ler": [], "editar": ["cr40f_reservadeveculos.cotacao", "cr40f_reservadeveculos.composicao", "cr40f_financeiro.valor"] }
    },
    "frota": {
      "operador": {
        "ler": ["cr40f_funcionarios.basico", "cr40f_funcionarios.cnh", "cr40f_veiculos.*", "new_termomulta.pdf"],
        "editar": ["cr40f_veiculos.operacao", "cr40f_reservadeveculos.operacao"]
      },
      "gestor": { "ler": ["new_termomulta.prova"], "editar": ["cr40f_veiculos.*"] }
    },
    "rh": {
      "operador": {
        "ler": ["cr40f_veiculos.basico", "new_termomulta.pdf"],
        "editar": ["cr40f_funcionarios.basico", "cr40f_funcionarios.cnh", "cr40f_funcionarios.rh"]
      },
      "gestor": { "ler": ["new_termomulta.prova"], "editar": ["cr40f_funcionarios.pessoal"] }
    }
  }
}
```

Leitura do arquivo: `editar` inclui ler; o Gestor soma o que o Operador tem; `tabela.*` = todos os grupos da tabela.

- [ ] **Passo 2: escrever os testes do gerador**

`packages/deploy/acessos/gerar.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { CAMINHO_COLUNAS, CAMINHO_GERADO, CAMINHO_MAPA, COPIAR_SEM, PROIBIDO, gerarPerfis } from './gerar.mjs'

const mapa = JSON.parse(readFileSync(CAMINHO_MAPA, 'utf8'))
const colunas = JSON.parse(readFileSync(CAMINHO_COLUNAS, 'utf8'))
const gerado = gerarPerfis(mapa, colunas)
const AREAS = { operacional: 'Operacional', financeiro: 'Financeiro', frota: 'Frota', rh: 'RH' }
const comDelete = (papel) => Object.keys(papel.tabelas).filter((t) => papel.tabelas[t].Delete).sort()
const coluna = (perfil, tabela, nome) => gerado.colunas[perfil].find((p) => p.tabela === tabela && p.coluna === nome)

test('gera 10 papeis e 8 perfis de coluna', () => {
  assert.equal(Object.keys(gerado.papeis).length, 10)
  assert.equal(Object.keys(gerado.colunas).length, 8)
  assert.ok(gerado.papeis['Perfil - Base'])
  assert.ok(gerado.papeis['Perfil - Administrador de acessos'])
  assert.equal(gerado.colunas['Perfil - Base'], undefined)
})

test('Operador so exclui linhas-filhas; Gestor exclui tambem nas tabelas donas', () => {
  for (const [area, rotulo] of Object.entries(AREAS)) {
    const modulo = mapa.modulos[area]
    const filhas = [...(modulo.filhas ?? [])].sort()
    const donasEFilhas = [...new Set([...(modulo.donas ?? []), ...filhas])].sort()
    assert.deepEqual(comDelete(gerado.papeis[`Perfil - ${rotulo} - Operador`]), filhas, `${area} operador`)
    assert.deepEqual(comDelete(gerado.papeis[`Perfil - ${rotulo} - Gestor`]), donasEFilhas, `${area} gestor`)
  }
})

test('classes viram as acoes combinadas', () => {
  const fin = gerado.papeis['Perfil - Financeiro - Operador'].tabelas
  assert.deepEqual(fin.cr40f_financeiro, { Append: 'Global', AppendTo: 'Global', Create: 'Global', Read: 'Global', Write: 'Global' })
  assert.deepEqual(fin.cr40f_reservadeveculos, { Append: 'Global', AppendTo: 'Global', Read: 'Global', Write: 'Global' })
  assert.deepEqual(fin.cr40f_funcionarios, { AppendTo: 'Global', Read: 'Global' })
})

test('Base: visao propria, registro de erro so cria, sem tabela de area', () => {
  const base = gerado.papeis['Perfil - Base']
  assert.deepEqual(base.copiarDe, ['App Opener', 'Basic User'])
  assert.equal(base.app, 'cr40f_ModelDrivenBetinhos')
  assert.deepEqual(base.tabelas.cr40f_visaodetabela, { Append: 'Basic', AppendTo: 'Basic', Create: 'Basic', Delete: 'Basic', Read: 'Global', Write: 'Basic' })
  assert.deepEqual(base.tabelas.cr40f_errodosistema, { Append: 'Global', AppendTo: 'Global', Create: 'Global' })
  assert.equal(base.tabelas.annotation.Delete, 'Basic')
  for (const tabela of ['cr40f_financeiro', 'cr40f_funcionarios', 'cr40f_veiculos', 'cr40f_reservadeveculos']) assert.equal(base.tabelas[tabela], undefined, tabela)
})

test('Administrador de acessos le o historico e nao recebe papel de atribuir', () => {
  const adm = gerado.papeis['Perfil - Administrador de acessos']
  assert.deepEqual(adm.tabelas, { cr40f_acessohistorico: { Read: 'Global' } })
  assert.deepEqual(Object.keys(adm.privilegios).sort(), ['prvReadRole', 'prvReadTeam', 'prvReadUser'])
})

test('nenhum papel toca cr40f_segredo nem pede privilegio proibido', () => {
  const proibido = new RegExp(gerado.proibido)
  for (const [nome, papel] of Object.entries(gerado.papeis)) {
    assert.equal(papel.tabelas.cr40f_segredo, undefined, nome)
    for (const priv of Object.keys(papel.privilegios)) assert.ok(!proibido.test(priv), `${nome}: ${priv}`)
  }
})

test('a trava pega personalizacao e segredo e poupa o uso comum', () => {
  const proibido = new RegExp(PROIBIDO)
  for (const p of ['prvAssignRole', 'prvWriteWebResource', 'prvReadcr40f_segredo', 'prvPublishCustomization', 'prvCreateWorkflow']) assert.ok(proibido.test(p), p)
  for (const p of ['prvWriteUserQuery', 'prvCreateWorkflowSession', 'prvReadRole', 'prvReadWebResource', 'prvReadcr40f_financeiro']) assert.ok(!proibido.test(p), p)
  const copiarSem = new RegExp(COPIAR_SEM)
  for (const p of ['prvReadcr40f_financeiro', 'prvAppendTonew_curriculo']) assert.ok(copiarSem.test(p), p)
  assert.ok(!copiarSem.test('prvReadNote'))
})

test('colunas: toda permissao le e o Gestor soma o Operador', () => {
  for (const rotulo of Object.values(AREAS)) {
    const operador = gerado.colunas[`Perfil - ${rotulo} - Operador`]
    const gestor = gerado.colunas[`Perfil - ${rotulo} - Gestor`]
    for (const p of [...operador, ...gestor]) assert.equal(p.ler, true)
    for (const p of operador) {
      const noGestor = gestor.find((g) => g.tabela === p.tabela && g.coluna === p.coluna)
      assert.ok(noGestor, `${rotulo}: ${p.tabela}.${p.coluna}`)
      if (p.editar) assert.equal(noGestor.editar, true)
    }
  }
})

test('colunas: matriz da spec', () => {
  assert.equal(coluna('Perfil - Financeiro - Operador', 'cr40f_financeiro', 'cr40f_valor').editar, false)
  assert.equal(coluna('Perfil - Financeiro - Gestor', 'cr40f_financeiro', 'cr40f_valor').editar, true)
  assert.equal(coluna('Perfil - RH - Operador', 'cr40f_funcionarios', 'cr40f_numerodocpf'), undefined)
  assert.equal(coluna('Perfil - RH - Gestor', 'cr40f_funcionarios', 'cr40f_numerodocpf').editar, true)
  assert.equal(coluna('Perfil - Frota - Operador', 'cr40f_funcionarios', 'cr40f_cnh').editar, false)
  assert.equal(coluna('Perfil - Frota - Operador', 'cr40f_funcionarios', 'cr40f_numerodocpf'), undefined)
  assert.equal(coluna('Perfil - Operacional - Operador', 'cr40f_bancodedados', 'cr40f_telefone').editar, true)
  assert.equal(coluna('Perfil - Financeiro - Operador', 'cr40f_bancodedados', 'cr40f_telefone').editar, false)
  assert.equal(coluna('Perfil - Frota - Operador', 'cr40f_bancodedados', 'cr40f_telefone'), undefined)
  assert.equal(coluna('Perfil - RH - Gestor', 'cr40f_bancodedados', 'cr40f_telefone'), undefined)
})

test('colunas: senhas em nenhum perfil', () => {
  for (const [nome, lista] of Object.entries(gerado.colunas)) assert.ok(!lista.some((p) => p.coluna === 'cr40f_loginsesenhas'), nome)
})

test('grupo de colunas desconhecido falha', () => {
  const errado = structuredClone(colunas)
  errado.perfis.rh.operador.ler.push('cr40f_funcionarios.nada')
  assert.throws(() => gerarPerfis(mapa, errado), /Grupo de colunas desconhecido: cr40f_funcionarios\.nada/)
})

test('perfis.gerado.json esta em dia com os mapas', () => {
  const emDisco = readFileSync(CAMINHO_GERADO, 'utf8').replace(/\r\n/g, '\n')
  assert.equal(emDisco, JSON.stringify(gerado, null, 2) + '\n', 'Rode: node packages/deploy/acessos/gerar.mjs')
})
```

- [ ] **Passo 3: rodar e ver falhar**

```bash
node --test packages/deploy/acessos/gerar.test.mjs 2>&1 | tail -8
```

Esperado: erro de import (`./gerar.mjs` não existe).

- [ ] **Passo 4: escrever o gerador**

`packages/deploy/acessos/gerar.mjs`:

```js
// Gera perfis.gerado.json (o que o motor aplica no Dataverse) a partir dos mapas versionados no shell.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const caminho = (rel) => fileURLToPath(new URL(rel, import.meta.url))
export const CAMINHO_MAPA = caminho('../../../apps/shell/src/nav/acessosMapa.json')
export const CAMINHO_COLUNAS = caminho('../../../apps/shell/src/nav/acessosColunas.json')
export const CAMINHO_GERADO = caminho('./perfis.gerado.json')
export const hashDe = (texto) => createHash('sha256').update(texto.replace(/\r\n/g, '\n')).digest('hex')

// Nenhum papel Perfil - * pode receber: personalizacao, atribuicao de papel, agir em nome de outro, segredo.
export const PROIBIDO =
  '^prv(Create|Write|Delete|Assign|Share)(WebResource|Workflow|Solution|Publisher|Entity|Attribute|Relationship|OptionSet|SystemForm|Query|SavedQueryVisualizations|AppModule|SiteMap|PluginAssembly|PluginType|SdkMessage\\w*|CustomAPI\\w*|Role|FieldSecurityProfile|FieldPermission|EnvironmentVariable\\w*|ConnectionReference|Connector|Customization)$|^prv(Publish|Import|Export)Customization$|^prvActOnBehalfOfAnotherUser$|cr40f_segredo'
// Ao copiar App Opener e Basic User para o Base, privilegio de tabela customizada nao vem junto.
export const COPIAR_SEM = '^prv[A-Za-z]+?(cr40f_|new_)'

const ACOES = {
  donas: ['Read', 'Create', 'Write', 'Append', 'AppendTo'],
  filhas: ['Read', 'Create', 'Write', 'Delete', 'Append', 'AppendTo'],
  cria: ['Read', 'Create', 'Write', 'Append', 'AppendTo'],
  edita: ['Read', 'Write', 'Append', 'AppendTo'],
  leitura: ['Read', 'AppendTo'],
}
const ORDEM = { Basic: 1, Local: 2, Deep: 4, Global: 8 }

function juntar(alvo, tabela, acoes, profundidade = 'Global') {
  const atual = (alvo[tabela] ??= {})
  for (const acao of acoes) if (!atual[acao] || ORDEM[atual[acao]] < ORDEM[profundidade]) atual[acao] = profundidade
}
const ordenar = (obj) => Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]))
const ordenarTabelas = (tabelas) => Object.fromEntries(Object.keys(tabelas).sort().map((t) => [t, ordenar(tabelas[t])]))

function tabelasDoModulo(modulo, gestor) {
  const tabelas = {}
  for (const classe of Object.keys(ACOES)) for (const tabela of modulo[classe] ?? []) juntar(tabelas, tabela, ACOES[classe])
  if (gestor) for (const tabela of modulo.donas ?? []) juntar(tabelas, tabela, ['Delete'])
  return ordenarTabelas(tabelas)
}

function tabelasDaBase(base) {
  const tabelas = {}
  for (const t of base.leitura) juntar(tabelas, t, ['Read', 'AppendTo'])
  for (const t of base.proprio) {
    juntar(tabelas, t, ['Read'])
    juntar(tabelas, t, ['Create', 'Write', 'Delete', 'Append', 'AppendTo'], 'Basic')
  }
  for (const t of base.cria) juntar(tabelas, t, ['Create', 'Append', 'AppendTo'])
  for (const t of base.donas) juntar(tabelas, t, ['Read', 'Create', 'Write', 'Delete', 'Append', 'AppendTo'])
  for (const [t, acoes] of Object.entries(base.sistema)) for (const [acao, prof] of Object.entries(acoes)) juntar(tabelas, t, [acao], prof)
  return ordenarTabelas(tabelas)
}

function colunasDaRef(colunas, ref) {
  const [tabela, grupo] = ref.split('.')
  const grupos = colunas.grupos[tabela]
  if (!grupos || (grupo !== '*' && !grupos[grupo])) throw new Error(`Grupo de colunas desconhecido: ${ref}`)
  const lista = grupo === '*' ? Object.values(grupos).flat() : grupos[grupo]
  return lista.map((coluna) => ({ tabela, coluna }))
}

function permissoes(colunas, area, gestor) {
  const mapa = new Map()
  for (const nivel of gestor ? ['operador', 'gestor'] : ['operador']) {
    const def = colunas.perfis[area][nivel]
    for (const [modo, refs] of [['ler', def.ler], ['editar', def.editar]])
      for (const ref of refs)
        for (const { tabela, coluna } of colunasDaRef(colunas, ref)) {
          const chave = `${tabela}.${coluna}`
          const atual = mapa.get(chave) ?? { tabela, coluna, ler: true, editar: false }
          if (modo === 'editar') atual.editar = true
          mapa.set(chave, atual)
        }
  }
  return [...mapa.keys()].sort().map((k) => mapa.get(k))
}

const AREAS = { operacional: 'Operacional', financeiro: 'Financeiro', frota: 'Frota', rh: 'RH' }
const NIVEIS = { operador: 'Operador', gestor: 'Gestor' }
// O shell le os proprios papeis (direto e por equipe) e a tela de acessos lista pessoas.
const LEITURA_DE_ACESSOS = { prvReadRole: 'Global', prvReadTeam: 'Global', prvReadUser: 'Global' }

export function gerarPerfis(mapa, colunas) {
  const papeis = {
    'Perfil - Base': { copiarDe: ['App Opener', 'Basic User'], app: 'cr40f_ModelDrivenBetinhos', tabelas: tabelasDaBase(mapa.base), privilegios: LEITURA_DE_ACESSOS },
    'Perfil - Administrador de acessos': { copiarDe: [], app: null, tabelas: { cr40f_acessohistorico: { Read: 'Global' } }, privilegios: LEITURA_DE_ACESSOS },
  }
  const perfisDeColuna = {}
  for (const [area, rotuloArea] of Object.entries(AREAS))
    for (const [nivel, rotuloNivel] of Object.entries(NIVEIS)) {
      const nome = `Perfil - ${rotuloArea} - ${rotuloNivel}`
      papeis[nome] = { copiarDe: [], app: null, tabelas: tabelasDoModulo(mapa.modulos[area], nivel === 'gestor'), privilegios: {} }
      perfisDeColuna[nome] = permissoes(colunas, area, nivel === 'gestor')
    }
  return { proibido: PROIBIDO, copiarSem: COPIAR_SEM, papeis: ordenar(papeis), colunas: ordenar(perfisDeColuna) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--hash') console.log(hashDe(readFileSync(CAMINHO_GERADO, 'utf8')))
  else {
    const gerado = gerarPerfis(JSON.parse(readFileSync(CAMINHO_MAPA, 'utf8')), JSON.parse(readFileSync(CAMINHO_COLUNAS, 'utf8')))
    writeFileSync(CAMINHO_GERADO, JSON.stringify(gerado, null, 2) + '\n')
    console.log(`perfis.gerado.json: ${Object.keys(gerado.papeis).length} papeis, ${Object.keys(gerado.colunas).length} perfis de coluna`)
  }
}
```

- [ ] **Passo 5: gerar, ligar no script de teste e rodar**

```bash
node packages/deploy/acessos/gerar.mjs
```

Esperado: `perfis.gerado.json: 10 papeis, 8 perfis de coluna`.

Em `packages/deploy/package.json`, linha 7, acrescentar ` acessos/gerar.test.mjs` no fim da lista do script `"test"` (depois de `backup/operacao.test.mjs`, dentro das aspas).

```bash
node --test packages/deploy/acessos/gerar.test.mjs 2>&1 | tail -8
(cd packages/deploy && pnpm test 2>&1 | tail -6)
```

Esperado: `pass 12`, `fail 0` no primeiro; o segundo sem falhas.

Se "Operador so exclui linhas-filhas" falhar depois de um ajuste da Tarefa 2, o mapa pôs em `filhas` uma tabela que não é linha-filha: corrigir o mapa, não o teste.

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/nav/acessosColunas.json packages/deploy/acessos/gerar.mjs packages/deploy/acessos/gerar.test.mjs packages/deploy/acessos/perfis.gerado.json packages/deploy/package.json
git commit -m "feat(acessos): mapa de colunas por nível e gerador dos perfis"
```

---

### Tarefa 4: motor que aplica os perfis no Dataverse

**Arquivos:**
- Modificar: `packages/deploy/migrations/_dv.ps1:27-28` (`Invoke-Dv` aceita cabeçalhos extras)
- Criar: `packages/deploy/acessos/aplicar-perfis.ps1`
- Modificar: `packages/deploy/solucoes/regras.json:14` (tipo 71)

**Interfaces:**
- Consome: `packages/deploy/acessos/perfis.gerado.json` (Tarefa 3: `proibido`, `copiarSem`, `papeis`, `colunas`); de `_dv.ps1`: `Connect-Dv`, `Invoke-Dv`, `Get-Rows`, `Write-Step`, `$script:DvApi`, `$script:Apply`.
- Produz:
  - `Invoke-Dv([string] $Method, [string] $Path, $Body = $null, [hashtable] $ExtraHeaders = @{})`
  - `Get-HashPerfis([string] $Caminho)` → mesmo SHA-256 do `hashDe` do gerador
  - `Invoke-PerfisDeAcesso([string] $HashEsperado)` → aplica o gerado; com hash diferente avisa e não faz nada; sem `-Apply` só lista

O motor é dot-sourced por uma migration, depois de `_dv.ps1` e de `Connect-Dv`. Não tem teste unitário: a prova é o dry-run no DEV (Passo 5) e a prova por impersonação (Tarefa 9).

- [ ] **Passo 1: `Invoke-Dv` aceita cabeçalhos extras**

Em `packages/deploy/migrations/_dv.ps1`, trocar as duas primeiras linhas da função:

```powershell
function Invoke-Dv([string] $Method, [string] $Path, $Body = $null) {
  $headers = @{ Authorization = "Bearer $script:DvToken"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; "MSCRM.SolutionUniqueName" = $script:SolucaoDev }
```

por:

```powershell
function Invoke-Dv([string] $Method, [string] $Path, $Body = $null, [hashtable] $ExtraHeaders = @{}) {
  $headers = @{ Authorization = "Bearer $script:DvToken"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; "MSCRM.SolutionUniqueName" = $script:SolucaoDev }
  foreach ($k in $ExtraHeaders.Keys) { $headers[$k] = $ExtraHeaders[$k] }
```

O resto da função não muda. `_dv.ps1` não é migration (nome com `_`), então o CI não barra a edição; o parâmetro é opcional e as migrations publicadas seguem iguais.

- [ ] **Passo 2: escrever o motor**

Criar `packages/deploy/acessos/aplicar-perfis.ps1` (comentários e mensagens em ASCII; o Deploy roda no Windows PowerShell 5.1):

```powershell
# Motor dos perfis de acesso: aplica packages/deploy/acessos/perfis.gerado.json no ambiente.
# Dot-source DEPOIS de _dv.ps1 e de Connect-Dv. Sem -Apply (dry-run) so le e lista o que faria. Idempotente.
# Quem decide o conteudo dos perfis sao os mapas em apps/shell/src/nav (acessosMapa.json e acessosColunas.json).

$script:AcessosDir = $PSScriptRoot
$script:Ordem = @{ Basic = 1; Local = 2; Deep = 4; Global = 8 }
$script:NomeDaOrdem = @{ 1 = "Basic"; 2 = "Local"; 4 = "Deep"; 8 = "Global" }
$script:Pendencias = 0
$script:PrivilegiosPorTabela = @{}
$script:ColunasSeguras = @{}

function Add-Pendencia([string] $Mensagem) {
  if ($script:Apply) { throw $Mensagem }
  $script:Pendencias++
  Write-Step "PENDENCIA: $Mensagem"
}

function Get-HashPerfis([string] $Caminho) {
  $texto = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Caminho).Path, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n")
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return (($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($texto)) | ForEach-Object { $_.ToString("x2") }) -join "") }
  finally { $sha.Dispose() }
}

function Get-Todos([string] $Path) {
  $linhas = @()
  $proximo = $Path
  while ($proximo) {
    $resp = Invoke-Dv "GET" $proximo
    $linhas += @($resp.value)
    $link = $resp.PSObject.Properties["@odata.nextLink"]
    $proximo = if ($link -and $link.Value) { ([string] $link.Value).Substring($script:DvApi.Length + 1) } else { $null }
  }
  return $linhas
}

function Get-PrivilegiosDaTabela([string] $Tabela) {
  if (-not $script:PrivilegiosPorTabela.ContainsKey($Tabela)) {
    $mapa = @{}
    $linhas = @(Get-Rows "EntityDefinitions" "LogicalName,Privileges" "LogicalName eq '$Tabela'")
    if ($linhas.Count -eq 1) { foreach ($p in @($linhas[0].Privileges)) { $mapa[[string] $p.PrivilegeType] = $p } }
    $script:PrivilegiosPorTabela[$Tabela] = $mapa
  }
  return $script:PrivilegiosPorTabela[$Tabela]
}

function Set-Maior([hashtable] $Alvo, [string] $Nome, [string] $Prof) {
  if (-not $Alvo.ContainsKey($Nome) -or $script:Ordem[$Alvo[$Nome]] -lt $script:Ordem[$Prof]) { $Alvo[$Nome] = $Prof }
}

function Get-PrivilegiosDoPapel([string] $RoleId, [hashtable] $NomePorId) {
  $mapa = @{}
  $filtro = [uri]::EscapeDataString("roleid eq $RoleId")
  foreach ($rp in @(Get-Todos "roleprivilegescollection?`$select=privilegeid,privilegedepthmask&`$filter=$filtro")) {
    $id = [string] $rp.privilegeid
    if ($NomePorId.ContainsKey($id)) { $mapa[$NomePorId[$id]] = $script:NomeDaOrdem[[int] $rp.privilegedepthmask] }
  }
  return $mapa
}

function Get-ColunasSeguras([string] $Tabela) {
  if (-not $script:ColunasSeguras.ContainsKey($Tabela)) {
    $mapa = @{}
    $existe = @(Get-Rows "EntityDefinitions" "LogicalName" "LogicalName eq '$Tabela'")
    if ($existe.Count -eq 1) {
      foreach ($a in @(Get-Todos "EntityDefinitions(LogicalName='$Tabela')/Attributes?`$select=LogicalName,IsSecured,CanBeSecuredForCreate,CanBeSecuredForUpdate")) {
        if ($a.IsSecured) { $mapa[[string] $a.LogicalName] = @{ criar = [bool] $a.CanBeSecuredForCreate; atualizar = [bool] $a.CanBeSecuredForUpdate } }
      }
    }
    $script:ColunasSeguras[$Tabela] = $mapa
  }
  return $script:ColunasSeguras[$Tabela]
}

function Find-PapelRaiz([string] $Nome) {
  return @(Get-Rows "roles" "roleid,name" "name eq '$($Nome.Replace("'", "''"))' and _parentroleid_value eq null")
}

function Set-PapelDoPerfil([string] $Nome, $Def, [string] $BuId, [hashtable] $IdPorNome, [hashtable] $NomePorId, [string] $Proibido, [string] $CopiarSem) {
  # 1. O que o papel deve ter: copia dos papeis de origem (sem o proibido e sem tabela customizada) + tabelas + privilegios soltos.
  $alvo = @{}
  foreach ($origem in @($Def.copiarDe)) {
    $achados = @(Find-PapelRaiz ([string] $origem))
    if ($achados.Count -ne 1) { Add-Pendencia "papel de origem '$origem' nao encontrado (ou ambiguo) para '$Nome'"; continue }
    $copiados = Get-PrivilegiosDoPapel ([string] $achados[0].roleid) $NomePorId
    foreach ($priv in @($copiados.Keys)) {
      if ($priv -cmatch $Proibido -or $priv -cmatch $CopiarSem -or -not $copiados[$priv]) { continue }
      Set-Maior $alvo $priv $copiados[$priv]
    }
  }
  foreach ($t in @($Def.tabelas.PSObject.Properties)) {
    $tabela = [string] $t.Name
    $privs = Get-PrivilegiosDaTabela $tabela
    if ($privs.Count -eq 0) { Add-Pendencia "tabela $tabela nao existe no ambiente (perfil '$Nome')"; continue }
    foreach ($acao in @($t.Value.PSObject.Properties)) {
      if (-not $privs.ContainsKey([string] $acao.Name)) { Add-Pendencia "$tabela nao tem o privilegio $($acao.Name) (perfil '$Nome')"; continue }
      $p = $privs[[string] $acao.Name]
      if ([string] $acao.Value -eq "Basic" -and -not $p.CanBeBasic) { Add-Pendencia "$tabela.$($acao.Name) nao aceita profundidade Basic (perfil '$Nome')"; continue }
      Set-Maior $alvo ([string] $p.Name) ([string] $acao.Value)
    }
  }
  foreach ($x in @($Def.privilegios.PSObject.Properties)) { Set-Maior $alvo ([string] $x.Name) ([string] $x.Value) }
  foreach ($priv in @($alvo.Keys)) {
    if ($priv -cmatch $Proibido) { throw "Perfil '$Nome' pediria o privilegio proibido $priv." }
    if (-not $IdPorNome.ContainsKey($priv)) { Add-Pendencia "privilegio $priv nao existe no ambiente (perfil '$Nome')"; $alvo.Remove($priv) }
  }

  # 2. Comparar com o que o papel tem hoje e regravar se for diferente.
  $achados = @(Find-PapelRaiz $Nome)
  if ($achados.Count -gt 1) { throw "Ha mais de um papel raiz chamado '$Nome'." }
  $roleId = if ($achados.Count -eq 1) { [string] $achados[0].roleid } else { $null }
  $atual = if ($roleId) { Get-PrivilegiosDoPapel $roleId $NomePorId } else { @{} }
  $faltam = @($alvo.Keys | Where-Object { -not $atual.ContainsKey($_) -or $atual[$_] -ne $alvo[$_] })
  $sobram = @($atual.Keys | Where-Object { -not $alvo.ContainsKey($_) })

  if ($roleId -and $faltam.Count -eq 0 -and $sobram.Count -eq 0) {
    Write-Step "'$Nome' ja esta igual ($($alvo.Count) privilegios)."
  } elseif (-not $script:Apply) {
    if ($roleId) { Write-Step "DRY RUN regravaria '${Nome}': $($faltam.Count) a conceder ou ajustar, $($sobram.Count) a retirar." }
    else { Write-Step "DRY RUN criaria o papel '$Nome' com $($alvo.Count) privilegios." }
  } else {
    if (-not $roleId) {
      $novo = Invoke-Dv "POST" "roles" @{ name = $Nome; "businessunitid@odata.bind" = "/businessunits($BuId)" } @{ Prefer = "return=representation" }
      $roleId = [string] $novo.roleid
      Write-Step "criado o papel '$Nome'"
    }
    $lista = @($alvo.Keys | Sort-Object | ForEach-Object {
      [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $IdPorNome[$_]; Depth = $alvo[$_]; BusinessUnitId = $BuId; PrivilegeName = $_ }
    })
    Invoke-Dv "POST" "roles($roleId)/Microsoft.Dynamics.CRM.ReplacePrivilegesRole" @{ Privileges = $lista } | Out-Null
    $depois = Get-PrivilegiosDoPapel $roleId $NomePorId
    $naoEntrou = @($alvo.Keys | Where-Object { -not $depois.ContainsKey($_) -or $depois[$_] -ne $alvo[$_] })
    if ($naoEntrou.Count -gt 0) { throw "Papel '${Nome}': $($naoEntrou.Count) privilegio(s) nao ficaram como pedido (ex.: $($naoEntrou[0]))." }
    foreach ($extra in @($depois.Keys | Where-Object { -not $alvo.ContainsKey($_) })) {
      if ($extra -cmatch $Proibido) { throw "Papel '$Nome' ficou com o privilegio proibido $extra." }
      Write-Step "AVISO: '$Nome' ficou com $extra, que o gerado nao pede."
    }
    Write-Step "gravado '$Nome' ($($alvo.Count) privilegios)"
  }

  # 3. Papel que abre o app model-driven (so o Base).
  if (-not $Def.app) { return }
  $apps = @(Get-Rows "appmodules" "appmoduleid" "uniquename eq '$($Def.app)'")
  if ($apps.Count -ne 1) { Add-Pendencia "app '$($Def.app)' nao encontrado (perfil '$Nome')"; return }
  $appId = [string] $apps[0].appmoduleid
  if (-not $roleId) { Write-Step "DRY RUN ligaria '$Nome' ao app $($Def.app)."; return }
  $ligados = @(Get-Todos "appmodules($appId)/appmoduleroles_association?`$select=roleid")
  if (@($ligados | Where-Object { [string] $_.roleid -eq $roleId }).Count -gt 0) { Write-Step "'$Nome' ja abre o app $($Def.app)."; return }
  if (-not $script:Apply) { Write-Step "DRY RUN ligaria '$Nome' ao app $($Def.app)."; return }
  Invoke-Dv "POST" "appmodules($appId)/appmoduleroles_association/`$ref" @{ "@odata.id" = "$script:DvApi/roles($roleId)" } | Out-Null
  Write-Step "'$Nome' ligado ao app $($Def.app)"
}

function Get-PermissoesDoPerfil([string] $PerfilId) {
  $porChave = @{}
  $filtro = [uri]::EscapeDataString("_fieldsecurityprofileid_value eq $PerfilId")
  foreach ($a in @(Get-Todos "fieldpermissions?`$select=fieldpermissionid,entityname,attributelogicalname,canread,cancreate,canupdate&`$filter=$filtro")) {
    $porChave["$($a.entityname)|$($a.attributelogicalname)"] = $a
  }
  return $porChave
}

function Set-PerfilDeColuna([string] $Nome, $Permissoes) {
  # 4 = permitido, 0 = nao. So entra coluna que ja tem seguranca de coluna (IsSecured).
  $alvo = @{}
  foreach ($p in @($Permissoes)) {
    $tabela = [string] $p.tabela
    $coluna = [string] $p.coluna
    $seguras = Get-ColunasSeguras $tabela
    if (-not $seguras.ContainsKey($coluna)) { Add-Pendencia "$tabela.$coluna nao tem seguranca de coluna (perfil '$Nome')"; continue }
    $cap = $seguras[$coluna]
    $alvo["$tabela|$coluna"] = @{
      tabela = $tabela; coluna = $coluna; ler = 4
      criar = $(if ($p.editar -and $cap["criar"]) { 4 } else { 0 })
      atualizar = $(if ($p.editar -and $cap["atualizar"]) { 4 } else { 0 })
    }
  }

  $perfis = @(Get-Rows "fieldsecurityprofiles" "fieldsecurityprofileid,name" "name eq '$($Nome.Replace("'", "''"))'")
  if ($perfis.Count -gt 1) { throw "Ha mais de um perfil de coluna chamado '$Nome'." }
  $perfilId = if ($perfis.Count -eq 1) { [string] $perfis[0].fieldsecurityprofileid } else { $null }
  if (-not $perfilId) {
    if (-not $script:Apply) { Write-Step "DRY RUN criaria o perfil de coluna '$Nome' com $($alvo.Count) colunas."; return }
    $novo = Invoke-Dv "POST" "fieldsecurityprofiles" @{ name = $Nome; description = "Gerado por packages/deploy/acessos (nao editar a mao)." } @{ Prefer = "return=representation" }
    $perfilId = [string] $novo.fieldsecurityprofileid
    Write-Step "criado o perfil de coluna '$Nome'"
  }

  $porChave = Get-PermissoesDoPerfil $perfilId
  $criar = @($alvo.Keys | Where-Object { -not $porChave.ContainsKey($_) })
  $mudar = @($alvo.Keys | Where-Object {
    $porChave.ContainsKey($_) -and ([int] $porChave[$_].canread -ne 4 -or [int] $porChave[$_].cancreate -ne $alvo[$_]["criar"] -or [int] $porChave[$_].canupdate -ne $alvo[$_]["atualizar"])
  })
  # Linha zerada que o gerado nao pede nao da acesso a nada: fica como esta.
  $tirar = @($porChave.Keys | Where-Object {
    -not $alvo.ContainsKey($_) -and (([int] $porChave[$_].canread + [int] $porChave[$_].cancreate + [int] $porChave[$_].canupdate) -ne 0)
  })
  if (($criar.Count + $mudar.Count + $tirar.Count) -eq 0) { Write-Step "perfil de coluna '$Nome' ja esta igual ($($alvo.Count) colunas)."; return }
  if (-not $script:Apply) { Write-Step "DRY RUN perfil de coluna '${Nome}': $($criar.Count) a criar, $($mudar.Count) a ajustar, $($tirar.Count) a retirar."; return }

  foreach ($k in $criar) {
    $x = $alvo[$k]
    Invoke-Dv "POST" "fieldpermissions" @{
      "fieldsecurityprofileid@odata.bind" = "/fieldsecurityprofiles($perfilId)"
      entityname = $x["tabela"]; attributelogicalname = $x["coluna"]; canread = $x["ler"]; cancreate = $x["criar"]; canupdate = $x["atualizar"]
    } | Out-Null
  }
  foreach ($k in $mudar) {
    $x = $alvo[$k]
    Invoke-Dv "PATCH" "fieldpermissions($($porChave[$k].fieldpermissionid))" @{ canread = $x["ler"]; cancreate = $x["criar"]; canupdate = $x["atualizar"] } | Out-Null
  }
  foreach ($k in $tirar) { Invoke-Dv "DELETE" "fieldpermissions($($porChave[$k].fieldpermissionid))" | Out-Null }

  $depois = Get-PermissoesDoPerfil $perfilId
  foreach ($k in @($alvo.Keys)) {
    if (-not $depois.ContainsKey($k) -or [int] $depois[$k].canread -ne 4 -or [int] $depois[$k].cancreate -ne $alvo[$k]["criar"] -or [int] $depois[$k].canupdate -ne $alvo[$k]["atualizar"]) {
      throw "Perfil de coluna '${Nome}': a permissao de $k nao ficou como pedido."
    }
  }
  Write-Step "gravado o perfil de coluna '$Nome' ($($alvo.Count) colunas)"
}

function Invoke-PerfisDeAcesso([string] $HashEsperado) {
  $arquivo = Join-Path $script:AcessosDir "perfis.gerado.json"
  $hash = Get-HashPerfis $arquivo
  if ($hash -ne $HashEsperado) {
    Write-Step "perfis.gerado.json mudou depois desta migration (hash $($hash.Substring(0, 12))); uma migration mais nova aplica. Nada a fazer."
    return
  }
  $def = Get-Content -LiteralPath $arquivo -Raw -Encoding UTF8 | ConvertFrom-Json
  $script:Pendencias = 0

  $bus = @(Get-Rows "businessunits" "businessunitid" "_parentbusinessunitid_value eq null")
  if ($bus.Count -ne 1) { throw "Esperava 1 unidade de negocio raiz, achei $($bus.Count)." }
  $buId = [string] $bus[0].businessunitid

  $idPorNome = @{}
  $nomePorId = @{}
  foreach ($p in @(Get-Todos "privileges?`$select=privilegeid,name")) {
    $idPorNome[[string] $p.name] = [string] $p.privilegeid
    $nomePorId[[string] $p.privilegeid] = [string] $p.name
  }

  foreach ($papel in @($def.papeis.PSObject.Properties)) {
    Set-PapelDoPerfil ([string] $papel.Name) $papel.Value $buId $idPorNome $nomePorId ([string] $def.proibido) ([string] $def.copiarSem)
  }
  foreach ($perfil in @($def.colunas.PSObject.Properties)) { Set-PerfilDeColuna ([string] $perfil.Name) $perfil.Value }

  if (-not $script:Apply) { Write-Step "dry-run: nada gravado ($script:Pendencias pendencia(s) que travariam o -Apply)."; return }
  Write-Step "OK: perfis de acesso aplicados."
}
```

Regras que o código acima segue e que valem para qualquer ajuste: `-cmatch` (as expressões do gerador diferenciam maiúsculas); `"${Nome}: ..."` quando a variável é seguida de `:`; `$perfilId`, nunca `$pid` (variável automática); função que devolve lista é chamada com `@(...)`; com `-Apply` qualquer pendência vira erro (`Add-Pendencia`), sem `-Apply` é só contada.

- [ ] **Passo 3: BOM, ASCII e parse**

```bash
A=packages/deploy/acessos/aplicar-perfis.ps1
printf '\xEF\xBB\xBF' | cat - "$A" > "$A.tmp" && mv "$A.tmp" "$A"
head -c3 "$A" | xxd -p
tail -c +4 "$A" | LC_ALL=C grep -nP '[^\x00-\x7F]' | head -5
~/.dotnet/tools/pwsh -NoProfile -Command '$e = $null; foreach ($f in "packages/deploy/acessos/aplicar-perfis.ps1", "packages/deploy/migrations/_dv.ps1") { [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $f).Path, [ref] $null, [ref] $e) | Out-Null; if ($e.Count) { $e | ForEach-Object { "${f}: $_" }; exit 1 } }; "parse ok"'
```

Esperado: `efbbbf`; nenhuma linha do `grep` (arquivo só ASCII depois do BOM); `parse ok`. Rodar o `printf` uma vez só (duas vezes dobra o BOM: se `head -c6 "$A" | xxd -p` mostrar `efbbbfefbbbf`, refazer o arquivo).

- [ ] **Passo 4: tipo 71 nas regras de distribuição**

Em `packages/deploy/solucoes/regras.json`, logo depois da linha 14 (`"70": "BetinhosCore",`), acrescentar:

```json
    "71": "BetinhosCore",
```

(mesma indentação da linha 14). Conferir que o JSON continua válido e que os testes do pacote passam:

```bash
node -e "const r=require('./packages/deploy/solucoes/regras.json'); console.log(JSON.stringify(r).includes('\"71\":\"BetinhosCore\"'))"
(cd packages/deploy && pnpm test 2>&1 | tail -6)
```

Esperado: `true`; testes sem falhas. Papel (20) e perfil de coluna (70) já têm regra.

- [ ] **Passo 5: dry-run no DEV (somente leitura)**

```bash
~/.dotnet/tools/pwsh -NoProfile -Command '. packages/deploy/migrations/_dv.ps1; Connect-Dv "https://org23b93544.crm2.dynamics.com/" "manual" $false; . packages/deploy/acessos/aplicar-perfis.ps1; Invoke-PerfisDeAcesso (Get-HashPerfis packages/deploy/acessos/perfis.gerado.json)' 2>&1 | tail -30
```

Esperado, antes das migrations da Tarefa 5 chegarem ao DEV:
- 10 linhas `DRY RUN criaria o papel 'Perfil - ...' com <n> privilegios.` e 1 linha `DRY RUN ligaria 'Perfil - Base' ao app cr40f_ModelDrivenBetinhos.`;
- 8 linhas `DRY RUN criaria o perfil de coluna 'Perfil - ...' com <n> colunas.`;
- pendências só destes dois tipos: `tabela cr40f_acessohistorico nao existe no ambiente` (a migration 1400 cria) e `cr40f_bancodedados.<coluna> nao tem seguranca de coluna` para `cr40f_telefone`, `cr40f_email`, `cr40f_datadenascimento`, `cr40f_enderecodesaida` (a migration 1405 liga);
- última linha `dry-run: nada gravado (<n> pendencia(s) que travariam o -Apply).`.

Qualquer outra pendência (tabela inexistente, privilégio que a tabela não tem, profundidade Basic recusada, privilégio solto inexistente, coluna de outra tabela sem segurança) é erro do mapa: corrigir `acessosMapa.json` ou `acessosColunas.json`, regenerar (`node packages/deploy/acessos/gerar.mjs`), rodar os testes das Tarefas 2 e 3 e repetir o dry-run. Nunca usar `-Apply` nem `$true` no `Connect-Dv` daqui: quem aplica é o Deploy.

Sem `az login` válido: parar e relatar.

- [ ] **Passo 6: commit**

```bash
git add packages/deploy/migrations/_dv.ps1 packages/deploy/acessos/aplicar-perfis.ps1 packages/deploy/solucoes/regras.json
git commit -m "feat(acessos): motor que aplica os perfis no Dataverse"
```

Se o Passo 5 obrigou a corrigir mapa e gerado, incluir esses arquivos no mesmo commit.

---

### Tarefa 5: migrations (histórico, colunas de passageiro, perfis) e conferência de quem lê

**Arquivos:**
- Criar: `packages/deploy/acessos/quem-le.mjs`
- Criar: `packages/deploy/migrations/20261123-1400-acessos-historico.ps1`
- Criar: `packages/deploy/migrations/20261123-1405-acessos-passageiros-colunas.ps1`
- Criar: `packages/deploy/migrations/20261123-1410-acessos-perfis.ps1`
- Modificar: `packages/deploy/acessos/gerar.test.mjs` (imports e teste do hash)

**Interfaces:**
- Consome: `Invoke-PerfisDeAcesso`, `Invoke-Dv` com `$ExtraHeaders` (Tarefa 4); `hashDe`, `CAMINHO_GERADO`, `node packages/deploy/acessos/gerar.mjs --hash` (Tarefa 3).
- Produz:
  - tabela `cr40f_acessohistorico` (conjunto `cr40f_acessohistoricos`) com `cr40f_name` (200), `cr40f_usuario` e `cr40f_alteradopor` (lookups para `systemuser`), `cr40f_perfisantes` e `cr40f_perfisdepois` (texto longo, 4000);
  - segurança de coluna em `cr40f_bancodedados`: `cr40f_telefone`, `cr40f_email`, `cr40f_datadenascimento`, `cr40f_enderecodesaida`;
  - `node packages/deploy/acessos/quem-le.mjs` → imprime `DEPENDENTES: <n>`.

**Risco que esta tarefa carrega:** ligar a segurança de coluna tira a leitura e a gravação dessas 4 colunas de todo usuário, aplicação ou conta de flow que não seja administrador e não tenha perfil de coluna. Por isso o Passo 1 vem antes de qualquer migration.

- [ ] **Passo 1: `quem-le.mjs` e a conferência no DEV e no PROD (somente leitura)**

Criar `packages/deploy/acessos/quem-le.mjs`:

```js
#!/usr/bin/env node
// Somente leitura. Quem le cr40f_bancodedados hoje e deixaria de ler telefone, e-mail, nascimento e
// endereco quando a seguranca de coluna ligar (migration 20261123-1405).
// Uso: DV_URL=https://<org>.crm2.dynamics.com DV_ACCESS_TOKEN=<token> node packages/deploy/acessos/quem-le.mjs
// Imprime so nomes de papeis e equipes e contagens; nunca nomes de pessoas.

const BASE = (process.env.DV_URL ?? '').replace(/\/+$/, '')
const TOKEN = process.env.DV_ACCESS_TOKEN
if (!BASE || !TOKEN) {
  console.error('Defina DV_URL e DV_ACCESS_TOKEN.')
  process.exit(2)
}
const API = `${BASE}/api/data/v9.2`
const TABELA = 'cr40f_bancodedados'
const ADMIN = ['Administrador do Sistema', 'System Administrator']

async function todos(caminho) {
  const linhas = []
  let url = `${API}/${caminho}`
  while (url) {
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: 'odata.maxpagesize=500',
      },
    })
    if (!r.ok) throw new Error(`GET ${caminho.split('?')[0]} falhou: ${r.status} ${(await r.text()).slice(0, 300)}`)
    const j = await r.json()
    linhas.push(...(j.value ?? []))
    url = j['@odata.nextLink'] ?? null
  }
  return linhas
}

async function um(caminho) {
  const r = await fetch(`${API}/${caminho}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } })
  if (!r.ok) throw new Error(`GET ${caminho.split('?')[0]} falhou: ${r.status} ${(await r.text()).slice(0, 300)}`)
  return r.json()
}

// Tabelas de ligacao: o nome do conjunto vem da metadata, nunca adivinhado.
async function ligacao(logico, campos) {
  const meta = await um(`EntityDefinitions(LogicalName='${logico}')?$select=EntitySetName`)
  return todos(`${meta.EntitySetName}?$select=${campos}`)
}

function agrupar(linhas, chave, valor) {
  const mapa = new Map()
  for (const l of linhas) {
    if (!mapa.has(l[chave])) mapa.set(l[chave], new Set())
    mapa.get(l[chave]).add(l[valor])
  }
  return mapa
}

const meta = await um(`EntityDefinitions(LogicalName='${TABELA}')?$select=LogicalName,Privileges`)
const leitura = meta.Privileges.find((p) => p.PrivilegeType === 'Read')
if (!leitura) throw new Error(`${TABELA} sem privilegio de leitura na metadata.`)

const [papeis, perfisDeColuna, equipes, usuarios, comLeitura, papeisDoUsuario, equipesDoUsuario, papeisDaEquipe, perfisDoUsuario, perfisDaEquipe] =
  await Promise.all([
    todos('roles?$select=roleid,name'),
    todos('fieldsecurityprofiles?$select=fieldsecurityprofileid,name'),
    todos('teams?$select=teamid,name'),
    todos('systemusers?$select=systemuserid,applicationid&$filter=isdisabled eq false'),
    todos(`roleprivilegescollection?$select=roleid&$filter=privilegeid eq ${leitura.PrivilegeId}`),
    ligacao('systemuserroles', 'systemuserid,roleid'),
    ligacao('teammembership', 'systemuserid,teamid'),
    ligacao('teamroles', 'teamid,roleid'),
    ligacao('systemuserprofiles', 'systemuserid,fieldsecurityprofileid'),
    ligacao('teamprofiles', 'teamid,fieldsecurityprofileid'),
  ])

const nomeDoPapel = new Map(papeis.map((p) => [p.roleid, p.name]))
const nomeDoPerfil = new Map(perfisDeColuna.map((p) => [p.fieldsecurityprofileid, p.name]))
const nomeDaEquipe = new Map(equipes.map((e) => [e.teamid, e.name]))
const papeisQueLeem = new Set(comLeitura.map((l) => l.roleid))
const diretos = agrupar(papeisDoUsuario, 'systemuserid', 'roleid')
const equipesDe = agrupar(equipesDoUsuario, 'systemuserid', 'teamid')
const papeisDe = agrupar(papeisDaEquipe, 'teamid', 'roleid')
const perfisDiretos = agrupar(perfisDoUsuario, 'systemuserid', 'fieldsecurityprofileid')
const perfisDe = agrupar(perfisDaEquipe, 'teamid', 'fieldsecurityprofileid')

const nomes = (ids, mapa) => [...ids].map((id) => mapa.get(id)).filter(Boolean)
const ehAdmin = (lista) => lista.some((n) => ADMIN.includes(n))

let admins = 0
let cobertos = 0
let motoristas = 0
let semLeitura = 0
const dependentes = new Map() // origem -> { pessoas, aplicacoes }

for (const u of usuarios) {
  const minhasEquipes = [...(equipesDe.get(u.systemuserid) ?? [])]
  const origens = [] // [origem, roleid]
  for (const id of diretos.get(u.systemuserid) ?? []) origens.push([`papel "${nomeDoPapel.get(id)}"`, id])
  for (const t of minhasEquipes)
    for (const id of papeisDe.get(t) ?? []) origens.push([`equipe "${nomeDaEquipe.get(t)}" (papel "${nomeDoPapel.get(id)}")`, id])
  const perfis = new Set(perfisDiretos.get(u.systemuserid) ?? [])
  for (const t of minhasEquipes) for (const id of perfisDe.get(t) ?? []) perfis.add(id)

  const leem = origens.filter(([, id]) => papeisQueLeem.has(id))
  if (ehAdmin(nomes(origens.map(([, id]) => id), nomeDoPapel))) admins++
  else if (leem.length === 0) semLeitura++
  else if (ehAdmin(nomes(perfis, nomeDoPerfil))) cobertos++
  else if (nomes(perfis, nomeDoPerfil).includes('Motoristas')) motoristas++
  else
    for (const origem of new Set(leem.map(([o]) => o))) {
      const conta = dependentes.get(origem) ?? { pessoas: 0, aplicacoes: 0 }
      if (u.applicationid) conta.aplicacoes++
      else conta.pessoas++
      dependentes.set(origem, conta)
    }
}

// Equipe de grupo do Entra so ganha membro quando a pessoa entra: conferir a equipe em si.
const equipesExpostas = [...papeisDe.entries()]
  .filter(([t, ids]) => [...ids].some((id) => papeisQueLeem.has(id)) && !ehAdmin(nomes(ids, nomeDoPapel)) && !ehAdmin(nomes(perfisDe.get(t) ?? [], nomeDoPerfil)))
  .map(([t]) => nomeDaEquipe.get(t))

console.log(`${BASE}: ${usuarios.length} usuarios ativos`)
console.log(`  administradores (leem tudo): ${admins}`)
console.log(`  nao leem ${TABELA}: ${semLeitura}`)
console.log(`  cobertos pelo perfil de coluna do administrador: ${cobertos}`)
console.log(`  com o perfil Motoristas (passam a ler so o telefone): ${motoristas}`)
for (const [origem, c] of [...dependentes].sort()) console.log(`  DEPENDE: ${origem}: ${c.pessoas} pessoa(s), ${c.aplicacoes} aplicacao(oes)`)
for (const nome of equipesExpostas.sort()) console.log(`  EQUIPE SEM COBERTURA: "${nome}" le a tabela e nao tem perfil de coluna`)
const total = [...dependentes.values()].reduce((s, c) => s + c.pessoas + c.aplicacoes, 0)
console.log(`DEPENDENTES: ${dependentes.size ? total : 0}`)
```

Um mesmo usuário pode aparecer em mais de uma origem; por isso `DEPENDENTES` é o teto, não a contagem exata de pessoas.

Rodar nos dois ambientes (só GET; o token nunca é impresso):

```bash
for ORG in org23b93544 orgf261ae8e; do
  DV_URL=https://$ORG.crm2.dynamics.com \
  DV_ACCESS_TOKEN="$(az account get-access-token --resource https://$ORG.crm2.dynamics.com --query accessToken -o tsv)" \
  node packages/deploy/acessos/quem-le.mjs
done
rg -n 'cr40f_(telefone|email|datadenascimento|enderecodesaida)' apps/motoristas/src apps/portal-cliente apps/cadastro-passageiro apps/formulario-geral packages -g '!*.test.*' -g '!node_modules' | rg -i 'bancodedados|passageir' | cut -c1-160 | head -40
```

`org23b93544` é o DEV e `orgf261ae8e` o PROD (os dois hosts já estão no repositório). Esperado: nos dois, `DEPENDENTES: 0` e nenhuma linha `EQUIPE SEM COBERTURA`; o `rg` mostra, fora do shell, só o App Motoristas lendo `cr40f_telefone` (`apps/motoristas/src/features/servicos/agendaRemota.ts`), que a migration 1405 cobre.

**Parar e relatar ao Renan, sem criar as migrations, se:** `DEPENDENTES` for maior que zero em qualquer ambiente; aparecer `EQUIPE SEM COBERTURA`; ou o `rg` mostrar o App Motoristas, o portal, o cadastro de passageiro, o Formulário Geral ou um flow lendo ou gravando e-mail, nascimento ou endereço de passageiro com conta que não é administradora. O relato leva as linhas `DEPENDE`/`EQUIPE SEM COBERTURA` (nomes de papel e equipe, sem pessoas) e os arquivos do `rg`. A saída do PROD não entra em commit, PR nem issue (o repositório é público).

- [ ] **Passo 2: migration da tabela de histórico**

Criar `packages/deploy/migrations/20261123-1400-acessos-historico.ps1`:

```powershell
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Acessos por perfil: tabela cr40f_acessohistorico (quem mudou o acesso de quem, antes e depois).
# So o plugin Cr40f.Acesso grava (como SYSTEM). A leitura vem do papel "Perfil - Administrador de acessos",
# aplicado pela migration 20261123-1410. Nenhum papel recebe privilegio aqui.
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_acessohistorico"

function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label $Nome); Description = (Label $Desc); RequiredLevel = @{ Value = "None" } }
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.FormatName = @{ Value = "Text" }; return $c
}
function TextoLongo([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "MemoAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.Format = "Text"; return $c
}

$entidade = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$table'")
if ($entidade.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria a tabela $table com 2 colunas de texto longo e 2 lookups."; return }
  $primaria = Texto "cr40f_Name" "Nome" "Nome da pessoa que teve o acesso alterado." 200
  $primaria.IsPrimaryName = $true
  Invoke-Dv "POST" "EntityDefinitions" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = "cr40f_AcessoHistorico"
    DisplayName = (Label "Hist$([char]0xF3)rico de acesso"); DisplayCollectionName = (Label "Hist$([char]0xF3)rico de acessos")
    Description = (Label "Quem alterou o acesso de quem, com os perfis antes e depois.")
    PrimaryNameAttribute = "cr40f_name"; OwnershipType = "OrganizationOwned"; HasActivities = $false; HasNotes = $false; IsActivity = $false
    IsAuditEnabled = @{ Value = $true }
    Attributes = @($primaria)
  } | Out-Null
  $entidade = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$table'")
  if ($entidade.Count -ne 1) { throw "Tabela $table nao apareceu depois do POST." }
  Write-Step "criada a tabela $table"
}

$colunas = @(
  (TextoLongo "cr40f_PerfisAntes" "Perfis antes" "JSON dos perfis antes da altera$([char]0xE7)$([char]0xE3)o." 4000),
  (TextoLongo "cr40f_PerfisDepois" "Perfis depois" "JSON dos perfis depois da altera$([char]0xE7)$([char]0xE3)o." 4000)
)
foreach ($c in $colunas) {
  $logical = $c.SchemaName.ToLowerInvariant()
  $found = Get-Coluna $table $logical
  if (-not $found) {
    if (-not $Apply) { Write-Step "DRY RUN criaria $table.$logical."; continue }
    Invoke-Dv "POST" "EntityDefinitions(LogicalName='$table')/Attributes" $c | Out-Null
    $found = Get-Coluna $table $logical
    if (-not $found) { throw "Coluna $logical nao foi criada." }
    Write-Step "criada $table.$logical"
  }
}

$lookups = @(
  @{ Rel = "cr40f_systemuser_cr40f_acessohistorico_Usuario"; Schema = "cr40f_Usuario"; Nome = "Usu$([char]0xE1)rio"; Desc = "Pessoa que teve o acesso alterado." },
  @{ Rel = "cr40f_systemuser_cr40f_acessohistorico_AlteradoPor"; Schema = "cr40f_AlteradoPor"; Nome = "Alterado por"; Desc = "Quem fez a altera$([char]0xE7)$([char]0xE3)o." }
)
foreach ($l in $lookups) {
  $logical = $l.Schema.ToLowerInvariant()
  if (@(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "MetadataId" "SchemaName eq '$($l.Rel)'").Count -gt 0) { continue }
  if (-not $Apply) { Write-Step "DRY RUN criaria lookup $table.$logical."; continue }
  Invoke-Dv "POST" "RelationshipDefinitions" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $l.Rel
    ReferencedEntity = "systemuser"; ReferencedAttribute = "systemuserid"; ReferencingEntity = $table
    CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "RemoveLink"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
    Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = $l.Schema; DisplayName = (Label $l.Nome); Description = (Label $l.Desc); RequiredLevel = @{ Value = "None" } }
  } | Out-Null
  Write-Step "criado lookup $table.$logical"
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }
Add-ComponenteNaSolucao $entidade[0].MetadataId 1
Publish-Tabela $table
```

- [ ] **Passo 3: migration da segurança de coluna dos passageiros**

Criar `packages/deploy/migrations/20261123-1405-acessos-passageiros-colunas.ps1`:

```powershell
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Acessos por perfil: liga a seguranca de coluna em 4 colunas de cr40f_bancodedados (passageiros):
# telefone, e-mail, data de nascimento e endereco de saida.
# ATENCAO: a partir daqui, quem nao e administrador e nao tem perfil de coluna deixa de LER e de GRAVAR
# essas 4 colunas. Conferido antes com packages/deploy/acessos/quem-le.mjs (DEV e PROD).
# O App Motoristas le o telefone do passageiro na agenda: o perfil de coluna "Motoristas" ganha essa leitura aqui.
# Os perfis "Perfil - Operacional/Financeiro - *" ganham as 4 colunas na migration 20261123-1410.
# Idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_bancodedados"
$colunas = @("cr40f_telefone", "cr40f_email", "cr40f_datadenascimento", "cr40f_enderecodesaida")
$mudou = $false

foreach ($col in $colunas) {
  $attr = Invoke-Dv "GET" "EntityDefinitions(LogicalName='$table')/Attributes(LogicalName='$col')"
  if ($attr.IsSecured) { Write-Step "$table.$col ja tem seguranca de coluna"; continue }
  if (-not $attr.CanBeSecuredForRead) { throw "$table.$col nao aceita seguranca de coluna." }
  if (-not $Apply) { Write-Step "DRY RUN ligaria a seguranca de coluna em $table.$col"; continue }
  $corpo = @{}
  foreach ($p in $attr.PSObject.Properties) { if ($p.Name -ne "@odata.context") { $corpo[$p.Name] = $p.Value } }
  $corpo["@odata.type"] = ([string] $attr.'@odata.type').TrimStart('#')
  $corpo["IsSecured"] = $true
  Invoke-Dv "PUT" "EntityDefinitions(LogicalName='$table')/Attributes($($attr.MetadataId))" $corpo @{ "MSCRM.MergeLabels" = "true" } | Out-Null
  $mudou = $true
  Write-Step "seguranca de coluna ligada em $table.$col"
}
if ($Apply -and $mudou) { Publish-Tabela $table }

$perfis = @(Get-Rows "fieldsecurityprofiles" "fieldsecurityprofileid" "name eq 'Motoristas'")
if ($perfis.Count -ne 1) { throw "Esperava 1 perfil de coluna 'Motoristas', achei $($perfis.Count)." }
$perfilId = [string] $perfis[0].fieldsecurityprofileid
$perm = @(Get-Rows "fieldpermissions" "fieldpermissionid,canread" "_fieldsecurityprofileid_value eq $perfilId and entityname eq '$table' and attributelogicalname eq 'cr40f_telefone'")

if ($perm.Count -gt 0 -and [int] $perm[0].canread -eq 4) {
  Write-Step "perfil Motoristas ja le $table.cr40f_telefone"
} elseif (-not $Apply) {
  Write-Step "DRY RUN daria ao perfil Motoristas a leitura de $table.cr40f_telefone"
} elseif ($perm.Count -eq 0) {
  Invoke-Dv "POST" "fieldpermissions" @{
    "fieldsecurityprofileid@odata.bind" = "/fieldsecurityprofiles($perfilId)"
    entityname = $table; attributelogicalname = "cr40f_telefone"; canread = 4; cancreate = 0; canupdate = 0
  } | Out-Null
  Write-Step "perfil Motoristas passa a ler $table.cr40f_telefone"
} else {
  Invoke-Dv "PATCH" "fieldpermissions($($perm[0].fieldpermissionid))" @{ canread = 4 } | Out-Null
  Write-Step "perfil Motoristas passa a ler $table.cr40f_telefone"
}

if (-not $Apply) { Write-Step "dry-run: nada gravado." }
```

- [ ] **Passo 4: migration que chama o motor**

Criar `packages/deploy/migrations/20261123-1410-acessos-perfis.ps1`:

```powershell
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Acessos por perfil: cria ou regrava os papeis "Perfil - *" e os perfis de coluna de mesmo nome,
# a partir de packages/deploy/acessos/perfis.gerado.json (gerado dos mapas em apps/shell/src/nav).
# O hash abaixo e o do gerado na data desta migration. Se o gerado mudar, esta migration nao faz nada
# e uma migration nova, com o hash novo, aplica (migration publicada nao se edita).
# Nao tira papel nem acesso de ninguem: so cria os perfis. Idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)
. "$PSScriptRoot/../acessos/aplicar-perfis.ps1"

Invoke-PerfisDeAcesso "__HASH__"
```

Preencher o hash (a barra normal no dot-source do motor funciona no Windows PowerShell 5.1 e no pwsh do Linux):

```bash
HASH="$(node packages/deploy/acessos/gerar.mjs --hash)"
sed -i "s/__HASH__/$HASH/" packages/deploy/migrations/20261123-1410-acessos-perfis.ps1
grep -c "$HASH" packages/deploy/migrations/20261123-1410-acessos-perfis.ps1
```

Esperado: `1`.

- [ ] **Passo 5: BOM, ASCII e parse das três migrations**

```bash
for A in packages/deploy/migrations/20261123-14{00-acessos-historico,05-acessos-passageiros-colunas,10-acessos-perfis}.ps1; do
  printf '\xEF\xBB\xBF' | cat - "$A" > "$A.tmp" && mv "$A.tmp" "$A"
  echo "$(head -c3 "$A" | xxd -p) $(tail -c +4 "$A" | LC_ALL=C grep -cP '[^\x00-\x7F]') $A"
done
~/.dotnet/tools/pwsh -NoProfile -Command '$e = $null; Get-ChildItem packages/deploy/migrations/20261123-14*.ps1 | ForEach-Object { [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref] $null, [ref] $e) | Out-Null; if ($e.Count) { $e | ForEach-Object { "$_" }; exit 1 } }; "parse ok"'
```

Esperado: três linhas `efbbbf 0 <arquivo>` e `parse ok`. Os acentos dos rótulos saem por `$([char]0x..)`, então o arquivo fica só ASCII.

- [ ] **Passo 6: teste que trava o hash numa migration (falha primeiro, passa depois)**

Em `packages/deploy/acessos/gerar.test.mjs`, trocar as linhas de import:

```js
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { CAMINHO_COLUNAS, CAMINHO_GERADO, CAMINHO_MAPA, COPIAR_SEM, PROIBIDO, gerarPerfis } from './gerar.mjs'
```

por:

```js
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { CAMINHO_COLUNAS, CAMINHO_GERADO, CAMINHO_MAPA, COPIAR_SEM, PROIBIDO, gerarPerfis, hashDe } from './gerar.mjs'
```

e acrescentar no fim do arquivo:

```js
test('o hash do perfis.gerado.json esta numa migration', () => {
  const hash = hashDe(readFileSync(CAMINHO_GERADO, 'utf8'))
  const pasta = join(dirname(CAMINHO_GERADO), '..', 'migrations')
  const achou = readdirSync(pasta)
    .filter((f) => f.endsWith('.ps1'))
    .some((f) => readFileSync(join(pasta, f), 'utf8').includes(hash))
  assert.ok(
    achou,
    'Regenerou os perfis? Crie uma migration nova chamando Invoke-PerfisDeAcesso com o hash novo (node packages/deploy/acessos/gerar.mjs --hash).',
  )
})
```

Para ver o teste falhar pelo motivo certo, rodar uma vez com o hash trocado e desfazer:

```bash
M=packages/deploy/migrations/20261123-1410-acessos-perfis.ps1
HASH="$(node packages/deploy/acessos/gerar.mjs --hash)"
sed -i "s/$HASH/__HASH__/" "$M" && node --test packages/deploy/acessos/gerar.test.mjs 2>&1 | grep -E '^# (pass|fail)'
sed -i "s/__HASH__/$HASH/" "$M" && node --test packages/deploy/acessos/gerar.test.mjs 2>&1 | grep -E '^# (pass|fail)'
```

Esperado: primeiro `# pass 12` e `# fail 1`; depois `# pass 13` e `# fail 0`.

**Regra de manutenção (vale para sempre):** mudou `acessosMapa.json` ou `acessosColunas.json` → `node packages/deploy/acessos/gerar.mjs` → migration nova `AAAAMMDD-HHMM-acessos-perfis-<motivo>.ps1`, cópia da 1410 com o hash novo. A antiga passa a avisar e pular; ninguém a edita.

- [ ] **Passo 7: dry-run das migrations e testes do pacote**

```bash
for A in packages/deploy/migrations/20261123-14{00-acessos-historico,05-acessos-passageiros-colunas,10-acessos-perfis}.ps1; do
  ~/.dotnet/tools/pwsh -NoProfile -File "$A" 2>&1 | tail -12
done
(cd packages/deploy && pnpm test 2>&1 | tail -6)
```

Sem `-Apply`, nada é gravado. Esperado: a 1400 diz `DRY RUN criaria a tabela cr40f_acessohistorico ...`; a 1405 lista 4 linhas `DRY RUN ligaria a seguranca de coluna ...` e `DRY RUN daria ao perfil Motoristas a leitura ...`; a 1410 repete o dry-run da Tarefa 4 (com as mesmas pendências, que somem quando a 1400 e a 1405 forem aplicadas pelo Deploy, nessa ordem de nome); `pnpm test` sem falhas (inclui `migrations-ci.test.mjs`). **Nunca** passar `-Apply` daqui.

- [ ] **Passo 8: commit**

```bash
git add packages/deploy/acessos/quem-le.mjs packages/deploy/acessos/gerar.test.mjs packages/deploy/migrations/20261123-1400-acessos-historico.ps1 packages/deploy/migrations/20261123-1405-acessos-passageiros-colunas.ps1 packages/deploy/migrations/20261123-1410-acessos-perfis.ps1
git commit -m "feat(acessos): migrations do histórico, das colunas de passageiro e dos perfis"
```

---

### Tarefa 6: catálogo de perfis no plugin (nomes, pedido e JSON)

**Arquivos:**
- Criar: `packages/plugins/Cr40f.Acesso.Plugin/PerfisDoUsuario.cs`
- Criar: `packages/plugins/Cr40f.Acesso.Plugin/AcessoCatalogo.cs`
- Modificar: `packages/plugins/Cr40f.Acesso.Plugin/JsonLeve.cs:1` (acrescentar `using System;`) e `:19` (método `LerLista` logo depois de `Ler`)
- Teste: `packages/plugins/Cr40f.Acesso.Plugin.Tests/AcessoCatalogoTests.cs`

**Interfaces:**
- Consome: `AcessoException(string codigo, string mensagem)` com a propriedade `Codigo`; `JsonLeve.Texto(string?)`; `JsonLeve.Converter(XElement)` (privado, mesma classe).
- Produz:
  - `PerfisDoUsuario { SortedDictionary<string, string> Areas; bool Acessos }` (chave = área em minúsculas, valor = `operador` ou `gestor`).
  - `AcessoCatalogo.Prefixo`, `.Base`, `.AdminAcessos` (constantes), `NomeDoPapel(area, nivel)`, `EhDoCatalogo(nome)`, `EhAdminDoSistema(papeis)`, `PerfisDeColuna(perfis)`, `Papeis(perfis)`, `DosPapeis(nomes)`, `LerPedido(json)`, `Json(perfis)`.
  - `JsonLeve.LerLista(string json) : List<object?>`.
  - Os nomes dos papéis têm de ser os mesmos do `perfis.gerado.json` (Tarefa 3): `Perfil - <Operacional|Financeiro|Frota|RH> - <Operador|Gestor>`, `Perfil - Base`, `Perfil - Administrador de acessos`.

O plugin é `net462` com `Nullable` ligado; os testes são `net48` com xUnit. Não há biblioteca de JSON no plugin: usa-se o `JsonLeve` que já existe.

- [ ] **Passo 1: escrever os testes que falham**

`packages/plugins/Cr40f.Acesso.Plugin.Tests/AcessoCatalogoTests.cs`:

```csharp
using System;
using Cr40f.Acesso.Plugin;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class AcessoCatalogoTests
{
    private static string Codigo(Action acao) => Assert.Throws<AcessoException>(acao).Codigo;

    [Fact]
    public void Nome_do_papel_segue_o_padrao()
    {
        Assert.Equal("Perfil - Financeiro - Operador", AcessoCatalogo.NomeDoPapel("financeiro", "operador"));
        Assert.Equal("Perfil - RH - Gestor", AcessoCatalogo.NomeDoPapel("rh", "gestor"));
        Assert.Equal("Perfil - Base", AcessoCatalogo.Base);
        Assert.Equal("Perfil - Administrador de acessos", AcessoCatalogo.AdminAcessos);
    }

    [Fact]
    public void Dos_papeis_ignora_o_que_nao_e_do_catalogo_e_gestor_vence()
    {
        var perfis = AcessoCatalogo.DosPapeis(new[] { "Acesso-Betinhos-MDA", "Perfil - Base", "Perfil - Frota - Operador", "Perfil - Frota - Gestor", "Perfil - Administrador de acessos" });
        Assert.Single(perfis.Areas);
        Assert.Equal("gestor", perfis.Areas["frota"]);
        Assert.True(perfis.Acessos);
    }

    [Fact]
    public void Administrador_do_sistema_vale_em_portugues_e_em_ingles()
    {
        Assert.True(AcessoCatalogo.EhAdminDoSistema(new[] { "Administrador do Sistema" }));
        Assert.True(AcessoCatalogo.EhAdminDoSistema(new[] { "Basic User", "System Administrator" }));
        Assert.False(AcessoCatalogo.EhAdminDoSistema(new[] { "Perfil - Administrador de acessos" }));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("[]")]
    public void Pedido_vazio_nao_tem_perfil(string? json)
    {
        var perfis = AcessoCatalogo.LerPedido(json);
        Assert.Empty(perfis.Areas);
        Assert.False(perfis.Acessos);
    }

    [Fact]
    public void Pedido_valido_vira_areas_e_acessos()
    {
        var perfis = AcessoCatalogo.LerPedido("[{\"perfil\":\"financeiro\",\"nivel\":\"operador\"},{\"perfil\":\"acessos\"},{\"perfil\":\"rh\",\"nivel\":\"gestor\"}]");
        Assert.Equal("operador", perfis.Areas["financeiro"]);
        Assert.Equal("gestor", perfis.Areas["rh"]);
        Assert.Equal(2, perfis.Areas.Count);
        Assert.True(perfis.Acessos);
        Assert.Equal(new[] { "Perfil - Financeiro - Operador", "Perfil - RH - Gestor" }, AcessoCatalogo.PerfisDeColuna(perfis));
        Assert.Equal(new[] { "Perfil - Financeiro - Operador", "Perfil - RH - Gestor", "Perfil - Administrador de acessos" }, AcessoCatalogo.Papeis(perfis));
    }

    [Theory]
    [InlineData("{nao e json")]
    [InlineData("{\"perfil\":\"rh\",\"nivel\":\"gestor\"}")]
    [InlineData("[\"rh\"]")]
    [InlineData("[{\"nivel\":\"gestor\"}]")]
    [InlineData("[{\"perfil\":\"diretoria\",\"nivel\":\"gestor\"}]")]
    [InlineData("[{\"perfil\":\"rh\"}]")]
    [InlineData("[{\"perfil\":\"rh\",\"nivel\":\"chefe\"}]")]
    [InlineData("[{\"perfil\":\"rh\",\"nivel\":2}]")]
    [InlineData("[{\"perfil\":\"rh\",\"nivel\":\"operador\"},{\"perfil\":\"rh\",\"nivel\":\"gestor\"}]")]
    [InlineData("[{\"perfil\":\"Perfil - RH - Gestor\",\"nivel\":\"gestor\"}]")]
    public void Pedido_invalido_e_recusado(string json)
    {
        Assert.Equal("PERFIL_INVALIDO", Codigo(() => AcessoCatalogo.LerPedido(json)));
    }

    [Fact]
    public void Json_sai_em_ordem_alfabetica_com_acessos_por_ultimo_e_volta_igual()
    {
        var perfis = AcessoCatalogo.LerPedido("[{\"perfil\":\"acessos\"},{\"perfil\":\"rh\",\"nivel\":\"gestor\"},{\"perfil\":\"financeiro\",\"nivel\":\"operador\"}]");
        var json = AcessoCatalogo.Json(perfis);
        Assert.Equal("[{\"perfil\":\"financeiro\",\"nivel\":\"operador\"},{\"perfil\":\"rh\",\"nivel\":\"gestor\"},{\"perfil\":\"acessos\"}]", json);
        Assert.Equal(json, AcessoCatalogo.Json(AcessoCatalogo.LerPedido(json)));
        Assert.Equal("[]", AcessoCatalogo.Json(new PerfisDoUsuario()));
    }
}
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
~/.dotnet/dotnet test packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj -p:SignAssembly=false --filter "FullyQualifiedName~AcessoCatalogoTests" 2>&1 | tail -n 15
```

Esperado: erro de compilação `CS0103`/`CS0246` (`AcessoCatalogo` e `PerfisDoUsuario` não existem).

Se o `net48` não rodar nesta máquina (erro de `mono`, `testhost` ou "framework not found" em vez de erro de compilação), trocar `test` por `build` nos passos 2 e 4 desta tarefa e das Tarefas 7 e 8, conferir só a compilação e relatar que os testes ficam para o job `plugins` do CI (que roda os plugins tocados no PR). Não instalar nada na máquina para contornar.

- [ ] **Passo 3: implementar**

`packages/plugins/Cr40f.Acesso.Plugin/PerfisDoUsuario.cs`:

```csharp
using System;
using System.Collections.Generic;

namespace Cr40f.Acesso.Plugin;

/// <summary>Perfis de uma pessoa: nível por área (chave em minúsculas) e se é Administrador de acessos.</summary>
public sealed class PerfisDoUsuario
{
    public SortedDictionary<string, string> Areas { get; } = new(StringComparer.Ordinal);
    public bool Acessos { get; set; }
}
```

`packages/plugins/Cr40f.Acesso.Plugin/AcessoCatalogo.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace Cr40f.Acesso.Plugin;

/// <summary>Nomes dos papéis "Perfil - *" e a tradução entre eles, o pedido da tela e o JSON do histórico.</summary>
public static class AcessoCatalogo
{
    public const string Prefixo = "Perfil - ";
    public const string Base = Prefixo + "Base";
    public const string AdminAcessos = Prefixo + "Administrador de acessos";
    private static readonly string[] AdminDoSistema = { "Administrador do Sistema", "System Administrator" };
    private static readonly Dictionary<string, string> Areas = new(StringComparer.Ordinal)
    {
        ["operacional"] = "Operacional", ["financeiro"] = "Financeiro", ["frota"] = "Frota", ["rh"] = "RH",
    };
    private static readonly Dictionary<string, string> Niveis = new(StringComparer.Ordinal) { ["operador"] = "Operador", ["gestor"] = "Gestor" };

    public static string NomeDoPapel(string area, string nivel) => Prefixo + Areas[area] + " - " + Niveis[nivel];
    public static bool EhDoCatalogo(string nome) => nome.StartsWith(Prefixo, StringComparison.Ordinal);
    public static bool EhAdminDoSistema(IEnumerable<string> papeis) => papeis.Any(p => AdminDoSistema.Contains(p));

    /// <summary>Perfis de coluna da pessoa: um por área, com o mesmo nome do papel.</summary>
    public static List<string> PerfisDeColuna(PerfisDoUsuario p) => p.Areas.Select(a => NomeDoPapel(a.Key, a.Value)).ToList();

    /// <summary>Papéis da pessoa, sem o Base (que o handler sempre acrescenta).</summary>
    public static List<string> Papeis(PerfisDoUsuario p)
    {
        var nomes = PerfisDeColuna(p);
        if (p.Acessos) nomes.Add(AdminAcessos);
        return nomes;
    }

    public static PerfisDoUsuario DosPapeis(IEnumerable<string> nomes)
    {
        var perfis = new PerfisDoUsuario();
        var lista = nomes.ToList();
        foreach (var area in Areas.Keys)
            foreach (var nivel in new[] { "operador", "gestor" })
                if (lista.Contains(NomeDoPapel(area, nivel))) perfis.Areas[area] = nivel;
        perfis.Acessos = lista.Contains(AdminAcessos);
        return perfis;
    }

    public static PerfisDoUsuario LerPedido(string? json)
    {
        var perfis = new PerfisDoUsuario();
        if (string.IsNullOrWhiteSpace(json)) return perfis;
        List<object?> itens;
        try { itens = JsonLeve.LerLista(json!); }
        catch (Exception) { throw Invalido("A lista de perfis não é um JSON válido."); }
        foreach (var item in itens)
        {
            if (item is not Dictionary<string, object?> campos || !campos.TryGetValue("perfil", out var p) || p is not string perfil)
                throw Invalido("Cada item precisa do campo perfil.");
            if (perfil == "acessos") { perfis.Acessos = true; continue; }
            if (!Areas.ContainsKey(perfil)) throw Invalido("Perfil desconhecido: " + perfil + ".");
            if (!campos.TryGetValue("nivel", out var n) || n is not string nivel || !Niveis.ContainsKey(nivel))
                throw Invalido("Nível inválido para " + perfil + ".");
            if (perfis.Areas.ContainsKey(perfil)) throw Invalido("Perfil repetido: " + perfil + ".");
            perfis.Areas[perfil] = nivel;
        }
        return perfis;
    }

    public static string Json(PerfisDoUsuario p)
    {
        var itens = p.Areas.Select(a => "{\"perfil\":" + JsonLeve.Texto(a.Key) + ",\"nivel\":" + JsonLeve.Texto(a.Value) + "}").ToList();
        if (p.Acessos) itens.Add("{\"perfil\":\"acessos\"}");
        return "[" + string.Join(",", itens) + "]";
    }

    private static AcessoException Invalido(string texto) => new("PERFIL_INVALIDO", texto);
}
```

Em `packages/plugins/Cr40f.Acesso.Plugin/JsonLeve.cs`, acrescentar `using System;` como primeira linha e, logo depois do método `Ler` (antes de `Texto`), o método:

```csharp
    public static List<object?> LerLista(string json)
    {
        using var reader = JsonReaderWriterFactory.CreateJsonReader(Encoding.UTF8.GetBytes(json), XmlDictionaryReaderQuotas.Max);
        return Converter(XElement.Load(reader)) as List<object?> ?? throw new FormatException("JSON não é uma lista.");
    }
```

- [ ] **Passo 4: rodar e ver passar**

```bash
~/.dotnet/dotnet test packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj -p:SignAssembly=false --filter "FullyQualifiedName~AcessoCatalogoTests" 2>&1 | tail -n 6
```

Esperado: `Aprovado!` (ou `Passed!`) com 18 testes (5 `Fact` + 13 casos de `Theory`), 0 falhas. Um número inteiro no JSON (`"nivel":2`) chega como `decimal` no `JsonLeve`, por isso cai em "Nível inválido".

- [ ] **Passo 5: commit**

```bash
git add packages/plugins/Cr40f.Acesso.Plugin/PerfisDoUsuario.cs packages/plugins/Cr40f.Acesso.Plugin/AcessoCatalogo.cs packages/plugins/Cr40f.Acesso.Plugin/JsonLeve.cs packages/plugins/Cr40f.Acesso.Plugin.Tests/AcessoCatalogoTests.cs
git commit -m "feat(acessos): catálogo de perfis no plugin de acesso"
```

---

### Tarefa 7: handler que define os perfis de uma pessoa

**Arquivos:**
- Criar: `packages/plugins/Cr40f.Acesso.Plugin/PapeisDoUsuario.cs`
- Criar: `packages/plugins/Cr40f.Acesso.Plugin/DefinirPerfisHandler.cs`
- Modificar: `packages/plugins/Cr40f.Acesso.Plugin.Tests/FakeService.cs:67-68` (trocar os `Associate`/`Disassociate` que lançam `NotSupportedException`)
- Teste: `packages/plugins/Cr40f.Acesso.Plugin.Tests/DefinirPerfisHandlerTests.cs`

**Interfaces:**
- Consome: `AcessoCatalogo` e `PerfisDoUsuario` (Tarefa 6); `AcessoException`; `JsonLeve.Texto`; `FakeService` (`Com(params Entity[])`, `Criados`, `RetrieveMultiple` só com `QueryExpression` e condições `Equal`/`Null`, sem `In` nem `LinkEntity`; `EntityReference` é comparado pelo `Id`; tabela ausente devolve vazio).
- Produz:
  - `PapeisDoUsuario.IdsDiretos(IOrganizationService, Guid usuario) : List<Guid>`, `.NomeDoPapel(s, Guid roleId) : string?`, `.Nomes(s, Guid usuario) : List<string>` (diretos + herdados de equipe), `.Ids(s, tabela, filtro, valor, coluna) : List<Guid>` (**público**; os testes usam).
  - `new DefinirPerfisHandler(IOrganizationService sistema).Executar(Guid chamador, Guid usuario, string? perfisJson) : string` devolvendo `{"antes":[...],"depois":[...],"historico":"<guid>"|null}` e lançando `AcessoException` com os códigos `SEM_PERMISSAO`, `PROPRIO_ACESSO`, `USUARIO_INVALIDO`, `PERFIL_INVALIDO`, `PERFIL_INDISPONIVEL`.
  - `FakeService.Associados` e `.Desassociados`: `List<(string Relacao, Guid Id, Guid Alvo)>`.

Regras (spec §5): o serviço é o do SYSTEM; o chamador precisa ser Administrador do Sistema (direto **ou por equipe**) ou ter `Perfil - Administrador de acessos`; ninguém altera o próprio acesso; só o Administrador do Sistema concede ou retira `acessos`; o alvo tem de ser pessoa ativa (não desativada, não usuário de aplicação); o handler só mexe em papéis e perfis de coluna cujo nome começa com `Perfil - ` e nunca toca nos papéis antigos; `Perfil - Base` entra sempre e nunca sai; o histórico só é gravado quando o conjunto de perfis muda.

- [ ] **Passo 1: `FakeService` aprende a associar**

Em `packages/plugins/Cr40f.Acesso.Plugin.Tests/FakeService.cs`, trocar as duas últimas linhas da classe (`Associate` e `Disassociate` que lançam `NotSupportedException`) por:

```csharp
    public List<(string Relacao, Guid Id, Guid Alvo)> Associados { get; } = new();
    public List<(string Relacao, Guid Id, Guid Alvo)> Desassociados { get; } = new();

    private static (string Tabela, string Coluna) Intersecao(string relacao) => relacao switch
    {
        "systemuserroles_association" => ("systemuserroles", "roleid"),
        "systemuserprofiles_association" => ("systemuserprofiles", "fieldsecurityprofileid"),
        _ => throw new NotSupportedException(relacao),
    };

    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities)
    {
        var (tabela, coluna) = Intersecao(relationship.SchemaName);
        foreach (var alvo in relatedEntities)
        {
            Com(new Entity(tabela, Guid.NewGuid()) { ["systemuserid"] = entityId, [coluna] = alvo.Id });
            Associados.Add((relationship.SchemaName, entityId, alvo.Id));
        }
    }

    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities)
    {
        var (tabela, coluna) = Intersecao(relationship.SchemaName);
        foreach (var alvo in relatedEntities)
        {
            if (_tabelas.TryGetValue(tabela, out var linhas))
                linhas.RemoveAll(e => e.GetAttributeValue<Guid>("systemuserid") == entityId && e.GetAttributeValue<Guid>(coluna) == alvo.Id);
            Desassociados.Add((relationship.SchemaName, entityId, alvo.Id));
        }
    }
```

Conferir no topo do arquivo que `_tabelas` é `Dictionary<string, List<Entity>>` (é o que `RemoveAll` exige); se for outro tipo de coleção, usar o método de remoção equivalente dela. Não mudar mais nada no arquivo.

- [ ] **Passo 2: escrever os testes que falham**

`packages/plugins/Cr40f.Acesso.Plugin.Tests/DefinirPerfisHandlerTests.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class DefinirPerfisHandlerTests
{
    private const string Antigo = "Acesso-Betinhos-MDA";
    private const string Admin = "Administrador do Sistema";
    private const string FinanceiroOperador = "[{\"perfil\":\"financeiro\",\"nivel\":\"operador\"}]";
    private const string FinanceiroGestor = "[{\"perfil\":\"financeiro\",\"nivel\":\"gestor\"}]";

    private readonly FakeService _svc = new();
    private readonly Guid _bu = Guid.NewGuid();
    private readonly Dictionary<string, Guid> _papeis = new();
    private readonly Dictionary<string, Guid> _colunas = new();

    public DefinirPerfisHandlerTests()
    {
        foreach (var nome in new[] { Admin, Antigo, AcessoCatalogo.Base, AcessoCatalogo.AdminAcessos }) Papel(nome);
        foreach (var area in new[] { "operacional", "financeiro", "frota", "rh" })
            foreach (var nivel in new[] { "operador", "gestor" })
            {
                Papel(AcessoCatalogo.NomeDoPapel(area, nivel));
                PerfilDeColuna(AcessoCatalogo.NomeDoPapel(area, nivel));
            }
    }

    private void Papel(string nome)
    {
        var e = new Entity("role", Guid.NewGuid()) { ["name"] = nome, ["businessunitid"] = new EntityReference("businessunit", _bu) };
        _svc.Com(e); _papeis[nome] = e.Id;
    }

    private void PerfilDeColuna(string nome)
    {
        var e = new Entity("fieldsecurityprofile", Guid.NewGuid()) { ["name"] = nome };
        _svc.Com(e); _colunas[nome] = e.Id;
    }

    private Guid Usuario(params string[] papeis) => UsuarioEm(_bu, papeis);

    private Guid UsuarioEm(Guid bu, params string[] papeis)
    {
        var u = new Entity("systemuser", Guid.NewGuid()) { ["fullname"] = "Pessoa de Teste", ["isdisabled"] = false, ["businessunitid"] = new EntityReference("businessunit", bu) };
        _svc.Com(u);
        foreach (var papel in papeis) Vincular(u.Id, papel);
        return u.Id;
    }

    private void Vincular(Guid usuario, string papel) => _svc.Com(new Entity("systemuserroles", Guid.NewGuid()) { ["systemuserid"] = usuario, ["roleid"] = _papeis[papel] });
    private string Executar(Guid chamador, Guid usuario, string perfis) => new DefinirPerfisHandler(_svc).Executar(chamador, usuario, perfis);
    private bool Tem(Guid usuario, string papel) => PapeisDoUsuario.IdsDiretos(_svc, usuario).Contains(_papeis[papel]);
    private bool TemColuna(Guid usuario, string perfil) => PapeisDoUsuario.Ids(_svc, "systemuserprofiles", "systemuserid", usuario, "fieldsecurityprofileid").Contains(_colunas[perfil]);
    private List<Entity> Historico() => _svc.Criados.Where(e => e.LogicalName == "cr40f_acessohistorico").ToList();
    private static string Codigo(Action acao) => Assert.Throws<AcessoException>(acao).Codigo;

    [Fact]
    public void Quem_nao_e_administrador_de_acessos_nao_altera()
    {
        var chamador = Usuario(Antigo, "Perfil - Financeiro - Gestor"); var alvo = Usuario();
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Executar(chamador, alvo, FinanceiroOperador)));
        Assert.Empty(_svc.Associados);
        Assert.Empty(Historico());
    }

    [Fact]
    public void Ninguem_altera_o_proprio_acesso()
    {
        var admin = Usuario(Admin);
        Assert.Equal("PROPRIO_ACESSO", Codigo(() => Executar(admin, admin, FinanceiroGestor)));
        var gestorDeAcessos = Usuario(AcessoCatalogo.AdminAcessos);
        Assert.Equal("PROPRIO_ACESSO", Codigo(() => Executar(gestorDeAcessos, gestorDeAcessos, FinanceiroGestor)));
        Assert.Empty(_svc.Associados);
    }

    [Fact]
    public void Alvo_desativado_de_aplicacao_ou_inexistente_e_recusado()
    {
        var admin = Usuario(Admin);
        var desativado = new Entity("systemuser", Guid.NewGuid()) { ["fullname"] = "Saiu", ["isdisabled"] = true, ["businessunitid"] = new EntityReference("businessunit", _bu) };
        var aplicacao = new Entity("systemuser", Guid.NewGuid()) { ["fullname"] = "# Flow", ["isdisabled"] = false, ["applicationid"] = Guid.NewGuid(), ["businessunitid"] = new EntityReference("businessunit", _bu) };
        _svc.Com(desativado, aplicacao);
        Assert.Equal("USUARIO_INVALIDO", Codigo(() => Executar(admin, desativado.Id, FinanceiroOperador)));
        Assert.Equal("USUARIO_INVALIDO", Codigo(() => Executar(admin, aplicacao.Id, FinanceiroOperador)));
        Assert.Equal("USUARIO_INVALIDO", Codigo(() => Executar(admin, Guid.NewGuid(), FinanceiroOperador)));
        Assert.Equal("USUARIO_INVALIDO", Codigo(() => Executar(admin, Guid.Empty, FinanceiroOperador)));
        Assert.Empty(_svc.Associados);
    }

    [Fact]
    public void Pedido_invalido_nao_altera_nada()
    {
        var admin = Usuario(Admin); var alvo = Usuario();
        Assert.Equal("PERFIL_INVALIDO", Codigo(() => Executar(admin, alvo, "[{\"perfil\":\"diretoria\",\"nivel\":\"gestor\"}]")));
        Assert.Empty(_svc.Associados);
    }

    [Fact]
    public void Perfil_nao_publicado_na_unidade_do_alvo_e_recusado_sem_alterar()
    {
        var admin = Usuario(Admin); var alvo = UsuarioEm(Guid.NewGuid());
        var erro = Assert.Throws<AcessoException>(() => Executar(admin, alvo, FinanceiroOperador));
        Assert.Equal("PERFIL_INDISPONIVEL", erro.Codigo);
        Assert.Contains("Perfil - Base", erro.Message);
        Assert.Contains("Perfil - Financeiro - Operador", erro.Message);
        Assert.Empty(_svc.Associados);
    }

    [Fact]
    public void Atribui_papel_perfil_de_coluna_base_e_grava_o_historico()
    {
        var admin = Usuario(Admin); var alvo = Usuario(Antigo);
        var resultado = Executar(admin, alvo, FinanceiroOperador);

        Assert.True(Tem(alvo, "Perfil - Financeiro - Operador"));
        Assert.True(TemColuna(alvo, "Perfil - Financeiro - Operador"));
        Assert.True(Tem(alvo, AcessoCatalogo.Base));
        Assert.True(Tem(alvo, Antigo));
        var linha = Assert.Single(Historico());
        Assert.Equal("Pessoa de Teste", linha.GetAttributeValue<string>("cr40f_name"));
        Assert.Equal(alvo, linha.GetAttributeValue<EntityReference>("cr40f_usuario").Id);
        Assert.Equal(admin, linha.GetAttributeValue<EntityReference>("cr40f_alteradopor").Id);
        Assert.Equal("[]", linha.GetAttributeValue<string>("cr40f_perfisantes"));
        Assert.Equal(FinanceiroOperador, linha.GetAttributeValue<string>("cr40f_perfisdepois"));
        Assert.Equal("{\"antes\":[],\"depois\":" + FinanceiroOperador + ",\"historico\":\"" + linha.Id + "\"}", resultado);
    }

    [Fact]
    public void Trocar_de_operador_para_gestor_troca_papel_e_perfil_de_coluna()
    {
        var admin = Usuario(Admin); var alvo = Usuario();
        Executar(admin, alvo, FinanceiroOperador);
        Executar(admin, alvo, FinanceiroGestor);

        Assert.False(Tem(alvo, "Perfil - Financeiro - Operador"));
        Assert.False(TemColuna(alvo, "Perfil - Financeiro - Operador"));
        Assert.True(Tem(alvo, "Perfil - Financeiro - Gestor"));
        Assert.True(TemColuna(alvo, "Perfil - Financeiro - Gestor"));
        Assert.Equal(2, Historico().Count);
        Assert.Equal(FinanceiroOperador, Historico()[1].GetAttributeValue<string>("cr40f_perfisantes"));
        Assert.Equal(FinanceiroGestor, Historico()[1].GetAttributeValue<string>("cr40f_perfisdepois"));
    }

    [Fact]
    public void Repetir_o_mesmo_pedido_nao_grava_historico_nem_associa_de_novo()
    {
        var admin = Usuario(Admin); var alvo = Usuario();
        Executar(admin, alvo, FinanceiroOperador);
        var associados = _svc.Associados.Count;
        var resultado = Executar(admin, alvo, FinanceiroOperador);

        Assert.EndsWith(",\"historico\":null}", resultado);
        Assert.Single(Historico());
        Assert.Equal(associados, _svc.Associados.Count);
        Assert.Empty(_svc.Desassociados);
    }

    [Fact]
    public void Perfil_de_coluna_faltando_e_reposto_sem_historico()
    {
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, "Perfil - RH - Operador");
        var resultado = Executar(admin, alvo, "[{\"perfil\":\"rh\",\"nivel\":\"operador\"}]");

        Assert.True(TemColuna(alvo, "Perfil - RH - Operador"));
        Assert.EndsWith(",\"historico\":null}", resultado);
        Assert.Empty(Historico());
    }

    [Fact]
    public void Administrador_de_acessos_altera_area_mas_nao_concede_nem_retira_acessos()
    {
        var chamador = Usuario(AcessoCatalogo.AdminAcessos);
        var comum = Usuario(); var outroGestor = Usuario(AcessoCatalogo.Base, AcessoCatalogo.AdminAcessos);

        Assert.Equal("SEM_PERMISSAO", Codigo(() => Executar(chamador, comum, "[{\"perfil\":\"acessos\"}]")));
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Executar(chamador, outroGestor, "[]")));
        Assert.Empty(_svc.Associados);
        Assert.Empty(_svc.Desassociados);

        Executar(chamador, outroGestor, "[{\"perfil\":\"acessos\"},{\"perfil\":\"frota\",\"nivel\":\"operador\"}]");
        Assert.True(Tem(outroGestor, "Perfil - Frota - Operador"));
        Assert.True(Tem(outroGestor, AcessoCatalogo.AdminAcessos));
    }

    [Fact]
    public void Administrador_do_sistema_concede_e_retira_acessos()
    {
        var admin = Usuario(Admin); var alvo = Usuario();
        Executar(admin, alvo, "[{\"perfil\":\"acessos\"}]");
        Assert.True(Tem(alvo, AcessoCatalogo.AdminAcessos));
        Executar(admin, alvo, "[]");
        Assert.False(Tem(alvo, AcessoCatalogo.AdminAcessos));
        Assert.True(Tem(alvo, AcessoCatalogo.Base));
    }

    [Fact]
    public void Administrador_do_sistema_por_equipe_tambem_vale()
    {
        var chamador = Usuario(); var alvo = Usuario(); var equipe = Guid.NewGuid();
        _svc.Com(new Entity("teammembership", Guid.NewGuid()) { ["systemuserid"] = chamador, ["teamid"] = equipe });
        _svc.Com(new Entity("teamroles", Guid.NewGuid()) { ["teamid"] = equipe, ["roleid"] = _papeis[Admin] });

        Executar(chamador, alvo, "[{\"perfil\":\"acessos\"}]");
        Assert.True(Tem(alvo, AcessoCatalogo.AdminAcessos));
    }

    [Fact]
    public void Lista_vazia_retira_as_areas_mantem_o_base_e_nao_toca_nos_papeis_antigos()
    {
        var admin = Usuario(Admin); var alvo = Usuario(Antigo);
        Executar(admin, alvo, "[{\"perfil\":\"rh\",\"nivel\":\"gestor\"},{\"perfil\":\"frota\",\"nivel\":\"operador\"}]");
        Executar(admin, alvo, "[]");

        Assert.False(Tem(alvo, "Perfil - RH - Gestor"));
        Assert.False(TemColuna(alvo, "Perfil - RH - Gestor"));
        Assert.False(Tem(alvo, "Perfil - Frota - Operador"));
        Assert.True(Tem(alvo, AcessoCatalogo.Base));
        Assert.True(Tem(alvo, Antigo));
        Assert.DoesNotContain(_svc.Desassociados, d => d.Alvo == _papeis[Antigo] || d.Alvo == _papeis[AcessoCatalogo.Base]);
        Assert.Equal("[]", Historico()[1].GetAttributeValue<string>("cr40f_perfisdepois"));
    }
}
```

- [ ] **Passo 3: rodar e ver falhar**

```bash
~/.dotnet/dotnet test packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj -p:SignAssembly=false --filter "FullyQualifiedName~DefinirPerfisHandlerTests" 2>&1 | tail -n 15
```

Esperado: erro de compilação (`DefinirPerfisHandler` e `PapeisDoUsuario` não existem).

- [ ] **Passo 4: implementar**

`packages/plugins/Cr40f.Acesso.Plugin/PapeisDoUsuario.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

/// <summary>Papéis de uma pessoa: os diretos e os herdados das equipes de que ela é membro.</summary>
public static class PapeisDoUsuario
{
    public static List<Guid> IdsDiretos(IOrganizationService s, Guid usuario) => Ids(s, "systemuserroles", "systemuserid", usuario, "roleid");

    public static string? NomeDoPapel(IOrganizationService s, Guid roleId)
    {
        var q = new QueryExpression("role") { ColumnSet = new ColumnSet("name") };
        q.Criteria.AddCondition("roleid", ConditionOperator.Equal, roleId);
        return s.RetrieveMultiple(q).Entities.FirstOrDefault()?.GetAttributeValue<string>("name");
    }

    public static List<string> Nomes(IOrganizationService s, Guid usuario)
    {
        var ids = IdsDiretos(s, usuario);
        foreach (var equipe in Ids(s, "teammembership", "systemuserid", usuario, "teamid"))
            ids.AddRange(Ids(s, "teamroles", "teamid", equipe, "roleid"));
        return ids.Distinct().Select(id => NomeDoPapel(s, id)).Where(n => n != null).Select(n => n!).ToList();
    }

    /// <summary>Lê uma tabela de interseção: os valores de <paramref name="coluna"/> das linhas em que <paramref name="filtro"/> = <paramref name="valor"/>.</summary>
    public static List<Guid> Ids(IOrganizationService s, string tabela, string filtro, Guid valor, string coluna)
    {
        var q = new QueryExpression(tabela) { ColumnSet = new ColumnSet(coluna) };
        q.Criteria.AddCondition(filtro, ConditionOperator.Equal, valor);
        return s.RetrieveMultiple(q).Entities.Select(e => e.GetAttributeValue<Guid>(coluna)).ToList();
    }
}
```

`packages/plugins/Cr40f.Acesso.Plugin/DefinirPerfisHandler.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

/// <summary>Define os perfis de uma pessoa: troca os papéis "Perfil - *" e os perfis de coluna de mesmo nome e grava o histórico.</summary>
public sealed class DefinirPerfisHandler
{
    private readonly IOrganizationService _sistema;

    public DefinirPerfisHandler(IOrganizationService sistema) { _sistema = sistema; }

    public string Executar(Guid chamador, Guid usuario, string? perfisJson)
    {
        var papeisDoChamador = PapeisDoUsuario.Nomes(_sistema, chamador);
        var admin = AcessoCatalogo.EhAdminDoSistema(papeisDoChamador);
        if (!admin && !papeisDoChamador.Contains(AcessoCatalogo.AdminAcessos))
            throw new AcessoException("SEM_PERMISSAO", "Só o Administrador de acessos altera perfis.");
        if (chamador == usuario) throw new AcessoException("PROPRIO_ACESSO", "Ninguém altera o próprio acesso.");

        var pedido = AcessoCatalogo.LerPedido(perfisJson);
        var alvo = Alvo(usuario) ?? throw new AcessoException("USUARIO_INVALIDO", "Usuário não encontrado, desativado ou de aplicação.");
        var papeis = Catalogo("role", alvo.GetAttributeValue<EntityReference>("businessunitid").Id);
        var colunas = Catalogo("fieldsecurityprofile", null);
        var papeisAtuais = PapeisDoUsuario.IdsDiretos(_sistema, usuario);
        var antes = AcessoCatalogo.DosPapeis(papeis.Where(p => papeisAtuais.Contains(p.Value)).Select(p => p.Key));
        if (antes.Acessos != pedido.Acessos && !admin)
            throw new AcessoException("SEM_PERMISSAO", "Só o Administrador do Sistema concede ou retira o perfil Administrador de acessos.");

        var papeisDesejados = AcessoCatalogo.Papeis(pedido);
        papeisDesejados.Add(AcessoCatalogo.Base);
        var colunasDesejadas = AcessoCatalogo.PerfisDeColuna(pedido);
        var faltam = papeisDesejados.Where(n => !papeis.ContainsKey(n)).Concat(colunasDesejadas.Where(n => !colunas.ContainsKey(n))).Distinct().ToList();
        if (faltam.Count > 0)
            throw new AcessoException("PERFIL_INDISPONIVEL", "Perfil ainda não publicado neste ambiente: " + string.Join("; ", faltam) + ".");

        Ajustar(usuario, "systemuserroles_association", "role", papeis, papeisAtuais, papeisDesejados);
        Ajustar(usuario, "systemuserprofiles_association", "fieldsecurityprofile", colunas,
            PapeisDoUsuario.Ids(_sistema, "systemuserprofiles", "systemuserid", usuario, "fieldsecurityprofileid"), colunasDesejadas);

        var jsonAntes = AcessoCatalogo.Json(antes);
        var jsonDepois = AcessoCatalogo.Json(pedido);
        Guid? historico = null;
        if (jsonAntes != jsonDepois)
        {
            var nome = alvo.GetAttributeValue<string>("fullname") ?? "";
            historico = _sistema.Create(new Entity("cr40f_acessohistorico")
            {
                ["cr40f_name"] = nome.Length > 200 ? nome.Substring(0, 200) : nome,
                ["cr40f_usuario"] = new EntityReference("systemuser", usuario),
                ["cr40f_alteradopor"] = new EntityReference("systemuser", chamador),
                ["cr40f_perfisantes"] = jsonAntes,
                ["cr40f_perfisdepois"] = jsonDepois,
            });
        }
        return "{\"antes\":" + jsonAntes + ",\"depois\":" + jsonDepois + ",\"historico\":" + (historico is Guid h ? JsonLeve.Texto(h.ToString()) : "null") + "}";
    }

    private Entity? Alvo(Guid usuario)
    {
        if (usuario == Guid.Empty) return null;
        var q = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("isdisabled", "applicationid", "businessunitid", "fullname") };
        q.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, usuario);
        var e = _sistema.RetrieveMultiple(q).Entities.FirstOrDefault();
        if (e == null || e.GetAttributeValue<bool>("isdisabled") || e.GetAttributeValue<Guid?>("applicationid") != null) return null;
        return e;
    }

    /// <summary>Nome → id dos registros "Perfil - *" da tabela (papéis: só os da unidade de negócio do alvo).</summary>
    private Dictionary<string, Guid> Catalogo(string tabela, Guid? unidade)
    {
        var q = new QueryExpression(tabela) { ColumnSet = new ColumnSet("name") };
        if (unidade is Guid id) q.Criteria.AddCondition("businessunitid", ConditionOperator.Equal, id);
        var mapa = new Dictionary<string, Guid>(StringComparer.Ordinal);
        foreach (var e in _sistema.RetrieveMultiple(q).Entities)
        {
            var nome = e.GetAttributeValue<string>("name");
            if (nome != null && AcessoCatalogo.EhDoCatalogo(nome)) mapa[nome] = e.Id;
        }
        return mapa;
    }

    /// <summary>Inclui o que falta e retira o que sobra, só entre os registros do catálogo.</summary>
    private void Ajustar(Guid usuario, string relacao, string tabela, Dictionary<string, Guid> catalogo, List<Guid> atuais, List<string> desejados)
    {
        var querer = desejados.Select(n => catalogo[n]).ToList();
        var incluir = querer.Where(id => !atuais.Contains(id)).Select(id => new EntityReference(tabela, id)).ToList();
        var retirar = catalogo.Values.Where(id => atuais.Contains(id) && !querer.Contains(id)).Select(id => new EntityReference(tabela, id)).ToList();
        if (incluir.Count > 0) _sistema.Associate("systemuser", usuario, new Relationship(relacao), new EntityReferenceCollection(incluir));
        if (retirar.Count > 0) _sistema.Disassociate("systemuser", usuario, new Relationship(relacao), new EntityReferenceCollection(retirar));
    }
}
```

Cuidados: ler atributo sempre por `GetAttributeValue` (o indexador `e["x"]` lança quando a chave falta); nenhuma mensagem de erro nem trace leva e-mail ou CPF, só nomes de perfil.

- [ ] **Passo 5: rodar e ver passar**

```bash
~/.dotnet/dotnet test packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj -p:SignAssembly=false 2>&1 | tail -n 6
```

Esperado: todos os testes do projeto passam (os 13 novos de `DefinirPerfisHandlerTests`, os 18 de `AcessoCatalogoTests` e os que já existiam), 0 falhas. Rodar o projeto inteiro aqui é de propósito: o `FakeService` mudou.

- [ ] **Passo 6: commit**

```bash
git add packages/plugins/Cr40f.Acesso.Plugin/PapeisDoUsuario.cs packages/plugins/Cr40f.Acesso.Plugin/DefinirPerfisHandler.cs packages/plugins/Cr40f.Acesso.Plugin.Tests/FakeService.cs packages/plugins/Cr40f.Acesso.Plugin.Tests/DefinirPerfisHandlerTests.cs
git commit -m "feat(acessos): handler que define os perfis de uma pessoa e grava o histórico"
```

---

### Tarefa 8: plugin e Custom API `cr40f_AcessoDefinirPerfis`

**Arquivos:**
- Criar: `packages/plugins/Cr40f.Acesso.Plugin/DefinirPerfisPlugin.cs`
- Modificar: `packages/plugins/tools/Cr40f.Acesso.Registrar/Program.cs:22` (constantes), `:48` (tipo), `:59` (Custom API), `:62` (step)

**Interfaces:**
- Consome: `DefinirPerfisHandler.Executar(Guid chamador, Guid usuario, string? perfisJson) : string` (Tarefa 7); `AcessoException`; no registrador, `UpsertPluginType(service, assemblyId, typeName)`, `EnsureCustomApi(service, uniqueName, displayName, description, solution, requestParams:, responseProps:)` e `EnsureApiStep(service, pluginTypeId, messageName, name, config, solution)`, que já existem no arquivo.
- Produz: Custom API **não vinculada** `cr40f_AcessoDefinirPerfis` com entrada `Usuario` (Guid, tipo 12, obrigatória) e `Perfis` (String, tipo 10, obrigatória) e saída `Resultado` (String, tipo 10). Erros de regra chegam ao cliente como `InvalidPluginExecutionException` com a mensagem `CODIGO: texto` (o shell extrai o código com a regex `/([A-Z_]{4,}): ([^|]*)/`, como já faz em `pages/funcionarios/data/acesso.ts`).

O plugin roda como SYSTEM (`CreateOrganizationService(null)`) e identifica quem chamou por `context.InitiatingUserId`, nunca por parâmetro de entrada. O registrador só roda no Deploy (CI); aqui só se confere que compila.

- [ ] **Passo 1: criar o plugin**

`packages/plugins/Cr40f.Acesso.Plugin/DefinirPerfisPlugin.cs`:

```csharp
using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>Custom API cr40f_AcessoDefinirPerfis: atribui e retira os perfis de uma pessoa.</summary>
public sealed class DefinirPerfisPlugin : IPlugin
{
    public const string Mensagem = "cr40f_AcessoDefinirPerfis";

    public DefinirPerfisPlugin(string unsecureConfig, string secureConfig) { }

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada: " + context.MessageName);
        try
        {
            var sistema = factory.CreateOrganizationService(null);
            var usuario = context.InputParameters.Contains("Usuario") && context.InputParameters["Usuario"] is Guid id ? id : Guid.Empty;
            var perfis = context.InputParameters.Contains("Perfis") ? context.InputParameters["Perfis"] as string : null;
            context.OutputParameters["Resultado"] = new DefinirPerfisHandler(sistema).Executar(context.InitiatingUserId, usuario, perfis ?? "[]");
        }
        catch (AcessoException erro)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro.Message);
            throw new InvalidPluginExecutionException(erro.Message, erro);
        }
        catch (Exception erro) when (erro is not InvalidPluginExecutionException)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro);
            throw new InvalidPluginExecutionException("Não foi possível definir os perfis. " + erro.Message, erro);
        }
    }
}
```

- [ ] **Passo 2: registrar o tipo, a Custom API e o step**

Em `packages/plugins/tools/Cr40f.Acesso.Registrar/Program.cs`, quatro inserções, cada uma logo depois da linha equivalente do "Reativar":

Depois de `const string ApiReativar = "cr40f_ReativarAcessoMotorista";`:

```csharp
const string TipoDefinirPerfis = "Cr40f.Acesso.Plugin.DefinirPerfisPlugin";
const string ApiDefinirPerfis = "cr40f_AcessoDefinirPerfis";
```

Depois de `var tipoReativar = UpsertPluginType(service, assemblyId, TipoReativar);`:

```csharp
var tipoDefinirPerfis = UpsertPluginType(service, assemblyId, TipoDefinirPerfis);
```

Depois do `EnsureCustomApi(service, ApiReativar, ...)` (a chamada ocupa 3 linhas, termina em `("Etapas", 10) });`):

```csharp
EnsureCustomApi(service, ApiDefinirPerfis, "Acesso | Definir perfis", "Atribui e retira os papeis Perfil - * e os perfis de coluna de uma pessoa; grava o historico.", solutionUniqueName,
    requestParams: new[] { ("Usuario", 12, false), ("Perfis", 10, false) },
    responseProps: new[] { ("Resultado", 10) });
```

Depois de `EnsureApiStep(service, tipoReativar, ApiReativar, "Cr40f.Acesso: reativar acesso", config, solutionUniqueName);` e antes de `if (publish)`:

```csharp
EnsureApiStep(service, tipoDefinirPerfis, ApiDefinirPerfis, "Cr40f.Acesso: definir perfis", "", solutionUniqueName);
```

O step recebe configuração vazia de propósito: o `config` dos outros três leva os ids do Entra, que este plugin não usa.

- [ ] **Passo 3: compilar o plugin, os testes e o registrador**

```bash
~/.dotnet/dotnet build packages/plugins/Cr40f.Acesso.Plugin/Cr40f.Acesso.Plugin.csproj -p:SignAssembly=false -v q 2>&1 | tail -n 4
~/.dotnet/dotnet test packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj -p:SignAssembly=false 2>&1 | tail -n 4
~/.dotnet/dotnet build packages/plugins/tools/Cr40f.Acesso.Registrar -v q 2>&1 | tail -n 4
```

Esperado: `0 Erro(s)` nos dois builds e todos os testes passando. Não rodar o registrador nem `push:plugin:*` (alteram o Dataverse; só o Deploy publica).

- [ ] **Passo 4: conferir que o Deploy enxerga o assembly como pendente**

```bash
rg -n "Cr40f.Acesso" packages/deploy/push-plugins-dev.ps1 packages/deploy/pendentes-dev.ps1 .github/workflows/deploy.yml | head -n 12
```

Esperado: o assembly `Cr40f.Acesso.Plugin` aparece na lista de plugins do Deploy com o registrador `Cr40f.Acesso.Registrar` (é o mesmo assembly que já publica cadastrar/encerrar/reativar). Se não aparecer em nenhum dos três arquivos, parar e relatar: sem isso a Custom API não nasce no DEV e a Tarefa 9 não tem o que provar.

- [ ] **Passo 5: commit**

```bash
git add packages/plugins/Cr40f.Acesso.Plugin/DefinirPerfisPlugin.cs packages/plugins/tools/Cr40f.Acesso.Registrar/Program.cs
git commit -m "feat(acessos): Custom API cr40f_AcessoDefinirPerfis no plugin de acesso"
```

---

### Tarefa 9: prova no DEV e skill `verificar-acessos`

**Arquivos:**
- Criar: `packages/deploy/acessos/prova.mjs`
- Criar: `.claude/skills/verificar-acessos/SKILL.md`
- Modificar: `.claude/skills/verificar-index.md` (linha nova no fim)

**Interfaces:**
- Consome:
  - Custom API `cr40f_AcessoDefinirPerfis` (Tarefa 8): `POST /api/data/v9.2/cr40f_AcessoDefinirPerfis` com `{ "Usuario": "<guid>", "Perfis": "<JSON em texto>" }`; erro vem em `error.message` começando pelo código (`SEM_PERMISSAO`, `PROPRIO_ACESSO`, ...).
  - Pedido de perfis (Vocabulário): `[{ "perfil": "financeiro", "nivel": "operador" }, { "perfil": "acessos" }]`; lista vazia = só o Base.
  - Papéis e perfis de coluna `Perfil - *` publicados no DEV pelas migrations da Tarefa 5.
  - Tabela `cr40f_acessohistorico` com o lookup `cr40f_usuario` (Tarefa 5).
- Produz:
  - `node packages/deploy/acessos/prova.mjs` com as variáveis `DV_URL`, `DV_ACCESS_TOKEN`, `DV_TESTE_ID`, `DV_ALVO_ID`; saída `cenario <n> (<nome>): OK | FALHOU | INCONCLUSIVO`; código de saída 0 (tudo OK), 1 (falhou), 2 (pré-condição), 3 (faltou linha de teste).
  - Skill `verificar-acessos`, que a Tarefa 10 e o Plano 2 usam.

A prova só lê dados de negócio. Leitura é feita como o usuário de teste (cabeçalho `MSCRMCallerID`, que exige o dono do token ser Administrador do Sistema). Edição e exclusão são conferidas pelos privilégios efetivos (`RetrieveUserPrivileges`), nunca por `PATCH` ou `DELETE`. A única gravação é a da própria Custom API, nos dois usuários de teste, e as linhas que ela deixa em `cr40f_acessohistorico`.

- [ ] **Passo 1: escrever a prova**

Criar `packages/deploy/acessos/prova.mjs`:

```js
// Prova dos acessos por perfil no DEV (spec, secao 10). Le como o usuario de teste (MSCRMCallerID) e confere
// edicao e exclusao pelos privilegios efetivos: nunca grava em dado de negocio. Nao imprime valor nem pessoa.
// Uso: DV_URL=https://org23b93544.crm2.dynamics.com DV_ACCESS_TOKEN=<token> DV_TESTE_ID=<guid> DV_ALVO_ID=<guid> node packages/deploy/acessos/prova.mjs
// O dono do token precisa ser Administrador do Sistema. Os dois usuarios nao podem ter papel nem perfil de coluna antigo.
const BASE = (process.env.DV_URL ?? '').replace(/\/+$/, '')
const TOKEN = process.env.DV_ACCESS_TOKEN
const TESTE = (process.env.DV_TESTE_ID ?? '').toLowerCase()
const ALVO = (process.env.DV_ALVO_ID ?? '').toLowerCase()
const DEV = 'https://org23b93544.crm2.dynamics.com'
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function parar(mensagem) {
  console.error(mensagem)
  process.exit(2)
}

if (!BASE || !TOKEN) parar('Defina DV_URL e DV_ACCESS_TOKEN.')
if (BASE !== DEV) parar('A prova so roda no DEV (org23b93544).')
if (!GUID.test(TESTE) || !GUID.test(ALVO) || TESTE === ALVO) parar('Defina DV_TESTE_ID e DV_ALVO_ID com dois ids de usuario diferentes.')

const API = `${BASE}/api/data/v9.2`

async function chamar(caminho, { como, metodo = 'GET', corpo } = {}) {
  const headers = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' }
  if (como) headers.MSCRMCallerID = como
  if (corpo) headers['Content-Type'] = 'application/json'
  const resposta = await fetch(`${API}/${caminho}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined })
  const texto = await resposta.text()
  let json = null
  try {
    json = texto ? JSON.parse(texto) : null
  } catch {
    // resposta sem JSON (ex.: pagina de erro do gateway): o status ja diz o que houve
  }
  return { status: resposta.status, json, erro: json?.error?.message ?? '' }
}

async function valores(caminho) {
  const r = await chamar(caminho)
  if (r.status !== 200) throw new Error(`GET ${caminho.split('?')[0]} devolveu ${r.status}`)
  return r.json.value ?? []
}

const nomes = async (caminho) => (await valores(caminho)).map((linha) => linha.name)

// Papeis e perfis de coluna (diretos e de equipe) que nao sao "Perfil - *": com eles a prova nao prova nada.
async function sobras(usuario) {
  const u = `systemusers(${usuario})`
  const equipes = await valores(`${u}/teammembership_association?$select=teamid`)
  const listas = await Promise.all([
    nomes(`${u}/systemuserroles_association?$select=name`),
    nomes(`${u}/systemuserprofiles_association?$select=name`),
    ...equipes.flatMap((e) => [
      nomes(`teams(${e.teamid})/teamroles_association?$select=name`),
      nomes(`teams(${e.teamid})/teamprofiles_association?$select=name`),
    ]),
  ])
  return [...new Set(listas.flat())].filter((nome) => !nome.startsWith('Perfil - '))
}

const definir = (usuario, perfis, como) =>
  chamar('cr40f_AcessoDefinirPerfis', { como, metodo: 'POST', corpo: { Usuario: usuario, Perfis: JSON.stringify(perfis) } })

async function preparar(usuario, perfis) {
  const r = await definir(usuario, perfis)
  if (r.status !== 200) throw new Error(`Nao consegui preparar o cenario (${r.status}): ${r.erro}`)
}

const metas = new Map()
async function meta(tabela) {
  if (!metas.has(tabela)) {
    const r = await chamar(`EntityDefinitions(LogicalName='${tabela}')?$select=EntitySetName,PrimaryIdAttribute,Privileges`)
    if (r.status !== 200) throw new Error(`Tabela ${tabela} nao existe no ambiente (${r.status}).`)
    metas.set(tabela, { conjunto: r.json.EntitySetName, chave: r.json.PrimaryIdAttribute, privilegios: r.json.Privileges })
  }
  return metas.get(tabela)
}

// true/false = o usuario tem ou nao o privilegio (Read, Write, Delete...) na tabela; null = nao deu para saber.
async function pode(usuario, tabela, tipo) {
  const { privilegios } = await meta(tabela)
  const id = privilegios.find((p) => p.PrivilegeType === tipo)?.PrivilegeId?.toLowerCase()
  const r = await chamar(`systemusers(${usuario})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()`)
  if (!id || r.status !== 200) return null
  return r.json.RolePrivileges.some((p) => p.PrivilegeId.toLowerCase() === id)
}

// Id de uma linha (lida como administrador) com todas as colunas preenchidas; null = o DEV nao tem linha assim.
async function linhaCom(tabela, colunas) {
  const { conjunto, chave } = await meta(tabela)
  const filtro = encodeURIComponent(colunas.map((c) => `${c} ne null`).join(' and '))
  const linhas = await valores(`${conjunto}?$select=${chave}&$filter=${filtro}&$top=1`)
  return linhas[0]?.[chave] ?? null
}

async function ler(tabela, id, colunas) {
  if (!id) return null
  const { conjunto } = await meta(tabela)
  return chamar(`${conjunto}(${id})?$select=${colunas.join(',')}`, { como: TESTE })
}

async function statusDaLista(tabela) {
  const { conjunto, chave } = await meta(tabela)
  return (await chamar(`${conjunto}?$select=${chave}&$top=1`, { como: TESTE })).status
}

async function historicoDe(usuario) {
  const { conjunto, chave } = await meta('cr40f_acessohistorico')
  return (await valores(`${conjunto}?$select=${chave}&$filter=_cr40f_usuario_value eq ${usuario}`)).length
}

const cheio = (r, coluna) => (r ? r.status === 200 && r.json[coluna] != null && r.json[coluna] !== '' : null)
const vazio = (r, coluna) => (r ? r.status === 200 && r.json[coluna] == null : null)
const nao = (valor) => (valor === null ? null : !valor)
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms))

let falhas = 0
let inconclusivos = 0

// passos() devolve [descricao, true | false | null]. O Dataverse leva alguns segundos para enxergar papel novo,
// por isso repete ate 5 vezes enquanto houver passo falso. O estado do cenario e preparado antes, fora de passos.
async function cenario(nome, passos) {
  let resultado = []
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    resultado = await passos()
    if (!resultado.some(([, ok]) => ok === false)) break
    if (tentativa < 5) await espera(3000)
  }
  const ruins = resultado.filter(([, ok]) => ok === false).map(([descricao]) => descricao)
  const semDado = resultado.filter(([, ok]) => ok === null).map(([descricao]) => descricao)
  if (ruins.length) {
    falhas++
    console.log(`cenario ${nome}: FALHOU\n  - ${ruins.join('\n  - ')}`)
  } else if (semDado.length) {
    inconclusivos++
    console.log(`cenario ${nome}: INCONCLUSIVO (sem linha de teste no DEV)\n  - ${semDado.join('\n  - ')}`)
  } else {
    console.log(`cenario ${nome}: OK`)
  }
}

const eu = (await chamar('WhoAmI')).json?.UserId
if (!eu) parar('Token recusado pelo DEV.')
if (eu === TESTE || eu === ALVO) parar('O dono do token nao pode ser o usuario de teste nem o alvo.')
if (!(await valores(`customapis?$select=uniquename&$filter=uniquename eq 'cr40f_AcessoDefinirPerfis'`)).length) {
  parar('A Custom API cr40f_AcessoDefinirPerfis ainda nao esta no DEV (espere o Deploy da develop).')
}
for (const [rotulo, id] of [['de teste', TESTE], ['alvo', ALVO]]) {
  const antigos = await sobras(id)
  if (antigos.length) parar(`O usuario ${rotulo} tem papel ou perfil de coluna fora dos "Perfil - *": ${antigos.join(', ')}.`)
}

const FINANCEIRO = { perfil: 'financeiro', nivel: 'operador' }
const ACESSOS = { perfil: 'acessos' }
const ordem = await linhaCom('cr40f_financeiro', ['cr40f_valor'])
const funcionario = await linhaCom('cr40f_funcionarios', ['cr40f_numerodocpf', 'cr40f_numerodorg', 'cr40f_cnh'])

try {
  await preparar(ALVO, [])

  await preparar(TESTE, [])
  await cenario('1 (so Base)', async () => {
    const tela = await chamar(`webresourceset?$select=name&$filter=name eq 'cr40f_SistemaBetinhos.html'`, { como: TESTE })
    return [
      ['WhoAmI responde 200', (await chamar('WhoAmI', { como: TESTE })).status === 200],
      ['le o web resource da tela', tela.status === 200 && tela.json.value.length === 1],
      ['cr40f_financeiro devolve 403', (await statusDaLista('cr40f_financeiro')) === 403],
      ['cr40f_funcionarios devolve 403', (await statusDaLista('cr40f_funcionarios')) === 403],
      ['cr40f_veiculos devolve 403', (await statusDaLista('cr40f_veiculos')) === 403],
    ]
  })

  await preparar(TESTE, [FINANCEIRO])
  await cenario('2 (Financeiro Operador)', async () => {
    const op = await ler('cr40f_financeiro', ordem, ['cr40f_valor'])
    const pessoa = await ler('cr40f_funcionarios', funcionario, ['cr40f_numerodocpf', 'cr40f_numerodorg'])
    return [
      ['le cr40f_financeiro com o valor preenchido', cheio(op, 'cr40f_valor')],
      ['pode editar cr40f_financeiro', await pode(TESTE, 'cr40f_financeiro', 'Write')],
      ['nao pode excluir cr40f_financeiro', nao(await pode(TESTE, 'cr40f_financeiro', 'Delete'))],
      ['le cr40f_funcionarios com o CPF vazio', vazio(pessoa, 'cr40f_numerodocpf')],
      ['le cr40f_funcionarios com o RG vazio', vazio(pessoa, 'cr40f_numerodorg')],
      ['nao pode editar cr40f_funcionarios', nao(await pode(TESTE, 'cr40f_funcionarios', 'Write'))],
    ]
  })

  await preparar(TESTE, [{ perfil: 'rh', nivel: 'operador' }])
  await cenario('3a (RH Operador)', async () => {
    const pessoa = await ler('cr40f_funcionarios', funcionario, ['cr40f_numerodocpf', 'cr40f_numerodorg'])
    return [
      ['CPF vazio', vazio(pessoa, 'cr40f_numerodocpf')],
      ['RG vazio', vazio(pessoa, 'cr40f_numerodorg')],
      ['pode editar cr40f_funcionarios', await pode(TESTE, 'cr40f_funcionarios', 'Write')],
      ['nao pode excluir cr40f_funcionarios', nao(await pode(TESTE, 'cr40f_funcionarios', 'Delete'))],
    ]
  })

  await preparar(TESTE, [{ perfil: 'rh', nivel: 'gestor' }])
  await cenario('3b (RH Gestor)', async () => {
    const pessoa = await ler('cr40f_funcionarios', funcionario, ['cr40f_numerodocpf', 'cr40f_numerodorg'])
    return [
      ['CPF preenchido', cheio(pessoa, 'cr40f_numerodocpf')],
      ['RG preenchido', cheio(pessoa, 'cr40f_numerodorg')],
      ['pode excluir cr40f_funcionarios', await pode(TESTE, 'cr40f_funcionarios', 'Delete')],
    ]
  })

  await preparar(TESTE, [{ perfil: 'frota', nivel: 'operador' }])
  await cenario('4 (Frota Operador)', async () => {
    const pessoa = await ler('cr40f_funcionarios', funcionario, ['cr40f_cnh', 'cr40f_numerodocpf'])
    return [
      ['CNH preenchida', cheio(pessoa, 'cr40f_cnh')],
      ['CPF vazio', vazio(pessoa, 'cr40f_numerodocpf')],
      ['nao pode editar cr40f_funcionarios', nao(await pode(TESTE, 'cr40f_funcionarios', 'Write'))],
    ]
  })

  await preparar(TESTE, [ACESSOS])
  const antes = await historicoDe(ALVO)
  await cenario('5 (Administrador de acessos)', async () => {
    const concede = await definir(ALVO, [FINANCEIRO], TESTE)
    const proprio = await definir(TESTE, [ACESSOS, FINANCEIRO], TESTE)
    const promove = await definir(ALVO, [ACESSOS, FINANCEIRO], TESTE)
    const { conjunto, chave } = await meta('cr40f_acessohistorico')
    return [
      ['atribui Financeiro Operador ao alvo', concede.status === 200],
      ['a mudanca aparece no historico do alvo', (await historicoDe(ALVO)) > antes],
      ['le o historico', (await chamar(`${conjunto}?$select=${chave}&$top=1`, { como: TESTE })).status === 200],
      ['mudar o proprio acesso devolve PROPRIO_ACESSO', proprio.erro.includes('PROPRIO_ACESSO')],
      ['conceder Administrador de acessos devolve SEM_PERMISSAO', promove.erro.includes('SEM_PERMISSAO')],
    ]
  })

  await preparar(TESTE, [])
  await cenario('6 (sem o perfil de acessos)', async () => [
    ['definir perfis devolve SEM_PERMISSAO', (await definir(ALVO, [FINANCEIRO], TESTE)).erro.includes('SEM_PERMISSAO')],
  ])
} finally {
  await definir(TESTE, [])
  await definir(ALVO, [])
}

if (falhas) process.exit(1)
if (inconclusivos) process.exit(3)
console.log('prova dos acessos: OK')
```

- [ ] **Passo 2: conferir a sintaxe e as pré-condições (sem rede)**

```bash
node --check packages/deploy/acessos/prova.mjs && echo "sintaxe ok"
node packages/deploy/acessos/prova.mjs; echo "saida $?"
DV_URL=https://exemplo.crm2.dynamics.com DV_ACCESS_TOKEN=x DV_TESTE_ID=a DV_ALVO_ID=b node packages/deploy/acessos/prova.mjs; echo "saida $?"
```

Esperado: `sintaxe ok`; depois `Defina DV_URL e DV_ACCESS_TOKEN.` com `saida 2`; depois `A prova so roda no DEV (org23b93544).` com `saida 2`. A prova de verdade só roda depois do Deploy (Tarefa 10, Passo 6), porque a Custom API e os papéis ainda não estão no DEV.

- [ ] **Passo 3: skill de verificação**

Criar `.claude/skills/verificar-acessos/SKILL.md`:

```markdown
---
name: verificar-acessos
description: "Verifica os acessos por perfil do Sistema Betinhos: mapas de tabelas e colunas por perfil, gerador e motor dos papéis `Perfil - *`, migrations de acessos, Custom API `cr40f_AcessoDefinirPerfis` (handler, travas e histórico) e a prova no DEV por impersonação. Use ao mudar `apps/shell/src/nav/acessos*`, `packages/deploy/acessos/**` ou os arquivos `DefinirPerfis*`/`AcessoCatalogo*`/`PapeisDoUsuario*` do `Cr40f.Acesso.Plugin`."
---
# Verificar acessos por perfil

## Cobre
- Código: `apps/shell/src/nav/acessosMapa.json`, `apps/shell/src/nav/acessosColunas.json`, `packages/deploy/acessos/**`, migrations `*-acessos-*.ps1`, `packages/plugins/Cr40f.Acesso.Plugin/{DefinirPerfis*,AcessoCatalogo*,PapeisDoUsuario*,PerfisDoUsuario*}.cs`.
- Comportamento: papéis `Perfil - <Área> - <Operador|Gestor>`, `Perfil - Base` e `Perfil - Administrador de acessos` com os perfis de coluna de mesmo nome; quem só tem o Base abre a tela e não lê Financeiro, Funcionários nem Veículos; Operador lê, cria e edita, Gestor também exclui e vê as colunas sensíveis; a Custom API troca os perfis de uma pessoa, recusa `SEM_PERMISSAO`, `PROPRIO_ACESSO`, `USUARIO_INVALIDO`, `PERFIL_INVALIDO` e `PERFIL_INDISPONIVEL` e grava `cr40f_acessohistorico`.

## Preparar ambiente
- `node` 22, `~/.dotnet/dotnet` (8.0) e `~/.dotnet/tools/pwsh` (fora do PATH). `az login` feito pelo Renan.
- DEV: `https://org23b93544.crm2.dynamics.com`. O dono do token precisa ser Administrador do Sistema (a prova usa `MSCRMCallerID`).
- Dois usuários de teste no DEV, licenciados, sem papel antigo e sem perfil de coluna antigo, fora do grupo da equipe `Team-Betinhos-MDA`. Os ids vêm do Renan e só entram por variável de ambiente (`DV_TESTE_ID`, `DV_ALVO_ID`): o repositório é público, nunca escreva id, nome ou e-mail em arquivo, commit, PR ou issue.
- A prova só roda no DEV. No PROD só `quem-le.mjs` (GET).

## Roteiro
1. Mapas e gerador: `cd apps/shell && npx vitest run src/nav/acessosMapa && cd ../..` → todos passam; `node --test packages/deploy/acessos/gerar.test.mjs` → `fail 0` (o teste reprova o gerado desatualizado, personalização, `cr40f_segredo` e Delete no Operador).
2. Mudou `acessosMapa.json` ou `acessosColunas.json`: `node packages/deploy/acessos/gerar.mjs` e criar migration nova `AAAAMMDD-HHMM-acessos-perfis-<motivo>.ps1` com o hash novo (a `20261123-1410` é imutável depois de publicada).
3. Motor em dry-run no DEV (não grava): `~/.dotnet/tools/pwsh -NoProfile -File packages/deploy/acessos/aplicar-perfis.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com 2>&1 | tail -n 25` → sem pendência depois do Deploy; nunca passar `-Apply` à mão.
4. Plugin: `~/.dotnet/dotnet test packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj -p:SignAssembly=false 2>&1 | tail -n 6` → 0 falhas (18 de `AcessoCatalogoTests` e 13 de `DefinirPerfisHandlerTests` em 23/11/2026).
5. Custom API no DEV (só leitura): `customapis?$select=uniquename&$filter=uniquename eq 'cr40f_AcessoDefinirPerfis'` devolve 1 linha; `roles?$select=name&$filter=startswith(name,'Perfil - ')` devolve os 10 papéis.
6. Prova no DEV:
   ```bash
   ORG=org23b93544
   DV_URL=https://$ORG.crm2.dynamics.com \
   DV_ACCESS_TOKEN="$(az account get-access-token --resource https://$ORG.crm2.dynamics.com --query accessToken -o tsv)" \
   DV_TESTE_ID="$DV_TESTE_ID" DV_ALVO_ID="$DV_ALVO_ID" \
   node packages/deploy/acessos/prova.mjs
   ```
   → 7 linhas `cenario ...: OK` (1, 2, 3a, 3b, 4, 5, 6) e `prova dos acessos: OK`. `INCONCLUSIVO` = o DEV não tem linha com as colunas preenchidas (Funcionário com CPF, RG e CNH; OP com valor): não é aprovação.
7. Proteção das colunas de passageiro: `node packages/deploy/acessos/quem-le.mjs` no DEV e no PROD (mesmas variáveis, sem os ids) → `DEPENDENTES: 0` e nenhuma `EQUIPE SEM COBERTURA`. A saída do PROD não entra em commit, PR nem issue.

## Casos de borda
- Papel novo demora alguns segundos para valer: a prova repete cada cenário até 5 vezes; falha só depois disso.
- Usuário de teste com papel herdado de equipe: a prova para com saída 2 e lista os papéis (sem pessoas).
- Tabela nova usada por uma tela: entra em `acessosMapa.json` (o teste do mapa reprova a rota que não alcança a tabela).
- Coluna nova sensível: ligar `IsSecured` por migration e incluir no grupo em `acessosColunas.json`; coluna com segurança fora do mapa fica vazia para todo mundo que não é administrador.

## Fora do alcance
- A prova não grava em dado de negócio: edição e exclusão são conferidas pelos privilégios efetivos, não por tentativa.
- PROD: nenhuma atribuição de papel a pessoa ou equipe sem pedido explícito do Renan.
```

- [ ] **Passo 4: linha no índice**

Acrescentar no fim de `.claude/skills/verificar-index.md`:

```markdown
- verificar-acessos | apps/shell/src/nav/acessos*, apps/shell/src/app/acessos*, apps/shell/src/app/AcessosProvider*, apps/shell/src/pages/acessos/**, packages/deploy/acessos/**, packages/deploy/migrations/*-acessos-*.ps1, packages/plugins/Cr40f.Acesso.Plugin/{DefinirPerfis*,AcessoCatalogo*,PapeisDoUsuario*,PerfisDoUsuario*}.cs | Acessos por perfil: mapas, gerador e motor dos papéis `Perfil - *`, Custom API `cr40f_AcessoDefinirPerfis` e prova no DEV por impersonação
```

Conferir: `tail -n 2 .claude/skills/verificar-index.md | cut -c1-80` mostra a linha nova em linha própria (o arquivo precisa terminar com quebra de linha antes dela).

- [ ] **Passo 5: commit**

```bash
git add packages/deploy/acessos/prova.mjs .claude/skills/verificar-acessos/SKILL.md .claude/skills/verificar-index.md
git commit -m "feat(acessos): prova no DEV por impersonação e skill verificar-acessos"
```

---

### Tarefa 10: qualidade, PR para a develop e prova depois do Deploy

**Arquivos:**
- Modificar: os que a qualidade apontar (só arquivos deste plano)
- Modificar: `.claude/skills/verificar-acessos/SKILL.md` (só se o roteiro não bater com o que rodou)

**Interfaces:**
- Consome: tudo das Tarefas 1–9; skills `qualidade-antes-do-pr`, `verificacao-manter`, `verificar-plugins`, `verificar-deploy-dev`, `verificar-acessos`.
- Produz: PR para a `develop`; depois do merge, DEV com tabela, colunas protegidas, papéis, perfis de coluna e Custom API, provado por `prova.mjs`. O Plano 2 (shell) parte daqui.

- [ ] **Passo 1: suíte local inteira**

```bash
pnpm --filter ./packages/deploy test 2>&1 | tail -n 8
(cd apps/shell && npx vitest run src/nav 2>&1 | tail -n 6 && npx tsc --noEmit && echo "tsc ok")
~/.dotnet/dotnet test packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj -p:SignAssembly=false 2>&1 | tail -n 6
node --test scripts/dados-pessoais.test.mjs && node scripts/dados-pessoais.mjs | tail -n 3
git fetch -q origin develop && git diff --name-status -M origin/develop...HEAD | node packages/deploy/migrations-ci.mjs | tail -n 5
```

Esperado: `fail 0` nos testes do deploy; vitest sem falha e `tsc ok`; `dotnet test` com 0 falhas; a trava de dados pessoais sem achado; `migrations-ci` aceita as três migrations novas (nenhuma editada, renomeada ou apagada). Qualquer vermelho: corrigir antes de seguir.

- [ ] **Passo 2: conferência final de quem lê (DEV e PROD, só GET)**

Rodar de novo o comando do Passo 1 da Tarefa 5 (`quem-le.mjs` nos dois ambientes). Esperado: `DEPENDENTES: 0` e nenhuma `EQUIPE SEM COBERTURA` nos dois. Se mudou desde a Tarefa 5, parar e relatar ao Renan antes de abrir o PR. A saída do PROD não entra no PR.

- [ ] **Passo 3: qualidade e registro de verificação**

Rodar a skill `qualidade-antes-do-pr` inteira sobre `git diff origin/develop...HEAD` (mínimo 2 passadas de `/simplify` + `karpathy-coder`; `/code-review high --fix`; stack sem skill de framework própria: registrar "sem skill de framework para PowerShell/C# de plugin/Node de deploy"). Depois a `verificacao-manter`: áreas `verificar-shell` (toca `apps/shell/src/nav` e `packages/deploy`), `verificar-plugins` e `verificar-acessos` (roteiro até o item 4; os itens 5–7 dependem do Deploy e ficam declarados como "depois do merge"). Evidência em `.verificacao/2026-11-23-acessos-backend/` (saída dos testes). Nunca criar `.verificacao/desativado`.

Se a qualidade mudar arquivo, commit próprio:

```bash
git add -u
git commit -m "refactor(acessos): ajustes da revisão de qualidade"
```

- [ ] **Passo 4: PR para a develop**

```bash
git status --short | head -n 10
git push -u origin t3/rls-niveis-cargos-acesso
gh pr create --base develop --title "feat(acessos): perfis de acesso no Dataverse (papéis, colunas, Custom API e histórico)" --body-file "$CORPO"
```

`$CORPO` é um arquivo no scratchpad da sessão com:

- **O que muda:** tabela `cr40f_acessohistorico`; segurança de coluna em `cr40f_telefone`, `cr40f_email`, `cr40f_datadenascimento` e `cr40f_enderecodesaida` de `cr40f_bancodedados` (o perfil `Motoristas` ganha a leitura do telefone); 10 papéis `Perfil - *` e 8 perfis de coluna gerados dos mapas; Custom API `cr40f_AcessoDefinirPerfis`.
- **O que não muda:** ninguém recebe nem perde papel neste PR; os papéis antigos continuam valendo (transição em paralelo, corte no Plano 4).
- **Depois do merge:** o Deploy aplica as 3 migrations e publica o plugin; em seguida roda a prova (Passo 6).
- **Não verificado antes do merge:** itens 5–7 da `verificar-acessos`.
- **Qualidade:** passadas de simplificação (quantas e o que mudou), skill de framework e resultado do code-review.
- Última linha: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Sem ids, nomes ou e-mails de pessoas e sem números da auditoria do PROD no corpo. Vincular o PR com `link_pull_request` (URL completa) logo depois de criar. O merge é do Renan.

- [ ] **Passo 5: depois do merge, conferir o Deploy**

Skill `verificar-deploy-dev`. No resumo do workflow "Deploy" do commit de merge: as migrations `20261123-1400`, `-1405` e `-1410` aplicadas nessa ordem, a tag `schema-dev-publicado` no commit, o assembly `Cr40f.Acesso.Plugin` publicado com a descrição do sha e a distribuição sem "ATENCAO". Conferir no DEV (só GET):

```bash
ORG=org23b93544; T="$(az account get-access-token --resource https://$ORG.crm2.dynamics.com --query accessToken -o tsv)"
for C in "customapis?\$select=uniquename&\$filter=uniquename eq 'cr40f_AcessoDefinirPerfis'" \
         "roles?\$select=name&\$filter=startswith(name,'Perfil - ')" \
         "fieldsecurityprofiles?\$select=name&\$filter=startswith(name,'Perfil - ')" \
         "EntityDefinitions(LogicalName='cr40f_acessohistorico')?\$select=LogicalName"; do
  curl -s -o /dev/null -w "%{http_code} ${C%%\?*}\n" -H "Authorization: Bearer $T" -H "Accept: application/json" "https://$ORG.crm2.dynamics.com/api/data/v9.2/$C"
done
node -e "
const [org, t] = process.argv.slice(1)
const q = async (c) => (await (await fetch('https://' + org + '.crm2.dynamics.com/api/data/v9.2/' + c, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/json' } })).json()).value.length
console.log('custom api:', await q(\"customapis?\$select=uniquename&\$filter=uniquename eq 'cr40f_AcessoDefinirPerfis'\"))
console.log('papeis:', await q(\"roles?\$select=name&\$filter=startswith(name,'Perfil - ')\"))
console.log('perfis de coluna:', await q(\"fieldsecurityprofiles?\$select=name&\$filter=startswith(name,'Perfil - ')\"))
" --input-type=module "$ORG" "$T"
```

Esperado: quatro linhas `200 ...`; `custom api: 1`, `papeis: 10`, `perfis de coluna: 8` (1 unidade de negócio no DEV). Migration vermelha no Deploy: ler o resumo, corrigir com migration **substituta** (a publicada é imutável; entrada em `packages/deploy/migrations/substituidas.json` no formato `{ migration, por, motivo }`) em PR novo; não rodar `-Apply` à mão.

- [ ] **Passo 6: prova no DEV**

Pré-requisito do Renan: os dois usuários de teste do DEV (ver "Preparar ambiente" da skill) e os ids exportados no shell como `DV_TESTE_ID` e `DV_ALVO_ID`. Sem eles, parar e pedir; não usar pessoa real da operação.

```bash
ORG=org23b93544
DV_URL=https://$ORG.crm2.dynamics.com \
DV_ACCESS_TOKEN="$(az account get-access-token --resource https://$ORG.crm2.dynamics.com --query accessToken -o tsv)" \
DV_TESTE_ID="$DV_TESTE_ID" DV_ALVO_ID="$DV_ALVO_ID" \
node packages/deploy/acessos/prova.mjs; echo "saida $?"
```

Esperado: `cenario 1 (so Base): OK` até `cenario 6 (sem o perfil de acessos): OK`, `prova dos acessos: OK` e `saida 0`. Em `FALHOU`, a linha do passo diz o que não bateu: usar `systematic-debugging` (primeiro o dry-run do motor, item 3 da skill; depois o papel no DEV) e corrigir por PR novo. Em `INCONCLUSIVO`, pedir ao Renan uma linha de teste no DEV com as colunas preenchidas e repetir. Registrar o resultado (sem ids) na descrição do PR do Plano 2 e atualizar a data dos números na skill `verificar-acessos` se o roteiro mudou.

- [ ] **Passo 7: antes do `develop → main` (só leitura no PROD)**

A migration 1405 dá ao perfil de coluna `Motoristas` a leitura do telefone do passageiro; no PROD isso chega pelas soluções. Conferir que o perfil viaja:

```bash
ORG=orgf261ae8e; T="$(az account get-access-token --resource https://$ORG.crm2.dynamics.com --query accessToken -o tsv)"
node -e "
const [org, t] = process.argv.slice(1)
const g = async (c) => (await (await fetch('https://' + org + '.crm2.dynamics.com/api/data/v9.2/' + c, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/json' } })).json()).value
const perfis = await g(\"fieldsecurityprofiles?\$select=name,ismanaged&\$filter=name eq 'Motoristas'\")
console.log('perfil Motoristas no PROD:', perfis.length, perfis[0]?.ismanaged ? 'gerenciado' : 'nao gerenciado')
" --input-type=module "$ORG" "$T"
```

Esperado: `1 gerenciado` (viaja pela solução, então a permissão nova chega junto). Se vier `nao gerenciado` ou `0`, o App Motoristas do PROD perderia o telefone do passageiro na agenda quando a coluna for protegida: parar e avisar o Renan antes do PR `develop → main` (a correção é decisão dele: incluir o perfil na solução ou gravar a permissão no PROD com pedido explícito). Nada é gravado no PROD por este plano.

---

## Auto-revisão

**Cobertura da spec (seção → tarefa):** papéis e níveis (§3, §4) → T2, T3, T4, T5; colunas sensíveis e dados de passageiro (§4) → T3, T5 (1405); Custom API, travas e histórico (§5) → T5 (1400), T6, T7, T8; regra "nenhum `Perfil - *` com personalização ou `cr40f_segredo`" e "Administrador de acessos sem `prvAssignRole`" (§6) → teste do gerador (T3); distribuição nas soluções → `regras.json` (T4); testes e prova (§10) → T3, T6, T7, T9, T10. Ficam para os planos irmãos: menu, página "Sem acesso" e tela `#/acessos` (Plano 2); níveis dentro das telas (Plano 3); corte dos papéis antigos, saída da equipe do perfil de coluna de administrador e os dois administradores do PROD (Plano 4).

**Nomes conferidos entre tarefas:** `AcessoCatalogo.LerPedido`/`Papeis`/`DosPapeis`/`EhDoCatalogo`/`AdminAcessos` (T6) são os usados no handler (T7) e no plugin (T8); `FakeService.Com(params Entity[])` aceita os dois usuários do teste da T7; `perfis.gerado.json` (T3) é o que o motor (T4) e a migration 1410 (T5) leem; o pedido `[{ perfil, nivel }]` da prova (T9) é o do Vocabulário; os conjuntos de entidades da prova vêm da metadata (`EntityDefinitions`), nunca fixos.

**Lacunas declaradas (não são deste plano):**
- `cr40f_pagantes` (valor e e-mail de recibo) e `new_cpfnormalizado`/`cnhtexto` de Funcionários seguem sem segurança de coluna: quem lê a tabela lê esses campos.
- Financeiro Operador pode não conseguir vincular composição à reserva (o vínculo pede edição do lado da reserva); conferir no Plano 3.
- Financeiro Operador lê `cr40f_valor` mas não o cria nem edita (é do Gestor); as telas tratam isso no Plano 3.
- Papel novo pode levar alguns segundos para valer (cache do Dataverse); a prova repete, a tela do Plano 2 recarrega.
- O `Perfil - Base` não leva os privilégios de criar conexão, conector e fluxo que o Basic User tem (filtro `PROIBIDO` do gerador): intencional.
- Cards do Início que leem tabela de outra área falham para quem só tem o Base até o Plano 3.
- `cr40f_plannertarearesponsavel` e `cr40f_plannertarearelacao` no mapa podem ter grafia diferente no DEV: a T1 gera o catálogo e o teste do mapa (T2) reprova o nome que não existir.
- `quem-le.mjs` não enxerga membros de equipe de grupo do Entra que nunca entraram no ambiente; por isso existe a linha `EQUIPE SEM COBERTURA`.
- As linhas de `cr40f_acessohistorico` criadas pela prova ficam no DEV (são o registro da própria prova).

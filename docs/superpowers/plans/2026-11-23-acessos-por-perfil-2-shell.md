# Acessos por perfil, plano 2 (shell) — plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans. Passos com checkbox (`- [ ]`).

**Objetivo:** o shell passa a ler os perfis da pessoa, esconder do menu o que ela não alcança, mostrar "Sem acesso a este módulo" em rota aberta por link e ganhar a tela `#/acessos`, onde o Administrador de acessos atribui perfis.

**Arquitetura:** `app/acessos.ts` lê os papéis (diretos e de equipe) uma vez e traduz em `Acessos`; `AcessosProvider` entrega o estado por contexto; `nav/acessosMenu.ts` cruza o `MENU` com `nav/acessosMapa.json` (do plano 1) para filtrar menu e guardar rota. A tela `pages/acessos/` lista as pessoas e grava pela Custom API `cr40f_AcessoDefinirPerfis`. O shell não é a fronteira de segurança: quem barra é o Dataverse (plano 1); aqui é só clareza de uso.

**Stack:** React 18, TypeScript, Vite, vitest + Testing Library (jsdom), `@betinhos/ui` (^3.7.0), `@betinhos/dataverse`.

**Spec:** `docs/superpowers/specs/2026-11-23-acessos-por-perfil-design.md`, seções 6, 7 e 10 (ler antes de começar).

**Planos irmãos:** plano 1 (backend), `docs/superpowers/plans/2026-11-23-acessos-por-perfil-1-backend.md`, **tem de estar mergeado na `develop` antes deste**. Plano 3 (níveis dentro das telas: esconder botões e colunas por nível, Início por perfil) e plano 4 (corte: tirar os papéis antigos) ainda não escritos.

## Restrições globais

- Todos os comandos rodam da raiz do worktree deste plano. Nunca `cd` para o checkout principal; nunca `git stash` puro.
- **PROD é somente leitura.** Este plano não publica nada: o Deploy do DEV roda sozinho no merge na `develop`. Nunca `pnpm push`, `pnpm wr`, `sitemap:*`, `push:plugin:*` nem `provision-*` daqui.
- **Repositório público:** nada de segredo, `sig=`, CPF, nome de pessoa ou id de usuário real em código, teste, plano, commit ou PR. Dados de exemplo são fictícios (`Ana Exemplo`, `ana@exemplo.test`, ids `11111111-1111-4111-8111-111111111111`).
- Textos de tela em pt-BR com acento, exatamente como escritos aqui. Sem `border-left` colorido em cartão. Todo item da sidebar com ícone Lucide próprio.
- Drawer: clique fora, X e Esc fecham; com alteração não salva abre "Descartar alterações?" ("Continuar editando" / "Descartar"); durante o salvamento não fecha.
- Commits em português, detalhados, terminando com o `Co-Authored-By` da sessão que executa. O hook de commit exige a skill `verificacao-manter`; nunca criar `.verificacao/desativado`.
- Subagentes: nunca Fable. Sonnet para implementar, Haiku para busca.
- Comandos de teste e tipos (saída sempre filtrada):
  - `(cd apps/shell && npx vitest run <caminho> 2>&1 | tail -15)`
  - `(cd apps/shell && npx tsc --noEmit 2>&1 | tail -15)`

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `apps/shell/src/app/acessos.ts` (novo) | Tipos, rótulos, `lerPapeis`, `temPerfil`, leitura dos papéis no Dataverse, mock por `?acessos=` |
| `apps/shell/src/app/acessos.test.ts` (novo) | Testes do módulo acima |
| `apps/shell/src/app/AcessosProvider.tsx` (novo) | Contexto `carregando / erro / pronto` e `useAcessos()` |
| `apps/shell/src/nav/acessosMenu.ts` (novo) | `perfisDoItem(id)` e `menuVisivel(acessos)` a partir do mapa |
| `apps/shell/src/nav/acessosMenu.test.ts` (novo) | Filtro do menu, grupo vazio some |
| `apps/shell/src/app/mockVolume.ts` | Exporta `param` |
| `apps/shell/src/app/viewStore.ts` (+ teste) | `canPublish` usa `nomesDosPapeis` |
| `apps/shell/src/app/AppShell.tsx` | Menu filtrado e aviso de falha |
| `apps/shell/src/app/RouteLayout.tsx` | Guarda de perfil ("Sem acesso a este módulo") |
| `apps/shell/src/app/RouteLayout.acessos.test.tsx` (novo) | Testes da guarda |
| `apps/shell/src/App.tsx` | `AcessosProvider` por fora; badge de documentos só com perfil |
| `apps/shell/src/app/useDocumentosBadge.ts` (+ teste) | Parâmetro `habilitado` |
| `apps/shell/src/pages/inicio/InicioPage.tsx`, `InicioSemAcesso.tsx` (novo) | Início de quem só tem o Base |
| `apps/shell/src/pages/acessos/domain/{types,perfis,lista}.ts` (novos, + testes) | Domínio da tela |
| `apps/shell/src/pages/acessos/data/source.ts` (novo) | Fonte real e mock |
| `apps/shell/src/pages/acessos/components/{AcessosList,AcessoDrawer,HistoricoLista}.tsx` (novos) | Lista, ficha e histórico |
| `apps/shell/src/pages/acessos/AcessosPage.tsx`, `acessos.css` (novos, + teste) | Página |
| `apps/shell/src/nav/menu.ts`, `app/routes.tsx`, `app/AppShell.tsx`, `nav/acessosMapa.json` | Item "Acessos" em Cadastros, rota, ícone e entrada no mapa |
| `.claude/skills/verificar-acessos/SKILL.md` | Passos do shell |

## Vocabulário (vale para todas as tarefas)

- **Área:** `operacional | financeiro | frota | rh`. **Nível:** `operador | gestor`. **Perfil especial:** `acessos` (Administrador de acessos, sem nível). **Base:** todo mundo tem; não aparece na tela.
- **Papel no Dataverse:** `Perfil - <Operacional|Financeiro|Frota|RH> - <Operador|Gestor>` e `Perfil - Administrador de acessos`.
- **Administrador do Sistema** (papel `Administrador do Sistema` ou `System Administrator`, direto ou por equipe) vale como todos os perfis.
- **Mapa:** `apps/shell/src/nav/acessosMapa.json`; `rotas.<id>.perfis` diz quais perfis abrem a rota; rota sem `perfis` é livre (hoje `inicio` e `planner`).
- **Mock:** fora do Dataverse o shell assume todos os perfis. Para simular: `http://localhost:36472/?acessos=financeiro:operador,rh:gestor,acessos#/inicio`; `?acessos=nenhum` (só o Base); `?acessos=erro` (falha de leitura). Na tela: `?falha=salvar` simula `PERFIL_INDISPONIVEL`.

---

### Tarefa 1: worktree e base

**Arquivos:** nenhum.

- [ ] **Passo 1: worktree nova a partir da `develop`**

Skill `using-git-worktrees`: worktree nova de `origin/develop`, branch `feat/acessos-shell`.

- [ ] **Passo 2: conferir a pré-condição e instalar**

```bash
git fetch origin -q && git log --oneline -1 origin/develop
test -f apps/shell/src/nav/acessosMapa.json && test -f packages/deploy/acessos/gerar.mjs && echo "plano 1 presente"
pnpm install --frozen-lockfile 2>&1 | tail -3
(cd apps/shell && npx vitest run src/nav/acessosMapa 2>&1 | tail -6)
```

Esperado: "plano 1 presente" e o teste do mapa verde. Sem a primeira linha, **pare**: o plano 1 não foi mergeado.

---

### Tarefa 2: `app/acessos.ts` (ler papéis e decidir)

**Arquivos:**
- Criar: `apps/shell/src/app/acessos.ts`, `apps/shell/src/app/acessos.test.ts`
- Modificar: `apps/shell/src/app/mockVolume.ts` (exportar `param`), `apps/shell/src/app/viewStore.ts`, `apps/shell/src/app/viewStore.test.ts`

**Interfaces:**
- Consome: `DataverseClient.request<T>(path, init?)` e `cleanId` de `@betinhos/dataverse`; `Host` de `../host`.
- Produz: `AREAS`, `Area`, `Nivel`, `Perfil`, `Acessos`, `AREA_LABEL`, `NIVEL_LABEL`, `PERFIL_LABEL`, `TODOS`, `NENHUM`, `nomeDoPapel`, `ehAdmin`, `perfisDosPapeis`, `lerPapeis`, `temPerfil`, `temAlgum`, `semModulos`, `nomesDosPapeis`, `acessosDoMock`, `carregarAcessos`.

- [ ] **Passo 1: teste que falha**

`apps/shell/src/app/acessos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { DataverseClient } from '@betinhos/dataverse'
import { NENHUM, TODOS, acessosDoMock, lerPapeis, nomesDosPapeis, semModulos, temAlgum, temPerfil } from './acessos'

describe('lerPapeis', () => {
  it('Administrador do Sistema vale como todos os perfis', () => {
    expect(lerPapeis(['Administrador do Sistema'])).toEqual(TODOS)
    expect(lerPapeis(['System Administrator', 'Perfil - Base'])).toEqual(TODOS)
  })

  it('lê área e nível; Gestor vence Operador', () => {
    const a = lerPapeis(['Perfil - Base', 'Perfil - Financeiro - Operador', 'Perfil - RH - Operador', 'Perfil - RH - Gestor'])
    expect(a).toEqual({ admin: false, areas: { financeiro: 'operador', rh: 'gestor' }, acessos: false })
  })

  it('reconhece o Administrador de acessos e ignora papel desconhecido', () => {
    expect(lerPapeis(['Perfil - Administrador de acessos', 'Acesso-Betinhos-MDA'])).toEqual({ admin: false, areas: {}, acessos: true })
  })
})

describe('temPerfil', () => {
  const a = lerPapeis(['Perfil - Financeiro - Operador', 'Perfil - Frota - Gestor'])
  it('Operador alcança a área, mas não o nível Gestor', () => {
    expect(temPerfil(a, 'financeiro')).toBe(true)
    expect(temPerfil(a, 'financeiro', 'gestor')).toBe(false)
    expect(temPerfil(a, 'frota', 'gestor')).toBe(true)
    expect(temPerfil(a, 'rh')).toBe(false)
    expect(temPerfil(a, 'acessos')).toBe(false)
  })
  it('rota sem perfis é livre; com perfis basta um', () => {
    expect(temAlgum(NENHUM, undefined)).toBe(true)
    expect(temAlgum(a, ['rh', 'frota'])).toBe(true)
    expect(temAlgum(a, ['rh'])).toBe(false)
  })
  it('semModulos só para quem tem apenas o Base', () => {
    expect(semModulos(NENHUM)).toBe(true)
    expect(semModulos(a)).toBe(false)
    expect(semModulos({ admin: false, areas: {}, acessos: true })).toBe(false)
  })
})

describe('nomesDosPapeis', () => {
  it('junta papéis diretos e os das equipes', async () => {
    const pedidos: string[] = []
    const client = {
      request: async (path: string) => {
        pedidos.push(path)
        if (path === 'WhoAmI') return { UserId: '{AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA}' }
        if (path.includes('systemuserroles_association')) return { value: [{ name: 'Perfil - Base' }] }
        if (path.includes('teammembership_association')) return { value: [{ teamid: 't1' }] }
        if (path.startsWith('teams(t1)/teamroles_association')) return { value: [{ name: 'Administrador do Sistema' }] }
        throw new Error(`caminho inesperado: ${path}`)
      },
    } as unknown as DataverseClient
    expect(await nomesDosPapeis(client)).toEqual(['Perfil - Base', 'Administrador do Sistema'])
    expect(pedidos[1]).toContain('systemusers(aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa)')
  })
})

describe('acessosDoMock', () => {
  it('sem parâmetro assume todos os perfis', () => {
    expect(acessosDoMock(null)).toEqual(TODOS)
  })
  it('lê a lista do parâmetro', () => {
    expect(acessosDoMock('financeiro:operador,rh:gestor,acessos')).toEqual({ admin: false, areas: { financeiro: 'operador', rh: 'gestor' }, acessos: true })
    expect(acessosDoMock('nenhum')).toEqual(NENHUM)
  })
  it('erro simula a falha de leitura', () => {
    expect(() => acessosDoMock('erro')).toThrow()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`(cd apps/shell && npx vitest run src/app/acessos.test.ts 2>&1 | tail -8)` — Esperado: falha por `./acessos` não existir.

- [ ] **Passo 3: exportar `param`**

Em `apps/shell/src/app/mockVolume.ts`, trocar `function param(name: string) {` por `export function param(name: string) {`.

- [ ] **Passo 4: implementar**

`apps/shell/src/app/acessos.ts`:

```ts
import { cleanId, type DataverseClient } from '@betinhos/dataverse'
import type { Host } from '../host'
import { param } from './mockVolume'

/** Perfis de acesso da pessoa. O shell usa para esconder o que ela não alcança; quem barra de verdade é o Dataverse. */

export const AREAS = ['operacional', 'financeiro', 'frota', 'rh'] as const
export type Area = (typeof AREAS)[number]
export type Nivel = 'operador' | 'gestor'
export type Perfil = Area | 'acessos'
export type PerfisDeArea = Partial<Record<Area, Nivel>>
export type Acessos = { admin: boolean; areas: PerfisDeArea; acessos: boolean }

export const AREA_LABEL: Record<Area, string> = { operacional: 'Operacional', financeiro: 'Financeiro', frota: 'Frota', rh: 'RH' }
export const NIVEL_LABEL: Record<Nivel, string> = { operador: 'Operador', gestor: 'Gestor' }
export const PERFIL_LABEL: Record<Perfil, string> = { ...AREA_LABEL, acessos: 'Administrador de acessos' }

export const TODOS: Acessos = { admin: true, areas: { operacional: 'gestor', financeiro: 'gestor', frota: 'gestor', rh: 'gestor' }, acessos: true }
export const NENHUM: Acessos = { admin: false, areas: {}, acessos: false }

const ADMINS = ['Administrador do Sistema', 'System Administrator']
const PAPEL_ACESSOS = 'Perfil - Administrador de acessos'

export const nomeDoPapel = (area: Area, nivel: Nivel) => `Perfil - ${AREA_LABEL[area]} - ${NIVEL_LABEL[nivel]}`
export const ehAdmin = (nomes: string[]) => nomes.some((n) => ADMINS.includes(n))

/** Só os papéis `Perfil - ...`, sem o atalho do administrador (é o que a tela de Acessos mostra por pessoa). */
export function perfisDosPapeis(nomes: string[]): { areas: PerfisDeArea; acessos: boolean } {
  const areas: PerfisDeArea = {}
  for (const area of AREAS) {
    if (nomes.includes(nomeDoPapel(area, 'gestor'))) areas[area] = 'gestor'
    else if (nomes.includes(nomeDoPapel(area, 'operador'))) areas[area] = 'operador'
  }
  return { areas, acessos: nomes.includes(PAPEL_ACESSOS) }
}

export function lerPapeis(nomes: string[]): Acessos {
  return ehAdmin(nomes) ? TODOS : { admin: false, ...perfisDosPapeis(nomes) }
}

export function temPerfil(a: Acessos, perfil: Perfil, nivel: Nivel = 'operador'): boolean {
  if (a.admin) return true
  if (perfil === 'acessos') return a.acessos
  const tem = a.areas[perfil]
  return tem != null && (nivel === 'operador' || tem === 'gestor')
}

export const temAlgum = (a: Acessos, perfis: readonly Perfil[] | undefined) => !perfis || perfis.some((p) => temPerfil(a, p))
export const semModulos = (a: Acessos) => !a.admin && !a.acessos && AREAS.every((area) => !a.areas[area])

type Linhas<T> = { value: T[] }

/** Nomes dos papéis da pessoa: os diretos e os herdados das equipes (o administrador costuma vir por equipe). */
export async function nomesDosPapeis(client: DataverseClient, userId?: string): Promise<string[]> {
  const uid = userId ?? cleanId((await client.request<{ UserId: string }>('WhoAmI')).UserId)
  const [diretos, equipes] = await Promise.all([
    client.request<Linhas<{ name: string }>>(`systemusers(${uid})/systemuserroles_association?$select=name`),
    client.request<Linhas<{ teamid: string }>>(`systemusers(${uid})/teammembership_association?$select=teamid`),
  ])
  const deEquipe = await Promise.all(equipes.value.map((e) => client.request<Linhas<{ name: string }>>(`teams(${e.teamid})/teamroles_association?$select=name`)))
  return [...diretos.value, ...deEquipe.flatMap((r) => r.value)].map((r) => r.name)
}

/** `?acessos=financeiro:operador,rh:gestor,acessos` | `nenhum` | `erro`; sem o parâmetro, todos os perfis. */
export function acessosDoMock(texto: string | null): Acessos {
  if (!texto) return TODOS
  if (texto === 'nenhum') return NENHUM
  if (texto === 'erro') throw new Error('Falha simulada ao ler os acessos.')
  const areas: PerfisDeArea = {}
  let acessos = false
  for (const parte of texto.split(',')) {
    const [perfil, nivel] = parte.trim().split(':')
    if (perfil === 'acessos') acessos = true
    else if ((AREAS as readonly string[]).includes(perfil)) areas[perfil as Area] = nivel === 'gestor' ? 'gestor' : 'operador'
  }
  return { admin: false, areas, acessos }
}

export async function carregarAcessos(host: Host): Promise<Acessos> {
  if (host.mode === 'mock') return acessosDoMock(param('acessos'))
  return lerPapeis(await nomesDosPapeis(host.client))
}
```

- [ ] **Passo 5: `viewStore` usa o mesmo leitor**

Em `apps/shell/src/app/viewStore.ts`, dentro de `canPublish`, trocar a consulta a `systemuserroles_association` e o teste de `PUBLISHER_ROLES` por:

```ts
const nomes = await nomesDosPapeis(client, await userId())
return nomes.some((n) => PUBLISHER_ROLES.includes(n))
```

com `import { nomesDosPapeis } from './acessos'` (mantenha o cache/memo que a função já tiver em volta). Efeito intencional: quem é administrador só pela equipe passa a poder publicar visão.

Em `apps/shell/src/app/viewStore.test.ts`, no `fakeClient`, antes do `throw` de caminho inesperado:

```ts
if (path.includes('teammembership_association')) return { value: [] }
```

- [ ] **Passo 6: rodar**

```bash
(cd apps/shell && npx vitest run src/app/acessos.test.ts src/app/viewStore.test.ts 2>&1 | tail -8)
(cd apps/shell && npx tsc --noEmit 2>&1 | tail -8)
```

Esperado: tudo verde, `tsc` sem saída.

- [ ] **Passo 7: commit**

```bash
git add apps/shell/src/app/acessos.ts apps/shell/src/app/acessos.test.ts apps/shell/src/app/mockVolume.ts apps/shell/src/app/viewStore.ts apps/shell/src/app/viewStore.test.ts
git commit -m "feat(acessos): shell lê os perfis da pessoa (papéis diretos e de equipe)"
```

(mensagem completa com corpo em português e o `Co-Authored-By`; vale para todos os commits do plano.)

---

### Tarefa 3: contexto e filtro do menu

**Arquivos:**
- Criar: `apps/shell/src/app/AcessosProvider.tsx`, `apps/shell/src/nav/acessosMenu.ts`, `apps/shell/src/nav/acessosMenu.test.ts`

**Interfaces:**
- Consome: `carregarAcessos`, `temAlgum`, `TODOS`, `NENHUM`, `Acessos`, `Perfil` (tarefa 2); `MENU`, `MenuGroup` de `./menu`; `acessosMapa.json` (plano 1).
- Produz: `AcessosContext`, `ValorAcessos`, `AcessosProvider({ host, children })`, `useAcessos()`, `acessosDe(valor)`; `perfisDoItem(id): Perfil[] | undefined`, `menuVisivel(acessos, menu?): MenuGroup[]`.

- [ ] **Passo 1: teste que falha**

`apps/shell/src/nav/acessosMenu.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { NENHUM, TODOS, lerPapeis, temAlgum } from '../app/acessos'
import { menuVisivel, perfisDoItem } from './acessosMenu'
import { MENU } from './menu'

const ids = (grupos: { items: { id: string }[] }[]) => grupos.flatMap((g) => g.items.map((i) => i.id))

describe('menuVisivel', () => {
  it('quem tem todos os perfis vê o menu inteiro', () => {
    expect(ids(menuVisivel(TODOS))).toEqual(ids(MENU))
  })

  it('quem só tem o Base vê só as rotas livres, e grupo vazio some', () => {
    const visivel = menuVisivel(NENHUM)
    expect(ids(visivel).sort()).toEqual(['inicio', 'planner'])
    expect(visivel.every((g) => g.items.length > 0)).toBe(true)
  })

  it('Financeiro vê o que é do Financeiro e não o que é só do Operacional', () => {
    const a = lerPapeis(['Perfil - Financeiro - Operador'])
    const visivel = ids(menuVisivel(a))
    expect(visivel).toContain('despesas-operacionais')
    expect(visivel).not.toContain('geral')
    expect(visivel.every((id) => temAlgum(a, perfisDoItem(id)))).toBe(true)
  })

  it('rota livre não tem perfis', () => {
    expect(perfisDoItem('inicio')).toBeUndefined()
    expect(perfisDoItem('geral')).toEqual(['operacional'])
  })
})
```

Se a decisão sobre o Planner for "só Operacional", a lista livre vira `['inicio']` (ajuste junto com o mapa).

- [ ] **Passo 2: rodar e ver falhar**

`(cd apps/shell && npx vitest run src/nav/acessosMenu.test.ts 2>&1 | tail -8)` — Esperado: falha por `./acessosMenu` não existir.

- [ ] **Passo 3: implementar o filtro**

`apps/shell/src/nav/acessosMenu.ts`:

```ts
import { temAlgum, type Acessos, type Perfil } from '../app/acessos'
import mapaJson from './acessosMapa.json'
import { MENU, type MenuGroup } from './menu'

const ROTAS = (mapaJson as unknown as { rotas: Record<string, { perfis?: Perfil[] }> }).rotas

/** Perfis que abrem a rota; `undefined` = livre para todos. A fonte é o mapa, o mesmo que gera os papéis. */
export const perfisDoItem = (id: string): Perfil[] | undefined => ROTAS[id]?.perfis

/** O menu que a pessoa alcança; grupo sem item visível some. */
export function menuVisivel(acessos: Acessos, menu: MenuGroup[] = MENU): MenuGroup[] {
  return menu
    .map((grupo) => ({ ...grupo, items: grupo.items.filter((item) => temAlgum(acessos, perfisDoItem(item.id))) }))
    .filter((grupo) => grupo.items.length > 0)
}
```

- [ ] **Passo 4: implementar o contexto**

`apps/shell/src/app/AcessosProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Host } from '../host'
import { NENHUM, TODOS, carregarAcessos, type Acessos } from './acessos'

export type EstadoAcessos = { status: 'carregando' } | { status: 'erro' } | { status: 'pronto'; acessos: Acessos }
export type ValorAcessos = EstadoAcessos & { recarregar: () => void }

/** Sem provider (testes de tela isolada) vale "todos os perfis": o shell não é a fronteira de segurança. */
export const AcessosContext = createContext<ValorAcessos>({ status: 'pronto', acessos: TODOS, recarregar: () => {} })

export function AcessosProvider({ host, children }: { host: Host; children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoAcessos>({ status: 'carregando' })
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true
    setEstado({ status: 'carregando' })
    carregarAcessos(host).then(
      (acessos) => { if (vivo) setEstado({ status: 'pronto', acessos }) },
      () => { if (vivo) setEstado({ status: 'erro' }) },
    )
    return () => { vivo = false }
  }, [host, tentativa])

  const recarregar = useCallback(() => setTentativa((n) => n + 1), [])
  const valor = useMemo(() => ({ ...estado, recarregar }), [estado, recarregar])
  return <AcessosContext.Provider value={valor}>{children}</AcessosContext.Provider>
}

export const useAcessos = () => useContext(AcessosContext)

/** Enquanto carrega ou em erro, o que vale é "só o Base". */
export const acessosDe = (valor: ValorAcessos): Acessos => (valor.status === 'pronto' ? valor.acessos : NENHUM)
```

- [ ] **Passo 5: rodar**

```bash
(cd apps/shell && npx vitest run src/nav/acessosMenu.test.ts src/nav/acessosMapa 2>&1 | tail -8)
(cd apps/shell && npx tsc --noEmit 2>&1 | tail -8)
```

Esperado: verde.

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/app/AcessosProvider.tsx apps/shell/src/nav/acessosMenu.ts apps/shell/src/nav/acessosMenu.test.ts
git commit -m "feat(acessos): contexto de acessos e filtro do menu pelo mapa"
```

---

### Tarefa 4: menu filtrado e aviso de falha no `AppShell`

**Arquivos:**
- Modificar: `apps/shell/src/app/AppShell.tsx` (linha ~163, `groups`, e o `{children}` do `<Shell>`)
- Criar: `apps/shell/src/app/AppShell.acessos.test.tsx`

**Interfaces:**
- Consome: `useAcessos`, `acessosDe`, `AcessosContext`, `ValorAcessos` (tarefa 3); `menuVisivel` (tarefa 3).
- Produz: nada novo; o menu passa a obedecer os perfis.

- [ ] **Passo 1: teste que falha**

`apps/shell/src/app/AppShell.acessos.test.tsx`. Abra `apps/shell/src/app/AppShell.test.tsx` e copie dele, sem mudar, os `vi.mock`, o `beforeEach`/`afterEach` e as props obrigatórias que ele passa ao `<AppShell>` (constante `PROPS` abaixo):

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AcessosContext, type ValorAcessos } from './AcessosProvider'
import { AppShell } from './AppShell'
import { lerPapeis } from './acessos'

// PROPS: as mesmas props obrigatórias do AppShell.test.tsx (activeId, title, entityLabels, connection).

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const shell = (valor: ValorAcessos) =>
  render(
    <AcessosContext.Provider value={valor}>
      <AppShell {...PROPS}><p>conteúdo</p></AppShell>
    </AcessosContext.Provider>,
  )

describe('AppShell com perfis', () => {
  it('esconde do menu o que o perfil não alcança', () => {
    shell({ status: 'pronto', acessos: lerPapeis(['Perfil - Financeiro - Operador']), recarregar: () => {} })
    expect(document.querySelector('a[href="#/despesas-operacionais"]')).not.toBeNull()
    expect(document.querySelector('a[href="#/geral"]')).toBeNull()
  })

  it('falha ao ler os acessos: só as telas livres e aviso com "Tentar de novo"', () => {
    const recarregar = vi.fn()
    shell({ status: 'erro', recarregar })
    expect(screen.getByText('Não foi possível carregar seus acessos')).toBeTruthy()
    expect(document.querySelector('a[href="#/geral"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(recarregar).toHaveBeenCalledOnce()
  })
})
```

Se o `AppShell.test.tsx` precisar abrir um grupo para o link existir no DOM, faça o mesmo antes do primeiro `expect`.

- [ ] **Passo 2: rodar e ver falhar**

`(cd apps/shell && npx vitest run src/app/AppShell.acessos.test.tsx 2>&1 | tail -10)` — Esperado: falha (`#/geral` aparece; aviso não existe).

- [ ] **Passo 3: implementar**

Em `apps/shell/src/app/AppShell.tsx`:

1. Imports: acrescentar `Alert, Button` ao import de `@betinhos/ui`; `import { acessosDe, useAcessos } from './AcessosProvider'`; `import { menuVisivel } from '../nav/acessosMenu'`.
2. Trocar a linha do `groups` por:

```tsx
const acesso = useAcessos()
const visivel = useMemo(() => menuVisivel(acessosDe(acesso)), [acesso])
const groups = useMemo(() => visivel.map((group) => toNavGroup(group, entityLabels, badges)), [visivel, entityLabels, badges])
```

3. No lugar de `{children}` dentro do `<Shell>`:

```tsx
{acesso.status === 'erro' ? (
  <Alert tone="warning" title="Não foi possível carregar seus acessos" action={<Button variant="secondary" onClick={acesso.recarregar}>Tentar de novo</Button>}>
    O menu mostra só as telas liberadas para todos.
  </Alert>
) : null}
{children}
```

Se sobrar import de `MENU` sem uso além do `brand.href`, mantenha (ainda é usado ali).

- [ ] **Passo 4: rodar**

```bash
(cd apps/shell && npx vitest run src/app/AppShell 2>&1 | tail -8)
(cd apps/shell && npx tsc --noEmit 2>&1 | tail -8)
```

Esperado: os testes novos e os antigos do `AppShell` verdes (sem provider o contexto vale `TODOS`).

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/app/AppShell.tsx apps/shell/src/app/AppShell.acessos.test.tsx
git commit -m "feat(acessos): menu mostra só o que o perfil alcança e avisa quando a leitura falha"
```

---

### Tarefa 5: guarda de rota, provider no `App`, badge e Início

**Arquivos:**
- Modificar: `apps/shell/src/app/RouteLayout.tsx`, `apps/shell/src/App.tsx`, `apps/shell/src/app/useDocumentosBadge.ts`, `apps/shell/src/app/useDocumentosBadge.test.ts`, `apps/shell/src/pages/inicio/InicioPage.tsx`
- Criar: `apps/shell/src/app/RouteLayout.acessos.test.tsx`, `apps/shell/src/pages/inicio/InicioSemAcesso.tsx`, `apps/shell/src/pages/inicio/InicioSemAcesso.test.tsx`

**Interfaces:**
- Consome: `useAcessos`, `AcessosProvider`, `AcessosContext`, `acessosDe` (tarefa 3); `perfisDoItem` (tarefa 3); `temAlgum`, `semModulos`, `PERFIL_LABEL` (tarefa 2); `PageFallback` de `./routes`.
- Produz: `useDocumentosBadge(host, habilitado = true)`; `InicioSemAcesso()`.

- [ ] **Passo 1: teste da guarda (falha)**

`apps/shell/src/app/RouteLayout.acessos.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findItem } from '../nav/menu'
import { AcessosContext, type ValorAcessos } from './AcessosProvider'
import { RouteLayout } from './RouteLayout'
import { lerPapeis } from './acessos'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })
vi.mock('../pages/despesas/DespesasPage', () => ({ DespesasPage: () => <p>Tela de despesas</p> }))

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function rota(id: string, valor: ValorAcessos) {
  const found = findItem(id)!
  return render(
    <AcessosContext.Provider value={valor}>
      <RouteLayout host={{ mode: 'mock' }} group={found.group} item={found.item} label={found.item.label ?? id} />
    </AcessosContext.Provider>,
  )
}

describe('guarda de perfil', () => {
  it('sem o perfil: "Sem acesso a este módulo", com o nome do perfil, e a tela não monta', async () => {
    rota('despesas-operacionais', { status: 'pronto', acessos: lerPapeis(['Perfil - Frota - Operador']), recarregar: () => {} })
    expect(screen.getByText('Sem acesso a este módulo')).toBeTruthy()
    expect(screen.getByText(/Esta tela pede o perfil Financeiro\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ir para a Página Inicial' })).toBeTruthy()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Tela de despesas')).toBeNull()
  })

  it('com o perfil a tela abre', async () => {
    rota('despesas-operacionais', { status: 'pronto', acessos: lerPapeis(['Perfil - Financeiro - Operador']), recarregar: () => {} })
    expect(await screen.findByText('Tela de despesas')).toBeTruthy()
  })

  it('enquanto lê os acessos mostra o carregamento, sem montar a tela', () => {
    rota('despesas-operacionais', { status: 'carregando', recarregar: () => {} })
    expect(screen.getByRole('status', { name: /Carregando/ })).toBeTruthy()
    expect(screen.queryByText('Sem acesso a este módulo')).toBeNull()
  })

  it('falha na leitura: aviso com "Tentar de novo"', () => {
    const recarregar = vi.fn()
    rota('despesas-operacionais', { status: 'erro', recarregar })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(recarregar).toHaveBeenCalledOnce()
  })
})
```

Rodar: `(cd apps/shell && npx vitest run src/app/RouteLayout.acessos.test.tsx 2>&1 | tail -10)` — Esperado: 3 falhas (a tela abre sem guarda).

- [ ] **Passo 2: implementar a guarda**

Em `apps/shell/src/app/RouteLayout.tsx`:

1. Imports: acrescentar `Lock` ao import de `lucide-react`; `Button` ao de `@betinhos/ui`; `import { useAcessos } from './AcessosProvider'`; `import { PERFIL_LABEL, temAlgum } from './acessos'`; `import { perfisDoItem } from '../nav/acessosMenu'` (o `PageFallback` já vem de `./routes`).
2. Primeira linha do corpo do componente (antes do `if (!item)`): `const acesso = useAcessos()`.
3. Logo depois do bloco `if (!item) ...`:

```tsx
const perfis = perfisDoItem(item.id)
if (perfis) {
  if (acesso.status === 'carregando') return <PageFallback title={label} />
  if (acesso.status === 'erro') {
    return (
      <PageLayout eyebrow={group?.label} title={label}>
        <EmptyState className="surface" align="start" icon={<PlugZap size={36} />} title="Não foi possível carregar seus acessos" action={<Button variant="primary" onClick={acesso.recarregar}>Tentar de novo</Button>}>
          Sem essa leitura não dá para saber se você alcança esta tela.
        </EmptyState>
      </PageLayout>
    )
  }
  if (!temAlgum(acesso.acessos, perfis)) {
    return (
      <PageLayout eyebrow={group?.label} title={label}>
        <EmptyState className="surface" align="start" icon={<Lock size={36} />} title="Sem acesso a este módulo" action={<a className={buttonClassName({ variant: 'primary' })} href={hrefFor(DEFAULT_ITEM.id)}>Ir para a Página Inicial</a>}>
          Esta tela pede o perfil {perfis.map((p) => PERFIL_LABEL[p]).join(' ou ')}. Peça o acesso a quem administra os acessos do sistema.
        </EmptyState>
      </PageLayout>
    )
  }
}
```

A guarda fica antes de qualquer `kind`, então nenhuma chamada de dados da tela acontece.

- [ ] **Passo 3: rodar**

`(cd apps/shell && npx vitest run src/app/RouteLayout 2>&1 | tail -8)` — Esperado: testes novos e o `RouteLayout.test.tsx` antigo verdes.

- [ ] **Passo 4: badge de documentos só com perfil**

Em `apps/shell/src/app/useDocumentosBadge.ts`: assinatura `export function useDocumentosBadge(host: Host, habilitado = true)`; primeira linha do efeito: `if (!habilitado) { setTotal(null); return }`; dependências `[host, habilitado]`.

Em `apps/shell/src/app/useDocumentosBadge.test.ts`, acrescentar (use o mesmo mock de fonte que o arquivo já tem e confira que a contagem não foi pedida):

```ts
it('desabilitado não consulta e devolve null', () => {
  const { result } = renderHook(() => useDocumentosBadge({ mode: 'mock' }, false))
  expect(result.current).toBeNull()
})
```

- [ ] **Passo 5: provider no `App`**

Em `apps/shell/src/App.tsx`, o `App` atual vira `Sistema({ host })` (mesmo corpo, sem o `useMemo(createHost, [])`), e o novo `App` fica:

```tsx
export function App() {
  const host = useMemo(createHost, [])
  return (
    <AcessosProvider host={host}>
      <Sistema host={host} />
    </AcessosProvider>
  )
}
```

Dentro de `Sistema`, a linha do badge vira:

```tsx
const acesso = useAcessos()
const docsUrgentes = useDocumentosBadge(host, acesso.status === 'pronto' && temAlgum(acesso.acessos, perfisDoItem('documentos')))
```

Imports novos: `AcessosProvider, useAcessos` de `./app/AcessosProvider`; `temAlgum` de `./app/acessos`; `perfisDoItem` de `./nav/acessosMenu`; `type Host` de `./host` se ainda não estiver.

- [ ] **Passo 6: Início de quem só tem o Base (teste, depois código)**

`apps/shell/src/pages/inicio/InicioSemAcesso.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AcessosContext } from '../../app/AcessosProvider'
import { NENHUM } from '../../app/acessos'
import { InicioPage } from './InicioPage'

afterEach(cleanup)

it('quem só tem o Base vê a quem pedir acesso, sem carregar os blocos do Início', () => {
  render(
    <AcessosContext.Provider value={{ status: 'pronto', acessos: NENHUM, recarregar: () => {} }}>
      <InicioPage host={{ mode: 'mock' }} />
    </AcessosContext.Provider>,
  )
  expect(screen.getByText('Você ainda não tem acesso aos módulos')).toBeTruthy()
  expect(screen.getByText(/Peça ao TI da Betinhos/)).toBeTruthy()
})
```

`apps/shell/src/pages/inicio/InicioSemAcesso.tsx`:

```tsx
import { EmptyState, useShellHeader } from '@betinhos/ui'
import { Lock } from 'lucide-react'

export function InicioSemAcesso() {
  useShellHeader({ title: 'Página Inicial' })
  return (
    <div className="page">
      <EmptyState className="surface" align="start" icon={<Lock size={36} />} title="Você ainda não tem acesso aos módulos">
        Peça ao TI da Betinhos, ou a quem administra os acessos do sistema, o perfil da sua área. O Planner continua disponível no menu.
      </EmptyState>
    </div>
  )
}
```

Em `apps/shell/src/pages/inicio/InicioPage.tsx`: renomear a função atual para `InicioCompleto` (sem `export`) e acrescentar:

```tsx
export function InicioPage({ host }: { host: Host }) {
  const acesso = useAcessos()
  if (acesso.status === 'carregando') return <PageFallback title="Página Inicial" />
  if (acesso.status === 'pronto' && semModulos(acesso.acessos)) return <InicioSemAcesso />
  return <InicioCompleto host={host} />
}
```

Imports: `useAcessos` de `../../app/AcessosProvider`; `semModulos` de `../../app/acessos`; `PageFallback` de `../../app/routes`; `InicioSemAcesso` de `./InicioSemAcesso`.

- [ ] **Passo 7: rodar tudo do shell tocado**

```bash
(cd apps/shell && npx vitest run src/app src/nav src/pages/inicio 2>&1 | tail -10)
(cd apps/shell && npx tsc --noEmit 2>&1 | tail -8)
```

Esperado: verde.

- [ ] **Passo 8: commit**

```bash
git add apps/shell/src/App.tsx apps/shell/src/app/RouteLayout.tsx apps/shell/src/app/RouteLayout.acessos.test.tsx apps/shell/src/app/useDocumentosBadge.ts apps/shell/src/app/useDocumentosBadge.test.ts apps/shell/src/pages/inicio
git commit -m "feat(acessos): rota sem o perfil mostra 'Sem acesso a este módulo' e o Início explica a quem pedir"
```

---

### Tarefa 6: domínio e fonte de dados da tela Acessos

**Arquivos:**
- Criar: `apps/shell/src/pages/acessos/domain/types.ts`, `domain/perfis.ts`, `domain/perfis.test.ts`, `domain/lista.ts`, `domain/lista.test.ts`, `data/source.ts`, `data/source.test.ts`

**Interfaces:**
- Consome (Tarefa 2): `AREAS`, `Area`, `Nivel`, `Perfil`, `PerfisDeArea`, `AREA_LABEL`, `NIVEL_LABEL`, `PERFIL_LABEL`, `nomeDoPapel`, `ehAdmin`, `perfisDosPapeis` de `apps/shell/src/app/acessos.ts`. Do plano 1: Custom API `cr40f_AcessoDefinirPerfis` (entrada `Usuario` Guid, `Perfis` String JSON) e tabela `cr40f_acessohistoricos`.
- Produz: `PerfisPessoa`, `VAZIO`, `ItemPedido`, `Pessoa`, `Historico`, `ErroApi`, `Dados`; `paraPedido`, `doPedido`, `iguais`, `oQueMuda`, `rotulos`, `erroDaApi`, `perfisIndisponiveis`; `TELA`, `PESSOA_COLUMNS`, `pessoaFields`, `readPessoa`, `sortPessoas`, `pessoaKeywordText`, `builtinViews`; `Source`, `createSource(host)`, `MOCK_EU`.

- [ ] **Passo 1: tipos**

`apps/shell/src/pages/acessos/domain/types.ts`:

```ts
import type { Area, Nivel, PerfisDeArea } from '../../../app/acessos'

/** Perfis de uma pessoa como a tela mostra e edita: só os papéis `Perfil - ...` diretos (o Base não aparece). */
export type PerfisPessoa = { areas: PerfisDeArea; acessos: boolean }
export const VAZIO: PerfisPessoa = { areas: {}, acessos: false }

/** Item do JSON que a Custom API recebe e que o histórico guarda. */
export type ItemPedido = { perfil: Area; nivel: Nivel } | { perfil: 'acessos' }

export type Pessoa = {
  id: string
  nome: string
  email: string
  perfis: PerfisPessoa
  /** Administrador do Sistema (direto ou por equipe): vale como todos os perfis e a tela não edita. */
  admin: boolean
  alteradoEm: Date | null
}

export type Historico = { id: string; usuarioId: string; usuario: string; alteradoPor: string; antes: PerfisPessoa; depois: PerfisPessoa; quando: Date | null }
export type Dados = { pessoas: Pessoa[]; historico: Historico[]; euId: string }
export type ErroApi = { codigo: string | null; mensagem: string }
```

- [ ] **Passo 2: testes que falham**

`apps/shell/src/pages/acessos/domain/perfis.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { doPedido, erroDaApi, iguais, oQueMuda, paraPedido, perfisIndisponiveis, rotulos } from './perfis'
import { VAZIO, type PerfisPessoa } from './types'

const fin: PerfisPessoa = { areas: { financeiro: 'operador' }, acessos: false }
const finGestor: PerfisPessoa = { areas: { financeiro: 'gestor', rh: 'operador' }, acessos: true }

describe('pedido', () => {
  it('monta o JSON na ordem das áreas, com o Administrador de acessos no fim', () => {
    expect(paraPedido(finGestor)).toEqual([{ perfil: 'financeiro', nivel: 'gestor' }, { perfil: 'rh', nivel: 'operador' }, { perfil: 'acessos' }])
    expect(paraPedido(VAZIO)).toEqual([])
  })
  it('lê o JSON do histórico e tolera lixo', () => {
    expect(doPedido(JSON.stringify(paraPedido(finGestor)))).toEqual(finGestor)
    expect(doPedido('nao é json')).toEqual(VAZIO)
    expect(doPedido(null)).toEqual(VAZIO)
    expect(doPedido('[{"perfil":"desconhecido"},{"perfil":"frota"}]')).toEqual({ areas: { frota: 'operador' }, acessos: false })
  })
})

describe('comparação', () => {
  it('iguais ignora a ordem das chaves', () => {
    expect(iguais(fin, { acessos: false, areas: { financeiro: 'operador' } })).toBe(true)
    expect(iguais(fin, finGestor)).toBe(false)
  })
  it('oQueMuda descreve cada diferença', () => {
    expect(oQueMuda(fin, finGestor)).toEqual(['Financeiro: Operador → Gestor', 'RH: sem acesso → Operador', 'Administrador de acessos: não → sim'])
    expect(oQueMuda(fin, VAZIO)).toEqual(['Financeiro: Operador → sem acesso'])
    expect(oQueMuda(fin, fin)).toEqual([])
  })
  it('rotulos para os chips', () => {
    expect(rotulos(finGestor)).toEqual(['Financeiro · Gestor', 'RH · Operador', 'Administrador de acessos'])
    expect(rotulos(VAZIO)).toEqual([])
  })
})

describe('erro da Custom API', () => {
  it('separa código e mensagem', () => {
    expect(erroDaApi(new Error('400 PROPRIO_ACESSO: Ninguém altera o próprio acesso.'))).toEqual({ codigo: 'PROPRIO_ACESSO', mensagem: 'Ninguém altera o próprio acesso.' })
    expect(erroDaApi(new Error('Falha de rede'))).toEqual({ codigo: null, mensagem: 'Falha de rede' })
  })
  it('acha os perfis que o ambiente ainda não tem', () => {
    const erro = erroDaApi(new Error('PERFIL_INDISPONIVEL: Perfil ainda não publicado neste ambiente: Perfil - Frota - Gestor; Perfil - Administrador de acessos.'))
    expect(perfisIndisponiveis(erro)).toEqual(['frota', 'acessos'])
    expect(perfisIndisponiveis({ codigo: 'SEM_PERMISSAO', mensagem: 'Perfil - Frota - Gestor' })).toEqual([])
  })
})
```

`apps/shell/src/pages/acessos/domain/lista.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pessoaKeywordText, readPessoa, sortPessoas } from './lista'
import type { Pessoa } from './types'

const p = (nome: string, extra: Partial<Pessoa> = {}): Pessoa => ({ id: nome, nome, email: `${nome.toLowerCase()}@exemplo.test`, perfis: { areas: {}, acessos: false }, admin: false, alteradoEm: null, ...extra })

describe('lista de acessos', () => {
  it('lê o nível de cada área para o filtro', () => {
    const pessoa = p('Bruno', { perfis: { areas: { financeiro: 'gestor' }, acessos: true } })
    expect(readPessoa(pessoa, 'financeiro')).toBe('gestor')
    expect(readPessoa(pessoa, 'rh')).toBe('nenhum')
    expect(readPessoa(pessoa, 'acessos')).toBe('sim')
    expect(readPessoa(p('Carla', { admin: true }), 'admin')).toBe('sim')
  })
  it('ordena por nome e deixa sem data por último', () => {
    const lista = [p('Carla'), p('Ana', { alteradoEm: new Date('2026-11-20T12:00:00Z') }), p('Bruno', { alteradoEm: new Date('2026-11-22T12:00:00Z') })]
    expect(sortPessoas(lista, 'nome', 'asc').map((x) => x.nome)).toEqual(['Ana', 'Bruno', 'Carla'])
    expect(sortPessoas(lista, 'alterado', 'desc').map((x) => x.nome)).toEqual(['Bruno', 'Ana', 'Carla'])
  })
  it('a busca acha por nome, e-mail e perfil', () => {
    const texto = pessoaKeywordText(p('Bruno', { perfis: { areas: { frota: 'operador' }, acessos: false } }))
    expect(texto).toContain('bruno@exemplo.test')
    expect(texto).toContain('Frota · Operador')
  })
})
```

`apps/shell/src/pages/acessos/data/source.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import type { Host } from '../../../host'
import { MOCK_EU, createSource } from './source'

afterEach(() => window.history.replaceState(null, '', '/'))

const real = (respostas: Record<string, unknown>, pedidos: { path: string; body?: string }[] = []) => ({
  mode: 'dataverse',
  client: {
    getAll: async (path: string) => { pedidos.push({ path }); const chave = Object.keys(respostas).find((k) => path.startsWith(k)); if (!chave) throw new Error(`caminho inesperado: ${path}`); return respostas[chave] },
    request: async (path: string, init?: { body?: string }) => { pedidos.push({ path, body: init?.body }); if (path === 'WhoAmI') return { UserId: '{AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA}' }; return {} },
  },
}) as unknown as Host

describe('fonte real', () => {
  const respostas = {
    systemusers: [
      { systemuserid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullname: 'Ana Exemplo', internalemailaddress: 'ana@exemplo.test', systemuserroles_association: [{ name: 'Perfil - Base' }] },
      { systemuserid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', fullname: 'Bruno Modelo', internalemailaddress: 'bruno@exemplo.test', systemuserroles_association: [{ name: 'Perfil - Financeiro - Operador' }, { name: 'Perfil - Base' }] },
    ],
    teams: [{ name: 'Equipe', teamroles_association: [{ name: 'Administrador do Sistema' }], teammembership_association: [{ systemuserid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }] }],
    cr40f_acessohistoricos: [{
      cr40f_acessohistoricoid: 'h1', _cr40f_usuario_value: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', _cr40f_alteradopor_value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      cr40f_perfisantes: '[]', cr40f_perfisdepois: '[{"perfil":"financeiro","nivel":"operador"}]', createdon: '2026-11-22T12:00:00Z',
    }],
  }

  it('monta pessoas (admin por equipe), histórico com nomes e a última alteração', async () => {
    const dados = await createSource(real(respostas)).load()
    expect(dados.euId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(dados.pessoas.map((x) => [x.nome, x.admin, x.perfis.areas])).toEqual([['Ana Exemplo', true, {}], ['Bruno Modelo', false, { financeiro: 'operador' }]])
    expect(dados.pessoas[1].alteradoEm?.toISOString()).toBe('2026-11-22T12:00:00.000Z')
    expect(dados.historico[0]).toMatchObject({ usuario: 'Bruno Modelo', alteradoPor: 'Ana Exemplo', depois: { areas: { financeiro: 'operador' }, acessos: false } })
  })

  it('definir chama a Custom API com Usuario e Perfis em JSON', async () => {
    const pedidos: { path: string; body?: string }[] = []
    await createSource(real(respostas, pedidos)).definir('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { areas: { frota: 'gestor' }, acessos: false })
    const chamada = pedidos.find((x) => x.path === 'cr40f_AcessoDefinirPerfis')
    expect(JSON.parse(chamada?.body ?? '{}')).toEqual({ Usuario: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', Perfis: '[{"perfil":"frota","nivel":"gestor"}]' })
  })
})

describe('fonte mock', () => {
  const mock = () => createSource({ mode: 'mock' } as Host)

  it('grava, registra no histórico e recusa o próprio acesso', async () => {
    const source = mock()
    const antes = await source.load()
    const alvo = antes.pessoas.find((x) => x.nome === 'Bruno Modelo')!
    await source.definir(alvo.id, { areas: { financeiro: 'gestor' }, acessos: false })
    const depois = await source.load()
    expect(depois.pessoas.find((x) => x.id === alvo.id)?.perfis.areas).toEqual({ financeiro: 'gestor' })
    expect(depois.historico[0]).toMatchObject({ usuario: 'Bruno Modelo', alteradoPor: 'Ana Exemplo' })
    await expect(source.definir(MOCK_EU, { areas: {}, acessos: false })).rejects.toThrow('PROPRIO_ACESSO: Ninguém altera o próprio acesso.')
  })

  it('?falha=salvar simula perfil ainda não publicado', async () => {
    window.history.replaceState(null, '', '/?falha=salvar')
    const source = mock()
    const alvo = (await source.load()).pessoas.find((x) => x.nome === 'Bruno Modelo')!
    await expect(source.definir(alvo.id, { areas: { frota: 'gestor' }, acessos: false })).rejects.toThrow('PERFIL_INDISPONIVEL: Perfil ainda não publicado neste ambiente: Perfil - Frota - Gestor.')
  })
})
```

O teste da fonte usa `window`: acrescente `// @vitest-environment jsdom` na primeira linha de `source.test.ts`.

- [ ] **Passo 3: rodar e ver falhar**

`(cd apps/shell && npx vitest run src/pages/acessos 2>&1 | tail -10)` — Esperado: os três arquivos falham por módulo inexistente.

- [ ] **Passo 4: `domain/perfis.ts`**

```ts
import { AREAS, AREA_LABEL, NIVEL_LABEL, PERFIL_LABEL, nomeDoPapel, type Area, type Nivel, type Perfil, type PerfisDeArea } from '../../../app/acessos'
import type { ErroApi, ItemPedido, PerfisPessoa } from './types'

/** JSON do pedido (e do histórico): áreas na ordem fixa, Administrador de acessos no fim. Lista vazia = só o Base. */
export function paraPedido(p: PerfisPessoa): ItemPedido[] {
  const itens: ItemPedido[] = AREAS.flatMap((area) => { const nivel = p.areas[area]; return nivel ? [{ perfil: area, nivel }] : [] })
  return p.acessos ? [...itens, { perfil: 'acessos' }] : itens
}

/** Lê o JSON gravado no histórico; texto inválido ou item desconhecido não derruba a tela. */
export function doPedido(texto: unknown): PerfisPessoa {
  let itens: unknown = null
  try { itens = typeof texto === 'string' ? JSON.parse(texto) : null } catch { itens = null }
  const areas: PerfisDeArea = {}
  let acessos = false
  for (const item of Array.isArray(itens) ? (itens as { perfil?: unknown; nivel?: unknown }[]) : []) {
    if (item?.perfil === 'acessos') acessos = true
    else if ((AREAS as readonly unknown[]).includes(item?.perfil)) areas[item.perfil as Area] = item.nivel === 'gestor' ? 'gestor' : 'operador'
  }
  return { areas, acessos }
}

export const iguais = (a: PerfisPessoa, b: PerfisPessoa) => a.acessos === b.acessos && AREAS.every((area) => a.areas[area] === b.areas[area])

const nivelTexto = (nivel: Nivel | undefined) => (nivel ? NIVEL_LABEL[nivel] : 'sem acesso')
const simNao = (v: boolean) => (v ? 'sim' : 'não')

/** Uma linha por diferença, para o resumo "O que muda ao salvar" e para o histórico. */
export function oQueMuda(antes: PerfisPessoa, depois: PerfisPessoa): string[] {
  const linhas = AREAS.filter((area) => antes.areas[area] !== depois.areas[area]).map((area) => `${AREA_LABEL[area]}: ${nivelTexto(antes.areas[area])} → ${nivelTexto(depois.areas[area])}`)
  if (antes.acessos !== depois.acessos) linhas.push(`${PERFIL_LABEL.acessos}: ${simNao(antes.acessos)} → ${simNao(depois.acessos)}`)
  return linhas
}

/** Texto dos chips da lista. */
export function rotulos(p: PerfisPessoa): string[] {
  const areas = AREAS.flatMap((area) => { const nivel = p.areas[area]; return nivel ? [`${AREA_LABEL[area]} · ${NIVEL_LABEL[nivel]}`] : [] })
  return p.acessos ? [...areas, PERFIL_LABEL.acessos] : areas
}

/** O plugin responde `CODIGO: mensagem`; o cliente do Dataverse embrulha isso em outros textos. */
export function erroDaApi(reason: unknown): ErroApi {
  const texto = reason instanceof Error ? reason.message : String(reason)
  const m = /([A-Z_]{4,}): ([^|]*)/.exec(texto)
  return m ? { codigo: m[1], mensagem: m[2].trim() } : { codigo: null, mensagem: texto }
}

/** Perfis citados num `PERFIL_INDISPONIVEL` (a mensagem traz os nomes dos papéis que faltam no ambiente). */
export function perfisIndisponiveis(erro: ErroApi): Perfil[] {
  if (erro.codigo !== 'PERFIL_INDISPONIVEL') return []
  const areas: Perfil[] = AREAS.filter((area) => erro.mensagem.includes(nomeDoPapel(area, 'operador')) || erro.mensagem.includes(nomeDoPapel(area, 'gestor')))
  return erro.mensagem.includes('Perfil - Administrador de acessos') ? [...areas, 'acessos'] : areas
}
```

- [ ] **Passo 5: `domain/lista.ts`**

```ts
import type { FilterField, StoredView, ViewColumnDef } from '@betinhos/ui'
import { AREAS, AREA_LABEL, PERFIL_LABEL } from '../../../app/acessos'
import { rotulos } from './perfis'
import type { Pessoa } from './types'

export const TELA = 'acessos'

/** Colunas na ordem padrão; a primeira (Pessoa) é fixa. */
export const PESSOA_COLUMNS: ViewColumnDef[] = [
  { key: 'nome', label: 'Pessoa' },
  { key: 'email', label: 'E-mail' },
  { key: 'perfis', label: 'Perfis' },
  { key: 'alterado', label: 'Última alteração' },
]

const NIVEIS = [{ value: 'nenhum', label: 'Sem acesso' }, { value: 'operador', label: 'Operador' }, { value: 'gestor', label: 'Gestor' }]
const SIM_NAO = [{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]

/** Filtro por perfil: um campo por área, mais Administrador de acessos e Administrador do Sistema. */
export function pessoaFields(): FilterField[] {
  return [
    { key: 'nome', label: 'Pessoa', kind: 'text' },
    { key: 'email', label: 'E-mail', kind: 'text' },
    ...AREAS.map((area): FilterField => ({ key: area, label: AREA_LABEL[area], kind: 'choice', options: NIVEIS })),
    { key: 'acessos', label: PERFIL_LABEL.acessos, kind: 'choice', options: SIM_NAO },
    { key: 'admin', label: 'Administrador do Sistema', kind: 'choice', options: SIM_NAO },
    { key: 'alterado', label: 'Última alteração', kind: 'date' },
  ]
}

export function readPessoa(p: Pessoa, key: string): unknown {
  switch (key) {
    case 'nome': return p.nome
    case 'email': return p.email
    case 'perfis': return rotulos(p.perfis).join(', ')
    case 'acessos': return p.perfis.acessos ? 'sim' : 'nao'
    case 'admin': return p.admin ? 'sim' : 'nao'
    case 'alterado': return p.alteradoEm ? p.alteradoEm.toISOString().slice(0, 10) : null
    default: return (AREAS as readonly string[]).includes(key) ? (p.perfis.areas[key as (typeof AREAS)[number]] ?? 'nenhum') : null
  }
}

export const pessoaKeywordText = (p: Pessoa) => [p.nome, p.email, ...rotulos(p.perfis), p.admin ? 'Administrador do Sistema' : ''].filter(Boolean).join(' ')

/** Ordena pela coluna da visão; vazios por último. */
export function sortPessoas(list: Pessoa[], key: string, dir: 'asc' | 'desc') {
  const value = (p: Pessoa) => (key === 'alterado' ? (p.alteradoEm?.toISOString() ?? '') : key === 'email' ? p.email : key === 'perfis' ? rotulos(p.perfis).join(', ') : p.nome)
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const x = value(a)
    const y = value(b)
    if (!x || !y) return x === y ? 0 : x ? -1 : 1
    return x.localeCompare(y, 'pt-BR') * sign
  })
}

export const builtinViews = (): StoredView[] => []
```

- [ ] **Passo 6: `data/source.ts`**

```ts
import { cleanId, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { ehAdmin, perfisDosPapeis } from '../../../app/acessos'
import { latenciaMock } from '../../../app/latenciaMock'
import { mockFalhaCarga, param } from '../../../app/mockVolume'
import { doPedido, iguais, paraPedido } from '../domain/perfis'
import type { Dados, Historico, PerfisPessoa, Pessoa } from '../domain/types'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  load: () => Promise<Dados>
  /** Troca os perfis da pessoa pela Custom API (única porta de escrita). Erro vem como `CODIGO: mensagem`. */
  definir: (usuarioId: string, perfis: PerfisPessoa) => Promise<void>
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const date = (v: unknown) => { if (typeof v !== 'string' || !v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }
const nomes = (v: unknown) => (Array.isArray(v) ? (v as Row[]).map((r) => str(r.name)) : [])

// Só gente: sem conta de aplicação, sem usuário desativado e sem conta interna sem Entra.
const PESSOAS = `systemusers?$select=fullname,internalemailaddress,systemuserid&$filter=${encodeURIComponent('isdisabled eq false and applicationid eq null and azureactivedirectoryobjectid ne null')}&$expand=systemuserroles_association($select=name)&$orderby=fullname asc`
const EQUIPES = 'teams?$select=name&$expand=teamroles_association($select=name),teammembership_association($select=systemuserid)'
const HISTORICO = `cr40f_acessohistoricos?$select=cr40f_acessohistoricoid,_cr40f_usuario_value,_cr40f_alteradopor_value,cr40f_perfisantes,cr40f_perfisdepois,createdon&$orderby=${encodeURIComponent('createdon desc')}`

/** Monta a tela a partir das três consultas. O administrador costuma vir por equipe; os perfis, só dos papéis diretos. */
export function montar(usuarios: Row[], equipes: Row[], historico: Row[], euId: string): Dados {
  const adminsPorEquipe = new Set<string>()
  for (const equipe of equipes) {
    if (!ehAdmin(nomes(equipe.teamroles_association))) continue
    for (const m of (Array.isArray(equipe.teammembership_association) ? (equipe.teammembership_association as Row[]) : [])) adminsPorEquipe.add(cleanId(str(m.systemuserid)))
  }
  const nomePorId = new Map<string, string>()
  const base = usuarios.map((u) => {
    const id = cleanId(str(u.systemuserid))
    const papeis = nomes(u.systemuserroles_association)
    nomePorId.set(id, str(u.fullname))
    return { id, nome: str(u.fullname), email: str(u.internalemailaddress), perfis: perfisDosPapeis(papeis), admin: ehAdmin(papeis) || adminsPorEquipe.has(id) }
  })
  const quem = (id: string) => nomePorId.get(id) ?? 'Usuário desativado'
  const linhas: Historico[] = historico.map((h) => {
    const usuarioId = cleanId(str(h._cr40f_usuario_value))
    return { id: str(h.cr40f_acessohistoricoid), usuarioId, usuario: quem(usuarioId), alteradoPor: quem(cleanId(str(h._cr40f_alteradopor_value))), antes: doPedido(h.cr40f_perfisantes), depois: doPedido(h.cr40f_perfisdepois), quando: date(h.createdon) }
  })
  // O histórico vem do mais novo para o mais velho: a primeira linha de cada pessoa é a última alteração.
  const ultima = new Map<string, Date | null>()
  for (const h of linhas) if (!ultima.has(h.usuarioId)) ultima.set(h.usuarioId, h.quando)
  const pessoas: Pessoa[] = base.map((p) => ({ ...p, alteradoEm: ultima.get(p.id) ?? null }))
  return { pessoas, historico: linhas, euId }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, latenciaMock(ms)))

export const MOCK_EU = '11111111-1111-4111-8111-111111111111'
const MOCK_PESSOAS: Pessoa[] = [
  { id: MOCK_EU, nome: 'Ana Exemplo', email: 'ana@exemplo.test', perfis: { areas: {}, acessos: false }, admin: true, alteradoEm: null },
  { id: '22222222-2222-4222-8222-222222222222', nome: 'Bruno Modelo', email: 'bruno@exemplo.test', perfis: { areas: { financeiro: 'operador' }, acessos: false }, admin: false, alteradoEm: new Date('2026-11-20T15:30:00Z') },
  { id: '33333333-3333-4333-8333-333333333333', nome: 'Carla Amostra', email: 'carla@exemplo.test', perfis: { areas: { operacional: 'gestor', frota: 'operador' }, acessos: true }, admin: false, alteradoEm: new Date('2026-11-18T13:00:00Z') },
  { id: '44444444-4444-4444-8444-444444444444', nome: 'Diego Teste', email: 'diego@exemplo.test', perfis: { areas: {}, acessos: false }, admin: false, alteradoEm: null },
]

let seq = 0
function createMockSource(): Source {
  const pessoas = MOCK_PESSOAS.map((p) => ({ ...p }))
  const historico: Historico[] = [
    { id: 'h-2', usuarioId: pessoas[1].id, usuario: pessoas[1].nome, alteradoPor: 'Ana Exemplo', antes: { areas: {}, acessos: false }, depois: pessoas[1].perfis, quando: pessoas[1].alteradoEm },
    { id: 'h-1', usuarioId: pessoas[2].id, usuario: pessoas[2].nome, alteradoPor: 'Ana Exemplo', antes: { areas: { operacional: 'operador' }, acessos: false }, depois: pessoas[2].perfis, quando: pessoas[2].alteradoEm },
  ]
  return {
    mock: true,
    async load() {
      await wait(300)
      if (mockFalhaCarga()) throw new Error('Falha simulada na carga.')
      return { pessoas: pessoas.map((p) => ({ ...p })), historico: [...historico], euId: MOCK_EU }
    },
    async definir(usuarioId, perfis) {
      await wait(400)
      if (usuarioId === MOCK_EU) throw new Error('PROPRIO_ACESSO: Ninguém altera o próprio acesso.')
      if (param('falha') === 'salvar') throw new Error('PERFIL_INDISPONIVEL: Perfil ainda não publicado neste ambiente: Perfil - Frota - Gestor.')
      const pessoa = pessoas.find((p) => p.id === usuarioId)
      if (!pessoa) throw new Error('USUARIO_INVALIDO: Usuário não encontrado ou desativado.')
      if (iguais(pessoa.perfis, perfis)) return
      const quando = new Date()
      historico.unshift({ id: `h-novo-${++seq}`, usuarioId, usuario: pessoa.nome, alteradoPor: 'Ana Exemplo', antes: pessoa.perfis, depois: perfis, quando })
      pessoa.perfis = perfis
      pessoa.alteradoEm = quando
    },
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  const { client } = host
  return {
    mock: false,
    async load() {
      const [eu, usuarios, equipes, historico] = await Promise.all([
        client.request<{ UserId: string }>('WhoAmI'),
        client.getAll(PESSOAS),
        client.getAll(EQUIPES),
        client.getAll(HISTORICO),
      ])
      return montar(usuarios, equipes, historico, cleanId(eu.UserId))
    },
    async definir(usuarioId, perfis) {
      await client.request('cr40f_AcessoDefinirPerfis', { method: 'POST', body: JSON.stringify({ Usuario: usuarioId, Perfis: JSON.stringify(paraPedido(perfis)) }) })
    },
  }
}
```

Confira antes de seguir, lendo `packages/dataverse` (não presuma): (a) `client.request` aceita `{ method, body }` e já manda `Content-Type: application/json`; se não mandar, inclua o cabeçalho na chamada; (b) `param` lê `window.location.search` (é o que o teste do `?falha=salvar` usa); se ler do hash, ajuste o teste e o Vocabulário para o formato que ele lê; (c) `cr40f_acessohistoricos` e os nomes das colunas batem com a migration do plano 1 (`rg -n "acessohistorico" packages/deploy/migrations | head`).

- [ ] **Passo 7: rodar**

```bash
(cd apps/shell && npx vitest run src/pages/acessos 2>&1 | tail -10)
(cd apps/shell && npx tsc --noEmit 2>&1 | tail -8)
```

Esperado: 3 arquivos verdes, `tsc` sem saída.

- [ ] **Passo 8: commit**

```bash
git add apps/shell/src/pages/acessos
git commit -m "feat(acessos): domínio e fonte de dados da tela de Acessos (pessoas, perfis e histórico)"
```

---

### Tarefa 7: lista, histórico e gaveta de perfis

**Arquivos:**
- Criar: `apps/shell/src/pages/acessos/components/AcessosList.tsx`, `components/HistoricoLista.tsx`, `components/AcessoDrawer.tsx`, `components/AcessoDrawer.test.tsx`, `apps/shell/src/pages/acessos/acessos.css`

**Interfaces:**
- Consome (Tarefa 6): `Pessoa`, `Historico`, `PerfisPessoa`, `ErroApi`; `iguais`, `oQueMuda`, `rotulos`, `erroDaApi`, `perfisIndisponiveis`; `Source`. Da Tarefa 2: `AREAS`, `AREA_LABEL`, `PERFIL_LABEL`, `Area`, `Nivel`, `Perfil`. Da Tarefa 3: `useAcessos()` (o valor tem `acessos: Acessos`, com `admin: boolean`). Do shell: `ListTable` (`app/ListTable`), `openFromRow` (`pages/pagantes/components/PagantesList`).
- Produz: `AcessosTable`, `AcessosCards` (props `{ list, onOpen, loading?, view?, quickFilters?, footer?, empty? }`), `HistoricoLista` (props `{ itens: Historico[]; comPessoa?: boolean }`), `AcessoDrawer` (props `{ pessoa: Pessoa | null; euId: string; historico: Historico[]; source: Source; onClose: () => void; onSaved: () => void }`).

- [ ] **Passo 1: teste da gaveta que falha**

`apps/shell/src/pages/acessos/components/AcessoDrawer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '@betinhos/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Host } from '../../../host'
import { AcessosProvider } from '../../../app/AcessosProvider'
import { MOCK_EU, createSource } from '../data/source'
import type { Dados } from '../domain/types'
import { AcessoDrawer } from './AcessoDrawer'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const host = { mode: 'mock' } as Host

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

async function abrir(nome: string, busca = '') {
  window.history.replaceState(null, '', `/${busca}`)
  const source = createSource(host)
  const dados: Dados = await source.load()
  const pessoa = dados.pessoas.find((p) => p.nome === nome)!
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <AcessosProvider host={host}>
      <ToastProvider>
        <AcessoDrawer pessoa={pessoa} euId={MOCK_EU} historico={dados.historico} source={source} onClose={onClose} onSaved={onSaved} />
      </ToastProvider>
    </AcessosProvider>,
  )
  await screen.findByRole('dialog', { name: nome })
  return { source, pessoa, onClose, onSaved }
}

// Os grupos seguem a ordem de AREAS: Operacional, Financeiro, Frota, RH.
const radio = (rotulo: string, grupo: number) => screen.getAllByRole('radio', { name: rotulo })[grupo]

describe('AcessoDrawer', () => {
  it('mostra o que muda, salva pela fonte e avisa a página', async () => {
    const { source, pessoa, onSaved } = await abrir('Bruno Modelo')
    expect((radio('Operador', 1) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(radio('Gestor', 1))
    expect(screen.getByText('Financeiro: Operador → Gestor')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const depois = (await source.load()).pessoas.find((p) => p.id === pessoa.id)
    expect(depois?.perfis.areas).toEqual({ financeiro: 'gestor' })
  })

  it('a própria linha é só leitura', async () => {
    await abrir('Ana Exemplo')
    expect(screen.getByText('Ninguém altera o próprio acesso.')).toBeTruthy()
    expect((radio('Gestor', 0) as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
  })

  it('erro do servidor fica na gaveta, que continua aberta, e marca o perfil que falta', async () => {
    const { onClose, onSaved } = await abrir('Bruno Modelo', '?falha=salvar')
    fireEvent.click(radio('Gestor', 2))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/Perfil ainda não publicado neste ambiente/)).toBeTruthy()
    expect(screen.getByText('Ainda não publicado neste ambiente')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('fechar com alteração pergunta antes de descartar', async () => {
    const { onClose } = await abrir('Bruno Modelo')
    fireEvent.click(radio('Operador', 3))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('quem não é Administrador do Sistema não concede Administrador de acessos', async () => {
    await abrir('Bruno Modelo', '?acessos=acessos')
    expect((screen.getByRole('checkbox', { name: 'Administrador de acessos' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Só o Administrador do Sistema concede este perfil.')).toBeTruthy()
  })
})
```

Confira o papel ARIA do `Switch` do DS num teste existente (`rg -n "getByRole\('(switch|checkbox)'" apps/shell/src | head -3`) e use o mesmo no último teste. Sem `?acessos=`, o mock da Tarefa 2 devolve `TODOS` (administrador).

- [ ] **Passo 2: rodar e ver falhar**

`(cd apps/shell && npx vitest run src/pages/acessos/components 2>&1 | tail -10)` — Esperado: falha por módulo `./AcessoDrawer` inexistente.

- [ ] **Passo 3: `components/HistoricoLista.tsx`**

```tsx
import { EmptyState } from '@betinhos/ui'
import { History } from 'lucide-react'
import { oQueMuda } from '../domain/perfis'
import type { Historico } from '../domain/types'

const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const fmtQuando = (d: Date | null) => (d ? fmt.format(d) : '—')

/** Alterações de perfil, da mais nova para a mais velha. `comPessoa` mostra de quem é (histórico geral). */
export function HistoricoLista({ itens, comPessoa }: { itens: Historico[]; comPessoa?: boolean }) {
  if (!itens.length) return <EmptyState align="start" icon={<History size={36} />} title="Nenhuma alteração registrada">As alterações de perfil feitas por esta tela aparecem aqui.</EmptyState>
  return (
    <ol className="ac-hist" aria-label="Histórico de alterações">
      {itens.map((h) => {
        const linhas = oQueMuda(h.antes, h.depois)
        return (
          <li key={h.id} className="ac-hist__item">
            <span className="ac-hist__quando">{fmtQuando(h.quando)} · por {h.alteradoPor}</span>
            {comPessoa ? <strong>{h.usuario}</strong> : null}
            {linhas.length ? <ul className="ac-hist__linhas">{linhas.map((l) => <li key={l}>{l}</li>)}</ul> : <span className="ac-hist__quando">Sem diferença de perfil.</span>}
          </li>
        )
      })}
    </ol>
  )
}
```

- [ ] **Passo 4: `components/AcessosList.tsx`**

```tsx
import type { ReactNode } from 'react'
import { StatusBadge, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { ListTable } from '../../../app/ListTable'
import { openFromRow } from '../../pagantes/components/PagantesList'
import { rotulos } from '../domain/perfis'
import type { Pessoa } from '../domain/types'
import { fmtQuando } from './HistoricoLista'

type Props = { list: Pessoa[]; onOpen: (id: string) => void; loading?: boolean }
type TableProps = Props & { view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode }

/** Chips dos perfis. Administrador do Sistema vale como todos; sem perfil nenhum, a pessoa só abre o app. */
export function Perfis({ p }: { p: Pessoa }) {
  if (p.admin) return <span className="ac-chips"><StatusBadge tone="info">Administrador do Sistema</StatusBadge></span>
  const lista = rotulos(p.perfis)
  if (!lista.length) return <span className="ac-vazio">Só o Base</span>
  return <span className="ac-chips">{lista.map((r) => <StatusBadge key={r} tone="neutral">{r}</StatusBadge>)}</span>
}

function OpenName({ p, onOpen }: { p: Pessoa; onOpen: (id: string) => void }) {
  return <button type="button" className="ac-open" onClick={() => onOpen(p.id)}><strong>{p.nome || 'Sem nome'}</strong></button>
}

export function AcessosTable({ list, onOpen, loading, view, quickFilters, footer, empty }: TableProps) {
  const columns: TableColumn<Pessoa>[] = [
    { key: 'nome', header: 'Pessoa', label: 'Pessoa', sortable: true, defaultWidth: 260, width: 'minmax(180px, 1.2fr)', cell: (p) => <OpenName p={p} onOpen={onOpen} /> },
    { key: 'email', header: 'E-mail', label: 'E-mail', sortable: true, defaultWidth: 260, width: 'minmax(180px, 1.2fr)', hideBelow: 'compact', cell: (p) => p.email || '—' },
    { key: 'perfis', header: 'Perfis', label: 'Perfis', sortable: true, defaultWidth: 360, width: 'minmax(220px, 2fr)', cell: (p) => <Perfis p={p} /> },
    { key: 'alterado', header: 'Última alteração', label: 'Última alteração', sortable: true, defaultWidth: 170, width: 'minmax(140px, .8fr)', hideBelow: 'compact', cell: (p) => fmtQuando(p.alteradoEm) },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.ac-open')}>
      <ListTable className="ac-table" columns={columns} rows={list} rowKey={(p) => p.id} loading={loading} loadingLabel="Carregando pessoas" view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
    </div>
  )
}

export function AcessosCards({ list, onOpen }: Props) {
  return (
    <ul className="ac-cards" aria-label="Pessoas" onClick={(event) => openFromRow(event, '.ac-card', '.ac-card__open')}>
      {list.map((p) => (
        <li key={p.id} className="ac-card">
          <button type="button" className="ac-card__open" onClick={() => onOpen(p.id)}>
            <strong className="ac-card__name">{p.nome || 'Sem nome'}</strong>
            <span className="ac-card__meta">{p.email || 'Sem e-mail'}</span>
          </button>
          <Perfis p={p} />
        </li>
      ))}
    </ul>
  )
}
```

`StatusBadge tone="neutral"`: confira os tons aceitos (`rg -n "StatusBadge tone=" apps/shell/src | rg -o 'tone="[a-z]+"' | sort | uniq -c`); se `neutral` não existir, use o tom que as listas usam para rótulo sem estado.

- [ ] **Passo 5: `components/AcessoDrawer.tsx`**

```tsx
import { useState } from 'react'
import { Alert, Button, ChoiceGroup, Dialog, Drawer, Radio, StatusBadge, Switch, Tabs, useToast } from '@betinhos/ui'
import { AREAS, AREA_LABEL, PERFIL_LABEL, type Area, type Nivel, type Perfil } from '../../../app/acessos'
import { useAcessos } from '../../../app/AcessosProvider'
import type { Source } from '../data/source'
import { erroDaApi, iguais, oQueMuda, perfisIndisponiveis } from '../domain/perfis'
import type { ErroApi, Historico, PerfisPessoa, Pessoa } from '../domain/types'
import { HistoricoLista } from './HistoricoLista'

type Props = { pessoa: Pessoa | null; euId: string; historico: Historico[]; source: Source; onClose: () => void; onSaved: () => void }

/** Gaveta de uma pessoa. A ficha é remontada a cada pessoa (`key`), então o rascunho nunca vaza de uma para outra. */
export function AcessoDrawer({ pessoa, ...rest }: Props) {
  if (!pessoa) return null
  return <Ficha key={pessoa.id} pessoa={pessoa} {...rest} />
}

const OPCOES: { valor: Nivel | null; rotulo: string }[] = [{ valor: null, rotulo: 'Sem acesso' }, { valor: 'operador', rotulo: 'Operador' }, { valor: 'gestor', rotulo: 'Gestor' }]
const NAO_PUBLICADO = <StatusBadge tone="warning">Ainda não publicado neste ambiente</StatusBadge>

function Ficha({ pessoa, euId, historico, source, onClose, onSaved }: Omit<Props, 'pessoa'> & { pessoa: Pessoa }) {
  const toast = useToast()
  const { acessos } = useAcessos()
  const [aba, setAba] = useState('perfis')
  const [rascunho, setRascunho] = useState<PerfisPessoa>(pessoa.perfis)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<ErroApi | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  const proprio = pessoa.id === euId
  const travado = proprio || pessoa.admin || salvando
  const mudancas = oQueMuda(pessoa.perfis, rascunho)
  const alterado = !iguais(pessoa.perfis, rascunho)
  const faltam: Perfil[] = erro ? perfisIndisponiveis(erro) : []
  const daPessoa = historico.filter((h) => h.usuarioId === pessoa.id)

  const nivel = (area: Area, valor: Nivel | null) => setRascunho((r) => {
    const areas = { ...r.areas }
    if (valor) areas[area] = valor
    else delete areas[area]
    return { ...r, areas }
  })

  // Salvando não fecha; com alteração pendente pergunta antes.
  const fechar = () => {
    if (salvando) return
    if (alterado) setConfirmar(true)
    else onClose()
  }

  const salvar = async () => {
    setSalvando(true)
    setErro(null)
    try {
      await source.definir(pessoa.id, rascunho)
      toast({ tone: 'success', message: `Acessos de ${pessoa.nome} atualizados.` })
      onSaved()
    } catch (reason) {
      setErro(erroDaApi(reason))
    } finally {
      setSalvando(false)
    }
  }

  const footer = proprio || pessoa.admin
    ? <Button variant="secondary" onClick={onClose}>Fechar</Button>
    : <>
        <Button variant="secondary" disabled={salvando} onClick={fechar}>Cancelar</Button>
        <Button disabled={!alterado} loading={salvando} onClick={() => void salvar()}>Salvar</Button>
      </>

  return (
    <>
      <Drawer open onClose={fechar} size="wide" eyebrow={pessoa.email || 'Acessos'} title={pessoa.nome} footer={footer}>
        <Tabs aria-label="Seções dos acessos" value={aba} onChange={setAba} tabs={[{ value: 'perfis', label: 'Perfis' }, { value: 'historico', label: 'Histórico' }]}>
          {aba === 'historico' ? <HistoricoLista itens={daPessoa} /> : (
            <div className="ac-ficha">
              {proprio ? <Alert tone="info" title="Ninguém altera o próprio acesso.">Peça a outro Administrador de acessos.</Alert> : null}
              {pessoa.admin && !proprio ? <Alert tone="info" title="Administrador do Sistema">Esta pessoa já tem acesso a tudo; os perfis não mudam o que ela vê. O papel de administrador não é gerido por esta tela.</Alert> : null}
              {erro ? <Alert tone="danger" title="Não foi possível salvar">{erro.mensagem}</Alert> : null}
              {AREAS.map((area) => (
                <div key={area} className="ac-ficha__area">
                  <ChoiceGroup label={AREA_LABEL[area]} inline>
                    {OPCOES.map((o) => (
                      <Radio key={o.rotulo} name={`ac-${area}`} label={o.rotulo} disabled={travado} checked={(rascunho.areas[area] ?? null) === o.valor} onChange={() => nivel(area, o.valor)} />
                    ))}
                  </ChoiceGroup>
                  {faltam.includes(area) ? NAO_PUBLICADO : null}
                </div>
              ))}
              <div className="ac-ficha__area">
                <Switch label={PERFIL_LABEL.acessos} checked={rascunho.acessos} disabled={travado || !acessos.admin} onChange={(e) => setRascunho((r) => ({ ...r, acessos: e.target.checked }))} />
                {acessos.admin ? null : <span className="ac-dica">Só o Administrador do Sistema concede este perfil.</span>}
                {faltam.includes('acessos') ? NAO_PUBLICADO : null}
              </div>
              {mudancas.length ? (
                <Alert tone="info" title="O que muda ao salvar">
                  <ul className="ac-ficha__mudancas">{mudancas.map((m) => <li key={m}>{m}</li>)}</ul>
                </Alert>
              ) : null}
            </div>
          )}
        </Tabs>
      </Drawer>
      <Dialog open={confirmar} onClose={() => setConfirmar(false)} title="Descartar alterações?" actions={<>
        <Button variant="secondary" onClick={() => setConfirmar(false)}>Continuar editando</Button>
        <Button variant="danger" onClick={onClose}>Descartar</Button>
      </>}>
        As mudanças de perfil de {pessoa.nome} ainda não foram salvas.
      </Dialog>
    </>
  )
}
```

Regras que este componente cumpre e não podem sair numa simplificação: clique fora, X e Esc passam por `fechar` (o `Drawer` chama `onClose`); salvando não fecha; erro do servidor fica na gaveta com o rascunho preservado; sem `border-left` colorido.

- [ ] **Passo 6: `apps/shell/src/pages/acessos/acessos.css`**

Só tokens do DS (`--bt-*`), como em `pages/clientes/clientes.css`:

```css
.ac-num { color: var(--bt-color-text-secondary); font-size: var(--bt-font-size-13); font-variant-numeric: tabular-nums; }
.ac-open { all: unset; cursor: pointer; color: var(--bt-color-brand); }
.ac-open:focus-visible, .ac-card__open:focus-visible { outline: 2px solid var(--bt-color-brand); outline-offset: 2px; border-radius: var(--bt-radius-md); }
.ac-chips { display: flex; flex-wrap: wrap; gap: var(--bt-space-1); }
.ac-vazio, .ac-dica, .ac-hist__quando { color: var(--bt-color-text-secondary); font-size: var(--bt-font-size-13); }

.ac-cards { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--bt-space-2); }
.ac-card { display: grid; gap: var(--bt-space-2); padding: var(--bt-space-3); border: 1px solid var(--bt-color-border); border-radius: var(--bt-radius-md); background: var(--bt-color-surface); cursor: pointer; }
.ac-card__open { all: unset; display: grid; gap: var(--bt-space-1); cursor: pointer; min-height: 44px; }
.ac-card__meta { color: var(--bt-color-text-secondary); font-size: var(--bt-font-size-13); overflow-wrap: anywhere; }

.ac-ficha { display: grid; gap: var(--bt-space-4); }
.ac-ficha__area { display: grid; gap: var(--bt-space-2); padding-bottom: var(--bt-space-3); border-bottom: 1px solid var(--bt-color-border); }
.ac-ficha__mudancas, .ac-hist__linhas { margin: 0; padding-left: var(--bt-space-4); }

.ac-hist { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--bt-space-3); }
.ac-hist__item { display: grid; gap: var(--bt-space-1); padding-bottom: var(--bt-space-3); border-bottom: 1px solid var(--bt-color-border); }
```

Antes de gravar, confira que cada token existe (`rg -o "var\(--bt-[a-z0-9-]+\)" apps/shell/src/pages/clientes/clientes.css | sort -u`); token que não aparecer no shell nem no DS troca pelo equivalente usado em `clientes.css`. O CSS é importado na Tarefa 8, pela página.

- [ ] **Passo 7: rodar**

```bash
(cd apps/shell && npx vitest run src/pages/acessos 2>&1 | tail -12)
(cd apps/shell && npx tsc --noEmit 2>&1 | tail -8)
```

Esperado: 4 arquivos verdes (5 testes na gaveta), `tsc` sem saída. Se o `Drawer` do DS não tiver `size="wide"` ou o `Tabs` não aceitar filhos, siga o uso real de `pages/documentos/components/ConfigDrawer.tsx`.

- [ ] **Passo 8: commit**

```bash
git add apps/shell/src/pages/acessos
git commit -m "feat(acessos): lista de pessoas, histórico e gaveta de perfis com resumo do que muda"
```

---

### Tarefa 8: página Acessos

**Arquivos:**
- Criar: `apps/shell/src/pages/acessos/AcessosPage.tsx`, `apps/shell/src/pages/acessos/AcessosPage.test.tsx`

**Interfaces:**
- Consome: Tarefa 6 (`createSource`, `Dados`, `PESSOA_COLUMNS`, `TELA`, `builtinViews`, `pessoaFields`, `pessoaKeywordText`, `readPessoa`, `sortPessoas`), Tarefa 7 (`AcessosTable`, `AcessosCards`, `AcessoDrawer`, `HistoricoLista`). Do shell: `listCache`, `useProgressiveData`, `useListView`, `filterRows`, `keywordIndex`/`searchWords`/`useDebouncedText`, `SearchHits`, `useQueryAlvo`/`useQueryTexto`, `useMedia`.
- Produz: `AcessosPage({ host })`, carregada pela rota `acessos` (Tarefa 9).

- [ ] **Passo 1: teste que falha**

`apps/shell/src/pages/acessos/AcessosPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Host } from '../../host'
import { AcessosProvider } from '../../app/AcessosProvider'
import { AcessosPage } from './AcessosPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const host = { mode: 'mock' } as Host
const tela = () => render(<AcessosProvider host={host}><AcessosPage host={host} /></AcessosProvider>)
const row = async (nome: string) => (await screen.findByText(nome)).closest('[role="row"]') as HTMLElement

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = ''; window.history.replaceState(null, '', '/') })

describe('AcessosPage', () => {
  it('lista as pessoas com os perfis de cada uma', async () => {
    tela()
    expect((await row('Bruno Modelo')).textContent).toContain('Financeiro · Operador')
    expect((await row('Ana Exemplo')).textContent).toContain('Administrador do Sistema')
    expect((await row('Diego Teste')).textContent).toContain('Só o Base')
  })

  it('a busca filtra por perfil', async () => {
    tela()
    await row('Bruno Modelo')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar pessoas' }), { target: { value: 'frota' } })
    await waitFor(() => expect(screen.queryByText('Bruno Modelo')).toBeNull())
    expect(screen.getByText('Carla Amostra')).toBeTruthy()
  })

  it('abre a gaveta, salva e a lista reflete o perfil novo', async () => {
    tela()
    fireEvent.click((await row('Bruno Modelo')).querySelectorAll('[role="cell"]')[1])
    await screen.findByRole('dialog', { name: 'Bruno Modelo' })
    fireEvent.click(screen.getAllByRole('radio', { name: 'Gestor' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(async () => expect((await row('Bruno Modelo')).textContent).toContain('Financeiro · Gestor'))
    expect(screen.queryByRole('dialog', { name: 'Bruno Modelo' })).toBeNull()
  })

  it('o botão Histórico mostra todas as alterações com a pessoa', async () => {
    tela()
    await row('Bruno Modelo')
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    const gaveta = await screen.findByRole('dialog', { name: 'Histórico de acessos' })
    expect(gaveta.textContent).toContain('Carla Amostra')
    expect(gaveta.textContent).toContain('Operacional: Operador → Gestor')
  })
})
```

Se o `SearchBox` do DS não expuser o papel `searchbox`, use o seletor que `ClientesPage.test.tsx` usa para a busca.

- [ ] **Passo 2: rodar e ver falhar**

`(cd apps/shell && npx vitest run src/pages/acessos/AcessosPage.test.tsx 2>&1 | tail -8)` — Esperado: falha por módulo `./AcessosPage` inexistente.

- [ ] **Passo 3: `AcessosPage.tsx`**

```tsx
import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, Drawer, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, useShellHeader } from '@betinhos/ui'
import { History, RefreshCw, SearchX, UsersRound } from 'lucide-react'
import type { Host } from '../../host'
import { listCache } from '../../app/listCache'
import { SearchHits } from '../../app/SearchHits'
import { keywordIndex, searchWords, useDebouncedText } from '../../app/search'
import { filterRows } from '../../app/filterRows'
import { useListView } from '../../app/useListView'
import { useProgressiveData } from '../../app/useProgressiveData'
import { useQueryAlvo, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { PESSOA_COLUMNS, TELA, builtinViews, pessoaFields, pessoaKeywordText, readPessoa, sortPessoas } from './domain/lista'
import type { Dados, Pessoa } from './domain/types'
import { AcessosCards, AcessosTable } from './components/AcessosList'
import { AcessoDrawer } from './components/AcessoDrawer'
import { HistoricoLista } from './components/HistoricoLista'
import './acessos.css'

export function AcessosPage({ host }: { host: Host }) {
  return <ToastProvider><Acessos host={host} /></ToastProvider>
}

const EMPTY: Pessoa[] = []
const FIELDS = pessoaFields()

function Acessos({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const load = useCallback(async () => source.load(), [source])
  const cs = useProgressiveData<Dados>({ cache: listCache(host), key: 'acessos', load })
  const list = cs.data?.pessoas ?? EMPTY
  const ready = cs.data != null

  const [query, setQuery] = useQueryTexto('q')
  const [target, setTarget] = useQueryAlvo()
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const q = useDebouncedText(query)

  const { view, filters: valid, quickFilters, clearFilters, fields: allFields } = useListView({
    host, defaultName: 'Todas as pessoas', tela: TELA, columns: PESSOA_COLUMNS, defaultSort: { key: 'nome', dir: 'asc' }, fields: FIELDS, ready, builtins: builtinViews,
  })

  const sorted = useMemo(() => {
    const sort = view.config.sort
    return sort ? sortPessoas(list, sort.key, sort.dir) : list
  }, [list, view.config.sort])
  const filtered = useMemo(() => filterRows(sorted, valid, allFields, readPessoa), [sorted, valid, allFields])
  const index = useMemo(() => keywordIndex<Pessoa>(pessoaKeywordText), [])
  const words = useMemo(() => searchWords(q), [q])
  const visible = useMemo(() => (words.length ? filtered.filter((p) => index.matches(p, words)) : filtered), [filtered, index, words])

  const refresh = useCallback(() => { void cs.reload() }, [cs.reload])
  useShellHeader({ title: 'Acessos' })
  const size = mobile ? 'touch' : 'default'
  const clearAll = () => { clearFilters(); setQuery('') }
  const open = (id: string) => setTarget({ mode: 'view', id })
  const aberta = target && target.mode !== 'create' ? list.find((p) => p.id === target.id) ?? null : null
  const salvo = () => { setTarget(null); refresh() }

  let body
  if (cs.error && !ready) {
    body = <Alert tone="danger" title="Não foi possível carregar os acessos" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{cs.error}</Alert>
  } else if (!ready) {
    body = <AcessosTable list={[]} onOpen={() => undefined} loading />
  } else if (!list.length) {
    body = <EmptyState className="surface" align="start" icon={<UsersRound size={36} />} title="Nenhuma pessoa ativa">As pessoas com conta ativa no ambiente aparecem aqui.</EmptyState>
  } else {
    const footer = <span className="ac-num">{visible.length} de {list.length}</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhuma pessoa com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = mobile
      ? (visible.length ? <AcessosCards list={visible} onOpen={open} /> : <div className="surface">{empty}</div>)
      : <AcessosTable list={visible} onOpen={open} view={{ config: view.config, onChange: view.setConfig, density: view.density, pinnable: true }} quickFilters={quickFilters} footer={footer} empty={empty} />
  }

  return (
    <div className="page page--full ac-page">
      <div role="toolbar" aria-label="Comandos de acessos">
        <ViewBar pinnable view={view} columns={PESSOA_COLUMNS} filters={ready ? { fields: allFields } : undefined}
          search={<SearchBox size={size} value={query} onChange={setQuery} placeholder="Buscar por nome, e-mail ou perfil" aria-label="Buscar pessoas" />}
          primary={<>
            <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={cs.loading && ready} onClick={refresh} />
            <Button variant="secondary" size={size} icon={<History size={16} />} disabled={!ready} onClick={() => setHistoricoAberto(true)}>Histórico</Button>
          </>}>
          {source.mock && !mobile ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
        </ViewBar>
      </div>
      {cs.error && ready ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{cs.error} A lista mostra os dados da carga anterior.</Alert> : null}
      <SearchHits tokens={words}>{body}</SearchHits>
      {cs.data ? <AcessoDrawer pessoa={aberta} euId={cs.data.euId} historico={cs.data.historico} source={source} onClose={() => setTarget(null)} onSaved={salvo} /> : null}
      <Drawer open={historicoAberto} onClose={() => setHistoricoAberto(false)} size="wide" eyebrow="Acessos" title="Histórico de acessos">
        <HistoricoLista itens={cs.data?.historico ?? []} comPessoa />
      </Drawer>
    </div>
  )
}
```

Conferências (ler, não presumir):
1. `useListView` sem a opção `extra`: se o tipo exigir, passe `extra: { entity: 'systemuser', ids: [] }` só se isso não ligar colunas extras do catálogo; caso ligue, mantenha sem e ajuste o tipo no chamador como as outras listas sem `extra` fazem (`rg -n "useListView\(" -A3 apps/shell/src/pages | rg -v extra | head`).
2. O `ViewBar` aceita campo de filtro que não é coluna (as áreas, `acessos`, `admin`). Se recusar ou mostrar errado, tire esses campos de `pessoaFields()` e do teste `lista.test.ts` e deixe a busca por perfil como o caminho (o teste "a busca filtra por perfil" cobre).
3. `useProgressiveData` guarda `Dados` no `listCache`: as datas voltam do cache como texto? Veja como `clientes` reidrata `Date` (`rg -n "revive|reviver|new Date" apps/shell/src/app/listCache.ts apps/shell/src/app/useProgressiveData.ts | head`). Se o cache não reidratar, troque `Date | null` por texto ISO em `Pessoa.alteradoEm` e `Historico.quando` (e `fmtQuando`/`sortPessoas`/testes), em vez de inventar um reviver só desta tela.

- [ ] **Passo 4: rodar**

```bash
(cd apps/shell && npx vitest run src/pages/acessos 2>&1 | tail -12)
(cd apps/shell && npx tsc --noEmit 2>&1 | tail -8)
```

Esperado: 5 arquivos verdes, `tsc` sem saída.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/acessos
git commit -m "feat(acessos): página Acessos com lista, busca, filtros e histórico geral"
```

---

### Tarefa 9: rota, menu, ícone e mapa

**Arquivos:**
- Modificar: `apps/shell/src/nav/menu.ts`, `apps/shell/src/nav/routes.tsx`, `apps/shell/src/app/AppShell.tsx`, `packages/deploy/acessos/acessosMapa.json`
- Testes: os de menu, ícones e mapa que já existem (lista no Passo 1)

**Interfaces:**
- Consome: `AcessosPage` (Tarefa 8); `menuVisivel`/`perfisDoItem` (Tarefa 3); o mapa e o gerador do plano 1.
- Produz: rota `#/acessos`, item "Acessos" no fim do grupo Cadastros, visível só para `Perfil - Administrador de acessos` e Administrador do Sistema.

- [ ] **Passo 1: localizar os pontos exatos**

```bash
rg -n "'clientes'" apps/shell/src/nav/menu.ts apps/shell/src/nav/routes.tsx apps/shell/src/app/AppShell.tsx | head -12
rg -ln "ITEM_ICONS|menuVisivel|acessosMapa" apps/shell/src packages/deploy --glob '*.test.*' | head
rg -n '"clientes"' -A4 packages/deploy/acessos/acessosMapa.json | head -12
```

- [ ] **Passo 2: teste que falha**

No teste de `menuVisivel` criado na Tarefa 3, acrescente:

```ts
it('Acessos aparece só para Administrador de acessos e para o Administrador do Sistema', () => {
  const ids = (a: Acessos) => menuVisivel(a).flatMap((g) => g.items.map((i) => i.id))
  expect(ids({ admin: false, areas: { financeiro: 'gestor' }, acessos: false })).not.toContain('acessos')
  expect(ids({ admin: false, areas: {}, acessos: true })).toContain('acessos')
  expect(ids(TODOS)).toContain('acessos')
})
```

Use a forma real que `menuVisivel` devolve (a da Tarefa 3); se os grupos tiverem outro nome de campo para os itens, ajuste só o `flatMap`. Rode o arquivo: Esperado FALHA em `toContain('acessos')`.

- [ ] **Passo 3: ligar**

`menu.ts`: acrescente `'acessos'` à união do tipo `page` e, como último item do grupo `cadastros`:

```ts
{ kind: 'page', id: 'acessos', label: 'Acessos', page: 'acessos' },
```

`routes.tsx`, em `PAGE_LOADERS`:

```ts
acessos: () => import('../pages/acessos/AcessosPage').then((m) => m.AcessosPage),
```

`AppShell.tsx`: importe `Fingerprint` de `lucide-react` e acrescente em `ITEM_ICONS`:

```tsx
acessos: <Fingerprint />,
```

(`KeyRound`, `ShieldCheck` e `UserCog` já pertencem a outros itens; o teste de ícones reprova repetição. Siga o formato dos vizinhos se eles passarem `size`.)

`packages/deploy/acessos/acessosMapa.json`, em `rotas`:

```json
"acessos": {
  "perfis": ["acessos"],
  "pastas": ["apps/shell/src/pages/acessos"],
  "ignorar": [
    { "tabela": "cr40f_acessohistorico", "motivo": "leitura dada pelo gerador direto ao Administrador de acessos" },
    { "tabela": "systemuser", "motivo": "tabela do sistema; leitura já vem do Perfil - Base" },
    { "tabela": "team", "motivo": "tabela do sistema; leitura já vem do Perfil - Base" },
    { "tabela": "role", "motivo": "tabela do sistema; leitura já vem do Perfil - Base" }
  ]
}
```

Mantenha só as entradas de `ignorar` que o teste do mapa pedir (ele lista as tabelas que a pasta consulta e não estão declaradas). Se o `Perfil - Base` do plano 1 não der leitura de `team`/`role` (`rg -n "prvReadTeam|prvReadRole" packages/deploy/acessos | head -4`), a tela não carrega para quem não é administrador: nesse caso acrescente os dois privilégios ao `Perfil - Administrador de acessos` no gerador e gere uma migration nova (nunca editar a publicada).

- [ ] **Passo 4: rodar**

```bash
(cd apps/shell && npx vitest run src/nav src/app 2>&1 | tail -15)
node --test packages/deploy/acessos/ 2>&1 | tail -12
git status --short packages/deploy | head
(cd apps/shell && npx tsc --noEmit 2>&1 | tail -8)
```

Esperado: tudo verde; em `packages/deploy` só o `acessosMapa.json` mudou. Se o gerador produzir saída diferente por causa da rota nova, a diferença entra como migration nova no mesmo commit (dry-run local; `-Apply` só pelo Deploy).

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/nav apps/shell/src/app packages/deploy/acessos
git commit -m "feat(acessos): rota #/acessos no grupo Cadastros, visível só ao Administrador de acessos"
```

---

### Tarefa 10: prova visual, verificação e PR

**Arquivos:**
- Modificar: `.claude/skills/verificar-acessos/SKILL.md` (criada no plano 1) e `.claude/skills/verificar-index.md`

**Interfaces:**
- Consome: tudo acima. Produz: PR para a `develop`.

- [ ] **Passo 1: prints (skill `print-ui`, modo mock)**

Capture em 1440 px e em 375 px, e copie os PNG para `~/.t3/userdata/attachments/` (nomes sem espaço):
1. `#/acessos` (lista com chips);
2. gaveta de "Bruno Modelo" com Financeiro em Gestor e o bloco "O que muda ao salvar";
3. gaveta com `?falha=salvar` depois de Salvar (erro na gaveta e "Ainda não publicado neste ambiente");
4. menu com `?acessos=financeiro:operador` (só Financeiro, Início e Planner) e com `?acessos=nenhum` (tela "Você ainda não tem acesso").

Mostre os prints no chat com o caminho absoluto. Sem print a tarefa não está pronta.

- [ ] **Passo 2: `ux-audit` no modo Fluxo**

Tarefa do usuário: "dar Financeiro Gestor ao Bruno e conferir no histórico". Conserte os achados antes de seguir; console e rede sem erro; teclado: Tab chega aos rádios, Esc fecha a gaveta e pergunta se houver alteração.

- [ ] **Passo 3: skill de verificação**

Em `.claude/skills/verificar-acessos/SKILL.md`, acrescente a seção "Shell": comandos de teste (`npx vitest run src/pages/acessos src/nav src/app/acessos`), os parâmetros do mock (`?acessos=...`, `?falha=salvar`), os quatro cenários do Passo 1 e a prova no DEV com os dois usuários de teste (`DV_TESTE_ID`, `DV_ALVO_ID`, nunca id no arquivo): atribuir perfil pela tela, conferir o papel por `systemuserroles_association`, conferir a linha em `cr40f_acessohistoricos`, tentar o próprio acesso (recusa) e abrir o shell como o usuário de teste (menu só com o módulo dele). Atualize os globs da área em `verificar-index.md` com `apps/shell/src/pages/acessos/**`, `apps/shell/src/app/acessos*` e `apps/shell/src/app/AcessosProvider*`.

- [ ] **Passo 4: qualidade e verificação**

Skill `qualidade-antes-do-pr` inteira (com `vercel-react-best-practices`), depois `verificacao-manter` (`verificar-acessos` e `verificar-shell`). Rode por fim:

```bash
(cd apps/shell && npx tsc --noEmit 2>&1 | tail -8)
(cd apps/shell && npx vitest run 2>&1 | tail -8)
node scripts/dados-pessoais.mjs 2>&1 | tail -5
git diff develop --stat | tail -5
```

Esperado: tudo verde; nenhum nome, e-mail ou id real no diff (só `Ana Exemplo`, `Bruno Modelo`, `Carla Amostra`, `Diego Teste` e `@exemplo.test`).

- [ ] **Passo 5: PR para a `develop`**

Título: `feat(acessos): menu por perfil e tela Acessos no shell`. Corpo com: o que entra; seção "Qualidade"; prints; **"Não verificado sem o Dataverse"** (leitura real de papéis e equipes, chamada da Custom API, histórico real); e o aviso abaixo, em destaque. Termine com a linha de atribuição do Claude Code e vincule com `link_pull_request`.

> Depois do merge, no DEV, quem não é Administrador do Sistema e não tem papel `Perfil - ...` passa a ver só Início e Planner. O Dataverse continua liberando tudo até o corte (plano 4); o que muda agora é o menu.

Não mergear: o merge é do Renan, depois de o plano 1 estar publicado no DEV (a tela depende da Custom API e dos papéis).

---

## Auto-revisão

**Cobertura da spec**

| Spec | Onde |
|---|---|
| §6 menu e rotas por perfil, sem perfil = aviso | Tarefas 2–5 |
| §6 tela Acessos em Cadastros (lista, perfis por pessoa, histórico) | Tarefas 6–9 |
| §6 resumo "o que muda" antes de salvar | Tarefa 7 (`oQueMuda`) |
| §6 só Administrador do Sistema concede Administrador de acessos | Tarefa 7 (`Switch` travado) e o plugin do plano 1 |
| §7 erros `SEM_PERMISSAO`, `PROPRIO_ACESSO`, `USUARIO_INVALIDO`, `PERFIL_INVALIDO`, `PERFIL_INDISPONIVEL` | Tarefa 6 (`erroDaApi`, `perfisIndisponiveis`) e Tarefa 7 (alerta na gaveta) |
| §10 testes do shell | Tarefas 2, 3, 6, 7, 8, 9 |
| §10 prova no DEV com usuário de teste | Tarefa 10, Passo 3 (roteiro) |

**Fora deste plano, de propósito**
- Níveis dentro das telas (botão Excluir só para Gestor, colunas sensíveis) → plano 3.
- Corte no PROD (retirar papéis antigos, equipe `Team-Betinhos-MDA` só com o Base) → plano 4.

**Limitações assumidas**
- Enquanto os papéis carregam, o menu mostra só os itens livres (Início e Planner); não há cache dos perfis entre sessões.
- O Início de quem não tem Operacional mostra blocos sem dado; o ajuste é do plano 3.
- O mapa de acessos entra no bundle do shell (só nomes de rota e de perfil, nada sensível).
- A tela lê perfis dos papéis diretos; papel `Perfil - ...` dado por equipe não aparece (a spec define atribuição direta).
- A data "Última alteração" vem do histórico: mudança feita fora da tela (direto no Dataverse) não aparece.

**Consistência de nomes** (conferida entre tarefas): `PerfisPessoa`, `paraPedido`/`doPedido`, `erroDaApi`, `perfisIndisponiveis`, `Source.definir`, `MOCK_EU`, `AcessoDrawer`, `HistoricoLista`, `fmtQuando`, prefixo CSS `ac-`, chave de cache e `TELA` = `'acessos'`.

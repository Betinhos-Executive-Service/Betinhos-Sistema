# Acessos por perfil, plano 3 (níveis dentro das telas) — plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans. Passos com checkbox (`- [ ]`).

**Objetivo:** dentro das telas, o shell passa a seguir o nível do perfil: Excluir registro de negócio só aparece para o Gestor da área dona (ou Administrador do Sistema), campos sensíveis de Funcionários somem ou ficam só leitura conforme o grupo de colunas, e a Página Inicial abre na primeira visão que a pessoa lê, sem "indisponível" para quem só tem RH, Frota ou Administrador de acessos.

**Arquitetura:** uma função pura nova, `app/nivel.ts`, responde "pode ler a tabela", "pode excluir da tabela" e "lê/edita a coluna" a partir dos mesmos JSON que geram os papéis (`nav/acessosMapa.json` e `nav/acessosColunas.json`), espelhando `packages/deploy/acessos/gerar.mjs`. `app/useNivel.ts` liga isso ao `AcessosProvider` (mesmo padrão de `app/useAcessoConfigApp.ts`). As telas só consultam os hooks; nenhuma regra de perfil fica espalhada nelas. O shell continua não sendo a fronteira de segurança: o Dataverse já recusa (plano 1); aqui é clareza de uso.

**Stack:** React 18, TypeScript, Vite, vitest + Testing Library (jsdom), `@betinhos/ui` (^3.x, o que a página já usa), `@betinhos/dataverse`.

**Spec:** `docs/superpowers/specs/2026-11-23-acessos-por-perfil-design.md`, seções 4, 6, 7 e 10 (ler antes de começar).

**Planos irmãos:** plano 1 (backend) e plano 2 (shell: menu, guarda de rota, perfis na ficha) já estão na `develop`. Plano 4 (corte: tirar os papéis antigos) ainda não escrito.

## Restrições globais

- Todos os comandos rodam da raiz do worktree deste plano. Nunca `cd` para o checkout principal; nunca `git stash` puro.
- Repositório público: nada de nome de pessoa, id de usuário, CPF, `sig=` ou segredo em código, teste, plano, commit ou PR.
- Sessões/worktrees nunca rodam `pnpm push`, `pnpm wr`, `sitemap:*`, `push:plugin:*` nem `provision-*`; a publicação é pelo Deploy da `develop`.
- PR para `develop`; merge é do Renan.
- Versão de build: não editar à mão; o Deploy incrementa.
- UI segue o design system `@betinhos/ui` já usado na página; sem borda lateral colorida em cards.
- Mudança de UI exige print no chat e ux-audit modo Rápido ao executar (registre como passo da execução).
- Commits em português, detalhados, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. O hook de commit exige a skill `verificacao-manter`; nunca criar `.verificacao/desativado`.
- Subagentes: nunca Fable. Sonnet para implementar, Haiku para busca.
- A máquina é compartilhada: só os testes dos arquivos tocados, no máximo 2 workers, nunca a suíte inteira do shell (ela roda no CI do PR). Comandos (saída sempre filtrada):
  - `pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 <arquivos> 2>&1 | tail -15`
  - `pnpm --filter @betinhos/shell exec tsc --noEmit 2>&1 | tail -15`
- Os caminhos de teste no comando são relativos a `apps/shell` (ex.: `src/app/nivel.test.ts`).

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `apps/shell/src/app/nivel.ts` (novo) | `podeLer`, `podeExcluir`, `acessoGrupo`, `acessoColuna`: funções puras sobre os dois JSON |
| `apps/shell/src/app/nivel.test.ts` (novo) | casos por perfil, inclusive `financeiro.valor` e `veiculos.patrimonio` |
| `apps/shell/src/app/useNivel.ts` (novo) | `useAcessosProntos`, `usePodeExcluir`, `useAcessoColunas` |
| `apps/shell/src/app/useNivel.test.tsx` (novo) | hooks com provider (carregando, erro, pronto) |
| `apps/shell/src/app/ComAcessos.tsx` (novo) | `ComAcessos`: provider de teste a partir do texto do mock (`rh:operador`) |
| `apps/shell/src/pages/composicao/components/CompositionCommandLine.tsx` | prop `podeExcluir`; sem ela a ação Excluir sai da seleção |
| `apps/shell/src/pages/composicao/ComposicaoPage.tsx` | passa `podeExcluir` (tabela `cr40f_composicaodeprecos`) |
| `apps/shell/src/pages/comunicados/components/ComunicadosLista.tsx` | lixeira do rascunho só com `podeExcluir` |
| `apps/shell/src/pages/comunicados/components/ComunicadoEditor.tsx` | "Excluir rascunho" só com `podeExcluir` |
| `apps/shell/src/pages/treinamentos/components/TreinamentoEditor.tsx` | "Excluir rascunho" e exclusão de anexo só com `podeExcluir` |
| `apps/shell/src/pages/treinamentos/components/AnexosSecao.tsx` | prop `podeExcluir` (padrão `true`) |
| `apps/shell/src/pages/documentos/components/Checklist.tsx` | Excluir arquivo só com `podeExcluir('cr40f_documento')` |
| `apps/shell/src/pages/documentos/components/ConfigDrawer.tsx` | Excluir tipo só com `podeExcluir('cr40f_tipodocumento')` |
| `apps/shell/src/pages/funcionarios/components/DocumentosArquivos.tsx` | Excluir arquivo da ficha só com `podeExcluir('cr40f_funcionarios')` |
| `apps/shell/src/pages/qualidade/App.jsx` | "Configurações" (opções de choice) só para Administrador do Sistema |
| `apps/shell/src/pages/qualidade/App.acessos.test.jsx` (novo) | aba Configurações por perfil |
| `apps/shell/src/pages/funcionarios/components/Ficha.tsx` | campo sem leitura some; sem edição fica só leitura |
| `apps/shell/src/pages/funcionarios/data/lista.ts` | `colunasDoPerfil`, `camposDoPerfil`, `alertasDoPerfil` |
| `apps/shell/src/pages/funcionarios/FuncionariosPage.tsx` | usa as listas filtradas e esconde chips sem leitura |
| `apps/shell/src/pages/inicio/domain/visoes.ts` (novo) | `TABELAS_DA_VISAO` e `visoesPermitidas` |
| `apps/shell/src/pages/inicio/useInicio.ts` | recebe as visões permitidas; padrão = a primeira; sem visão não consulta |
| `apps/shell/src/pages/inicio/InicioPage.tsx` | seletor só com as permitidas; sem visão, sem seletor nem indicadores |
| `.claude/skills/verificar-acessos/SKILL.md` | roteiro dos níveis nas telas |

## Vocabulário (vale para todas as tarefas)

- **Tabela dona / filha:** `modulos.<área>.donas` e `.filhas` em `nav/acessosMapa.json`. O gerador dá Delete nas filhas a todos da área, e nas donas só ao Gestor. `base.donas` têm Delete para todos.
- **Grupo de colunas:** `cr40f_funcionarios.pessoal` etc. em `nav/acessosColunas.json`. Coluna fora de grupo não tem segurança de coluna (vale ler e editar). Editar implica ler; o Gestor herda o Operador; `tabela.*` cobre todos os grupos da tabela.
- **Some, não desabilita:** para quem não pode, o botão Excluir não é renderizado (spec §6). Campo sem leitura não é renderizado; campo com leitura e sem edição aparece desabilitado (mesmo visual dos campos `readonly` de hoje).
- **Perfis no mock:** `?acessos=financeiro:operador,rh:gestor,acessos` antes do `#` (`acessosDoMock`). Nos testes, o provider de `ComAcessos`. Sem provider, o padrão é `TODOS` (admin), então os testes antigos continuam valendo.

---

### Tarefa 1: worktree e base

**Arquivos:** nenhum.

- [ ] **Passo 1: worktree nova a partir da `develop`** (skill `using-git-worktrees`)

```bash
git fetch origin develop
git worktree add ../acessos-niveis-telas -b feat/acessos-niveis-telas origin/develop
cd ../acessos-niveis-telas && pnpm install --frozen-lockfile 2>&1 | tail -3
```

- [ ] **Passo 2: conferir a base**

```bash
git status --short | head
test -f apps/shell/src/app/useAcessoConfigApp.ts && test -f apps/shell/src/nav/acessosColunas.json && echo base-ok
pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/app/acessos.test.ts 2>&1 | tail -5
```

Esperado: status limpo, `base-ok` e os testes de `acessos.test.ts` passando.

---

### Tarefa 2: `app/nivel.ts` (regras puras)

**Arquivos:** criar `apps/shell/src/app/nivel.ts` e `apps/shell/src/app/nivel.test.ts`.

**Interfaces:**
- Consome: `AREAS`, `temPerfil`, `Acessos`, `Nivel`, `Perfil` de `app/acessos.ts`; `nav/acessosMapa.json`; `nav/acessosColunas.json`.
- Produz: `podeLer(a, tabela): boolean`, `podeExcluir(a, tabela): boolean`, `type AcessoColuna = { ler: boolean; editar: boolean }`, `acessoGrupo(a, 'tabela.grupo'): AcessoColuna`, `acessoColuna(a, tabela, coluna): AcessoColuna`.

- [ ] **Passo 1: teste falhando**

`apps/shell/src/app/nivel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { acessosDoMock, TODOS } from './acessos'
import { acessoColuna, acessoGrupo, podeExcluir, podeLer } from './nivel'

const p = (texto: string) => acessosDoMock(texto)

describe('podeExcluir', () => {
  it('tabela dona: só o Gestor da área (ou admin)', () => {
    expect(podeExcluir(p('financeiro:operador'), 'cr40f_composicaodeprecos')).toBe(false)
    expect(podeExcluir(p('financeiro:gestor'), 'cr40f_composicaodeprecos')).toBe(true)
    expect(podeExcluir(p('rh:operador'), 'cr40f_treinamento')).toBe(false)
    expect(podeExcluir(p('rh:gestor'), 'cr40f_treinamento')).toBe(true)
    expect(podeExcluir(p('operacional:operador'), 'new_comunicadomotorista')).toBe(false)
    expect(podeExcluir(p('operacional:gestor'), 'new_comunicadomotorista')).toBe(true)
    expect(podeExcluir(TODOS, 'cr40f_composicaodeprecos')).toBe(true)
  })

  it('Gestor de outra área não exclui', () => {
    expect(podeExcluir(p('rh:gestor'), 'cr40f_composicaodeprecos')).toBe(false)
  })

  it('tabela filha: qualquer nível da área', () => {
    expect(podeExcluir(p('financeiro:operador'), 'cr40f_itempagamentoaterceiro')).toBe(true)
    expect(podeExcluir(p('frota:operador'), 'cr40f_fotoequipamento')).toBe(true)
    expect(podeExcluir(p('rh:operador'), 'cr40f_fotoequipamento')).toBe(false)
  })

  it('tabelas do Base (Planner) valem para todos, inclusive sem perfil', () => {
    expect(podeExcluir(p('nenhum'), 'cr40f_plannertarefa')).toBe(true)
  })

  it('tabela fora do mapa: só admin', () => {
    expect(podeExcluir(p('financeiro:gestor,rh:gestor'), 'tabela_inexistente')).toBe(false)
    expect(podeExcluir(TODOS, 'tabela_inexistente')).toBe(true)
  })
})

describe('podeLer', () => {
  it('lê o que o módulo da área alcança em qualquer classe', () => {
    expect(podeLer(p('frota:operador'), 'cr40f_reservadeveculos')).toBe(true)
    expect(podeLer(p('financeiro:operador'), 'cr40f_fluxocaixalancamento')).toBe(true)
    expect(podeLer(p('operacional:operador'), 'cr40f_fluxocaixalancamento')).toBe(false)
    expect(podeLer(p('rh:operador'), 'cr40f_reservadeveculos')).toBe(false)
    expect(podeLer(p('acessos'), 'cr40f_funcionarios')).toBe(true)
  })

  it('Base vale para todos', () => {
    expect(podeLer(p('nenhum'), 'cr40f_plannertarefa')).toBe(true)
    expect(podeLer(p('nenhum'), 'cr40f_comunicadohome')).toBe(true)
  })
})

describe('acessoGrupo', () => {
  it('Funcionários: RH Operador edita básico, CNH e RH, não vê pessoal; Gestor edita pessoal', () => {
    expect(acessoGrupo(p('rh:operador'), 'cr40f_funcionarios.pessoal')).toEqual({ ler: false, editar: false })
    expect(acessoGrupo(p('rh:operador'), 'cr40f_funcionarios.rh')).toEqual({ ler: true, editar: true })
    expect(acessoGrupo(p('rh:gestor'), 'cr40f_funcionarios.pessoal')).toEqual({ ler: true, editar: true })
    expect(acessoGrupo(p('rh:gestor'), 'cr40f_funcionarios.rh')).toEqual({ ler: true, editar: true })
  })

  it('Administrador de acessos só lê o básico', () => {
    expect(acessoGrupo(p('acessos'), 'cr40f_funcionarios.basico')).toEqual({ ler: true, editar: false })
    expect(acessoGrupo(p('acessos'), 'cr40f_funcionarios.cnh')).toEqual({ ler: false, editar: false })
  })

  it('financeiro.valor: Operador lê, só o Gestor edita', () => {
    expect(acessoGrupo(p('financeiro:operador'), 'cr40f_financeiro.valor')).toEqual({ ler: true, editar: false })
    expect(acessoGrupo(p('financeiro:gestor'), 'cr40f_financeiro.valor')).toEqual({ ler: true, editar: true })
    expect(acessoGrupo(p('operacional:gestor'), 'cr40f_financeiro.valor')).toEqual({ ler: false, editar: false })
  })

  it('veiculos.patrimonio: Frota Operador lê pelo curinga, Gestor edita', () => {
    expect(acessoGrupo(p('frota:operador'), 'cr40f_veiculos.patrimonio')).toEqual({ ler: true, editar: false })
    expect(acessoGrupo(p('frota:gestor'), 'cr40f_veiculos.patrimonio')).toEqual({ ler: true, editar: true })
  })

  it('admin lê e edita tudo', () => {
    expect(acessoGrupo(TODOS, 'cr40f_funcionarios.pessoal')).toEqual({ ler: true, editar: true })
  })
})

describe('acessoColuna', () => {
  it('acha o grupo da coluna; fora de grupo vale tudo', () => {
    expect(acessoColuna(p('rh:operador'), 'cr40f_funcionarios', 'cr40f_numerodocpf')).toEqual({ ler: false, editar: false })
    expect(acessoColuna(p('rh:operador'), 'cr40f_funcionarios', 'cr40f_datadeadmissao')).toEqual({ ler: true, editar: true })
    expect(acessoColuna(p('rh:operador'), 'cr40f_funcionarios', 'cr40f_nomecompleto')).toEqual({ ler: true, editar: true })
    expect(acessoColuna(p('rh:operador'), 'tabela_sem_grupo', 'qualquer')).toEqual({ ler: true, editar: true })
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/app/nivel.test.ts 2>&1 | tail -15` → falha por `./nivel` inexistente.

- [ ] **Passo 3: implementar**

`apps/shell/src/app/nivel.ts`:

```ts
import mapaJson from '../nav/acessosMapa.json'
import colunasJson from '../nav/acessosColunas.json'
import { AREAS, temPerfil, type Acessos, type Nivel, type Perfil } from './acessos'

/**
 * Níveis dentro das telas, lidos dos mesmos JSON que geram os papéis (`packages/deploy/acessos/gerar.mjs`):
 * Delete nas filhas para toda a área, nas donas só para o Gestor, no Base para todos. Colunas: editar implica ler,
 * o Gestor herda o Operador, `tabela.*` cobre todos os grupos, coluna fora de grupo não tem segurança.
 * O shell só esconde: quem barra é o Dataverse.
 */

type Modulo = Partial<Record<'donas' | 'filhas' | 'cria' | 'edita' | 'leitura', string[]>>
type Base = { leitura: string[]; proprio: string[]; cria: string[]; donas: string[]; sistema: Record<string, Record<string, string>> }
type Regra = { ler: string[]; editar: string[] }

const MODULOS = mapaJson.modulos as Record<string, Modulo>
const BASE = mapaJson.base as unknown as Base
const GRUPOS = colunasJson.grupos as Record<string, Record<string, string[]>>
const REGRAS = colunasJson.perfis as Record<string, Partial<Record<Nivel, Regra>>>
const PERFIS: Perfil[] = [...AREAS, 'acessos']
const CLASSES = ['donas', 'filhas', 'cria', 'edita', 'leitura'] as const

export type AcessoColuna = { ler: boolean; editar: boolean }
const TUDO: AcessoColuna = { ler: true, editar: true }

export function podeLer(a: Acessos, tabela: string): boolean {
  if (a.admin) return true
  if ([BASE.leitura, BASE.proprio, BASE.donas].some((lista) => lista.includes(tabela))) return true
  if (BASE.sistema[tabela]?.Read) return true
  return PERFIS.some((perfil) => temPerfil(a, perfil) && CLASSES.some((classe) => MODULOS[perfil]?.[classe]?.includes(tabela)))
}

export function podeExcluir(a: Acessos, tabela: string): boolean {
  if (a.admin) return true
  if (BASE.donas.includes(tabela)) return true
  return PERFIS.some((perfil) => {
    const modulo = MODULOS[perfil]
    if (modulo?.filhas?.includes(tabela)) return temPerfil(a, perfil)
    return Boolean(modulo?.donas?.includes(tabela)) && temPerfil(a, perfil, 'gestor')
  })
}

const cobre = (refs: string[] | undefined, ref: string) => {
  const tabela = ref.split('.')[0]
  return Boolean(refs?.some((r) => r === ref || r === `${tabela}.*`))
}

/** `ref` = `tabela.grupo`, como em `acessosColunas.json`. */
export function acessoGrupo(a: Acessos, ref: string): AcessoColuna {
  if (a.admin) return TUDO
  let ler = false
  let editar = false
  for (const perfil of PERFIS) {
    if (!temPerfil(a, perfil)) continue
    const niveis: Nivel[] = perfil !== 'acessos' && temPerfil(a, perfil, 'gestor') ? ['operador', 'gestor'] : ['operador']
    for (const nivel of niveis) {
      const regra = REGRAS[perfil]?.[nivel]
      if (cobre(regra?.editar, ref)) editar = true
      if (cobre(regra?.ler, ref)) ler = true
    }
  }
  return { ler: ler || editar, editar }
}

export function acessoColuna(a: Acessos, tabela: string, coluna: string): AcessoColuna {
  const grupo = Object.entries(GRUPOS[tabela] ?? {}).find(([, colunas]) => colunas.includes(coluna))?.[0]
  return grupo ? acessoGrupo(a, `${tabela}.${grupo}`) : TUDO
}
```

- [ ] **Passo 4: rodar e ver passar; tipos**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/app/nivel.test.ts 2>&1 | tail -15` → todos passam. `pnpm --filter @betinhos/shell exec tsc --noEmit 2>&1 | tail -15` → limpo. Se o `tsc` reclamar do `as` em `mapaJson.base`, mantenha o `as unknown as Base` (o JSON inferido tem `sistema` com chaves literais).

- [ ] **Passo 5: conferir `financeiro.valor` e `veiculos.patrimonio` nas telas (sem código)**

```bash
rg -n "cr40f_valor\b" apps/shell/src --glob '!*.test.*' | rg -v "select|\\\$select|num\(|orderby| ge | le " | head
rg -n "cr40f_chassi|cr40f_renavam|cr40f_valordacompra" apps/shell/src --glob '!*.test.*' | head
```

Esperado (conferido em 24/11/2026): o shell só lê `cr40f_financeiro.cr40f_valor` (OPs, pendências, recebimentos); a única escrita de `cr40f_valor` é em `frota/domain/editarManutencao.ts`, que é outra tabela. Nenhuma tela edita o patrimônio do veículo. As duas ficam "nada a fazer" nas telas; a regra está coberta pelo teste do Passo 1. Se aparecer escrita nova, ela entra no padrão da Tarefa 9 (campo só leitura sem `editar`).

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/app/nivel.ts apps/shell/src/app/nivel.test.ts
git commit -m "$(cat <<'EOF'
feat(acessos): regras de nível no shell lidas do mapa dos papéis

Cria app/nivel.ts com podeLer, podeExcluir, acessoGrupo e acessoColuna,
calculados a partir de acessosMapa.json e acessosColunas.json, os mesmos
arquivos que geram os papéis. Delete: filhas para toda a área, donas só
para o Gestor, Base para todos. Colunas: editar implica ler, o Gestor herda
o Operador e o curinga cobre a tabela.

O shell só esconde; quem barra continua sendo o Dataverse.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 3: hooks e provider de teste

**Arquivos:** criar `apps/shell/src/app/useNivel.ts`, `apps/shell/src/app/ComAcessos.tsx` e `apps/shell/src/app/useNivel.test.tsx`.

**Interfaces:**
- Consome: `useAcessos`, `acessosDe`, `AcessosContext` de `app/AcessosProvider.tsx`; `acessosDoMock` de `app/acessos.ts`; Tarefa 2.
- Produz: `useAcessosProntos(): Acessos`, `usePodeExcluir(tabela): boolean`, `useAcessoColunas(tabela): (coluna) => AcessoColuna`, `ComAcessos({ perfis, children })`.

- [ ] **Passo 1: teste falhando**

`apps/shell/src/app/useNivel.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AcessosContext } from './AcessosProvider'
import { ComAcessos } from './ComAcessos'
import { useAcessoColunas, usePodeExcluir } from './useNivel'

const com = (perfis: string) => ({ children }: { children: ReactNode }) => <ComAcessos perfis={perfis}>{children}</ComAcessos>

describe('useNivel', () => {
  it('sem provider vale o padrão (admin)', () => {
    expect(renderHook(() => usePodeExcluir('cr40f_composicaodeprecos')).result.current).toBe(true)
  })

  it('segue o perfil do provider', () => {
    expect(renderHook(() => usePodeExcluir('cr40f_composicaodeprecos'), { wrapper: com('financeiro:operador') }).result.current).toBe(false)
    expect(renderHook(() => usePodeExcluir('cr40f_composicaodeprecos'), { wrapper: com('financeiro:gestor') }).result.current).toBe(true)
    const colunas = renderHook(() => useAcessoColunas('cr40f_funcionarios'), { wrapper: com('rh:operador') }).result.current
    expect(colunas('cr40f_numerodocpf')).toEqual({ ler: false, editar: false })
    expect(colunas('cr40f_datadeadmissao')).toEqual({ ler: true, editar: true })
  })

  it('carregando ou erro: nada sensível (NENHUM)', () => {
    for (const valor of [{ status: 'carregando' as const }, { status: 'erro' as const, erro: 'falha' }]) {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AcessosContext.Provider value={{ ...valor, recarregar: () => {} } as never}>{children}</AcessosContext.Provider>
      )
      expect(renderHook(() => usePodeExcluir('cr40f_composicaodeprecos'), { wrapper }).result.current).toBe(false)
    }
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/app/useNivel.test.tsx 2>&1 | tail -15` → falha por `./useNivel` inexistente.

- [ ] **Passo 3: implementar**

`apps/shell/src/app/useNivel.ts`:

```ts
import { useCallback, useMemo } from 'react'
import type { Acessos } from './acessos'
import { acessosDe, useAcessos } from './AcessosProvider'
import { acessoColuna, podeExcluir, type AcessoColuna } from './nivel'

/** Acessos já resolvidos: carregando ou erro = NENHUM (nada de excluir nem de campo sensível até saber). */
export function useAcessosProntos(): Acessos {
  const valor = useAcessos()
  return useMemo(() => acessosDe(valor), [valor])
}

export function usePodeExcluir(tabela: string): boolean {
  const acessos = useAcessosProntos()
  return useMemo(() => podeExcluir(acessos, tabela), [acessos, tabela])
}

export function useAcessoColunas(tabela: string): (coluna: string) => AcessoColuna {
  const acessos = useAcessosProntos()
  return useCallback((coluna: string) => acessoColuna(acessos, tabela, coluna), [acessos, tabela])
}
```

`apps/shell/src/app/ComAcessos.tsx`:

```tsx
import { useMemo, type ReactNode } from 'react'
import { acessosDoMock } from './acessos'
import { AcessosContext } from './AcessosProvider'

/** Provider para testes: perfis no mesmo texto do `?acessos=` do mock (ex.: `rh:operador,acessos`). */
export function ComAcessos({ perfis, children }: { perfis: string; children: ReactNode }) {
  const value = useMemo(() => ({ status: 'pronto' as const, acessos: acessosDoMock(perfis), recarregar: () => {} }), [perfis])
  return <AcessosContext.Provider value={value}>{children}</AcessosContext.Provider>
}
```

Se o `tsc` acusar o tipo do `value` (forma do contexto diferente de `{ status, acessos, recarregar }`), copie a forma usada em `app/RouteLayout.acessos.test.tsx`, que é o modelo existente.

- [ ] **Passo 4: rodar e ver passar; tipos**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/app/useNivel.test.tsx 2>&1 | tail -15` e `pnpm --filter @betinhos/shell exec tsc --noEmit 2>&1 | tail -15`.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/app/useNivel.ts apps/shell/src/app/ComAcessos.tsx apps/shell/src/app/useNivel.test.tsx
git commit -m "$(cat <<'EOF'
feat(acessos): hooks usePodeExcluir e useAcessoColunas

Liga as regras de app/nivel.ts ao AcessosProvider no padrão de
useAcessoConfigApp: carregando ou erro valem NENHUM, sem provider vale o
padrão (admin). ComAcessos monta o provider nos testes a partir do mesmo
texto do ?acessos= do mock.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 4: Composição (Excluir em lote)

**Arquivos:** modificar `apps/shell/src/pages/composicao/components/CompositionCommandLine.tsx` e `apps/shell/src/pages/composicao/ComposicaoPage.tsx`; criar `apps/shell/src/pages/composicao/ComposicaoPage.acessos.test.tsx`.

**Interfaces:**
- Consome: `usePodeExcluir` (Tarefa 3); tabela `cr40f_composicaodeprecos` (dona do Financeiro).
- Produz: prop `podeExcluir: boolean` em `CompositionCommandLine`.

- [ ] **Passo 1: teste falhando**

`apps/shell/src/pages/composicao/ComposicaoPage.acessos.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ComAcessos } from '../../app/ComAcessos'
import { ComposicaoPage } from './ComposicaoPage'

afterEach(cleanup)

async function selecionar(perfis: string) {
  render(<ComAcessos perfis={perfis}><ComposicaoPage host={{ mode: 'mock' }} /></ComAcessos>)
  await screen.findByRole('checkbox', { name: 'Selecionar Aurora Logística' })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Aurora Logística' }))
  await screen.findByRole('button', { name: 'Gerar OP' })
}

describe('Composição por nível', () => {
  it('Financeiro Operador seleciona e gera OP, mas não vê Excluir', async () => {
    await selecionar('financeiro:operador')
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull()
  })

  it('Financeiro Gestor vê Excluir', async () => {
    await selecionar('financeiro:gestor')
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeTruthy()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/composicao/ComposicaoPage.acessos.test.tsx 2>&1 | tail -15` → o primeiro caso falha (Excluir aparece).

- [ ] **Passo 3: prop na linha de comando**

Em `CompositionCommandLine.tsx`, no `type Props` (linha 17), logo depois de `selectedCount: number`:

```ts
  selectedCount: number
  /** Excluir composição é do Gestor do Financeiro (tabela dona); sem ele a ação não aparece. */
  podeExcluir: boolean
```

E troque a lista de ações da seleção (linhas 47-50):

```tsx
  const selectionActions: SelectionAction[] = [
    { id: 'op', label: p.commandPhase === 'inspect-op' ? 'Verificando…' : p.commandPhase === 'send-op' ? 'Enviando…' : 'Gerar OP', icon: <FilePlus2 size={16} />, inline: true, blocked: p.commandBlock, onSelect: run('generateOp') },
    { id: 'excluir', label: p.commandPhase === 'delete' ? 'Excluindo…' : 'Excluir', icon: <Trash2 size={16} />, tone: 'danger', inline: true, blocked: p.commandBlock, onSelect: run('exclude') },
  ]
```

por:

```tsx
  const selectionActions: SelectionAction[] = [
    { id: 'op', label: p.commandPhase === 'inspect-op' ? 'Verificando…' : p.commandPhase === 'send-op' ? 'Enviando…' : 'Gerar OP', icon: <FilePlus2 size={16} />, inline: true, blocked: p.commandBlock, onSelect: run('generateOp') },
    ...(p.podeExcluir ? [{ id: 'excluir', label: p.commandPhase === 'delete' ? 'Excluindo…' : 'Excluir', icon: <Trash2 size={16} />, tone: 'danger' as const, inline: true, blocked: p.commandBlock, onSelect: run('exclude') }] : []),
  ]
```

- [ ] **Passo 4: passar a prop na página**

Em `ComposicaoPage.tsx`, adicione o import junto dos outros de `../../app/`:

```ts
import { usePodeExcluir } from '../../app/useNivel'
```

Em `ComposicaoContent`, logo depois de `const mobile = useMediaQuery('(max-width: 820px)')` (linha 227):

```ts
  const podeExcluir = usePodeExcluir('cr40f_composicaodeprecos')
```

E na renderização de `<CompositionCommandLine` (linha 1657), troque:

```tsx
        commandPhase={commandPhase} commandLocked={commandLocked} commandBlock={commandBlock} exporting={exporting} selectedCount={selectedCount}
```

por:

```tsx
        commandPhase={commandPhase} commandLocked={commandLocked} commandBlock={commandBlock} exporting={exporting} selectedCount={selectedCount} podeExcluir={podeExcluir}
```

- [ ] **Passo 5: rodar os testes da Composição e tipos**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/composicao/ComposicaoPage.acessos.test.tsx src/pages/composicao/ComposicaoPage.commands.test.tsx src/pages/composicao/components 2>&1 | tail -15` → todos passam (o teste antigo de exclusão roda sem provider, ou seja, como admin). `pnpm --filter @betinhos/shell exec tsc --noEmit 2>&1 | tail -15` → limpo; se algum teste de `components/` montar `CompositionCommandLine` direto, acrescente `podeExcluir` nos props dele.

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/pages/composicao
git commit -m "$(cat <<'EOF'
feat(composicao): Excluir em lote só para o Gestor do Financeiro

A composição é tabela dona do Financeiro: o papel do Operador não tem
Delete. A ação Excluir da seleção deixa de aparecer para ele; Gerar OP e
o resto continuam. Admin e Gestor seguem como antes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 5: Comunicados (rascunho na lista e no editor)

**Arquivos:** modificar `apps/shell/src/pages/comunicados/components/ComunicadosLista.tsx` e `apps/shell/src/pages/comunicados/components/ComunicadoEditor.tsx`; criar `apps/shell/src/pages/comunicados/ComunicadosPage.acessos.test.tsx`.

**Interfaces:** consome `usePodeExcluir('new_comunicadomotorista')` (dona do Operacional).

- [ ] **Passo 1: teste falhando**

`apps/shell/src/pages/comunicados/ComunicadosPage.acessos.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComAcessos } from '../../app/ComAcessos'
import { ComunicadosPage } from './ComunicadosPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/comunicados'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function abrirRascunho(perfis: string) {
  render(<ComAcessos perfis={perfis}><ComunicadosPage host={{ mode: 'mock' }} /></ComAcessos>)
  return screen.findByRole('button', { name: /^Revisão dos veículos/ })
}

describe('Comunicados por nível', () => {
  it('Operacional Operador não vê Excluir rascunho na lista nem no editor', async () => {
    const linha = await abrirRascunho('operacional:operador')
    expect(screen.queryByRole('button', { name: 'Excluir rascunho Revisão dos veículos' })).toBeNull()
    fireEvent.click(linha)
    await screen.findByDisplayValue('Revisão dos veículos')
    expect(screen.queryByRole('button', { name: 'Excluir rascunho' })).toBeNull()
  })

  it('Operacional Gestor vê os dois', async () => {
    const linha = await abrirRascunho('operacional:gestor')
    expect(screen.getByRole('button', { name: 'Excluir rascunho Revisão dos veículos' })).toBeTruthy()
    fireEvent.click(linha)
    await screen.findByDisplayValue('Revisão dos veículos')
    expect(screen.getByRole('button', { name: 'Excluir rascunho' })).toBeTruthy()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/comunicados/ComunicadosPage.acessos.test.tsx 2>&1 | tail -15` → o primeiro caso falha.

- [ ] **Passo 3: lista**

Em `ComunicadosLista.tsx`, importe:

```ts
import { usePodeExcluir } from '../../../app/useNivel'
```

No começo do corpo de `ComunicadosLista` (linha 26):

```ts
  const podeExcluir = usePodeExcluir('new_comunicadomotorista')
```

E troque a condição da lixeira (linha 112) de `{enviado ? null : (` para `{enviado || !podeExcluir ? null : (`.

- [ ] **Passo 4: editor**

Em `ComunicadoEditor.tsx`, mesmo import e, no começo do corpo de `ComunicadoEditor` (linha 28):

```ts
  const podeExcluir = usePodeExcluir('new_comunicadomotorista')
```

E na linha 179 troque `{draft.id ? <Button variant="danger" className="cm-form__start"` por `{draft.id && podeExcluir ? <Button variant="danger" className="cm-form__start"` (o resto da linha fica igual).

- [ ] **Passo 5: testes e tipos**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/comunicados 2>&1 | tail -15` → todos passam. `pnpm --filter @betinhos/shell exec tsc --noEmit 2>&1 | tail -15`.

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/pages/comunicados
git commit -m "$(cat <<'EOF'
feat(comunicados): excluir rascunho só para o Gestor do Operacional

new_comunicadomotorista é dona do Operacional; o Operador não tem Delete.
A lixeira da lista e o botão Excluir rascunho do editor somem para ele.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 6: Treinamentos (rascunho e anexo)

**Arquivos:** modificar `apps/shell/src/pages/treinamentos/components/TreinamentoEditor.tsx` e `apps/shell/src/pages/treinamentos/components/AnexosSecao.tsx`; criar `apps/shell/src/pages/treinamentos/TreinamentosPage.acessos.test.tsx`.

**Interfaces:**
- Consome: `usePodeExcluir('cr40f_treinamento')` (dona do RH). O anexo é arquivo no SharePoint gravado na lista de anexos do treinamento: segue o Delete do treinamento.
- Produz: prop `podeExcluir?: boolean` em `AnexosSecao` (padrão `true`).

- [ ] **Passo 1: teste falhando**

`apps/shell/src/pages/treinamentos/TreinamentosPage.acessos.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComAcessos } from '../../app/ComAcessos'
import { TreinamentosPage } from './TreinamentosPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/treinamentos'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const montar = (perfis: string) => render(<ComAcessos perfis={perfis}><TreinamentosPage host={{ mode: 'mock' }} /></ComAcessos>)

async function abrirRascunho() {
  fireEvent.click(await screen.findByRole('row', { name: /Atendimento a passageiros com mobilidade reduzida/ }))
  await screen.findByRole('heading', { name: 'Editar treinamento' })
}

async function editarPublicado() {
  fireEvent.click(await screen.findByRole('row', { name: /Embarque no GRU/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Editar conteúdo' }))
  await screen.findByRole('heading', { name: 'Editar treinamento publicado' })
}

describe('Treinamentos por nível', () => {
  it('RH Operador edita o rascunho sem Excluir rascunho', async () => {
    montar('rh:operador')
    await abrirRascunho()
    expect(screen.queryByRole('button', { name: 'Excluir rascunho' })).toBeNull()
  })

  it('RH Operador edita o publicado sem excluir anexo', async () => {
    montar('rh:operador')
    await editarPublicado()
    expect(screen.getByText('mapa-terminal-3.pdf')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Excluir mapa-terminal-3.pdf' })).toBeNull()
  })

  it('RH Gestor vê Excluir rascunho e excluir anexo', async () => {
    montar('rh:gestor')
    await abrirRascunho()
    expect(screen.getByRole('button', { name: 'Excluir rascunho' })).toBeTruthy()
    cleanup()
    window.location.hash = '#/treinamentos'
    montar('rh:gestor')
    await editarPublicado()
    expect(screen.getByRole('button', { name: 'Excluir mapa-terminal-3.pdf' })).toBeTruthy()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/treinamentos/TreinamentosPage.acessos.test.tsx 2>&1 | tail -15` → os dois primeiros casos falham.

- [ ] **Passo 3: `AnexosSecao`**

Em `AnexosSecao.tsx`, no `type Props`, logo depois de `somenteLeitura?: boolean` (linha 19):

```ts
  somenteLeitura?: boolean
  /** Excluir anexo segue o Delete do treinamento (Gestor do RH); enviar continua para todos que editam. */
  podeExcluir?: boolean
```

Na assinatura (linha 36), acrescente `podeExcluir = true` ao fim da desestruturação:

```tsx
export function AnexosSecao({ treinamentoId, anexos, source, onChange, garantirId, aposCriar, disabled, somenteLeitura, podeExcluir = true }: Props) {
```

E na linha 100 troque `{somenteLeitura ? null : <Button variant="ghost" size="compact" icon={<Trash2 size={14} />} aria-label={`Excluir ${a.nome}`}` por `{somenteLeitura || !podeExcluir ? null : <Button variant="ghost" size="compact" icon={<Trash2 size={14} />} aria-label={`Excluir ${a.nome}`}` (o resto da linha fica igual).

- [ ] **Passo 4: `TreinamentoEditor`**

Importe `import { usePodeExcluir } from '../../../app/useNivel'` e, no começo do corpo de `TreinamentoEditor`:

```ts
  const podeExcluir = usePodeExcluir('cr40f_treinamento')
```

Na linha 192, acrescente `podeExcluir={podeExcluir}` ao `<AnexosSecao`:

```tsx
                <AnexosSecao treinamentoId={draft.id || null} anexos={draft.anexos} source={source} disabled={lock} garantirId={garantirId} aposCriar={aposCriar} podeExcluir={podeExcluir} onChange={(anexos, id) => void anexosAlterados(anexos, id)} />
```

Na linha 265 troque `{draft.id ? <Button variant="danger" className="tr-form__start"` por `{draft.id && podeExcluir ? <Button variant="danger" className="tr-form__start"` (o resto da linha fica igual).

- [ ] **Passo 5: testes e tipos**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/treinamentos 2>&1 | tail -15` → todos passam. `pnpm --filter @betinhos/shell exec tsc --noEmit 2>&1 | tail -15`.

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/pages/treinamentos
git commit -m "$(cat <<'EOF'
feat(treinamentos): excluir rascunho e anexo só para o Gestor do RH

cr40f_treinamento é dona do RH. O Operador continua criando, editando,
publicando e anexando, mas não vê Excluir rascunho nem a lixeira do anexo
(o arquivo no SharePoint segue o Delete do treinamento, porque o flow não
recusaria sozinho).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 7: Documentos (arquivo e tipo) e arquivos da ficha do funcionário

**Arquivos:** modificar `apps/shell/src/pages/documentos/components/Checklist.tsx`, `apps/shell/src/pages/documentos/components/ConfigDrawer.tsx`, `apps/shell/src/pages/funcionarios/components/DocumentosArquivos.tsx`; acrescentar casos em `Checklist.test.tsx`, `ConfigDrawer.test.tsx` e `DocumentosArquivos.test.tsx`.

**Interfaces:** consome `usePodeExcluir` com `cr40f_documento` (Checklist, dona do RH; o mesmo componente aparece na ficha do veículo, onde a Frota não tem Delete nessa tabela), `cr40f_tipodocumento` (ConfigDrawer, dona do RH) e `cr40f_funcionarios` (DocumentosArquivos, arquivos da pasta do funcionário, dona do RH).

- [ ] **Passo 1: testes falhando**

Em `apps/shell/src/pages/documentos/components/Checklist.test.tsx`, importe `import { ComAcessos } from '../../../app/ComAcessos'` e acrescente dentro do `describe('Checklist', ...)`:

```tsx
  it('RH Operador vê o arquivo sem Excluir; RH Gestor vê Excluir', async () => {
    for (const [perfis, ve] of [['rh:operador', false], ['rh:gestor', true]] as const) {
      const { source } = await comArquivoNaCnh()
      render(<ComAcessos perfis={perfis}><ToastProvider><Checklist source={source} donoId="m1" /></ToastProvider></ComAcessos>)
      const cnh = await itemCnh()
      await within(cnh).findByText('cnh.pdf')
      expect(Boolean(within(cnh).queryByRole('button', { name: 'Excluir cnh.pdf' }))).toBe(ve)
      cleanup()
    }
  })
```

(Se `cleanup` ou `ToastProvider` ainda não estiverem importados no arquivo, acrescente `cleanup` ao import de `@testing-library/react` e `ToastProvider` ao de `@betinhos/ui`.)

Em `apps/shell/src/pages/documentos/components/ConfigDrawer.test.tsx`, mesmo import de `ComAcessos` e:

```tsx
  it('RH Operador não vê Excluir tipo', async () => {
    const source = createMockDocsSource('2026-10-13')
    const data = await source.carregar()
    render(<ComAcessos perfis="rh:operador"><ToastProvider><ConfigDrawer source={source} data={data} onClose={vi.fn()} onChanged={vi.fn()} /></ToastProvider></ComAcessos>)
    const dialog = await screen.findByRole('dialog', { name: 'Configurações de documentos' })
    const tipo = data.tipos[0]!
    expect(within(dialog).queryByRole('button', { name: `Excluir ${tipo.nome}` })).toBeNull()
  })
```

Em `apps/shell/src/pages/funcionarios/components/DocumentosArquivos.test.tsx`, importe `import { ComAcessos } from '../../../app/ComAcessos'` e:

```tsx
  it('RH Operador lista e envia, mas não vê Excluir', async () => {
    render(<ComAcessos perfis="rh:operador"><ToastProvider><DocumentosArquivos source={createMockSource()} id="m1" /></ToastProvider></ComAcessos>)
    await screen.findByText('Comprovante de residência.jpg', undefined, { timeout: 4000 })
    expect(screen.queryByRole('button', { name: 'Excluir Comprovante de residência.jpg' })).toBeNull()
  })
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/documentos/components/Checklist.test.tsx src/pages/documentos/components/ConfigDrawer.test.tsx src/pages/funcionarios/components/DocumentosArquivos.test.tsx 2>&1 | tail -15` → os três casos novos falham.

- [ ] **Passo 3: `Checklist`**

Importe `import { usePodeExcluir } from '../../../app/useNivel'`; no começo do corpo de `Checklist` (linha 21):

```ts
  const podeExcluir = usePodeExcluir('cr40f_documento')
```

E envolva o botão da linha 177:

```tsx
{podeExcluir ? <Button size="compact" variant="ghost" className="doc-arq__excluir" icon={<Trash2 size={14} />} aria-label={`Excluir ${nome}`} title={`Excluir ${nome}`} onClick={() => setConfirmar(a)} /> : null}
```

Se a linha estiver dentro de um `.map` que hoje devolve o botão como último filho de um elemento, só o botão vai dentro do ternário; o resto da linha do arquivo não muda.

- [ ] **Passo 4: `ConfigDrawer`**

Mesmo import; no começo do corpo de `ConfigDrawer` (linha 27):

```ts
  const podeExcluir = usePodeExcluir('cr40f_tipodocumento')
```

E envolva o botão das linhas 165-167 (o `<Button ... aria-label={`Excluir ${t.nome}`} onClick={() => setAcao({ tipo: t, tipoAcao: 'excluir' })} />`) em `{podeExcluir ? ( ... ) : null}`, sem mudar os props dele. Inativar continua para todos que editam.

- [ ] **Passo 5: `DocumentosArquivos`**

Importe `import { usePodeExcluir } from '../../../app/useNivel'`; no começo do corpo de `DocumentosArquivos` (linha 38):

```ts
  const podeExcluir = usePodeExcluir('cr40f_funcionarios')
```

E envolva o botão da linha 191:

```tsx
{podeExcluir ? <Button variant="ghost" size="compact" className="icon-danger" icon={<Trash2 size={16} />} aria-label={`Excluir ${doc.nome}`} title="Excluir" onClick={() => setConfirmar(doc.id)} /> : null}
```

- [ ] **Passo 6: testes e tipos**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/documentos src/pages/funcionarios/components/DocumentosArquivos.test.tsx 2>&1 | tail -15` → todos passam. `pnpm --filter @betinhos/shell exec tsc --noEmit 2>&1 | tail -15`.

- [ ] **Passo 7: commit**

```bash
git add apps/shell/src/pages/documentos apps/shell/src/pages/funcionarios/components/DocumentosArquivos.tsx apps/shell/src/pages/funcionarios/components/DocumentosArquivos.test.tsx
git commit -m "$(cat <<'EOF'
feat(documentos): excluir arquivo e tipo só para o Gestor do RH

Documento, tipo de documento e funcionário são tabelas donas do RH. O
arquivo no SharePoint segue o Delete da tabela dona, porque o flow de
exclusão não recusaria sozinho: o Operador envia e renova, mas não vê a
lixeira do arquivo (checklist e pasta da ficha) nem Excluir tipo
(Inativar continua). Na ficha do veículo a Frota também deixa de ver
Excluir, igual ao que o Dataverse já recusa.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 8: Qualidade (opções de choice)

**Arquivos:** modificar `apps/shell/src/pages/qualidade/App.jsx`; criar `apps/shell/src/pages/qualidade/App.acessos.test.jsx`.

**Interfaces:** consome `useAcessosProntos` (Tarefa 3). Excluir, renomear e adicionar opção chamam `DeleteOptionValue`/`UpdateOptionValue`/`InsertOptionValue`: é metadata, e nenhum papel `Perfil - *` tem privilégio de personalização (o teste do gerador reprova). Então a aba inteira passa a ser só do Administrador do Sistema, em vez de esconder só o botão Excluir.

- [ ] **Passo 1: teste falhando**

`apps/shell/src/pages/qualidade/App.acessos.test.jsx`:

```jsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComAcessos } from '../../app/ComAcessos'
import App from './App'

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Qualidade por nível', () => {
  it('Gestor do Operacional não vê Configurações (opções de choice são metadata)', async () => {
    render(<ComAcessos perfis="operacional:gestor"><App embedded /></ComAcessos>)
    await screen.findAllByRole('button')
    expect(screen.queryByRole('button', { name: /Configurações/ })).toBeNull()
  })

  it('Administrador do Sistema vê Configurações', async () => {
    render(<App embedded />)
    expect(await screen.findByRole('button', { name: /Configurações/ })).toBeTruthy()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/qualidade/App.acessos.test.jsx 2>&1 | tail -15` → o primeiro caso falha. Se o segundo também falhar por o item de navegação não ser `button` (ver `views.jsx` linha 38 e o `map` logo abaixo), troque o `role` dos dois casos pelo que o item usa e siga.

- [ ] **Passo 3: implementar**

Em `App.jsx`, acrescente aos imports (linhas 1-9):

```js
import { useAcessosProntos } from "../../app/useNivel";
```

E troque a linha 115:

```js
  const access = useMemo(() => dataverse.getAccessProfile(), []);
```

por:

```js
  const acessos = useAcessosProntos();
  // Opções de choice são metadata (Insert/Update/DeleteOptionValue): nenhum perfil tem personalização, só o Administrador do Sistema.
  const access = useMemo(() => ({ ...dataverse.getAccessProfile(), canConfigure: acessos.admin }), [acessos.admin]);
```

O resto (`AppShell canConfigure`, `SettingsView` só com `access.canConfigure`) já usa esse valor.

- [ ] **Passo 4: testes e tipos**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/qualidade 2>&1 | tail -15` → todos passam. `pnpm --filter @betinhos/shell exec tsc --noEmit 2>&1 | tail -15`.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/qualidade
git commit -m "$(cat <<'EOF'
feat(qualidade): Configurações das opções só para Administrador do Sistema

Adicionar, renomear e excluir opção de choice mexem na metadata, e nenhum
papel Perfil tem privilégio de personalização. Para quem não é
Administrador do Sistema a aba sumia só na hora de gravar; agora nem
aparece. Registrar e tratar ocorrências não muda.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 9: Funcionários, campos sensíveis na Ficha

**Arquivos:** modificar `apps/shell/src/pages/funcionarios/components/Ficha.tsx`; acrescentar casos em `apps/shell/src/pages/funcionarios/components/Ficha.test.tsx`.

**Interfaces:** consome `useAcessoColunas('cr40f_funcionarios')`. Regra: sem `ler`, o campo não é renderizado; com `ler` e sem `editar`, renderiza com `readonly: true` (o `FieldInput` já desabilita e mostra `bt-field--disabled`). Campo fora de grupo (nome completo, `cr40f_cnhtexto`, identificador etc.) não muda.

- [ ] **Passo 1: testes falhando**

Em `Ficha.test.tsx`, importe:

```ts
import { ComAcessos } from '../../../app/ComAcessos'
import { FIELDS } from '../data/schema'
```

E acrescente ao `describe('Ficha', ...)`:

```tsx
  const rotulo = (key: string) => FIELDS.find((f) => f.key === key)!.label

  async function renderFichaCom(perfis: string, values: Funcionario['values'] = {}) {
    const comDados: Funcionario = { ...record, values: { ...record.values, cr40f_numerodocpf: '00000000000', cr40f_datadeadmissao: '2024-01-02', ...values } }
    const source = { ...fakeSource(vi.fn(async () => 'f1')), get: async () => structuredClone(comDados) }
    render(<ComAcessos perfis={perfis}><ToastProvider><Ficha source={source} id="f1" onClose={() => {}} onSaved={() => {}} /></ToastProvider></ComAcessos>)
    return screen.findByDisplayValue('Ana Souza')
  }

  it('RH Operador não vê dados pessoais e edita vínculo', async () => {
    await renderFichaCom('rh:operador')
    expect(screen.queryByLabelText(rotulo('cr40f_numerodocpf'))).toBeNull()
    expect(screen.queryByLabelText(rotulo('cr40f_enderecocompleto'))).toBeNull()
    expect((screen.getByLabelText(rotulo('cr40f_datadeadmissao')) as HTMLInputElement).disabled).toBe(false)
  })

  it('RH Gestor vê e edita dados pessoais', async () => {
    await renderFichaCom('rh:gestor')
    expect((screen.getByLabelText(rotulo('cr40f_numerodocpf')) as HTMLInputElement).disabled).toBe(false)
  })

  it('Administrador de acessos só lê o básico: apelido desabilitado, vínculo e CNH somem', async () => {
    await renderFichaCom('acessos')
    expect((screen.getByLabelText(/Apelido/) as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByLabelText(rotulo('cr40f_datadeadmissao'))).toBeNull()
    expect(screen.queryByLabelText(rotulo('cr40f_validadedacnh'))).toBeNull()
  })
```

O CPF `00000000000` é fictício (não passa na validação), e o teste não salva.

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/funcionarios/components/Ficha.test.tsx 2>&1 | tail -15` → os três casos novos falham (sem provider a Ficha mostra tudo).

- [ ] **Passo 3: implementar**

Em `Ficha.tsx`, importe:

```ts
import { useAcessoColunas } from '../../../app/useNivel'
```

No começo do corpo do componente `Ficha`, junto dos outros hooks:

```ts
  // Grupos de colunas do perfil (acessosColunas.json): sem leitura o campo some; sem edição fica só leitura.
  const coluna = useAcessoColunas('cr40f_funcionarios')
```

E troque o trecho da linha 221:

```tsx
FIELDS.filter((field) => field.group === group && !(isNew && field.readonly) && !(acesso && field.key === 'cr40f_emailmicrosoft') && field.key !== 'new_aditivoassinaturaem').map((field) => (<FieldInput key={field.key} field={field} value={draft.values[field.key]} error={errors[field.key]} changed={!isNew && dirty.includes(field.key)} onChange={(value) => setValue(field.key, value)} />))
```

por:

```tsx
FIELDS.filter((field) => field.group === group && !(isNew && field.readonly) && !(acesso && field.key === 'cr40f_emailmicrosoft') && field.key !== 'new_aditivoassinaturaem' && coluna(field.key).ler).map((field) => (<FieldInput key={field.key} field={coluna(field.key).editar ? field : { ...field, readonly: true }} value={draft.values[field.key]} error={errors[field.key]} changed={!isNew && dirty.includes(field.key)} onChange={(value) => setValue(field.key, value)} />))
```

Mantenha a formatação de linhas que o arquivo já tem; só entram `&& coluna(field.key).ler` no filtro e o `field={...}` condicional.

Aniversário, link da pasta antiga no OneDrive e alertas de CNH/ASO não precisam de código: para quem não lê a coluna o Dataverse devolve vazio e esses elementos já não aparecem sem valor.

- [ ] **Passo 4: testes e tipos**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/funcionarios/components/Ficha.test.tsx src/pages/funcionarios/components/AcessoSistema.test.tsx 2>&1 | tail -15` → todos passam. `pnpm --filter @betinhos/shell exec tsc --noEmit 2>&1 | tail -15`.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/funcionarios/components/Ficha.tsx apps/shell/src/pages/funcionarios/components/Ficha.test.tsx
git commit -m "$(cat <<'EOF'
feat(funcionarios): campos da ficha seguem os grupos de colunas do perfil

Com a segurança de coluna o Dataverse devolve vazio o que a pessoa não lê
e recusa gravar o que não edita. A ficha passa a esconder o campo sem
leitura (dados pessoais para o Operador do RH; vínculo e CNH para o
Administrador de acessos) e a mostrar desabilitado o campo só de leitura,
em vez de um campo vazio que falharia ao salvar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 10: Funcionários, lista, filtros e chips

**Arquivos:** modificar `apps/shell/src/pages/funcionarios/data/lista.ts` e `apps/shell/src/pages/funcionarios/FuncionariosPage.tsx`; acrescentar casos em `apps/shell/src/pages/funcionarios/data/lista.test.ts`.

**Interfaces:**
- Consome: `acessoGrupo` (Tarefa 2), `useAcessosProntos` (Tarefa 3).
- Produz em `lista.ts`: `colunasDoPerfil(a): ViewColumnDef[]`, `camposDoPerfil(a): FilterField[]`, `alertasDoPerfil(a): AlertKind[]`.

Quem abre Funcionários: `rh` e `acessos`. Sem leitura do grupo, a coluna ficaria vazia e o chip contaria zero sempre. Mapa usado: `cnh` → `cnh`; `aso`, `admissao`, `vinculo` → `rh`; chip `aniversario` → `pessoal`. A busca (`filters.ts`) não muda: o texto de CPF, RG e endereço já chega vazio do Dataverse para quem não lê.

- [ ] **Passo 1: teste falhando**

Em `lista.test.ts`, importe:

```ts
import { acessosDoMock, TODOS } from '../../../app/acessos'
import { alertasDoPerfil, camposDoPerfil, colunasDoPerfil } from './lista'
```

E acrescente:

```ts
describe('lista por perfil', () => {
  const chaves = (itens: { key: string }[]) => itens.map((i) => i.key)

  it('admin e RH Operador veem todas as colunas; RH Operador perde só o chip de aniversários', () => {
    for (const a of [TODOS, acessosDoMock('rh:operador')]) expect(chaves(colunasDoPerfil(a))).toEqual(['nome', 'apelido', 'funcao', 'status', 'contato', 'veiculo', 'cnh', 'aso', 'admissao'])
    expect(alertasDoPerfil(TODOS)).toEqual(['cnh', 'aso', 'aniversario'])
    expect(alertasDoPerfil(acessosDoMock('rh:operador'))).toEqual(['cnh', 'aso'])
    expect(alertasDoPerfil(acessosDoMock('rh:gestor'))).toEqual(['cnh', 'aso', 'aniversario'])
  })

  it('Administrador de acessos: sem CNH, ASO, admissão e vínculo', () => {
    const a = acessosDoMock('acessos')
    expect(chaves(colunasDoPerfil(a))).toEqual(['nome', 'apelido', 'funcao', 'status', 'contato', 'veiculo'])
    expect(chaves(camposDoPerfil(a))).not.toContain('vinculo')
    expect(chaves(camposDoPerfil(a))).not.toContain('cnh')
    expect(alertasDoPerfil(a)).toEqual([])
  })
})
```

Se `describe` ainda não estiver importado de `vitest` no arquivo, acrescente-o.

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/funcionarios/data/lista.test.ts 2>&1 | tail -15` → falha por funções inexistentes.

- [ ] **Passo 3: implementar em `lista.ts`**

Acrescente aos imports:

```ts
import type { Acessos } from '../../../app/acessos'
import { acessoGrupo } from '../../../app/nivel'
```

E no fim do arquivo:

```ts
/** Grupo de colunas (acessosColunas.json) que cada coluna, filtro ou chip lê; o que não está aqui é básico ou sem segurança. */
const GRUPO_DA_CHAVE: Record<string, string> = {
  cnh: 'cr40f_funcionarios.cnh',
  aso: 'cr40f_funcionarios.rh',
  admissao: 'cr40f_funcionarios.rh',
  vinculo: 'cr40f_funcionarios.rh',
  aniversario: 'cr40f_funcionarios.pessoal',
}
const le = (a: Acessos, chave: string) => !GRUPO_DA_CHAVE[chave] || acessoGrupo(a, GRUPO_DA_CHAVE[chave]).ler

export const colunasDoPerfil = (a: Acessos) => FUNCIONARIO_COLUMNS.filter((c) => le(a, c.key))
export const camposDoPerfil = (a: Acessos) => FUNCIONARIO_FIELDS.filter((f) => le(a, f.key))
export const alertasDoPerfil = (a: Acessos): AlertKind[] => (['cnh', 'aso', 'aniversario'] as const).filter((k) => le(a, k))
```

- [ ] **Passo 4: usar na página**

Em `FuncionariosPage.tsx`:

1. No import de `./data/lista` (linha 22), acrescente `alertasDoPerfil, camposDoPerfil, colunasDoPerfil`.
2. Acrescente `import { useAcessosProntos } from '../../app/useNivel'`.
3. No começo do corpo de `FuncionariosPage` (linha 54):

```ts
  const acessos = useAcessosProntos()
  const colunas = useMemo(() => colunasDoPerfil(acessos), [acessos])
  const campos = useMemo(() => camposDoPerfil(acessos), [acessos])
  const chips = useMemo(() => { const permitidos = alertasDoPerfil(acessos); return CHIPS.filter((c) => permitidos.includes(c.kind)) }, [acessos])
```

4. No `useListView` (linha 104), troque `columns: FUNCIONARIO_COLUMNS,` por `columns: colunas,` e `fields: FUNCIONARIO_FIELDS,` por `fields: campos,`.
5. No `<ViewBar ...` (linha 228), troque `columns={FUNCIONARIO_COLUMNS}` por `columns={colunas}`.
6. Nos chips (linha 238), troque `{CHIPS.map(` por `{chips.map(`. Se o `MobileHome` (linha 180) receber `CHIPS` ou a lista de alertas por prop, passe `chips` também; se ele tiver a própria lista, aplique `alertasDoPerfil` lá do mesmo jeito.
7. Se `FUNCIONARIO_COLUMNS` ou `FUNCIONARIO_FIELDS` ficarem sem uso no import, tire-os do import.

- [ ] **Passo 5: testes e tipos**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/funcionarios/data/lista.test.ts src/pages/funcionarios/data/filters.test.ts src/pages/funcionarios/FuncionariosPage 2>&1 | tail -15` → todos passam (o filtro `FuncionariosPage` não acha arquivo se não houver teste da página; tudo bem). `pnpm --filter @betinhos/shell exec tsc --noEmit 2>&1 | tail -15`.

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/pages/funcionarios/data/lista.ts apps/shell/src/pages/funcionarios/data/lista.test.ts apps/shell/src/pages/funcionarios/FuncionariosPage.tsx
git commit -m "$(cat <<'EOF'
feat(funcionarios): colunas, filtros e chips da lista seguem o perfil

Coluna, filtro ou chip de alerta cujo grupo de colunas a pessoa não lê
ficaria sempre vazio ou com zero. O Administrador de acessos deixa de ver
CNH, ASO, admissão e vínculo; o Operador do RH deixa de ver o chip de
aniversários. A busca não muda: o Dataverse já devolve vazio o que a
pessoa não lê.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 11: Página Inicial por perfil

**Arquivos:** criar `apps/shell/src/pages/inicio/domain/visoes.ts` e `apps/shell/src/pages/inicio/domain/visoes.test.ts`; modificar `apps/shell/src/pages/inicio/useInicio.ts` e `apps/shell/src/pages/inicio/InicioPage.tsx`; acrescentar casos em `apps/shell/src/pages/inicio/InicioPage.test.tsx`.

**Interfaces:**
- Consome: `podeLer` (Tarefa 2), `useAcessosProntos` (Tarefa 3), `VISOES` e `Visao` de `domain/types.ts`.
- Produz: `TABELAS_DA_VISAO`, `visoesPermitidas(a): Visao[]`; `useInicio(source, now?, visoes?)`.

Mapa visão → tabelas (as que `data/dataverse.ts` consulta em cada visão) e o resultado por perfil:

| Visão | Tabelas | Quem lê (fora o admin) |
|---|---|---|
| Operação | `cr40f_reservadeveculos` | Operacional, Financeiro, Frota |
| Financeiro | reservas, `cr40f_servicosporpassageiro`, `cr40f_fluxocaixalancamento` | Financeiro |
| TI | `asyncoperation`, `lead`, `campaign` (fora do mapa) | só Administrador do Sistema |
| Gestão | reservas, `cr40f_composicaodeprecos`, `cr40f_plannertarefa` | Financeiro |

RH e Administrador de acessos não leem nenhuma visão: veem saudação, comunicado, Planner e Radar (tudo do Base), sem seletor, sem indicadores e sem "indisponível".

- [ ] **Passo 1: teste puro falhando**

`apps/shell/src/pages/inicio/domain/visoes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { acessosDoMock, TODOS } from '../../../app/acessos'
import { visoesPermitidas } from './visoes'

describe('visoesPermitidas', () => {
  it('por perfil, na ordem do seletor', () => {
    expect(visoesPermitidas(TODOS)).toEqual(['operacao', 'financeiro', 'ti_marketing', 'gestao'])
    expect(visoesPermitidas(acessosDoMock('financeiro:operador'))).toEqual(['operacao', 'financeiro', 'gestao'])
    expect(visoesPermitidas(acessosDoMock('operacional:gestor'))).toEqual(['operacao'])
    expect(visoesPermitidas(acessosDoMock('frota:operador'))).toEqual(['operacao'])
    expect(visoesPermitidas(acessosDoMock('rh:gestor'))).toEqual([])
    expect(visoesPermitidas(acessosDoMock('acessos'))).toEqual([])
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/inicio/domain/visoes.test.ts 2>&1 | tail -15`.

- [ ] **Passo 3: implementar `visoes.ts`**

```ts
import type { Acessos } from '../../../app/acessos'
import { podeLer } from '../../../app/nivel'
import { VISOES, type Visao } from './types'

/** Tabelas que cada visão consulta em `data/dataverse.ts`; a visão só aparece para quem lê todas. */
export const TABELAS_DA_VISAO: Record<Visao, readonly string[]> = {
  operacao: ['cr40f_reservadeveculos'],
  financeiro: ['cr40f_reservadeveculos', 'cr40f_servicosporpassageiro', 'cr40f_fluxocaixalancamento'],
  ti_marketing: [], // asyncoperation, lead e campaign ficam fora do mapa: só o Administrador do Sistema
  gestao: ['cr40f_reservadeveculos', 'cr40f_composicaodeprecos', 'cr40f_plannertarefa'],
}

export function visoesPermitidas(a: Acessos): Visao[] {
  if (a.admin) return [...VISOES]
  return VISOES.filter((v) => v !== 'ti_marketing' && TABELAS_DA_VISAO[v].every((t) => podeLer(a, t)))
}
```

Se `data/dataverse.ts` tiver ganhado tabela nova numa visão desde 24/11/2026 (`rg -n "consultar(Tudo)?\('" apps/shell/src/pages/inicio/data/dataverse.ts`), inclua-a na lista da visão.

- [ ] **Passo 4: `useInicio` recebe as visões**

Em `useInicio.ts`, troque a assinatura e a leitura da visão (linhas 17-19):

```ts
export function useInicio(source: Source, now: () => Date = agora) {
  const query = useHashQuery()
  const visao = lerOpcao<Visao>(query, 'visao', VISOES, 'operacao')
```

por:

```ts
/** `visoes`: as que o perfil lê (`visoesPermitidas`); a padrão é a primeira. Sem nenhuma, só o comum (comunicado, Planner, Radar). */
export function useInicio(source: Source, now: () => Date = agora, visoes: readonly Visao[] = VISOES) {
  const query = useHashQuery()
  const padrao = visoes[0] ?? 'operacao'
  const visao = lerOpcao<Visao>(query, 'visao', visoes, padrao)
  const temVisao = visoes.length > 0
```

Dentro de `carregar`, troque a linha do `buscar`:

```ts
      const buscar = () => Promise.all([source.compartilhados(now()), emCache ? Promise.resolve(emCache) : source.visao(alvo, now())])
```

por:

```ts
      const semVisao: DadosVisao = { visao: alvo, indicadores: [], aReceber: [], erro: null }
      const buscar = () => Promise.all([source.compartilhados(now()), emCache ? Promise.resolve(emCache) : temVisao ? source.visao(alvo, now()) : Promise.resolve(semVisao)])
```

E acrescente `temVisao` às dependências do `useCallback` de `carregar` (`[source, now, temVisao]`).

No objeto devolvido, troque:

```ts
    setVisao: (v: Visao) => patchHashQuery({ visao: v === 'operacao' ? null : v }),
```

por:

```ts
    visoes,
    temVisao,
    setVisao: (v: Visao) => patchHashQuery({ visao: v === padrao ? null : v }),
```

- [ ] **Passo 5: `InicioPage` usa as visões permitidas**

Importe:

```ts
import { useAcessosProntos } from '../../app/useNivel'
import { visoesPermitidas } from './domain/visoes'
```

Em `InicioCompleto`, troque `const inicio = useInicio(source)` por:

```ts
  const acessos = useAcessosProntos()
  const visoes = useMemo(() => visoesPermitidas(acessos), [acessos])
  const inicio = useInicio(source, undefined, visoes)
```

Troque o parágrafo do herói:

```tsx
          <p>Bom trabalho. Sua visão de {VISAO_LABEL[inicio.visao].toLowerCase()} está atualizada.</p>
```

por:

```tsx
          <p>{inicio.temVisao ? `Bom trabalho. Sua visão de ${VISAO_LABEL[inicio.visao].toLowerCase()} está atualizada.` : 'Bom trabalho.'}</p>
```

O seletor só aparece com mais de uma visão e só com as permitidas:

```tsx
        {inicio.visoes.length > 1 ? (
          <SegmentedControl aria-label="Escolher visão" value={inicio.visao} onChange={inicio.setVisao}
            options={inicio.visoes.map((v) => ({ value: v, label: VISAO_LABEL[v] }))} />
        ) : null}
```

Os indicadores só com visão:

```tsx
      {inicio.temVisao ? <Indicadores itens={dados?.indicadores ?? null} carregando={inicio.carregando} quantos={QUANTOS[inicio.visao] ?? 4} onAbrir={(i: Indicador) => abrirDestino(i.destino)} /> : null}
```

Se `VISOES` ficar sem uso no import de `./domain/types`, tire-o. O botão "Novo serviço" fica como está (a guarda da rota `geral` já decide).

- [ ] **Passo 6: testes da página**

Em `InicioPage.test.tsx`, importe `import { ComAcessos } from '../../app/ComAcessos'` e acrescente ao `describe`:

```tsx
  it('Financeiro Operador: seletor sem TI', async () => {
    render(<ComAcessos perfis="financeiro:operador"><InicioPage host={{ mode: 'mock' }} /></ComAcessos>)
    const seletor = await screen.findByLabelText('Escolher visão')
    expect(within(seletor).queryByText('TI')).toBeNull()
    expect(within(seletor).getByText('Gestão')).toBeTruthy()
  })

  it('Operacional: abre na Operação mesmo com visao=financeiro na URL e sem seletor', async () => {
    window.location.hash = '#/inicio?visao=financeiro'
    render(<ComAcessos perfis="operacional:operador"><InicioPage host={{ mode: 'mock' }} /></ComAcessos>)
    expect(await screen.findByRole('button', { name: 'Serviços hoje: 06. Abrir' })).toBeTruthy()
    expect(screen.queryByLabelText('Escolher visão')).toBeNull()
  })

  it('RH Operador: comunicado, Planner e Radar, sem indicadores e sem erro', async () => {
    render(<ComAcessos perfis="rh:operador"><InicioPage host={{ mode: 'mock' }} /></ComAcessos>)
    expect(await screen.findByRole('heading', { name: 'Olá, Renan.' })).toBeTruthy()
    expect(await screen.findByText('Janela de operação especial')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Planner/ })).toBeTruthy()
    expect(screen.queryByLabelText('Escolher visão')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Serviços hoje: 06. Abrir' })).toBeNull()
    expect(screen.queryByText(/indisponível/)).toBeNull()
    expect(screen.queryByText('Erro parcial')).toBeNull()
  })
```

(O "Renan" do mock já existe no teste atual da página; não acrescente outro nome.)

- [ ] **Passo 7: rodar e tipos**

`pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/pages/inicio 2>&1 | tail -15` → todos passam (os testes antigos rodam sem provider, como admin, com as 4 visões). `pnpm --filter @betinhos/shell exec tsc --noEmit 2>&1 | tail -15`.

- [ ] **Passo 8: commit**

```bash
git add apps/shell/src/pages/inicio
git commit -m "$(cat <<'EOF'
feat(inicio): visões da Página Inicial seguem o perfil

A visão padrão passa a ser a primeira que o perfil lê, o seletor mostra
só as permitidas (TI só para o Administrador do Sistema) e some com uma
visão só. Quem tem só RH ou Administrador de acessos vê comunicado,
Planner e Radar sem indicadores e sem o aviso "reservas indisponível". O
mapa visão → tabelas fica em domain/visoes.ts e usa a mesma regra de
leitura dos papéis.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 12: skill de verificação, prova visual, qualidade e PR

**Arquivos:** modificar `.claude/skills/verificar-acessos/SKILL.md`.

- [ ] **Passo 1: atualizar a skill**

Em `.claude/skills/verificar-acessos/SKILL.md`:

1. No `description` do cabeçalho, depois de "a guarda de rota e a tela `#/acessos`", acrescente ", e os níveis dentro das telas (Excluir só Gestor, campos sensíveis de Funcionários, visões da Página Inicial)". E na lista "Use ao mudar", acrescente `apps/shell/src/app/{nivel,useNivel}*`.
2. Antes de `## Casos de borda`, acrescente a seção:

```markdown
## Níveis dentro das telas (plano 3)
- Código: `apps/shell/src/app/{nivel.ts,useNivel.ts,ComAcessos.tsx}`; consumidores em `pages/composicao` (linha de comando), `pages/comunicados` (lista e editor), `pages/treinamentos` (editor e anexos), `pages/documentos` (Checklist e ConfigDrawer), `pages/funcionarios` (Ficha, DocumentosArquivos, lista), `pages/qualidade/App.jsx` e `pages/inicio` (`domain/visoes.ts`).
- Regra: Excluir de tabela dona só para o Gestor da área (ou Administrador do Sistema); filha e Base para todos da área, como o gerador. Para o Operador o botão não aparece. Campo de Funcionários sem leitura do grupo some; sem edição fica desabilitado. Configurações da Qualidade (opções de choice = metadata) só para Administrador do Sistema.
- Testes: `pnpm --filter @betinhos/shell exec vitest run --maxWorkers=2 src/app/nivel.test.ts src/app/useNivel.test.tsx src/pages/composicao/ComposicaoPage.acessos.test.tsx src/pages/comunicados/ComunicadosPage.acessos.test.tsx src/pages/treinamentos/TreinamentosPage.acessos.test.tsx src/pages/documentos/components src/pages/funcionarios/components/Ficha.test.tsx src/pages/funcionarios/components/DocumentosArquivos.test.tsx src/pages/funcionarios/data/lista.test.ts src/pages/qualidade src/pages/inicio` → todos passam.
- Mock (`pnpm dev`, porta 36472):
  1. `?acessos=financeiro:operador#/composicao`: marcar uma linha → barra da seleção com "Gerar OP" e sem "Excluir".
  2. `?acessos=financeiro:gestor#/composicao`: marcar uma linha → "Excluir" aparece e pede confirmação ("Excluir 1").
  3. `?acessos=rh:operador#/funcionarios`: abrir um funcionário → aba Dados sem CPF, RG, filiação, endereço e telefones pessoais; vínculo e admissão editáveis; chips só CNH e ASO; aba Documentos sem lixeira nos arquivos. `?acessos=rh:gestor` → dados pessoais editáveis e lixeira de volta.
  4. `?acessos=rh:operador#/inicio`: saudação, comunicado, Planner e Radar; sem seletor de visão, sem indicadores e sem "Erro parcial" nem "indisponível". `?acessos=financeiro:operador#/inicio` → seletor Operação, Financeiro e Gestão (sem TI).
  5. `?acessos=operacional:operador#/comunicados` e `#/qualidade`: rascunho sem lixeira, editor sem "Excluir rascunho", Qualidade sem "Configurações". `?acessos=rh:operador#/treinamentos`: rascunho sem "Excluir rascunho", anexos sem lixeira.
  6. Repetir 1, 3 e 4 em 375 px. Console sem erro nem aviso.
- Prova no DEV (o shell não é a fronteira, então a prova é que o Dataverse e a tela concordam): com o usuário de teste do Renan (`DV_TESTE_ID`, nunca id real em arquivo) em `Perfil - Financeiro - Operador`, `RetrieveUserPrivileges` não lista `prvDeletecr40f_composicaodeprecos`; em `Perfil - Financeiro - Gestor`, lista. Abrir o shell no DEV como esse usuário (sessão do Renan) e repetir os passos 1 e 2. Voltar o usuário ao Base no fim.
- Não verificável em mock: a recusa real do Dataverse para quem força a URL ou a API; o erro de permissão que a tela já mostra cobre esse caso.
```

3. Em `## Shell (...)`, no item "Testes", acrescente `src/pages/inicio` à lista de pastas.

- [ ] **Passo 2: prints da UI (obrigatório)**

Com `pnpm dev` (porta 36472; num worktree sem `node_modules`, skill `print-ui`), capture em 1440 px e em 375 px:
- `?acessos=financeiro:operador#/composicao` com uma linha marcada (sem Excluir) e o mesmo com `financeiro:gestor` (com Excluir);
- `?acessos=rh:operador#/funcionarios` com a ficha aberta na aba Dados;
- `?acessos=rh:operador#/inicio`.

Copie os PNG para `~/.t3/userdata/attachments/<nome-sem-espacos>.png`, embuta no chat com o caminho absoluto expandido e informe o caminho em texto.

- [ ] **Passo 3: ux-audit modo Rápido**

Rode a skill `ux-audit` no modo Rápido sobre as quatro telas do Passo 2 (clicar, marcar linha, abrir ficha, trocar perfil pela URL). No chat: veredito e até 5 achados com local e correção; relatório completo em arquivo no scratchpad. Achado de layout (ex.: barra da seleção com um botão só desalinhada, fieldset vazio na ficha) é corrigido antes do PR, com teste quando couber.

- [ ] **Passo 4: tipos e testes tocados**

`pnpm --filter @betinhos/shell exec tsc --noEmit 2>&1 | tail -15` → limpo. Rodar o comando de testes da seção nova da skill (Passo 1) → todos passam. A suíte inteira fica para o CI do PR.

- [ ] **Passo 5: qualidade e verificação**

Skill `qualidade-antes-do-pr` sobre o diff inteiro (`git diff origin/develop...HEAD`), depois `verificacao-manter` (roda `verificar-acessos` e as skills das áreas tocadas: `verificar-composicao`, `verificar-comunicados`, `verificar-treinamentos`, `verificar-shell`; atualiza a skill se faltar algo). Conferir que nenhum arquivo traz nome de pessoa real, id, CPF ou `sig=`:

```bash
git diff origin/develop...HEAD | rg -n "sig=|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" | head
```

Esperado: vazio (os ids de mock que já existiam não aparecem no diff).

- [ ] **Passo 6: commit da skill**

```bash
git add .claude/skills/verificar-acessos/SKILL.md
git commit -m "$(cat <<'EOF'
docs(verificar-acessos): roteiro dos níveis dentro das telas

Acrescenta à skill os testes e o roteiro de mock do plano 3: Composição
sem Excluir para o Operador do Financeiro, ficha sem dados pessoais para o
Operador do RH, Início sem erro para quem não lê reservas, Comunicados,
Treinamentos, Documentos e Qualidade por nível, e a prova no DEV com o
usuário de teste por variável de ambiente.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Passo 7: PR para a `develop`**

```bash
git push -u origin feat/acessos-niveis-telas
gh pr create --base develop --title "feat(acessos): níveis dentro das telas (plano 3)" --body "$(cat <<'EOF'
## O que muda
- `app/nivel.ts` e `app/useNivel.ts`: pode ler, pode excluir e lê/edita coluna, calculados dos mesmos JSON que geram os papéis.
- Excluir só para o Gestor da área dona (ou Administrador do Sistema): Composição, Comunicados, Treinamentos (rascunho e anexo), Documentos (arquivo e tipo) e arquivos da ficha do funcionário. Para o Operador o botão não aparece.
- Qualidade: Configurações (opções de choice, metadata) só para Administrador do Sistema.
- Funcionários: campos da ficha, colunas, filtros e chips seguem os grupos de colunas do perfil.
- Página Inicial: visão padrão = a primeira que o perfil lê; seletor só com as permitidas; RH e Administrador de acessos sem "indisponível".

## Fora
Visões pessoais, Planner, remoção em formulário local, disassociate, foto de equipamento e item de pagamento a terceiro (tabelas filhas) e anotações (cada um exclui as próprias pelo Base).

## Verificação
- Testes dos arquivos tocados e `tsc` locais; suíte completa no CI.
- Prints e ux-audit Rápido no chat da sessão.
- Não verificado aqui: a recusa real do Dataverse no DEV (roteiro na skill `verificar-acessos`).

O shell não é a fronteira de segurança; quem barra é o Dataverse (plano 1).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

O merge é do Renan. Depois do merge, o Deploy publica no DEV; a versão de build sai dele.

---

## Auto-revisão

### Cobertura do pedido

| Item do escopo | Onde |
|---|---|
| 1. Hook genérico de nível sobre `useAcessos` + `temPerfil`, no padrão de `useAcessoConfigApp` | Tarefas 2 e 3 |
| 2. Excluir só Gestor: composição | Tarefa 4 |
| 2. comunicados (lista e editor) | Tarefa 5 |
| 2. qualidade (opção de choice) | Tarefa 8 (aba inteira só admin, por ser metadata) |
| 2. treinamentos (rascunho e anexo) | Tarefa 6 |
| 2. documentos (tipo e arquivo) | Tarefa 7 |
| 2. funcionários (arquivo) | Tarefa 7 (`DocumentosArquivos`) |
| 2. funcionários (anotação) | Fora, ver "Limitações assumidas" |
| 2. equipamentos (foto) e pagamento-fornecedores (L992) | Fora: tabelas filhas, o Operador já exclui (teste em `nivel.test.ts`) |
| 3. Colunas sensíveis com função pura e teste | Tarefa 2 (`acessoGrupo`, `acessoColuna`) |
| 3. `funcionarios.pessoal` na Ficha, lista e filtros | Tarefas 9 e 10 |
| 3. `funcionarios.rh` na edição | Tarefa 9 (editável para RH; some para Administrador de acessos) |
| 3. `financeiro.valor` edição só Gestor | Tarefa 2, Passo 5: o shell não edita; regra testada |
| 3. `veiculos.patrimonio` | Tarefa 2, Passo 5: nada a fazer |
| 4. Início por perfil, mapa visão → perfis | Tarefa 11 |
| 5. TDD, mock por `?acessos=`, testes só dos tocados, commits | todas |
| 6. Skill `verificar-acessos` com o roteiro pedido | Tarefa 12, Passo 1 |
| Print e ux-audit Rápido | Tarefa 12, Passos 2 e 3 |

### Fora deste plano

- Visões pessoais, Planner, remoção em formulário local e disassociate (`$ref`), como decidido.
- Foto de perfil do funcionário ("Remover" limpa a imagem: é Write, não Delete).
- Coluna `new_composicaodepreco` da reserva (`cr40f_reservadeveculos.composicao`): só o Gestor do Financeiro edita pelo mapa de colunas; se alguma tela do Operador gravar essa coluna, o Dataverse recusa e a tela mostra o erro existente. Conferir no plano 4 ou quando aparecer.
- Corte dos papéis antigos (plano 4).

### Limitações assumidas

- Anotações da ficha: o Base dá Delete Basic (cada um exclui as próprias), e a tela só tem o nome do autor, não o id do dono. O botão continua; se não for a dona, o Dataverse recusa e a tela mostra o erro que já existe.
- Arquivos no SharePoint (anexo de treinamento, arquivo de documento, pasta da ficha) seguem o Delete da tabela dona; o flow de exclusão não confere perfil, então o shell é a única barreira para quem chama a tela. Quem chamar o flow direto ainda consegue: registrar para o plano 4 (conferir o perfil no flow ou mover a exclusão para Custom API).
- Enquanto os acessos carregam ou falham, `usePodeExcluir` devolve `false` e a ficha esconde os grupos protegidos (vale `NENHUM`); no sucesso a tela se ajusta sozinha.
- Visões salvas da lista de Funcionários que citem coluna escondida: o `useListView` recebe só as colunas do perfil; se a visão salva mostrar coluna vazia, a correção fica no `useListView` (fora deste plano).

### Consistência de nomes

- `podeLer`, `podeExcluir`, `acessoGrupo`, `acessoColuna`, `AcessoColuna` (Tarefa 2) são os mesmos nos hooks (Tarefa 3), na lista (Tarefa 10) e no Início (Tarefa 11).
- `useAcessosProntos`, `usePodeExcluir`, `useAcessoColunas`, `ComAcessos` (Tarefa 3) são os nomes usados nas Tarefas 4 a 11.
- Tabelas: `cr40f_composicaodeprecos`, `new_comunicadomotorista`, `cr40f_treinamento`, `cr40f_documento`, `cr40f_tipodocumento`, `cr40f_funcionarios` conferidas em `acessosMapa.json` (todas `donas`); `cr40f_fotoequipamento` e `cr40f_itempagamentoaterceiro` são `filhas`.
- Grupos: `cr40f_funcionarios.{basico,cnh,rh,pessoal}`, `cr40f_financeiro.valor`, `cr40f_veiculos.patrimonio` conferidos em `acessosColunas.json`.
- Branch `feat/acessos-niveis-telas` na Tarefa 1 e no PR da Tarefa 12.

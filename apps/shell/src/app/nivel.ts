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

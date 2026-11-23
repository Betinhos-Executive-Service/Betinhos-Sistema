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

const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
/** Dia (aaaa-mm-dd) no fuso da tela, para o filtro bater com o que se lê. */
export const diaSaoPaulo = (d: Date) => DIA.format(d)

export function readPessoa(p: Pessoa, key: string): unknown {
  switch (key) {
    case 'nome': return p.nome
    case 'email': return p.email
    case 'perfis': return rotulos(p.perfis).join(', ')
    case 'acessos': return p.perfis.acessos ? 'sim' : 'nao'
    case 'admin': return p.admin ? 'sim' : 'nao'
    case 'alterado': return p.alteradoEm ? diaSaoPaulo(p.alteradoEm) : null
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

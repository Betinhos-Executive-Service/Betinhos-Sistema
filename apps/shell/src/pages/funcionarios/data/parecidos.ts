import { digitsOnly, normalizeSearch } from './format'
import { FUNCAO, STATUS } from './schema'

/** Funcionário que pode ser a mesma pessoa do cadastro de acesso (nome, celular ou CPF iguais). */
export type FuncionarioParecido = { id: string; nome: string; funcao: string; status: string; celular: string; cpf: string; temAcesso: boolean; motivos: ('nome' | 'celular' | 'cpf')[] }
export type BuscaParecido = { nome: string; celular: string; cpf?: string }
export type LinhaFuncionario = { id: string; nome: string; telefones: (string | null)[]; cpf: string | null; funcao: number | null; status: number | null; emailMicrosoft: string | null }

/** Igual a AcessoRules.NomeComparavel do plugin. */
const nomeComparavel = (nome: string) => normalizeSearch(nome).trim().split(/\s+/).filter(Boolean).join(' ')

/** Igual a AcessoRules.NormalizarCelular do plugin: 11 dígitos com DDD, com ou sem 55; inválido vira ''. */
function celularComparavel(valor: string | null) {
  let d = digitsOnly(valor ?? '')
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2)
  return d.length === 11 && d[2] === '9' ? d : ''
}

export function cpfMascarado(cpf: string) {
  const d = digitsOnly(cpf)
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : ''
}

const rotulo = (opcoes: { value: number; label: string }[], valor: number | null) => opcoes.find((o) => o.value === valor)?.label ?? '—'

/** `emailsAtivos`: e-mails (minúsculos) de systemusers habilitados; com e-mail Microsoft e usuário ativo = já tem acesso. */
export function encontrarParecidos(busca: BuscaParecido, linhas: LinhaFuncionario[], emailsAtivos: Set<string>): FuncionarioParecido[] {
  const nome = nomeComparavel(busca.nome)
  const celular = celularComparavel(busca.celular)
  const cpf = digitsOnly(busca.cpf ?? '')
  return linhas.flatMap((l) => {
    const motivos: FuncionarioParecido['motivos'] = []
    if (nome && nomeComparavel(l.nome) === nome) motivos.push('nome')
    if (celular && l.telefones.some((t) => celularComparavel(t) === celular)) motivos.push('celular')
    if (cpf.length === 11 && digitsOnly(l.cpf ?? '') === cpf) motivos.push('cpf')
    if (motivos.length === 0) return []
    const email = l.emailMicrosoft?.trim().toLowerCase()
    return [{
      id: l.id, nome: l.nome, funcao: rotulo(FUNCAO, l.funcao), status: rotulo(STATUS, l.status),
      celular: l.telefones.find((t) => t) ?? '', cpf: cpfMascarado(l.cpf ?? ''), temAcesso: Boolean(email && emailsAtivos.has(email)), motivos,
    }]
  })
}

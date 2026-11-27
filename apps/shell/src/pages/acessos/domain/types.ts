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
  /** Administrador do Sistema ou papel antigo (Acesso-Betinhos-MDA, DEV - Usuário), direto ou por equipe: o que "Tirar acesso amplo" retira. */
  amplo: boolean
  alteradoEm: Date | null
  /** Há funcionário ativo com este e-mail Microsoft; a tela Acessos lista só quem não tem. */
  temFicha: boolean
  /** Id do funcionário ativo com este e-mail Microsoft (para abrir a ficha); `null` sem ficha. */
  fichaId?: string | null
}

/** `cr40f_amplo` do histórico: papéis que a retirada tirou ou a devolução repôs; `encerrar`/`reativar` são do ciclo do administrativo (papéis diretos). */
export type AcaoAmplo = 'retirar' | 'devolver' | 'encerrar' | 'reativar'
/** Item de papel, perfil de coluna ou equipe do JSON; `nome` vem vazio quando o plugin gravou só o id (JSON acima de 4000 caracteres). */
export type ItemAmplo = { id: string; nome: string }
export type AmploHistorico = { acao: AcaoAmplo; papeis: ItemAmplo[]; perfisColuna?: ItemAmplo[]; equipes?: ItemAmplo[] }
export type Historico = { id: string; usuarioId: string; usuario: string; alteradoPor: string; antes: PerfisPessoa; depois: PerfisPessoa; quando: Date | null; amplo?: AmploHistorico | null }
/** `equipesRestritas`: ids (minúsculos) das equipes cujos papéis exigem o Administrador do Sistema (amplo ou Administrador de acessos). */
export type Dados = { pessoas: Pessoa[]; historico: Historico[]; euId: string; equipesRestritas?: string[] }
export type ErroApi = { codigo: string | null; mensagem: string }
/** Pessoa com a conta bloqueada cujo último registro do histórico é um encerramento. `encerradoPor` é o nome de quem encerrou; `ciclo` e `antes` são o JSON e os perfis desse encerramento (o que volta no Reativar). */
export type Encerrado = { id: string; nome: string; email: string; encerradoEm: Date | null; encerradoPor: string; ciclo?: AmploHistorico | null; antes?: PerfisPessoa; /** Ficha do funcionário com este e-mail, de qualquer situação; `null` sem ficha. */ fichaId?: string | null }

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
  /** Há funcionário ativo com este e-mail Microsoft; a tela Acessos lista só quem não tem. */
  temFicha: boolean
}

export type Historico = { id: string; usuarioId: string; usuario: string; alteradoPor: string; antes: PerfisPessoa; depois: PerfisPessoa; quando: Date | null }
export type Dados = { pessoas: Pessoa[]; historico: Historico[]; euId: string }
export type ErroApi = { codigo: string | null; mensagem: string }

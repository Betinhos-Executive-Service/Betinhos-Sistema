import { PAPEIS_RENAN } from '../../../app/papeisUsuario'

/** Função que dá acesso à configuração do App (mesmo nome do servidor: `AppConfigAutorizacao.FuncaoGestor`). */
export const PAPEL_GESTOR = 'Perfil - Operacional - Gestor'

export type Acesso = {
  /** Vê e altera a configuração (matriz, exceções, publicação). */
  gestor: boolean
  /** Só o Administrador do Sistema mexe no grupo piloto. */
  admin: boolean
}

export const SEM_ACESSO: Acesso = { gestor: false, admin: false }

/**
 * Único ponto a trocar quando o módulo Acessos existir: aí vira `temPerfil('operacional', 'gestor')`
 * (e o administrador continua valendo).
 */
export function acessoPorPapeis(papeis: readonly string[]): Acesso {
  const admin = papeis.some((p) => PAPEIS_RENAN.includes(p))
  return { admin, gestor: admin || papeis.includes(PAPEL_GESTOR) }
}

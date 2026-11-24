export type Acesso = {
  /** Vê e altera a configuração (matriz, exceções, publicação). */
  gestor: boolean
  /** Só o Administrador do Sistema mexe no grupo piloto. */
  admin: boolean
}

export const SEM_ACESSO: Acesso = { gestor: false, admin: false }

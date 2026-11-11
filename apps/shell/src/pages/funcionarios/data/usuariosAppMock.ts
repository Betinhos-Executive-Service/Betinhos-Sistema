/** systemusers do mock (e-mail → habilitado): a fonte de funcionários lê, o mock de acesso muda ao encerrar e reativar. */
export const USUARIOS_APP_INICIAL: Readonly<Record<string, boolean>> = { 'carlos.teste@betinhos.onmicrosoft.com': true, 'joana.teste@betinhos.onmicrosoft.com': false }

export const usuariosAppMock: Record<string, boolean> = { ...USUARIOS_APP_INICIAL }

/** Cada fonte mock começa do zero (testes e recarga da página não herdam alterações). */
export function reiniciarUsuariosAppMock() {
  for (const email of Object.keys(usuariosAppMock)) delete usuariosAppMock[email]
  Object.assign(usuariosAppMock, USUARIOS_APP_INICIAL)
}

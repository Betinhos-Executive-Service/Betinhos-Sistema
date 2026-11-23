/**
 * Catálogo fixo do que o gestor liga e desliga no App Motoristas (spec 2026-11-23-config-app-motoristas-design.md, seção 4).
 * A cópia em C# (`AppConfigResolver.cs`, plugin de Acesso) e este arquivo são conferidas contra `casos.json` (seção `catalogo`).
 */
export type Perfil = 'proprio' | 'terceiro'
export type TipoChave = 'modulo' | 'funcao'

export interface EntradaCatalogo {
  chave: string
  rotulo: string
  tipo: TipoChave
  /** Chave do módulo pai; a função só vale com ele ligado. */
  pai: string | null
  /** Sempre ligada: não aceita desligar na matriz nem exceção. */
  fixa: boolean
  sensivel: boolean
  /** Valor de partida: reserva quando não há versão publicada. Admin (piloto) é sempre tudo ligado. */
  padrao: { proprio: boolean; terceiro: boolean; admin: boolean }
}

const ligado = { proprio: true, terceiro: true, admin: true } as const
const desligado = { proprio: false, terceiro: false, admin: true } as const

export const CATALOGO: readonly EntradaCatalogo[] = [
  { chave: 'services', rotulo: 'Serviços', tipo: 'modulo', pai: null, fixa: true, sensivel: false, padrao: ligado },
  { chave: 'comunicados', rotulo: 'Comunicados', tipo: 'modulo', pai: null, fixa: true, sensivel: false, padrao: ligado },
  { chave: 'history', rotulo: 'Histórico', tipo: 'modulo', pai: null, fixa: false, sensivel: false, padrao: ligado },
  { chave: 'checklists', rotulo: 'Checklists', tipo: 'modulo', pai: null, fixa: false, sensivel: false, padrao: ligado },
  { chave: 'multas', rotulo: 'Multas', tipo: 'modulo', pai: null, fixa: false, sensivel: true, padrao: desligado },
  { chave: 'treinamentos', rotulo: 'Treinamentos', tipo: 'modulo', pai: null, fixa: false, sensivel: false, padrao: ligado },
  { chave: 'postosProximos', rotulo: 'Postos próximos', tipo: 'modulo', pai: null, fixa: false, sensivel: false, padrao: ligado },
  { chave: 'maintenancePhoto', rotulo: 'Manutenção', tipo: 'modulo', pai: null, fixa: false, sensivel: false, padrao: ligado },
  { chave: 'expenses', rotulo: 'Gastos', tipo: 'modulo', pai: null, fixa: false, sensivel: false, padrao: ligado },
  { chave: 'collisions', rotulo: 'Colisões', tipo: 'modulo', pai: null, fixa: false, sensivel: false, padrao: ligado },
  { chave: 'minhaNota', rotulo: 'Minha nota', tipo: 'modulo', pai: null, fixa: false, sensivel: false, padrao: ligado },
  { chave: 'ideas', rotulo: 'Boas ideias', tipo: 'modulo', pai: null, fixa: false, sensivel: false, padrao: ligado },
  { chave: 'services.qrCharge', rotulo: 'Cobrar por QR', tipo: 'funcao', pai: 'services', fixa: false, sensivel: true, padrao: desligado },
  { chave: 'services.personalReceipt', rotulo: 'Recibo personalizado', tipo: 'funcao', pai: 'services', fixa: false, sensivel: true, padrao: desligado },
]

export function entradaDoCatalogo(chave: string): EntradaCatalogo | undefined {
  return CATALOGO.find((e) => e.chave === chave)
}

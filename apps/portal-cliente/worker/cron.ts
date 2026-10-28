// Cron diário (8h em São Paulo, seg–sex): aprovação tácita e resumo por e-mail para os validadores de cada cliente.
import type { Dv } from './dataverse'
import { enviarEmail } from './dataverse'
import type { Env } from './env'
import { mapearServico, type Registro } from './mapear'
import { resumoDoCliente, tacitaVencida } from './odata'
import { diaLocal, ehDiaUtil, inicioJanelaResumo } from './prazo'
import { SET, STATUS_DV } from './schema'

export async function aplicarTacita(dv: Dv, agoraMs: number): Promise<number> {
  const vencidas = await dv.lista(tacitaVencida(diaLocal(agoraMs)))
  const quando = new Date(agoraMs).toISOString()
  for (const v of vencidas) {
    await dv.patch(`${SET.validacao}(${v.cr40f_validacaoservicoid})`, { cr40f_status: STATUS_DV.aprovado_tacito, cr40f_aprovadoem: quando })
  }
  return vencidas.length
}

const resumir = (r: Registro) => {
  const s = mapearServico(r)
  return s && { numero: s.numero, saida: s.saida, origem: s.origem, destino: s.destino, valorTotal: s.valorTotal, prazoTacito: s.prazoTacito }
}

export async function enviarResumos(env: Env, dv: Dv, agoraMs: number): Promise<number> {
  const hoje = diaLocal(agoraMs)
  if (!ehDiaUtil(hoje)) return 0
  const validadores = await dv.lista(
    `${SET.validador}?$select=cr40f_email,_cr40f_cliente_value&$filter=${encodeURIComponent('cr40f_ativo eq true and cr40f_Cliente/cr40f_portalhabilitado eq true')}`,
  )
  const porCliente = Map.groupBy(validadores, (v) => String(v._cr40f_cliente_value))
  let enviados = 0
  for (const [cid, vs] of porCliente) {
    const desde = new Date(inicioJanelaResumo(agoraMs)).toISOString()
    const registros = await dv.lista(resumoDoCliente(cid, desde, hoje))
    const liberados = registros.filter((r) => String(r.cr40f_liberadoem) >= desde).map(resumir).filter(Boolean)
    const vencendoHoje = registros.filter((r) => String(r.cr40f_prazotacita).slice(0, 10) === hoje).map(resumir).filter(Boolean)
    if (!liberados.length && !vencendoHoje.length) continue
    const cliente = String(vs[0]['_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue'] ?? '')
    await enviarEmail(env, 'resumo_diario', vs.map((v) => String(v.cr40f_email)), { cliente, data: hoje, liberados, vencendoHoje })
    enviados++
  }
  return enviados
}

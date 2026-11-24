// Cron diário (8h em São Paulo, seg–sex): aprovação tácita e resumo por e-mail para os validadores de cada cliente.
import { dataHora, diaBr } from '../src/domain/formato'
import type { Dv } from './dataverse'
import { enviarEmail } from './dataverse'
import type { Env } from './env'
import { mapearServico, modulosDe, type Registro } from './mapear'
import { resumoDoCliente, tacitaVencida, validadoresAtivos } from './odata'
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

// Formato do contrato do flow "Portal cliente – e-mails" (templates resumo-linha-*.html).
const liberado = (r: Registro) => {
  const s = mapearServico(r)
  return s && { numero: s.numero, data: s.saida ? dataHora(s.saida) : '', trajeto: `${s.origem} → ${s.destino}`, valor: s.valorTotal }
}
const vencendo = (r: Registro) => {
  const s = mapearServico(r)
  return s && { numero: s.numero, prazo: diaBr(s.prazoTacito) }
}

export async function enviarResumos(env: Env, dv: Dv, agoraMs: number): Promise<number> {
  const hoje = diaLocal(agoraMs)
  if (!ehDiaUtil(hoje)) return 0
  // Só quem valida: cliente com Pedir/Meus serviços (Latasa) não recebe resumo de validação.
  const validadores = (await dv.lista(validadoresAtivos())).filter((v) => modulosDe(v).includes('validar'))
  const porCliente = Map.groupBy(validadores, (v) => String(v._cr40f_cliente_value))
  let enviados = 0
  for (const [cid, vs] of porCliente) {
    const desde = new Date(inicioJanelaResumo(agoraMs)).toISOString()
    const registros = await dv.lista(resumoDoCliente(cid, desde, hoje))
    const liberadosHoje = registros.filter((r) => String(r.cr40f_liberadoem) >= desde).map(liberado).filter(Boolean)
    const vencendoHoje = registros.filter((r) => String(r.cr40f_prazotacita).slice(0, 10) === hoje).map(vencendo).filter(Boolean)
    if (!liberadosHoje.length && !vencendoHoje.length) continue
    const cliente = String(vs[0]['_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue'] ?? '')
    // Um e-mail por validador: o flow exige o nome de quem recebe. Falha de um não impede os demais.
    for (const v of vs) {
      const email = String(v.cr40f_email ?? '')
      const dados = { nome: String(v.cr40f_name || email.split('@')[0]), cliente, linkPortal: env.PORTAL_URL, liberadosHoje, vencendo: vencendoHoje }
      try {
        await enviarEmail(env, 'resumo_diario', [email], dados)
        enviados++
      } catch (e) {
        console.error('cron/resumo', String(e))
      }
    }
  }
  return enviados
}

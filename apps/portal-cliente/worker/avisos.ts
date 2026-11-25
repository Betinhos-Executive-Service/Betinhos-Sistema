// Rotina de 10 em 10 minutos: pedido confirmado (solicitante e passageiros), lembrete de aprovação (2 h) e aviso à operação (12 h antes da saída).
// Cada aviso sai uma vez por pedido: a marca vai no KV só depois do envio, então falha de e-mail repete na rodada seguinte.
import { dataHora } from '../src/domain/formato'
import { aprovadoresDoPedido, avisarAprovadores, paraAprovar, quandoETrajeto, solicitanteDe } from './aprovacao'
import type { Dv } from './dataverse'
import { enviarEmail } from './dataverse'
import type { Env } from './env'
import { mapearPedido, str, type Registro } from './mapear'
import { confirmadosDesde, pendentesDeAprovacao } from './odata'

const HORA = 3_600_000
const LEMBRETE_APOS_MS = 2 * HORA
const AVISO_OPERACAO_ANTES_MS = 12 * HORA
const JANELA_CONFIRMADOS_MS = 48 * HORA
const TTL_MARCA = 90 * 24 * 3600

const jaFoi = async (env: Env, chave: string) => (await env.KV.get(chave)) !== null
const marcar = (env: Env, chave: string) => env.KV.put(chave, '1', { expirationTtl: TTL_MARCA })

export type ResultadoAvisos = { confirmados: number; lembretes: number; operacao: number }

/** Solicitante e passageiros com e-mail, sem repetir (comparado em minúsculas). */
function destinatarios(r: Registro, pedido: ReturnType<typeof mapearPedido>): string[] {
  const todos = [str(solicitanteDe(r), 'cr40f_email'), ...pedido.pessoas.map((p) => p.email ?? '')].map((e) => e.trim()).filter(Boolean)
  return [...new Map(todos.map((e) => [e.toLowerCase(), e])).values()]
}

async function avisarConfirmados(env: Env, dv: Dv, agoraMs: number): Promise<number> {
  const registros = await dv.lista(confirmadosDesde(new Date(agoraMs - JANELA_CONFIRMADOS_MS).toISOString()))
  let enviados = 0
  for (const r of registros) {
    const id = str(r, 'cr40f_reservadeveculosid')
    const chave = `aviso:confirmado:${id}`
    if (!id || (await jaFoi(env, chave))) continue
    const pedido = mapearPedido(r, '')
    // Saída já passada: confirmar não faz sentido (também evita rajada de e-mails na primeira rodada, com o KV vazio).
    if (pedido.saida && Date.parse(pedido.saida) <= agoraMs) continue
    const para = destinatarios(r, pedido)
    try {
      if (para.length) {
        await enviarEmail(env, 'pedido_confirmado', para, {
          numero: pedido.numero, data: pedido.saida ? dataHora(pedido.saida) : '', origem: pedido.origem, destino: pedido.destino, passageiros: pedido.passageiros.join(', '),
        })
        enviados++
      }
      await marcar(env, chave)
    } catch (e) {
      console.error('avisos/confirmado', id, String(e))
    }
  }
  return enviados
}

async function avisarPendentes(env: Env, dv: Dv, agoraMs: number): Promise<{ lembretes: number; operacao: number }> {
  const registros = await dv.lista(pendentesDeAprovacao())
  let lembretes = 0
  let operacao = 0
  for (const r of registros) {
    const id = str(r, 'cr40f_reservadeveculosid')
    if (!id) continue
    const criadoEm = Date.parse(str(r, 'createdon'))
    const saida = Date.parse(str(r, 'cr40f_dataehorriodesada'))

    const chaveLembrete = `aviso:lembrete:${id}`
    if (Number.isFinite(criadoEm) && agoraMs - criadoEm >= LEMBRETE_APOS_MS && !(await jaFoi(env, chaveLembrete))) {
      const aprovadores = await aprovadoresDoPedido(dv, str(r, '_cr40f_cliente_value'), str(r, '_cr40f_portalusuario_value'))
      const enviados = await avisarAprovadores(env, 'aprovacao_lembrete', r, aprovadores)
      lembretes += enviados
      // Sem aprovador a avisar não há o que repetir; com aprovadores e nenhum envio, a próxima rodada tenta de novo.
      if (enviados || !aprovadores.length) await marcar(env, chaveLembrete)
    }

    const chaveOperacao = `aviso:operacao:${id}`
    if (Number.isFinite(saida) && saida > agoraMs && saida - agoraMs <= AVISO_OPERACAO_ANTES_MS && !(await jaFoi(env, chaveOperacao))) {
      const p = paraAprovar(r)
      try {
        // `para` vazio: o flow envia à caixa compartilhada da operação (a mesma que usa como remetente).
        await enviarEmail(env, 'aviso_operacao', [], { numero: p.numero, solicitante: p.solicitante, cliente: str(r, '_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue'), ...quandoETrajeto(p), passageiros: p.passageiros.join(', ') })
        await marcar(env, chaveOperacao)
        operacao++
      } catch (e) {
        console.error('avisos/operacao', id, String(e))
      }
    }
  }
  return { lembretes, operacao }
}

export async function rodarAvisos(env: Env, dv: Dv, agoraMs: number): Promise<ResultadoAvisos> {
  const [confirmados, pend] = await Promise.all([
    avisarConfirmados(env, dv, agoraMs).catch((e) => (console.error('avisos/confirmados', String(e)), 0)),
    avisarPendentes(env, dv, agoraMs).catch((e) => (console.error('avisos/pendentes', String(e)), { lembretes: 0, operacao: 0 })),
  ])
  return { confirmados, ...pend }
}

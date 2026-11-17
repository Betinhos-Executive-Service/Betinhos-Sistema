// apps/shell/src/pages/frota/domain/conclusao.ts
import { exigirFormato, type TipoArquivo } from '../data/arquivosManutencao'
import { ANEXO_DESPESA, LIMITE, PAGAMENTO } from '../data/schema'
import type { AlvoArquivo, ArquivoEnviado, ArquivosManutencao, ComandosManutencao, OrigemArquivo, PedidoConclusao, RespostaConclusao } from '../data/source'
import type { DetalheManutencao } from '../data/types'
import { errorMessage } from '../data/xrm'
import { lerKm } from './km'

/** Campos da conclusão: os mesmos do App (serviços do catálogo, km, data, valor, pagamento, estabelecimento, cidade, quem realizou, comentário, nota e fotos). */
export type ValoresConclusao = { servicos: number[]; km: string; data: string; valor: string; pagamento: string; estabelecimento: string; cidadeId: string; realizadoPorId: string; servicoRealizado: string; comentario: string; notas: File[]; fotos: File[] }
export type ErrosConclusao = Partial<Record<keyof ValoresConclusao, string>>
/** O pedido do cr40f_ManutencaoConcluir antes do envio dos arquivos (os links entram depois). */
export type BaseConclusao = Omit<PedidoConclusao, 'linkNotaFiscal' | 'linkFotoFinal1' | 'linkFotoFinal2' | 'linkFotoFinal3'>
export type ContextoConclusao = { manutencaoId: string; kmPedido: number | null; temNotaGravada: boolean }
export type LeituraConclusao = { erros: ErrosConclusao; aviso: string | null; pedido: BaseConclusao | null }

export const MAX_FOTOS_FINAIS = 3
const PAGAMENTOS: number[] = Object.values(PAGAMENTO)
const DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

const formatoSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** Agora em São Paulo no formato do campo datetime-local (YYYY-MM-DDTHH:mm). */
export function agoraLocalSP(agora = new Date()) {
  const p = Object.fromEntries(formatoSP.formatToParts(agora).map((parte) => [parte.type, parte.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

export function valoresConclusaoIniciais(m: DetalheManutencao, agora = new Date()): ValoresConclusao {
  return {
    servicos: [...m.servicos],
    km: m.kmRealizado !== null ? String(m.kmRealizado) : '',
    data: agoraLocalSP(agora),
    valor: m.valor !== null ? String(m.valor) : '',
    pagamento: m.pagamento !== null ? String(m.pagamento) : '',
    estabelecimento: m.estabelecimento ?? '',
    cidadeId: '',
    realizadoPorId: m.realizadoPor?.id ?? '',
    servicoRealizado: m.servicoRealizado ?? '',
    comentario: m.comentarioColaborador ?? '',
    notas: [],
    fotos: [],
  }
}

const numeroBR = (n: number) => n.toLocaleString('pt-BR')

/** Mesma lista de formatos da camada de dados (`exigirFormato`): o erro aparece na tela antes de tentar enviar. */
function primeiroErroDeFormato(arquivos: File[], tipo: TipoArquivo): string | undefined {
  for (const arquivo of arquivos) {
    try { exigirFormato(arquivo, tipo) } catch (reason) { return (reason as Error).message }
  }
  return undefined
}

/** Mesmas exigências do Ciclo.ValidarConclusao (servidor), com o km menor que o do pedido só como aviso (spec). */
export function validarConclusao(v: ValoresConclusao, ctx: ContextoConclusao): LeituraConclusao {
  const erros: ErrosConclusao = {}
  if (v.servicos.length === 0) erros.servicos = 'Escolha pelo menos um serviço realizado'
  const km = lerKm(v.km)
  if (km === null) erros.km = 'Informe o km do veículo (número inteiro)'
  const data = DATA_HORA.test(v.data) && !Number.isNaN(new Date(`${v.data}:00-03:00`).getTime()) ? `${v.data}:00-03:00` : null
  if (!data) erros.data = 'Informe a data e a hora'
  const valor = Number(v.valor.trim().replace(',', '.'))
  if (!v.valor.trim() || !Number.isFinite(valor) || valor <= 0) erros.valor = 'Informe o valor pago'
  const pagamento = Number(v.pagamento)
  if (!PAGAMENTOS.includes(pagamento)) erros.pagamento = 'Escolha a forma de pagamento'
  const estabelecimento = v.estabelecimento.trim()
  if (!estabelecimento) erros.estabelecimento = 'Informe o estabelecimento'
  else if (estabelecimento.length > LIMITE.estabelecimento) erros.estabelecimento = `Máximo de ${LIMITE.estabelecimento} caracteres`
  if (!v.cidadeId) erros.cidadeId = 'Escolha a cidade'
  if (!v.realizadoPorId) erros.realizadoPorId = 'Escolha quem realizou'
  const servicoRealizado = v.servicoRealizado.trim()
  if (servicoRealizado.length > LIMITE.servicoRealizado) erros.servicoRealizado = `Máximo de ${LIMITE.servicoRealizado} caracteres`
  const comentario = v.comentario.trim()
  if (comentario.length > LIMITE.comentarioColaborador) erros.comentario = `Máximo de ${LIMITE.comentarioColaborador} caracteres`
  if (!ctx.temNotaGravada && v.notas.length === 0) erros.notas = 'Anexe a nota fiscal'
  else erros.notas = primeiroErroDeFormato(v.notas, 'nota')
  if (v.fotos.length > MAX_FOTOS_FINAIS) erros.fotos = `No máximo ${MAX_FOTOS_FINAIS} fotos`
  else erros.fotos = primeiroErroDeFormato(v.fotos, 'foto')
  for (const campo of ['notas', 'fotos'] as const) if (!erros[campo]) delete erros[campo]
  const aviso = km !== null && ctx.kmPedido !== null && km < ctx.kmPedido ? `O km informado (${numeroBR(km)}) é menor que o km do pedido (${numeroBR(ctx.kmPedido)}). Confira antes de concluir.` : null
  if (Object.keys(erros).length || !data || km === null) return { erros, aviso, pedido: null }
  return {
    erros, aviso,
    pedido: { manutencaoId: ctx.manutencaoId, servicos: [...new Set(v.servicos)], km, data, valor: Math.round(valor * 100) / 100, pagamento, estabelecimento, cidadeId: v.cidadeId, realizadoPorId: v.realizadoPorId, servicoRealizado: servicoRealizado || null, comentario: comentario || null },
  }
}

type FonteConclusao = Pick<ComandosManutencao, 'concluirManutencao'> & Pick<ArquivosManutencao, 'enviarArquivoManutencao' | 'anexarNotaFiscalDespesa'>

/** Um arquivo por vez: menos chamadas simultâneas ao flow e a ordem dos links é a da escolha. */
async function enviarTodos(source: FonteConclusao, alvo: AlvoArquivo, arquivos: File[], origem: OrigemArquivo) {
  const enviados: ArquivoEnviado[] = []
  for (const [indice, arquivo] of arquivos.entries()) enviados.push(await source.enviarArquivoManutencao(alvo, arquivo, origem, indice + 1))
  return enviados
}

/**
 * Concluir pelo shell, no mesmo caminho do App: sobe a nota e as fotos finais na pasta da manutenção, chama o
 * cr40f_ManutencaoConcluir e, se a despesa ainda espera o comprovante, sobe a nota nela. Falha antes da Custom API não
 * conclui nada. Falha depois (só na nota da despesa) não desfaz a conclusão e volta como aviso.
 */
export async function concluirPeloShell(source: FonteConclusao, alvo: AlvoArquivo, pedido: BaseConclusao, arquivos: { notas: File[]; fotos: File[] }): Promise<{ resposta: RespostaConclusao; avisoNota: string | null }> {
  const notas = await enviarTodos(source, alvo, arquivos.notas, 'NOTA_FISCAL')
  const fotos = await enviarTodos(source, alvo, arquivos.fotos.slice(0, MAX_FOTOS_FINAIS), 'POS_MANUTENCAO')
  const resposta = await source.concluirManutencao({
    ...pedido,
    linkNotaFiscal: notas.length ? notas.map((n) => n.link).join('\n') : null,
    linkFotoFinal1: fotos[0]?.link ?? null,
    linkFotoFinal2: fotos[1]?.link ?? null,
    linkFotoFinal3: fotos[2]?.link ?? null,
  })
  if (resposta.statusAnexo !== ANEXO_DESPESA.PENDENTE) return { resposta, avisoNota: null }
  if (!arquivos.notas.length) return { resposta, avisoNota: 'A manutenção foi concluída, mas a despesa ficou sem a nota fiscal. Anexe a nota na tela Despesas.' }
  try {
    await source.anexarNotaFiscalDespesa(resposta.despesaId, arquivos.notas, pedido.realizadoPorId)
    return { resposta, avisoNota: null }
  } catch (reason) {
    return { resposta, avisoNota: `A manutenção foi concluída, mas a nota fiscal não subiu na despesa (${errorMessage(reason)}). Anexe a nota na tela Despesas.` }
  }
}

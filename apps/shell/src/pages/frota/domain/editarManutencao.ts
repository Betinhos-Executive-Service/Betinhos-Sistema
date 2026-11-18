// apps/shell/src/pages/frota/domain/editarManutencao.ts
import { toDataverseDate, type DateBehavior } from '../data/dates'
import { cleanId } from '../data/mappers'
import { ENTITY_SET, LIMITE, MANUT } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { agoraLocalSP } from './conclusao'
import { lerKm } from './km'

/** Tudo em texto, como nos campos da tela. Lookups guardam o id. */
export type ValoresEdicao = {
  veiculoId: string; solicitanteId: string; descricao: string; km: string; tipo: string; grau: string; comentario: string
  janelaInicio: string; janelaFim: string
  dataManutencao: string; kmRealizado: string; valor: string; estabelecimento: string; servicoRealizado: string
}
export type ErrosEdicao = Partial<Record<keyof ValoresEdicao, string>>
export type LeituraEdicao = { erros: ErrosEdicao; patch: Record<string, unknown> }

const DIA = /^\d{4}-\d{2}-\d{2}$/
const DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** A seção Conclusão só aparece com a manutenção realizada ou com algum dado de conclusão já gravado. */
export const temConclusao = (m: DetalheManutencao) =>
  m.status === MANUT.REALIZADO || [m.dataManutencao, m.kmRealizado, m.valor, m.estabelecimento, m.servicoRealizado].some((v) => v !== null && v !== '')

const texto = (v: string | number | null) => (v === null ? '' : String(v))

function dataHoraLocal(iso: string | null) {
  if (!iso) return ''
  const data = new Date(iso)
  return Number.isNaN(data.getTime()) ? '' : agoraLocalSP(data)
}

export function valoresEdicaoIniciais(m: DetalheManutencao): ValoresEdicao {
  return {
    veiculoId: m.veiculo?.id ?? '', solicitanteId: m.solicitante?.id ?? '', descricao: m.descricao, km: texto(m.km), tipo: texto(m.tipo), grau: texto(m.grau), comentario: m.comentarioAprovador ?? '',
    janelaInicio: m.janelaInicio ?? '', janelaFim: m.janelaFim ?? '',
    dataManutencao: dataHoraLocal(m.dataManutencao), kmRealizado: texto(m.kmRealizado), valor: texto(m.valor), estabelecimento: m.estabelecimento ?? '', servicoRealizado: m.servicoRealizado ?? '',
  }
}

export const houveEdicao = (inicial: ValoresEdicao, atual: ValoresEdicao) => (Object.keys(inicial) as (keyof ValoresEdicao)[]).some((k) => inicial[k] !== atual[k])

function lerValor(bruto: string) {
  const numero = Number(bruto.trim().replace(',', '.'))
  return bruto.trim() && Number.isFinite(numero) && numero >= 0 ? Math.round(numero * 100) / 100 : null
}

/**
 * Valida e monta só as colunas que mudaram (nomes lógicos de cr40f_manutencoes). A janela e o grau gravam direto,
 * sem a Custom API de agendamento. `conclusao` = a seção Conclusão está na tela; fora dela nada é comparado.
 * `comportamentos` = DateBehavior das colunas de data (a janela é só data).
 */
export function lerEdicao(inicial: ValoresEdicao, atual: ValoresEdicao, conclusao: boolean, comportamentos: Record<string, DateBehavior> = {}): LeituraEdicao {
  const erros: ErrosEdicao = {}
  const patch: Record<string, unknown> = {}
  const mudou = (campo: keyof ValoresEdicao) => atual[campo].trim() !== inicial[campo].trim()

  if (!atual.veiculoId) erros.veiculoId = 'Escolha o veículo'
  else if (mudou('veiculoId')) patch['cr40f_Placa_Carro@odata.bind'] = `/${ENTITY_SET.veiculos}(${cleanId(atual.veiculoId)})`
  if (mudou('solicitanteId') && atual.solicitanteId) patch['cr40f_Solicitado_por@odata.bind'] = `/${ENTITY_SET.funcionarios}(${cleanId(atual.solicitanteId)})`

  const descricao = atual.descricao.trim()
  if (!descricao) erros.descricao = 'Descreva o problema'
  else if (descricao.length > LIMITE.descricao) erros.descricao = `Máximo de ${LIMITE.descricao} caracteres`
  else if (mudou('descricao')) patch.cr40f_descricao = descricao

  if (!atual.grau) erros.grau = 'Escolha o grau'
  else if (mudou('grau')) patch.cr40f_graudamanutencao = Number(atual.grau)
  if (mudou('tipo')) patch.cr40f_tipodoreparo = atual.tipo ? Number(atual.tipo) : null

  const inteiro = (campo: 'km' | 'kmRealizado', coluna: string, mensagem: string) => {
    if (!mudou(campo)) return
    const km = lerKm(atual[campo])
    if (km === null && atual[campo].trim()) erros[campo] = mensagem
    else patch[coluna] = km
  }
  inteiro('km', 'cr40f_kmatual', 'Informe o km (número inteiro)')

  const comentario = atual.comentario.trim()
  if (comentario.length > LIMITE.comentarioAprovador) erros.comentario = `Máximo de ${LIMITE.comentarioAprovador} caracteres`
  else if (mudou('comentario')) patch.cr40f_comentariosdoaprovador = comentario || null

  if (mudou('janelaInicio') || mudou('janelaFim')) {
    const { janelaInicio: inicio, janelaFim: fim } = atual
    if (inicio && !DIA.test(inicio)) erros.janelaInicio = 'Data inválida'
    if (fim && !DIA.test(fim)) erros.janelaFim = 'Data inválida'
    if (!erros.janelaInicio && !erros.janelaFim) {
      if (!inicio !== !fim) erros[inicio ? 'janelaFim' : 'janelaInicio'] = 'Informe o início e o fim da janela'
      else if (inicio && fim < inicio) erros.janelaFim = 'O fim não pode ser antes do início'
      else {
        if (mudou('janelaInicio')) patch.cr40f_janelainicio = toDataverseDate(inicio || null, comportamentos.cr40f_janelainicio)
        if (mudou('janelaFim')) patch.cr40f_janelafim = toDataverseDate(fim || null, comportamentos.cr40f_janelafim)
      }
    }
  }

  if (conclusao) {
    inteiro('kmRealizado', 'cr40f_kmrealizado', 'Informe o km realizado (número inteiro)')
    if (mudou('dataManutencao')) {
      const iso = DATA_HORA.test(atual.dataManutencao) ? new Date(`${atual.dataManutencao}:00-03:00`) : null
      if (iso && !Number.isNaN(iso.getTime())) patch.cr40f_datamanutencao = iso.toISOString()
      else if (atual.dataManutencao.trim()) erros.dataManutencao = 'Data e hora inválidas'
      else patch.cr40f_datamanutencao = null
    }
    if (mudou('valor')) {
      const valor = lerValor(atual.valor)
      if (valor === null && atual.valor.trim()) erros.valor = 'Informe um valor válido'
      else patch.cr40f_valor = valor
    }
    for (const [campo, coluna, limite] of [['estabelecimento', 'cr40f_estabelecimento', LIMITE.estabelecimento], ['servicoRealizado', 'cr40f_servicorealizado', LIMITE.servicoRealizado]] as const) {
      const valor = atual[campo].trim()
      if (valor.length > limite) erros[campo] = `Máximo de ${limite} caracteres`
      else if (mudou(campo)) patch[coluna] = valor || null
    }
  }

  return { erros, patch: Object.keys(erros).length ? {} : patch }
}

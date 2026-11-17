// apps/shell/src/pages/frota/domain/novaManutencao.ts
import { LIMITE } from '../data/schema'
import type { NovaManutencao } from '../data/source'
import { lerKm } from './km'
import { lerJanela, valoresJanelaIniciais, type ErrosJanela, type Janela, type ValoresJanela } from './janela'

/** Mesmos campos obrigatórios do pedido no App (veículo, descrição, grau e km); o escritório pode já encaixar. */
export type ValoresNova = { veiculoId: string; descricao: string; grau: string; tipo: string; km: string; solicitanteId: string; encaixar: boolean; janela: ValoresJanela }
export type ErrosNova = Partial<Record<'veiculoId' | 'descricao' | 'grau' | 'km', string>> & { janela?: ErrosJanela }
export type LeituraNova = { erros: ErrosNova; input: NovaManutencao | null; encaixe: { janela: Janela; comentario: string | null } | null }

export const valoresNovaIniciais = (hoje: string): ValoresNova => ({ veiculoId: '', descricao: '', grau: '', tipo: '', km: '', solicitanteId: '', encaixar: false, janela: valoresJanelaIniciais(null, hoje, null) })

export function validarNova(v: ValoresNova, hoje: string): LeituraNova {
  const erros: ErrosNova = {}
  if (!v.veiculoId) erros.veiculoId = 'Escolha o veículo'
  const descricao = v.descricao.trim()
  if (!descricao) erros.descricao = 'Descreva o problema'
  else if (descricao.length > LIMITE.descricao) erros.descricao = `Máximo de ${LIMITE.descricao} caracteres`
  if (!v.grau) erros.grau = 'Escolha o grau'
  const km = lerKm(v.km)
  if (km === null) erros.km = 'Informe o km atual (número inteiro)'
  let encaixe: LeituraNova['encaixe'] = null
  if (v.encaixar) {
    const lida = lerJanela(v.janela, hoje, LIMITE.comentarioAoMotorista)
    if (lida.janela) encaixe = { janela: lida.janela, comentario: lida.comentario }
    else erros.janela = lida.erros
  }
  if (Object.keys(erros).length || km === null) return { erros, input: null, encaixe: null }
  return { erros, input: { veiculoId: v.veiculoId, descricao, grau: Number(v.grau), tipo: v.tipo ? Number(v.tipo) : null, km, solicitanteId: v.solicitanteId || null }, encaixe }
}

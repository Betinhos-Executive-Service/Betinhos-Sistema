// domain/pendencias.ts
import { normalizeSearch } from '@betinhos/ui'
import { statusDe } from './vencimento'
import type { Categoria, DocEmitido, Dono, ItemChecklist, Kpi, Pendencia, TipoDoc } from './types'

export const chaveDonoTipo = (donoId: string, tipoId: string) => `${donoId}|${tipoId}`
export const isObrigatorio = (tipo: TipoDoc, dono: Dono) => dono.obrigKey != null && tipo.obrigatorioPara.includes(dono.obrigKey)

const maisRecente = (a: DocEmitido, b: DocEmitido) =>
  String(b.validade ?? b.emissao ?? '').localeCompare(String(a.validade ?? a.emissao ?? ''))
  || String(b.modificadoEm ?? '').localeCompare(String(a.modificadoEm ?? ''))

/** Vigente por dono+tipo. Dois vigentes só acontecem se uma renovação falhou no meio: vale o mais recente. */
export function indexarVigentes(docs: DocEmitido[]) {
  const map = new Map<string, DocEmitido>()
  for (const d of docs.filter((x) => x.situacao === 'vigente').sort(maisRecente)) {
    const chave = chaveDonoTipo(d.donoId, d.tipoId)
    if (!map.has(chave)) map.set(chave, d)
  }
  return map
}

const ORDEM: Record<Kpi, number> = { vencido: 0, vence7: 1, faltando: 2, vence30: 3, vence60: 4 }
const EM_ALERTA = new Set<string>(['vencido', 'vence7', 'vence30', 'vence60'])
const porOrdem = (a: TipoDoc, b: TipoDoc) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR')

/** Tudo que precisa de ação, do mais urgente ao menos: vencidos, até 7 dias, faltantes, 8–30, 31–60. */
export function montarPendencias(tipos: TipoDoc[], donos: Dono[], docs: DocEmitido[], hoje: string): Pendencia[] {
  const vigentes = indexarVigentes(docs)
  const lista: Pendencia[] = []
  for (const dono of donos) {
    if (!dono.ativo) continue
    for (const tipo of tipos) {
      if (!tipo.ativo || tipo.categoria !== dono.categoria) continue
      const doc = vigentes.get(chaveDonoTipo(dono.id, tipo.id)) ?? null
      if (!doc) {
        if (isObrigatorio(tipo, dono)) lista.push({ chave: chaveDonoTipo(dono.id, tipo.id), dono, tipo, doc: null, estado: 'faltando', dias: null })
        continue
      }
      const { status, dias } = statusDe(doc.validade, hoje, tipo.temValidade)
      if (EM_ALERTA.has(status)) lista.push({ chave: doc.id, dono, tipo, doc, estado: status as Kpi, dias })
    }
  }
  return lista.sort((a, b) => ORDEM[a.estado] - ORDEM[b.estado] || (a.dias ?? 0) - (b.dias ?? 0) || a.dono.nome.localeCompare(b.dono.nome, 'pt-BR') || porOrdem(a.tipo, b.tipo))
}

export const KPIS: Kpi[] = ['vencido', 'vence7', 'vence30', 'vence60', 'faltando']

export function contarKpis(pendencias: Pendencia[]): Record<Kpi, number> {
  const contagem: Record<Kpi, number> = { vencido: 0, vence7: 0, vence30: 0, vence60: 0, faltando: 0 }
  for (const p of pendencias) contagem[p.estado] += 1
  return contagem
}

/** Número do badge da sidebar. */
export const urgentes = (contagem: Record<Kpi, number>) => contagem.vencido + contagem.vence7

export function montarChecklist(dono: Dono, tipos: TipoDoc[], docs: DocEmitido[], hoje: string): ItemChecklist[] {
  const meus = docs.filter((d) => d.donoId === dono.id)
  return tipos.filter((t) => t.ativo && t.categoria === dono.categoria).sort(porOrdem).map((tipo) => {
    const doTipo = meus.filter((d) => d.tipoId === tipo.id).sort(maisRecente)
    const vigente = doTipo.find((d) => d.situacao === 'vigente') ?? null
    const historico = doTipo.filter((d) => d !== vigente)
    if (!vigente) return { tipo, vigente, historico, estado: isObrigatorio(tipo, dono) ? 'faltando' : 'opcional', dias: null }
    const { status, dias } = statusDe(vigente.validade, hoje, tipo.temValidade)
    return { tipo, vigente, historico, estado: status, dias }
  })
}

export type FiltroCentral = { aba: Categoria; kpi: Kpi | null; tipo: string | null; q: string }

export function filtrarPendencias(lista: Pendencia[], filtro: FiltroCentral) {
  const termo = normalizeSearch(filtro.q)
  return lista.filter((p) => p.dono.categoria === filtro.aba
    && (!filtro.kpi || p.estado === filtro.kpi)
    && (!filtro.tipo || p.tipo.id === filtro.tipo)
    && (!termo || normalizeSearch(`${p.dono.nome} ${p.dono.detalhe} ${p.tipo.nome}`).includes(termo)))
}

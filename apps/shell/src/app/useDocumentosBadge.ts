import { useEffect, useState } from 'react'
import type { Host } from '../host'
import { todaySP } from '../pages/funcionarios/data/dates'
import { createDocsSource, DOCUMENTOS_ALTERADOS } from '../pages/documentos/data/source'
import { contarKpis, montarPendencias, urgentes } from '../pages/documentos/domain/pendencias'
import type { DocsData } from '../pages/documentos/domain/types'

const INTERVALO_MS = 10 * 60 * 1000

export const contarUrgentes = (data: DocsData, hoje: string) => urgentes(contarKpis(montarPendencias(data.tipos, data.donos, data.docs, hoje)))

/** Vencidos + vencem em até 7 dias, para o badge de "Documentos" no menu. Recarrega a cada 10 min e quando a tela de documentos salva. Falha silenciosa: sem número, sem badge. */
export function useDocumentosBadge(host: Host) {
  const [total, setTotal] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    let source: ReturnType<typeof createDocsSource>
    try { source = createDocsSource(host) } catch { return }
    const carregar = () => source.carregar().then((d) => { if (vivo) setTotal(contarUrgentes(d, todaySP())) }).catch(() => { if (vivo) setTotal(null) })
    void carregar()
    const timer = window.setInterval(carregar, INTERVALO_MS)
    const aoAlterar = () => { void carregar() }
    window.addEventListener(DOCUMENTOS_ALTERADOS, aoAlterar)
    return () => { vivo = false; window.clearInterval(timer); window.removeEventListener(DOCUMENTOS_ALTERADOS, aoAlterar) }
  }, [host])
  return total
}

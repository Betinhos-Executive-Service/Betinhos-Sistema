import { useEffect, useState } from 'react'
import type { Host } from '../host'
import { todaySP } from '../pages/funcionarios/data/dates'
import { contarKpis, montarPendencias, urgentes } from '../pages/documentos/domain/pendencias'
import type { DocsData } from '../pages/documentos/domain/types'
import { quandoOcioso } from '../lib/ocioso'

const INTERVALO_MS = 10 * 60 * 1000

export const contarUrgentes = (data: DocsData, hoje: string) => urgentes(contarKpis(montarPendencias(data.tipos, data.donos, data.docs, hoje)))

/**
 * Vencidos + vencem em até 7 dias, para o badge de "Documentos" no menu. Recarrega a cada 10 min e quando a tela de documentos salva. Falha silenciosa: sem número, sem badge.
 * A fonte de documentos (e o que ela puxa de Funcionários/SharePoint) vem num chunk separado, baixado quando o navegador fica ocioso, para não pesar na carga inicial nem competir com os dados da tela aberta.
 */
export function useDocumentosBadge(host: Host) {
  const [total, setTotal] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    let desligar = () => {}
    const cancelarOcioso = quandoOcioso(() => {
      void import('../pages/documentos/data/source').then(({ createDocsSource, DOCUMENTOS_ALTERADOS }) => {
        if (!vivo) return
        let source: ReturnType<typeof createDocsSource>
        try { source = createDocsSource(host) } catch { return }
        const carregar = () => source.carregar().then((d) => { if (vivo) setTotal(contarUrgentes(d, todaySP())) }).catch(() => { if (vivo) setTotal(null) })
        void carregar()
        const timer = window.setInterval(carregar, INTERVALO_MS)
        const aoAlterar = () => { void carregar() }
        window.addEventListener(DOCUMENTOS_ALTERADOS, aoAlterar)
        desligar = () => { window.clearInterval(timer); window.removeEventListener(DOCUMENTOS_ALTERADOS, aoAlterar) }
      }).catch(() => { if (vivo) setTotal(null) })
    })
    return () => { vivo = false; cancelarOcioso(); desligar() }
  }, [host])
  return total
}

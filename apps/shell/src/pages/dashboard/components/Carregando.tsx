import { createContext, useContext } from 'react'
import { Spinner } from '@betinhos/ui'

/** Avanço real da primeira carga (0–100), calculado por `useDashboard` e entregue às abas sem passar por cada uma. */
export const ProgressoCarga = createContext(0)

/**
 * Primeira carga de qualquer aba: spinner e barra de porcentagem com o avanço real (consultas respondidas / total).
 * Ocupa o lugar do conteúdo, sem esqueleto: a aba só aparece com números de verdade.
 */
export function AbaCarregando() {
  const pct = useContext(ProgressoCarga)
  return (
    <div className="dash-carga">
      <Spinner size={28} label="Carregando dashboard" />
      <div className="dash-carga__texto"><strong>Carregando dashboard</strong><span aria-hidden="true">{pct}%</span></div>
      <div className="dash-carga__trilho" role="progressbar" aria-label="Progresso do carregamento" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="dash-carga__barra" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

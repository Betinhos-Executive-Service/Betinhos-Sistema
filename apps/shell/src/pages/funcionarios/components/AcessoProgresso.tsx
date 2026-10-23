import { Spinner } from '@betinhos/ui'
import { Check, Clock, Minus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ESTADO_ETAPA, ETAPAS, type Etapa, type Fluxo } from '../data/acesso'

const ICONE = { feita: Check, pulada: Minus, pendente: Clock, erro: X }
const PASSO_MS = 2500

/** Resultado em linguagem simples: só as etapas que o usuário reconhece, com o estado por extenso. */
export function ListaEtapas({ etapas, fluxo }: { etapas: Etapa[]; fluxo: Fluxo }) {
  const rotulos = ETAPAS[fluxo]
  const visiveis = etapas.filter((e) => e.etapa in rotulos)
  if (visiveis.length === 0) return null
  return (
    <ul className="acesso-etapas">
      {visiveis.map((e) => {
        const Icone = ICONE[e.estado]
        return <li key={e.etapa} data-estado={e.estado}><Icone size={14} aria-hidden /> <span>{rotulos[e.etapa]}</span> <span className="acesso-etapas__estado">{ESTADO_ETAPA[e.estado]}</span></li>
      })}
    </ul>
  )
}

/**
 * Progresso enquanto o plugin trabalha (uma chamada só, sem eventos): a frase avança por tempo estimado e para na última.
 * Fases anteriores ficam esmaecidas, sem visto, porque a confirmação real só chega no resultado.
 */
export function ProgressoAcesso({ fluxo }: { fluxo: Fluxo }) {
  const fases = Object.values(ETAPAS[fluxo])
  const [atual, setAtual] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setAtual((i) => Math.min(i + 1, fases.length - 1)), PASSO_MS)
    return () => window.clearInterval(timer)
  }, [fases.length])
  return (
    <div className="acesso-progresso" aria-live="polite">
      <p className="acesso-progresso__atual"><Spinner size={16} label="Em andamento" /> {fases[atual]}…</p>
      <ol className="acesso-progresso__fases" aria-hidden>
        {fases.map((fase, i) => <li key={fase} data-fase={i < atual ? 'antes' : i === atual ? 'atual' : 'depois'}>{fase}</li>)}
      </ol>
      <p className="acesso-progresso__dica">Leva alguns segundos. Não feche esta janela.</p>
    </div>
  )
}

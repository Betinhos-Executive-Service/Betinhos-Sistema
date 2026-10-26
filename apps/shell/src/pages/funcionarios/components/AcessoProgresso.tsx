import { Spinner } from '@betinhos/ui'
import { Check, Clock, Minus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ESTADO_ETAPA, ETAPAS, ETAPAS_FEITAS, type Etapa, type Fluxo } from '../data/acesso'

const ICONE = { feita: Check, pulada: Minus, pendente: Clock, erro: X }
const PASSO_MS = 2500

/** Resultado em linguagem simples: só as etapas que o usuário reconhece, com o estado por extenso. */
export function ListaEtapas({ etapas, fluxo }: { etapas: Etapa[]; fluxo: Fluxo }) {
  const rotulos = ETAPAS[fluxo]
  const feitas = ETAPAS_FEITAS[fluxo]
  const visiveis = etapas.filter((e) => e.etapa in rotulos)
  if (visiveis.length === 0) return null
  return (
    <ul className="acesso-etapas">
      {visiveis.map((e) => {
        const Icone = ICONE[e.estado]
        return <li key={e.etapa} data-estado={e.estado}><Icone size={14} aria-hidden /> <span>{e.estado === 'feita' ? feitas[e.etapa] : rotulos[e.etapa]}</span> {ESTADO_ETAPA[e.estado] && <span className="acesso-etapas__estado">{ESTADO_ETAPA[e.estado]}</span>}</li>
      })}
    </ul>
  )
}

export const RETENTATIVA_MS = 15_000
const RETENTATIVAS = 12   // ~3 min

/**
 * Enquanto `ativo`, chama `tentar` a cada 15 s (até ~3 min); um resultado definido para as tentativas e vai para `concluir`.
 * Erro para as tentativas quando `parar(erro)` devolve true (erro permanente); os demais contam como "ainda não".
 * Resposta que chega depois de `ativo` mudar ou do componente sair da tela (outra ficha, clique manual) é descartada.
 * Devolve `esgotou` (tentativas acabaram sem concluir) e `tentando` (chamada em andamento, para travar o clique manual).
 */
export function useRetentativa<T>(ativo: boolean, tentar: () => Promise<T | undefined>, concluir: (resultado: T) => void, parar: (erro: unknown) => boolean) {
  const ref = useRef({ tentar, concluir, parar })
  ref.current = { tentar, concluir, parar }
  const [esgotou, setEsgotou] = useState(false)
  const [tentando, setTentando] = useState(false)
  useEffect(() => {
    if (!ativo) return
    let feitas = 0
    let ocupado = false
    let cancelado = false
    const timer = window.setInterval(async () => {
      if (ocupado) return
      ocupado = true; setTentando(true)
      let resultado: T | undefined
      let parou = false
      try { resultado = await ref.current.tentar() } catch (erro) { if (!cancelado) parou = ref.current.parar(erro) }
      ocupado = false
      if (cancelado) return
      setTentando(false)
      if (parou) window.clearInterval(timer)
      else if (resultado !== undefined) { window.clearInterval(timer); ref.current.concluir(resultado) }
      else if (++feitas >= RETENTATIVAS) { window.clearInterval(timer); setEsgotou(true) }
    }, RETENTATIVA_MS)
    return () => { cancelado = true; window.clearInterval(timer); setEsgotou(false); setTentando(false) }
  }, [ativo])
  return { esgotou, tentando }
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

import { useEffect, useState } from 'react'
import { Alert, Button, Dialog } from '@betinhos/ui'
import { formatMoney } from '../../pagantes/domain/messages'
import type { FechamentoMes, Source } from '../data/source'
import type { Pendencia } from '../domain/types'

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** 'AAAA-MM' → "setembro de 2026". */
export function formatMes(mes: string | null) {
  const m = mes?.match(/^(\d{4})-(\d{2})$/)
  if (!m) return mes ?? ''
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

type Props = { pendencia: Pendencia | null; source: Source; onClose: () => void; onDone: (r: FechamentoMes) => void }

/** Confirma o fechamento mensal do cliente (Custom API cr40f_FecharMesCliente). Durante a chamada, nada fecha o diálogo. */
export function FecharMesDialog({ pendencia: p, source, onClose, onDone }: Props) {
  const [fechando, setFechando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const id = p?.id ?? null

  useEffect(() => { setFechando(false); setErro(null) }, [id])

  const close = () => { if (!fechando) onClose() }

  async function fechar() {
    if (!p || !p.mes || fechando) return
    setFechando(true); setErro(null)
    try {
      const r = await source.fecharMes(p.clienteId, p.mes)
      setFechando(false)
      onDone(r)
    } catch (reason) {
      setFechando(false)
      setErro(message(reason))
    }
  }

  return (
    <Dialog open={p != null} onClose={close} title="Fechar mês?"
      actions={<>
        <Button variant="secondary" disabled={fechando} onClick={close}>Voltar</Button>
        <Button loading={fechando} disabled={fechando} onClick={() => void fechar()}>Fechar mês</Button>
      </>}>
      {p ? (
        <>
          <span>Cria uma OP consolidada de <strong>{p.cliente || 'cliente sem nome'}</strong> para <strong>{formatMes(p.mes)}</strong> e vincula estes serviços:</span>
          <ul className="pend-corrigir__lista">{p.reservaCodigos.map((c, i) => <li key={p.reservaIds[i] ?? c}>{c || 'Sem código'}</li>)}</ul>
          <span>Total: <strong className="pg-num">{formatMoney(p.valor)}</strong></span>
          {erro ? <Alert tone="danger" title="O mês não foi fechado">{erro}</Alert> : null}
        </>
      ) : null}
    </Dialog>
  )
}

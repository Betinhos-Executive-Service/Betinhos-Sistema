import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, Field, Select, Skeleton } from '@betinhos/ui'
import { CalendarCheck } from 'lucide-react'
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

type Props = {
  /** Pendências: o par cliente+mês já vem escolhido. */
  pendencia?: Pendencia | null
  /** OPs: modo de escolha. `opcoes` são as pendências tipo 4 (null = carregando). */
  escolha?: { open: boolean; opcoes: Pendencia[] | null; erro?: string | null }
  source: Source
  onClose: () => void
  onDone: (r: FechamentoMes) => void
}

/** Confirma o fechamento mensal do cliente (Custom API cr40f_FecharMesCliente). Durante a chamada, nada fecha o diálogo. */
export function FecharMesDialog({ pendencia, escolha, source, onClose, onDone }: Props) {
  const [fechando, setFechando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [mes, setMes] = useState<string | null>(null)
  const opcoes = escolha?.opcoes ?? null
  const open = escolha ? escolha.open : pendencia != null

  const clientes = useMemo(() => {
    const seen = new Map<string, string>()
    for (const o of opcoes ?? []) if (!seen.has(o.clienteId)) seen.set(o.clienteId, o.cliente || 'Cliente sem nome')
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }, [opcoes])
  const meses = useMemo(() => (opcoes ?? []).filter((o) => o.clienteId === clienteId && o.mes)
    .sort((a, b) => (b.mes ?? '').localeCompare(a.mes ?? '')).map((o) => ({ value: o.mes!, label: formatMes(o.mes) })), [opcoes, clienteId])

  // Ao abrir ou trocar as opções, pré-escolhe o primeiro cliente e o mês mais recente dele.
  useEffect(() => { if (open) { setFechando(false); setErro(null) } }, [open])
  useEffect(() => { setClienteId(clientes[0]?.value ?? null) }, [clientes])
  useEffect(() => { setMes(meses[0]?.value ?? null) }, [meses])

  const p = escolha ? (opcoes ?? []).find((o) => o.clienteId === clienteId && o.mes === mes) ?? null : pendencia ?? null
  const semOpcoes = escolha != null && opcoes != null && opcoes.length === 0

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
    <Dialog open={open} onClose={close} title="Fechar mês?"
      actions={semOpcoes || escolha?.erro
        ? <Button variant="secondary" onClick={close}>Fechar</Button>
        : <>
          <Button variant="secondary" disabled={fechando} onClick={close}>Voltar</Button>
          <Button loading={fechando} disabled={!p || fechando} onClick={() => void fechar()}>Fechar mês</Button>
        </>}>
      {escolha?.erro ? <Alert tone="danger" title="Não foi possível carregar os meses">{escolha.erro}</Alert>
        : escolha && opcoes == null ? <span className="pend-corrigir__loading" role="status" aria-label="Carregando meses"><Skeleton height={18} /><Skeleton height={18} /></span>
        : semOpcoes ? <EmptyState align="start" icon={<CalendarCheck size={32} />} title="Nenhum mês para fechar">Não há serviços mensais concluídos sem OP em meses encerrados.</EmptyState>
        : (
          <>
            {escolha ? (
              <div className="pend-fechar__campos">
                <Field label="Cliente"><Select aria-label="Cliente" options={clientes} value={clienteId} onChange={setClienteId} clearable={false} disabled={fechando} /></Field>
                <Field label="Mês"><Select aria-label="Mês" options={meses} value={mes} onChange={setMes} searchable={false} clearable={false} disabled={fechando || !clienteId} /></Field>
              </div>
            ) : null}
            {p ? (
              <>
                <span>Cria uma OP consolidada de <strong>{p.cliente || 'cliente sem nome'}</strong> para <strong>{formatMes(p.mes)}</strong> e vincula estes serviços:</span>
                <ul className="pend-corrigir__lista">{p.reservaCodigos.map((c, i) => <li key={p.reservaIds[i] ?? c}>{c || 'Sem código'}</li>)}</ul>
                <span>Total: <strong className="pg-num">{formatMoney(p.valor)}</strong></span>
              </>
            ) : null}
            {erro ? <Alert tone="danger" title="O mês não foi fechado">{erro}</Alert> : null}
          </>
        )}
    </Dialog>
  )
}

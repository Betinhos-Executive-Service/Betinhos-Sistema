import { Alert, Button, Cluster, StatusBadge, Surface } from '@betinhos-executive-service/ui'
import { Check, CircleAlert, Copy, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { formatCurrency } from '../../money'

export interface ResultRow {
  key: string
  name: string
  amountCents: number
  paymentUrl?: string
  linkLabel: string
  emailLabel: string
  error?: string
}

export function ResultView({ title, rows }: { title: string; rows: ResultRow[] }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const failures = rows.filter((row) => row.error).length

  async function copy(row: ResultRow) {
    if (!row.paymentUrl) return
    try { await navigator.clipboard.writeText(row.paymentUrl); setCopiedKey(row.key) } catch { window.prompt('Copie o link de pagamento:', row.paymentUrl) }
  }

  return <>
    <Alert tone={failures ? 'warning' : 'success'} title={title} role="status">
      {failures ? `${failures} ${failures === 1 ? 'pagante teve falha' : 'pagantes tiveram falha'}. Corrija e salve novamente.` : 'Links e e-mails processados.'}
    </Alert>
    <Surface eyebrow="RESULTADO" title="Pagantes desta OP" className="result-view">
      <ul className="result-view__list">
        {rows.map((row) => <li key={row.key} className={row.error ? 'has-error' : undefined}>
          <div className="result-view__identity"><strong>{row.name}</strong><span>{formatCurrency(row.amountCents)}</span></div>
          <Cluster className="result-view__status">
            <StatusBadge tone={row.error ? 'danger' : 'success'} icon={row.error ? <CircleAlert size={12} /> : <Check size={12} />}>{row.linkLabel}</StatusBadge>
            <span>{row.emailLabel}</span>
            {row.paymentUrl ? <Button variant="ghost" size="compact" icon={copiedKey === row.key ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copy(row)}>{copiedKey === row.key ? 'Copiado' : 'Copiar link'}</Button> : null}
          </Cluster>
          {row.error ? <p className="result-view__error"><CircleAlert size={14} aria-hidden="true" />{row.error}</p> : null}
        </li>)}
      </ul>
    </Surface>
  </>
}

export function ResultActions({ failures, onClose, onEditAgain }: { failures: number; onClose?: () => void; onEditAgain: () => void }) {
  return <footer className="sticky-action-bar">
    <span className="action-status is-ready">{failures ? 'Há falhas para corrigir' : 'Tudo pronto'}</span>
    <Cluster>
      <Button variant="secondary" icon={<Pencil size={16} />} onClick={onEditAgain}>Editar novamente</Button>
      {onClose ? <Button variant="primary" icon={<X size={16} />} onClick={onClose}>Fechar</Button> : null}
    </Cluster>
  </footer>
}

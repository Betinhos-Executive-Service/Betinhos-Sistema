import { useMemo, useRef, useState } from 'react'
import { Button, StatusBadge, type MenuAction, type TableSelection } from '@betinhos/ui'
import { X } from 'lucide-react'
import './selecao.css'

/**
 * Seleção de linhas da `Table` (estado da tela). `rows` são só as selecionadas que a lista mostra agora.
 * `bar` envolve o ViewBar: guarda a altura dos comandos ao começar a seleção, porque a faixa é mais baixa
 * e a lista subiria entre os dois cliques do duplo clique, abrindo a linha de baixo.
 */
export function useRowSelection<Row extends { id: string }>(visible: Row[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const barRef = useRef<HTMLDivElement>(null)
  const [barHeight, setBarHeight] = useState<number>()
  const rows = useMemo(() => visible.filter((row) => selected.has(row.id)), [visible, selected])
  const onChange = (next: ReadonlySet<string>) => {
    if (!selected.size && next.size) setBarHeight(barRef.current?.offsetHeight)
    setSelected(next)
  }
  const selection: TableSelection<Row> = { selected, onChange }
  const bar = { ref: barRef, className: 'lista-barra', style: rows.length ? { minHeight: barHeight } : undefined }
  // O Table só vê as linhas desenhadas (lote e janela da rolagem): o clique direito numa selecionada age sobre a seleção inteira, como a faixa.
  const targets = (clicked: Row[]) => (clicked.some((row) => selected.has(row.id)) ? rows : clicked)
  return { selection, rows, bar, targets, clear: () => setSelected(new Set()) }
}

/** Faixa do ViewBar enquanto há linhas selecionadas: limpar, contagem e as mesmas ações do clique direito. */
export function SelectionBar({ count, onClear, actions }: { count: number; onClear: () => void; actions: MenuAction[] }) {
  return (
    <div className="lista-selecao" role="group" aria-label="Comandos da seleção">
      <Button variant="ghost" icon={<X size={16} />} aria-label="Limpar seleção" title="Limpar seleção" onClick={onClear} />
      <span role="status"><StatusBadge tone="info">{count === 1 ? '1 selecionado' : `${count} selecionados`}</StatusBadge></span>
      {actions.map((action) => (
        <Button key={action.id} variant="action" icon={action.icon} disabled={action.disabled} title={action.title} onClick={action.onSelect}>{action.label}</Button>
      ))}
    </div>
  )
}

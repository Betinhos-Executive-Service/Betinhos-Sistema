import { useEffect, useRef, useState } from 'react'
import { Menu, selectionBlock, selectionMenuActions, type SelectionAction, type ViewBarSelection } from '@betinhos/ui'
import { CheckCheck, MoreVertical, X } from 'lucide-react'
import './barraSelecao.css'

/** Ações à vista: com um serviço, o que se faz com ele; com vários, o que vale em lote (Editar campos só vale para um). */
const PRINCIPAIS = { um: ['copiar', 'disparar', 'editar-campos'], varios: ['copiar', 'disparar', 'voucher'] }

/** Rótulo curto na barra (o nome completo fica no `aria-label` e no menu). */
const CURTO: Record<string, string> = { copiar: 'Copiar', 'editar-campos': 'Editar campos', disparar: 'Disparar', voucher: 'Voucher' }

const contagem = (n: number) => (n === 1 ? '1 selecionado' : `${n} selecionados`)

function Acao({ action, count }: { action: SelectionAction; count: number }) {
  const motivo = selectionBlock(action, count)
  return (
    <button type="button" className="gs-ferramenta" aria-label={action.label} title={motivo ?? action.label} aria-disabled={motivo ? 'true' : undefined} onClick={motivo ? undefined : action.onSelect}>
      {action.icon}<span>{CURTO[action.id] ?? action.label}</span>
    </button>
  )
}

/** Publica a altura da barra em `--bt-selectionbar-height`, como a barra do DS (a lista sobe acima dela). */
function useAlturaPublicada() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    const root = document.documentElement
    if (!el) return
    const publicar = () => root.style.setProperty('--bt-selectionbar-height', `${el.offsetHeight}px`)
    publicar()
    const obs = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publicar)
    obs?.observe(el)
    return () => { obs?.disconnect(); root.style.removeProperty('--bt-selectionbar-height') }
  }, [])
  return ref
}

type PropsBarra = { selection: ViewBarSelection; total?: number; onTodos?: () => void }

const SAIDA_MS = 180

/**
 * Monta a barra enquanto há seleção e a mantém por `SAIDA_MS` depois de desmarcar, com a última contagem, para ela
 * descer em vez de sumir. Com `prefers-reduced-motion` some na hora.
 */
export function BarraSelecaoAnimada({ ativo, ...props }: PropsBarra & { ativo: boolean }) {
  const [montado, setMontado] = useState(ativo)
  const ultima = useRef(props.selection)
  if (ativo) ultima.current = props.selection
  useEffect(() => {
    if (ativo) { setMontado(true); return }
    const reduz = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const t = window.setTimeout(() => setMontado(false), reduz ? 0 : SAIDA_MS)
    return () => window.clearTimeout(t)
  }, [ativo])
  if (!ativo && !montado) return null
  return <BarraSelecao {...props} selection={ativo ? props.selection : ultima.current} saindo={!ativo} />
}

/**
 * Barra de seleção do celular (Geral): topo com ✕, contagem e "Todos"; embaixo 3 ações com ícone e rótulo e "Mais"
 * (o resto da seleção). Recebe a mesma `selection` do `ViewBar` do DS; candidata a substituir o `SelectionBar` do DS.
 */
export function BarraSelecao({ selection, total, onTodos, saindo = false }: PropsBarra & { saindo?: boolean }) {
  const ref = useAlturaPublicada()
  const ids = selection.count === 1 ? PRINCIPAIS.um : PRINCIPAIS.varios
  const principais = ids.map((id) => selection.actions.find((a) => a.id === id)).filter((a): a is SelectionAction => a != null)
  const resto = selectionMenuActions({ count: selection.count, actions: selection.actions.filter((a) => !principais.includes(a)) })
  return (
    <div ref={ref} className={saindo ? 'gs-barra is-saindo' : 'gs-barra'} role="group" aria-label="Comandos da seleção" aria-hidden={saindo || undefined}>
      <div className="gs-topo">
        <button type="button" className="gs-fechar" aria-label="Desmarcar tudo" title="Desmarcar tudo" onClick={selection.onClear}><X size={20} aria-hidden="true" /></button>
        <span role="status" className="gs-selo"><CheckCheck size={14} aria-hidden="true" /><span key={selection.count} className="gs-numero">{contagem(selection.count)}</span></span>
        {onTodos && total != null && selection.count < total
          ? <button type="button" className="gs-todos" aria-label={`Selecionar todos (${total})`} onClick={onTodos}>Todos</button>
          : <span className="gs-todos" aria-hidden="true" />}
      </div>
      <div className="gs-ferramentas">
        {principais.map((a) => <Acao key={a.id} action={a} count={selection.count} />)}
        {resto.length > 0 ? (
          <Menu
            actions={resto}
            trigger={(props) => (
              <button type="button" {...props} className="gs-ferramenta" aria-label={`Mais ações (${resto.length} da seleção)`}>
                <MoreVertical size={20} aria-hidden="true" /><span>Mais</span>
              </button>
            )}
          />
        ) : null}
      </div>
    </div>
  )
}

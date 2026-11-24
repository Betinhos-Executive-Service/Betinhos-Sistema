import { Fragment, useEffect, useRef, useState } from 'react'
import { Menu, Sheet, selectionBlock, selectionMenuActions, type SelectionAction, type ViewBarSelection } from '@betinhos/ui'
import { CheckCheck, ChevronUp, MoreVertical, X } from 'lucide-react'
import './barraSelecao.css'

/** Variações da barra de seleção do celular (laboratório, `#/geral?barra=a|b|c`). */
export type VarianteBarra = 'a' | 'b' | 'c'

export const lerVarianteBarra = (hash: string): VarianteBarra | null => {
  const valor = new URLSearchParams(hash.split('?')[1] ?? '').get('barra')
  return valor === 'a' || valor === 'b' || valor === 'c' ? valor : null
}

/** Ações que ganham botão próprio no celular, nesta ordem; "Editar" fica no menu (tocar no card já abre o formulário). */
const PRINCIPAIS = ['editar-campos', 'copiar', 'disparar']

/** Rótulo curto na barra B (o nome completo fica no `aria-label` e no menu). */
const CURTO: Record<string, string> = { copiar: 'Copiar', 'editar-campos': 'Editar campos', disparar: 'Disparar' }

const contagem = (n: number) => (n === 1 ? '1 selecionado' : `${n} selecionados`)

function Acao({ action, count, classe, comRotulo }: { action: SelectionAction; count: number; classe: string; comRotulo: boolean }) {
  const motivo = selectionBlock(action, count)
  return (
    <button type="button" className={classe} aria-label={action.label} title={motivo ?? action.label} aria-disabled={motivo ? 'true' : undefined} onClick={motivo ? undefined : action.onSelect}>
      {action.icon}{comRotulo ? <span>{CURTO[action.id] ?? action.label}</span> : null}
    </button>
  )
}

/** Publica a altura da barra em `--bt-selectionbar-height`, como a barra do DS (o "+" e a lista sobem acima dela). */
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

/** Barra de seleção do celular em 3 variações; recebe a mesma `selection` que o `ViewBar` do DS. */
export function BarraSelecao({ variante, selection }: { variante: VarianteBarra; selection: ViewBarSelection }) {
  const ref = useAlturaPublicada()
  const [folha, setFolha] = useState(false)
  const principais = PRINCIPAIS.map((id) => selection.actions.find((a) => a.id === id)).filter((a): a is SelectionAction => a != null)
  const resto = selectionMenuActions({ count: selection.count, actions: selection.actions.filter((a) => !principais.includes(a)) })
  const mais = (rotulo: boolean) => (
    <Menu
      actions={resto}
      trigger={(props) => (
        <button type="button" {...props} className={rotulo ? 'gs-ferramenta' : 'gs-icone'} aria-label={`Mais ações (${resto.length})`}>
          <MoreVertical size={20} aria-hidden="true" />{rotulo ? <span>Mais</span> : null}
        </button>
      )}
    />
  )

  if (variante === 'a') {
    return (
      <div ref={ref} className="gs-barra gs-barra--a" role="group" aria-label="Comandos da seleção">
        <button type="button" className="gs-icone" aria-label="Desmarcar tudo" onClick={selection.onClear}><X size={20} aria-hidden="true" /></button>
        <span role="status" className="gs-contagem">{contagem(selection.count)}</span>
        {principais.map((a) => <Acao key={a.id} action={a} count={selection.count} classe="gs-icone" comRotulo={false} />)}
        {mais(false)}
      </div>
    )
  }

  if (variante === 'b') {
    return (
      <div ref={ref} className="gs-barra gs-barra--b" role="group" aria-label="Comandos da seleção">
        <div className="gs-b__topo">
          <span role="status" className="gs-b__selo"><CheckCheck size={14} aria-hidden="true" />{contagem(selection.count)}</span>
          <button type="button" className="gs-b__limpar" onClick={selection.onClear}>Desmarcar</button>
        </div>
        <div className="gs-b__ferramentas">
          {principais.map((a) => <Acao key={a.id} action={a} count={selection.count} classe="gs-ferramenta" comRotulo />)}
          {mais(true)}
        </div>
      </div>
    )
  }

  // C: pílula flutuante; "Ações" abre a folha com todas as ações, com rótulo e grupo.
  const todas = selectionMenuActions(selection)
  return (
    <>
      <div ref={ref} className="gs-pilula" role="group" aria-label="Comandos da seleção">
        <span role="status" className="gs-contagem">{contagem(selection.count)}</span>
        <button type="button" className="gs-pilula__acoes" aria-haspopup="dialog" onClick={() => setFolha(true)}>Ações<ChevronUp size={16} aria-hidden="true" /></button>
        <button type="button" className="gs-pilula__fechar" aria-label="Desmarcar tudo" onClick={selection.onClear}><X size={18} aria-hidden="true" /></button>
      </div>
      <Sheet open={folha} onClose={() => setFolha(false)} eyebrow="Ações" title={contagem(selection.count)}>
        <ul className="gs-folha">
          {todas.map((a, i) => (
            <Fragment key={a.id}>
              {a.group && a.group !== todas[i - 1]?.group ? <li className="gs-folha__grupo" aria-hidden="true">{a.group}</li> : null}
              <li>
                <button type="button" className={a.tone === 'danger' ? 'gs-folha__item gs-folha__item--perigo' : 'gs-folha__item'} aria-disabled={a.disabled ? 'true' : undefined} onClick={a.disabled ? undefined : () => { setFolha(false); a.onSelect() }}>
                  {a.icon}<span>{a.label}{a.description ? <small>{a.description}</small> : null}</span>
                </button>
              </li>
            </Fragment>
          ))}
        </ul>
      </Sheet>
    </>
  )
}

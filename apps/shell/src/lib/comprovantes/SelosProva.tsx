import { useEffect, useId, useState } from 'react'
import { StatusBadge } from '@betinhos/ui'
import { Camera, Images } from 'lucide-react'
import { ROTULO_SELO, SELO_GRAVE, type CarregarProvas, type ProvaMidia } from './provaMidia'
import './selosProva.css'

const formato = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const quando = (d: Date | null) => (d ? formato.format(d).replace(',', '') : '—')

/** Provas dos links dos anexos; recarrega quando a lista de links muda. Sem prova, o mapa fica vazio. */
export function useProvasMidia(carregar: CarregarProvas | undefined, links: (string | null)[]) {
  const chave = links.filter(Boolean).join('\n')
  const [provas, setProvas] = useState<Map<string, ProvaMidia>>(() => new Map())
  useEffect(() => {
    if (!carregar || !chave) { setProvas(new Map()); return }
    let cancelado = false
    carregar(chave.split('\n')).then((mapa) => { if (!cancelado) setProvas(mapa) }, () => { if (!cancelado) setProvas(new Map()) })
    return () => { cancelado = true }
  }, [carregar, chave])
  return provas
}

/**
 * Origem e selos da prova ao lado do anexo; os detalhes (data gravada, aparelho, horários do servidor e atraso)
 * abrem ao passar o mouse, com o foco do teclado ou com um toque no botão de origem.
 */
export function SelosProva({ prova }: { prova: ProvaMidia | undefined }) {
  const id = useId()
  const [aberto, setAberto] = useState(false)
  if (!prova) return null
  const galeria = prova.origem === 'galeria'
  return (
    <span className={`cmp-prova${aberto ? ' cmp-prova--aberta' : ''}`}>
      <button type="button" className="cmp-prova__origem" aria-expanded={aberto} aria-controls={id} onClick={() => setAberto((v) => !v)} onBlur={() => setAberto(false)}>
        {galeria ? <Images size={13} aria-hidden="true" /> : <Camera size={13} aria-hidden="true" />}
        {galeria ? 'Galeria/arquivo' : 'Câmera do app'}
      </button>
      {prova.selos.map((selo) => <StatusBadge key={selo} tone={SELO_GRAVE.has(selo) ? 'danger' : 'warning'}>{ROTULO_SELO[selo]}</StatusBadge>)}
      <span id={id} role="tooltip" className="cmp-prova__detalhe">
        <span><strong>Data gravada no arquivo</strong>{galeria ? (prova.dataGravada ? quando(prova.dataGravada) : 'sem data') : 'não se aplica (câmera do app)'}</span>
        <span><strong>Aparelho</strong>{prova.aparelho || '—'}</span>
        <span><strong>Câmera aberta (servidor)</strong>{quando(prova.emitidoEm)}</span>
        <span><strong>Recebida (servidor)</strong>{quando(prova.recebidoEm)}</span>
        <span><strong>Atraso</strong>{prova.atrasoMinutos == null ? '—' : `${prova.atrasoMinutos} min`}</span>
      </span>
    </span>
  )
}

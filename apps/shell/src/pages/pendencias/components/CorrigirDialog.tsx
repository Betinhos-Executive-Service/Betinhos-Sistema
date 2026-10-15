import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, Skeleton } from '@betinhos/ui'
import type { Mudanca, Source } from '../data/source'
import { CP, FAT, OP } from '../domain/codes'
import type { Pendencia } from '../domain/types'

const ENTIDADE: Record<string, string> = { cr40f_financeiro: 'OP', cr40f_reservadeveculos: 'Serviço', cr40f_composicaodeprecos: 'Composição' }
const ROTULOS: Record<string, Record<number, string>> = {
  cr40f_financeiro: { [OP.aberta]: 'Aberta', [OP.pendente]: 'Pagamento Pendente', [OP.parcial]: 'Pagamento Parcial', [OP.paga]: 'Paga', [OP.cancelada]: 'Cancelada' },
  cr40f_reservadeveculos: { [FAT.pago]: 'Pago', [FAT.pagante]: 'Pagante em Viagem', [FAT.mensal]: 'Faturamento Mensal', [FAT.pendente]: 'Pendente', [FAT.pagamentoPendente]: 'Pagamento Pendente' },
  cr40f_composicaodeprecos: { [CP.pendente]: 'Pendente', [CP.concluida]: 'Concluída' },
}
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const rotulo = (entidade: string, v: number | null) => (v == null ? 'vazio' : ROTULOS[entidade]?.[v] ?? String(v))

/** "Serviço OS-123: Pendente → Pago"; o código do serviço vem da própria pendência. */
export function descreverMudanca(m: Mudanca, p: Pendencia) {
  let nome = ENTIDADE[m.entidade] ?? m.entidade
  if (m.entidade === 'cr40f_reservadeveculos') {
    const i = p.reservaIds.indexOf(m.id)
    if (i >= 0 && p.reservaCodigos[i]) nome = `${nome} ${p.reservaCodigos[i]}`
  }
  if (m.limparLookup) return `${nome}: desvincular da OP`
  return `${nome}: ${rotulo(m.entidade, m.de)} → ${rotulo(m.entidade, m.para)}`
}

type Props = { pendencia: Pendencia | null; source: Source; onClose: () => void; onApplied: (n: number) => void }
type Previa = { mudancas: Mudanca[] } | { error: string } | null

/** Prévia (simular) e confirmação (aplicar) da correção pela Custom API. Durante aplicar, nada fecha o diálogo. */
export function CorrigirDialog({ pendencia: p, source, onClose, onApplied }: Props) {
  const [previa, setPrevia] = useState<Previa>(null)
  const [aplicando, setAplicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const opId = p?.opId ?? null

  useEffect(() => {
    setPrevia(null); setErro(null); setAplicando(false)
    if (!opId) return
    let cancelled = false
    source.sincronizar(opId, 'simular')
      .then((r) => { if (!cancelled) setPrevia({ mudancas: r.mudancas }) })
      .catch((reason) => { if (!cancelled) setPrevia({ error: message(reason) }) })
    return () => { cancelled = true }
  }, [source, opId])

  const close = () => { if (!aplicando) onClose() }

  async function aplicar() {
    if (!opId || aplicando) return
    setAplicando(true); setErro(null)
    try {
      const r = await source.sincronizar(opId, 'aplicar')
      setAplicando(false)
      onApplied(r.mudancas.length)
    } catch (reason) {
      setAplicando(false)
      setErro(message(reason))
    }
  }

  const mudancas = previa && 'mudancas' in previa ? previa.mudancas : null
  const vazio = mudancas != null && mudancas.length === 0
  const titulo = p ? `Corrigir ${p.opCodigo || 'OP'}?` : 'Corrigir?'

  return (
    <Dialog open={p != null} onClose={close} title={titulo}
      actions={vazio || (previa && 'error' in previa)
        ? <Button variant="secondary" onClick={close}>Fechar</Button>
        : <>
          <Button variant="secondary" disabled={aplicando} onClick={close}>Voltar</Button>
          <Button loading={aplicando} disabled={!mudancas || aplicando} onClick={() => void aplicar()}>Aplicar correção</Button>
        </>}>
      {p ? (
        previa == null ? (
          <span className="pend-corrigir__loading" role="status" aria-label="Carregando prévia"><Skeleton height={18} /><Skeleton height={18} /></span>
        ) : 'error' in previa ? (
          <Alert tone="danger" title="Não foi possível simular a correção">{previa.error}</Alert>
        ) : vazio ? (
          'Nada a corrigir — os dados já estão alinhados.'
        ) : (
          <>
            <span>Estas alterações serão gravadas:</span>
            <ul className="pend-corrigir__lista">{previa.mudancas.map((m, i) => <li key={`${m.entidade}:${m.id}:${m.campo}:${i}`}>{descreverMudanca(m, p)}</li>)}</ul>
            {erro ? <Alert tone="danger" title="A correção não foi aplicada">{erro}</Alert> : null}
          </>
        )
      ) : null}
    </Dialog>
  )
}

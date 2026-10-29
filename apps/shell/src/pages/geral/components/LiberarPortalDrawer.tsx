import { Alert, Button, Dialog, Drawer, Field, Sheet, StatusBadge, Textarea } from '@betinhos/ui'
import { Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { message, type Liberacao, type PortalSource } from '../data/portal'
import { formatMoney } from '../domain/format'
import { classificar, rotuloMotivo, type Candidato } from '../domain/portal'

const MAX_OBSERVACAO = 2000

export type LiberarPortalDrawerProps = {
  /** Reservas selecionadas; `null` = fechado. */
  ids: string[] | null
  source: Pick<PortalSource, 'candidatos' | 'liberar'>
  mobile: boolean
  onClose: () => void
  /** Depois de gravar: quantos foram liberados, os que ficaram de fora (bloqueados + falhas). */
  onDone: (result: Liberacao, bloqueados: number) => void
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Confirmação de "Liberar para o portal": separa prontos e bloqueados (com o motivo), observação opcional e total. */
export function LiberarPortalDrawer({ ids, source, mobile, onClose, onDone }: LiberarPortalDrawerProps) {
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [observacao, setObservacao] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  // O Sheet fecha o próprio <dialog> antes de chamar onClose: "Continuar editando" o remonta aberto.
  const [sheetKey, setSheetKey] = useState(0)
  const key = ids?.join(',') ?? ''

  useEffect(() => {
    if (!key) return
    let alive = true
    setCandidatos(null); setErro(null); setObservacao(''); setConfirmExit(false)
    source.candidatos(key.split(',')).then(
      (list) => { if (alive) setCandidatos(list) },
      (e: unknown) => { if (alive) setErro(message(e)) },
    )
    return () => { alive = false }
  }, [key, source])

  const result = useMemo(() => (candidatos ? classificar(candidatos) : null), [candidatos])

  function requestClose() {
    if (saving) return
    if (observacao.trim()) { setConfirmExit(true); return }
    onClose()
  }

  function keepEditing() {
    setConfirmExit(false)
    if (mobile) setSheetKey((k) => k + 1)
  }

  async function liberar() {
    if (!result?.prontos.length) return
    setSaving(true)
    try {
      onDone(await source.liberar(result.prontos, observacao), result.bloqueados.length)
    } catch (e) {
      setErro(message(e))
    } finally {
      setSaving(false)
    }
  }

  const size = mobile ? 'touch' : 'default'
  const prontos = result?.prontos.length ?? 0
  const body = (
    <div className="gr-lp" aria-busy={(!result && !erro) || undefined}>
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      {!result && !erro ? <p role="status">Conferindo os serviços…</p> : null}
      {result ? <>
        <section aria-labelledby="gr-lp-prontos">
          <h3 id="gr-lp-prontos" className="gr-lp__title">Prontos para liberar ({prontos})</h3>
          {prontos ? (
            <ul className="gr-lp__list">
              {result.prontos.map((c) => (
                <li key={c.id} className="gr-lp__item">
                  <span className="gr-lp__dados"><b>{c.codigo}</b><span>{c.cliente?.nome}</span></span>
                  <span className="gr-lp__valor">{c.valor == null ? '—' : formatMoney(c.valor)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="gr-meta">Nenhum serviço selecionado pode ser liberado.</p>}
        </section>
        {result.bloqueados.length ? (
          <section aria-labelledby="gr-lp-bloqueados">
            <h3 id="gr-lp-bloqueados" className="gr-lp__title">Não podem ser liberados ({result.bloqueados.length})</h3>
            <ul className="gr-lp__list">
              {result.bloqueados.map(({ candidato: c, motivo }) => (
                <li key={c.id} className="gr-lp__item">
                  <span className="gr-lp__dados"><b>{c.codigo}</b><span>{c.cliente?.nome || 'Sem cliente'}</span></span>
                  <StatusBadge tone={motivo === 'ja_liberado' ? 'info' : 'warning'}>{rotuloMotivo(motivo)}</StatusBadge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {prontos ? (
          <Field label="Observação para o cliente" hint="Opcional. Vale para todos os serviços liberados.">
            <Textarea name="observacao" rows={3} maxLength={MAX_OBSERVACAO} value={observacao} disabled={saving} onChange={(e) => setObservacao(e.target.value)} />
          </Field>
        ) : null}
      </> : null}
    </div>
  )
  const footer = result ? (
    <div className="gr-lp__foot">
      <span className="gr-lp__total">Total: <strong>{formatMoney(result.total)}</strong></span>
      <Button variant="secondary" size={size} disabled={saving} onClick={requestClose}>Cancelar</Button>
      <Button size={size} icon={<Send size={16} />} loading={saving} disabled={!prontos} onClick={() => { void liberar() }}>
        {prontos ? `Liberar ${plural(prontos, 'serviço', 'serviços')}` : 'Liberar'}
      </Button>
    </div>
  ) : undefined

  const open = ids != null
  const title = 'Liberar para o portal'
  const eyebrow = ids ? plural(ids.length, 'selecionado', 'selecionados') : undefined
  return (
    <>
      {mobile
        ? <Sheet key={sheetKey} open={open} onClose={requestClose} title={title} eyebrow={eyebrow} footer={footer}>{body}</Sheet>
        : <Drawer open={open} onClose={requestClose} title={title} eyebrow={eyebrow} footer={footer}>{body}</Drawer>}
      <Dialog open={confirmExit} onClose={keepEditing} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={keepEditing}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setConfirmExit(false); setObservacao(''); onClose() }}>Descartar</Button>
        </>}>
        A observação para o cliente ainda não foi gravada.
      </Dialog>
    </>
  )
}

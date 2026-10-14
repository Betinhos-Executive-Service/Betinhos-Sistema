import { useState } from 'react'
import { Button, Dialog, Field, Textarea } from '@betinhos/ui'
import { descreverAcao } from '../domain/acoes'
import type { Proposta } from '../domain/types'

export function AprovarDialog({ proposta, busy, onClose, onConfirm }: { proposta: Proposta | null; busy: boolean; onClose: () => void; onConfirm: (p: Proposta) => void }) {
  return (
    <Dialog open={Boolean(proposta)} onClose={onClose} title="Aprovar proposta" actions={<><Button variant="secondary" onClick={onClose} disabled={busy}>Voltar</Button><Button variant="primary" loading={busy} onClick={() => proposta && onConfirm(proposta)}>Confirmar</Button></>}>
      {proposta && <><p><strong>{proposta.titulo}</strong></p><p>{descreverAcao(proposta)}</p><p className="texto-secundario">A gravação usa o seu usuário e fica registrada como decisão aprovada.</p></>}
    </Dialog>
  )
}

export function DescartarDialog({ proposta, busy, onClose, onConfirm }: { proposta: Proposta | null; busy: boolean; onClose: () => void; onConfirm: (p: Proposta, motivo: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const fechar = () => { setMotivo(''); setErro(null); onClose() }
  const confirmar = async () => { if (!proposta) return; try { await onConfirm(proposta, motivo); fechar() } catch (r) { setErro(r instanceof Error ? r.message : String(r)) } }
  return (
    <Dialog open={Boolean(proposta)} onClose={fechar} title="Descartar proposta" actions={<><Button variant="secondary" onClick={fechar} disabled={busy}>Voltar</Button><Button variant="danger" loading={busy} onClick={() => void confirmar()}>Descartar</Button></>}>
      {proposta && <p><strong>{proposta.titulo}</strong></p>}
      <Field label="Motivo" required error={erro}><Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} /></Field>
    </Dialog>
  )
}

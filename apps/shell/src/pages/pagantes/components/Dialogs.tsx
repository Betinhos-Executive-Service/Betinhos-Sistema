import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Dialog, Field, Input } from '@betinhos/ui'
import { X } from 'lucide-react'
import { formatMoney } from '../domain/messages'
import { reciboEnviado } from '../domain/status'
import type { Contato, Pagante } from '../domain/types'

export type StatusRequest = { p: Pagante; kind: 'pago' | 'cancelado' } | null

/** O flow de recibo automático falha sem pessoa ou sem cliente vinculado à pessoa. */
export function reciboBloqueado(p: Pagante, contato?: Contato) {
  if (!p.pessoaId) return 'Indisponível: o pagante não tem pessoa vinculada, e o flow do recibo falharia.'
  if (contato && !contato.cliente) return 'Indisponível: a pessoa não tem cliente vinculado, e o flow do recibo falharia. Vincule o cliente e gere o recibo depois.'
  return null
}

/** Confirma a mudança manual: avisa que dispara os flows reais da OP e do recibo. */
export function StatusDialog({ request, contato, onClose, onConfirm }: { request: StatusRequest; contato?: Contato; onClose: () => void; onConfirm: (enviarRecibo: boolean) => void }) {
  const bloqueio = request ? reciboBloqueado(request.p, contato) : null
  const [enviarRecibo, setEnviarRecibo] = useState(true)
  useEffect(() => { if (request) setEnviarRecibo(!reciboBloqueado(request.p, contato)) }, [request, contato])
  const pago = request?.kind === 'pago'
  const who = request ? `${request.p.pessoa || request.p.codigo} (${formatMoney(request.p.valor)})` : ''
  return (
    <Dialog
      open={request != null}
      onClose={onClose}
      tone={pago ? 'neutral' : 'danger'}
      title={pago ? `Marcar ${who} como pago?` : `Cancelar o pagante ${who}?`}
      actions={<>
        <Button variant="secondary" onClick={onClose}>Manter como está</Button>
        <Button variant={pago ? 'primary' : 'danger'} onClick={() => onConfirm(enviarRecibo && !bloqueio)}>{pago ? 'Marcar como pago' : 'Cancelar pagante'}</Button>
      </>}
    >
      {pago ? (
        <div className="pg-dialog">
          <p>Use para pagamento confirmado fora da Cielo, como Pix recebido na conta. Depois disso o status fica travado, e a OP é atualizada automaticamente.</p>
          {request && !reciboEnviado(request.p) ? (
            <Checkbox label="Gerar e enviar o recibo agora" description={bloqueio ?? 'O recibo vai por e-mail para o pagante e para o financeiro, como no pagamento pela Cielo.'}
              checked={enviarRecibo && !bloqueio} disabled={Boolean(bloqueio)} onChange={(event) => setEnviarRecibo(event.currentTarget.checked)} />
          ) : null}
        </div>
      ) : (
        <p>O link de pagamento deixa de valer para a cobrança, e a OP é reavaliada. Para refazer o rateio, use o Gerar Pagantes.</p>
      )}
    </Dialog>
  )
}

/** Nome da visão salva no navegador deste usuário. */
export function SaveViewDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (nome: string) => void }) {
  const [nome, setNome] = useState('')
  useEffect(() => { if (open) setNome('') }, [open])
  const valid = nome.trim().length > 0
  return (
    <Dialog open={open} onClose={onClose} title="Salvar visão"
      actions={<>
        <Button variant="secondary" onClick={onClose}>Voltar</Button>
        <Button type="submit" form="pg-save-view" disabled={!valid}>Salvar visão</Button>
      </>}>
      <form id="pg-save-view" onSubmit={(event) => { event.preventDefault(); if (valid) onSave(nome) }}>
        <Field label="Nome da visão" hint="Fica salva neste navegador, com os filtros atuais (sem a busca)." required>
          <Input value={nome} maxLength={40} onChange={(event) => setNome(event.currentTarget.value)} placeholder="Ex.: Pix pendentes" autoFocus />
        </Field>
      </form>
    </Dialog>
  )
}

/**
 * Tela Gerar Pagantes embutida (mesmo contrato do botão do model-driven):
 * iframe transparente com `embedded=1`; ela pede para fechar por postMessage.
 */
export function GerarPagantesFrame({ url, onClose }: { url: string | null; onClose: (refresh: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [asking, setAsking] = useState(false)
  useEffect(() => { if (!url) setAsking(false) }, [url])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (url && !dialog.open) dialog.showModal()
    if (!url && dialog.open) dialog.close()
  }, [url])

  useEffect(() => {
    if (!url) return
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return
      const data = event.data as { type?: string; refresh?: boolean } | null
      if (data?.type === 'cr40f-gerar-pagantes:close') onClose(Boolean(data.refresh))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [url, onClose])

  return (
    // Fundo e Esc não fecham direto: o rateio em edição dentro do iframe se perderia sem aviso.
    <dialog ref={ref} className="pg-frame" aria-label="Gerar Pagantes" onCancel={(event) => { event.preventDefault(); setAsking(true) }}
      onClick={(event) => { if (event.target === event.currentTarget) setAsking(true) }}>
      {url ? <iframe ref={frame} className="pg-frame__iframe" src={url} title="Gerar Pagantes" /> : null}
      <Button className="pg-frame__close" variant="secondary" icon={<X size={16} />} aria-label="Fechar Gerar Pagantes" onClick={() => setAsking(true)} />
      <Dialog open={asking} onClose={() => setAsking(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setAsking(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setAsking(false); onClose(true) }}>Descartar</Button>
        </>}>
        O que não foi salvo no Gerar Pagantes será perdido. Para sair salvando, use o botão de concluir da própria tela.
      </Dialog>
    </dialog>
  )
}

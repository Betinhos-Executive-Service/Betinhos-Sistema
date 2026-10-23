import { useRef } from 'react'
import { Alert, Button, Drawer, Sheet } from '@betinhos/ui'
import { Copy, MessageCircle, UserRound } from 'lucide-react'
import { temDadosCadastrados, validadeTexto, whatsappCadastroHref, type PassageiroCadastro } from '../domain/linkCadastro'

export type LinkCadastroRequest = { codigo: string; loading: boolean; link?: string; expiraEm?: string; passageiros?: PassageiroCadastro[]; erro?: string }

type Props = { request: LinkCadastroRequest | null; mobile: boolean; onClose: () => void; onCopied: () => void; onCopyFailed: (reason: unknown) => void }

/** Link de cadastro de passageiros do serviço marcado: validade, dados atuais e envio. */
export function LinkCadastroDrawer({ request, mobile, onClose, onCopied, onCopyFailed }: Props) {
  const last = useRef<LinkCadastroRequest | null>(null)
  if (request) last.current = request
  const shown = request ?? last.current
  const validade = validadeTexto(shown?.expiraEm)
  const passageiros = shown?.passageiros ?? []
  const copy = async () => {
    if (!shown?.link) return
    try { await navigator.clipboard.writeText(shown.link); onCopied() } catch (reason) { onCopyFailed(reason) }
  }
  const title = 'Link de cadastro'
  const eyebrow = shown?.codigo
  const body = (
    <div className="gr-lc" aria-busy={shown?.loading || undefined}>
      {shown?.loading ? <p role="status">Gerando o link…</p> : null}
      {shown?.erro ? <Alert tone="danger">{shown.erro}</Alert> : null}
      {shown?.link ? <>
        <p className="gr-lc__link">{shown.link}</p>
        {validade ? <p className="gr-meta">{validade}</p> : null}
        {temDadosCadastrados(passageiros) ? <Alert tone="warning">A solicitante poderá substituir os dados já cadastrados.</Alert> : null}
        {passageiros.length ? (
          <ul className="gr-lc__list" aria-label="Passageiros">
            {passageiros.map((p) => (
              <li key={p.id} className="gr-lc__item">
                {p.foto ? <img className="gr-lc__foto" src={p.foto} alt={`Foto de ${p.nome}`} /> : <span className="gr-lc__foto" aria-hidden="true"><UserRound size={18} /></span>}
                <span className="gr-lc__dados">
                  <b>{p.nome}</b>
                  <span>{p.telefone || 'Sem telefone'} · {p.email || 'Sem e-mail'}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : <p>Nenhum passageiro vinculado ainda.</p>}
      </> : null}
    </div>
  )
  const footer = shown?.link ? (
    <div className="gr-lc__foot">
      <Button variant="secondary" icon={<Copy size={16} />} onClick={() => { void copy() }}>Copiar link</Button>
      <Button variant="action" icon={<MessageCircle size={16} />} onClick={() => window.open(whatsappCadastroHref(shown.link!, validade), '_blank', 'noopener')}>Enviar por WhatsApp</Button>
    </div>
  ) : undefined
  const open = request != null
  return mobile
    ? <Sheet open={open} onClose={onClose} title={title} eyebrow={eyebrow} footer={footer}>{body}</Sheet>
    : <Drawer open={open} onClose={onClose} title={title} eyebrow={eyebrow} footer={footer}>{body}</Drawer>
}

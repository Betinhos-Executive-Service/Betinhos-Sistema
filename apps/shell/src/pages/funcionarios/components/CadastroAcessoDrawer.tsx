import { Alert, Button, buttonClassName, Dialog, Field, Input } from '@betinhos/ui'
import { Copy, ExternalLink, MessageCircle, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type AcessoSource, type CadastroInput, type CadastroResultado, type Etapa, parseAcessoError, mensagemWhatsApp, whatsappComMensagem } from '../data/acesso'
import { VINCULO } from '../data/schema'
import { useNotify } from './Toasts'

type Props = { acesso: AcessoSource; inicial?: { funcionarioId: string; nomeCompleto: string; celular: string }; onClose: () => void; onCadastrado: (funcionarioId: string) => void }
type Estado = { fase: 'form' } | { fase: 'criando' } | { fase: 'resultado'; r: CadastroResultado } | { fase: 'erro'; codigo: string; mensagem: string; etapas: Etapa[] }

const DOMINIO = 'betinhos.com.br'
const ROTULO: Record<Etapa['estado'], string> = { feita: '✓', pulada: '–', erro: '✕' }

/** primeiro.ultimo sem acentos; igual a AcessoRules.PrefixoEmail do plugin (só prévia: o plugin recalcula). */
export function prefixoDeNome(nome: string) {
  const p = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().split(/\s+/).map((w) => w.replace(/[^a-z0-9-]/g, '')).filter(Boolean)
  return p.length === 0 ? '' : p.length === 1 ? p[0] : `${p[0]}.${p[p.length - 1]}`
}

export function CadastroAcessoDrawer({ acesso, inicial, onClose, onCadastrado }: Props) {
  const notify = useNotify()
  const [nome, setNome] = useState(inicial?.nomeCompleto ?? '')
  const [celular, setCelular] = useState(inicial?.celular ?? '')
  const [emailPessoal, setEmailPessoal] = useState('')
  const [vinculo, setVinculo] = useState<0 | 1>(1)
  const [prefixo, setPrefixo] = useState(prefixoDeNome(inicial?.nomeCompleto ?? ''))
  const [prefixoEditado, setPrefixoEditado] = useState(false)
  const [estado, setEstado] = useState<Estado>({ fase: 'form' })
  const [discarding, setDiscarding] = useState(false)
  const panel = useRef<HTMLElement>(null)

  useEffect(() => { panel.current?.focus() }, [])
  useEffect(() => { if (!prefixoEditado) setPrefixo(prefixoDeNome(nome)) }, [nome, prefixoEditado])

  const touched = (estado.fase === 'form' || estado.fase === 'erro') && (nome !== (inicial?.nomeCompleto ?? '') || celular !== (inicial?.celular ?? '') || emailPessoal !== '')
  const criando = estado.fase === 'criando'
  const input = useMemo<CadastroInput>(() => ({ nomeCompleto: nome.trim(), celular: celular.trim(), emailPessoal: emailPessoal.trim() || undefined, prefixoEmail: prefixo.trim() || undefined, tipoVinculo: vinculo, funcionarioId: inicial?.funcionarioId }), [nome, celular, emailPessoal, prefixo, vinculo, inicial])

  function requestClose() {
    if (criando) return
    if (touched) { setDiscarding(true); return }
    onClose()
  }

  async function criar(dados: CadastroInput) {
    setEstado({ fase: 'criando' })
    try {
      const r = await acesso.cadastrar(dados)
      setEstado({ fase: 'resultado', r })
    } catch (reason) {
      const erro = parseAcessoError(reason)
      setEstado({ fase: 'erro', codigo: erro.codigo, mensagem: erro.message, etapas: erro.etapas })
    }
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); notify('success', 'Copiado.') } catch { notify('error', 'Não foi possível copiar. Selecione e copie manualmente.') }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !discarding) requestClose() }}>
      <aside ref={panel} className="drawer drawer--acesso" role="dialog" aria-modal="true" aria-labelledby="acesso-title" tabIndex={-1} onKeyDown={(event) => { if (event.key === 'Escape' && !discarding) requestClose() }}>
        <header className="drawer-head">
          <div className="drawer-title"><h2 id="acesso-title">Cadastrar acesso ao App Motoristas</h2></div>
          <Button variant="secondary" icon={<X size={18} />} aria-label="Fechar" onClick={requestClose} disabled={criando} />
        </header>
        <div className="drawer-body">
          {(estado.fase === 'form' || estado.fase === 'criando' || estado.fase === 'erro') && (
            <form id="acesso-form" onSubmit={(event) => { event.preventDefault(); void criar(input) }}>
              <Field label="Nome completo" required><Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={criando || Boolean(inicial)} autoComplete="off" /></Field>
              <Field label="Celular" required hint="Com DDD. Recebe o link e a senha no WhatsApp."><Input inputMode="tel" value={celular} onChange={(e) => setCelular(e.target.value)} disabled={criando} /></Field>
              <Field label="E-mail pessoal" hint="Opcional, para recuperação de senha."><Input type="email" value={emailPessoal} onChange={(e) => setEmailPessoal(e.target.value)} disabled={criando} /></Field>
              <Field label="Vínculo">
                <select className="bt-control__input" id="acesso-vinculo" value={vinculo} onChange={(e) => setVinculo(Number(e.target.value) as 0 | 1)} disabled={criando}>
                  {VINCULO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="E-mail Microsoft" hint={`Será ${prefixo || '…'}@${DOMINIO}. Se já existir, o sistema acrescenta um número.`}>
                <Input value={prefixo} onChange={(e) => { setPrefixoEditado(true); setPrefixo(e.target.value) }} suffix={`@${DOMINIO}`} disabled={criando} />
              </Field>
              <p className="acesso-previa" aria-live="polite">{prefixo ? `${prefixo}@${DOMINIO}` : ''}</p>
              {estado.fase === 'erro' && (
                <Alert tone="danger" title="Não foi possível concluir">
                  {estado.mensagem}
                  {estado.etapas.length > 0 && <ul className="acesso-etapas">{estado.etapas.map((e) => <li key={e.etapa} data-estado={e.estado}><span aria-hidden>{ROTULO[e.estado]}</span> {e.etapa}: {e.detalhe}</li>)}</ul>}
                </Alert>
              )}
            </form>
          )}
          {estado.fase === 'resultado' && (
            <div className="acesso-resultado">
              <Alert tone="success" title="Acesso criado">A senha aparece só agora. Envie para o motorista antes de fechar.</Alert>
              <dl className="acesso-credenciais">
                <dt>E-mail</dt><dd><code>{estado.r.emailMicrosoft}</code> <Button variant="secondary" size="compact" icon={<Copy size={14} />} aria-label="Copiar e-mail" onClick={() => copiar(estado.r.emailMicrosoft)} /></dd>
                <dt>Senha temporária</dt><dd><code>{estado.r.senhaTemporaria || '(conta já existia; senha não alterada)'}</code> {estado.r.senhaTemporaria && <Button variant="secondary" size="compact" icon={<Copy size={14} />} aria-label="Copiar senha" onClick={() => copiar(estado.r.senhaTemporaria)} />}</dd>
                <dt>Link do app</dt><dd><a href={estado.r.linkApp} target="_blank" rel="noopener noreferrer">{estado.r.linkApp}</a></dd>
              </dl>
              <ul className="acesso-etapas">{estado.r.etapas.map((e) => <li key={e.etapa} data-estado={e.estado}><span aria-hidden>{ROTULO[e.estado]}</span> {e.etapa}: {e.detalhe}</li>)}</ul>
            </div>
          )}
        </div>
        <footer className="drawer-foot drawer-foot--active">
          {estado.fase === 'resultado' ? (
            <div className="cluster">
              {(() => { const href = whatsappComMensagem(celular, mensagemWhatsApp({ nome, emailMicrosoft: estado.r.emailMicrosoft, senhaTemporaria: estado.r.senhaTemporaria, linkApp: estado.r.linkApp })); return href ? <a className={buttonClassName({ variant: 'primary' })} href={href} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden /> Enviar no WhatsApp</a> : null })()}
              <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => onCadastrado(estado.r.funcionarioId)}>Abrir ficha</Button>
            </div>
          ) : (
            <div className="cluster">
              {estado.fase === 'erro' && <Button variant="secondary" onClick={() => void criar(input)}>Tentar de novo</Button>}
              <Button type="submit" form="acesso-form" loading={criando} disabled={!nome.trim() || !celular.trim()}>Criar acesso</Button>
            </div>
          )}
        </footer>
      </aside>
      <Dialog open={discarding} onClose={() => setDiscarding(false)} title="Descartar alterações?" actions={<><Button variant="secondary" onClick={() => setDiscarding(false)}>Continuar editando</Button><Button variant="danger" onClick={() => { setDiscarding(false); onClose() }}>Descartar</Button></>}>
        Os dados digitados ainda não foram enviados.
      </Dialog>
    </div>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Dialog, Drawer, Field, Sheet, Skeleton, StatusBadge, Textarea, useToast } from '@betinhos/ui'
import { Save, Send, ShieldCheck, Undo2 } from 'lucide-react'
import type { Source } from '../data/source'
import { aplicarLiberacao, mesLabel, motivoLabel, podeEditarObservacao, podeLiberar, podeResponder, podeRetirar } from '../domain/regras'
import type { Linha, Mensagem } from '../domain/types'
import { Fechamento, Situacao, fmtData, money } from './ValidacaoList'

type Props = {
  linha: Linha | null
  /** Id pedido pelo link quando a linha não existe (outro ambiente ou removida). */
  missing: boolean
  onClose: () => void
  source: Source
  mobile: boolean
  onRespondida: (l: Linha, mensagem: Mensagem, prazoTacita: string) => void
  onRetirada: (l: Linha) => void
  /** Liberação ou observação salva: campos novos da linha. */
  onPatch: (l: Linha, patch: Partial<Linha>) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const fmtHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Dado({ label, children }: { label: string; children: ReactNode }) {
  return <div className="vc-dado"><dt>{label}</dt><dd>{children || '—'}</dd></div>
}

/** Detalhe do serviço: dados, composição, conversa com resposta e retirada. Fechar com resposta digitada pede confirmação. */
export function ValidacaoDrawer({ linha, missing, onClose, source, mobile, onRespondida, onRetirada, onPatch }: Props) {
  const toast = useToast()
  const [mensagens, setMensagens] = useState<Mensagem[] | null>(null)
  const [erroConversa, setErroConversa] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [erroTexto, setErroTexto] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [retirando, setRetirando] = useState(false)
  const [confirmarRetirada, setConfirmarRetirada] = useState(false)
  const [confirmarSaida, setConfirmarSaida] = useState(false)
  const validacaoId = linha?.validacaoId ?? null
  const [obs, setObs] = useState('')
  const [salvandoObs, setSalvandoObs] = useState(false)
  useEffect(() => { setObs(linha?.observacao ?? '') }, [linha?.id, linha?.situacao]) // eslint-disable-line react-hooks/exhaustive-deps
  const obsAlterada = linha != null && (podeLiberar(linha.situacao) ? obs.trim() !== '' : obs.trim() !== linha.observacao.trim())

  useEffect(() => {
    setTexto(''); setErroTexto(null); setMensagens(null); setErroConversa(null)
    if (!validacaoId) return
    let live = true
    source.mensagens(validacaoId).then((m) => { if (live) setMensagens(m) }).catch((e) => { if (live) setErroConversa(reasonText(e)) })
    return () => { live = false }
  }, [validacaoId, source])

  const open = linha != null || missing
  const ocupado = enviando || retirando || salvandoObs
  function close() {
    if (ocupado) return
    if (texto.trim() || obsAlterada) { setConfirmarSaida(true); return }
    onClose()
  }

  async function responder() {
    if (!linha || enviando) return
    if (!texto.trim()) { setErroTexto('Escreva a resposta antes de enviar.'); return }
    setEnviando(true)
    try {
      const r = await source.responder(linha, texto)
      setMensagens((m) => [...(m ?? []), r.mensagem])
      setTexto('')
      onRespondida(linha, r.mensagem, r.prazoTacita)
      toast(r.avisoFalhou
        ? { tone: 'warning', message: `Resposta salva, mas o e-mail ao cliente não saiu (${r.avisoFalhou}). Avise o validador.` }
        : { tone: 'success', message: `Resposta enviada. O cliente tem até ${fmtData(r.prazoTacita)} para aprovar.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível enviar. A resposta continua no campo. ${reasonText(reason)}` })
    } finally {
      setEnviando(false)
    }
  }

  async function liberar() {
    if (!linha) return
    setSalvandoObs(true)
    try {
      const r = await source.liberar([linha], obs)
      if (r.failed.length) throw new Error(r.failed[0].message)
      onPatch(linha, { ...aplicarLiberacao(linha, new Date().toISOString(), obs), id: r.ok[0].validacaoId, validacaoId: r.ok[0].validacaoId })
      toast({ tone: 'success', message: `Serviço ${linha.codigo} liberado. O cliente já vê no portal.` })
      onClose()
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível liberar. ${reasonText(reason)}` })
    } finally {
      setSalvandoObs(false)
    }
  }

  async function salvarObservacao() {
    if (!linha?.validacaoId) return
    setSalvandoObs(true)
    try {
      await source.setObservacao(linha.validacaoId, obs)
      onPatch(linha, { observacao: obs.trim() })
      toast({ tone: 'success', message: 'Observação salva. O cliente vê a nova no portal.' })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível salvar a observação. ${reasonText(reason)}` })
    } finally {
      setSalvandoObs(false)
    }
  }

  async function retirar() {
    if (!linha?.validacaoId) return
    setRetirando(true)
    try {
      await source.retirar(linha.validacaoId)
      setConfirmarRetirada(false)
      onRetirada(linha)
      toast({ tone: 'success', message: `Serviço ${linha.codigo} retirado do portal. A conversa ficou guardada.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível retirar. ${reasonText(reason)}` })
    } finally {
      setRetirando(false)
    }
  }

  const title = linha ? `Serviço ${linha.codigo}` : 'Serviço'
  const responde = linha != null && podeResponder(linha.situacao)
  const footer = !linha ? <Button variant="secondary" onClick={onClose}>Voltar à lista</Button> : (
    <>
      {podeLiberar(linha.situacao) ? <Button icon={<ShieldCheck size={16} />} loading={salvandoObs} disabled={enviando || retirando || linha.valorComposicao == null} onClick={() => void liberar()}>{linha.situacao === 'retirado' ? 'Liberar de novo' : 'Liberar para o portal'}</Button> : null}
      {podeRetirar(linha.situacao) ? <Button variant="secondary" icon={<Undo2 size={16} />} disabled={ocupado} onClick={() => setConfirmarRetirada(true)}>Retirar do portal</Button> : null}
      <Button variant="secondary" disabled={ocupado} onClick={close}>Fechar</Button>
    </>
  )

  const total = linha?.composicao.reduce((s, i) => s + i.valor, 0) ?? 0
  const body = missing || !linha
    ? <Alert tone="warning" title="Serviço não encontrado">O link pode ser de outro ambiente ou o serviço saiu da lista. Atualize e procure pela busca.</Alert>
    : (
      <div className="vc-detalhe">
        <div className="vc-detalhe__status"><Situacao l={linha} /><Fechamento l={linha} /></div>
        {linha.situacao === 'a_liberar' ? <Alert tone="info">Composição concluída e ainda não liberada: o cliente não vê este serviço. Revise o valor e libere.</Alert> : null}
        {linha.situacao === 'retirado' ? <Alert tone="info">Retirado do portal: o cliente não vê mais este serviço. A conversa abaixo ficou guardada; "Liberar de novo" devolve ao portal com o prazo reaberto.</Alert> : null}
        <section className="vc-secao" aria-labelledby="vc-dados">
          <h3 id="vc-dados" className="vc-secao__titulo">Dados do serviço</h3>
          <dl className="vc-dados">
            <Dado label="Data">{fmtData(linha.data)}{linha.data ? ` · fechamento de ${mesLabel(linha.data.slice(0, 7))}` : ''}</Dado>
            <Dado label="Cliente">{linha.cliente.nome}</Dado>
            <Dado label="Trajeto">{linha.trajeto}</Dado>
            <Dado label="CR">{linha.cr}</Dado>
            <Dado label="Pedido">{linha.pedido}</Dado>
            <Dado label="Prazo da tácita">{fmtData(linha.prazoTacita)}</Dado>
            {linha.aprovadoEm ? <Dado label="Aprovado em">{fmtHora(linha.aprovadoEm)}{linha.aprovadoPor ? ` por ${linha.aprovadoPor}` : ' (automaticamente)'}</Dado> : null}
            {linha.observacao && !podeLiberar(linha.situacao) && !podeEditarObservacao(linha.situacao) ? <Dado label="Observação ao cliente">{linha.observacao}</Dado> : null}
          </dl>
        </section>
        <section className="vc-secao" aria-labelledby="vc-comp">
          <h3 id="vc-comp" className="vc-secao__titulo">Composição de preço</h3>
          {linha.composicao.length ? (
            <table className="vc-comp">
              <tbody>
                {linha.composicao.map((i) => <tr key={i.item}><th scope="row">{i.item}</th><td className="vc-num">{money.format(i.valor)}</td></tr>)}
                <tr className="vc-comp__total"><th scope="row">Total</th><td className="vc-num">{money.format(linha.valorComposicao ?? total)}</td></tr>
              </tbody>
            </table>
          ) : <p className="vc-muted">Composição sem itens detalhados.</p>}
          <p className="vc-valores">
            <span>Valor liberado: <strong className="vc-num">{linha.valorLiberado == null ? '—' : money.format(linha.valorLiberado)}</strong></span>
            {linha.valorAnterior != null ? <span>Valor anterior: <s className="vc-num">{money.format(linha.valorAnterior)}</s> <StatusBadge tone="warning">Preço alterado</StatusBadge></span> : null}
          </p>
        </section>
        {podeLiberar(linha.situacao) || podeEditarObservacao(linha.situacao) ? (
          <section className="vc-secao" aria-labelledby="vc-obs">
            <h3 id="vc-obs" className="vc-secao__titulo">Observação ao cliente</h3>
            <Field label="Observação" hint={podeLiberar(linha.situacao) ? 'Opcional. Aparece no portal junto do serviço (ex.: motivo da espera).' : 'O cliente vê a observação no portal.'}>
              <Textarea name="observacao" rows={2} maxLength={2000} value={obs} disabled={salvandoObs} onChange={(e) => setObs(e.target.value)} />
            </Field>
            {podeEditarObservacao(linha.situacao) ? <div><Button variant="secondary" size="compact" icon={<Save size={14} />} disabled={!obsAlterada} loading={salvandoObs} onClick={() => void salvarObservacao()}>Salvar observação</Button></div> : null}
          </section>
        ) : null}
        {linha.validacaoId ? (
          <section className="vc-secao" aria-labelledby="vc-conversa">
            <h3 id="vc-conversa" className="vc-secao__titulo">Conversa</h3>
            {erroConversa ? <Alert tone="danger" title="Não foi possível carregar a conversa">{erroConversa}</Alert>
              : mensagens == null ? <Skeleton height={56} />
              : mensagens.length ? (
                <ol className="vc-conversa" aria-live="polite">
                  {mensagens.map((m) => (
                    <li key={m.id} className={`vc-bolha vc-bolha--${m.lado}`}>
                      <span className="vc-bolha__meta">{m.autor || (m.lado === 'cliente' ? 'Cliente' : 'Betinhos')} · {fmtHora(m.criadaEm)}{m.motivo ? ` · ${motivoLabel(m.motivo)}` : ''}</span>
                      <p>{m.texto}</p>
                    </li>
                  ))}
                </ol>
              ) : <p className="vc-muted">Nenhuma mensagem ainda.</p>}
            {responde ? (
              <form className="vc-responder" onSubmit={(e) => { e.preventDefault(); void responder() }}>
                <Field label="Responder" error={erroTexto} hint="O cliente recebe a resposta por e-mail e o prazo da aprovação automática recomeça.">
                  <Textarea name="resposta" rows={3} value={texto} disabled={enviando} onChange={(e) => { setTexto(e.target.value); if (erroTexto) setErroTexto(null) }} />
                </Field>
                <Button type="submit" icon={<Send size={16} />} loading={enviando}>Enviar resposta</Button>
              </form>
            ) : null}
          </section>
        ) : null}
      </div>
    )

  const painel = mobile
    ? <Sheet open={open} onClose={close} eyebrow="Validação do cliente" title={title} footer={footer}>{body}</Sheet>
    : <Drawer open={open} onClose={close} size="wide" eyebrow="Validação do cliente" title={title} footer={footer}>{body}</Drawer>
  return (
    <>
      {painel}
      <Dialog open={confirmarRetirada} onClose={() => { if (!retirando) setConfirmarRetirada(false) }} tone="danger" title="Retirar do portal?"
        actions={<>
          <Button variant="secondary" disabled={retirando} onClick={() => setConfirmarRetirada(false)}>Manter no portal</Button>
          <Button variant="danger" loading={retirando} onClick={() => void retirar()}>Retirar do portal</Button>
        </>}>
        O cliente deixa de ver o serviço {linha?.codigo} no portal e ele não entra no fechamento. A conversa fica guardada aqui. Para voltar, libere de novo na Tabela Geral.
      </Dialog>
      <Dialog open={confirmarSaida} onClose={() => setConfirmarSaida(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirmarSaida(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setConfirmarSaida(false); setTexto(''); setObs(linha?.observacao ?? ''); onClose() }}>Descartar</Button>
        </>}>
        {texto.trim() ? 'A resposta digitada ainda não foi enviada.' : 'A observação alterada ainda não foi salva.'}
      </Dialog>
    </>
  )
}

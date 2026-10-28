import { useState } from 'react'
import {
  Alert, Button, Cluster, Dialog, Drawer, Field, Select, Sheet, Stack, StatusBadge, Textarea, buttonClassName, useMediaQuery, useToast,
} from '@betinhos/ui'
import { Check, FileText, MessageCircleQuestionMark, Send } from 'lucide-react'
import { useApi } from '../api/ApiContext'
import { ErroPortal } from '../api/PortalApi'
import { brl, dataHora } from '../domain/formato'
import { MOTIVOS, podeAprovar, statusInfo } from '../domain/regras'
import type { Motivo, Servico } from '../domain/types'
import { Conversa } from './Conversa'
import { textoAprovacao } from './prazo'
import './Detalhe.css'

type Props = { servico: Servico; prazo: string; onFechar: () => void; onAtualizado: (s: Servico) => void }

/** Detalhe de um serviço. Montado com `key` do serviço: cada abertura começa com o formulário limpo. */
export function Detalhe({ servico: s, prazo, onFechar, onAtualizado }: Props) {
  const mobile = useMediaQuery('(max-width: 820px)')
  const api = useApi()
  const toast = useToast()
  const [abrindoDuvida, setAbrindoDuvida] = useState(false)
  const [motivo, setMotivo] = useState<Motivo | null>(null)
  const [texto, setTexto] = useState('')
  const [erros, setErros] = useState<{ motivo?: string; texto?: string }>({})
  const [ocupado, setOcupado] = useState<'aprovar' | 'enviar' | null>(null)
  // Ação que espera o "Descartar alterações?" quando há mensagem digitada e não enviada.
  const [pendente, setPendente] = useState<'fechar' | 'cancelar' | 'aprovar' | null>(null)

  const conversaAberta = s.status === 'em_duvida' || s.status === 'respondido'
  const escrevendo = podeAprovar(s) && (abrindoDuvida || conversaAberta)

  function limparFormulario() {
    setAbrindoDuvida(false)
    setMotivo(null)
    setTexto('')
    setErros({})
  }

  const temRascunho = texto.trim() !== ''

  function executar(acao: 'fechar' | 'cancelar' | 'aprovar') {
    if (acao === 'fechar') onFechar()
    else if (acao === 'cancelar') limparFormulario()
    else void aprovar()
  }

  /** Com mensagem não enviada, pergunta antes de fechar, cancelar ou aprovar. */
  function pedir(acao: 'fechar' | 'cancelar' | 'aprovar') {
    if (temRascunho) setPendente(acao)
    else executar(acao)
  }

  function fechar() {
    if (!ocupado) pedir('fechar')
  }

  async function aprovar() {
    setOcupado('aprovar')
    try {
      const [atualizado] = await api.aprovar([s.id])
      if (atualizado) onAtualizado(atualizado)
      toast({ tone: 'success', message: `Serviço ${s.numero} aprovado.` })
      onFechar()
    } catch {
      toast({ tone: 'danger', message: 'Não foi possível aprovar agora. Tente de novo.' })
    } finally {
      setOcupado(null)
    }
  }

  async function enviar() {
    const novos = { motivo: abrindoDuvida && !motivo ? 'Escolha o motivo da dúvida.' : undefined, texto: texto.trim() ? undefined : 'Escreva a mensagem.' }
    setErros(novos)
    if (novos.motivo || novos.texto) return
    setOcupado('enviar')
    try {
      onAtualizado(abrindoDuvida && motivo ? await api.abrirDuvida(s.id, motivo, texto) : await api.responder(s.id, texto))
      limparFormulario()
      toast({ tone: 'success', message: 'Mensagem enviada. A Betinhos foi avisada por e-mail.' })
    } catch (err) {
      toast({ tone: 'danger', message: err instanceof ErroPortal && err.codigo === 'nao_permitido' ? 'Este serviço não aceita mais mensagens.' : 'Não foi possível enviar agora. Seu texto continua aqui.' })
    } finally {
      setOcupado(null)
    }
  }

  const bloqueado = ocupado !== null
  const rodape = !podeAprovar(s) ? (
    <p className="pc-det__aprovado"><Check size={16} aria-hidden />{textoAprovacao(s)}</p>
  ) : abrindoDuvida ? (
    <div className="pc-det__acoes">
      <Button variant="ghost" onClick={() => pedir('cancelar')} disabled={bloqueado}>Cancelar</Button>
      <Button onClick={enviar} loading={ocupado === 'enviar'} disabled={bloqueado} icon={<Send size={16} aria-hidden />}>Enviar dúvida</Button>
    </div>
  ) : (
    <div className="pc-det__acoes">
      {conversaAberta ? (
        <Button variant="secondary" onClick={enviar} loading={ocupado === 'enviar'} disabled={bloqueado} icon={<Send size={16} aria-hidden />}>Enviar resposta</Button>
      ) : (
        <Button variant="secondary" onClick={() => setAbrindoDuvida(true)} disabled={bloqueado} icon={<MessageCircleQuestionMark size={16} aria-hidden />}>Tenho uma dúvida</Button>
      )}
      <Button onClick={() => pedir('aprovar')} loading={ocupado === 'aprovar'} disabled={bloqueado} icon={<Check size={16} aria-hidden />}>Aprovar serviço</Button>
    </div>
  )

  const info = statusInfo(s.status)
  const Painel = mobile ? Sheet : Drawer
  return (
    <>
      <Painel open onClose={fechar} title={s.numero} eyebrow={`Serviço de ${dataHora(s.saida)}`} footer={rodape} {...(mobile ? {} : { size: 'wide' as const })}>
        <Stack gap="4">
          <Cluster gap="2">
            <StatusBadge tone={info.tom} dot>{info.rotulo}</StatusBadge>
            <span className="pc-det__prazo">{prazo}</span>
          </Cluster>

          <dl className="pc-det__dados">
            <div className="pc-det__item pc-det__item--largo"><dt>Trajeto</dt><dd>{s.origem} → {s.destino}</dd></div>
            <div className="pc-det__item"><dt>Passageiros</dt><dd>{s.passageiros.join(', ')}</dd></div>
            <div className="pc-det__item"><dt>Solicitante</dt><dd>{s.solicitante}</dd></div>
            <div className="pc-det__item"><dt>Veículo</dt><dd>{s.veiculo}</dd></div>
            <div className="pc-det__item"><dt>Pedido Tenaris</dt><dd>{s.pedidoCliente}</dd></div>
            <div className="pc-det__item pc-det__item--largo"><dt>Centro de resultado</dt><dd>{s.cr}</dd></div>
          </dl>

          <section className="pc-det__bloco" aria-labelledby="pc-det-preco">
            <h3 id="pc-det-preco" className="pc-det__subtitulo">Composição do preço</h3>
            <table className="pc-preco">
              <tbody>
                {s.composicao.map((l) => <tr key={l.rotulo}><th scope="row">{l.rotulo}</th><td>{brl(l.valor)}</td></tr>)}
              </tbody>
              <tfoot>
                <tr><th scope="row">Total</th><td>{brl(s.valorTotal)}</td></tr>
              </tfoot>
            </table>
            {s.valorAnterior != null && (
              <p className="pc-det__anterior">Valor anterior: <s>{brl(s.valorAnterior)}</s>. A Betinhos alterou o preço; o prazo de validação recomeçou.</p>
            )}
          </section>

          {s.observacao && <Alert tone="info" title="Observação da Betinhos">{s.observacao}</Alert>}

          {s.voucherUrl && (
            <a className={buttonClassName({ variant: 'secondary' }, 'pc-det__voucher')} href={s.voucherUrl} target="_blank" rel="noopener noreferrer">
              <FileText size={16} aria-hidden /> Ver voucher (PDF)
            </a>
          )}

          {(s.mensagens.length > 0 || escrevendo) && (
            <section className="pc-det__bloco" aria-labelledby="pc-det-duvidas">
              <h3 id="pc-det-duvidas" className="pc-det__subtitulo">Dúvidas</h3>
              <Conversa mensagens={s.mensagens} />
              {s.status === 'em_duvida' && <p className="pc-det__nota">A Betinhos responde por aqui e você recebe um e-mail. Enquanto houver dúvida aberta, o prazo de aprovação automática fica parado.</p>}
              {escrevendo && (
                <div className="pc-det__form">
                  {abrindoDuvida && (
                    <Field label="Motivo" error={erros.motivo} required>
                      <Select value={motivo} onChange={(v) => setMotivo(v as Motivo | null)} options={MOTIVOS} placeholder="Escolha o motivo" invalid={!!erros.motivo} />
                    </Field>
                  )}
                  <Field label={abrindoDuvida ? 'Sua dúvida' : s.status === 'respondido' ? 'Responder' : 'Acrescentar informação'} error={erros.texto} required={abrindoDuvida}>
                    <Textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} invalid={!!erros.texto} placeholder={abrindoDuvida ? 'Ex.: o voo pousou no horário; por que houve cobrança de espera?' : 'Escreva sua mensagem'} />
                  </Field>
                </div>
              )}
            </section>
          )}
        </Stack>
      </Painel>
      <Dialog
        open={pendente !== null}
        onClose={() => setPendente(null)}
        title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendente(null)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { const acao = pendente!; setPendente(null); executar(acao) }}>Descartar</Button>
        </>}
      >
        A mensagem que você escreveu não foi enviada e será perdida.
      </Dialog>
    </>
  )
}

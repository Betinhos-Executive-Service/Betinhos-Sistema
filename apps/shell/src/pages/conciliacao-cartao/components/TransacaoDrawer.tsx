import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, Drawer, Field, Radio, Textarea, useToast } from '@betinhos/ui'
import { fmtData } from '../../equipamentos/components/EquipamentosList'
import { formatDate, formatMoney } from '../../pagantes/domain/messages'
import { acoes, cartaoVigente, janelaCandidatas, MOTIVO_CASADA, MOTIVO_REABERTA, motivoReprocessar, SITUACAO, tipoLabel } from '../domain/regras'
import { message, type Source } from '../data/source'
import type { Cartao, DespesaCandidata, Transacao } from '../domain/types'
import { cartaoTexto, Situacao } from './TransacoesLista'

type Props = {
  transacao: Transacao | null
  cartoes: Cartao[]
  source: Source
  onClose: () => void
  onSaved: (t: Transacao) => void
  /** Abre o cadastro do cartão já com a conta, o final e o início vindos da transação. */
  onCadastrarCartao: (t: Transacao) => void
}

type Candidatas = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; list: DespesaCandidata[] }

/** Detalhe da transação com as ações de conciliação; com despesa escolhida ou motivo digitado, fechar pede confirmação. */
export function TransacaoDrawer({ transacao: t, cartoes, source, onClose, onSaved, onCadastrarCartao }: Props) {
  const toast = useToast()
  const [candidatas, setCandidatas] = useState<Candidatas>({ status: 'loading' })
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erroMotivo, setErroMotivo] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** Saída (fechar ou ir cadastrar o cartão) esperando a confirmação de descarte. */
  const [pendingExit, setPendingExit] = useState<(() => void) | null>(null)
  const pode = t ? acoes(t) : null
  const janela = t && pode?.casar ? janelaCandidatas(t) : null

  // Outra transação (ou a mesma depois de reprocessar) limpa o que foi escolhido e busca as candidatas de novo.
  const chave = t && pode?.casar ? `${t.id}:${t.motoristaId}` : null
  useEffect(() => { setEscolhida(null); setMotivo(''); setErroMotivo(null) }, [t?.id])
  useEffect(() => {
    if (!chave || !t) return
    let ativo = true
    setCandidatas({ status: 'loading' })
    source.candidatas(t).then(
      (list) => { if (ativo) setCandidatas({ status: 'ok', list }) },
      (reason) => { if (ativo) setCandidatas({ status: 'error', message: message(reason) }) },
    )
    return () => { ativo = false }
  }, [chave])

  const dirty = escolhida != null || motivo.trim() !== ''
  function sair(destino: () => void) {
    if (saving) return
    if (dirty) { setPendingExit(() => destino); return }
    destino()
  }
  const close = () => sair(onClose)

  async function run(acao: () => Promise<void>, salvo: Transacao, mensagem: string, fechar = true) {
    if (saving) return
    setSaving(true)
    try {
      await acao()
      onSaved(salvo)
      toast({ tone: 'success', message: mensagem })
      if (fechar) onClose()
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível gravar. ${message(reason)}` })
    } finally {
      setSaving(false)
    }
  }

  function casar(lista: DespesaCandidata[]) {
    if (!t || !escolhida) return
    const d = lista.find((x) => x.id === escolhida)
    void run(() => source.casar(t, escolhida), { ...t, situacao: SITUACAO.manual, motivo: MOTIVO_CASADA, despesaId: escolhida, despesaNome: d?.nome ?? '' }, 'Transação casada com a despesa.')
  }
  function ignorar() {
    if (!t) return
    if (!motivo.trim()) { setErroMotivo('Diga por que a transação não precisa de despesa.'); return }
    void run(() => source.ignorar(t, motivo), { ...t, situacao: SITUACAO.ignorada, motivo: motivo.trim() }, 'Transação ignorada.')
  }
  const reabrir = () => t && void run(() => source.reabrir(t), { ...t, situacao: SITUACAO.pendente, motivo: MOTIVO_REABERTA }, 'Transação de volta em Para revisar.')
  function reprocessar(c: Cartao) {
    if (!t) return
    const salvo = { ...t, cartaoId: c.id, cartaoNome: c.nome, motoristaId: c.motoristaId, motoristaNome: c.motoristaNome, situacao: SITUACAO.pendente, motivo: motivoReprocessar(c) }
    // Fica aberto: o próximo passo é casar com a despesa do motorista.
    void run(() => source.reprocessar(t, c), salvo, `Cartão vinculado: ${c.motoristaNome}. Agora case com a despesa.`, false)
  }

  const vig = t && pode?.reprocessar ? cartaoVigente(cartoes, t) : null
  const parcela = t?.totalParcelas && t.totalParcelas > 1 ? `${t.parcela ?? '?'} de ${t.totalParcelas}` : 'À vista'

  return (
    <>
      <Drawer open={t != null} onClose={close} size="wide" eyebrow="Conciliação do cartão" title={t ? t.estabelecimento || t.descricao || 'Transação' : 'Transação'}
        footer={<Button variant="secondary" disabled={saving} onClick={close}>Fechar</Button>}>
        {t ? (
          <div className="cc-detalhe">
            <dl className="cc-dados">
              <div><dt>Valor</dt><dd className="cc-num">{formatMoney(t.valor)}</dd></div>
              <div><dt>Compra</dt><dd>{fmtData(t.dataCompra)}</dd></div>
              <div><dt>Situação</dt><dd><Situacao t={t} /></dd></div>
              <div><dt>Cartão</dt><dd>{cartaoTexto(t)}</dd></div>
              <div><dt>Motorista</dt><dd>{t.motoristaNome || 'Sem motorista'}</dd></div>
              <div><dt>Tipo</dt><dd>{tipoLabel(t.tipo)}</dd></div>
              <div><dt>Parcela</dt><dd>{parcela}</dd></div>
              <div><dt>Fatura</dt><dd>{t.fatura || '—'}</dd></div>
              <div className="cc-dados__wide"><dt>Descrição no banco</dt><dd>{t.descricao || '—'}</dd></div>
              {t.despesaId ? <div className="cc-dados__wide"><dt>Despesa</dt><dd>{t.despesaNome || t.despesaId}</dd></div> : null}
              {t.motivo ? <div className="cc-dados__wide"><dt>Motivo</dt><dd>{t.motivo}</dd></div> : null}
            </dl>

            {vig ? (
              <section className="cc-secao" aria-label="Reprocessar">
                <h3 className="cc-secao__titulo">Reprocessar</h3>
                {'cartao' in vig ? (
                  <>
                    <p className="cc-texto">Cartão vigente em {fmtData(t.dataCompra)}: <strong>{vig.cartao.nome}</strong> ({vig.cartao.motoristaNome}).</p>
                    <div><Button loading={saving} onClick={() => reprocessar(vig.cartao)}>Vincular cartão e motorista</Button></div>
                  </>
                ) : vig.erro === 'nenhum' ? (
                  <Alert tone="warning" title="Nenhum cartão vale para esta compra" action={<Button variant="secondary" onClick={() => sair(() => onCadastrarCartao(t))}>Cadastrar cartão</Button>}>
                    Conta {t.conta || '—'}{t.final ? `, final ${t.final}` : ', sem final'}, em {fmtData(t.dataCompra)}. Cadastre o cartão com o motorista e volte para reprocessar.
                  </Alert>
                ) : (
                  <Alert tone="danger" title="Mais de um cartão vale para esta compra">Ajuste as vigências na aba Cartões para sobrar um só nesta data.</Alert>
                )}
              </section>
            ) : null}

            {janela ? (
              <section className="cc-secao" aria-label="Casar com despesa">
                <h3 className="cc-secao__titulo">Casar com despesa</h3>
                <p className="cc-muted">Despesas de {t.motoristaNome} no cartão, ainda não conciliadas, de {formatMoney(janela.alvo)} (±R$ 0,05), de {fmtData(janela.diaDe)} a {fmtData(janela.diaAte)}.</p>
                {candidatas.status === 'loading' ? <p className="cc-texto">Procurando despesas…</p>
                  : candidatas.status === 'error' ? <Alert tone="danger" title="Não foi possível buscar as despesas">{candidatas.message}</Alert>
                  : !candidatas.list.length ? <p className="cc-texto">Nenhuma despesa encontrada. O motorista precisa lançar a despesa no App Motoristas; se a compra não precisa de despesa, ignore a transação.</p>
                  : (
                    <>
                      <div role="radiogroup" aria-label="Despesas candidatas" className="cc-candidatas">
                        {candidatas.list.map((d) => (
                          <Radio key={d.id} name={`despesa-${t.id}`} checked={escolhida === d.id} disabled={saving} onChange={() => setEscolhida(d.id)}
                            label={`${d.nome || d.estabelecimento || 'Despesa'} · ${formatMoney(d.valor)}`}
                            description={[formatDate(d.data), d.protocolo, d.estabelecimento !== d.nome ? d.estabelecimento : ''].filter(Boolean).join(' · ')} />
                        ))}
                      </div>
                      <div><Button disabled={!escolhida} loading={saving} onClick={() => casar(candidatas.list)}>Casar com a despesa escolhida</Button></div>
                    </>
                  )}
              </section>
            ) : null}

            {pode?.ignorar ? (
              <section className="cc-secao" aria-label="Ignorar">
                <h3 className="cc-secao__titulo">Ignorar</h3>
                <Field label="Motivo para ignorar" error={erroMotivo} hint="Ex.: compra pessoal já descontada, tarifa do banco.">
                  <Textarea value={motivo} disabled={saving} maxLength={400} rows={2} onChange={(e) => { setMotivo(e.target.value); setErroMotivo(null) }} />
                </Field>
                <div><Button variant="secondary" loading={saving} onClick={ignorar}>Ignorar transação</Button></div>
              </section>
            ) : null}

            {pode?.reabrir ? (
              <section className="cc-secao" aria-label="Reabrir">
                <p className="cc-texto">Ignorada por engano? Reabra para ela voltar a Para revisar.</p>
                <div><Button variant="secondary" loading={saving} onClick={reabrir}>Reabrir transação</Button></div>
              </section>
            ) : null}
          </div>
        ) : null}
      </Drawer>
      <Dialog open={pendingExit != null} onClose={() => setPendingExit(null)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(null)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setPendingExit(null); pendingExit?.() }}>Descartar</Button>
        </>}>
        A despesa escolhida ou o motivo digitado ainda não foram gravados.
      </Dialog>
    </>
  )
}

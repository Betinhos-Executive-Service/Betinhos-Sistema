import { BellRing, Copy, Download, Send, UserPen } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import { Alert, Button, ChoiceGroup, Dialog, Field, Input, Radio, StatusBadge, Switch } from '@betinhos/ui'
import { addMonths, diaSP, formatBR, horaSP, todaySP } from '../data/dates'
import { brl } from '../data/format'
import { MULTA_CAMPO } from '../data/schema'
import type { DataSource } from '../data/source'
import type { Multa, ParcelaTermo, TermoMulta } from '../data/types'
import { errorMessage } from '../data/xrm'
import { calcularParcelas, emCentavos, expiraEm, PRAZO_TERMO_DIAS, TERMO_ROTULO, TERMO_TOM, validarAcordo, type Acordo, type FormaPagamento } from '../domain/termoMulta'
import { useNotify } from './Toasts'

const diaMes = (iso: string) => formatBR(diaSP(iso)).slice(0, 5)
const dataHora = (iso: string) => `${formatBR(diaSP(iso))} às ${horaSP(iso)}`
const competenciaBR = (dia: string) => `${dia.slice(5, 7)}/${dia.slice(0, 4)}`
const mesAtual = () => `${todaySP().slice(0, 7)}-01`

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesAno = (dia: string) => `${MES[Number(dia.slice(5, 7)) - 1]}/${dia.slice(2, 4)}`
const UM_DIA_MS = 24 * 3600 * 1000

/** Resumo do acordo para a confirmação do envio (G3). */
function resumoAcordo(nome: string, acordo: Acordo) {
  if (acordo.forma === 'guia') return `Enviar a ${nome}: paga a guia de ${brl(acordo.valorTotal)}?`
  const parcelas = calcularParcelas(acordo)
  const periodo = parcelas.length > 1 ? `${mesAno(parcelas[0].competencia)}–${mesAno(parcelas[parcelas.length - 1].competencia)}` : mesAno(parcelas[0].competencia)
  return `Enviar a ${nome}: desconto em folha ${acordo.parcelas}x de ${brl(parcelas[0].valor)} (${periodo})?`
}

/** Linha de prazo do termo pendente (G4). */
function prazoPendente(t: TermoMulta) {
  if (!t.enviadoEm) return 'Aguardando assinatura'
  const partes = [`Enviado em ${diaMes(t.enviadoEm)}`, `expira em ${formatBR(expiraEm(t.enviadoEm)).slice(0, 5)}`]
  if (t.ultimoLembreteEm) partes.push(`último lembrete ${diaMes(t.ultimoLembreteEm)}`)
  return partes.join(' · ')
}

/** Baixa o PDF pelo navegador (o shell roda no desktop; o download normal funciona). */
function salvarArquivo(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Abre a ficha do funcionário no shell; ao salvar, a ficha volta para esta multa (`voltar`). */
function abrirFichaFuncionario(id: string) {
  const voltar = location.hash || '#/frota-multas'
  const query = new URLSearchParams({ ficha: id, secao: 'dados', voltar })
  location.hash = `#/funcionarios?${query.toString()}`
}

/** Termo que ainda vale para a multa: o pendente ou o assinado; senão o último (contestado/expirado/cancelado), só para histórico. */
function termoAtual(termos: TermoMulta[]) {
  return termos.find((t) => t.status === 'pendente' || t.status === 'assinado') ?? termos[0] ?? null
}

export function TermoMultaPanel({ source, multa, valorCatalogo, onChanged }: { source: DataSource; multa: Multa; valorCatalogo: number | null; onChanged: () => void }) {
  const notify = useNotify()
  const ids = useId()
  const [termos, setTermos] = useState<TermoMulta[] | null>(null)
  const [temAditivo, setTemAditivo] = useState<boolean | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)
  const [forma, setForma] = useState<FormaPagamento>('guia')
  const [parcelas, setParcelas] = useState<1 | 2 | 3>(1)
  const [competenciaFolha, setCompetenciaFolha] = useState(() => addMonths(mesAtual(), 1))
  const valorInicial = multa.valorGuia ?? valorCatalogo
  const [valorGuia, setValorGuia] = useState(valorInicial === null ? '' : String(valorInicial))
  const [recurso, setRecurso] = useState(multa.recursoPendente)
  const [ocupado, setOcupado] = useState(false)
  const [valorSalvo, setValorSalvo] = useState(multa.valorGuia)
  const [confirmarCancelamento, setConfirmarCancelamento] = useState<string | null>(null)
  const [confirmarEnvio, setConfirmarEnvio] = useState(false)
  const [parcelasTermo, setParcelasTermo] = useState<ParcelaTermo[] | null>(null)

  const motoristaId = multa.motorista?.id ?? null
  const carregar = useCallback(async () => {
    setErroCarga(null)
    // allSettled: falha ao ler o aditivo não esconde os termos (e vice-versa).
    const [lista, aditivo] = await Promise.allSettled([source.listarTermos(multa.id), motoristaId ? source.temAditivo(motoristaId) : Promise.resolve(false)])
    if (lista.status === 'fulfilled') setTermos(lista.value)
    else setErroCarga(errorMessage(lista.reason))
    if (aditivo.status === 'fulfilled') setTemAditivo(aditivo.value)
    else { setTemAditivo(false); notify('error', `Não foi possível conferir o aditivo: ${errorMessage(aditivo.reason)}`) }
  }, [source, multa.id, motoristaId, notify])

  useEffect(() => { void carregar() }, [carregar])
  // "Entrar com recurso" (StatusPanel, no mesmo drawer) grava o campo e recarrega a multa: o switch acompanha.
  useEffect(() => { setRecurso(multa.recursoPendente) }, [multa.recursoPendente])

  const atual = termos ? termoAtual(termos) : null
  const assinadoId = atual?.status === 'assinado' ? atual.id : null
  useEffect(() => {
    if (!assinadoId) return
    let vivo = true
    setParcelasTermo(null)
    source.listarParcelasTermo(assinadoId).then((lista) => { if (vivo) setParcelasTermo(lista) }, (reason) => { if (vivo) { setParcelasTermo([]); notify('error', `Não foi possível carregar as parcelas: ${errorMessage(reason)}`) } })
    return () => { vivo = false }
  }, [source, assinadoId, notify])
  const bloqueado = atual?.status === 'pendente' || atual?.status === 'assinado'
  const formAberto = aberto && !bloqueado
  // Em centavos, com a mesma regra da prévia: o total enviado fecha com a soma das parcelas.
  const valorTotal = emCentavos(Number(valorGuia.replace(',', '.'))) / 100
  const acordo: Acordo = forma === 'guia'
    ? { forma, parcelas: 1, valorTotal, primeiraCompetencia: mesAtual() }
    : { forma, parcelas, valorTotal, primeiraCompetencia: competenciaFolha }
  const impedimento = validarAcordo(acordo, { temAditivo: temAditivo === true, recursoPendente: recurso, temMotorista: multa.motorista !== null, termoPendente: atual?.status === 'pendente' })
  const previa = forma === 'folha' && !impedimento ? calcularParcelas(acordo) : []

  async function salvarMulta(patch: Record<string, unknown>) {
    try {
      await source.update('multa', multa.id, patch)
      return true
    } catch (reason) {
      notify('error', errorMessage(reason))
      return false
    }
  }

  async function alternarRecurso(valor: boolean) {
    setRecurso(valor)
    if (await salvarMulta({ [MULTA_CAMPO.recursoPendente]: valor })) onChanged()
    else setRecurso(!valor)
  }

  async function salvarValor() {
    if (!Number.isFinite(valorTotal) || valorTotal < 0 || valorGuia.trim() === '' || valorTotal === valorSalvo) return
    if (await salvarMulta({ [MULTA_CAMPO.valorGuia]: valorTotal })) {
      setValorSalvo(valorTotal)
      onChanged()
    }
  }

  async function enviar() {
    setConfirmarEnvio(false)
    if (impedimento || ocupado) return
    setOcupado(true)
    try {
      await source.enviarTermoMulta(multa.id, acordo)
      notify('success', 'Termo enviado ao motorista.')
      setAberto(false)
      onChanged()
      await carregar()
    } catch (reason) {
      notify('error', errorMessage(reason))
    } finally {
      setOcupado(false)
    }
  }

  async function cancelar(termoId: string) {
    setConfirmarCancelamento(null)
    setOcupado(true)
    try {
      await source.cancelarTermoMulta(termoId)
      notify('success', 'Envio cancelado.')
      onChanged()
      await carregar()
    } catch (reason) {
      notify('error', errorMessage(reason))
    } finally {
      setOcupado(false)
    }
  }

  async function copiarHash(hash: string) {
    try {
      await navigator.clipboard.writeText(hash)
      notify('success', 'Hash copiado.')
    } catch {
      notify('error', 'Não foi possível copiar o hash.')
    }
  }

  async function baixar(termoId: string) {
    setOcupado(true)
    try {
      const { nome, blob } = await source.baixarPdfTermo(termoId)
      salvarArquivo(blob, nome)
    } catch (reason) {
      notify('error', errorMessage(reason))
    } finally {
      setOcupado(false)
    }
  }

  async function lembrar(termoId: string) {
    setOcupado(true)
    try {
      await source.lembrarTermoMulta(termoId)
      notify('success', 'Lembrete enviado ao motorista.')
      await carregar()
    } catch (reason) {
      notify('error', errorMessage(reason))
    } finally {
      setOcupado(false)
    }
  }

  const nomeMotorista = multa.motorista?.label ?? ''
  const proximoLembrete = atual?.ultimoLembreteEm ? Date.parse(atual.ultimoLembreteEm) + UM_DIA_MS : null
  const lembreteBloqueado = proximoLembrete !== null && proximoLembrete > Date.now()

  return (
    <div className="frota-termo" data-termo-status={atual?.status ?? 'nenhum'}>
      {multa.motorista && (
        <div className="frota-termo__motorista">
          <span>Motorista: {nomeMotorista}</span>
          {temAditivo !== null && <StatusBadge tone={temAditivo ? 'success' : 'warning'}>{temAditivo ? 'Aditivo ✓' : 'Aditivo ✗'}</StatusBadge>}
        </div>
      )}
      {multa.motorista && temAditivo === false && !bloqueado && (
        <Alert
          tone="warning"
          title="Falta o aditivo de assinatura eletrônica"
          action={<Button variant="secondary" size="compact" icon={<UserPen size={16} />} onClick={() => abrirFichaFuncionario(multa.motorista!.id)}>Registrar aditivo de {nomeMotorista}</Button>}
        >
          Sem o aditivo, {nomeMotorista} não consegue assinar o termo no app. Depois de salvar a ficha, você volta para esta multa.
        </Alert>
      )}
      <div className="frota-termo__dados">
        <Field label="Valor da guia (R$)" hint={atual?.status === 'pendente' ? 'Travado enquanto o termo aguarda o motorista. Cancele o envio para mudar.' : multa.valorGuia === null && valorCatalogo !== null ? 'Pré-preenchido com o valor do catálogo de infrações.' : undefined}>
          <Input type="number" inputMode="decimal" min="0" step="0.01" prefix="R$" value={valorGuia} disabled={atual?.status === 'pendente'} onChange={(e) => setValorGuia(e.target.value)} onBlur={() => void salvarValor()} />
        </Field>
        <Switch label="Recurso pendente" description="Enquanto houver recurso, não dá para acordar desconto em folha." checked={recurso} onChange={(e) => void alternarRecurso(e.target.checked)} />
      </div>

      {erroCarga && <Alert tone="danger" title="Não foi possível carregar os termos" action={<Button variant="secondary" size="compact" onClick={() => void carregar()}>Tentar de novo</Button>}>{erroCarga}</Alert>}

      {atual?.status && (
        <div className="frota-termo__atual">
          <div className="frota-termo__linha">
            <StatusBadge tone={TERMO_TOM[atual.status]}>{TERMO_ROTULO[atual.status]}</StatusBadge>
            {atual.forma && <span className="frota-muted">{atual.forma === 'guia' ? 'Paga a guia' : `Desconto em folha · ${atual.parcelas ?? 1}x`} · {brl(atual.valorTotal)}</span>}
          </div>
          {atual.status === 'pendente' && (
            <>
              <span>{prazoPendente(atual)}</span>
              <div className="frota-termo__linha">
                <Button variant="secondary" size="compact" icon={<BellRing size={16} />} disabled={ocupado || lembreteBloqueado} aria-describedby={lembreteBloqueado ? `${ids}-lembrete` : undefined} onClick={() => void lembrar(atual.id)}>Lembrar motorista</Button>
                <Button variant="ghost" size="compact" disabled={ocupado} onClick={() => setConfirmarCancelamento(atual.id)}>Cancelar envio</Button>
              </div>
              {lembreteBloqueado && proximoLembrete !== null && <span id={`${ids}-lembrete`} className="frota-muted">Próximo lembrete a partir de {dataHora(new Date(proximoLembrete).toISOString())}.</span>}
            </>
          )}
          {atual.status === 'assinado' && (
            <>
              {atual.assinadoEm && <span>Assinado em {dataHora(atual.assinadoEm)}</span>}
              <div className="frota-termo__linha">
                {atual.hashPdf && <>
                  <span className="frota-muted">Hash do PDF</span>
                  <code className="frota-termo__hash" title={atual.hashPdf}>{atual.hashPdf.slice(0, 8)}</code>
                  <Button variant="ghost" size="compact" icon={<Copy size={14} />} aria-label="Copiar hash" onClick={() => void copiarHash(atual.hashPdf!)} />
                </>}
                <Button variant="secondary" size="compact" icon={<Download size={16} />} loading={ocupado} onClick={() => void baixar(atual.id)}>Baixar PDF</Button>
              </div>
              {atual.forma === 'folha' && parcelasTermo && parcelasTermo.length > 0 && (
                <ul className="frota-termo__previa" aria-label="Parcelas do termo">
                  {parcelasTermo.map((p) => <li key={p.numero}><span>{p.numero}ª · {competenciaBR(p.competencia)}</span><span className="frota-muted">{p.status ?? '—'}</span><strong>{brl(p.valor)}</strong></li>)}
                </ul>
              )}
            </>
          )}
          {atual.status === 'contestado' && <span>Motivo da contestação: {atual.motivoContestacao || 'não informado'}</span>}
        </div>
      )}

      {termos && !bloqueado && !aberto && (
        <div><Button variant="secondary" onClick={() => setAberto(true)}>Preparar termo</Button></div>
      )}

      <div className="frota-termo__expande" data-aberto={formAberto ? '' : undefined} aria-hidden={!formAberto}>
        <div className="frota-termo__conteudo">
          {formAberto && (
            <div className="frota-termo__form">
              <ChoiceGroup label="Forma de pagamento" inline>
                <Radio name={`${ids}-forma`} label="Paga a guia" checked={forma === 'guia'} onChange={() => setForma('guia')} />
                <Radio name={`${ids}-forma`} label="Desconto em folha" checked={forma === 'folha'} onChange={() => setForma('folha')} />
              </ChoiceGroup>
              {forma === 'folha' && <>
                <ChoiceGroup label="Parcelas" inline>
                  {([1, 2, 3] as const).map((n) => <Radio key={n} name={`${ids}-parcelas`} label={`${n}x`} checked={parcelas === n} onChange={() => setParcelas(n)} />)}
                </ChoiceGroup>
                <Field label="Primeira competência">
                  <Input type="month" value={competenciaFolha.slice(0, 7)} onChange={(e) => e.target.value && setCompetenciaFolha(`${e.target.value}-01`)} />
                </Field>
                {previa.length > 0 && (
                  <ul className="frota-termo__previa" aria-label="Prévia das parcelas">
                    {previa.map((p) => <li key={p.numero}><span>{p.numero}ª · {competenciaBR(p.competencia)}</span><strong>{brl(p.valor)}</strong></li>)}
                  </ul>
                )}
              </>}
              {impedimento && <Alert tone="warning">{impedimento}</Alert>}
              <div className="frota-termo__linha">
                <Button icon={<Send size={16} />} disabled={!!impedimento || ocupado || temAditivo === null} onClick={() => setConfirmarEnvio(true)}>Enviar termo</Button>
                <Button variant="ghost" disabled={ocupado} onClick={() => setAberto(false)}>Fechar</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={confirmarEnvio}
        onClose={() => setConfirmarEnvio(false)}
        title="Enviar o termo ao motorista?"
        actions={<><Button variant="secondary" onClick={() => setConfirmarEnvio(false)}>Voltar</Button><Button icon={<Send size={16} />} onClick={() => void enviar()}>Enviar</Button></>}
      >
        {confirmarEnvio && !impedimento ? `${resumoAcordo(nomeMotorista, acordo)} O motorista recebe um aviso no app e tem ${PRAZO_TERMO_DIAS} dias para assinar ou contestar.` : null}
      </Dialog>

      <Dialog
        open={confirmarCancelamento !== null}
        onClose={() => setConfirmarCancelamento(null)}
        tone="danger"
        title="Cancelar o termo enviado ao motorista?"
        actions={<><Button variant="secondary" onClick={() => setConfirmarCancelamento(null)}>Voltar</Button><Button variant="danger" onClick={() => confirmarCancelamento && void cancelar(confirmarCancelamento)}>Cancelar termo</Button></>}
      >
        O motorista deixa de ver o termo para assinar. Para cobrar a multa, prepare um novo termo.
      </Dialog>
    </div>
  )
}

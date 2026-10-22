import { Copy, Download, Send } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import { Alert, Button, ChoiceGroup, Field, Input, Radio, StatusBadge, Switch } from '@betinhos/ui'
import { addMonths, todaySP } from '../data/dates'
import { brl } from '../data/format'
import { MULTA_CAMPO } from '../data/schema'
import type { DataSource } from '../data/source'
import type { Multa, TermoMulta, TermoStatus } from '../data/types'
import { errorMessage } from '../data/xrm'
import { calcularParcelas, validarAcordo, type Acordo, type FormaPagamento } from '../domain/termoMulta'
import { useNotify } from './Toasts'

const SP = 'America/Sao_Paulo'
const diaMes = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: SP, day: '2-digit', month: '2-digit' }).format(new Date(iso))
const dataHora = (iso: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: SP, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}`
}
const competenciaBR = (dia: string) => `${dia.slice(5, 7)}/${dia.slice(0, 4)}`
const mesAtual = () => `${todaySP().slice(0, 7)}-01`

const STATUS_LABEL: Record<TermoStatus, [string, 'warning' | 'success' | 'danger' | 'neutral']> = {
  pendente: ['Pendente', 'warning'], assinado: ['Assinado', 'success'], contestado: ['Contestado', 'danger'], expirado: ['Expirado', 'neutral'], cancelado: ['Cancelado', 'neutral'],
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

  const carregar = useCallback(async () => {
    setErroCarga(null)
    try {
      const [lista, aditivo] = await Promise.all([source.listarTermos(multa.id), multa.motorista ? source.temAditivo(multa.motorista.id) : Promise.resolve(false)])
      setTermos(lista)
      setTemAditivo(aditivo)
    } catch (reason) {
      setErroCarga(errorMessage(reason))
    }
  }, [source, multa.id, multa.motorista])

  useEffect(() => { void carregar() }, [carregar])

  const atual = termos ? termoAtual(termos) : null
  const bloqueado = atual?.status === 'pendente' || atual?.status === 'assinado'
  const valorTotal = Number(valorGuia.replace(',', '.'))
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
    if (!(await salvarMulta({ [MULTA_CAMPO.recursoPendente]: valor }))) setRecurso(!valor)
  }

  async function salvarValor() {
    if (!Number.isFinite(valorTotal) || valorGuia.trim() === '' || valorTotal === multa.valorGuia) return
    await salvarMulta({ [MULTA_CAMPO.valorGuia]: valorTotal })
  }

  async function enviar() {
    if (impedimento || ocupado) return
    setOcupado(true)
    try {
      await source.enviarTermoMulta(multa.id, acordo)
      notify('success', 'Termo enviado ao motorista.')
      setAberto(false)
      await carregar()
      onChanged()
    } catch (reason) {
      notify('error', errorMessage(reason))
    } finally {
      setOcupado(false)
    }
  }

  async function cancelar(termoId: string) {
    setOcupado(true)
    try {
      await source.cancelarTermoMulta(termoId)
      notify('success', 'Envio cancelado.')
      await carregar()
      onChanged()
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
    try { await source.baixarPdfTermo(termoId) } catch (reason) { notify('error', errorMessage(reason)) }
  }

  return (
    <div className="frota-termo" data-termo-status={atual?.status ?? 'nenhum'}>
      <div className="frota-termo__dados">
        <Field label="Valor da guia (R$)" hint={multa.valorGuia === null && valorCatalogo !== null ? 'Pré-preenchido com o valor do catálogo de infrações.' : undefined}>
          <Input type="number" inputMode="decimal" min="0" step="0.01" prefix="R$" value={valorGuia} onChange={(e) => setValorGuia(e.target.value)} onBlur={() => void salvarValor()} />
        </Field>
        <Switch label="Recurso pendente" description="Enquanto houver recurso, não dá para acordar desconto em folha." checked={recurso} onChange={(e) => void alternarRecurso(e.target.checked)} />
      </div>

      {erroCarga && <Alert tone="danger" title="Não foi possível carregar os termos" action={<Button variant="secondary" size="compact" onClick={() => void carregar()}>Tentar de novo</Button>}>{erroCarga}</Alert>}

      {atual?.status && (
        <div className="frota-termo__atual">
          <div className="frota-termo__linha">
            <StatusBadge tone={STATUS_LABEL[atual.status][1]}>{STATUS_LABEL[atual.status][0]}</StatusBadge>
            {atual.forma && <span className="frota-muted">{atual.forma === 'guia' ? 'Paga a guia' : `Desconto em folha · ${atual.parcelas ?? 1}x`} · {brl(atual.valorTotal)}</span>}
          </div>
          {atual.status === 'pendente' && (
            <div className="frota-termo__linha">
              <span>{atual.enviadoEm ? `Aguardando assinatura desde ${diaMes(atual.enviadoEm)}` : 'Aguardando assinatura'}</span>
              <Button variant="secondary" size="compact" disabled={ocupado} onClick={() => void cancelar(atual.id)}>Cancelar envio</Button>
            </div>
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
                <Button variant="secondary" size="compact" icon={<Download size={16} />} onClick={() => void baixar(atual.id)}>Baixar PDF</Button>
              </div>
            </>
          )}
          {atual.status === 'contestado' && <span>Motivo da contestação: {atual.motivoContestacao || 'não informado'}</span>}
        </div>
      )}

      {termos && !bloqueado && !aberto && (
        <div><Button variant="secondary" onClick={() => setAberto(true)}>Preparar termo</Button></div>
      )}

      <div className="frota-termo__expande" data-aberto={aberto && !bloqueado ? '' : undefined} aria-hidden={!(aberto && !bloqueado)}>
        <div className="frota-termo__conteudo">
          {aberto && !bloqueado && (
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
                <Button icon={<Send size={16} />} disabled={!!impedimento || ocupado || temAditivo === null} onClick={() => void enviar()}>Enviar termo</Button>
                <Button variant="ghost" disabled={ocupado} onClick={() => setAberto(false)}>Fechar</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

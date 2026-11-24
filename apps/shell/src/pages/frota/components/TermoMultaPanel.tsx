import { BellRing, Send } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Alert, Button, Dialog, Field, Input, StatusBadge } from '@betinhos/ui'
import { addMonths, diaSP, formatBR, horaSP } from '../data/dates'
import { brl } from '../data/format'
import { MULTA_CAMPO } from '../data/schema'
import type { DataSource } from '../data/source'
import type { Multa, TermoMulta } from '../data/types'
import { errorMessage } from '../data/xrm'
import { janelaCompetencia, mesBr } from '../domain/multaEtapas'
import { calcularParcelas, emCentavos, expiraEm, MAXIMO_PARCELAS_TERMO, PRAZO_TERMO_DIAS, validarAcordo, type Acordo } from '../domain/termoMulta'
import { useNotify } from './Toasts'

const diaMes = (iso: string) => formatBR(diaSP(iso)).slice(0, 5)
const dataHora = (iso: string) => `${formatBR(diaSP(iso))} às ${horaSP(iso)}`
const UM_DIA_MS = 24 * 3600 * 1000

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesAno = (dia: string) => `${MES[Number(dia.slice(5, 7)) - 1]}/${dia.slice(2, 4)}`

/** Resumo do acordo para a confirmação do envio. */
function resumoAcordo(nome: string, acordo: Acordo) {
  const parcelas = calcularParcelas(acordo)
  const periodo = parcelas.length > 1 ? `${mesAno(parcelas[0].competencia)}–${mesAno(parcelas[parcelas.length - 1].competencia)}` : mesAno(parcelas[0].competencia)
  return `Enviar a ${nome}: desconto em folha ${acordo.parcelas}x de ${brl(parcelas[0].valor)} (${periodo})?`
}

/** Linha de prazo do termo pendente. */
function prazoPendente(t: TermoMulta, dataParaIndicar: string | null) {
  if (!t.enviadoEm) return 'Aguardando assinatura'
  const partes = [`Enviado em ${diaMes(t.enviadoEm)}`, `expira em ${formatBR(expiraEm(t.enviadoEm, dataParaIndicar)).slice(0, 5)}`]
  if (t.ultimoLembreteEm) partes.push(`último lembrete ${diaMes(t.ultimoLembreteEm)}`)
  return partes.join(' · ')
}

/** true até o instante `ate`; reavalia pelo relógio (timer) e ao voltar o foco para a janela. */
function useLiberadoEm(ate: number | null) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    // Já liberado: nenhum timer (senão o efeito se reagendaria para sempre).
    if (ate === null || ate <= Date.now()) return
    const atualizar = () => setAgora(Date.now())
    const timer = window.setTimeout(atualizar, ate - Date.now())
    window.addEventListener('focus', atualizar)
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', atualizar) }
  }, [ate])
  return ate !== null && ate > agora
}

type Props = {
  source: DataSource
  multa: Multa
  /** Termo Pendente da multa, se houver. */
  termoPendente: TermoMulta | null
  valorCatalogo: number | null
  hoje: string
  /** Chamado depois de enviar, lembrar ou cancelar: o pai relê a multa e os termos. */
  onChanged: () => void
  /** O gestor escolheu indicar sem o termo (estado do pai, que também decide o botão "Registrar indicação"). */
  semTermo: boolean
  onSemTermo: (valor: boolean) => void
  /** Campos da indicação (canal e data), mostrados quando o gestor escolhe indicar sem o termo. */
  indicacao: ReactNode
}

/** Conteúdo do passo "Indicar no órgão" quando o motorista tem o aditivo: termo pelo app ou, se preferir, indicar sem o termo. */
export function AvisoPorTermo({ source, multa, termoPendente, valorCatalogo, hoje, onChanged, semTermo, onSemTermo, indicacao }: Props) {
  const notify = useNotify()
  const ids = useId()
  const [parcelas, setParcelas] = useState(1)
  const [competencia, setCompetencia] = useState(() => addMonths(`${hoje.slice(0, 7)}-01`, 1))
  const valorInicial = multa.valorGuia ?? valorCatalogo
  const [valorGuia, setValorGuia] = useState(valorInicial === null ? '' : String(valorInicial))
  const [valorSalvo, setValorSalvo] = useState(multa.valorGuia)
  const [ocupado, setOcupado] = useState(false)
  const [confirmarEnvio, setConfirmarEnvio] = useState(false)
  const [confirmarCancelamento, setConfirmarCancelamento] = useState<'cancelar' | 'sem-termo' | null>(null)

  const nomeMotorista = multa.motorista?.label ?? ''
  // Em centavos, com a mesma regra da prévia: o total enviado fecha com a soma das parcelas.
  const valorTotal = emCentavos(Number(valorGuia.replace(',', '.'))) / 100
  const acordo: Acordo = { forma: 'folha', parcelas, valorTotal, primeiraCompetencia: competencia }
  const impedimento = validarAcordo(acordo, {
    temAditivo: true, recursoPendente: multa.recursoPendente, temMotorista: multa.motorista !== null, termoPendente: termoPendente !== null,
    hoje, dataParaIndicar: multa.dataParaIndicar, avisado: multa.dataAviso !== null,
  })
  const previa = impedimento ? [] : calcularParcelas(acordo)
  const janela = janelaCompetencia(hoje)
  const proximoLembrete = termoPendente?.ultimoLembreteEm ? Date.parse(termoPendente.ultimoLembreteEm) + UM_DIA_MS : null
  const lembreteBloqueado = useLiberadoEm(proximoLembrete)

  async function executar(acao: () => Promise<void>) {
    setOcupado(true)
    try {
      await acao()
    } catch (reason) {
      notify('error', errorMessage(reason))
    } finally {
      setOcupado(false)
    }
  }

  async function salvarValor() {
    if (!Number.isFinite(valorTotal) || valorTotal < 0 || valorGuia.trim() === '' || valorTotal === valorSalvo) return
    try {
      await source.update('multa', multa.id, { [MULTA_CAMPO.valorGuia]: valorTotal })
      setValorSalvo(valorTotal)
      onChanged()
    } catch (reason) {
      notify('error', errorMessage(reason))
    }
  }

  const enviar = () => executar(async () => {
    if (impedimento) return
    await salvarValor() // o servidor divide o valor gravado na multa, então o digitado precisa estar salvo antes
    await source.enviarTermoMulta(multa.id, acordo)
    setConfirmarEnvio(false)
    notify('success', 'Termo enviado ao motorista.')
    onChanged()
  })

  const lembrar = (termoId: string) => executar(async () => {
    await source.lembrarTermoMulta(termoId)
    notify('success', 'Lembrete enviado ao motorista.')
    onChanged()
  })

  const cancelar = (termoId: string, depois: 'cancelar' | 'sem-termo') => executar(async () => {
    setConfirmarCancelamento(null)
    await source.cancelarTermoMulta(termoId)
    notify('success', 'Termo cancelado.')
    if (depois === 'sem-termo') onSemTermo(true)
    onChanged()
  })

  return (
    <div className="frota-termo" data-termo-status={termoPendente?.status ?? 'nenhum'}>
      {termoPendente ? (
        <div className="frota-termo__atual">
          <div className="frota-termo__linha">
            <StatusBadge tone="warning">Pendente</StatusBadge>
            <strong>Aguardando o motorista assinar o termo</strong>
          </div>
          {termoPendente.forma && <span className="frota-muted">Desconto em folha · {termoPendente.parcelas ?? 1}x · {brl(termoPendente.valorTotal)}</span>}
          <span>{prazoPendente(termoPendente, multa.dataParaIndicar)}</span>
          <div className="frota-termo__linha">
            <Button variant="secondary" size="compact" icon={<BellRing size={16} />} disabled={ocupado || lembreteBloqueado} aria-describedby={lembreteBloqueado ? `${ids}-lembrete` : undefined} onClick={() => void lembrar(termoPendente.id)}>Lembrar</Button>
            <Button variant="ghost" size="compact" disabled={ocupado} onClick={() => setConfirmarCancelamento('cancelar')}>Cancelar termo</Button>
            <Button variant="secondary" size="compact" disabled={ocupado} onClick={() => setConfirmarCancelamento('sem-termo')}>Indicar sem o termo</Button>
          </div>
          {lembreteBloqueado && proximoLembrete !== null && <span id={`${ids}-lembrete`} className="frota-muted">Próximo lembrete a partir de {dataHora(new Date(proximoLembrete).toISOString())}.</span>}
        </div>
      ) : semTermo ? (
        <>
          {indicacao}
          <div><Button variant="ghost" size="compact" onClick={() => onSemTermo(false)}>Voltar ao termo pelo app</Button></div>
        </>
      ) : (
        <div className="frota-termo__form">
          <p className="frota-muted">O motorista recebe o termo no app e assina ou contesta em até {PRAZO_TERMO_DIAS} dias. Se preferir, indique sem o termo.</p>
          <div className="frota-fields">
            <Field label="Valor cheio da multa (R$)" hint="Valor da guia sem o desconto de 40% (pré-preenchido pelo catálogo). As parcelas dividem este valor.">
              <Input type="number" inputMode="decimal" min="0" step="0.01" prefix="R$" value={valorGuia} onChange={(e) => setValorGuia(e.target.value)} onBlur={() => void salvarValor()} />
            </Field>
            <Field label="Parcelas">
              <Input type="number" min={1} max={MAXIMO_PARCELAS_TERMO} step={1} value={String(parcelas)} onChange={(e) => setParcelas(Math.trunc(Number(e.target.value)) || 1)} />
            </Field>
            <Field label="Primeiro mês">
              <Input type="month" min={janela.de.slice(0, 7)} max={janela.ate.slice(0, 7)} value={competencia.slice(0, 7)} onChange={(e) => e.target.value && setCompetencia(`${e.target.value}-01`)} />
            </Field>
          </div>
          {previa.length > 0 && (
            <ul className="frota-termo__previa" aria-label="Prévia das parcelas">
              {previa.map((p) => <li key={p.numero}><span>{p.numero}ª · {mesBr(p.competencia)}</span><strong>{brl(p.valor)}</strong></li>)}
            </ul>
          )}
          {impedimento && <Alert tone="warning">{impedimento}</Alert>}
          <div className="frota-termo__linha">
            <Button icon={<Send size={16} />} disabled={!!impedimento || ocupado} onClick={() => setConfirmarEnvio(true)}>Enviar termo pelo app</Button>
            <Button variant="secondary" disabled={ocupado} onClick={() => onSemTermo(true)}>Indicar sem o termo</Button>
          </div>
        </div>
      )}

      <Dialog
        open={confirmarEnvio}
        onClose={() => { if (!ocupado) setConfirmarEnvio(false) }}
        title="Enviar o termo ao motorista?"
        actions={<><Button variant="secondary" disabled={ocupado} onClick={() => setConfirmarEnvio(false)}>Voltar</Button><Button icon={<Send size={16} />} loading={ocupado} disabled={ocupado} onClick={() => void enviar()}>Enviar</Button></>}
      >
        {confirmarEnvio && !impedimento ? `${resumoAcordo(nomeMotorista, acordo)} O motorista recebe um aviso no app e tem até ${PRAZO_TERMO_DIAS} dias para assinar ou contestar.` : null}
      </Dialog>

      <Dialog
        open={confirmarCancelamento !== null}
        onClose={() => { if (!ocupado) setConfirmarCancelamento(null) }}
        tone="danger"
        title="Cancelar o termo?"
        actions={<><Button variant="secondary" disabled={ocupado} onClick={() => setConfirmarCancelamento(null)}>Voltar</Button><Button variant="danger" loading={ocupado} disabled={ocupado} onClick={() => termoPendente && confirmarCancelamento && void cancelar(termoPendente.id, confirmarCancelamento)}>Cancelar termo</Button></>}
      >
        Cancelar o termo? O motorista deixa de ver o pedido de assinatura.
      </Dialog>
    </div>
  )
}

import { useEffect, useId, useState, type ReactNode } from 'react'
import { Alert, Button, Field, Textarea } from '@betinhos/ui'
import { Check, MessageSquareQuote, Sparkles, Undo2, XCircle } from 'lucide-react'
import { formatMoney } from '../../pagantes/domain/messages'
import { motivoValido, type Decisao } from '../domain/decisao'
import { diferencaValor } from '../domain/ia'
import { MOTIVO } from '../domain/status'
import type { Despesa } from '../domain/types'

/** Motivo em andamento: só Devolver e Cancelar têm. */
type Rascunho = { modo: Exclude<Decisao, 'validar'>; motivo: string }

/** O que o drawer precisa saber para decidir se fecha: livre, com motivo digitado e não enviado, ou gravando. */
export type EstadoDecisao = 'livre' | 'sujo' | 'enviando'

type Props = {
  d: Despesa
  /** Grava a decisão; true = gravou. Em erro o motivo digitado fica. */
  onDecidir: (d: Despesa, tipo: Decisao, motivo: string) => Promise<boolean>
  onEstado: (estado: EstadoDecisao) => void
}

/** Duração da saída do campo de motivo (design: 120 ms); o CSS `.dp-motivo--saindo` usa o mesmo valor. */
const SAIDA_MS = 120

/** Textos e motivos prontos de cada saída: um clique preenche o campo, que continua editável. */
const TEXTOS = {
  devolver: {
    campo: 'O que o motorista precisa fazer?',
    placeholder: 'Ex.: envie uma foto legível do cupom.',
    confirmar: 'Enviar ao motorista',
    prontos: ['Envie uma foto legível do cupom.', 'Explique a diferença de valor.', 'Envie o cupom fiscal, não o comprovante do cartão.'],
  },
  cancelar: {
    campo: 'Por que cancelar?',
    placeholder: 'Ex.: lançamento duplicado.',
    confirmar: 'Confirmar cancelamento',
    prontos: ['Lançamento duplicado.', 'Despesa pessoal, fora da operação.', 'Lançada por engano.'],
  },
} as const

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || 'O motorista'

/**
 * Bloco de decisão no topo da ficha: o que aconteceu (IA, motorista, valores) em até três linhas e as três saídas
 * do gestor. Guarda o motivo digitado; o drawer o remonta (`key`) a cada despesa, então o rascunho nunca passa de
 * uma para outra.
 */
export function DecisaoBloco({ d, onDecidir, onEstado }: Props) {
  const titleId = useId()
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [enviando, setEnviando] = useState<Decisao | null>(null)
  const [saindo, setSaindo] = useState(false)
  const ocupado = enviando != null
  const estado: EstadoDecisao = enviando ? 'enviando' : rascunho && rascunho.motivo.trim() ? 'sujo' : 'livre'
  useEffect(() => { onEstado(estado) }, [estado, onEstado])

  useEffect(() => {
    if (!saindo) return
    const timer = setTimeout(() => { setRascunho(null); setSaindo(false) }, SAIDA_MS)
    return () => clearTimeout(timer)
  }, [saindo])

  // Troca de motivo ao mudar de ação: o texto de uma devolução nunca vira motivo de cancelamento.
  const abrir = (modo: Rascunho['modo']) => { setSaindo(false); setRascunho((r) => (r?.modo === modo ? r : { modo, motivo: '' })) }

  async function decidir(tipo: Decisao) {
    if (ocupado) return
    setEnviando(tipo)
    try {
      if (await onDecidir(d, tipo, rascunho?.motivo ?? '')) setRascunho(null)
    } finally {
      setEnviando(null)
    }
  }

  return (
    <section className="dp-decisao" aria-labelledby={titleId}>
      <h3 id={titleId} className="dp-decisao__titulo">Esperando sua decisão</h3>
      <Historia d={d} />

      <div className="dp-decisao__acoes">
        <Button variant="primary" icon={<Check size={16} />} loading={enviando === 'validar'} disabled={ocupado && enviando !== 'validar'} onClick={() => void decidir('validar')}>Validar</Button>
        <Button variant="secondary" icon={<Undo2 size={16} />} aria-expanded={rascunho?.modo === 'devolver'} disabled={ocupado} onClick={() => abrir('devolver')}>Devolver ao motorista</Button>
        <Button variant="ghost" className="dp-decisao__cancelar" icon={<XCircle size={16} />} aria-expanded={rascunho?.modo === 'cancelar'} disabled={ocupado} onClick={() => abrir('cancelar')}>Cancelar despesa</Button>
      </div>

      {rascunho ? <Motivo key={rascunho.modo} rascunho={rascunho} onChange={(motivo) => setRascunho({ ...rascunho, motivo })} onVoltar={() => setSaindo(true)} enviando={enviando} onConfirmar={() => void decidir(rascunho.modo)} saindo={saindo} /> : null}
    </section>
  )
}

function Linha({ icon, quem, children }: { icon: ReactNode; quem: string; children: ReactNode }) {
  return (
    <li className="dp-historia__linha">
      <span className="dp-historia__icone" aria-hidden="true">{icon}</span>
      <span><strong>{quem}</strong> {children}</span>
    </li>
  )
}

/** O caso em frases: por que voltou, o que o motorista disse e a diferença de valor, quando houver. */
function Historia({ d }: { d: Despesa }) {
  const motivoIA = d.motivoDevolucao || d.ia.motivos.join(' ')
  const nome = primeiroNome(d.motorista)
  const diff = diferencaValor(d.valor, d.ia.valorLido)
  const resposta = d.justificativaMotorista
    ? <q className="dp-historia__citacao">{d.justificativaMotorista}</q>
    : d.aguardandoGestor ? 'não respondeu em 3 dias.' : 'ainda não respondeu.'
  return (
    <ul className="dp-historia">
      {motivoIA ? <Linha icon={<Sparkles size={14} />} quem="IA:">{motivoIA}</Linha> : null}
      {motivoIA ? <Linha icon={<MessageSquareQuote size={14} />} quem={`${nome}:`}>{resposta}</Linha> : null}
      {diff ? (
        <li className="dp-historia__valores">
          <span>Lançado <strong className="pg-num">{formatMoney(d.valor)}</strong></span>
          <span>No comprovante <strong className="pg-num">{formatMoney(d.ia.valorLido)}</strong></span>
          <span className="dp-ia__diff">{`${formatMoney(Math.abs(diff))} ${diff > 0 ? 'acima' : 'abaixo'}`}</span>
        </li>
      ) : null}
    </ul>
  )
}

type MotivoProps = { rascunho: Rascunho; onChange: (motivo: string) => void; onVoltar: () => void; enviando: Decisao | null; onConfirmar: () => void; saindo: boolean }

function Motivo({ rascunho, onChange, onVoltar, enviando, onConfirmar, saindo }: MotivoProps) {
  const { modo, motivo } = rascunho
  const textos = TEXTOS[modo]
  const ocupado = enviando != null
  const faltam = MOTIVO.min - motivo.trim().length
  // Sem `form`: Enter no campo é quebra de linha, e o envio é só pelo botão.
  return (
    <div className={`dp-motivo${saindo ? ' dp-motivo--saindo' : ''}`} inert={saindo || undefined}>
      {modo === 'cancelar' ? <Alert tone="warning" title="Cancelar encerra a despesa">Se for do cartão, a compra vai para Divergência na conciliação.</Alert> : null}
      <Field label={textos.campo} required hint={motivo && faltam > 0 ? `Escreva mais ${faltam} ${faltam === 1 ? 'caractere' : 'caracteres'}.` : undefined}>
        <Textarea rows={2} autoFocus value={motivo} maxLength={MOTIVO.max} placeholder={textos.placeholder} disabled={ocupado} onChange={(e) => onChange(e.target.value)} />
      </Field>
      <div className="dp-motivo__prontos" role="group" aria-label="Motivos prontos">
        {textos.prontos.map((t) => <button key={t} type="button" className="dp-pronto" aria-pressed={motivo === t} disabled={ocupado} onClick={() => onChange(t)}>{t}</button>)}
      </div>
      <div className="dp-motivo__acoes">
        <Button variant="ghost" disabled={ocupado} onClick={onVoltar}>Voltar</Button>
        <Button variant={modo === 'cancelar' ? 'danger' : 'primary'} loading={enviando === modo} disabled={!motivoValido(motivo) || (ocupado && enviando !== modo)} onClick={onConfirmar}>{textos.confirmar}</Button>
      </div>
    </div>
  )
}

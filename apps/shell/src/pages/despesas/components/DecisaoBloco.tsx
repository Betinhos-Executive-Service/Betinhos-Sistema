import { useEffect, useId, useState } from 'react'
import { Alert, Button, Field, Textarea } from '@betinhos/ui'
import { Check, Undo2, XCircle } from 'lucide-react'
import { motivoValido, type Decisao } from '../domain/decisao'
import { MOTIVO } from '../domain/status'
import type { Despesa } from '../domain/types'
import { DecisaoIABadge } from './AnaliseIA'
import { Item } from './Ficha'

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

const TEXTOS = {
  devolver: { campo: 'Motivo da devolução', placeholder: 'O que o motorista precisa fazer?', confirmar: 'Devolver ao motorista' },
  cancelar: { campo: 'Motivo do cancelamento', placeholder: 'Por que esta despesa é indevida? Ex.: lançamento duplicado.', confirmar: 'Cancelar despesa' },
} as const

/**
 * Bloco "Decisão" da ficha: o que a IA e o motorista disseram e as três saídas do gestor. Guarda o motivo digitado;
 * o drawer o remonta (`key`) a cada despesa, então o rascunho nunca passa de uma para outra.
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

  const ia = d.ia

  return (
    <section className="pg-ficha__block dp-decisao" aria-labelledby={titleId}>
      <header className="pg-ficha__block-head">
        <h3 id={titleId}>Decisão</h3>
      </header>

      <dl className="pg-ficha__grid dp-ficha__full">
        {d.motivoDevolucao ? <Item label="Motivo da devolução"><span className="dp-texto">{d.motivoDevolucao}</span></Item> : null}
        {d.justificativaMotorista ? <Item label="Justificativa do motorista"><blockquote className="dp-citacao">{d.justificativaMotorista}</blockquote></Item> : null}
        {ia.decisao != null ? (
          <Item label="Resumo da IA">
            <span className="dp-decisao__ia">
              <DecisaoIABadge decisao={ia.decisao} />
              {ia.motivos.length ? <ul className="dp-ia__motivos" aria-label="Motivos da IA">{ia.motivos.map((m, i) => <li key={i}>{m}</li>)}</ul> : null}
            </span>
          </Item>
        ) : null}
      </dl>

      <div className="dp-decisao__acoes">
        <Button variant="primary" icon={<Check size={16} />} loading={enviando === 'validar'} disabled={ocupado && enviando !== 'validar'} onClick={() => void decidir('validar')}>Validar</Button>
        <Button variant="secondary" icon={<Undo2 size={16} />} aria-expanded={rascunho?.modo === 'devolver'} disabled={ocupado} onClick={() => abrir('devolver')}>Devolver</Button>
        <Button variant="secondary" className="dp-decisao__cancelar" icon={<XCircle size={16} />} aria-expanded={rascunho?.modo === 'cancelar'} disabled={ocupado} onClick={() => abrir('cancelar')}>Cancelar</Button>
      </div>

      {rascunho ? <Motivo key={rascunho.modo} rascunho={rascunho} onChange={(motivo) => setRascunho({ ...rascunho, motivo })} onVoltar={() => setSaindo(true)} enviando={enviando} onConfirmar={() => void decidir(rascunho.modo)} saindo={saindo} /> : null}
    </section>
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
      {modo === 'cancelar' ? <Alert tone="warning" title="Cancelar encerra a despesa">Se ela for do cartão, a compra vai para Divergência na conciliação.</Alert> : null}
      <Field label={textos.campo} required hint={faltam > 0 ? `Mínimo de ${MOTIVO.min} caracteres (faltam ${faltam}).` : undefined}>
        <Textarea rows={3} autoFocus value={motivo} maxLength={MOTIVO.max} placeholder={textos.placeholder} disabled={ocupado} onChange={(e) => onChange(e.target.value)} />
      </Field>
      <div className="dp-motivo__acoes">
        <Button variant="ghost" disabled={ocupado} onClick={onVoltar}>Voltar</Button>
        <Button variant={modo === 'cancelar' ? 'danger' : 'primary'} loading={enviando === modo} disabled={!motivoValido(motivo) || (ocupado && enviando !== modo)} onClick={onConfirmar}>{textos.confirmar}</Button>
      </div>
    </div>
  )
}

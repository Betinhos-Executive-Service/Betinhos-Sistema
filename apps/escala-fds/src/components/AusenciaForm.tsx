import { useState } from 'react'
import { Button, Checkbox, Field, Input, SegmentedControl } from '@betinhos/ui'
import { MOTIVO_LABEL, addDays, ausenciasDosDias, dateRange, diaCurto, diasDaSemana, formatDay, type Compromisso, type Motivo } from '../domain/escala'

type Props = {
  hoje: string
  segunda: string
  motoristaId: string
  onCancel: () => void
  onAdd: (lista: Compromisso[]) => void
}

const MOTIVOS = (Object.keys(MOTIVO_LABEL) as Motivo[]).map((value) => ({ value, label: MOTIVO_LABEL[value] }))

/** Ausência em poucos toques: dias da semana, dia todo ou horário, motivo. "Outro período" (sempre dia todo) cobre férias longas. */
export function AusenciaForm({ hoje, segunda, motoristaId, onCancel, onAdd }: Props) {
  const semana = diasDaSemana(segunda)
  const inicial = semana.includes(hoje) ? hoje : segunda
  const [dias, setDias] = useState<string[]>(() => (semana.includes(hoje) ? [hoje] : []))
  const [outro, setOutro] = useState(false)
  const [de, setDe] = useState(inicial)
  const [ate, setAte] = useState(inicial)
  const [diaInteiro, setDiaInteiro] = useState(true)
  const [horaInicio, setHoraInicio] = useState('00:00')
  const [horaFim, setHoraFim] = useState('12:00')
  const [motivo, setMotivo] = useState<Motivo>('medico')
  const [observacao, setObservacao] = useState('')

  const escolhidos = outro ? dateRange(de, ate) : dias
  const erro = outro && (!de || !ate) ? 'Informe as datas.'
    : !outro && !diaInteiro && (!horaInicio || !horaFim) ? 'Informe o horário.'
      : outro && ate < de ? 'A data final deve ser igual ou posterior à inicial.'
        : outro && ate > addDays(de, 61) ? 'Registre no máximo 62 dias por vez.'
          : !outro && !diaInteiro && horaFim <= horaInicio ? 'O horário final deve ser depois do inicial.' : null

  const alternarDia = (d: string) => setDias((atual) => (atual.includes(d) ? atual.filter((x) => x !== d) : [...atual, d]))
  const registrar = () => {
    if (!escolhidos.length || erro) return
    onAdd(ausenciasDosDias({ motoristaId, dias: escolhidos, diaInteiro: outro || diaInteiro, horaInicio, horaFim, motivo, observacao }))
  }

  return (
    <section className="escala__form" aria-label="Nova ausência">
      {outro ? (
        <div className="escala__form-row">
          <Field label="De" required><Input type="date" value={de} onChange={(e) => { setDe(e.target.value); if (ate < e.target.value) setAte(e.target.value) }} /></Field>
          <Field label="Até" required><Input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></Field>
        </div>
      ) : (
        <div className="escala__day-chips" role="group" aria-label="Dias da ausência">
          {semana.map((d) => (
            <button key={d} type="button" className="escala__toggle" aria-pressed={dias.includes(d)} onClick={() => alternarDia(d)}>
              {diaCurto(d)}<small>{formatDay(d)}</small>
            </button>
          ))}
        </div>
      )}
      <div>
        <Button variant="ghost" size="compact" onClick={() => setOutro(!outro)}>{outro ? 'Escolher dias desta semana' : 'Outro período'}</Button>
      </div>
      {outro ? null : <Checkbox label="Dia todo" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} />}
      {outro || diaInteiro ? null : (
        <div className="escala__form-row">
          <Field label="Indisponível a partir de"><Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></Field>
          <Field label="Até" error={erro}><Input type="time" value={horaFim} invalid={Boolean(erro)} onChange={(e) => setHoraFim(e.target.value)} /></Field>
        </div>
      )}
      {outro && erro ? <p className="escala__form-error" role="alert">{erro}</p> : null}
      <SegmentedControl<Motivo> aria-label="Motivo" fullWidth size="compact" value={motivo} onChange={setMotivo} options={MOTIVOS} />
      <Field label="Observação"><Input value={observacao} maxLength={2000} placeholder="Ex.: consulta com retorno às 12h" onChange={(e) => setObservacao(e.target.value)} /></Field>
      <div className="escala__form-actions">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" disabled={!escolhidos.length || Boolean(erro)} onClick={registrar}>Registrar ausência</Button>
      </div>
    </section>
  )
}

import { useState } from 'react'
import { Button, Checkbox, Field, Input, Select } from '@betinhos/ui'
import { MOTIVO_LABEL, dateRange, type Compromisso, type Motivo, type Motorista } from '../domain/escala'

export type FormInicial = { motoristaId?: string; data?: string }

type Props = {
  hoje: string
  motoristas: Motorista[]
  inicial: FormInicial
  onCancel: () => void
  onAdd: (c: Compromisso) => void
}

const MOTIVOS = (Object.keys(MOTIVO_LABEL) as Motivo[]).map((value) => ({ value, label: MOTIVO_LABEL[value] }))

/** Compromisso de um dia (com ou sem horário) ou de vários dias seguidos (férias, afastamento). */
export function CompromissoForm({ hoje, motoristas, inicial, onCancel, onAdd }: Props) {
  const [motoristaId, setMotoristaId] = useState<string | null>(inicial.motoristaId ?? null)
  const [de, setDe] = useState(inicial.data ?? hoje)
  const [ate, setAte] = useState(inicial.data ?? hoje)
  const [diaInteiro, setDiaInteiro] = useState(false)
  const [horaInicio, setHoraInicio] = useState('00:00')
  const [horaFim, setHoraFim] = useState('12:00')
  const [motivo, setMotivo] = useState<Motivo>('medico')
  const [observacao, setObservacao] = useState('')

  const inicio = `${de}T${diaInteiro ? '00:00' : horaInicio}`
  const fim = `${ate}T${diaInteiro ? '23:59' : horaFim}`
  const erro = ate < de ? 'A data final deve ser igual ou posterior à inicial.'
    : dateRange(de, ate).length >= 62 ? 'Registre no máximo 62 dias por vez.'
      : fim <= inicio ? 'O horário final deve ser depois do inicial.' : null

  const adicionar = () => {
    if (!motoristaId || erro) return
    onAdd({ id: null, motoristaId, inicio, fim, diaInteiro, motivo, observacao: observacao.trim(), registradoEm: null })
  }

  return (
    <section className="escala__form" aria-label="Novo compromisso">
      <Field label="Motorista" required>
        <Select options={motoristas.map((m) => ({ value: m.id, label: m.nome }))} value={motoristaId} onChange={setMotoristaId} placeholder="Escolha o motorista" required />
      </Field>
      <div className="escala__form-row">
        <Field label="De" required><Input type="date" value={de} onChange={(e) => { setDe(e.target.value); if (ate < e.target.value) setAte(e.target.value) }} /></Field>
        <Field label="Até" required><Input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></Field>
      </div>
      <Checkbox label="Dia inteiro" description="Desmarque para informar o horário, como &quot;livre até 12h&quot;." checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} />
      {diaInteiro ? null : (
        <div className="escala__form-row">
          <Field label="Indisponível a partir de" hint="00:00 = desde o início do dia"><Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></Field>
          <Field label="Até" hint="23:59 = até o fim do dia" error={erro}><Input type="time" value={horaFim} invalid={Boolean(erro)} onChange={(e) => setHoraFim(e.target.value)} /></Field>
        </div>
      )}
      {diaInteiro && erro ? <p className="escala__form-error" role="alert">{erro}</p> : null}
      <Field label="Motivo" required>
        <Select searchable={false} clearable={false} options={MOTIVOS} value={motivo} onChange={(value) => setMotivo((value ?? 'medico') as Motivo)} />
      </Field>
      <Field label="Observação"><Input value={observacao} maxLength={2000} placeholder="Ex.: consulta com retorno às 12h" onChange={(e) => setObservacao(e.target.value)} /></Field>
      <div className="escala__form-actions">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" disabled={!motoristaId || Boolean(erro)} onClick={adicionar}>Adicionar compromisso</Button>
      </div>
    </section>
  )
}

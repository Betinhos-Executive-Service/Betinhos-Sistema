import { useState } from 'react'
import { CalendarX, Plus, Trash2 } from 'lucide-react'
import { Button, EmptyState, Field, Input, Select, StatusBadge } from '@betinhos/ui'
import { MOTIVO_LABEL, dateRange, formatDate, formatWeekday, recordKey, type Edicao, type Motivo, type Motorista, type Registro } from '../domain/escala'
import { MOTIVO_OPTIONS } from './EscalaTab'

type Props = {
  hoje: string
  motoristas: Motorista[]
  registros: Map<string, Registro>
  onChange: (changes: [string, Edicao][]) => void
}

type Form = { motoristaId: string | null; inicio: string; fim: string; motivo: Motivo; observacao: string }

export function AusenciasTab({ hoje, motoristas, registros, onChange }: Props) {
  const [form, setForm] = useState<Form | null>(null)
  const nomes = new Map(motoristas.map((m) => [m.id, m.nome]))
  const ausencias = [...registros.values()]
    .filter((r) => r.status === 'indisponivel' && r.data >= hoje)
    .sort((a, b) => a.data.localeCompare(b.data) || (nomes.get(a.motoristaId) ?? '').localeCompare(nomes.get(b.motoristaId) ?? '', 'pt-BR'))

  const dias = form && form.inicio && form.fim >= form.inicio ? dateRange(form.inicio, form.fim) : []
  const erro = form && form.fim < form.inicio ? 'A data final deve ser igual ou posterior à inicial.' : dias.length >= 62 ? 'Registre no máximo 62 dias por vez.' : null

  const adicionar = () => {
    if (!form?.motoristaId || !dias.length || erro) return
    onChange(dias.map((data) => [recordKey(form.motoristaId!, data), { status: 'indisponivel', motivo: form.motivo, observacao: form.observacao }]))
    setForm(null)
  }

  return (
    <div className="escala__tab">
      {form ? (
        <section className="escala__form" aria-label="Nova ausência">
          <Field label="Motorista" required>
            <Select options={motoristas.map((m) => ({ value: m.id, label: m.nome }))} value={form.motoristaId} onChange={(motoristaId) => setForm({ ...form, motoristaId })} placeholder="Escolha o motorista" required />
          </Field>
          <div className="escala__form-row">
            <Field label="De" required><Input type="date" value={form.inicio} min={hoje} onChange={(e) => setForm({ ...form, inicio: e.target.value, fim: form.fim < e.target.value ? e.target.value : form.fim })} /></Field>
            <Field label="Até" required error={erro}><Input type="date" value={form.fim} min={form.inicio} invalid={Boolean(erro)} onChange={(e) => setForm({ ...form, fim: e.target.value })} /></Field>
          </div>
          <Field label="Motivo" required>
            <Select searchable={false} clearable={false} options={MOTIVO_OPTIONS} value={form.motivo} onChange={(motivo) => setForm({ ...form, motivo: (motivo ?? 'pessoal') as Motivo })} />
          </Field>
          <Field label="Observação"><Input value={form.observacao} maxLength={2000} placeholder="Ex.: consulta às 10h" onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></Field>
          <div className="escala__form-actions">
            <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
            <Button variant="primary" disabled={!form.motoristaId || !dias.length || Boolean(erro)} onClick={adicionar}>
              {dias.length > 1 ? `Adicionar ${dias.length} dias` : 'Adicionar ausência'}
            </Button>
          </div>
        </section>
      ) : (
        <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setForm({ motoristaId: null, inicio: hoje, fim: hoje, motivo: 'pessoal', observacao: '' })}>Registrar ausência</Button>
      )}

      {ausencias.length ? (
        <ul className="escala__list">
          {ausencias.map((r) => (
            <li key={recordKey(r.motoristaId, r.data)} className="escala__row escala__absence">
              <div className="escala__absence-main">
                <span className="escala__name">{nomes.get(r.motoristaId) ?? 'Motorista inativo'}</span>
                <span className="escala__meta">{formatWeekday(r.data)} {formatDate(r.data)}{r.observacao ? ` · ${r.observacao}` : ''}</span>
              </div>
              <StatusBadge tone="warning">{r.motivo ? MOTIVO_LABEL[r.motivo] : 'Indisponível'}</StatusBadge>
              <Button variant="ghost" size="compact" aria-label={`Remover ausência de ${nomes.get(r.motoristaId) ?? ''} em ${formatDate(r.data)}`} icon={<Trash2 size={16} />} onClick={() => onChange([[recordKey(r.motoristaId, r.data), null]])} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<CalendarX size={32} />} title="Nenhuma ausência registrada a partir de hoje.">Registre compromissos e férias para que apareçam na escala.</EmptyState>
      )}
    </div>
  )
}

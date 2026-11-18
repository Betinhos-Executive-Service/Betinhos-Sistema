// apps/shell/src/pages/frota/components/JanelaCampos.tsx
import { Field, Input, SegmentedControl, Select, Textarea } from '@betinhos/ui'
import { LIMITE } from '../data/schema'
import { rotuloJanela, semanaDe, semanasAPartirDe, type ErrosJanela, type ModoJanela, type ValoresJanela } from '../domain/janela'

const SEMANAS_OFERECIDAS = 8

type Props = { valores: ValoresJanela; erros: ErrosJanela; hoje: string; disabled?: boolean; onChange: (valores: ValoresJanela) => void }

/** Encaixe num dia ou numa semana de segunda a domingo, com o comentário ao motorista (vai para a programação na Geral). */
export function JanelaCampos({ valores, erros, hoje, disabled = false, onChange }: Props) {
  const set = (patch: Partial<ValoresJanela>) => onChange({ ...valores, ...patch })
  const semanas = semanasAPartirDe(hoje, SEMANAS_OFERECIDAS)
  // A semana já gravada (reagendar) aparece mesmo fora das próximas oito, desde que ainda não tenha terminado.
  const gravada = valores.semana ? semanaDe(valores.semana) : null
  const lista = gravada && gravada.fim >= hoje && !semanas.some((s) => s.inicio === gravada.inicio) ? [gravada, ...semanas] : semanas
  const opcoes = lista.map((s) => ({ value: s.inicio, label: rotuloJanela(s) }))
  return (
    <div className="frota-fields">
      <div className="frota-fields__wide">
        <SegmentedControl<ModoJanela> aria-label="Encaixar em" value={valores.modo} onChange={(modo) => set({ modo })}
          options={[{ value: 'dia', label: 'Dia', disabled }, { value: 'semana', label: 'Semana (seg–dom)', disabled }]} />
      </div>
      {valores.modo === 'dia' ? (
        <Field label="Dia" required error={erros.dia} disabled={disabled}>
          <Input type="date" min={hoje} value={valores.dia} onChange={(event) => set({ dia: event.target.value })} />
        </Field>
      ) : (
        <Field label="Semana" required error={erros.semana} disabled={disabled}>
          <Select options={opcoes} searchable={false} clearable={false} placeholder="Escolha a semana" value={valores.semana || null} onChange={(semana) => set({ semana: semana ?? '' })} />
        </Field>
      )}
      <Field className="frota-fields__wide" label="Comentário ao motorista" hint="Vai para a programação na Geral; o motorista vê quando a manutenção for programada com o nome dele." error={erros.comentario} disabled={disabled}>
        <Textarea rows={2} maxLength={LIMITE.comentarioAoMotorista} value={valores.comentario} onChange={(event) => set({ comentario: event.target.value })} />
      </Field>
    </div>
  )
}

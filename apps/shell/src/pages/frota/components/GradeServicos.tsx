// apps/shell/src/pages/frota/components/GradeServicos.tsx
import { useId } from 'react'
import { Checkbox } from '@betinhos/ui'
import { GRUPOS_MANUT } from '../domain/manutencaoCatalogo'

/** Serviços do catálogo agrupados por categoria (manutencaoCatalogo.json, o mesmo do App e do plugin). */
export function GradeServicos({ selecionados, onChange, disabled = false, erro, rotuloId }: {
  selecionados: number[]
  onChange: (servicos: number[]) => void
  disabled?: boolean
  erro?: string
  /** Id do elemento que rotula a grade (ex.: "Serviços realizados"): vira o nome do grupo para leitor de tela. */
  rotuloId?: string
}) {
  const erroId = useId()
  const alternar = (value: number) => onChange(selecionados.includes(value) ? selecionados.filter((v) => v !== value) : [...selecionados, value])
  return (
    <div className="frota-stack" role={rotuloId ? 'group' : undefined} aria-labelledby={rotuloId} aria-describedby={erro ? erroId : undefined}>
      <div className="frota-classif__grade">
        {GRUPOS_MANUT.map((grupo) => (
          <fieldset key={grupo.value} className="frota-classif__cat">
            <legend>{grupo.label}</legend>
            {grupo.servicos.map((servico) => (
              <Checkbox key={servico.value} label={servico.label} checked={selecionados.includes(servico.value)} onChange={() => alternar(servico.value)} disabled={disabled} />
            ))}
          </fieldset>
        ))}
      </div>
      {erro ? <p id={erroId} className="frota-erro" role="alert">{erro}</p> : null}
    </div>
  )
}

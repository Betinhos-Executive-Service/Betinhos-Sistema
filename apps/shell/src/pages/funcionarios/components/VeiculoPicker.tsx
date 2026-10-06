import { Button } from '@betinhos/ui'
import { Car, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type { DataSource } from '../data/source'
import type { Lookup } from '../data/types'
import { errorMessage } from '../data/xrm'

type Props = { source: DataSource; value: Lookup | null; changed: boolean; onChange: (value: Lookup | null) => void }

export function VeiculoPicker({ source, value, changed, onChange }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<Lookup[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      source.searchVeiculos(query).then((result) => { setOptions(result); setError(null) }, (reason) => setError(errorMessage(reason)))
    }, 250)
    return () => clearTimeout(timer)
  }, [open, query, source])

  return (
    <div className={`bt-field field${changed ? ' field--changed' : ''}`}>
      <label className="bt-field__label" htmlFor={id}>Veículo atual{changed && <span className="dot" title="Alterado" aria-label="alterado" />}</label>
      {value && !open ? (
        <div className="bt-control lookup-value">
          <Car size={16} aria-hidden />
          <button type="button" className="link" onClick={() => source.openForm('cr40f_veiculos', value.id)}>{value.label}</button>
          <Button variant="ghost" size="compact" aria-label="Trocar veículo" onClick={() => setOpen(true)}>Trocar</Button>
          <Button variant="ghost" size="compact" icon={<X size={16} />} aria-label="Remover veículo" onClick={() => onChange(null)} />
        </div>
      ) : (
        <div className="bt-control bt-control--input combo">
          <input
            className="bt-control__input"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            placeholder="Buscar placa ou modelo"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}
          />
          {open && (
            <ul id={`${id}-list`} role="listbox" className="combo-list">
              {error && <li className="field-error">{error}</li>}
              {!error && !options.length && <li className="muted">Nenhum veículo encontrado</li>}
              {options.map((option) => (
                <li key={option.id} role="option" aria-selected={option.id === value?.id}>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option); setOpen(false); setQuery('') }}>{option.label}</button>
                </li>
              ))}
              <li><button type="button" className="muted" onClick={() => setOpen(false)}>Cancelar</button></li>
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

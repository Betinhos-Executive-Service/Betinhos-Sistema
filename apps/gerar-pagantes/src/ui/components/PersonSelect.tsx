import { Select, filterOptions, type SelectOption } from '@betinhos-executive-service/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Person, PersonSearch } from '../../domain'

const MIN_QUERY = 2
const toOption = (person: Person, group: string): SelectOption => ({ value: person.id, label: person.name, subtitle: [person.role, person.email || 'Sem e-mail'].join(' · '), search: person.email, group })

/**
 * Escolha de pessoa com o Select do design system: mostra primeiro as pessoas
 * da OP e, a partir de 2 letras, inclui o cadastro geral.
 */
export function PersonSelect({ placeholder, ariaLabel, suggestions, excludedIds, onSearch, onSelect, size = 'default' }: {
  placeholder: string
  ariaLabel: string
  suggestions: Person[]
  excludedIds: Set<string>
  onSearch: PersonSearch
  onSelect: (person: Person) => void
  size?: 'compact' | 'default' | 'touch'
}) {
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState<Person[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  useEffect(() => {
    const current = ++requestId.current
    setRemote([]); setError('')
    if (query.trim().length < MIN_QUERY) { setLoading(false); return }
    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const page = await onSearch(query.trim())
        if (current === requestId.current) setRemote(page.people)
      } catch {
        if (current === requestId.current) setError('Não foi possível pesquisar o cadastro. Tente novamente.')
      } finally {
        if (current === requestId.current) setLoading(false)
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, onSearch])

  const people = useMemo(() => new Map([...suggestions, ...remote].map((person) => [person.id, person])), [suggestions, remote])
  const options = useMemo(() => {
    const local = filterOptions(suggestions.filter((person) => !excludedIds.has(person.id)).map((person) => toOption(person, 'Pessoas da OP')), query)
    const found = remote.filter((person) => !excludedIds.has(person.id) && !local.some((option) => option.value === person.id)).map((person) => toOption(person, 'Cadastro'))
    return [...local, ...found]
  }, [suggestions, remote, excludedIds, query])

  const emptyText = error || (query.trim().length < MIN_QUERY ? 'Digite 2 letras para buscar no cadastro.' : 'Nenhuma pessoa encontrada. Revise o nome ou e-mail.')

  return <Select aria-label={ariaLabel} placeholder={placeholder} searchPlaceholder="Nome ou e-mail" size={size} clearable={false}
    options={options} value={null} loading={loading} loadingText="Pesquisando no cadastro..." emptyText={emptyText}
    onSearchChange={setQuery}
    onChange={(id) => { const person = id ? people.get(id) : undefined; if (person) onSelect(person) }} />
}

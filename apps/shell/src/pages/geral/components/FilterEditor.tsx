import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Button, Checkbox, Dialog, Input, Radio, Select, type SelectOption } from '@betinhos/ui'
import { isEmptyFilter, type DateOp, type Filter, type NumberOp, type TextOp } from '../domain/filters'
import { parseMoney } from '../domain/format'
import type { AttributeInfo, LookupOption } from '../domain/types'
import { useLookupSearch } from './useLookupSearch'

const TEXT_OPS: SelectOption[] = [
  { value: 'contains', label: 'Contém' }, { value: 'not-contains', label: 'Não contém' }, { value: 'eq', label: 'Igual a' },
  { value: 'begins', label: 'Começa com' }, { value: 'empty', label: 'Está vazio' }, { value: 'not-empty', label: 'Está preenchido' },
]
const DATE_OPS: SelectOption[] = [
  { value: 'today', label: 'Hoje' }, { value: 'tomorrow', label: 'Amanhã' }, { value: 'yesterday', label: 'Ontem' },
  { value: 'this-week', label: 'Esta semana' }, { value: 'next-7', label: 'Próximos 7 dias' }, { value: 'last-7', label: 'Últimos 7 dias' },
  { value: 'this-month', label: 'Este mês' }, { value: 'range', label: 'Intervalo' }, { value: 'empty', label: 'Está vazio' },
]
const NUMBER_OPS: SelectOption[] = [
  { value: 'eq', label: 'Igual a' }, { value: 'ge', label: 'Maior ou igual a' }, { value: 'le', label: 'Menor ou igual a' },
  { value: 'between', label: 'Entre' }, { value: 'empty', label: 'Está vazio' },
]

type Search = (attribute: string, text: string) => Promise<LookupOption[]>
type Size = 'compact' | 'default'

type Props = {
  attribute: string
  info: AttributeInfo | undefined
  kind: Filter['kind']
  /** Filtro aplicado (ou rascunho) de onde o editor parte. */
  value: Filter | null
  search: Search
  /** Campos mais baixos, para o acordeão do painel. */
  compact?: boolean
  /** A cada mudança, com o filtro montado. */
  onDraft?: (filter: Filter | null) => void
  /** Com `onApply` o editor mostra "Aplicar" e "Limpar", e Enter aplica. */
  onApply?: (filter: Filter | null) => void
  onClear?: () => void
}

const numberText = (n: number | undefined) => (n == null ? '' : String(n).replace('.', ','))
const usable = (f: Filter | null) => (f && !isEmptyFilter(f) ? f : null)

/** Editor de um filtro, por tipo de coluna. O estado é local; quem usa decide quando vale (Aplicar ou rascunho). */
export function FilterEditor({ attribute, info, kind, value, search, compact = false, onDraft, onApply, onClear }: Props) {
  const [f, setF] = useState<Filter | null>(value)
  const size: Size = compact ? 'compact' : 'default'
  const group = useId()
  const change = (next: Filter | null) => { setF(next); onDraft?.(next) }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target
    if (event.key !== 'Enter' || !onApply || !(target instanceof HTMLInputElement)) return
    // Enter dentro do painel de um Select escolhe a opção; só os campos do próprio editor aplicam.
    if (target.closest('.bt-select-panel') || target.getAttribute('role') === 'combobox') return
    event.preventDefault()
    onApply(usable(f))
  }

  return (
    <div className={compact ? 'gr-fe gr-fe--compact' : 'gr-fe'} onKeyDown={onKeyDown}>
      {kind === 'text' ? <TextFields f={f?.kind === 'text' ? f : null} size={size} change={change} /> : null}
      {kind === 'choice' ? <ChoiceFields f={f?.kind === 'choice' ? f : null} info={info} change={change} /> : null}
      {kind === 'lookup' ? <LookupFields f={f?.kind === 'lookup' ? f : null} attribute={attribute} size={size} search={search} change={change} /> : null}
      {kind === 'date' ? <DateFields f={f?.kind === 'date' ? f : null} size={size} change={change} /> : null}
      {kind === 'number' ? <NumberFields f={f?.kind === 'number' ? f : null} size={size} change={change} /> : null}
      {kind === 'bool' ? (
        <div className="gr-fe__radios" role="radiogroup" aria-label="Valor">
          <Radio name={group} label="Sim" checked={f?.kind === 'bool' && f.op === 'yes'} onChange={() => change({ kind: 'bool', op: 'yes' })} />
          <Radio name={group} label="Não" checked={f?.kind === 'bool' && f.op === 'no'} onChange={() => change({ kind: 'bool', op: 'no' })} />
        </div>
      ) : null}
      {onApply ? (
        <div className="gr-fe__actions">
          <Button variant="ghost" onClick={() => { setF(null); onClear?.() }}>Limpar</Button>
          <Button onClick={() => onApply(usable(f))}>Aplicar</Button>
        </div>
      ) : null}
    </div>
  )
}

function TextFields({ f, size, change }: { f: Extract<Filter, { kind: 'text' }> | null; size: Size; change: (f: Filter) => void }) {
  const op = f?.op ?? 'contains'
  return (
    <>
      <Select size={size} aria-label="Operador" searchable={false} clearable={false} options={TEXT_OPS} value={op} onChange={(next) => { if (next) change({ kind: 'text', op: next as TextOp, value: f?.value }) }} />
      {op === 'empty' || op === 'not-empty' ? null : (
        <Input size={size} aria-label="Valor" value={f?.value ?? ''} autoFocus={size === 'default'} onChange={(event) => change({ kind: 'text', op, value: event.target.value })} />
      )}
    </>
  )
}

function ChoiceFields({ f, info, change }: { f: Extract<Filter, { kind: 'choice' }> | null; info: AttributeInfo | undefined; change: (f: Filter) => void }) {
  const empty = f?.op === 'empty'
  const values = f?.op === 'in' ? f.values ?? [] : []
  return (
    <div className="gr-fe__list" role="group" aria-label="Opções">
      {(info?.options ?? []).map((option) => (
        <Checkbox
          key={option.value}
          label={option.label}
          checked={values.includes(option.value)}
          onChange={() => change({ kind: 'choice', op: 'in', values: values.includes(option.value) ? values.filter((v) => v !== option.value) : [...values, option.value] })}
        />
      ))}
      <Checkbox label="Está vazio" checked={empty} onChange={() => change(empty ? { kind: 'choice', op: 'in', values: [] } : { kind: 'choice', op: 'empty' })} />
    </div>
  )
}

function LookupFields({ f, attribute, size, search, change }: { f: Extract<Filter, { kind: 'lookup' }> | null; attribute: string; size: Size; search: Search; change: (f: Filter) => void }) {
  const lookup = useLookupSearch((text) => search(attribute, text))
  const { onSearch } = lookup
  useEffect(() => { onSearch('') }, [onSearch])
  const chosen = useMemo(() => (f?.op === 'in' ? f.values ?? [] : []), [f])
  // Nomes já vistos: o valor escolhido continua legível depois que uma nova busca troca a lista.
  const seen = useRef(new Map<string, string>())
  for (const item of [...chosen, ...(lookup.found ?? [])]) seen.current.set(item.id, item.nome)
  const options = useMemo<SelectOption[]>(() => {
    const list = [...chosen, ...(lookup.found ?? []).filter((item) => !chosen.some((c) => c.id === item.id))]
    return list.map((item) => ({ value: item.id, label: item.nome }))
  }, [chosen, lookup.found])
  const empty = f?.op === 'empty'
  return (
    <>
      <Select
        multiple
        size={size}
        aria-label="Valores"
        placeholder="Selecione…"
        searchPlaceholder="Pesquisar…"
        options={options}
        value={chosen.map((c) => c.id)}
        loading={lookup.searching}
        loadingText="Buscando…"
        emptyText="Nada encontrado."
        disabled={empty}
        onSearchChange={lookup.onSearch}
        onChange={(ids) => change({ kind: 'lookup', op: 'in', values: ids.map((id) => ({ id, nome: seen.current.get(id) ?? id })) })}
      />
      <Checkbox label="Está vazio" checked={empty} onChange={() => change(empty ? { kind: 'lookup', op: 'in', values: [] } : { kind: 'lookup', op: 'empty' })} />
    </>
  )
}

function DateFields({ f, size, change }: { f: Extract<Filter, { kind: 'date' }> | null; size: Size; change: (f: Filter) => void }) {
  const op = f?.op ?? null
  return (
    <>
      <Select size={size} aria-label="Período" placeholder="Escolha o período" searchable={false} clearable={false} options={DATE_OPS} value={op} onChange={(next) => { if (next) change({ kind: 'date', op: next as DateOp, from: f?.from, to: f?.to }) }} />
      {op === 'range' ? (
        <div className="gr-fe__pair">
          <Input size={size} type="date" aria-label="De" value={f?.from ?? ''} onChange={(event) => change({ kind: 'date', op: 'range', from: event.target.value || undefined, to: f?.to })} />
          <Input size={size} type="date" aria-label="Até" value={f?.to ?? ''} onChange={(event) => change({ kind: 'date', op: 'range', from: f?.from, to: event.target.value || undefined })} />
        </div>
      ) : null}
    </>
  )
}

function NumberFields({ f, size, change }: { f: Extract<Filter, { kind: 'number' }> | null; size: Size; change: (f: Filter) => void }) {
  const op = f?.op ?? 'eq'
  // O texto digitado fica à parte do número: "1," precisa sobreviver à digitação.
  const [texts, setTexts] = useState<[string, string]>([numberText(f?.value), numberText(f?.to)])
  const emit = (nextOp: NumberOp, a: string, b: string) => change({ kind: 'number', op: nextOp, value: parseMoney(a) ?? undefined, to: parseMoney(b) ?? undefined })
  return (
    <>
      <Select size={size} aria-label="Operador" searchable={false} clearable={false} options={NUMBER_OPS} value={op} onChange={(next) => { if (next) emit(next as NumberOp, texts[0], texts[1]) }} />
      {op === 'empty' ? null : (
        <div className="gr-fe__pair">
          <Input size={size} inputMode="decimal" aria-label={op === 'between' ? 'De' : 'Valor'} value={texts[0]} onChange={(event) => { setTexts([event.target.value, texts[1]]); emit(op, event.target.value, texts[1]) }} />
          {op === 'between' ? <Input size={size} inputMode="decimal" aria-label="Até" value={texts[1]} onChange={(event) => { setTexts([texts[0], event.target.value]); emit(op, texts[0], event.target.value) }} /> : null}
        </div>
      )}
    </>
  )
}

type DialogProps = {
  /** Atributo em edição; `null` = fechado. */
  attribute: string | null
  info: AttributeInfo | undefined
  kind: Filter['kind'] | null
  value: Filter | null
  search: Search
  onApply: (attribute: string, filter: Filter | null) => void
  onClose: () => void
}

/** Editor de um filtro num diálogo centrado: "Filtrar {rótulo}". */
export function FilterDialog({ attribute, info, kind, value, search, onApply, onClose }: DialogProps) {
  const ready = attribute != null && kind != null
  return (
    <Dialog open={ready} onClose={onClose} title={`Filtrar ${info?.label || attribute || ''}`}>
      {ready ? (
        <FilterEditor
          key={attribute}
          attribute={attribute}
          info={info}
          kind={kind}
          value={value}
          search={search}
          onApply={(filter) => { onApply(attribute, filter); onClose() }}
          onClear={() => { onApply(attribute, null); onClose() }}
        />
      ) : null}
    </Dialog>
  )
}

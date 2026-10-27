import type { AttributeMeta, ChoiceOption, Row } from '@betinhos/dataverse'

export type ViewGroup = 'sistema' | 'minhas'
export type View = { id: string; nome: string; grupo: ViewGroup; fetchxml: string; layoutxml: string; padrao: boolean }

/** Coluna do layoutxml. `alias` e `entity` só em colunas de link-entity (`alias.atributo`). */
/** `label`: título fixo (colunas adicionadas pelo painel, com o caminho "Cliente › Nome"). */
export type Column = { key: string; attribute: string; alias: string | null; entity: string | null; width: number; label?: string }

export type CellKind = 'choice' | 'lookup' | 'datetime' | 'text' | 'memo' | 'money' | 'boolean' | 'readonly'

/** Metadata de um atributo mais as opções de choice/boolean já carregadas. */
export type AttributeInfo = AttributeMeta & { options: ChoiceOption[] }
export type AttributeMap = Map<string, AttributeInfo>

export type Sort = { attribute: string; alias: string | null; descending: boolean } | null
export type Page = { rows: Row[]; cookie: string | null; more: boolean; total: number | null }

export type CellStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }

export type LookupOption = { id: string; nome: string }
export type LookupBind = { nav: string; set: string }

export const ENTITY = 'cr40f_reservadeveculos'
export const ID_ATTRIBUTE = 'cr40f_reservadeveculosid'
export const PAGE_SIZE = 100

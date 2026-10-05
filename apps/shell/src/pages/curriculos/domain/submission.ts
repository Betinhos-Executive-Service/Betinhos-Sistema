import { FORM_KEYS, type CurriculoForm } from './form'

/** O que a tela usa do localStorage; injetável para testar em node. */
export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const DRAFT_KEY = 'betinhos.curriculos.rascunho.v1'
export const PENDING_KEY = 'betinhos.curriculos.pendente.v1'

export type Pending = { recordId: string; signature: string; phase: 'record-created' | 'upload-completed'; fileName: string; webUrl?: string }
export type Step = 'create' | 'upload' | 'link' | 'need-file'

function remove(kv: KV, key: string) {
  try { kv.removeItem(key) } catch { /* armazenamento bloqueado */ }
}
function write(kv: KV, key: string, value: unknown) {
  try { kv.setItem(key, JSON.stringify(value)) } catch { /* cheio ou bloqueado: segue sem persistir */ }
}
function readJson(kv: KV, key: string): unknown {
  try {
    const raw = kv.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    remove(kv, key)
    return null
  }
}

export function readPending(kv: KV): Pending | null {
  const value = readJson(kv, PENDING_KEY) as Partial<Pending> | null
  if (!value) return null
  if (typeof value.recordId !== 'string' || typeof value.signature !== 'string' || (value.phase !== 'record-created' && value.phase !== 'upload-completed')) {
    remove(kv, PENDING_KEY)
    return null
  }
  const pending: Pending = { recordId: value.recordId, signature: value.signature, phase: value.phase, fileName: typeof value.fileName === 'string' ? value.fileName : '' }
  if (typeof value.webUrl === 'string') pending.webUrl = value.webUrl
  return pending
}

export const writePending = (kv: KV, pending: Pending) => write(kv, PENDING_KEY, pending)
export const clearPending = (kv: KV) => remove(kv, PENDING_KEY)

/** Mesmas regras do legado (index.html:2215-2300): só retoma quando o payload é idêntico. */
export function nextStep(pending: Pending | null, signature: string, hasFile: boolean): Step {
  if (!pending || pending.signature !== signature) return 'create'
  if (pending.phase === 'upload-completed' && pending.webUrl) return 'link'
  return hasFile ? 'upload' : 'need-file'
}

/** Rascunho salvo sobre `base`; null quando não há nada diferente dela. */
export function readDraft(kv: KV, base: CurriculoForm): CurriculoForm | null {
  const value = readJson(kv, DRAFT_KEY)
  if (!value || typeof value !== 'object') return null
  const draft = { ...base }
  let changed = false
  for (const key of FORM_KEYS) {
    const field = (value as Record<string, unknown>)[key]
    if (typeof field === 'string' && field !== base[key]) { draft[key] = field; changed = true }
  }
  return changed ? draft : null
}

export const writeDraft = (kv: KV, form: CurriculoForm) => write(kv, DRAFT_KEY, form)
export const clearDraft = (kv: KV) => remove(kv, DRAFT_KEY)

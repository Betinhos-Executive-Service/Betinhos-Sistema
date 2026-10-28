// V2.1: anexos da cotação no SharePoint, guardados por cotação fora do estado global
// (a recarga das cotações não os apaga). Mesma forma de anexo da tarefa, para reaproveitar a seção.
import { useCallback, useRef, useState } from 'react'
import type { LiveAttachment, PlannerDataStore, UploadFile } from '../../data/dataverse'
import { fileToDataUrl } from '../attachmentFiles'

export interface QuoteAttachmentList { items: LiveAttachment[]; loading: boolean; error: string }
type Store = Pick<PlannerDataStore, 'live' | 'loadQuoteAttachments' | 'addQuoteAttachment' | 'deleteQuoteAttachment'>

const EMPTY: QuoteAttachmentList = { items: [], loading: false, error: '' }
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function useQuoteAttachments(store: Store) {
  const [lists, setLists] = useState<Record<string, QuoteAttachmentList>>({})
  const listsRef = useRef(lists)
  listsRef.current = lists
  const patch = useCallback((quoteId: string, change: (current: QuoteAttachmentList) => QuoteAttachmentList) =>
    setLists((all) => ({ ...all, [quoteId]: change(all[quoteId] || EMPTY) })), [])

  const ensure = useCallback(async (quoteId: string, force = false) => {
    if (!quoteId || (!force && listsRef.current[quoteId])) return
    patch(quoteId, (current) => ({ ...current, loading: true, error: '' }))
    try {
      const items = await store.loadQuoteAttachments(quoteId)
      patch(quoteId, () => ({ items, loading: false, error: '' }))
    } catch (error) {
      patch(quoteId, (current) => ({ ...current, loading: false, error: `Não foi possível carregar os anexos. ${message(error)}` }))
    }
  }, [patch, store])

  /** Envia em sequência; devolve quantos falharam (o erro do último fica visível na lista). */
  const add = useCallback(async (quoteId: string, files: UploadFile[]) => {
    let failures = 0
    // O nome único depende da lista real da pasta: sem lista carregada, consulta antes para não sobrescrever.
    const cached = listsRef.current[quoteId]
    let existing = cached && !cached.loading && !cached.error ? cached.items : await store.loadQuoteAttachments(quoteId).catch(() => cached?.items || [])
    for (const file of files) {
      try {
        const previewUrl = store.live ? '' : String(await fileToDataUrl(file))
        const attachment = await store.addQuoteAttachment(quoteId, file, existing, previewUrl)
        existing = [...existing, attachment]
        patch(quoteId, (current) => ({ ...current, items: [...current.items, attachment], error: '' }))
      } catch (error) {
        failures += 1
        patch(quoteId, (current) => ({ ...current, error: message(error) }))
      }
    }
    return failures
  }, [patch, store])

  const remove = useCallback(async (quoteId: string, attachment: LiveAttachment) => {
    try {
      await store.deleteQuoteAttachment(quoteId, attachment)
      patch(quoteId, (current) => ({ ...current, items: current.items.filter((item) => item.id !== attachment.id), error: '' }))
    } catch (error) {
      patch(quoteId, (current) => ({ ...current, error: `Não foi possível remover o anexo. ${message(error)}` }))
    }
  }, [patch, store])

  const get = useCallback((quoteId: string) => lists[quoteId] || EMPTY, [lists])
  return { get, ensure, add, remove }
}

export type QuoteAttachmentsApi = ReturnType<typeof useQuoteAttachments>

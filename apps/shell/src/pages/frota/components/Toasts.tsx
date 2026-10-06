import { useCallback } from 'react'
import { useToast } from '@betinhos/ui'

type Notify = (kind: 'success' | 'error', text: string) => void

/** Avisos da Frota sobre o toast do Design System: sucesso some sozinho, erro fica até ser fechado. */
export function useNotify(): Notify {
  const toast = useToast()
  return useCallback<Notify>((kind, text) => toast({ tone: kind === 'error' ? 'danger' : 'success', message: text }), [toast])
}

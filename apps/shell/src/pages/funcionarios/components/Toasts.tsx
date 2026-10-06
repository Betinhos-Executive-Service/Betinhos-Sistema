import { useToast } from '@betinhos/ui'
import { useCallback } from 'react'

type Notify = (kind: 'success' | 'error', text: string) => void

/** Toast do Design System: sucesso some sozinho; erro fica até ser fechado. */
export function useNotify(): Notify {
  const toast = useToast()
  return useCallback<Notify>((kind, text) => toast({ tone: kind === 'error' ? 'danger' : 'success', message: text }), [toast])
}

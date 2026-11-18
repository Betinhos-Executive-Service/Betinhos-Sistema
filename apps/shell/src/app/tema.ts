import { useCallback, useEffect, useState } from 'react'

/** Preferência do usuário: `sistema` segue o `prefers-color-scheme` do aparelho (padrão). */
export type Tema = 'claro' | 'escuro' | 'sistema'

export const TEMA_STORAGE_KEY = 'bt-tema'
export const TEMAS: readonly Tema[] = ['claro', 'escuro', 'sistema']

/** Valor de `data-theme` que os tokens do Design System entendem (`auto` = segue o sistema). */
const DATA_THEME: Record<Tema, string> = { claro: 'light', escuro: 'dark', sistema: 'auto' }

/** Preferência salva; sem valor válido (ou sem storage) cai em `sistema`. */
export function lerTema(): Tema {
  try {
    const salvo = localStorage.getItem(TEMA_STORAGE_KEY)
    if (salvo === 'claro' || salvo === 'escuro' || salvo === 'sistema') return salvo
  } catch { /* storage bloqueado: segue o sistema */ }
  return 'sistema'
}

/** Aplica o tema no `<html>`; sem gravar (a abertura usa isto antes do primeiro paint). */
export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.theme = DATA_THEME[tema]
}

/** Estado do tema do usuário: aplica no `<html>` e persiste a escolha. */
export function useTema() {
  const [tema, setTemaState] = useState<Tema>(lerTema)
  useEffect(() => { aplicarTema(tema) }, [tema])
  const setTema = useCallback((proximo: Tema) => {
    setTemaState(proximo)
    try { localStorage.setItem(TEMA_STORAGE_KEY, proximo) } catch { /* sem storage: vale só nesta sessão */ }
  }, [])
  return [tema, setTema] as const
}

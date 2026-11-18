import { createContext, useContext } from 'react'

/**
 * A grade virtualizada desmonta a linha que sai da janela. A célula que está em edição ou salvando avisa por aqui,
 * e a grade mantém essa linha montada (o rascunho vive no estado da própria célula) até ela terminar.
 */
export type GridRowState = { setEditing: (on: boolean) => void; setSaving: (on: boolean) => void }
export const GridRowContext = createContext<GridRowState | null>(null)
export const useGridRowState = () => useContext(GridRowContext)

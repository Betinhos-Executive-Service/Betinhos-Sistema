import type { ReactNode } from 'react'
import { RecordOpenProvider, type RecordOpener } from '@betinhos/ui'
import { openGridRecord, podeAbrirRegistro } from './abrirRegistro'

const ABRIDOR: RecordOpener = {
  onOpenRecord: (table, id) => { void openGridRecord(table, id) },
  canOpen: podeAbrirRegistro,
}

/** Liga todo `LookupCell` da tela ao mapa central de gavetas (`abrirRegistro`): a lista só diz tabela e id. */
export function RegistrosAbriveis({ children }: { children: ReactNode }) {
  return <RecordOpenProvider value={ABRIDOR}>{children}</RecordOpenProvider>
}

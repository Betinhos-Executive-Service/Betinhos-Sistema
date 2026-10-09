import type { ReactNode } from 'react'
import { EmptyState } from '@betinhos/ui'
import { Inbox } from 'lucide-react'
import { AnaliseCard } from './AnaliseCard'

/* Estados dos blocos, iguais em todas as abas: conjunto que não carregou (s/dado) e recorte sem registros (vazio). */

/**
 * Bloco cujo conjunto não carregou: o título do bloco, o valor "s/dado" em tom secundário e o motivo em texto.
 * Nunca número provisório, gráfico ou tabela vazia.
 */
export function SemDadoBloco({ titulo, motivo, periodo, unidade, largo = false }: { titulo: string; motivo: string; periodo: string; unidade: string; largo?: boolean }) {
  return <AnaliseCard titulo={titulo} periodo={periodo} unidade={unidade} valor={null} sub={motivo} largo={largo} natural />
}

/** Motivo padrão por fonte: "<fonte> não respondeu nesta carga." */
export const naoRespondeu = (fonte: string) => `${fonte} não respondeu nesta carga. Tente atualizar o dashboard.`

/** Recorte sem registros (a tabela respondeu, mas não há o que mostrar), com explicação opcional. */
export const Vazio = ({ titulo, children }: { titulo: string; children?: ReactNode }) => <EmptyState compact icon={<Inbox />} title={titulo}>{children}</EmptyState>

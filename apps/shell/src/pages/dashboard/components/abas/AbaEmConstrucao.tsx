import { EmptyState } from '@betinhos/ui'
import { Hammer } from 'lucide-react'

/** Aba com domínio pronto e tela ainda por montar: estado vazio explícito, sem números provisórios. */
export function AbaEmConstrucao({ nome }: { nome: string }) {
  return (
    <EmptyState className="surface" align="start" icon={<Hammer size={36} />} title={`A aba ${nome} está em construção`}>
      Os indicadores desta aba entram nas próximas entregas. Use o Resumo ou abra o dashboard completo.
    </EmptyState>
  )
}

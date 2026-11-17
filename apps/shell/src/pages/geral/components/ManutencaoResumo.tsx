import { StatusBadge } from '@betinhos/ui'
import type { LinhaManutencao } from '../domain/manutencao'

/** Resumo da manutenção na linha da Geral: problema, grau, janela, status e os selos (spec, "Shell › Geral"). */
export function ManutencaoResumo({ m, quebra = false }: { m: LinhaManutencao; quebra?: boolean }) {
  return (
    <span className={quebra ? 'gr-manut__resumo gr-manut__resumo--quebra' : 'gr-manut__resumo'}>
      <span className="gr-manut__descricao">{m.descricao}</span>
      {m.grau ? <span className="gr-manut__meta">{m.grau}</span> : null}
      <span className="gr-manut__meta">{m.janelaRotulo}</span>
      <StatusBadge tone={m.statusTom}>{m.statusRotulo}</StatusBadge>
      {m.atrasada ? <StatusBadge tone="danger">Atrasada</StatusBadge> : null}
      {m.foraDaJanela ? <StatusBadge tone="warning">Fora da janela</StatusBadge> : null}
    </span>
  )
}

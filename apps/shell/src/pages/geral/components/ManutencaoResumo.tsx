import { StatusBadge } from '@betinhos/ui'
import { Wrench } from 'lucide-react'
import type { LinhaManutencao } from '../domain/manutencao'

/**
 * Status da manutenção (etiqueta) e os alertas que pedem ação ("Atrasada", "Fora da janela") como texto curto com ponto,
 * não outra etiqueta: duas etiquetas lado a lado não cabem na coluna Status de Op. e competem entre si.
 */
export function ManutencaoSelos({ m }: { m: LinhaManutencao }) {
  return (
    <span className="gr-manut__selos">
      <StatusBadge tone={m.statusTom}>{m.statusRotulo}</StatusBadge>
      {m.atrasada ? <span className="gr-manut__alerta gr-manut__alerta--perigo" title="Atrasada"><span className="gr-manut__alerta-texto">Atrasada</span></span> : null}
      {m.foraDaJanela ? <span className="gr-manut__alerta gr-manut__alerta--aviso" title="Fora da janela"><span className="gr-manut__alerta-texto">Fora da janela</span></span> : null}
    </span>
  )
}

/**
 * O problema em cima e, embaixo, grau e janela numa frase ("Alta · Semana de …"). `status` põe também o status e os
 * selos (quando a visão não tem Status de Op., e nos cards). `quebra` deixa o texto quebrar (cards e primeira coluna).
 */
export function ManutencaoResumo({ m, quebra = false, status = true }: { m: LinhaManutencao; quebra?: boolean; status?: boolean }) {
  return (
    <span className={quebra ? 'gr-manut__resumo gr-manut__resumo--quebra' : 'gr-manut__resumo'} title={m.descricao}>
      <span className="gr-manut__descricao">{m.descricao}</span>
      <span className="gr-manut__detalhes">
        {status ? <ManutencaoSelos m={m} /> : null}
        <span className="gr-manut__frase">
          {m.grau ? <span className="gr-manut__meta">{m.grau}</span> : null}
          <span className="gr-manut__meta">{m.janelaRotulo}</span>
        </span>
      </span>
    </span>
  )
}

/** Rótulo do botão que abre a gaveta: placa em destaque e "Manutenção" embaixo na tabela; numa linha só nos cards. */
export function ManutencaoRotulo({ m }: { m: LinhaManutencao }) {
  return (
    <span className="gr-manut__rotulo">
      <span className="gr-manut__placa">{m.veiculo}</span>
      <span className="gr-manut__sep"> · </span>
      <span className="gr-manut__tipo">Manutenção</span>
    </span>
  )
}

/** Nome acessível do botão que abre a gaveta: começa pelo texto visível ("TST1A11 · Manutenção") e diz o que abre. */
export const rotuloAbrirManutencao = (m: LinhaManutencao) => `${m.veiculo} · Manutenção, abrir: ${m.descricao}`

/** Botão da linha que abre a gaveta da manutenção (o único alvo acessível dela) e, sem coluna para o problema, o resumo embaixo. */
export function ManutencaoAbrir({ m, abrir, resumo, statusNoResumo }: { m: LinhaManutencao; abrir: () => void; resumo: boolean; statusNoResumo: boolean }) {
  return (
    <>
      <button type="button" className="gr-open gr-manut__abrir" aria-label={rotuloAbrirManutencao(m)} title={m.descricao} onClick={abrir}><Wrench size={14} aria-hidden="true" /><ManutencaoRotulo m={m} /></button>
      {resumo ? <ManutencaoResumo m={m} quebra status={statusNoResumo} /> : null}
    </>
  )
}

import { useMemo, type ReactNode } from 'react'
import { Button, Drawer, StatusBadge, useToast } from '@betinhos/ui'
import { ClipboardCopy, Copy, WifiOff } from 'lucide-react'
import { copiarTexto } from '../dashboard/components/Copiar'
import type { LogApp } from './data'
import { formatPayload, severidadeLabel, severidadeTone } from './lista'
import { promptCorrecao, recorrencia } from './prompt'
import { BotaoAuditoria } from '../../app/auditoria/AuditoriaProvider'

const dataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmt = (d: Date | null) => (d ? dataHora.format(d).replace(',', '') : '')

type Props = { log: LogApp | null; list: LogApp[]; periodo: string; onClose: () => void }

/** Ficha só leitura do log: resumo, contexto, recorrência no período e o prompt pronto para corrigir. */
export function LogDrawer({ log, list, periodo, onClose }: Props) {
  const toast = useToast()
  const rec = useMemo(() => (log ? recorrencia(log, list) : null), [log, list])

  const copiar = (texto: string, sucesso: string) => void copiarTexto(texto).then((ok) => toast(ok
    ? { tone: 'success', message: sucesso }
    : { tone: 'danger', message: 'Não foi possível copiar. Selecione o texto e copie com Ctrl+C.' }))

  const footer = log && rec ? (
    <div className="lg-drawer__footer">
      <Button variant="secondary" icon={<Copy size={16} />} onClick={() => copiar(log.id, 'ID do log copiado.')}>Copiar ID</Button>
      <Button icon={<ClipboardCopy size={16} />} onClick={() => copiar(promptCorrecao(log, rec, periodo), 'Prompt copiado. Cole no Claude Code para corrigir.')}>Copiar prompt para corrigir</Button>
    </div>
  ) : null

  return (
    <Drawer actions={<BotaoAuditoria entity="new_appmotoristaslog" ids={[log?.id]} />} open={log != null} onClose={onClose} size="wide" eyebrow={log ? [log.app, log.versao].filter(Boolean).join(' · ') || 'Log de erro' : ''} title={log ? log.erro || severidadeLabel(log.severidade) : ''} footer={footer}>
      {log && rec ? (
        <div className="lg-ficha">
          <section className="lg-hero" aria-label="Resumo do erro">
            <div className="lg-hero__badges">
              <StatusBadge tone={severidadeTone(log.severidade)}>{severidadeLabel(log.severidade)}</StatusBadge>
              {rec.total > 1 ? <StatusBadge tone="warning">{rec.total}× no período</StatusBadge> : <StatusBadge tone="neutral">Ocorrência única</StatusBadge>}
              {log.offline ? <StatusBadge tone="neutral"><WifiOff size={12} aria-hidden="true" /> Sem internet</StatusBadge> : null}
              <span className="lg-hero__quando lg-num">{fmt(log.data)}</span>
            </div>
            <p className="lg-hero__msg">{log.mensagem || 'Sem mensagem'}</p>
            {log.codigo ? <p className="lg-hero__codigo">Código <code>{log.codigo}</code></p> : null}
          </section>

          <Secao titulo="Onde aconteceu">
            <Item nome="Tela">{log.tela}</Item>
            <Item nome="App">{[log.app, log.versao].filter(Boolean).join(' · ')}</Item>
            <Item nome="Usuário">{log.usuario}{log.email ? <span className="lg-sub">{log.email}</span> : null}</Item>
            <Item nome="Dispositivo">{[log.plataforma, log.offline == null ? '' : log.offline ? 'sem internet' : 'online'].filter(Boolean).join(' · ')}</Item>
          </Secao>

          <Secao titulo={`Recorrência · ${periodo.toLowerCase()}`}>
            <Item nome="Ocorrências"><span className="lg-num">{rec.total} {rec.total === 1 ? 'vez' : 'vezes'} · {rec.usuarios} {rec.usuarios === 1 ? 'usuário' : 'usuários'}</span></Item>
            <Item nome="Versões">{rec.versoes.join(', ')}</Item>
            <Item nome="Primeira">{fmt(rec.primeira)}</Item>
            <Item nome="Última">{fmt(rec.ultima)}</Item>
          </Secao>

          <Secao titulo="Detalhes técnicos">
            <Item nome="Origem">{log.origem}</Item>
            <Item nome="Componente">{log.componente}</Item>
            <Item nome="Ação / fase">{[log.acao, log.fase].filter(Boolean).join(' / ')}</Item>
            <Item nome="Sessão"><span className="lg-mono">{log.sessao}</span></Item>
            <Item nome="URL" largo><span className="lg-mono lg-quebra">{log.url}</span></Item>
          </Secao>

          <Codigo titulo="Stack" texto={log.stack} onCopiar={() => copiar(log.stack, 'Stack copiada.')} />
          <Codigo titulo="Payload" texto={formatPayload(log.payload)} onCopiar={() => copiar(formatPayload(log.payload), 'Payload copiado.')} />
        </div>
      ) : null}
    </Drawer>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="lg-secao">
      <h3>{titulo}</h3>
      <dl className="lg-secao__grid">{children}</dl>
    </section>
  )
}

function Item({ nome, largo, children }: { nome: string; largo?: boolean; children: ReactNode }) {
  return <div className={largo ? 'lg-item lg-item--largo' : 'lg-item'}><dt>{nome}</dt><dd>{children || '—'}</dd></div>
}

function Codigo({ titulo, texto, onCopiar }: { titulo: string; texto: string; onCopiar: () => void }) {
  if (!texto) return null
  return (
    <section className="lg-secao">
      <header className="lg-secao__head">
        <h3>{titulo}</h3>
        <Button variant="ghost" size="compact" icon={<Copy size={14} />} onClick={onCopiar}>Copiar {titulo.toLowerCase()}</Button>
      </header>
      <pre className="lg-pre">{texto}</pre>
    </section>
  )
}

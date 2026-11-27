import { useState } from 'react'
import { Alert, Button, Dialog, EmptyState } from '@betinhos/ui'
import { History } from 'lucide-react'
import { amploTexto, erroDaApi, oQueMuda, ultimaDoAmplo } from '../domain/perfis'
import type { Historico } from '../domain/types'
import '../acessos.css'

const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const fmtQuando = (d: Date | null) => (d ? fmt.format(d) : '—')

type Props = {
  itens: Historico[]
  /** `comPessoa` mostra de quem é (histórico geral). */
  comPessoa?: boolean
  /** Só para o Administrador do Sistema: devolve o acesso amplo retirado na entrada mais nova da pessoa. */
  onDevolver?: (h: Historico) => Promise<void>
}

/** Alterações de perfil, da mais nova para a mais velha. */
export function HistoricoLista({ itens, comPessoa, onDevolver }: Props) {
  const [alvo, setAlvo] = useState<Historico | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  if (!itens.length) return <EmptyState align="start" icon={<History size={36} />} title="Nenhuma alteração registrada">As alterações de perfil feitas por esta tela aparecem aqui.</EmptyState>
  const devolver = async () => {
    if (!alvo) return
    setEnviando(true)
    try {
      await onDevolver?.(alvo)
      setAlvo(null)
      setErro(null)
    } catch (reason) {
      setErro(erroDaApi(reason).mensagem)
    } finally {
      setEnviando(false)
    }
  }
  return (
    <>
      {erro ? <Alert tone="danger" title="Não foi possível devolver o acesso amplo">{erro}</Alert> : null}
      <ol className="ac-hist" aria-label="Histórico de alterações">
        {itens.map((h) => {
          const linhas = oQueMuda(h.antes, h.depois)
          if (h.amplo) linhas.push(amploTexto(h.amplo))
          const devolvivel = onDevolver && h.amplo?.acao === 'retirar' && ultimaDoAmplo(itens, h.usuarioId) === h
          return (
            <li key={h.id} className="ac-hist__item">
              <span className="ac-hist__quando">{fmtQuando(h.quando)} · por {h.alteradoPor}</span>
              {comPessoa ? <strong>{h.usuario}</strong> : null}
              {linhas.length ? <ul className="ac-hist__linhas">{linhas.map((l) => <li key={l}>{l}</li>)}</ul> : <span className="ac-hist__quando">Sem diferença de perfil.</span>}
              {devolvivel ? <Button className="ac-hist__devolver" variant="secondary" onClick={() => { setErro(null); setAlvo(h) }}>Devolver acesso amplo</Button> : null}
            </li>
          )
        })}
      </ol>
      <Dialog open={alvo != null} onClose={() => !enviando && setAlvo(null)} title="Devolver acesso amplo?" actions={<>
        <Button variant="secondary" disabled={enviando} onClick={() => setAlvo(null)}>Voltar</Button>
        <Button loading={enviando} onClick={() => void devolver()}>Devolver acesso amplo</Button>
      </>}>
        {alvo?.amplo?.papeis.length ? `${alvo.usuario} volta a ter: ${alvo.amplo.papeis.map((p) => p.nome).join(', ')}.` : `${alvo?.usuario ?? ''} volta a ter o acesso amplo.`}
      </Dialog>
    </>
  )
}

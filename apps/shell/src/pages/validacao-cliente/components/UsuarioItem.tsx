import { useState, type ReactNode } from 'react'
import { Button, Dialog, StatusBadge, Switch, useToast } from '@betinhos/ui'
import { KeyRound } from 'lucide-react'
import type { Source } from '../data/source'
import type { Validador } from '../domain/types'
import { fmtData } from './ValidacaoList'

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Ativar/desativar e zerar a senha de um usuário do portal, com toast e confirmação; compartilhado pela aba Usuários e pelo drawer do cliente. */
export function useAcoesUsuario(source: Source, onSaved: (v: Validador) => void) {
  const toast = useToast()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [zerar, setZerar] = useState<Validador | null>(null)

  async function alternar(v: Validador) {
    setOcupado(v.id)
    try {
      await source.setValidadorAtivo(v.id, !v.ativo)
      onSaved({ ...v, ativo: !v.ativo })
      toast({ tone: 'success', message: v.ativo ? `${v.nome} não acessa mais o portal.` : `${v.nome} voltou a acessar o portal.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível alterar. ${reasonText(reason)}` })
    } finally {
      setOcupado(null)
    }
  }

  async function alternarAprovador(v: Validador) {
    setOcupado(v.id)
    try {
      await source.setValidadorAprovador(v.id, !v.aprovador)
      onSaved({ ...v, aprovador: !v.aprovador })
      toast({ tone: 'success', message: v.aprovador ? `${v.nome} não aprova mais pedidos.` : `${v.nome} agora aprova os pedidos do cliente.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível alterar. ${reasonText(reason)}` })
    } finally {
      setOcupado(null)
    }
  }

  async function confirmarZerar() {
    if (!zerar) return
    const v = zerar
    setOcupado(v.id)
    try {
      await source.zerarSenha(v.id)
      onSaved({ ...v, senhaDefinidaEm: null })
      setZerar(null)
      toast({ tone: 'success', message: `Senha de ${v.nome} zerada. Avise a pessoa: para entrar, use "Primeiro acesso ou esqueci a senha" no portal.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível zerar a senha. ${reasonText(reason)}` })
    } finally {
      setOcupado(null)
    }
  }

  const dialogo: ReactNode = (
    <Dialog open={zerar != null} onClose={() => { if (!ocupado) setZerar(null) }} tone="danger" title="Zerar senha?"
      actions={<>
        <Button variant="secondary" disabled={!!ocupado} onClick={() => setZerar(null)}>Cancelar</Button>
        <Button variant="danger" loading={!!ocupado} onClick={() => void confirmarZerar()}>Zerar senha</Button>
      </>}>
      A senha de {zerar?.nome} para de funcionar e as sessões abertas caem. Para voltar, a pessoa usa "Primeiro acesso ou esqueci a senha" e cria outra pelo código do e-mail. O portal não avisa: avise a pessoa.
    </Dialog>
  )
  return { ocupado, alternar, alternarAprovador, pedirZerar: setZerar, dialogo }
}

type ItemProps = { v: Validador; mostrarCliente: boolean; ocupado: boolean; onAlternar: (v: Validador) => void; onAprovador: (v: Validador) => void; onZerar: (v: Validador) => void }

export function UsuarioItem({ v, mostrarCliente, ocupado, onAlternar, onAprovador, onZerar }: ItemProps) {
  return (
    <li className="vc-val">
      <div className="vc-val__info">
        <strong>{v.nome}</strong>
        <span>{mostrarCliente ? `${v.email} · ${v.cliente.nome}` : v.email}</span>
        <span className="vc-badges">
          {v.senhaDefinidaEm ? <StatusBadge tone="success">Senha criada</StatusBadge> : <StatusBadge tone="warning">Aguardando 1º acesso</StatusBadge>}
          <span className="vc-muted">{v.ultimoAcesso ? `Último acesso ${fmtData(v.ultimoAcesso)}` : 'Nunca acessou'}</span>
        </span>
      </div>
      <div className="vc-val__acoes">
        <Switch label={v.ativo ? 'Ativo' : 'Inativo'} checked={v.ativo} disabled={ocupado} onChange={() => onAlternar(v)} />
        <Switch label="Aprovador" checked={v.aprovador} disabled={ocupado} onChange={() => onAprovador(v)} />
        <Button variant="secondary" size="compact" icon={<KeyRound size={14} />} disabled={ocupado || !v.senhaDefinidaEm} title={v.senhaDefinidaEm ? undefined : 'A pessoa ainda não criou a senha.'} onClick={() => onZerar(v)}>Zerar senha</Button>
      </div>
    </li>
  )
}

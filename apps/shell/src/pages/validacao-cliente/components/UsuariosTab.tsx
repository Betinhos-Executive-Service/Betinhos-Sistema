import { useState } from 'react'
import { Button, Dialog, Field, Input, Select, StatusBadge, Switch, useToast } from '@betinhos/ui'
import { KeyRound, UserPlus } from 'lucide-react'
import type { Source } from '../data/source'
import { validarValidador } from '../domain/regras'
import type { Cliente, Validador } from '../domain/types'
import { fmtData } from './ValidacaoList'

type Props = { validadores: Validador[]; clientes: Cliente[]; source: Source; onSaved: (v: Validador) => void }
type Erros = ReturnType<typeof validarValidador>

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const VAZIO = { nome: '', email: '', clienteId: '' }

/** Aba Usuários: quem usa o portal; cadastrar, ativar/desativar e zerar a senha. */
export function UsuariosTab({ validadores, clientes, source, onSaved }: Props) {
  const toast = useToast()
  const [form, setForm] = useState({ ...VAZIO, clienteId: clientes.length === 1 ? clientes[0].id : '' })
  const [erros, setErros] = useState<Erros>({})
  const [salvando, setSalvando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [zerar, setZerar] = useState<Validador | null>(null)

  const set = (patch: Partial<typeof VAZIO>) => setForm((f) => ({ ...f, ...patch }))

  async function cadastrar() {
    const found = validarValidador(form, validadores.map((v) => v.email))
    setErros(found)
    if (Object.keys(found).length) return
    setSalvando(true)
    try {
      const id = await source.criarValidador(form)
      const cliente = clientes.find((c) => c.id === form.clienteId)!
      onSaved({ id, nome: form.nome.trim(), email: form.email.trim().toLowerCase(), cliente, ativo: true, ultimoAcesso: null, senhaDefinidaEm: null })
      toast({ tone: 'success', message: `${form.nome.trim()} cadastrado. No primeiro acesso, a pessoa cria a senha pelo código enviado ao e-mail.` })
      setForm((f) => ({ ...VAZIO, clienteId: f.clienteId }))
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível cadastrar. ${reasonText(reason)}` })
    } finally {
      setSalvando(false)
    }
  }

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

  const lista = [...validadores].sort((a, b) => a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'))
  return (
    <>
      <div className="vc-validadores">
        <form className="vc-secao" onSubmit={(e) => { e.preventDefault(); void cadastrar() }} noValidate>
          <h3 className="vc-secao__titulo">Cadastrar usuário</h3>
          <Field label="Nome" required error={erros.nome}><Input name="nome" value={form.nome} disabled={salvando} onChange={(e) => set({ nome: e.target.value })} /></Field>
          <Field label="E-mail" required error={erros.email}><Input name="email" type="email" value={form.email} disabled={salvando} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Cliente" required error={erros.clienteId}>
            <Select value={form.clienteId || null} disabled={salvando} onChange={(v) => set({ clienteId: v ?? '' })} options={clientes.map((c) => ({ value: c.id, label: c.nome }))} placeholder="Escolha o cliente" />
          </Field>
          <div><Button type="submit" icon={<UserPlus size={16} />} loading={salvando}>Cadastrar usuário</Button></div>
        </form>
        <section className="vc-secao" aria-labelledby="vc-val-lista">
          <h3 id="vc-val-lista" className="vc-secao__titulo">Usuários ({lista.length})</h3>
          <ul className="vc-val-lista">
            {lista.map((v) => (
              <li key={v.id} className="vc-val">
                <div className="vc-val__info">
                  <strong>{v.nome}</strong>
                  <span>{v.email} · {v.cliente.nome}</span>
                  <span className="vc-badges">
                    {v.senhaDefinidaEm ? <StatusBadge tone="success">Senha criada</StatusBadge> : <StatusBadge tone="warning">Aguardando 1º acesso</StatusBadge>}
                    <span className="vc-muted">{v.ultimoAcesso ? `Último acesso ${fmtData(v.ultimoAcesso)}` : 'Nunca acessou'}</span>
                  </span>
                </div>
                <div className="vc-val__acoes">
                  <Switch label={v.ativo ? 'Ativo' : 'Inativo'} checked={v.ativo} disabled={ocupado === v.id} onChange={() => void alternar(v)} />
                  <Button variant="secondary" size="compact" icon={<KeyRound size={14} />} disabled={ocupado === v.id || !v.senhaDefinidaEm} title={v.senhaDefinidaEm ? undefined : 'A pessoa ainda não criou a senha.'} onClick={() => setZerar(v)}>Zerar senha</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Dialog open={zerar != null} onClose={() => { if (!ocupado) setZerar(null) }} tone="danger" title="Zerar senha?"
        actions={<>
          <Button variant="secondary" disabled={!!ocupado} onClick={() => setZerar(null)}>Cancelar</Button>
          <Button variant="danger" loading={!!ocupado} onClick={() => void confirmarZerar()}>Zerar senha</Button>
        </>}>
        A senha de {zerar?.nome} para de funcionar e as sessões abertas caem. Para voltar, a pessoa usa "Primeiro acesso ou esqueci a senha" e cria outra pelo código do e-mail. O portal não avisa: avise a pessoa.
      </Dialog>
    </>
  )
}

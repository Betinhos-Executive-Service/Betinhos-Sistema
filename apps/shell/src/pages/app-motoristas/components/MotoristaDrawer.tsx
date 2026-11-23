import { useEffect, useMemo, useState } from 'react'
import { CATALOGO } from '@betinhos/app-config'
import { Alert, Button, Dialog, Drawer, Field, Input, SegmentedControl, Select, StatusBadge, Textarea } from '@betinhos/ui'
import type { DefinirPessoa } from '../data/source'
import { dataCurta, dataHora } from '../domain/formato'
import { excecoesDe, origemPorChave, statusExcecao, validarExcecao, rotuloChave, type ErrosExcecao } from '../domain/regras'
import type { Motorista, Versao } from '../domain/types'
import { PerfilCelula } from './MotoristasLista'

type Props = {
  motorista: Motorista | null
  /** `true` quando a lista já carregou e o id da URL não está nela; antes disso o drawer mostra "Carregando". */
  naoEncontrado: boolean
  open: boolean
  onClose: () => void
  publicada: Versao | null
  hoje: string
  /** Só o administrador mexe no grupo piloto. */
  admin: boolean
  onDefinir: (dados: DefinirPessoa) => Promise<boolean>
  onToast: (tom: 'success' | 'info', texto: string) => void
}

type Form = { chave: string; ligado: boolean; motivo: string; validade: string }
const VAZIO: Form = { chave: '', ligado: true, motivo: '', validade: '' }

const OPCOES_CHAVE = CATALOGO.filter((e) => !e.fixa).map((e) => ({ value: e.chave, label: e.pai ? `${rotuloChave(e.pai)} · ${e.rotulo}` : e.rotulo }))
const STATUS_TEXTO = { vigente: 'Vigente', vencida: 'Vencida', encerrada: 'Encerrada' } as const

/** Valor e origem de cada chave do motorista, exceções (criar e encerrar) e grupo piloto (só administrador). */
export function MotoristaDrawer({ motorista, naoEncontrado, open, onClose, publicada, hoje, admin, onDefinir, onToast }: Props) {
  const [form, setForm] = useState<Form>(VAZIO)
  const [erros, setErros] = useState<ErrosExcecao>({})
  const [salvando, setSalvando] = useState(false)
  const [sair, setSair] = useState(false)
  const id = motorista?.id ?? null

  useEffect(() => { setForm(VAZIO); setErros({}); setSair(false) }, [id, open])

  const sujo = form.motivo.trim() !== '' || form.validade !== '' || form.chave !== '' || !form.ligado
  const origem = useMemo(() => (motorista ? origemPorChave(motorista, publicada?.matriz ?? null, hoje, publicada?.numero ?? null) : null), [motorista, publicada, hoje])
  const excecoes = motorista ? excecoesDe(motorista).reverse() : []

  const fechar = () => {
    if (salvando) return
    if (sujo) { setSair(true); return }
    onClose()
  }

  /** Uma gravação por vez; `true` quando gravou (o aviso de erro já foi dado por `onDefinir`). */
  async function gravar(dados: Omit<DefinirPessoa, 'funcionarioId'>, tom: 'success' | 'info', texto: string) {
    if (!motorista || salvando) return false
    setSalvando(true)
    try {
      const ok = await onDefinir({ funcionarioId: motorista.id, ...dados })
      if (ok) onToast(tom, texto)
      return ok
    } finally { setSalvando(false) }
  }

  async function criar() {
    if (!motorista) return
    const achados = validarExcecao(form, hoje)
    setErros(achados)
    if (Object.keys(achados).length) return
    if (await gravar({ tipo: 'excecao', chave: form.chave, ligado: form.ligado, motivo: form.motivo.trim(), validade: form.validade || undefined }, 'success', `Exceção criada para ${motorista.nome}.`)) setForm(VAZIO)
  }

  const encerrar = (chave: string) => gravar({ tipo: 'excecao', chave, encerrar: true }, 'info', `Exceção de ${rotuloChave(chave)} encerrada.`)

  const alternarPiloto = () => motorista && gravar(
    { tipo: 'piloto', encerrar: motorista.piloto }, 'info', motorista.piloto ? `${motorista.nome} saiu do grupo piloto.` : `${motorista.nome} entrou no grupo piloto.`,
  )

  const rodape = <Button variant="secondary" disabled={salvando} onClick={fechar}>Fechar</Button>
  return (
    <>
      <Drawer open={open} onClose={fechar} size="wide" eyebrow="App Motoristas" title={motorista?.nome ?? 'Motorista'} footer={rodape}>
        {!motorista || !origem ? (
          naoEncontrado
            ? <Alert tone="warning" title="Motorista não encontrado">Ele pode ter perdido o acesso ao App ou o link é de outro ambiente. Atualize a lista.</Alert>
            : <div className="am-vazio" role="status">Carregando o motorista…</div>
        ) : (
          <div className="am-drawer">
            <div className="am-drawer__resumo">
              <PerfilCelula m={motorista} />
              {motorista.piloto ? <StatusBadge tone="success">Grupo piloto</StatusBadge> : null}
              <span className="am-muted">{motorista.push ? 'Push ativo' : 'Sem push ativo'}</span>
            </div>

            <section aria-labelledby="am-d-valores">
              <h3 id="am-d-valores">O que o motorista vê hoje</h3>
              <p className="am-muted">Versão no ar: {publicada ? `v${publicada.numero}` : 'nenhuma (vale o padrão do catálogo)'}. O rascunho só vale depois de publicado.</p>
              <ul className="am-valores">
                {origem.linhas.map((l) => (
                  <li key={l.chave} className={l.tipo === 'funcao' ? 'is-funcao' : undefined}>
                    <span>{l.rotulo}</span>
                    <StatusBadge tone={l.ligado ? 'success' : 'neutral'}>{l.ligado ? 'Ligado' : 'Desligado'}</StatusBadge>
                    <span className="am-muted">{l.texto}</span>
                    {l.origem === 'excecao' ? <Button size="compact" variant="secondary" disabled={salvando} onClick={() => void encerrar(l.chave)}>Encerrar exceção</Button> : <span />}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="am-d-piloto">
              <h3 id="am-d-piloto">Grupo piloto</h3>
              <p className="am-muted">O piloto recebe tudo ligado para testar antes de uma publicação. {admin ? '' : 'Só o Administrador do Sistema entra ou sai do grupo.'}</p>
              <Button variant="secondary" disabled={!admin || salvando} onClick={() => void alternarPiloto()}>{motorista.piloto ? 'Sair do grupo piloto' : 'Entrar no grupo piloto'}</Button>
            </section>

            <section aria-labelledby="am-d-nova">
              <h3 id="am-d-nova">Nova exceção</h3>
              <form className="am-form" onSubmit={(e) => { e.preventDefault(); void criar() }} noValidate>
                <Field label="Módulo ou função" required error={erros.chave}>
                  <Select options={OPCOES_CHAVE} value={form.chave || null} searchable={false} clearable={false} placeholder="Escolha" disabled={salvando} onChange={(v) => setForm((f) => ({ ...f, chave: v ?? '' }))} />
                </Field>
                <SegmentedControl aria-label="Efeito da exceção" value={form.ligado ? 'liga' : 'desliga'} options={[{ value: 'liga', label: 'Ligar' }, { value: 'desliga', label: 'Desligar' }]} onChange={(v) => setForm((f) => ({ ...f, ligado: v === 'liga' }))} />
                <Field label="Motivo" required error={erros.motivo}>
                  <Textarea rows={2} maxLength={300} value={form.motivo} disabled={salvando} onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))} />
                </Field>
                <Field label="Válida até (opcional)" hint="Sem data, vale até alguém encerrar." error={erros.validade}>
                  <Input type="date" min={hoje} value={form.validade} disabled={salvando} onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value }))} />
                </Field>
                <div><Button type="submit" loading={salvando}>Criar exceção</Button></div>
              </form>
            </section>

            {excecoes.length ? (
              <section aria-labelledby="am-d-hist">
                <h3 id="am-d-hist">Exceções deste motorista</h3>
                <ul className="am-excecoes">
                  {excecoes.map((r) => {
                    const st = statusExcecao(r, hoje)
                    return (
                      <li key={r.id}>
                        <span><strong>{rotuloChave(r.chave)}</strong> {r.ligado ? 'ligado' : 'desligado'} · <StatusBadge tone={st === 'vigente' ? 'success' : 'neutral'}>{STATUS_TEXTO[st]}</StatusBadge></span>
                        <small className="am-muted">{r.motivo}{r.validade ? ` · até ${dataCurta(r.validade)}` : ''} · criada por {r.criadoPor || '—'} em {dataHora(r.criadoEm)}{r.encerradoEm ? ` · encerrada em ${dataHora(r.encerradoEm)}` : ''}</small>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </Drawer>
      <Dialog open={sair} onClose={() => setSair(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setSair(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setSair(false); setForm(VAZIO); onClose() }}>Descartar</Button>
        </>}>
        A exceção que você começou a preencher ainda não foi criada.
      </Dialog>
    </>
  )
}

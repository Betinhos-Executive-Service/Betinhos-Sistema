import { useCallback, useEffect, useState } from 'react'
import { Alert, Button } from '@betinhos/ui'
import { acessosDe, useAcessos } from '../../../app/AcessosProvider'
import { BrandLoader } from '../../../app/BrandLoader'
import { ehAmplo, temAlgum } from '../../../app/acessos'
import { HistoricoLista, fmtQuando } from '../../acessos/components/HistoricoLista'
import { PerfisEditor, usePerfisEditor } from '../../acessos/components/PerfisEditor'
import type { Source as AcessosSource } from '../../acessos/data/source'
import { rotulos } from '../../acessos/domain/perfis'
import type { Dados, Encerrado, PerfisPessoa, Pessoa } from '../../acessos/domain/types'
import { parseAcessoError, type Etapa } from '../data/acesso'
import { EncerrarAdministrativoDialog } from './EncerrarAdministrativoDialog'

/** O que o bloco informa à ficha: alteração não salva entra na checagem de "Descartar alterações?" e salvar trava o fechamento. */
export type EstadoPerfis = { alterado: boolean; salvando: boolean }
export const PERFIS_LIVRES: EstadoPerfis = { alterado: false, salvando: false }

type Props = {
  /** E-mail Microsoft da ficha; é o elo com o usuário do sistema. */
  email: string
  source?: AcessosSource | null
  onEstado?: (estado: EstadoPerfis) => void
}

const norm = (v: string) => v.trim().toLowerCase()
const MOTIVO_AMPLO = 'Só o Administrador do Sistema encerra o acesso de quem tem acesso amplo.'
const MOTIVO_AMPLO_REATIVAR = 'Só o Administrador do Sistema reativa quem tinha acesso amplo.'

/** Resultado de uma ação que o usuário precisa ler: recusa, ou etapas puladas/com erro. */
type Nota = { tom: 'danger' | 'warning'; titulo: string; linhas: string[] }
const notaDasEtapas = (titulo: string, etapas: Etapa[]): Nota | null => {
  const linhas = etapas.filter((e) => e.estado === 'pulada' || e.estado === 'erro').map((e) => `${e.etapa}: ${e.detalhe}`)
  return linhas.length ? { tom: etapas.some((e) => e.estado === 'erro') ? 'danger' : 'warning', titulo, linhas } : null
}

/** Bloco "Acesso ao sistema" da aba Acesso: perfis da pessoa, só para quem administra acessos. Sem fonte ou sem permissão não renderiza nem lê nada. */
export function AcessoSistema({ email, source, onEstado }: Props) {
  const acessos = acessosDe(useAcessos())
  if (!source || !temAlgum(acessos, ['acessos'])) return null
  return <Bloco email={email} source={source} onEstado={onEstado} />
}

function Bloco({ email, source, onEstado }: Props & { source: AcessosSource }) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [encerrados, setEncerrados] = useState<Encerrado[]>([])
  const [nota, setNota] = useState<Nota | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const temEmail = norm(email) !== ''

  const [relendo, setRelendo] = useState(false)

  const carregar = useCallback(async () => {
    setRelendo(true)
    try {
      const [d, enc] = await Promise.all([source.load(), source.encerrados().catch(() => [] as Encerrado[])])
      setDados(d)
      setEncerrados(enc)
      setErro(null)
    } catch (reason) {
      setErro(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRelendo(false)
    }
  }, [source])

  useEffect(() => {
    if (!temEmail) return
    let vivo = true
    setDados(null)
    setEncerrados([])
    setNota(null)
    setErro(null)
    Promise.all([source.load(), source.encerrados().catch(() => [] as Encerrado[])]).then(
      ([d, enc]) => { if (vivo) { setDados(d); setEncerrados(enc) } },
      (reason) => { if (vivo) setErro(reason instanceof Error ? reason.message : String(reason)) },
    )
    return () => { vivo = false }
  }, [source, temEmail])

  const pessoa = dados?.pessoas.find((p) => norm(p.email) === norm(email)) ?? null
  const pessoaId = pessoa?.id
  // O que foi gravado entra na tela antes da releitura: se ela falhar, o editor não volta a mostrar os perfis antigos.
  const salvo = useCallback(async (perfis: PerfisPessoa) => {
    setDados((d) => (d ? { ...d, pessoas: d.pessoas.map((p) => (p.id === pessoaId ? { ...p, perfis, alteradoEm: new Date() } : p)) } : d))
    await carregar()
  }, [carregar, pessoaId])
  const encerrado = pessoa ? null : encerrados.find((e) => norm(e.email) === norm(email)) ?? null
  const tentar = <Button variant="secondary" loading={relendo} onClick={() => void carregar()}>Tentar de novo</Button>

  let corpo
  if (!temEmail) corpo = <p className="muted">Esta pessoa ainda não tem conta no sistema. Libere o acesso primeiro.</p>
  else if (dados && encerrado) {
    corpo = <EncerradoView encerrado={encerrado} dados={dados} source={source} onFeito={carregar} onNota={setNota} />
  } else if (dados && !pessoa) {
    // A conta recém-liberada pode demorar a aparecer: dá para conferir de novo sem sair da aba.
    corpo = (
      <>
        {erro ? <Alert tone="danger" title="Não foi possível carregar os perfis">{erro}</Alert> : null}
        <p className="muted">Esta pessoa ainda não tem conta no sistema. Libere o acesso primeiro.</p>
        <div className="cluster"><Button variant="secondary" loading={relendo} onClick={() => void carregar()}>Conferir de novo</Button></div>
      </>
    )
  } else if (erro && !dados) {
    corpo = <Alert tone="danger" title="Não foi possível carregar os perfis" action={tentar}>{erro}</Alert>
  } else if (!dados || !pessoa) corpo = <BrandLoader variant="inline" size="md" label="Carregando perfis" text="Carregando perfis…" />
  else {
    corpo = (
      <>
        {erro ? <Alert tone="warning" title="A última atualização falhou" action={tentar}>{erro} Os perfis e o histórico podem estar desatualizados.</Alert> : null}
        <Editor key={pessoa.id} pessoa={pessoa} dados={dados} source={source} onGravado={salvo} onEstado={onEstado} onFeito={carregar} onNota={setNota} />
      </>
    )
  }

  return (
    <section className="group acesso-bloco" aria-labelledby="acesso-sistema-titulo">
      <h3 id="acesso-sistema-titulo" className="acesso-bloco__titulo">Acesso ao sistema</h3>
      {nota ? <Alert tone={nota.tom} title={nota.titulo}><ul>{nota.linhas.map((l) => <li key={l}>{l}</li>)}</ul></Alert> : null}
      {corpo}
    </section>
  )
}

type Acao = { onFeito: () => Promise<void>; onNota: (n: Nota | null) => void }

function Editor({ pessoa, dados, source, onGravado, onEstado, onFeito, onNota }: { pessoa: Pessoa; dados: Dados; source: AcessosSource; onGravado: (perfis: PerfisPessoa) => Promise<void>; onEstado?: (estado: EstadoPerfis) => void } & Acao) {
  const viewerAdmin = acessosDe(useAcessos()).admin
  const [encerrando, setEncerrando] = useState(false)
  const amplo = pessoa.amplo || pessoa.admin
  const travado = amplo && !viewerAdmin
  const editor = usePerfisEditor({ pessoa, euId: dados.euId, source, onGravado })
  const { alterado, salvando } = editor
  useEffect(() => { onEstado?.({ alterado, salvando }) }, [alterado, salvando, onEstado])
  useEffect(() => () => onEstado?.(PERFIS_LIVRES), [onEstado])
  const daPessoa = dados.historico.filter((h) => h.usuarioId === pessoa.id)
  const perfis = rotulos(pessoa.perfis)
  const perdas = [perfis.length ? `Perfis: ${perfis.join(', ')}` : 'Nenhum perfil de área', ...(amplo ? ['Acesso amplo (Administrador do Sistema ou papel antigo)'] : []), 'O perfil básico e as equipes que dão acesso ao sistema']

  const confirmar = async (confirmacao: string) => {
    try {
      const etapas = await source.encerrar(pessoa.id, confirmacao)
      setEncerrando(false)
      onNota(notaDasEtapas('Encerrado. Etapas que não rodaram:', etapas))
      await onFeito()
    } catch (reason) {
      const e = parseAcessoError(reason)
      if (e.codigo === 'CONFIRMACAO_INVALIDA') throw reason
      setEncerrando(false)
      onNota({ tom: 'danger', titulo: 'Não foi possível encerrar o acesso', linhas: [e.message] })
    }
  }

  return (
    <>
      <PerfisEditor editor={editor} />
      {!editor.editavel ? null : (
        <div className="cluster">
          <Button disabled={!editor.podeSalvar} loading={salvando} onClick={() => void editor.salvar()}>Salvar perfis</Button>
          <Button variant="secondary" disabled={!alterado || salvando} onClick={editor.descartar}>Descartar</Button>
        </div>
      )}
      {pessoa.id === dados.euId ? null : (
        <div className="cluster">
          <Button variant="danger" disabled={travado} aria-describedby={travado ? 'encerrar-motivo' : undefined} onClick={() => { onNota(null); setEncerrando(true) }}>Encerrar acesso…</Button>
          {travado ? <span id="encerrar-motivo" className="muted">{MOTIVO_AMPLO}</span> : null}
        </div>
      )}
      {encerrando ? <EncerrarAdministrativoDialog open nome={pessoa.nome} perdas={perdas} onClose={() => setEncerrando(false)} onConfirmar={confirmar} /> : null}
      <details className="ac-historico">
        <summary>Histórico de acessos ({daPessoa.length})</summary>
        <HistoricoLista itens={daPessoa} onDevolver={editor.podeDevolver ? editor.devolver : undefined} />
      </details>
    </>
  )
}

/** Conta bloqueada pelo encerramento: quando, por quem, o que volta e o Reativar. */
function EncerradoView({ encerrado, dados, source, onFeito, onNota }: { encerrado: Encerrado; dados: Dados; source: AcessosSource } & Acao) {
  const viewerAdmin = acessosDe(useAcessos()).admin
  const [reativando, setReativando] = useState(false)
  const daPessoa = dados.historico.filter((h) => h.usuarioId === encerrado.id)
  const ultimo = daPessoa.find((h) => h.amplo?.acao === 'encerrar')
  const volta = ultimo ? rotulos(ultimo.antes) : []
  const tinhaAmplo = !!ultimo?.amplo?.papeis.some((p) => ehAmplo([p.nome]))
  const travado = tinhaAmplo && !viewerAdmin

  const reativar = async () => {
    setReativando(true)
    onNota(null)
    try {
      const etapas = await source.reativar(encerrado.id)
      onNota(notaDasEtapas('Reativado. Etapas que não rodaram:', etapas))
      await onFeito()
    } catch (reason) {
      onNota({ tom: 'danger', titulo: 'Não foi possível reativar o acesso', linhas: [parseAcessoError(reason).message] })
    } finally {
      setReativando(false)
    }
  }

  return (
    <>
      <Alert tone="warning" title={`Acesso encerrado em ${fmtQuando(encerrado.encerradoEm)} por ${encerrado.encerradoPor}`}>Peça à TI para desativar a conta Microsoft.</Alert>
      {volta.length ? <p className="muted">Volta com: {volta.join(', ')}.</p> : null}
      <div className="cluster">
        <Button loading={reativando} disabled={travado || reativando} aria-describedby={travado ? 'reativar-motivo' : undefined} onClick={() => void reativar()}>Reativar com os perfis anteriores</Button>
        {travado ? <span id="reativar-motivo" className="muted">{MOTIVO_AMPLO_REATIVAR}</span> : null}
      </div>
      <details className="ac-historico">
        <summary>Histórico de acessos ({daPessoa.length})</summary>
        <HistoricoLista itens={daPessoa} />
      </details>
    </>
  )
}

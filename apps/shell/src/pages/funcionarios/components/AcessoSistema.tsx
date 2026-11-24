import { useCallback, useEffect, useState } from 'react'
import { Alert, Button } from '@betinhos/ui'
import { acessosDe, useAcessos } from '../../../app/AcessosProvider'
import { BrandLoader } from '../../../app/BrandLoader'
import { temAlgum } from '../../../app/acessos'
import { HistoricoLista } from '../../acessos/components/HistoricoLista'
import { PerfisEditor, usePerfisEditor } from '../../acessos/components/PerfisEditor'
import type { Source as AcessosSource } from '../../acessos/data/source'
import type { Dados, PerfisPessoa, Pessoa } from '../../acessos/domain/types'

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

/** Bloco "Acesso ao sistema" da aba Acesso: perfis da pessoa, só para quem administra acessos. Sem fonte ou sem permissão não renderiza nem lê nada. */
export function AcessoSistema({ email, source, onEstado }: Props) {
  const acessos = acessosDe(useAcessos())
  if (!source || !temAlgum(acessos, ['acessos'])) return null
  return <Bloco email={email} source={source} onEstado={onEstado} />
}

function Bloco({ email, source, onEstado }: Props & { source: AcessosSource }) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const temEmail = norm(email) !== ''

  const [relendo, setRelendo] = useState(false)

  const carregar = useCallback(async () => {
    setRelendo(true)
    try {
      setDados(await source.load())
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
    setErro(null)
    source.load().then(
      (d) => { if (vivo) setDados(d) },
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
  const tentar = <Button variant="secondary" loading={relendo} onClick={() => void carregar()}>Tentar de novo</Button>

  let corpo
  if (!temEmail) corpo = <p className="muted">Esta pessoa ainda não tem conta no sistema. Libere o acesso primeiro.</p>
  else if (dados && !pessoa) {
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
        <Editor key={pessoa.id} pessoa={pessoa} dados={dados} source={source} onSaved={salvo} onEstado={onEstado} />
      </>
    )
  }

  return (
    <section className="group acesso-bloco" aria-labelledby="acesso-sistema-titulo">
      <h3 id="acesso-sistema-titulo" className="acesso-bloco__titulo">Acesso ao sistema</h3>
      {corpo}
    </section>
  )
}

function Editor({ pessoa, dados, source, onSaved, onEstado }: { pessoa: Pessoa; dados: Dados; source: AcessosSource; onSaved: (perfis: PerfisPessoa) => Promise<void>; onEstado?: (estado: EstadoPerfis) => void }) {
  const editor = usePerfisEditor({ pessoa, euId: dados.euId, source, onSaved })
  const { alterado, salvando } = editor
  useEffect(() => { onEstado?.({ alterado, salvando }) }, [alterado, salvando, onEstado])
  useEffect(() => () => onEstado?.(PERFIS_LIVRES), [onEstado])
  const daPessoa = dados.historico.filter((h) => h.usuarioId === pessoa.id)

  return (
    <>
      <PerfisEditor editor={editor} />
      {editor.somenteLeitura ? null : (
        <div className="cluster">
          <Button disabled={!alterado} loading={salvando} onClick={() => void editor.salvar()}>Salvar perfis</Button>
          <Button variant="secondary" disabled={!alterado || salvando} onClick={editor.descartar}>Descartar</Button>
        </div>
      )}
      <details className="ac-historico">
        <summary>Histórico de acessos ({daPessoa.length})</summary>
        <HistoricoLista itens={daPessoa} />
      </details>
    </>
  )
}

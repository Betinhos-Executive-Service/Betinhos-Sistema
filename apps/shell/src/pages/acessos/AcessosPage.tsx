import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Drawer, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, buttonClassName, useShellHeader } from '@betinhos/ui'
import { ArrowLeft, History, RefreshCw, SearchX, UsersRound } from 'lucide-react'
import type { Host } from '../../host'
import { listCache } from '../../app/listCache'
import { SearchHits } from '../../app/SearchHits'
import { keywordIndex, searchWords, useDebouncedText } from '../../app/search'
import { filterRows } from '../../app/filterRows'
import { useListView } from '../../app/useListView'
import { useProgressiveData } from '../../app/useProgressiveData'
import { useQueryAlvo, useQueryTexto } from '../../nav/queryState'
import { hrefFor } from '../../nav/useHashRoute'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { PESSOA_COLUMNS, TELA, builtinViews, pessoaFields, pessoaKeywordText, readPessoa, sortPessoas } from './domain/lista'
import type { Dados, PerfisPessoa, Pessoa } from './domain/types'
import { AcessosCards, AcessosTable } from './components/AcessosList'
import { AcessoDrawer } from './components/AcessoDrawer'
import { HistoricoLista } from './components/HistoricoLista'
import './acessos.css'

export function AcessosPage({ host }: { host: Host }) {
  return <ToastProvider><Acessos host={host} /></ToastProvider>
}

const EMPTY: Pessoa[] = []
const VOLTAR = hrefFor('funcionarios')
const FIELDS = pessoaFields()

function Acessos({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const load = useCallback(async () => source.load(), [source])
  const cs = useProgressiveData<Dados>({ cache: listCache(host), key: 'acessos', load })
  // Quem tem ficha é editado na aba Acesso da ficha; aqui ficam só as contas sem ficha de funcionário.
  const list = useMemo(() => cs.data?.pessoas.filter((p) => !p.temFicha) ?? EMPTY, [cs.data])
  const ready = cs.data != null

  const [query, setQuery] = useQueryTexto('q')
  const [target, setTarget] = useQueryAlvo()
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const q = useDebouncedText(query)

  const { view, filters: valid, quickFilters, clearFilters, fields: allFields } = useListView({
    host, defaultName: 'Acessos sem ficha', tela: TELA, columns: PESSOA_COLUMNS, defaultSort: { key: 'nome', dir: 'asc' }, fields: FIELDS, ready, builtins: builtinViews,
  })

  const sorted = useMemo(() => {
    const sort = view.config.sort
    return sort ? sortPessoas(list, sort.key, sort.dir) : list
  }, [list, view.config.sort])
  const filtered = useMemo(() => filterRows(sorted, valid, allFields, readPessoa), [sorted, valid, allFields])
  const index = useMemo(() => keywordIndex<Pessoa>(pessoaKeywordText), [])
  const words = useMemo(() => searchWords(q), [q])
  const visible = useMemo(() => (words.length ? filtered.filter((p) => index.matches(p, words)) : filtered), [filtered, index, words])

  const refresh = useCallback(() => { void cs.reload() }, [cs.reload])
  useShellHeader({ title: 'Acessos sem ficha' })
  const size = mobile ? 'touch' : 'default'
  const clearAll = () => { clearFilters(); setQuery('') }
  const open = (id: string) => setTarget({ mode: 'view', id })
  const aberta = target && target.mode !== 'create' ? list.find((p) => p.id === target.id) ?? null : null
  // Link antigo de alguém que hoje tem ficha (ou que saiu da lista): depois da carga, o endereço deixa de apontar para uma gaveta que não abre.
  const alvoPerdido = ready && !cs.loading && target != null && !aberta
  useEffect(() => { if (alvoPerdido) setTarget(null) }, [alvoPerdido, setTarget])
  const gravado = (perfis: PerfisPessoa, devolveuAmplo: boolean) => {
    if (devolveuAmplo) { refresh(); return }
    const id = target && target.mode !== 'create' ? target.id : null
    const quando = new Date()
    if (id) cs.mutate((d) => ({ ...d, pessoas: d.pessoas.map((p) => (p.id === id ? { ...p, perfis, alteradoEm: quando } : p)) }))
    setTarget(null)
    refresh()
  }

  let body
  if (cs.error && !ready) {
    body = <Alert tone="danger" title="Não foi possível carregar os acessos" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{cs.error}</Alert>
  } else if (!ready) {
    body = <AcessosTable list={[]} onOpen={() => undefined} loading />
  } else if (!list.length) {
    body = (
      <EmptyState className="surface" align="start" icon={<UsersRound size={36} />} title="Todas as pessoas com conta têm ficha de funcionário"
        action={<a className={buttonClassName({ variant: 'secondary' })} href={VOLTAR}>Abrir Funcionários</a>}>
        Os perfis delas são editados na aba Acesso da ficha. Contas sem ficha aparecem aqui.
      </EmptyState>
    )
  } else {
    const footer = <span className="ac-num">{visible.length} de {list.length}</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhuma pessoa com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = mobile
      ? (visible.length ? <AcessosCards list={visible} onOpen={open} /> : <div className="surface">{empty}</div>)
      : <AcessosTable list={visible} onOpen={open} view={{ config: view.config, onChange: view.setConfig, density: view.density, pinnable: true }} quickFilters={quickFilters} footer={footer} empty={empty} />
  }

  return (
    <div className="page page--full ac-page">
      <div role="toolbar" aria-label="Comandos de acessos">
        <ViewBar pinnable view={view} columns={PESSOA_COLUMNS} filters={ready ? { fields: allFields } : undefined}
          search={<SearchBox size={size} value={query} onChange={setQuery} placeholder="Buscar por nome, e-mail ou perfil" aria-label="Buscar pessoas" />}
          primary={<>
            <a className={buttonClassName({ variant: 'secondary', size })} href={VOLTAR}><ArrowLeft size={16} aria-hidden /> Funcionários</a>
            <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={cs.loading && ready} onClick={refresh} />
            <Button variant="secondary" size={size} icon={<History size={16} />} disabled={!ready} onClick={() => setHistoricoAberto(true)}>Histórico</Button>
          </>}>
          {source.mock && !mobile ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
        </ViewBar>
      </div>
      {cs.error && ready ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{cs.error} A lista mostra os dados da carga anterior.</Alert> : null}
      <SearchHits tokens={words}>{body}</SearchHits>
      {cs.data ? <AcessoDrawer pessoa={aberta} euId={cs.data.euId} historico={cs.data.historico} source={source} onClose={() => setTarget(null)} onGravado={gravado} /> : null}
      <Drawer open={historicoAberto} onClose={() => setHistoricoAberto(false)} size="wide" eyebrow="Acessos" title="Histórico de acessos">
        {historicoAberto ? <HistoricoLista itens={cs.data?.historico ?? []} comPessoa /> : null}
      </Drawer>
    </div>
  )
}

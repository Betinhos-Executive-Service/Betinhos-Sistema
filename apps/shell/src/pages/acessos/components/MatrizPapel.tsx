import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, EmptyState, buttonClassName, SearchBox, StatusBadge, useShellHeader, type TableColumn } from '@betinhos/ui'
import { ArrowLeft, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../../host'
import { listCache } from '../../../app/listCache'
import { ListTable } from '../../../app/ListTable'
import { AREAS, AREA_LABEL } from '../../../app/acessos'
import { useProgressiveData } from '../../../app/useProgressiveData'
import { useQueryTexto } from '../../../nav/queryState'
import { hrefFor } from '../../../nav/useHashRoute'
import { useMedia } from '../../operacional/useMedia'
import { createSource } from '../data/source'
import { CHIPS_MATRIZ, contagens, destinoDaLinha, destinoDoEncerrado, ehChip, filtrarEncerrados, filtrarLinhas, linhasDaMatriz, textoEncerrado, type LinhaMatriz } from '../domain/matriz'
import type { Dados, Encerrado } from '../domain/types'

const SEM_ENCERRADOS: Encerrado[] = []
const ir = (href: string | null) => { if (href) location.hash = href }
const Nivel = ({ valor }: { valor: string }) => (valor === '—' ? <span className="ac-vazio">—</span> : <StatusBadge tone={valor === 'Gestor' ? 'info' : 'neutral'}>{valor}</StatusBadge>)
const Tem = ({ tem }: { tem: boolean }) => (tem ? <StatusBadge tone="warning">Tem</StatusBadge> : <span className="ac-vazio">—</span>)

const COLUNAS: TableColumn<LinhaMatriz>[] = [
  { key: 'nome', header: 'Pessoa', label: 'Pessoa', defaultWidth: 240, width: 'minmax(180px, 1.4fr)', cell: (l) => <span className="ac-pessoa"><strong>{l.nome || 'Sem nome'}</strong><span className="ac-card__meta">{l.email}</span></span> },
  ...AREAS.map((a): TableColumn<LinhaMatriz> => ({ key: a, header: AREA_LABEL[a], label: AREA_LABEL[a], defaultWidth: 120, width: 'minmax(96px, .6fr)', cell: (l) => <Nivel valor={l.areas[a]} /> })),
  { key: 'acessos', header: 'Admin acessos', label: 'Admin acessos', defaultWidth: 130, width: 'minmax(110px, .6fr)', cell: (l) => <Tem tem={l.adminAcessos} /> },
  { key: 'amplo', header: 'Amplo', label: 'Amplo', defaultWidth: 100, width: 'minmax(80px, .5fr)', cell: (l) => <Tem tem={l.amplo} /> },
]
const COLUNAS_ENCERRADOS: TableColumn<Encerrado>[] = [
  { key: 'nome', header: 'Pessoa', label: 'Pessoa', defaultWidth: 260, width: 'minmax(180px, 1.2fr)', cell: (e) => <span className="ac-pessoa"><strong>{e.nome || 'Sem nome'}</strong><span className="ac-card__meta">{e.email}</span></span> },
  { key: 'quando', header: 'Encerramento', label: 'Encerramento', defaultWidth: 320, width: 'minmax(220px, 1.6fr)', cell: (e) => textoEncerrado(e) },
  { key: 'ficha', header: 'Ficha', label: 'Ficha', defaultWidth: 120, width: 'minmax(90px, .5fr)', cell: (e) => (e.fichaId ? 'Abrir ficha' : <span className="ac-vazio">Sem ficha</span>) },
]

/** Visão `#/acessos?visao=papel`: quem tem cada perfil, numa matriz pessoa × área. */
export function MatrizPapel({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const load = useCallback(async () => source.load(), [source])
  const cs = useProgressiveData<Dados>({ cache: listCache(host), key: 'acessos', load })
  const [encerrados, setEncerrados] = useState<Encerrado[] | null>(null)
  const [erroEncerrados, setErroEncerrados] = useState<string | null>(null)
  const leitura = useRef(0)
  const carregarEncerrados = useCallback(() => {
    const minha = ++leitura.current
    setErroEncerrados(null)
    source.encerrados().then(
      (r) => { if (minha === leitura.current) setEncerrados(r) },
      (e: unknown) => { if (minha === leitura.current) setErroEncerrados(e instanceof Error ? e.message : 'Falha ao ler os encerrados.') },
    )
  }, [source])
  useEffect(carregarEncerrados, [carregarEncerrados])

  const [chipUrl, setChip] = useQueryTexto('filtro')
  const chip = ehChip(chipUrl) ? chipUrl : 'todos'
  const [busca, setBusca] = useQueryTexto('q')
  const size = mobile ? 'touch' : 'default'
  const ready = cs.data != null
  const linhas = useMemo(() => linhasDaMatriz(cs.data?.pessoas ?? []), [cs.data])
  const lista = encerrados ?? SEM_ENCERRADOS
  const n = useMemo(() => contagens(linhas, lista), [linhas, lista])
  const visiveis = useMemo(() => filtrarLinhas(linhas, chip, busca), [linhas, chip, busca])
  const encerradosVisiveis = useMemo(() => filtrarEncerrados(lista, busca), [lista, busca])
  const refresh = () => { void cs.reload(); carregarEncerrados() }
  useShellHeader({ title: 'Acessos por papel' })
  const limpar = () => { setBusca(''); setChip('todos') }
  const vazio = <EmptyState align="start" icon={<SearchX size={36} />} title="Ninguém com este filtro" action={<Button variant="secondary" onClick={limpar}>Limpar filtros</Button>} />

  let corpo
  if (cs.error && !ready) {
    corpo = <Alert tone="danger" title="Não foi possível carregar os acessos" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{cs.error}</Alert>
  } else if (chip === 'encerrados') {
    if (erroEncerrados) corpo = <Alert tone="danger" title="Não foi possível carregar os encerrados" action={<Button variant="secondary" onClick={carregarEncerrados}>Tentar de novo</Button>}>{erroEncerrados}</Alert>
    else if (mobile) {
      corpo = encerrados == null ? null : encerradosVisiveis.length ? (
        <ul className="ac-cards" aria-label="Encerrados">
          {encerradosVisiveis.map((e) => (
            <li key={e.id} className="ac-card">
              <button type="button" className="ac-card__open" disabled={!e.fichaId} onClick={() => ir(destinoDoEncerrado(e))}>
                <strong className="ac-card__name">{e.nome || 'Sem nome'}</strong>
                <span className="ac-card__meta">{e.email}</span>
              </button>
              <span className="ac-vazio">{textoEncerrado(e)}</span>
            </li>
          ))}
        </ul>
      ) : <div className="surface">{vazio}</div>
    } else corpo = <ListTable className="ac-table" columns={COLUNAS_ENCERRADOS} rows={encerradosVisiveis} rowKey={(e) => e.id} loading={encerrados == null} loadingLabel="Carregando encerrados" onRowClick={(e) => ir(destinoDoEncerrado(e))} empty={vazio} />
  } else if (mobile) {
    corpo = !ready ? null : visiveis.length ? (
      <ul className="ac-cards" aria-label="Pessoas">
        {visiveis.map((l) => (
          <li key={l.id} className="ac-card">
            <button type="button" className="ac-card__open" onClick={() => ir(destinoDaLinha(l))}>
              <strong className="ac-card__name">{l.nome || 'Sem nome'}</strong>
              <span className="ac-card__meta">{l.email}</span>
            </button>
            <span className="ac-chips">
              {AREAS.filter((a) => l.areas[a] !== '—').map((a) => <StatusBadge key={a} tone={l.areas[a] === 'Gestor' ? 'info' : 'neutral'}>{AREA_LABEL[a]}: {l.areas[a]}</StatusBadge>)}
              {l.adminAcessos ? <StatusBadge tone="warning">Admin acessos</StatusBadge> : null}
              {l.amplo ? <StatusBadge tone="warning">Amplo</StatusBadge> : null}
              {l.soBase ? <span className="ac-vazio">Só o Base</span> : null}
            </span>
          </li>
        ))}
      </ul>
    ) : <div className="surface">{vazio}</div>
  } else {
    corpo = <ListTable className="ac-table" columns={COLUNAS} rows={visiveis} rowKey={(l) => l.id} loading={!ready} loadingLabel="Carregando pessoas" onRowClick={(l) => ir(destinoDaLinha(l))} empty={vazio} footer={<span className="ac-num">{visiveis.length} de {linhas.length}</span>} />
  }

  return (
    <div className="page page--full ac-page">
      <div role="toolbar" aria-label="Comandos de acessos por papel" className="ac-barra">
        <a className={buttonClassName({ variant: 'secondary', size })} href={hrefFor('funcionarios')}><ArrowLeft size={16} aria-hidden /> Funcionários</a>
        <SearchBox size={size} value={busca} onChange={setBusca} placeholder="Buscar por nome ou e-mail" aria-label="Buscar pessoas" />
        <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={cs.loading && ready} onClick={refresh} />
        {source.mock && !mobile ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
      </div>
      <div className="ac-filtros" role="group" aria-label="Filtro por situação">
        {CHIPS_MATRIZ.map((c) => (
          <button key={c.key} type="button" className="ac-filtro" aria-pressed={chip === c.key} onClick={() => setChip(c.key === 'todos' ? '' : c.key)}>
            {c.label}<strong>{(c.key === 'encerrados' ? encerrados != null : ready) ? n[c.key] : '…'}</strong>
          </button>
        ))}
      </div>
      {cs.error && ready ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{cs.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {corpo}
    </div>
  )
}

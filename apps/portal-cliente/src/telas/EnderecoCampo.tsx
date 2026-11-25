import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BedDouble, Building2, Bus, History, MapPin, Plane, TrainFront } from 'lucide-react'
import { useApi } from '../api/ApiContext'
import { MAX_ENDERECO, textoDoEndereco } from '../domain/pedidos'
import type { EnderecoSugerido, TipoLocal } from '../domain/types'

const ESPERA_MS = 250
const MIN_BUSCA = 3
const MAX_RECENTES = 4
const MAX_OPCOES = 6

type Opcao = { chave: string; texto: string; tipo: 'recente' | 'poi' | 'rua' | TipoLocal }

const ICONES = { recente: History, poi: Building2, rua: MapPin, aeroporto: Plane, hotel: BedDouble, rodoviaria: Bus, estacao: TrainFront }

type Props = {
  id: string
  value: string
  onChange: (texto: string) => void
  /** Endereços de pedidos anteriores, mostrados primeiro. */
  recentes: string[]
  placeholder?: string
  invalid?: boolean
  describedBy?: string
}

/** Destaca em negrito a parte digitada; o texto continua o mesmo para quem lê a opção. */
function comDestaque(texto: string, consulta: string) {
  const i = consulta ? texto.toLowerCase().indexOf(consulta.toLowerCase()) : -1
  if (i < 0) return texto
  return <>{texto.slice(0, i)}<b>{texto.slice(i, i + consulta.length)}</b>{texto.slice(i + consulta.length)}</>
}

/** Campo de endereço com sugestões (combobox ARIA 1.2): texto livre sempre vale; escolher uma sugestão só preenche o mesmo campo. */
export function EnderecoCampo({ id, value, onChange, recentes, placeholder, invalid, describedBy }: Props) {
  const api = useApi()
  const idLista = `${useId()}-lista`
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const [sugestoes, setSugestoes] = useState<EnderecoSugerido[]>([])
  const [buscando, setBuscando] = useState(false)

  // Sugestões remotas: só com o campo aberto e 3+ letras; cada tecla cancela a busca anterior.
  const consulta = value.trim()
  useEffect(() => {
    if (!aberto || consulta.length < MIN_BUSCA) { setSugestoes([]); setBuscando(false); return }
    // O carregando começa já na tecla (cobre a espera), para o campo nunca parecer parado.
    setBuscando(true)
    const controle = new AbortController()
    const t = setTimeout(() => {
      api.buscarEnderecos(consulta, controle.signal).then(
        (r) => { if (!controle.signal.aborted) setSugestoes(r) },
        () => { if (!controle.signal.aborted) setSugestoes([]) },
      ).finally(() => { if (!controle.signal.aborted) setBuscando(false) })
    }, ESPERA_MS)
    return () => { clearTimeout(t); controle.abort() }
  }, [api, aberto, consulta])

  const opcoes = useMemo<Opcao[]>(() => {
    const q = consulta.toLowerCase()
    const doHistorico = recentes
      .filter((e) => e.toLowerCase() !== q && (!q || e.toLowerCase().includes(q)))
      .slice(0, MAX_RECENTES)
      .map<Opcao>((e) => ({ chave: `r:${e}`, texto: e, tipo: 'recente' }))
    const remotas = sugestoes
      .map<Opcao>((s) => ({
        chave: `s:${s.rotulo}|${s.endereco}`,
        texto: textoDoEndereco(s),
        tipo: s.tipo ?? (s.endereco.toLowerCase().includes(s.rotulo.toLowerCase()) ? 'rua' : 'poi'),
      }))
      .filter((o) => !doHistorico.some((h) => h.texto.toLowerCase() === o.texto.toLowerCase()))
    return [...doHistorico, ...remotas].slice(0, MAX_OPCOES)
  }, [consulta, recentes, sugestoes])

  const mostrando = aberto && (opcoes.length > 0 || buscando)
  // Ao fechar, a lista mantém as últimas opções enquanto some, para a saída não piscar vazia.
  const ultimas = useRef<Opcao[]>([])
  if (mostrando) ultimas.current = opcoes
  const exibidas = mostrando ? opcoes : ultimas.current
  const refAtivo = useRef<HTMLLIElement>(null)
  useEffect(() => { refAtivo.current?.scrollIntoView?.({ block: 'nearest' }) }, [ativo])

  const escolher = (o: Opcao) => { onChange(o.texto.slice(0, MAX_ENDERECO)); setAberto(false); setAtivo(-1) }
  const idOpcao = (i: number) => `${idLista}-${i}`

  function teclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!opcoes.length) return
      e.preventDefault()
      if (!aberto) { setAberto(true); setAtivo(e.key === 'ArrowDown' ? 0 : opcoes.length - 1); return }
      const passo = e.key === 'ArrowDown' ? 1 : -1
      setAtivo((a) => (a + passo + opcoes.length) % opcoes.length)
    } else if (e.key === 'Enter') {
      // Com uma opção destacada, Enter a escolhe; sem ela, não faz nada (o passo só avança pelo botão).
      if (mostrando && ativo >= 0 && opcoes[ativo]) { e.preventDefault(); escolher(opcoes[ativo]) }
    } else if (e.key === 'Escape') {
      if (aberto) { e.preventDefault(); e.stopPropagation(); setAberto(false); setAtivo(-1) }
    } else if (e.key === 'Tab') {
      // Tab (ou Shift+Tab) aceita a opção destacada e deixa o foco seguir para o próximo campo.
      if (mostrando && ativo >= 0 && opcoes[ativo]) escolher(opcoes[ativo])
      else { setAberto(false); setAtivo(-1) }
    }
  }

  const recentesVisiveis = exibidas.filter((o) => o.tipo === 'recente')
  const remotasVisiveis = exibidas.filter((o) => o.tipo !== 'recente')
  const linha = (o: Opcao) => {
    const i = exibidas.indexOf(o)
    const Icone = ICONES[o.tipo]
    return (
      <li
        key={o.chave}
        id={idOpcao(i)}
        ref={i === ativo ? refAtivo : undefined}
        role="option"
        aria-selected={i === ativo}
        className={`pc-pp__opcao${o.tipo === 'recente' ? '' : ' pc-pp__opcao--remota'}${i === ativo ? ' pc-pp__opcao--ativa' : ''}`}
        style={{ '--i': i } as React.CSSProperties}
        // mouseDown (e não click) com preventDefault: o campo não perde o foco antes da escolha.
        onMouseDown={(ev) => { ev.preventDefault(); escolher(o) }}
        onMouseMove={() => { if (ativo !== i) setAtivo(i) }}
      >
        <span className="pc-pp__opcao-icone" data-tipo={o.tipo} aria-hidden><Icone size={15} /></span>
        <span className="pc-pp__opcao-texto">{comDestaque(o.texto, consulta)}</span>
      </li>
    )
  }

  return (
    <div className="pc-pp__combo">
      <input
        id={id}
        role="combobox"
        aria-expanded={mostrando}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={mostrando && ativo >= 0 ? idOpcao(ativo) : undefined}
        aria-required
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        aria-busy={buscando || undefined}
        value={value}
        placeholder={placeholder}
        maxLength={MAX_ENDERECO}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setAberto(true); setAtivo(-1) }}
        onFocus={() => setAberto(true)}
        onBlur={() => { setAberto(false); setAtivo(-1) }}
        onKeyDown={teclar}
      />
      <span role="status" className="pc-pp__sr">{mostrando && buscando ? 'Buscando endereços…' : ''}</span>
      <ul
        id={idLista}
        role="listbox"
        aria-label="Sugestões de endereço"
        aria-hidden={mostrando ? undefined : true}
        className={`pc-pp__lista${mostrando ? ' pc-pp__lista--aberta' : ''}${buscando ? ' pc-pp__lista--buscando' : ''}`}
      >
        {recentesVisiveis.length > 0 && <li role="presentation" className="pc-pp__grupo">Recentes</li>}
        {recentesVisiveis.map(linha)}
        {(remotasVisiveis.length > 0 || buscando) && (
          <li role="presentation" className="pc-pp__grupo">
            Sugestões
            {buscando && <span className="pc-pp__grupo-status" aria-hidden><span className="pc-pp__giro" />Buscando</span>}
          </li>
        )}
        {remotasVisiveis.map(linha)}
        {/* Sem sugestões ainda: linhas fantasma no lugar delas, no mesmo tamanho, para a lista não pular. */}
        {buscando && remotasVisiveis.length === 0 && [72, 52, 64].map((w, i) => (
          <li key={`esq-${i}`} role="presentation" aria-hidden className="pc-pp__esqueleto" style={{ '--w': `${w}%`, '--i': i } as React.CSSProperties}>
            <span className="pc-pp__esqueleto-icone" /><span className="pc-pp__esqueleto-barra" />
          </li>
        ))}
      </ul>
    </div>
  )
}

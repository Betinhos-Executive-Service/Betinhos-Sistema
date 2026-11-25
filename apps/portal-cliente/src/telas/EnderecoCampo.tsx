import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BedDouble, Building2, Bus, History, MapPin, Plane, TrainFront, UserRound, X } from 'lucide-react'
import { useApi } from '../api/ApiContext'
import { MAX_ENDERECO, textoDoEndereco } from '../domain/pedidos'
import type { EnderecoSugerido, TipoLocal } from '../domain/types'

const ESPERA_MS = 250
const MIN_BUSCA = 3
const MAX_RECENTES = 4
const MAX_OPCOES = 6

type Opcao = { chave: string; texto: string; tipo: 'padrao' | 'recente' | 'poi' | 'rua' | TipoLocal; rotulo?: string }

export const ICONES = { padrao: UserRound, recente: History, poi: Building2, rua: MapPin, aeroporto: Plane, hotel: BedDouble, rodoviaria: Bus, estacao: TrainFront }

type Escolha = { texto: string; titulo: string; resto: string; tipo: Opcao['tipo'] }

/** Divide o endereço em nome (rua e número, ou o local) e o resto (bairro, cidade). */
export function partesDoEndereco(texto: string): { titulo: string; resto: string } {
  const p = texto.split(',').map((t) => t.trim()).filter(Boolean)
  const n = p.length > 1 && /^\d/.test(p[1]) ? 2 : 1
  return { titulo: p.slice(0, n).join(', ') || texto.trim(), resto: p.slice(n).join(', ') }
}

type Props = {
  id: string
  value: string
  onChange: (texto: string) => void
  /** Endereços padrão dos passageiros do pedido, no topo das sugestões. */
  padroes?: string[]
  /** Endereços de pedidos anteriores. */
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
export function EnderecoCampo({ id, value, onChange, padroes = [], recentes, placeholder, invalid, describedBy }: Props) {
  const api = useApi()
  const idLista = `${useId()}-lista`
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const [sugestoes, setSugestoes] = useState<EnderecoSugerido[]>([])
  const [buscando, setBuscando] = useState(false)
  const [focado, setFocado] = useState(false)
  const [escolha, setEscolha] = useState<Escolha | null>(null)
  const refInput = useRef<HTMLInputElement>(null)

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
    const cabe = (e: string) => e.toLowerCase() !== q && (!q || e.toLowerCase().includes(q))
    // Campo ainda com o padrão de um passageiro (não digitado): mostra os padrões dos outros, sem filtrar pelo texto.
    const intacto = padroes.some((e) => e.toLowerCase() === q)
    const doPassageiro = padroes.filter((e) => (intacto ? e.toLowerCase() !== q : cabe(e))).map<Opcao>((e) => ({ chave: `p:${e}`, texto: e, tipo: 'padrao' }))
    const doHistorico = recentes
      .filter((e) => cabe(e) && !doPassageiro.some((p) => p.texto.toLowerCase() === e.toLowerCase()))
      .slice(0, MAX_RECENTES)
      .map<Opcao>((e) => ({ chave: `r:${e}`, texto: e, tipo: 'recente' }))
    const remotas = sugestoes
      .map<Opcao>((s) => ({
        chave: `s:${s.rotulo}|${s.endereco}`,
        texto: textoDoEndereco(s),
        rotulo: s.rotulo,
        tipo: s.tipo ?? (s.endereco.toLowerCase().includes(s.rotulo.toLowerCase()) ? 'rua' : 'poi'),
      }))
      .filter((o) => ![...doPassageiro, ...doHistorico].some((h) => h.texto.toLowerCase() === o.texto.toLowerCase()))
    return [...doPassageiro, ...doHistorico, ...remotas].slice(0, MAX_OPCOES)
  }, [consulta, padroes, recentes, sugestoes])

  const mostrando = aberto && (opcoes.length > 0 || buscando)
  // Ao fechar, a lista mantém as últimas opções enquanto some, para a saída não piscar vazia.
  const ultimas = useRef<Opcao[]>([])
  if (mostrando) ultimas.current = opcoes
  const exibidas = mostrando ? opcoes : ultimas.current
  const refAtivo = useRef<HTMLLIElement>(null)
  useEffect(() => { refAtivo.current?.scrollIntoView?.({ block: 'nearest' }) }, [ativo])

  const escolher = (o: Opcao) => {
    const texto = o.texto.slice(0, MAX_ENDERECO)
    // Local com nome (hotel, aeroporto, empresa): o nome vem da sugestão e o resto é o endereço dele.
    const partes = o.rotulo && o.tipo !== 'rua' && texto.startsWith(o.rotulo)
      ? { titulo: o.rotulo, resto: texto.slice(o.rotulo.length).replace(/^,\s*/, '') }
      : partesDoEndereco(texto)
    setEscolha({ texto, ...partes, tipo: o.tipo === 'recente' || o.tipo === 'padrao' ? 'rua' : o.tipo })
    onChange(texto); setAberto(false); setAtivo(-1)
  }
  // Fora de foco e preenchido: o campo mostra o local em duas linhas (nome e resto); tocar volta ao texto.
  const exibir = !focado && value.trim() !== ''
  const vista: Escolha = escolha?.texto === value ? escolha : { texto: value, ...partesDoEndereco(value), tipo: 'rua' }
  const IconeVista = ICONES[vista.tipo]
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

  const padroesVisiveis = exibidas.filter((o) => o.tipo === 'padrao')
  const recentesVisiveis = exibidas.filter((o) => o.tipo === 'recente')
  const remotasVisiveis = exibidas.filter((o) => o.tipo !== 'recente' && o.tipo !== 'padrao')
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
        className={`pc-pp__opcao${o.tipo === 'recente' || o.tipo === 'padrao' ? '' : ' pc-pp__opcao--remota'}${i === ativo ? ' pc-pp__opcao--ativa' : ''}`}
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
    <div className={`pc-pp__combo${exibir ? ' pc-pp__combo--exibindo' : ''}`}>
      {exibir && (
        <div className="pc-pp__vista" aria-hidden>
          <span className="pc-pp__opcao-icone" data-tipo={vista.tipo}><IconeVista size={15} /></span>
          <span className="pc-pp__vista-texto">
            <span className="pc-pp__vista-titulo">{vista.titulo}</span>
            {vista.resto && <span className="pc-pp__vista-resto">{vista.resto}</span>}
          </span>
        </div>
      )}
      {exibir && (
        <button type="button" className="pc-pp__limpar" aria-label="Limpar endereço" onClick={() => { onChange(''); setEscolha(null); refInput.current?.focus() }}>
          <X size={14} aria-hidden />
        </button>
      )}
      <input
        ref={refInput}
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
        onFocus={() => { setFocado(true); setAberto(true) }}
        onBlur={() => { setFocado(false); setAberto(false); setAtivo(-1) }}
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
        {padroesVisiveis.length > 0 && <li role="presentation" className="pc-pp__grupo">Do passageiro</li>}
        {padroesVisiveis.map(linha)}
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

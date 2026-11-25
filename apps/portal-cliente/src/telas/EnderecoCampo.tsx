import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Building2, History, MapPin } from 'lucide-react'
import { useApi } from '../api/ApiContext'
import { MAX_ENDERECO, textoDoEndereco } from '../domain/pedidos'
import type { EnderecoSugerido } from '../domain/types'

const ESPERA_MS = 250
const MIN_BUSCA = 3
const MAX_RECENTES = 4

type Opcao = { chave: string; texto: string; tipo: 'recente' | 'poi' | 'rua' }

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

/** Campo de endereço com sugestões (combobox ARIA 1.2): texto livre sempre vale; escolher uma sugestão só preenche o mesmo campo. */
export function EnderecoCampo({ id, value, onChange, recentes, placeholder, invalid, describedBy }: Props) {
  const api = useApi()
  const idLista = `${useId()}-lista`
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const [sugestoes, setSugestoes] = useState<EnderecoSugerido[]>([])

  // Sugestões remotas: só com o campo aberto e 3+ letras; cada tecla cancela a busca anterior.
  const consulta = value.trim()
  useEffect(() => {
    if (!aberto || consulta.length < MIN_BUSCA) { setSugestoes([]); return }
    const controle = new AbortController()
    const t = setTimeout(() => {
      api.buscarEnderecos(consulta, controle.signal).then(
        (r) => { if (!controle.signal.aborted) setSugestoes(r) },
        () => { if (!controle.signal.aborted) setSugestoes([]) },
      )
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
        tipo: s.endereco.toLowerCase().includes(s.rotulo.toLowerCase()) ? 'rua' : 'poi',
      }))
      .filter((o) => !doHistorico.some((h) => h.texto.toLowerCase() === o.texto.toLowerCase()))
    return [...doHistorico, ...remotas]
  }, [consulta, recentes, sugestoes])

  const mostrando = aberto && opcoes.length > 0
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
      setAberto(false)
    }
  }

  const recentesVisiveis = opcoes.filter((o) => o.tipo === 'recente')
  const remotasVisiveis = opcoes.filter((o) => o.tipo !== 'recente')
  const linha = (o: Opcao) => {
    const i = opcoes.indexOf(o)
    const Icone = o.tipo === 'recente' ? History : o.tipo === 'poi' ? Building2 : MapPin
    return (
      <li
        key={o.chave}
        id={idOpcao(i)}
        ref={i === ativo ? refAtivo : undefined}
        role="option"
        aria-selected={i === ativo}
        className={`pc-pp__opcao${i === ativo ? ' pc-pp__opcao--ativa' : ''}`}
        // mouseDown (e não click) com preventDefault: o campo não perde o foco antes da escolha.
        onMouseDown={(ev) => { ev.preventDefault(); escolher(o) }}
        onMouseMove={() => { if (ativo !== i) setAtivo(i) }}
      >
        <Icone size={16} aria-hidden className="pc-pp__opcao-icone" />
        <span className="pc-pp__opcao-texto">{o.texto}</span>
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
        value={value}
        placeholder={placeholder}
        maxLength={MAX_ENDERECO}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setAberto(true); setAtivo(-1) }}
        onFocus={() => setAberto(true)}
        onBlur={() => { setAberto(false); setAtivo(-1) }}
        onKeyDown={teclar}
      />
      <ul id={idLista} role="listbox" aria-label="Sugestões de endereço" className="pc-pp__lista" hidden={!mostrando}>
        {recentesVisiveis.length > 0 && <li role="presentation" className="pc-pp__grupo">Recentes</li>}
        {recentesVisiveis.map(linha)}
        {remotasVisiveis.length > 0 && <li role="presentation" className="pc-pp__grupo">Sugestões</li>}
        {remotasVisiveis.map(linha)}
      </ul>
    </div>
  )
}

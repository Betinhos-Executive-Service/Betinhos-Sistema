import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConfigEfetiva } from '@betinhos/app-config'
import { Alert, Button, EmptyState, SegmentedControl, Select, StatusBadge, type SelectOption } from '@betinhos/ui'
import { Smartphone } from 'lucide-react'
import type { Oculto } from '../domain/regras'
import { escreverVer, verDe, type Modo, type VerComo } from '../domain/url'
import type { Motorista } from '../domain/types'

export const MSG_PRONTO = 'app-motoristas-preview:pronto'
export const MSG_CONFIG = 'app-motoristas-preview:config'
const ESPERA_PRONTO_MS = 15_000

/** Origem do iframe, ou `null` quando a URL não é válida. */
export function origemDe(url: string): string | null {
  try { return new URL(url).origin } catch { return null }
}

type Props = {
  /** `null` = sem URL (mock sem `VITE_APP_MOTORISTAS_PREVIEW_URL`). */
  url: string | null
  config: ConfigEfetiva
  nome: string
  ver: VerComo
  onVer: (v: VerComo) => void
  modo: Modo
  onModo: (m: Modo) => void
  motoristas: Motorista[]
  temPublicada: boolean
  ocultos: Oculto[]
  rotuloAlvo: string
}

/** Moldura de celular com o App de verdade num iframe, alimentado por postMessage com a configuração que a tela está editando. */
export function Preview({ url, config, nome, ver, onVer, modo, onModo, motoristas, temPublicada, ocultos, rotuloAlvo }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [pronto, setPronto] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const origem = url ? origemDe(url) : null

  const opcoes = useMemo<SelectOption[]>(() => [
    { value: 'perfil:proprio', label: 'Perfil Próprio', group: 'Perfis' },
    { value: 'perfil:terceiro', label: 'Perfil Terceiro', group: 'Perfis' },
    { value: 'perfil:admin', label: 'Perfil Admin', group: 'Perfis' },
    ...motoristas.map((m) => ({ value: `motorista:${m.id}`, label: m.nome, group: 'Motoristas' })),
  ], [motoristas])

  // O App avisa que carregou; só então a tela manda a configuração (e de novo a cada mudança).
  useEffect(() => {
    setPronto(false); setFalhou(false)
    if (!url || !origem) return
    const aguardando = setTimeout(() => setFalhou(true), ESPERA_PRONTO_MS)
    const ouvir = (ev: MessageEvent) => {
      if (ev.origin !== origem || ev.source !== frame.current?.contentWindow) return
      if (ev.data?.tipo !== MSG_PRONTO) return
      clearTimeout(aguardando); setFalhou(false); setPronto(true)
    }
    window.addEventListener('message', ouvir)
    return () => { clearTimeout(aguardando); window.removeEventListener('message', ouvir) }
  }, [url, origem, tentativa])

  useEffect(() => {
    if (!pronto || !origem) return
    frame.current?.contentWindow?.postMessage({ tipo: MSG_CONFIG, config, motorista: { nome } }, origem)
  }, [pronto, origem, config, nome])

  const controles = (
    <div className="am-prev__controles">
      <label className="am-prev__campo">
        <span className="am-muted">Ver como</span>
        <Select options={opcoes} value={escreverVer(ver)} clearable={false} searchable searchPlaceholder="Buscar motorista" onChange={(v) => { if (v) onVer(verDe(v)) }} />
      </label>
      <SegmentedControl aria-label="Configuração a mostrar" size="compact" value={modo} onChange={onModo}
        options={[{ value: 'rascunho', label: 'Rascunho' }, { value: 'publicado', label: 'Publicado', disabled: !temPublicada }]} />
    </div>
  )

  let corpo
  if (!url || !origem) {
    corpo = (
      <EmptyState align="start" icon={<Smartphone size={32} />} title="Sem App para mostrar">
        Para ver o App aqui no <code>pnpm dev</code>, suba o App Motoristas local e coloque a URL dele, terminada em <code>?preview=1</code>, em <code>VITE_APP_MOTORISTAS_PREVIEW_URL</code> no <code>.env.local</code> do shell. No Dataverse o preview abre sozinho.
      </EmptyState>
    )
  } else if (falhou) {
    corpo = <Alert tone="danger" title="Não foi possível abrir o preview" action={<Button variant="secondary" onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</Button>}>O App não respondeu. Confira se o endereço está no ar e tente de novo.</Alert>
  } else {
    corpo = (
      <div className="am-celular">
        <iframe key={tentativa} ref={frame} className="am-celular__tela" src={url} title="Preview do App Motoristas" referrerPolicy="no-referrer" />
        {!pronto ? <span className="am-celular__carregando am-muted" role="status">Abrindo o App…</span> : null}
      </div>
    )
  }

  return (
    <div className="am-prev">
      {controles}
      {corpo}
      <div className="am-prev__ocultos">
        <strong>Oculto para {rotuloAlvo}</strong>
        {ocultos.length ? (
          <ul className="am-chips">
            {ocultos.map((o) => <li key={o.chave} className="am-chip am-chip--desliga">{o.rotulo}{modo === 'rascunho' && o.soRascunho ? <StatusBadge tone="warning">só no rascunho</StatusBadge> : null}</li>)}
          </ul>
        ) : <span className="am-muted">Nada oculto.</span>}
      </div>
    </div>
  )
}

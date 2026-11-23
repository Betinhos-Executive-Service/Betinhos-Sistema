import { CATALOGO, type Matriz, type Perfil } from '@betinhos/app-config'
import { Button, Switch } from '@betinhos/ui'
import { Lock, Send, Undo2 } from 'lucide-react'
import { dataHora } from '../domain/formato'
import { celula, REGRA_VINCULO, ROTULO_PERFIL } from '../domain/regras'
import type { EstadoSalvamento } from '../useAppMotoristas'
import type { Versao } from '../domain/types'

const COLUNAS: (Perfil | 'admin')[] = ['proprio', 'terceiro', 'admin']

type BarraProps = {
  publicada: Versao | null
  rascunho: Versao | null
  temRascunho: boolean
  mudancas: number
  estado: EstadoSalvamento
  ocupado: boolean
  onDescartar: () => void
  onPublicar: () => void
}

/** Estado do rascunho: quantas mudanças, quem mexeu por último, versão no ar e as duas saídas (descartar ou publicar). */
export function BarraRascunho({ publicada, rascunho, temRascunho, mudancas, estado, ocupado, onDescartar, onPublicar }: BarraProps) {
  const noAr = publicada ? `v${publicada.numero} no ar` : 'Nenhuma versão no ar (vale o padrão do catálogo)'
  const quem = rascunho?.alteradoPor ? `${rascunho.alteradoPor}, ${dataHora(rascunho.alteradoEm)}` : ''
  const salvamento = estado === 'salvando' ? 'Salvando…' : estado === 'erro' ? 'Não salvou' : 'Salvo'
  return (
    <div className="am-barra" role="region" aria-label="Rascunho da configuração">
      <div className="am-barra__texto">
        <strong>{temRascunho ? `Rascunho · ${mudancas} ${mudancas === 1 ? 'mudança' : 'mudanças'}` : 'Sem rascunho'}</strong>
        <span className="am-muted">{[noAr, temRascunho && quem ? `última alteração de ${quem}` : ''].filter(Boolean).join(' · ')}</span>
      </div>
      {temRascunho ? <span className={`am-salvo am-salvo--${estado}`} role="status">{salvamento}</span> : null}
      <div className="am-barra__acoes">
        <Button variant="secondary" icon={<Undo2 size={16} />} disabled={!temRascunho || ocupado} onClick={onDescartar}>Descartar rascunho</Button>
        <Button icon={<Send size={16} />} disabled={mudancas === 0 || ocupado || estado === 'erro'} onClick={onPublicar}>Publicar…</Button>
      </div>
    </div>
  )
}

type MatrizProps = {
  matriz: Matriz
  publicada: Matriz | null
  onAlterar: (perfil: Perfil, chave: string, ligado: boolean) => void
}

/** Matriz módulo × perfil. Fixas e a coluna Admin ficam travadas ligadas; células diferentes do publicado ganham destaque. */
export function MatrizPerfis({ matriz, publicada, onAlterar }: MatrizProps) {
  return (
    <div className="am-matriz-wrap">
      <table className="am-matriz">
        <thead>
          <tr>
            <th scope="col">Módulo</th>
            {COLUNAS.map((c) => <th key={c} scope="col" className="am-matriz__col">{ROTULO_PERFIL[c]}</th>)}
          </tr>
        </thead>
        <tbody>
          {CATALOGO.map((e) => {
            const pai = e.pai ? CATALOGO.find((x) => x.chave === e.pai) : null
            return (
              <tr key={e.chave} className={e.pai ? 'am-matriz__funcao' : undefined}>
                <th scope="row">
                  <span className="am-matriz__nome">{e.rotulo}</span>
                </th>
                {COLUNAS.map((perfil) => {
                  const c = celula(e, perfil, publicada, matriz)
                  return (
                    <td key={perfil} className={`am-matriz__celula${c.mudou ? ' is-mudou' : ''}`}>
                      {perfil === 'admin' || c.travada
                        ? <span className="am-fixo"><Lock size={12} aria-hidden="true" /> sempre ligado</span>
                        : (
                          <Switch
                            label={<span className="am-sr">{e.rotulo} para {ROTULO_PERFIL[perfil]}</span>}
                            checked={c.ligado}
                            onChange={(ev) => onAlterar(perfil, e.chave, ev.target.checked)}
                          />
                        )}
                      {c.mudou ? <span className="am-era">{c.mudou === 'era-ligado' ? 'era ligado' : 'era desligado'}</span> : null}
                      {pai && !c.travada && !celula(pai, perfil, publicada, matriz).ligado ? <span className="am-era">módulo desligado</span> : null}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <ul className="am-regras" aria-label="Regras fixas do vínculo">
        {COLUNAS.map((c) => <li key={c}><strong>{ROTULO_PERFIL[c]}</strong><span>{REGRA_VINCULO[c]}</span></li>)}
      </ul>
    </div>
  )
}

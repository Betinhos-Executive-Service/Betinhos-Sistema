import { useState } from 'react'
import { Alert, ChoiceGroup, Radio, StatusBadge, Switch, useToast } from '@betinhos/ui'
import { AREAS, AREA_LABEL, PERFIL_LABEL, type Area, type Nivel, type Perfil } from '../../../app/acessos'
import { acessosDe, useAcessos } from '../../../app/AcessosProvider'
import type { Source } from '../data/source'
import { erroDaApi, iguais, oQueMuda, perfisIndisponiveis } from '../domain/perfis'
import type { ErroApi, PerfisPessoa, Pessoa } from '../domain/types'
import '../acessos.css'

const OPCOES: { valor: Nivel | null; rotulo: string }[] = [{ valor: null, rotulo: 'Sem acesso' }, { valor: 'operador', rotulo: 'Operador' }, { valor: 'gestor', rotulo: 'Gestor' }]
/** Só o que o usuário mexeu; o rascunho é derivado dos perfis atuais, então uma recarga com o editor aberto não o deixa velho. */
type Edicao = { areas: Partial<Record<Area, Nivel | null>>; acessos?: boolean }
const LIMPA: Edicao = { areas: {} }

function aplicar(base: PerfisPessoa, edicao: Edicao): PerfisPessoa {
  const areas = { ...base.areas }
  for (const area of AREAS) {
    const valor = edicao.areas[area]
    if (valor === undefined) continue
    if (valor) areas[area] = valor
    else delete areas[area]
  }
  return { areas, acessos: edicao.acessos ?? base.acessos }
}

type Opcoes = {
  pessoa: Pessoa
  euId: string
  source: Source
  /** Depois de gravar; o editor só solta o rascunho quando a promessa volta (a releitura traz os perfis novos). */
  onSaved?: (perfis: PerfisPessoa) => void | Promise<void>
}

/** Rascunho, gravação e descarte dos perfis de uma pessoa. Remonte com `key` a cada pessoa: o rascunho nunca vaza de uma para outra. */
export function usePerfisEditor({ pessoa, euId, source, onSaved }: Opcoes) {
  const toast = useToast()
  const [edicao, setEdicao] = useState<Edicao>(LIMPA)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<ErroApi | null>(null)

  const somenteLeitura = pessoa.id === euId || pessoa.admin
  const rascunho = aplicar(pessoa.perfis, edicao)

  const salvar = async () => {
    setSalvando(true)
    setErro(null)
    try {
      await source.definir(pessoa.id, rascunho)
      toast({ tone: 'success', message: `Acessos de ${pessoa.nome} atualizados.` })
      await onSaved?.(rascunho)
      setEdicao(LIMPA)
    } catch (reason) {
      setErro(erroDaApi(reason))
    } finally {
      setSalvando(false)
    }
  }

  return {
    pessoa,
    proprio: pessoa.id === euId,
    somenteLeitura,
    salvando,
    erro,
    rascunho,
    alterado: !iguais(pessoa.perfis, rascunho),
    mudancas: oQueMuda(pessoa.perfis, rascunho),
    faltam: (erro ? perfisIndisponiveis(erro) : []) as Perfil[],
    nivel: (area: Area, valor: Nivel | null) => setEdicao((e) => ({ ...e, areas: { ...e.areas, [area]: valor } })),
    concederAcessos: (valor: boolean) => setEdicao((e) => ({ ...e, acessos: valor })),
    descartar: () => { setEdicao(LIMPA); setErro(null) },
    salvar,
  }
}

export type EditorPerfis = ReturnType<typeof usePerfisEditor>

const NAO_PUBLICADO = <StatusBadge tone="warning">Ainda não publicado neste ambiente</StatusBadge>

export function ErroPerfis({ editor }: { editor: EditorPerfis }) {
  return editor.erro ? <Alert tone="danger" title="Não foi possível salvar">{editor.erro.mensagem}</Alert> : null
}

/** Radios por área, switch de Administrador de acessos, avisos e o resumo do que muda. Sem botões: quem usa decide onde salvar. */
export function PerfisEditor({ editor, comErro = true }: { editor: EditorPerfis; comErro?: boolean }) {
  const acessos = acessosDe(useAcessos())
  const { pessoa, proprio, somenteLeitura, rascunho, faltam, mudancas } = editor
  const travado = somenteLeitura || editor.salvando
  return (
    <div className="ac-ficha">
      {comErro ? <ErroPerfis editor={editor} /> : null}
      {proprio ? <Alert tone="info" title="Ninguém altera o próprio acesso.">Peça a outro Administrador de acessos.</Alert> : null}
      {pessoa.admin && !proprio ? <Alert tone="info" title="Administrador do Sistema">Esta pessoa já tem acesso a tudo; os perfis não mudam o que ela vê. O papel de administrador não é gerido por esta tela.</Alert> : null}
      {AREAS.map((area) => (
        <div key={area} className="ac-ficha__area">
          <ChoiceGroup label={AREA_LABEL[area]} inline>
            {OPCOES.map((o) => (
              <Radio key={o.rotulo} name={`ac-${pessoa.id}-${area}`} label={o.rotulo} disabled={travado} checked={(rascunho.areas[area] ?? null) === o.valor} onChange={() => editor.nivel(area, o.valor)} />
            ))}
          </ChoiceGroup>
          {faltam.includes(area) ? NAO_PUBLICADO : null}
        </div>
      ))}
      <div className="ac-ficha__area">
        <Switch label={PERFIL_LABEL.acessos} checked={rascunho.acessos} disabled={travado || !acessos.admin} onChange={(e) => editor.concederAcessos(e.target.checked)} />
        {acessos.admin ? null : <span className="ac-dica">Só o Administrador do Sistema concede este perfil.</span>}
        {faltam.includes('acessos') ? NAO_PUBLICADO : null}
      </div>
      {mudancas.length ? (
        <Alert tone="info" title="O que muda ao salvar">
          <ul className="ac-ficha__mudancas">{mudancas.map((m) => <li key={m}>{m}</li>)}</ul>
        </Alert>
      ) : null}
    </div>
  )
}

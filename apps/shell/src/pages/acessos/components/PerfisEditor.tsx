import { useMemo, useState } from 'react'
import { Alert, Button, ChoiceGroup, Dialog, Radio, StatusBadge, Switch, useToast } from '@betinhos/ui'
import { AREAS, AREA_LABEL, PERFIL_LABEL, type Area, type Nivel, type Perfil } from '../../../app/acessos'
import { acessosDe, useAcessos } from '../../../app/AcessosProvider'
import type { Source } from '../data/source'
import { erroDaApi, iguais, oQueMuda, perfisIndisponiveis } from '../domain/perfis'
import { montarResumo } from '../domain/previa'
import type { ErroApi, PerfisPessoa, Pessoa } from '../domain/types'
import { OQueDeixaDeTer, ResumoPerdas } from './OQueDeixaDeTer'
import { usePrevia } from './usePrevia'
import '../acessos.css'

const OPCOES: { valor: Nivel | null; rotulo: string }[] = [{ valor: null, rotulo: 'Sem acesso' }, { valor: 'operador', rotulo: 'Operador' }, { valor: 'gestor', rotulo: 'Gestor' }]
/** Só o que o usuário mexeu; o rascunho é derivado dos perfis atuais, então uma recarga com o editor aberto não o deixa velho. */
type Edicao = { areas: Partial<Record<Area, Nivel | null>>; acessos?: boolean; retirarAmplo?: boolean }
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
  /** Depois de gravar (`devolveuAmplo` = foi a devolução do acesso amplo); o editor só solta o rascunho quando a promessa volta (a releitura traz o estado novo). */
  onGravado?: (perfis: PerfisPessoa, devolveuAmplo: boolean) => void | Promise<void>
}

/** Rascunho, gravação e descarte dos perfis de uma pessoa. Remonte com `key` a cada pessoa: o rascunho nunca vaza de uma para outra. */
export function usePerfisEditor({ pessoa, euId, source, onGravado }: Opcoes) {
  const toast = useToast()
  const viewerAdmin = acessosDe(useAcessos()).admin
  const [edicao, setEdicao] = useState<Edicao>(LIMPA)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<ErroApi | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  /** Chave do pedido em que "Salvar sem a prévia" foi marcado: outro rascunho pede a caixa de novo. */
  const [semPreviaDe, setSemPreviaDe] = useState<string | null>(null)

  const proprio = pessoa.id === euId
  const somenteLeitura = proprio || pessoa.admin
  const podeRetirar = viewerAdmin && pessoa.amplo && !proprio
  const retirarAmplo = podeRetirar && edicao.retirarAmplo === true
  const rascunho = useMemo(() => aplicar(pessoa.perfis, edicao), [pessoa.perfis, edicao])
  const alterado = !iguais(pessoa.perfis, rascunho) || retirarAmplo
  const { chave, estado } = usePrevia({ source, pessoaId: pessoa.id, rascunho, retirarAmplo, ativo: alterado })
  const resumo = useMemo(() => (estado?.fase === 'pronta' ? montarResumo(estado.previa, estado.uso, pessoa.perfis, rascunho) : null), [estado, pessoa.perfis, rascunho])
  const semPrevia = estado?.fase === 'falhou' && semPreviaDe === chave
  const podeSalvar = alterado && !salvando && (semPrevia || (estado?.fase === 'pronta' && estado.uso !== null))

  const gravar = async (definir: () => Promise<void>, mensagem: string, perfis: PerfisPessoa, devolveuAmplo: boolean) => {
    setSalvando(true)
    setErro(null)
    try {
      await definir()
      toast({ tone: 'success', message: mensagem })
      // Gravou: falha só na releitura não pode aparecer como erro de gravação.
      try { await onGravado?.(perfis, devolveuAmplo) } catch { toast({ tone: 'warning', message: 'Gravado, mas não deu para recarregar a lista. Atualize a página.' }) }
      if (!devolveuAmplo) setEdicao(LIMPA)
    } catch (reason) {
      // A devolução mostra o erro no próprio diálogo do Histórico.
      if (devolveuAmplo) throw reason
      setErro(erroDaApi(reason))
    } finally {
      setSalvando(false)
    }
  }

  const executar = () => {
    setConfirmando(false)
    return gravar(() => (retirarAmplo ? source.definir(pessoa.id, rascunho, { retirarAmplo: true }) : source.definir(pessoa.id, rascunho)), `Acessos de ${pessoa.nome} atualizados.`, rascunho, false)
  }

  return {
    pessoa,
    proprio,
    somenteLeitura,
    podeRetirar,
    podeDevolver: viewerAdmin && !proprio,
    /** Radios travados; só o interruptor de acesso amplo continua livre para quem pode retirar. */
    editavel: !somenteLeitura || podeRetirar,
    retirarAmplo,
    salvando,
    erro,
    rascunho,
    alterado,
    mudancas: [...oQueMuda(pessoa.perfis, rascunho), ...(retirarAmplo ? ['Acesso amplo (legado): será retirado'] : [])],
    estado,
    resumo,
    semPrevia,
    podeSalvar,
    confirmando,
    faltam: (erro ? perfisIndisponiveis(erro) : []) as Perfil[],
    cancelarConfirmacao: () => setConfirmando(false),
    executar,
    salvar: () => (resumo?.precisaConfirmar ? setConfirmando(true) : executar()),
    devolver: () => gravar(() => source.definir(pessoa.id, pessoa.perfis, { devolverAmplo: true }), `Acesso amplo de ${pessoa.nome} devolvido.`, pessoa.perfis, true),
    tirarAmplo: (valor: boolean) => setEdicao((e) => ({ ...e, retirarAmplo: valor })),
    salvarSemPrevia: (valor: boolean) => setSemPreviaDe(valor ? chave : null),
    nivel: (area: Area, valor: Nivel | null) => setEdicao((e) => ({ ...e, areas: { ...e.areas, [area]: valor } })),
    concederAcessos: (valor: boolean) => setEdicao((e) => ({ ...e, acessos: valor })),
    descartar: () => { setEdicao(LIMPA); setErro(null); setConfirmando(false) },
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
      {pessoa.admin && !proprio ? <Alert tone="info" title="Administrador do Sistema">Esta pessoa já tem acesso a tudo; os perfis não mudam o que ela vê. {editor.podeRetirar ? 'Para ela perder o acesso a tudo, use "Tirar acesso amplo (legado)".' : 'O papel de administrador não é gerido por esta tela.'}</Alert> : null}
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
      {editor.podeRetirar ? (
        <div className="ac-ficha__area">
          <Switch label="Tirar acesso amplo (legado)" checked={editor.retirarAmplo} disabled={editor.salvando} onChange={(e) => editor.tirarAmplo(e.target.checked)} />
          <span className="ac-dica">Tira os papéis amplos dados direto à pessoa. Grupo do Entra (equipe) é manual.</span>
        </div>
      ) : null}
      {mudancas.length ? (
        <Alert tone="info" title="O que muda ao salvar">
          <ul className="ac-ficha__mudancas">{mudancas.map((m) => <li key={m}>{m}</li>)}</ul>
        </Alert>
      ) : null}
      <OQueDeixaDeTer editor={editor} />
      <ConfirmarRetirada editor={editor} />
    </div>
  )
}

function ConfirmarRetirada({ editor }: { editor: EditorPerfis }) {
  const { resumo, pessoa } = editor
  return (
    <Dialog open={editor.confirmando && resumo != null} onClose={editor.cancelarConfirmacao} title="Confirmar retirada" actions={<>
      <Button variant="secondary" onClick={editor.cancelarConfirmacao}>Voltar</Button>
      <Button variant="danger" onClick={() => void editor.executar()}>Tirar acesso</Button>
    </>}>
      <p>{pessoa.nome} deixa de ter:</p>
      {editor.confirmando && resumo ? <ResumoPerdas resumo={resumo} /> : null}
    </Dialog>
  )
}

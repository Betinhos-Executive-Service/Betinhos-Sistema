import { useState } from 'react'
import { Alert, Button, ChoiceGroup, Dialog, Drawer, Radio, StatusBadge, Switch, Tabs, useToast } from '@betinhos/ui'
import { AREAS, AREA_LABEL, PERFIL_LABEL, type Area, type Nivel, type Perfil } from '../../../app/acessos'
import { acessosDe, useAcessos } from '../../../app/AcessosProvider'
import type { Source } from '../data/source'
import { erroDaApi, iguais, oQueMuda, perfisIndisponiveis } from '../domain/perfis'
import type { ErroApi, Historico, PerfisPessoa, Pessoa } from '../domain/types'
import { HistoricoLista } from './HistoricoLista'

type Props = { pessoa: Pessoa | null; euId: string; historico: Historico[]; source: Source; onClose: () => void; onSaved: (perfis: PerfisPessoa) => void }

/** Gaveta de uma pessoa. A ficha é remontada a cada pessoa (`key`), então o rascunho nunca vaza de uma para outra. */
export function AcessoDrawer({ pessoa, ...rest }: Props) {
  if (!pessoa) return null
  return <Ficha key={pessoa.id} pessoa={pessoa} {...rest} />
}

const OPCOES: { valor: Nivel | null; rotulo: string }[] = [{ valor: null, rotulo: 'Sem acesso' }, { valor: 'operador', rotulo: 'Operador' }, { valor: 'gestor', rotulo: 'Gestor' }]
/** Só o que o usuário mexeu; o rascunho é derivado dos perfis atuais, então uma recarga com a gaveta aberta não o deixa velho. */
type Edicao = { areas: Partial<Record<Area, Nivel | null>>; acessos?: boolean }

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

const NAO_PUBLICADO = <StatusBadge tone="warning">Ainda não publicado neste ambiente</StatusBadge>

function Ficha({ pessoa, euId, historico, source, onClose, onSaved }: Omit<Props, 'pessoa'> & { pessoa: Pessoa }) {
  const toast = useToast()
  const acessos = acessosDe(useAcessos())
  const [aba, setAba] = useState('perfis')
  const [edicao, setEdicao] = useState<Edicao>({ areas: {} })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<ErroApi | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  const proprio = pessoa.id === euId
  const travado = proprio || pessoa.admin || salvando
  const rascunho = aplicar(pessoa.perfis, edicao)
  const mudancas = oQueMuda(pessoa.perfis, rascunho)
  const alterado = !iguais(pessoa.perfis, rascunho)
  const faltam: Perfil[] = erro ? perfisIndisponiveis(erro) : []
  const daPessoa = historico.filter((h) => h.usuarioId === pessoa.id)

  const nivel = (area: Area, valor: Nivel | null) => setEdicao((e) => ({ ...e, areas: { ...e.areas, [area]: valor } }))

  // Salvando não fecha; com alteração pendente pergunta antes.
  const fechar = () => {
    if (salvando) return
    if (alterado) setConfirmar(true)
    else onClose()
  }

  const salvar = async () => {
    setSalvando(true)
    setErro(null)
    try {
      await source.definir(pessoa.id, rascunho)
      toast({ tone: 'success', message: `Acessos de ${pessoa.nome} atualizados.` })
      onSaved(rascunho)
    } catch (reason) {
      setErro(erroDaApi(reason))
    } finally {
      setSalvando(false)
    }
  }

  const footer = proprio || pessoa.admin
    ? <Button variant="secondary" onClick={onClose}>Fechar</Button>
    : <>
        <Button variant="secondary" disabled={salvando} onClick={fechar}>Cancelar</Button>
        <Button disabled={!alterado} loading={salvando} onClick={() => void salvar()}>Salvar</Button>
      </>

  return (
    <>
      <Drawer open onClose={fechar} size="wide" eyebrow={pessoa.email || 'Acessos'} title={pessoa.nome} footer={footer}>
        {erro ? <Alert tone="danger" title="Não foi possível salvar">{erro.mensagem}</Alert> : null}
        <Tabs aria-label="Seções dos acessos" value={aba} onChange={setAba} tabs={[{ value: 'perfis', label: 'Perfis' }, { value: 'historico', label: 'Histórico' }]}>
          {aba === 'historico' ? <HistoricoLista itens={daPessoa} /> : (
            <div className="ac-ficha">
              {proprio ? <Alert tone="info" title="Ninguém altera o próprio acesso.">Peça a outro Administrador de acessos.</Alert> : null}
              {pessoa.admin && !proprio ? <Alert tone="info" title="Administrador do Sistema">Esta pessoa já tem acesso a tudo; os perfis não mudam o que ela vê. O papel de administrador não é gerido por esta tela.</Alert> : null}
              {AREAS.map((area) => (
                <div key={area} className="ac-ficha__area">
                  <ChoiceGroup label={AREA_LABEL[area]} inline>
                    {OPCOES.map((o) => (
                      <Radio key={o.rotulo} name={`ac-${area}`} label={o.rotulo} disabled={travado} checked={(rascunho.areas[area] ?? null) === o.valor} onChange={() => nivel(area, o.valor)} />
                    ))}
                  </ChoiceGroup>
                  {faltam.includes(area) ? NAO_PUBLICADO : null}
                </div>
              ))}
              <div className="ac-ficha__area">
                <Switch label={PERFIL_LABEL.acessos} checked={rascunho.acessos} disabled={travado || !acessos.admin} onChange={(e) => setEdicao((ed) => ({ ...ed, acessos: e.target.checked }))} />
                {acessos.admin ? null : <span className="ac-dica">Só o Administrador do Sistema concede este perfil.</span>}
                {faltam.includes('acessos') ? NAO_PUBLICADO : null}
              </div>
              {mudancas.length ? (
                <Alert tone="info" title="O que muda ao salvar">
                  <ul className="ac-ficha__mudancas">{mudancas.map((m) => <li key={m}>{m}</li>)}</ul>
                </Alert>
              ) : null}
            </div>
          )}
        </Tabs>
      </Drawer>
      <Dialog open={confirmar} onClose={() => setConfirmar(false)} title="Descartar alterações?" actions={<>
        <Button variant="secondary" onClick={() => setConfirmar(false)}>Continuar editando</Button>
        <Button variant="danger" onClick={onClose}>Descartar</Button>
      </>}>
        As mudanças de perfil de {pessoa.nome} ainda não foram salvas.
      </Dialog>
    </>
  )
}

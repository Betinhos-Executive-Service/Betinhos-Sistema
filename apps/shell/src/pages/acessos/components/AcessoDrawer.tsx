import { useState } from 'react'
import { Button, Dialog, Drawer, Tabs } from '@betinhos/ui'
import type { Source } from '../data/source'
import type { Historico, PerfisPessoa, Pessoa } from '../domain/types'
import { HistoricoLista } from './HistoricoLista'
import { ErroPerfis, PerfisEditor, usePerfisEditor } from './PerfisEditor'

type Props = { pessoa: Pessoa | null; euId: string; historico: Historico[]; source: Source; onClose: () => void; onSaved: (perfis: PerfisPessoa) => void }

/** Gaveta de uma pessoa. A ficha é remontada a cada pessoa (`key`), então o rascunho nunca vaza de uma para outra. */
export function AcessoDrawer({ pessoa, ...rest }: Props) {
  if (!pessoa) return null
  return <Ficha key={pessoa.id} pessoa={pessoa} {...rest} />
}

function Ficha({ pessoa, euId, historico, source, onClose, onSaved }: Omit<Props, 'pessoa'> & { pessoa: Pessoa }) {
  const [aba, setAba] = useState('perfis')
  const [confirmar, setConfirmar] = useState(false)
  const editor = usePerfisEditor({ pessoa, euId, source, onSaved })
  const { salvando, alterado } = editor
  const daPessoa = historico.filter((h) => h.usuarioId === pessoa.id)

  // Salvando não fecha; com alteração pendente pergunta antes.
  const fechar = () => {
    if (salvando) return
    if (alterado) setConfirmar(true)
    else onClose()
  }

  const footer = editor.somenteLeitura
    ? <Button variant="secondary" onClick={onClose}>Fechar</Button>
    : <>
        <Button variant="secondary" disabled={salvando} onClick={fechar}>Cancelar</Button>
        <Button disabled={!alterado} loading={salvando} onClick={() => void editor.salvar()}>Salvar</Button>
      </>

  return (
    <>
      <Drawer open onClose={fechar} size="wide" eyebrow={pessoa.email || 'Acessos'} title={pessoa.nome} footer={footer}>
        <ErroPerfis editor={editor} />
        <Tabs aria-label="Seções dos acessos" value={aba} onChange={setAba} tabs={[{ value: 'perfis', label: 'Perfis' }, { value: 'historico', label: 'Histórico' }]}>
          {aba === 'historico' ? <HistoricoLista itens={daPessoa} /> : <PerfisEditor editor={editor} comErro={false} />}
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

import type { ReactNode } from 'react'
import { Alert, Checkbox, Spinner } from '@betinhos/ui'
import { registrosTexto, usoTexto, type ItemPerdido, type Resumo } from '../domain/previa'
import type { EditorPerfis } from './PerfisEditor'

const lista = (itens: string[]) => itens.join(', ')
const perdeTexto = (acoes: string[], incerto: boolean) => `perde ${lista(acoes)}${incerto ? ' (não deu para confirmar)' : ''}`

/** Bloco com título; vazio não aparece. */
function Secao({ titulo, itens }: { titulo: string; itens: ReactNode[] }) {
  if (!itens.length) return null
  return (
    <section>
      <h4 className="ac-previa__titulo">{titulo}</h4>
      <ul className="ac-previa__lista">{itens}</ul>
    </section>
  )
}

function Item({ item }: { item: ItemPerdido }) {
  const uso = usoTexto(item.uso)
  return (
    <li className="ac-previa__item">
      <span><strong>{item.nome}</strong>: {perdeTexto(item.acoes, item.incerto)}</span>
      {uso ? <span className="ac-dica">{uso}</span> : null}
    </li>
  )
}

/** O que a pessoa deixa de ter, em blocos: telas, ações por área, colunas, flows, conexões e o que não tem tela. Usado no bloco da ficha e na confirmação. */
export function ResumoPerdas({ resumo }: { resumo: Resumo }) {
  if (resumo.vazio) return <p className="ac-previa__nada">Não perde nada.</p>
  return (
    <div className="ac-previa">
      {resumo.grupos.map((g) => {
        const registros = g.perdeDonos ? registrosTexto(g.perdeDonos, g.limitado) : null
        return (
          <Alert key={g.nome} tone="warning" title={`Continua com acesso pelo grupo ${g.nome}`}>
            Tire a pessoa do grupo no Entra{registros ? `; ele ainda dá acesso a ${registros}` : ''}.
          </Alert>
        )
      })}
      {resumo.telasSomem.length ? <section><h4 className="ac-previa__titulo">Telas que somem do menu</h4><p>{lista(resumo.telasSomem)}</p></section> : null}
      {resumo.areas.map((a) => (
        <section key={a.perfil}>
          <h4 className="ac-previa__titulo">{a.area}</h4>
          {a.telas.length ? <p className="ac-dica">Telas que continuam: {lista(a.telas)}</p> : null}
          <ul className="ac-previa__lista">{a.itens.map((i) => <Item key={i.chave} item={i} />)}</ul>
        </section>
      ))}
      <Secao titulo="Colunas que ficam vazias" itens={resumo.colunas.map((c) => <li key={c.rotulo}><strong>{c.rotulo}</strong>: {perdeTexto(c.acoes, c.incerto)}</li>)} />
      <Secao titulo="Apps que deixam de abrir" itens={resumo.apps.map((a, i) => <li key={i}>{a}</li>)} />
      <Secao titulo="Flows que deixam de rodar" itens={resumo.flows.map((f, i) => <li key={i}>{f.nome}{f.dona ? '' : ' (coproprietária)'}{f.tipo === 'incerto' ? ' (não deu para confirmar)' : ''}</li>)} />
      <Secao titulo="Conexões que deixam de funcionar" itens={resumo.conexoes.map((c, i) => <li key={i}>{c}</li>)} />
      {resumo.outras.length ? (
        <details className="ac-previa__outras">
          <summary>Outras tabelas e permissões ({resumo.outras.length})</summary>
          <ul className="ac-previa__lista">{resumo.outras.map((i) => <Item key={i.chave} item={i} />)}</ul>
        </details>
      ) : null}
      <p className="ac-dica">Não conferido: apps canvas compartilhados com a pessoa ou o grupo.</p>
    </div>
  )
}

/** Bloco "O que deixa de ter" da ficha: pedido a cada mudança do rascunho. Prévia que falha só deixa salvar com a caixa "Salvar sem a prévia". */
export function OQueDeixaDeTer({ editor }: { editor: EditorPerfis }) {
  if (!editor.alterado || !editor.editavel) return null
  const { estado, resumo } = editor
  let corpo
  if (estado?.fase === 'falhou') {
    corpo = (
      <Alert tone="warning" title="Não foi possível calcular o que a pessoa deixa de ter">
        <div className="ac-previa">
          <p>{estado.mensagem}</p>
          <Checkbox label="Salvar sem a prévia" checked={editor.semPrevia} onChange={(e) => editor.salvarSemPrevia(e.target.checked)} />
        </div>
      </Alert>
    )
  } else if (resumo) {
    corpo = (
      <>
        <ResumoPerdas resumo={resumo} />
        {estado?.fase === 'pronta' && estado.uso === null ? <span className="ac-dica"><Spinner size={14} label="Medindo o uso" /> Medindo o uso dos últimos 90 dias…</span> : null}
      </>
    )
  } else corpo = <span className="ac-dica"><Spinner size={16} label="Calculando" /> Calculando o que deixa de ter…</span>
  return (
    <section className="ac-ficha__area" aria-label="O que deixa de ter">
      <h3 className="ac-previa__cabeca">O que deixa de ter</h3>
      {corpo}
    </section>
  )
}

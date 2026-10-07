import { useEffect, useState, type ReactNode } from 'react'
import { Button, buttonClassName } from '@betinhos/ui'
import { ExternalLink, FileText, MessageCircle, Phone } from 'lucide-react'
import type { Documento } from '../../funcionarios/data/types'
import type { Source } from '../data/source'
import type { ChoiceSet, Curriculo } from '../domain/types'
import { choiceLabel } from '../domain/funnel'
import { formatDate, formatMoney } from '../domain/text'
import { telHref, whatsappHref } from '../../operacional/domain/phone'

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '') return null
  return <div className="cv-view__row"><dt>{label}</dt><dd>{children}</dd></div>
}

/** Visão somente leitura do candidato, em blocos (contato, perfil, origem, textos e arquivo). */
export function CurriculoView({ c, choices, source }: { c: Curriculo; choices: ChoiceSet; source: Source }) {
  const tel = telHref(c.telefone)
  const wa = whatsappHref(c.whatsapp || c.telefone)
  const place = [c.cidade, c.estado].filter(Boolean).join('/')
  return (
    <div className="cv-view">
      <section className="cv-view__block">
        <h3 className="cv-view__title">Contato</h3>
        <dl className="cv-view__list">
          <Row label="Telefone">{c.telefone}</Row>
          <Row label="WhatsApp">{c.whatsapp}</Row>
          <Row label="E-mail">{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : ''}</Row>
          <Row label="Cidade">{place}</Row>
          <Row label="CPF">{c.cpf}</Row>
        </dl>
        {tel || wa ? (
          <div className="cv-view__actions">
            {tel ? <a className={buttonClassName({ variant: 'secondary' })} href={tel}><Phone size={16} aria-hidden="true" />Ligar</a> : null}
            {wa ? <a className={buttonClassName({ variant: 'secondary' })} href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" />Abrir WhatsApp</a> : null}
          </div>
        ) : null}
      </section>
      <section className="cv-view__block">
        <h3 className="cv-view__title">Perfil</h3>
        <dl className="cv-view__list">
          <Row label="Cargo de interesse">{c.cargo}</Row>
          <Row label="Último cargo">{c.ultimoCargo}</Row>
          <Row label="Última empresa">{c.ultimaEmpresa}</Row>
          <Row label="Pretensão">{c.pretensao != null ? formatMoney(c.pretensao) : ''}</Row>
          <Row label="Nota">{c.nota != null ? `${c.nota} de 10` : ''}</Row>
          <Row label="Disponibilidade">{choiceLabel(choices.disponibilidade, c.disponibilidade)}</Row>
          <Row label="CNH">{choiceLabel(choices.cnh, c.cnh)}</Row>
        </dl>
      </section>
      <section className="cv-view__block">
        <h3 className="cv-view__title">Origem</h3>
        <dl className="cv-view__list">
          <Row label="Origem">{choiceLabel(choices.origem, c.origem)}</Row>
          <Row label="Indicado por">{c.indicadoPor}</Row>
          <Row label="Cadastrado em">{c.criadoEm ? formatDate(c.criadoEm) : ''}</Row>
        </dl>
      </section>
      {c.experiencia ? <section className="cv-view__block"><h3 className="cv-view__title">Experiência</h3><p className="cv-view__text">{c.experiencia}</p></section> : null}
      {c.observacoes ? <section className="cv-view__block"><h3 className="cv-view__title">Observações internas</h3><p className="cv-view__text">{c.observacoes}</p></section> : null}
      <section className="cv-view__block">
        <h3 className="cv-view__title">Currículo</h3>
        <Arquivos id={c.id} link={c.link} source={source} />
      </section>
    </div>
  )
}

type Lista = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; docs: Documento[] }

/** Link antigo (legado) e arquivos da pasta do candidato no SharePoint, abertos pelo Flow Consultar. */
function Arquivos({ id, link, source }: { id: string; link: string; source: Source }) {
  const [lista, setLista] = useState<Lista>({ state: 'loading' })
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const [erroAbrir, setErroAbrir] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLista({ state: 'loading' })
    source.files(id).then(
      (docs) => { if (alive) setLista({ state: 'ready', docs }) },
      (reason: unknown) => { if (alive) setLista({ state: 'error', message: reason instanceof Error ? reason.message : String(reason) }) },
    )
    return () => { alive = false }
  }, [id, source])

  async function abrir(doc: Documento) {
    const janela = window.open('', '_blank')
    setAbrindo(doc.id)
    setErroAbrir(null)
    try {
      const { blob } = await source.openFile(doc)
      const url = URL.createObjectURL(blob)
      if (janela) janela.location.href = url
      else window.location.assign(url)
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (reason) {
      janela?.close()
      setErroAbrir(`Não foi possível abrir ${doc.nome}: ${reason instanceof Error ? reason.message : String(reason)}`)
    } finally {
      setAbrindo(null)
    }
  }

  const docs = lista.state === 'ready' ? lista.docs : []
  return (
    <>
      {link || docs.length ? (
        <div className="cv-view__actions">
          {link ? <a className={buttonClassName({ variant: 'secondary' })} href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />Abrir currículo</a> : null}
          {docs.map((doc) => (
            <Button key={doc.id || doc.caminho} variant="secondary" icon={<FileText size={16} />} loading={abrindo === doc.id} onClick={() => void abrir(doc)}>{`Abrir ${doc.nome}`}</Button>
          ))}
        </div>
      ) : null}
      {lista.state === 'loading' ? <p className="cv-view__muted">Carregando arquivos…</p> : null}
      {lista.state === 'error' ? <p className="cv-view__muted" role="alert">Não foi possível listar os arquivos: {lista.message}</p> : null}
      {lista.state === 'ready' && !link && !docs.length ? <p className="cv-view__muted">Sem arquivo anexado.</p> : null}
      {erroAbrir ? <p className="cv-view__muted" role="alert">{erroAbrir}</p> : null}
    </>
  )
}

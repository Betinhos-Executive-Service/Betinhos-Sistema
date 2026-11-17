import { MoreHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, ChoiceGroup, Field, Input, Menu, Radio, Select, Textarea, type MenuAction } from '@betinhos/ui'
import { daysBetween, formatBR, todaySP } from '../data/dates'
import { brl } from '../data/format'
import { CANAL, MOTIVO_EMPRESA, RESPONSAVEL } from '../data/schema'
import type { DataSource } from '../data/source'
import type { FrotaData, Multa, Ref } from '../data/types'
import { mensagemDaAcao } from '../data/xrm'
import { estadoDaMulta, responsavelDaMulta, urgenciaDoPrazo } from '../domain/multaEstado'
import { aberta, avaliar, responsavelEfetivo, ROTULO_PASSO, validarPasso, type DadosPasso, type Etapa, type MultaEstado, type Passo } from '../domain/multaEtapas'
import { mensagemWhatsApp } from '../domain/multaMensagem'
import { useNotify } from './Toasts'

type Props = { source: DataSource; multa: Multa; data: FrotaData; onChanged: () => void; hoje?: string }

const BARRA: { etapa: 'identificar' | 'indicar' | 'pagar' | 'acertar'; rotulo: string }[] = [
  { etapa: 'identificar', rotulo: 'Identificar' }, { etapa: 'indicar', rotulo: 'Indicar' }, { etapa: 'pagar', rotulo: 'Pagar' }, { etapa: 'acertar', rotulo: 'Acertar' },
]
const ORDEM: Record<Etapa, number> = { identificar: 0, indicar: 1, pagar: 2, recurso: 2, acertar: 3, encerrada: 4, cancelada: -1 }
const BOTAO: Record<Passo, string> = {
  DefinirResponsavel: 'Confirmar responsável', AvisarMotorista: 'Avisei', RegistrarIndicacao: 'Registrar indicação', RegistrarAceite: 'Registrar aceite',
  RegistrarPagamento: 'Registrar pagamento', RegistrarAcerto: 'Registrar acerto', PrazoVencido: 'Responder', Cancelar: 'Cancelar multa',
  Recorrer: 'Entrar com recurso', ResultadoRecurso: 'Registrar resultado',
}
const CANAIS = [{ value: 'senatran', label: 'Senatran' }, { value: 'dsv', label: 'DSV Digital' }, { value: 'prefeitura', label: 'Prefeitura' }]
const MOTIVOS = [{ value: 'culpa-empresa', label: 'Culpa da empresa' }, { value: 'prazo-perdido', label: 'Prazo perdido' }]
const ROTULO_CANAL: Record<number, string> = { [CANAL.SENATRAN]: 'Senatran', [CANAL.DSV]: 'DSV Digital', [CANAL.PREFEITURA]: 'Prefeitura' }
const ROTULO_MOTIVO: Record<number, string> = { [MOTIVO_EMPRESA.PRAZO_PERDIDO]: 'prazo perdido', [MOTIVO_EMPRESA.CULPA_EMPRESA]: 'culpa da empresa' }

/** Quem pode ser o responsável: motoristas das posses e das multas (a Frota não carrega o cadastro inteiro). */
export function opcoesMotoristas(data: FrotaData, atual: Ref | null) {
  const mapa = new Map<string, string>()
  for (const r of [atual, ...data.posses.map((p) => p.motorista), ...data.multas.map((m) => m.motorista)]) if (r?.id && r.label) mapa.set(r.id, r.label)
  return [...mapa].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
}

/** Texto vazio de um campo de data/mês some do passo: o servidor lê ausente como null (as regras testam `== null`). */
export function dadosSemVazios(d: DadosPasso): DadosPasso {
  return Object.fromEntries(Object.entries(d).filter(([, valor]) => valor !== '')) as DadosPasso
}

/** O que já foi feito (rótulo e valor com data), só leitura. */
function feitos(e: MultaEstado, responsavel: Ref | null): [string, string][] {
  const linhas: [string, string][] = []
  const motivo = e.motivoEmpresa != null ? ` (${ROTULO_MOTIVO[e.motivoEmpresa]})` : ''
  if (e.responsavel === RESPONSAVEL.EMPRESA) linhas.push(['Responsável', `Empresa${motivo}`])
  else if (responsavel) linhas.push(['Responsável', responsavel.label])
  if (e.dataAviso) linhas.push(['Motorista avisado', formatBR(e.dataAviso)])
  if (e.dataIndicacao) linhas.push(['Indicação no órgão', `${formatBR(e.dataIndicacao)}${e.canal != null ? ` · ${ROTULO_CANAL[e.canal]}` : ''}`])
  if (e.aceiteEm) linhas.push(['Aceite na CNH Digital', formatBR(e.aceiteEm)])
  if (e.pagaEm) linhas.push(['Pagamento', `${formatBR(e.pagaEm)}${e.valorPago != null ? ` · ${brl(e.valorPago)}` : ''}`])
  if (e.acertoEm) linhas.push(['Acerto', `${formatBR(e.acertoEm)} · ${e.competencia ? `lançado na folha de ${formatBR(e.competencia).slice(3)}` : `Empresa assumiu${motivo}`}`])
  if (e.canceladaEm) linhas.push(['Cancelamento', `${formatBR(e.canceladaEm)}${e.motivoCancelamento ? ` · ${e.motivoCancelamento}` : ''}`])
  return linhas
}

export function MultaPassoAPasso({ source, multa, data, onChanged, hoje = todaySP() }: Props) {
  const notify = useNotify()
  const estado = useMemo(() => estadoDaMulta(multa), [multa])
  const situacao = useMemo(() => avaliar(estado, hoje), [estado, hoje])
  const responsavel = responsavelDaMulta(multa)
  const motoristaId = multa.motorista?.id ?? null
  const motoristaNome = multa.motorista?.label ?? ''
  const motoristas = useMemo(() => opcoesMotoristas(data, motoristaId ? { id: motoristaId, label: motoristaNome } : null), [data, motoristaId, motoristaNome])
  const [extra, setExtra] = useState<'Cancelar' | 'Recorrer' | null>(null)
  const passo: Passo | null = extra ?? situacao.pendentes[0] ?? null
  const [dados, setDados] = useState<DadosPasso>({})
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [copiaFalhou, setCopiaFalhou] = useState(false)
  const [erroRastreador, setErroRastreador] = useState<string | null>(null)
  const [montando, setMontando] = useState(false)
  const textoRef = useRef<HTMLTextAreaElement>(null)

  // Passo novo começa limpo; o responsável já sugere o motorista que veio no cadastro da multa.
  useEffect(() => {
    setDados(passo === 'DefinirResponsavel' && motoristaId ? { responsavel: 'motorista', motoristaId } : {})
    setArquivo(null)
    setErro(null)
  }, [passo, multa.id, motoristaId])

  const set = (patch: DadosPasso) => setDados((atual) => ({ ...atual, ...patch }))
  const envio = useMemo(() => dadosSemVazios(dados), [dados])
  const faltando = passo ? validarPasso(estado, passo, envio, hoje) : null
  const semResponsavel = responsavelEfetivo(estado) === null
  const dias = situacao.proximoPrazo ? daysBetween(hoje, situacao.proximoPrazo) : null
  const urgencia = urgenciaDoPrazo(situacao.proximoPrazo, situacao.prazoVencido, hoje)
  const mais: MenuAction[] = situacao.prazoVencido || extra ? [] : [
    ...(situacao.etapa === 'identificar' || situacao.etapa === 'indicar' || situacao.etapa === 'pagar' ? [{ id: 'recurso', label: 'Em recurso', onSelect: () => setExtra('Recorrer') }] : []),
    ...(aberta(situacao.etapa) ? [{ id: 'cancelar', label: 'Cancelar multa', onSelect: () => setExtra('Cancelar') }] : []),
  ]

  async function gravar() {
    if (!passo || faltando || salvando) return
    setSalvando(true)
    setErro(null)
    try {
      if (passo === 'RegistrarPagamento' && arquivo) {
        try {
          await source.enviarArquivoMulta(multa.id, 'cr40f_comprovantepagamento', arquivo)
        } catch {
          setErro('Não foi possível enviar o arquivo. Tente de novo.')
          return
        }
      }
      await source.passoMulta(multa.id, passo, envio)
      notify('success', `${ROTULO_PASSO[passo]}: feito.`)
      setExtra(null)
      onChanged()
    } catch (reason) {
      setErro(mensagemDaAcao(reason, 'Não foi possível gravar o passo. Tente de novo.'))
    } finally {
      setSalvando(false)
    }
  }

  async function copiar() {
    setMontando(true)
    setCopiaFalhou(false)
    setErroRastreador(null)
    let texto: string
    try {
      const dossie = await source.dossieMulta(multa.id)
      texto = mensagemWhatsApp(dossie, multa.motorista?.label ?? null)
      // A mensagem do motorista esconde o erro do InFleet; o gestor vê o detalhe aqui.
      setErroRastreador(dossie.infleet.erro?.trim() || null)
    } catch (reason) {
      notify('error', mensagemDaAcao(reason, 'Não foi possível montar o dossiê. Tente de novo.'))
      setMontando(false)
      return
    }
    setMensagem(texto)
    try {
      await navigator.clipboard.writeText(texto)
      notify('success', 'Mensagem copiada. Cole no WhatsApp do motorista.')
    } catch {
      setCopiaFalhou(true)
      requestAnimationFrame(() => { textoRef.current?.focus(); textoRef.current?.select() })
    } finally {
      setMontando(false)
    }
  }

  const campoData = (rotulo: string) => (
    <Field label={rotulo} required><Input type="date" max={hoje} disabled={salvando} value={dados.data ?? ''} onChange={(e: { target: { value: string } }) => set({ data: e.target.value })} /></Field>
  )
  const campoCanal = () => (
    <Field label="Canal" required>
      <Select aria-label="Canal da indicação" options={CANAIS} placeholder="Escolha o canal" value={dados.canal ?? null} onChange={(v) => set({ canal: (v ?? undefined) as DadosPasso['canal'] })} />
    </Field>
  )

  function campos() {
    const nome = `${multa.id}-${passo}`
    switch (passo) {
      case 'DefinirResponsavel':
        return <>
          <ChoiceGroup label="Quem responde pela multa" inline>
            <Radio name={nome} label="Motorista" checked={dados.responsavel === 'motorista'} onChange={() => set({ responsavel: 'motorista' })} />
            <Radio name={nome} label="Empresa (culpa da empresa)" checked={dados.responsavel === 'empresa'} onChange={() => setDados({ responsavel: 'empresa' })} />
          </ChoiceGroup>
          {dados.responsavel === 'motorista' && (
            <Field label="Motorista" required>
              <Select aria-label="Motorista" options={motoristas} searchable placeholder="Escolha o motorista" value={dados.motoristaId ?? null} onChange={(v) => set({ motoristaId: v ?? undefined })} />
            </Field>
          )}
          {dados.responsavel === 'empresa' && <p className="frota-muted">A etapa 2 é pulada: a multa vai direto para Pagar.</p>}
        </>
      case 'AvisarMotorista':
        return <>
          <p className="frota-muted">Mande pelo WhatsApp a mensagem com o serviço do dia e o rastreador. Depois confirme em "Avisei".</p>
          <div className="frota-cluster"><Button variant="secondary" loading={montando} onClick={() => void copiar()}>Copiar mensagem</Button></div>
          {mensagem !== null && <textarea ref={textoRef} className="multa-mensagem" aria-label="Mensagem para o WhatsApp" rows={9} readOnly value={mensagem} />}
          {copiaFalhou && <p className="frota-muted" role="status">Não deu para copiar sozinho: o texto está selecionado. Use Ctrl+C.</p>}
          {erroRastreador && <Alert tone="warning">Rastreador (InFleet) indisponível. Este detalhe fica só aqui, fora da mensagem: {erroRastreador}</Alert>}
        </>
      case 'RegistrarIndicacao':
        return <div className="frota-fields">{campoCanal()}{campoData('Data da indicação')}</div>
      case 'RegistrarAceite':
        return <div className="frota-fields">{campoData('Data do aceite na CNH Digital')}</div>
      case 'RegistrarPagamento':
        return <>
          <p className="frota-muted">Vencimento {formatBR(estado.vencimento)}{multa.valorComDesconto != null ? ` · com os 40%: ${brl(multa.valorComDesconto)}` : ''}</p>
          <div className="frota-fields">
            {campoData('Data do pagamento')}
            <Field label="Valor pago (R$)" required>
              <Input type="number" step="0.01" min="0" disabled={salvando} value={dados.valorPago ?? ''} onChange={(e: { target: { value: string } }) => set({ valorPago: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </Field>
            <Field label="Comprovante (opcional)">
              <input type="file" accept="application/pdf,image/*" disabled={salvando} onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </Field>
          </div>
          {estado.responsavel === RESPONSAVEL.EMPRESA && <p className="frota-muted">Multa da empresa: o acerto sai junto e a multa encerra.</p>}
        </>
      case 'RegistrarAcerto':
        return <>
          <ChoiceGroup label="Acerto" inline>
            <Radio name={nome} label="Lancei na folha" checked={dados.acerto === 'folha'} onChange={() => setDados({ acerto: 'folha' })} />
            <Radio name={nome} label="Empresa assume" checked={dados.acerto === 'empresa'} onChange={() => setDados({ acerto: 'empresa' })} />
          </ChoiceGroup>
          {dados.acerto === 'folha' && <Field label="Mês do desconto" required><Input type="month" disabled={salvando} value={dados.competencia ?? ''} onChange={(e: { target: { value: string } }) => set({ competencia: e.target.value })} /></Field>}
          {dados.acerto === 'empresa' && (
            <Field label="Motivo" required>
              <Select aria-label="Motivo de a empresa assumir" options={MOTIVOS} placeholder="Escolha o motivo" value={dados.motivo ?? null} onChange={(v) => set({ motivo: (v ?? undefined) as DadosPasso['motivo'] })} />
            </Field>
          )}
        </>
      case 'PrazoVencido':
        return <>
          <p>O prazo para indicar era {formatBR(estado.dataParaIndicar)}. Antes de qualquer outro passo, responda:</p>
          <ChoiceGroup label="A multa foi indicada no prazo?">
            <Radio name={nome} label="Sim, foi indicada" checked={dados.indicou === true} onChange={() => setDados({ indicou: true })} />
            <Radio name={nome} label="Não: a empresa paga a guia (prazo perdido)" checked={dados.indicou === false} onChange={() => setDados({ indicou: false })} />
          </ChoiceGroup>
          {dados.indicou === true && (
            <div className="frota-fields">
              {campoCanal()}
              {campoData('Data da indicação')}
              {semResponsavel && (
                <Field label="Motorista indicado" required>
                  <Select aria-label="Motorista indicado" options={motoristas} searchable placeholder="Escolha o motorista" value={dados.motoristaId ?? null} onChange={(v) => set({ motoristaId: v ?? undefined })} />
                </Field>
              )}
            </div>
          )}
        </>
      case 'Cancelar':
        return <Field label="Motivo do cancelamento" required><Textarea rows={3} maxLength={2000} disabled={salvando} value={dados.motivoTexto ?? ''} onChange={(e: { target: { value: string } }) => set({ motivoTexto: e.target.value })} /></Field>
      case 'Recorrer':
        return <p className="frota-muted">A multa fica em recurso até o resultado. Indeferido volta para Pagar; deferido encerra.</p>
      case 'ResultadoRecurso':
        return <ChoiceGroup label="Resultado do recurso" inline>
          <Radio name={nome} label="Deferido: a multa encerra" checked={dados.resultado === 'deferido'} onChange={() => setDados({ resultado: 'deferido' })} />
          <Radio name={nome} label="Indeferido: volta para Pagar" checked={dados.resultado === 'indeferido'} onChange={() => setDados({ resultado: 'indeferido' })} />
        </ChoiceGroup>
      default:
        return null
    }
  }

  const prazoTexto = situacao.proximoPrazo ? `${formatBR(situacao.proximoPrazo)}${urgencia === 'vencido' ? ' · vencido' : dias === 0 ? ' · hoje' : ''}` : '—'
  const lista = feitos(estado, responsavel)

  return (
    <div className="multa-passos">
      <header className="multa-topo" data-urgencia={urgencia}>
        <div className="multa-topo__id">
          <strong>{multa.titulo}</strong>
          <span>{multa.veiculo?.label || 'sem placa'} · {responsavel?.label ?? 'sem responsável'}</span>
        </div>
        <div className="multa-topo__prazo"><small>Próximo prazo</small><b>{prazoTexto}</b></div>
        {mais.length > 0 && <Menu trigger={(props) => <Button variant="ghost" size="compact" icon={<MoreHorizontal size={16} />} aria-label="Mais ações da multa" {...props} />} actions={mais} />}
      </header>

      <ol className="multa-etapas" aria-label="Etapas da multa">
        {BARRA.map((b, i) => {
          const atual = ORDEM[situacao.etapa]
          const classe = atual < 0 ? '' : i < atual ? 'done' : i === atual ? 'active' : ''
          const pulada = b.etapa === 'indicar' && estado.responsavel === RESPONSAVEL.EMPRESA
          const quando = { identificar: null, indicar: estado.aceiteEm ?? estado.dataIndicacao ?? null, pagar: estado.pagaEm ?? null, acertar: estado.acertoEm ?? null }[b.etapa]
          return (
            <li key={b.etapa} className={classe} aria-current={classe === 'active' ? 'step' : undefined}>
              <b>{i + 1}</b><span>{b.rotulo}</span>
              {classe === 'done' && <small>{pulada ? 'pulada' : quando ? formatBR(quando) : 'feito'}</small>}
            </li>
          )
        })}
      </ol>

      {passo ? (
        <section className="multa-passo" data-vencido={passo === 'PrazoVencido' ? '' : undefined} aria-labelledby={`${multa.id}-passo`}>
          <h3 id={`${multa.id}-passo`}>{passo === 'PrazoVencido' ? 'O prazo de indicação venceu' : ROTULO_PASSO[passo]}</h3>
          {campos()}
          {erro && <Alert tone="danger">{erro}</Alert>}
          <div className="frota-cluster">
            <Button variant={passo === 'Cancelar' ? 'danger' : 'primary'} loading={salvando} disabled={faltando !== null} onClick={() => void gravar()}>{BOTAO[passo]}</Button>
            {extra && <Button variant="secondary" disabled={salvando} onClick={() => setExtra(null)}>Voltar</Button>}
          </div>
        </section>
      ) : (
        <p className="frota-muted">{situacao.aguardandoPenalidade ? 'Aguardando a penalidade: a rotina do SNE grava o vencimento e o valor com desconto.' : situacao.etapa === 'cancelada' ? 'Multa cancelada.' : 'Multa encerrada. Nada a fazer.'}</p>
      )}

      {lista.length > 0 && (
        <section className="frota-group" aria-labelledby={`${multa.id}-feitos`}>
          <h3 id={`${multa.id}-feitos`} className="frota-group__title">Feito até agora</h3>
          <dl className="frota-detail">
            {lista.map(([nome, valor]) => (<div key={nome} className="frota-detail__row"><dt>{nome}</dt><dd>{valor}</dd></div>))}
          </dl>
        </section>
      )}
    </div>
  )
}

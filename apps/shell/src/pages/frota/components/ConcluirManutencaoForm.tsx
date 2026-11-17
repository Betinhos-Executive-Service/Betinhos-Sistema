// apps/shell/src/pages/frota/components/ConcluirManutencaoForm.tsx
import { useCallback, useId, useRef, useState } from 'react'
import { Alert, Button, Field, Input, Select, Textarea, Upload, type UploadFile } from '@betinhos/ui'
import { ACCEPT_FOTO, ACCEPT_NOTA } from '../data/arquivosManutencao'
import { LIMITE, PAGAMENTO_MANUT } from '../data/schema'
import { FOTO_MAX_BYTES } from '../data/sharepoint'
import type { DataSource, OpcaoBusca } from '../data/source'
import type { DetalheManutencao } from '../data/types'
import { comPontoFinal } from '../data/xrm'
import { avisoKmMenor, concluirPeloShell, MAX_FOTOS_FINAIS, validarConclusao, valoresConclusaoIniciais, type ErrosConclusao, type ValoresConclusao } from '../domain/conclusao'
import { desfechoDaAcao, executarAcaoManutencao } from '../domain/transitions'
import { GradeServicos } from './GradeServicos'
import { useOpcoesBusca } from './useOpcoesBusca'

const OPCOES_PAGAMENTO = PAGAMENTO_MANUT.map((opcao) => ({ value: String(opcao.value), label: opcao.label }))

type CampoTexto = 'km' | 'data' | 'valor' | 'estabelecimento' | 'servicoRealizado' | 'comentario'

type Props = {
  source: DataSource
  detalhe: DetalheManutencao
  /** Concluída. `avisoNota`: a nota não subiu na despesa (a conclusão vale assim mesmo). */
  onConcluida: (avisoNota: string | null) => void
  onVoltar: () => void
  /** Outra pessoa mudou a manutenção: a gaveta recarrega. */
  onDesatualizada: () => void
}

/** "Concluir" com os mesmos campos do App; grava pelo cr40f_ManutencaoConcluir (manutenção, despesa e linha da Geral). */
export function ConcluirManutencaoForm({ source, detalhe, onConcluida, onVoltar, onDesatualizada }: Props) {
  const [valores, setValores] = useState<ValoresConclusao>(() => valoresConclusaoIniciais(detalhe))
  const [erros, setErros] = useState<ErrosConclusao>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Guarda contra dois envios no mesmo instante: o estado só vale depois da próxima renderização, o ref vale já.
  const emCurso = useRef(false)
  const rotuloServicosId = useId()
  const [cidade, setCidade] = useState<OpcaoBusca | null>(null)
  const [pessoa, setPessoa] = useState<OpcaoBusca | null>(detalhe.realizadoPor ? { id: detalhe.realizadoPor.id, nome: detalhe.realizadoPor.label } : null)
  const cidades = useOpcoesBusca(useCallback((texto: string) => source.buscarCidades(texto), [source]), cidade)
  const pessoas = useOpcoesBusca(useCallback((texto: string) => source.buscarFuncionarios(texto), [source]), pessoa)
  // O aviso de km aparece no campo, ao digitar (e não só ao enviar).
  const avisoKm = avisoKmMenor(valores.km, detalhe.km)
  const set = (patch: Partial<ValoresConclusao>) => setValores((atual) => ({ ...atual, ...patch }))
  const texto = (campo: CampoTexto) => (event: { target: { value: string } }) => set({ [campo]: event.target.value })

  // O Upload devolve os mesmos objetos que recebeu, menos o removido: reconcilia por posição (como no RenovarDrawer).
  const paraUpload = (arquivos: File[]): UploadFile[] => arquivos.map((f) => ({ name: f.name, size: f.size, type: f.type }))
  const reconciliar = (atuais: File[], mostrados: UploadFile[], restantes: UploadFile[], novos: File[]) => [...atuais.filter((_, i) => restantes.includes(mostrados[i])), ...novos]
  const notasUpload = paraUpload(valores.notas)
  const fotosUpload = paraUpload(valores.fotos)

  async function concluir() {
    if (emCurso.current) return
    const leitura = validarConclusao(valores, { manutencaoId: detalhe.id, kmPedido: detalhe.km, temNotaGravada: Boolean(detalhe.linkNotaFiscal) })
    setErros(leitura.erros)
    const pedido = leitura.pedido
    if (!pedido) return
    emCurso.current = true
    setSalvando(true)
    setFalha(null)
    const desfecho = await desfechoDaAcao(() => executarAcaoManutencao(source, { id: detalhe.id, status: detalhe.status }, 'concluir', () => concluirPeloShell(source, detalhe, pedido, { notas: valores.notas, fotos: valores.fotos })))
    emCurso.current = false
    setSalvando(false)
    if (desfecho.tipo === 'feito') onConcluida(desfecho.valor.avisoNota)
    else if (desfecho.tipo === 'desatualizada') onDesatualizada()
    else setFalha(desfecho.mensagem)
  }

  return (
    <form className="frota-stack" noValidate onSubmit={(event) => { event.preventDefault(); void concluir() }}>
      <strong>Concluir</strong>
      <p className="frota-muted">Os mesmos campos do App. Ao concluir, a despesa da manutenção é criada e a linha da Geral é concluída.</p>
      {falha ? <Alert tone="danger" title="Não foi possível concluir">{comPontoFinal(falha)} O que você preencheu foi mantido.</Alert> : null}
      <div className="frota-fields">
        <div className="frota-fields__wide frota-stack">
          <span id={rotuloServicosId} className="frota-campo__rotulo">Serviços realizados *</span>
          <GradeServicos selecionados={valores.servicos} onChange={(servicos) => set({ servicos })} disabled={salvando} erro={erros.servicos} rotuloId={rotuloServicosId} />
        </div>
        <Field label="Km do veículo" required error={erros.km} disabled={salvando} hint={avisoKm ?? (detalhe.km !== null ? `No pedido: ${detalhe.km.toLocaleString('pt-BR')} km` : undefined)}>
          <Input type="number" inputMode="numeric" min={1} step={1} suffix="km" value={valores.km} onChange={texto('km')} />
        </Field>
        <Field label="Data e hora da manutenção" required error={erros.data} disabled={salvando}>
          <Input type="datetime-local" value={valores.data} onChange={texto('data')} />
        </Field>
        <Field label="Valor pago" required error={erros.valor} disabled={salvando}>
          <Input type="number" inputMode="decimal" min={0} step={0.01} prefix="R$" value={valores.valor} onChange={texto('valor')} />
        </Field>
        <Field label="Forma de pagamento" required error={erros.pagamento} disabled={salvando}>
          <Select options={OPCOES_PAGAMENTO} searchable={false} clearable={false} placeholder="Selecione" value={valores.pagamento || null} onChange={(v) => set({ pagamento: v ?? '' })} />
        </Field>
        <Field label="Estabelecimento" required error={erros.estabelecimento} disabled={salvando}>
          <Input maxLength={LIMITE.estabelecimento} value={valores.estabelecimento} onChange={texto('estabelecimento')} />
        </Field>
        <Field label="Cidade" required error={erros.cidadeId} disabled={salvando}>
          <Select options={cidades.opcoes} searchable clearable placeholder="Digite a cidade" loading={cidades.carregando} onSearchChange={cidades.onSearch} value={valores.cidadeId || null}
            onChange={(v) => { setCidade(cidades.lista.find((o) => o.id === v) ?? null); set({ cidadeId: v ?? '' }) }} />
        </Field>
        <Field label="Quem realizou" required error={erros.realizadoPorId} disabled={salvando}>
          <Select options={pessoas.opcoes} searchable clearable placeholder="Digite o nome" loading={pessoas.carregando} onSearchChange={pessoas.onSearch} value={valores.realizadoPorId || null}
            onChange={(v) => { setPessoa(pessoas.lista.find((o) => o.id === v) ?? null); set({ realizadoPorId: v ?? '' }) }} />
        </Field>
        <Field label="Serviço realizado (texto livre)" error={erros.servicoRealizado} disabled={salvando}>
          <Input maxLength={LIMITE.servicoRealizado} value={valores.servicoRealizado} onChange={texto('servicoRealizado')} />
        </Field>
        <Field className="frota-fields__wide" label="Comentário" error={erros.comentario} disabled={salvando}>
          <Textarea rows={3} maxLength={LIMITE.comentarioColaborador} value={valores.comentario} onChange={texto('comentario')} />
        </Field>
        <div className="frota-fields__wide frota-stack">
          <Upload
            label="Nota fiscal"
            hint={detalhe.linkNotaFiscal ? 'Já há nota gravada; anexe outra só para trocar. JPG, PNG, WEBP ou PDF, até 10 MB cada.' : 'Obrigatória. JPG, PNG, WEBP ou PDF, até 10 MB cada.'}
            accept={ACCEPT_NOTA}
            maxSize={FOTO_MAX_BYTES}
            files={notasUpload}
            disabled={salvando}
            onChange={(files, added) => set({ notas: reconciliar(valores.notas, notasUpload, files, added) })}
          />
          {erros.notas ? <p className="frota-erro" role="alert">{erros.notas}</p> : null}
        </div>
        <div className="frota-fields__wide frota-stack">
          <Upload
            label="Fotos da manutenção"
            hint={`Opcional, até ${MAX_FOTOS_FINAIS}. JPG, PNG ou WEBP, até 10 MB cada.`}
            accept={ACCEPT_FOTO}
            maxSize={FOTO_MAX_BYTES}
            maxFiles={MAX_FOTOS_FINAIS}
            files={fotosUpload}
            disabled={salvando}
            onChange={(files, added) => set({ fotos: reconciliar(valores.fotos, fotosUpload, files, added) })}
          />
          {erros.fotos ? <p className="frota-erro" role="alert">{erros.fotos}</p> : null}
        </div>
      </div>
      <div className="frota-cluster">
        <Button type="submit" loading={salvando}>Concluir manutenção</Button>
        <Button variant="secondary" disabled={salvando} onClick={onVoltar}>Voltar</Button>
      </div>
    </form>
  )
}

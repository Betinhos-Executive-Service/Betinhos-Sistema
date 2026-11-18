// apps/shell/src/pages/frota/components/EditarManutencaoForm.tsx
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Field, Input, Select, Textarea } from '@betinhos/ui'
import { GRAU, LIMITE, TIPO_REPARO } from '../data/schema'
import type { DataSource, OpcaoBusca } from '../data/source'
import type { DetalheManutencao } from '../data/types'
import { comPontoFinal } from '../data/xrm'
import { houveEdicao, lerEdicao, temConclusao, valoresEdicaoIniciais, type ErrosEdicao, type ValoresEdicao } from '../domain/editarManutencao'
import { Bloco } from './ManutencaoResumo'
import { useGravar } from './ManutencaoPassoAPasso'
import { useOpcoesBusca } from './useOpcoesBusca'

const OPCOES_GRAU = GRAU.map((o) => ({ value: String(o.value), label: o.label }))
const OPCOES_TIPO = TIPO_REPARO.map((o) => ({ value: String(o.value), label: o.label }))

type Props = {
  source: DataSource
  m: DetalheManutencao
  onSalvo: () => void
  onVoltar: () => void
  onDesatualizada: () => void
  /** Avisa a gaveta se há alteração pendente e se está gravando (clique fora e Esc dependem disso). */
  onEstado: (estado: { sujo: boolean; salvando: boolean }) => void
}

/** Edição de todos os campos da manutenção (menos o status) no lugar do formulário nativo; grava só o que mudou, num PATCH. */
export function EditarManutencaoForm({ source, m, onSalvo, onVoltar, onDesatualizada, onEstado }: Props) {
  const [inicial] = useState(() => valoresEdicaoIniciais(m))
  const [valores, setValores] = useState<ValoresEdicao>(inicial)
  const [erros, setErros] = useState<ErrosEdicao>({})
  const { salvando, erro, gravar } = useGravar(onDesatualizada)
  const [veiculo, setVeiculo] = useState<OpcaoBusca | null>(m.veiculo ? { id: m.veiculo.id, nome: m.veiculo.label } : null)
  const [solicitante, setSolicitante] = useState<OpcaoBusca | null>(m.solicitante ? { id: m.solicitante.id, nome: m.solicitante.label } : null)
  const veiculos = useOpcoesBusca(useCallback((t: string) => source.buscarVeiculos(t), [source]), veiculo)
  const pessoas = useOpcoesBusca(useCallback((t: string) => source.buscarFuncionarios(t), [source]), solicitante)
  const conclusao = temConclusao(m)
  const sujo = houveEdicao(inicial, valores)
  useEffect(() => { onEstado({ sujo, salvando }) }, [sujo, salvando, onEstado])
  const set = (patch: Partial<ValoresEdicao>) => setValores((atual) => ({ ...atual, ...patch }))
  const texto = (campo: keyof ValoresEdicao) => (event: { target: { value: string } }) => set({ [campo]: event.target.value })

  async function salvar() {
    if (salvando || !sujo) return
    const janelaMudou = valores.janelaInicio !== inicial.janelaInicio || valores.janelaFim !== inicial.janelaFim
    let comportamentos = {}
    if (janelaMudou) {
      try { comportamentos = await source.dateBehaviors('manutencao') } catch { /* a coluna é só data: vale o padrão */ }
    }
    const leitura = lerEdicao(inicial, valores, conclusao, comportamentos)
    setErros(leitura.erros)
    if (Object.keys(leitura.erros).length || !Object.keys(leitura.patch).length) return
    await gravar(() => source.update('manutencao', m.id, leitura.patch), onSalvo)
  }

  return (
    <form className="frota-stack" noValidate onSubmit={(event) => { event.preventDefault(); void salvar() }}>
      <strong>Editar manutenção</strong>
      {erro ? <Alert tone="danger" title="Não foi possível gravar">{comPontoFinal(erro)} O que você alterou foi mantido.</Alert> : null}
      <Bloco titulo="Pedido">
        <div className="frota-fields">
          <Field label="Veículo" required error={erros.veiculoId} disabled={salvando}>
            <Select options={veiculos.opcoes} searchable clearable={false} placeholder="Selecione o veículo" loading={veiculos.carregando} onSearchChange={veiculos.onSearch} value={valores.veiculoId || null}
              onChange={(v) => { setVeiculo(veiculos.lista.find((o) => o.id === v) ?? null); set({ veiculoId: v ?? '' }) }} />
          </Field>
          <Field label="Solicitante" error={erros.solicitanteId} disabled={salvando}>
            <Select options={pessoas.opcoes} searchable clearable={false} placeholder="Selecione" loading={pessoas.carregando} onSearchChange={pessoas.onSearch} value={valores.solicitanteId || null}
              onChange={(v) => { setSolicitante(pessoas.lista.find((o) => o.id === v) ?? null); set({ solicitanteId: v ?? '' }) }} />
          </Field>
          <Field className="frota-fields__wide" label="Descrição do problema" required error={erros.descricao} disabled={salvando}>
            <Textarea rows={3} maxLength={LIMITE.descricao} value={valores.descricao} onChange={texto('descricao')} />
          </Field>
          <Field label="Km no pedido" error={erros.km} disabled={salvando}>
            <Input type="number" inputMode="numeric" min={1} step={1} suffix="km" value={valores.km} onChange={texto('km')} />
          </Field>
          <Field label="Tipo de reparo" disabled={salvando}>
            <Select options={OPCOES_TIPO} searchable={false} clearable placeholder="Opcional" value={valores.tipo || null} onChange={(v) => set({ tipo: v ?? '' })} />
          </Field>
          <Field label="Grau" required error={erros.grau} disabled={salvando}>
            <Select options={OPCOES_GRAU} searchable={false} clearable={false} placeholder="Selecione" value={valores.grau || null} onChange={(v) => set({ grau: v ?? '' })} />
          </Field>
          <Field className="frota-fields__wide" label="Comentário ao motorista" error={erros.comentario} disabled={salvando}>
            <Textarea rows={2} maxLength={LIMITE.comentarioAprovador} value={valores.comentario} onChange={texto('comentario')} />
          </Field>
        </div>
      </Bloco>
      <Bloco titulo="Agenda">
        <div className="frota-fields">
          <Field label="Início da janela" error={erros.janelaInicio} disabled={salvando}>
            <Input type="date" value={valores.janelaInicio} onChange={texto('janelaInicio')} />
          </Field>
          <Field label="Fim da janela" error={erros.janelaFim} disabled={salvando}>
            <Input type="date" value={valores.janelaFim} onChange={texto('janelaFim')} />
          </Field>
        </div>
      </Bloco>
      {conclusao ? (
        <Bloco titulo="Conclusão">
          <div className="frota-fields">
            <Field label="Data e hora da manutenção" error={erros.dataManutencao} disabled={salvando}>
              <Input type="datetime-local" value={valores.dataManutencao} onChange={texto('dataManutencao')} />
            </Field>
            <Field label="Km realizado" error={erros.kmRealizado} disabled={salvando}>
              <Input type="number" inputMode="numeric" min={1} step={1} suffix="km" value={valores.kmRealizado} onChange={texto('kmRealizado')} />
            </Field>
            <Field label="Valor pago" error={erros.valor} disabled={salvando}>
              <Input type="number" inputMode="decimal" min={0} step={0.01} prefix="R$" value={valores.valor} onChange={texto('valor')} />
            </Field>
            <Field label="Estabelecimento" error={erros.estabelecimento} disabled={salvando}>
              <Input maxLength={LIMITE.estabelecimento} value={valores.estabelecimento} onChange={texto('estabelecimento')} />
            </Field>
            <Field className="frota-fields__wide" label="Serviço realizado" error={erros.servicoRealizado} disabled={salvando}>
              <Input maxLength={LIMITE.servicoRealizado} value={valores.servicoRealizado} onChange={texto('servicoRealizado')} />
            </Field>
          </div>
        </Bloco>
      ) : null}
      <div className="frota-cluster">
        <Button type="submit" loading={salvando} disabled={!sujo}>Salvar</Button>
        <Button variant="secondary" disabled={salvando} onClick={onVoltar}>Voltar</Button>
      </div>
    </form>
  )
}

// apps/shell/src/pages/frota/components/NovaManutencaoDrawer.tsx
import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Drawer, Field, Input, Select, Textarea } from '@betinhos/ui'
import { todaySP } from '../data/dates'
import { GRAU, LIMITE, MANUT, TIPO_REPARO, VEICULO } from '../data/schema'
import type { DataSource, OpcaoBusca } from '../data/source'
import type { Veiculo } from '../data/types'
import { comPontoFinal } from '../data/xrm'
import { rotuloJanela } from '../domain/janela'
import { validarNova, valoresNovaIniciais, type ErrosNova, type ValoresNova } from '../domain/novaManutencao'
import { desfechoDaAcao, executarAcaoManutencao, StaleError } from '../domain/transitions'
import { JanelaCampos } from './JanelaCampos'
import { useNotify } from './Toasts'
import { useOpcoesBusca } from './useOpcoesBusca'

const OPCOES_GRAU = GRAU.map((o) => ({ value: String(o.value), label: o.label }))
const OPCOES_TIPO = TIPO_REPARO.map((o) => ({ value: String(o.value), label: o.label }))

type Props = {
  source: DataSource
  veiculos: Veiculo[]
  /** `YYYY-MM-DD`. Padrão: hoje em São Paulo. */
  hoje?: string
  onClose: () => void
  /** Manutenção criada (mesmo que o encaixe opcional tenha falhado: ela fica Solicitada): quem abriu abre a gaveta dela. */
  onCriada: (id: string) => void
}

/** "Nova manutenção" no lugar do formulário nativo: cria Solicitada e, se o gestor quiser, já encaixa. */
export function NovaManutencaoDrawer({ source, veiculos, hoje = todaySP(), onClose, onCriada }: Props) {
  const notify = useNotify()
  const formId = useId()
  const [valores, setValores] = useState<ValoresNova>(() => valoresNovaIniciais(hoje))
  const [erros, setErros] = useState<ErrosNova>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Guarda contra dois envios no mesmo instante: o estado só vale depois da próxima renderização, o ref vale já.
  const emCurso = useRef(false)
  const [solicitante, setSolicitante] = useState<OpcaoBusca | null>(null)
  const pessoas = useOpcoesBusca(useCallback((texto: string) => source.buscarFuncionarios(texto), [source]), solicitante)
  const opcoesVeiculos = useMemo(
    () => veiculos.filter((v) => v.status !== VEICULO.VENDIDO).sort((a, b) => a.placa.localeCompare(b.placa)).map((v) => ({ value: v.id, label: [v.placa, v.modelo].filter(Boolean).join(' · ') })),
    [veiculos],
  )
  const set = (patch: Partial<ValoresNova>) => setValores((atual) => ({ ...atual, ...patch }))

  function escolherVeiculo(id: string | null) {
    const veiculo = veiculos.find((v) => v.id === id)
    // Com hodômetro do Infleet, o km do pedido já vem preenchido (o gestor pode corrigir).
    setValores((atual) => ({ ...atual, veiculoId: id ?? '', ...(veiculo?.hodometro && !atual.km ? { km: String(Math.round(veiculo.hodometro)) } : {}) }))
  }

  async function criar() {
    if (emCurso.current) return
    const leitura = validarNova(valores, hoje)
    setErros(leitura.erros)
    const input = leitura.input
    if (!input) return
    emCurso.current = true
    setSalvando(true)
    setFalha(null)
    const criada = await desfechoDaAcao(() => source.criarManutencao(input))
    if (criada.tipo !== 'feito') {
      emCurso.current = false
      setSalvando(false)
      setFalha(criada.tipo === 'falha' ? criada.mensagem : new StaleError().message)
      return
    }
    const id = criada.valor
    if (leitura.encaixe) {
      const { janela, comentario } = leitura.encaixe
      // Recém-criada: está Solicitada. Se o encaixe falhar, ela continua Solicitada e a gaveta dela abre para encaixar de novo.
      const encaixada = await desfechoDaAcao(() => executarAcaoManutencao(source, { id, status: MANUT.SOLICITADO }, 'encaixar', () => source.agendarManutencao({ manutencaoId: id, inicio: janela.inicio, fim: janela.fim, comentario })))
      if (encaixada.tipo === 'feito') notify('success', `Manutenção criada e encaixada: ${rotuloJanela(janela)}.`)
      else notify('error', `A manutenção foi criada, mas o encaixe falhou: ${comPontoFinal(encaixada.tipo === 'falha' ? encaixada.mensagem : new StaleError().message)} Encaixe pela gaveta dela.`)
    } else notify('success', 'Manutenção criada. Ela está na fila A encaixar.')
    emCurso.current = false
    setSalvando(false)
    onCriada(id)
  }

  return (
    <Drawer
      open
      onClose={() => { if (!salvando) onClose() }}
      eyebrow="Manutenção"
      title="Nova manutenção"
      footer={<>
        <Button variant="secondary" disabled={salvando} onClick={onClose}>Cancelar</Button>
        <Button type="submit" form={formId} loading={salvando}>{valores.encaixar ? 'Criar e encaixar' : 'Criar manutenção'}</Button>
      </>}
    >
      <form id={formId} className="frota-stack" noValidate onSubmit={(event) => { event.preventDefault(); void criar() }}>
        {falha ? <Alert tone="danger" title="Não foi possível criar">{comPontoFinal(falha)} O que você preencheu foi mantido.</Alert> : null}
        <div className="frota-fields">
          <Field className="frota-fields__wide" label="Veículo" required error={erros.veiculoId} disabled={salvando}>
            <Select options={opcoesVeiculos} searchable clearable placeholder="Selecione o veículo" value={valores.veiculoId || null} onChange={escolherVeiculo} />
          </Field>
          <Field className="frota-fields__wide" label="Descrição do problema" required error={erros.descricao} disabled={salvando}>
            <Textarea rows={3} maxLength={LIMITE.descricao} value={valores.descricao} onChange={(event) => set({ descricao: event.target.value })} />
          </Field>
          <Field label="Grau" required error={erros.grau} disabled={salvando}>
            <Select options={OPCOES_GRAU} searchable={false} clearable={false} placeholder="Selecione" value={valores.grau || null} onChange={(v) => set({ grau: v ?? '' })} />
          </Field>
          <Field label="Tipo de reparo" disabled={salvando}>
            <Select options={OPCOES_TIPO} searchable={false} clearable placeholder="Opcional" value={valores.tipo || null} onChange={(v) => set({ tipo: v ?? '' })} />
          </Field>
          <Field label="Km atual" required error={erros.km} disabled={salvando}>
            <Input type="number" inputMode="numeric" min={1} step={1} suffix="km" value={valores.km} onChange={(event) => set({ km: event.target.value })} />
          </Field>
          <Field label="Quem pediu" disabled={salvando}>
            <Select options={pessoas.opcoes} searchable clearable placeholder="Opcional" loading={pessoas.carregando} onSearchChange={pessoas.onSearch} value={valores.solicitanteId || null}
              onChange={(v) => { setSolicitante(pessoas.lista.find((o) => o.id === v) ?? null); set({ solicitanteId: v ?? '' }) }} />
          </Field>
          <div className="frota-fields__wide">
            <Checkbox label="Já encaixar num dia ou numa semana" checked={valores.encaixar} disabled={salvando} onChange={() => set({ encaixar: !valores.encaixar })} />
          </div>
        </div>
        {valores.encaixar ? <JanelaCampos valores={valores.janela} erros={erros.janela ?? {}} hoje={hoje} disabled={salvando} onChange={(janela) => set({ janela })} /> : null}
      </form>
    </Drawer>
  )
}

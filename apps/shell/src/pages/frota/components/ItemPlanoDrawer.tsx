import { useState } from 'react'
import { Button, Drawer, Field, Input, Select } from '@betinhos/ui'
import { AVISO_PADRAO } from '../data/schema'
import type { DataSource, ItemPlanoInput } from '../data/source'
import type { ItemPlano } from '../data/types'
import { errorMessage } from '../data/xrm'
import { SERVICOS_MANUT } from '../domain/manutencaoCatalogo'
import { useNotify } from './Toasts'

type Campo = 'nome' | 'servico' | 'intervaloKm' | 'intervaloMeses' | 'avisoKm' | 'avisoDias'
type Valores = Record<Campo, string>
type Erros = Partial<Record<Campo, string>>

const OPCOES = SERVICOS_MANUT.map((servico) => ({ value: String(servico.value), label: servico.label }))
const texto = (value: number | null | undefined) => (value == null ? '' : String(value))
const inteiro = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : null)

function valoresIniciais(item: ItemPlano | null): Valores {
  return {
    nome: item?.nome ?? '',
    servico: texto(item?.servico),
    intervaloKm: texto(item?.intervaloKm),
    intervaloMeses: texto(item?.intervaloMeses),
    avisoKm: String(item?.avisoKm ?? AVISO_PADRAO.km),
    avisoDias: String(item?.avisoDias ?? AVISO_PADRAO.dias),
  }
}

/** Valida o formulário; devolve os erros por campo ou o item pronto para gravar. */
function validar(v: Valores): { erros: Erros; input: ItemPlanoInput | null } {
  const erros: Erros = {}
  if (!v.nome.trim()) erros.nome = 'Informe o nome'
  if (!v.servico) erros.servico = 'Escolha o serviço'
  const intervalo = (campo: 'intervaloKm' | 'intervaloMeses') => {
    if (!v[campo].trim()) return null
    const n = inteiro(v[campo])
    if (n === null || n < 1) erros[campo] = 'Use um número inteiro maior que zero'
    return n
  }
  const intervaloKm = intervalo('intervaloKm')
  const intervaloMeses = intervalo('intervaloMeses')
  if (!v.intervaloKm.trim() && !v.intervaloMeses.trim()) erros.intervaloKm = 'Informe ao menos um intervalo (km ou meses)'
  const aviso = (campo: 'avisoKm' | 'avisoDias') => {
    const n = inteiro(v[campo])
    if (n === null) erros[campo] = 'Use um número inteiro a partir de zero'
    return n ?? 0
  }
  const avisoKm = aviso('avisoKm')
  const avisoDias = aviso('avisoDias')
  if (Object.keys(erros).length) return { erros, input: null }
  return { erros, input: { nome: v.nome.trim(), servico: Number(v.servico), intervaloKm, intervaloMeses, avisoKm, avisoDias } }
}

export function ItemPlanoDrawer({ source, item, onClose, onSaved }: { source: DataSource; item: ItemPlano | null; onClose: () => void; onSaved: () => void }) {
  const notify = useNotify()
  const [valores, setValores] = useState(() => valoresIniciais(item))
  const [erros, setErros] = useState<Erros>({})
  const [salvando, setSalvando] = useState<'salvar' | 'situacao' | null>(null)
  const ocupado = salvando !== null
  const set = (campo: Campo) => (event: { target: { value: string } }) => setValores((atual) => ({ ...atual, [campo]: event.target.value }))

  async function gravar(acao: 'salvar' | 'situacao', executar: () => Promise<void>, mensagem: string) {
    setSalvando(acao)
    try {
      await executar()
      notify('success', mensagem)
      onSaved()
    } catch (reason) {
      notify('error', errorMessage(reason))
      setSalvando(null)
    }
  }

  function salvar() {
    const { erros: novos, input } = validar(valores)
    setErros(novos)
    if (input) void gravar('salvar', () => source.salvarItemPlano(input, item?.id), 'Item salvo.')
  }

  function alternarSituacao() {
    if (item) void gravar('situacao', () => source.inativarItemPlano(item.id, !item.ativo), item.ativo ? 'Item inativado.' : 'Item reativado.')
  }

  const numero = (campo: Campo, rotulo: string, min: number, sufixo: string) => (
    <Field label={rotulo} error={erros[campo]} disabled={ocupado}>
      <Input type="number" inputMode="numeric" min={min} step={1} suffix={sufixo} value={valores[campo]} onChange={set(campo)} />
    </Field>
  )

  return (
    <Drawer
      open
      size="default"
      onClose={() => { if (!ocupado) onClose() }}
      eyebrow="Plano preventivo"
      title={item ? item.nome : 'Novo item'}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={ocupado}>Cancelar</Button>
        {item ? <Button variant="secondary" onClick={alternarSituacao} loading={salvando === 'situacao'} disabled={ocupado}>{item.ativo ? 'Inativar' : 'Reativar'}</Button> : null}
        <Button onClick={salvar} loading={salvando === 'salvar'} disabled={ocupado}>Salvar</Button>
      </>}
    >
      <div className="frota-fields">
        <Field className="frota-fields__wide" label="Nome" required error={erros.nome} disabled={ocupado}>
          <Input maxLength={100} value={valores.nome} onChange={set('nome')} />
        </Field>
        <Field className="frota-fields__wide" label="Serviço" required error={erros.servico} disabled={ocupado}>
          <Select options={OPCOES} searchable placeholder="Selecione" value={valores.servico || null} onChange={(next) => setValores((atual) => ({ ...atual, servico: next ?? '' }))} />
        </Field>
        {numero('intervaloKm', 'Intervalo em km', 1, 'km')}
        {numero('intervaloMeses', 'Intervalo em meses', 1, 'meses')}
        {numero('avisoKm', 'Avisar faltando (km)', 0, 'km')}
        {numero('avisoDias', 'Avisar faltando (dias)', 0, 'dias')}
      </div>
      <p className="frota-muted">Informe ao menos um intervalo; vence o que chegar primeiro.</p>
    </Drawer>
  )
}

import { useState } from 'react'
import { Button, Drawer, Field, Input } from '@betinhos/ui'
import type { DataSource } from '../data/source'
import type { ItemPlano, Veiculo } from '../data/types'
import { errorMessage } from '../data/xrm'
import { useNotify } from './Toasts'

type Erros = { km?: string; data?: string }

/** Valida km (inteiro ≥ 0) e data (até hoje); ao menos um dos dois. */
function validar(km: string, data: string, today: string): { erros: Erros; valores: { km: number | null; data: string | null } | null } {
  const erros: Erros = {}
  const kmTexto = km.trim()
  const kmNumero = /^\d+$/.test(kmTexto) ? Number(kmTexto) : null
  if (kmTexto && kmNumero === null) erros.km = 'Use um número inteiro a partir de zero'
  if (data && data > today) erros.data = 'A data não pode ser depois de hoje'
  if (!kmTexto && !data) erros.km = 'Informe o km ou a data'
  if (erros.km || erros.data) return { erros, valores: null }
  return { erros, valores: { km: kmNumero, data: data || null } }
}

export function BaselineDrawer({ source, veiculo, item, today, onClose, onSaved }: { source: DataSource; veiculo: Veiculo; item: ItemPlano; today: string; onClose: () => void; onSaved: () => void }) {
  const notify = useNotify()
  const [km, setKm] = useState('')
  const [data, setData] = useState('')
  const [erros, setErros] = useState<Erros>({})
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (salvando) return
    const { erros: novos, valores } = validar(km, data, today)
    setErros(novos)
    if (!valores) return
    setSalvando(true)
    try {
      await source.salvarBaseline(veiculo.id, item.id, valores.km, valores.data)
      notify('success', 'Última execução registrada.')
      onSaved()
    } catch (reason) {
      notify('error', errorMessage(reason))
      setSalvando(false)
    }
  }

  return (
    <Drawer
      open
      size="default"
      onClose={() => { if (!salvando) onClose() }}
      eyebrow={veiculo.placa}
      title={item.nome}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button onClick={() => void salvar()} loading={salvando} disabled={salvando}>Salvar</Button>
      </>}
    >
      <div className="frota-fields">
        <Field label="Km" error={erros.km} disabled={salvando}>
          <Input type="number" inputMode="numeric" min={0} step={1} suffix="km" value={km} onChange={(event) => setKm(event.target.value)} />
        </Field>
        <Field label="Data" error={erros.data} disabled={salvando}>
          <Input type="date" max={today} value={data} onChange={(event) => setData(event.target.value)} />
        </Field>
      </div>
      <p className="frota-muted">Informe quando este item foi feito pela última vez: o km, a data ou os dois.</p>
    </Drawer>
  )
}

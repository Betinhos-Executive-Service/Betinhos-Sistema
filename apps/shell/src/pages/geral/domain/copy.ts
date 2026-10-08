import { formatted, type Row } from '@betinhos/dataverse'
import { TZ } from './format'

export const COPY_SELECT = [
  'cr40f_reservadeveculosid', 'cr40f_dataehorriodesada', 'cr40f_id', '_cr40f_cliente_value', 'cr40f_receber', 'cr40f_trajeto',
  'cr40f_passageirosetelefonedecontato', 'cr40f_endereodesada', 'cr40f_destino', 'cr40f_obsdeoperao', 'cr40f_perfildopassageiro',
]

const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const hour = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const date = (v: unknown) => { const d = typeof v === 'string' ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null }
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '—')

/** Mesmo bloco do WebResource new_ScriptCopiarServicos (texto para WhatsApp), um serviço por bloco, por data. */
export function copyText(rows: Row[]) {
  return [...rows]
    .sort((a, b) => (date(a.cr40f_dataehorriodesada)?.getTime() ?? 0) - (date(b.cr40f_dataehorriodesada)?.getTime() ?? 0))
    .map((r) => {
      const d = date(r.cr40f_dataehorriodesada)
      const receber = r.cr40f_receber === true ? '✓' : r.cr40f_receber === false ? '✗' : '—'
      return [
        `*Data:* ${d ? dateTime.format(d).replace(',', '') : '—'}`,
        `*ID:* ${text(r.cr40f_id)}`,
        `*Horário:* ${d ? hour.format(d) : '—'}`,
        `*Cliente:* ${r._cr40f_cliente_value ? formatted(r, '_cr40f_cliente_value') || '—' : '—'}`,
        `*Receber:* ${receber}`,
        `*Trajeto:* ${text(r.cr40f_trajeto)}`,
        `*Passageiro:* ${text(r.cr40f_passageirosetelefonedecontato)}`,
        `*Local de saída:* ${text(r.cr40f_endereodesada)}`,
        `*Destino:* ${text(r.cr40f_destino)}`,
        `*Obs ao motorista:* ${text(r.cr40f_obsdeoperao)}`,
        `*Perfil do Passageiro:* ${text(r.cr40f_perfildopassageiro)}`,
      ].join('\n')
    })
    .join('\n\n')
}

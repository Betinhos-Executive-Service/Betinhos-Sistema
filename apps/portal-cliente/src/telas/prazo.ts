import { data, dataHora, diaBr } from '../domain/formato'
import { aguardaCliente, diasUteisRestantes } from '../domain/regras'
import type { Servico } from '../domain/types'

/** Texto completo da aprovação, para o rodapé do detalhe. */
export function textoAprovacao(s: Servico): string {
  return s.status === 'aprovado_tacito'
    ? `Aprovado automaticamente em ${diaBr(s.prazoTacito)}, sem dúvidas no prazo.`
    : `Aprovado por ${s.aprovadoPor ?? 'Tenaris'}${s.aprovadoEm ? ` em ${dataHora(s.aprovadoEm)}` : ''}`
}

export type Prazo = { texto: string; curto: boolean }

/** Situação do prazo da aprovação automática num instante. `curto` = falta 1 dia útil ou menos. */
export function calcularPrazo(s: Servico, agoraIso: string): Prazo {
  switch (s.status) {
    case 'em_duvida':
      return { texto: 'Prazo parado: aguardando a Betinhos', curto: false }
    case 'aprovado':
      return { texto: s.aprovadoEm ? `Aprovado em ${data(s.aprovadoEm)}` : 'Aprovado', curto: false }
    case 'aprovado_tacito':
      return { texto: `Aprovado automaticamente em ${diaBr(s.prazoTacito)}`, curto: false }
  }
  const n = diasUteisRestantes(s.prazoTacito, agoraIso)
  const texto = n === 0 ? 'Aprovação automática hoje' : `Aprovação automática em ${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`
  return { texto, curto: aguardaCliente(s) && n <= 1 }
}

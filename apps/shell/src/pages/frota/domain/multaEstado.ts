import { RESPONSAVEL } from '../data/schema'
import type { Multa, Ref } from '../data/types'
import { avaliar, responsavelEfetivo, type MultaEstado, type Situacao } from './multaEtapas'

/** O espelho das regras testa `== null`: texto vazio contaria como "tem data". */
const dia = (valor: string | null | undefined) => valor || null

/** Multa da tela → estado que as regras (multaEtapas.ts) leem. */
export function estadoDaMulta(m: Multa): MultaEstado {
  return {
    status: m.status, responsavel: m.responsavel ?? null, motoristaId: m.motorista?.id ?? null, motivoEmpresa: m.motivoEmpresa ?? null,
    dataParaIndicar: dia(m.dataParaIndicar), dataAviso: dia(m.dataAviso), canal: m.canal ?? null, dataIndicacao: dia(m.dataIndicacao), indicado: m.indicado,
    aceiteEm: dia(m.aceiteEm), vencimento: dia(m.vencimento), pagaEm: dia(m.pagaEm), valorPago: m.valorPago ?? null,
    competencia: dia(m.competencia), acertoEm: dia(m.acertoEm), encerradaEm: dia(m.encerradaEm), canceladaEm: dia(m.canceladaEm),
    motivoCancelamento: m.motivoCancelamento || null, recursoPendente: m.recursoPendente,
  }
}

export const situacaoDaMulta = (m: Multa, hoje: string): Situacao => avaliar(estadoDaMulta(m), hoje)

export const EMPRESA: Ref = { id: 'empresa', label: 'Empresa' }

/** Quem responde pela multa: Empresa, ou o motorista (nas antigas sem responsável, o do lookup). */
export function responsavelDaMulta(m: Multa): Ref | null {
  return responsavelEfetivo(estadoDaMulta(m)) === RESPONSAVEL.EMPRESA ? EMPRESA : m.motorista
}

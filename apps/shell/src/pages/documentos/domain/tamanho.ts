import { DOC_MAX_BYTES } from '../../funcionarios/data/sharepoint'
import type { TipoDoc } from './types'

/** Contrato escaneado passa de 10 MB; 25 MB foi testado nos flows Salvar e Consultar do PROD (24/11/2026, arquivos de 16 MB). */
export const CONTRATO_MAX_BYTES = 25 * 1024 * 1024

export const maxBytesDoTipo = (tipo: Pick<TipoDoc, 'codigo'>) => (tipo.codigo === 'CONTRATO' ? CONTRATO_MAX_BYTES : DOC_MAX_BYTES)

export const mbDoTipo = (tipo: Pick<TipoDoc, 'codigo'>) => Math.round(maxBytesDoTipo(tipo) / 1024 / 1024)

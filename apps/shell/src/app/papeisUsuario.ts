import { cleanId } from '@betinhos/dataverse'

/** Papéis de administrador do ambiente (o Renan); o nome muda com o idioma do ambiente. */
export const PAPEIS_RENAN = ['System Administrator', 'Administrador do Sistema']
export const papeisPath = (userId: string) => `systemusers(${cleanId(userId)})/systemuserroles_association?$select=name`

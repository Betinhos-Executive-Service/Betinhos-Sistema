// Prazo para pedir e para cancelar, por cliente: a regra pura está em `src/domain/prazos.ts`; aqui só a leitura das colunas.
import { PRAZOS_PADRAO, resolverPrazos, type Prazos } from '../src/domain/prazos'
import { tolerante } from './aprovacao'
import type { Dv } from './dataverse'
import { clientePrazos } from './odata'

/** Para validar (pedir e cancelar): coluna ausente = padrão; qualquer outra falha sobe, para um erro passageiro não liberar o que o prazo barraria. */
export const prazosDoCliente = (dv: Dv, clienteId: string): Promise<Prazos> =>
  tolerante(async () => {
    const c = await dv.get(clientePrazos(clienteId))
    return resolverPrazos({ antecedenciaPedido: c.cr40f_portalantecedenciapedido, prazoCancelar: c.cr40f_portalprazocancelar, contato: c.cr40f_portalcontato })
  }, PRAZOS_PADRAO, 'prazos')

/** Para a resposta de sessão: só informa o front, quem barra é o Worker. Falha de leitura = padrão, o login não depende disso. */
export const prazosDaSessao = (dv: Dv, clienteId: string): Promise<Prazos> => prazosDoCliente(dv, clienteId).catch(() => PRAZOS_PADRAO)

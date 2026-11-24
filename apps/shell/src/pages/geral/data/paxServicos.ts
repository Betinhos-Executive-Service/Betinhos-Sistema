import { useEffect, useState } from 'react'
import { chunk, cleanId, formatted, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'

/** Tabela de relacionamento serviço ↔ passageiro (mesma leitura do Resumo Operacional). */
const ENTITY_SET = 'cr40f_servicosporpassageiros'

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? ''

const NOMES_EXEMPLO = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Helena', 'Igor', 'Júlia', 'Marcos']

/** Exemplo determinístico para o modo mock: 0 a 3 passageiros por serviço. */
function paxExemplo(ids: string[]) {
  const mapa = new Map<string, string[]>()
  for (const id of ids) {
    const n = [...id].reduce((soma, c) => soma + c.charCodeAt(0), 0)
    mapa.set(id, Array.from({ length: n % 4 }, (_, i) => NOMES_EXEMPLO[(n + i * 3) % NOMES_EXEMPLO.length]))
  }
  return mapa
}

/** Primeiro nome de cada passageiro vinculado, na ordem de seleção, por serviço (`cr40f_reservadeveculosid`). */
export async function carregarPax(host: Host, ids: string[]): Promise<Map<string, string[]>> {
  if (host.mode !== 'dataverse') return paxExemplo(ids)
  const mapa = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const bloco of chunk(ids, 10)) {
    const filtro = bloco.map((id) => `_cr40f_geral_value eq ${id}`).join(' or ')
    const linhas: Row[] = await host.client.getAll(`${ENTITY_SET}?$select=cr40f_ordemdeselecao,_cr40f_geral_value,_cr40f_bancodedados_value&$filter=${encodeURIComponent(filtro)}&$orderby=cr40f_ordemdeselecao asc`)
    for (const linha of linhas) {
      const servico = typeof linha._cr40f_geral_value === 'string' ? cleanId(linha._cr40f_geral_value) : null
      const nome = primeiroNome(formatted(linha, '_cr40f_bancodedados_value'))
      if (servico && nome) mapa.get(servico)?.push(nome)
    }
  }
  return mapa
}

/** Passageiros dos serviços na tela; `undefined` enquanto não carregou ou quando `ativo` é falso. Falha só deixa sem nomes. */
export function usePaxServicos(host: Host, ids: string[], ativo: boolean) {
  const [mapa, setMapa] = useState<Map<string, string[]>>()
  const chave = ativo ? ids.join(',') : ''
  useEffect(() => {
    if (!chave) { setMapa(undefined); return }
    let vivo = true
    carregarPax(host, chave.split(',')).then((m) => { if (vivo) setMapa(m) }, () => { if (vivo) setMapa(new Map()) })
    return () => { vivo = false }
  }, [host, chave])
  return mapa
}

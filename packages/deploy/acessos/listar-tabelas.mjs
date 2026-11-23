// Somente leitura: lista as tabelas customizadas do ambiente para o catalogo usado pelo teste do mapa de acessos.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const url = process.env.DV_URL?.replace(/\/$/, '')
const token = process.env.DV_ACCESS_TOKEN
if (!url || !token) {
  console.error('Defina DV_URL e DV_ACCESS_TOKEN.')
  process.exit(1)
}
const destino = fileURLToPath(new URL('./tabelas.json', import.meta.url))
const resposta = await fetch(
  `${url}/api/data/v9.2/EntityDefinitions?$select=LogicalName,EntitySetName,OwnershipType&$filter=IsCustomEntity eq true`,
  { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
)
if (!resposta.ok) {
  console.error(`Falha ${resposta.status} ao listar tabelas.`)
  process.exit(1)
}
const tabelas = (await resposta.json()).value
  .map((t) => ({ logico: t.LogicalName, conjunto: t.EntitySetName, organizacao: t.OwnershipType === 'OrganizationOwned' }))
  .sort((a, b) => a.logico.localeCompare(b.logico))
writeFileSync(destino, `[\n${tabelas.map((t) => `  ${JSON.stringify(t)}`).join(',\n')}\n]\n`)
console.log(`${tabelas.length} tabelas em tabelas.json`)

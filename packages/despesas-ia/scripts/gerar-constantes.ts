import { mkdirSync, writeFileSync } from 'node:fs'
import { constantesDoFlow } from '../src/index.ts'

mkdirSync(new URL('../dist/', import.meta.url), { recursive: true })
writeFileSync(new URL('../dist/constantes.json', import.meta.url), JSON.stringify(constantesDoFlow(), null, 2), 'utf8')
console.log('dist/constantes.json gerado')

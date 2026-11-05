import { mkdirSync, writeFileSync } from 'node:fs'
import { constantesDaConferencia, constantesDaLeituraRapida, constantesDoFlow } from '../src/index.ts'

mkdirSync(new URL('../dist/', import.meta.url), { recursive: true })
writeFileSync(new URL('../dist/constantes.json', import.meta.url), JSON.stringify(constantesDoFlow(), null, 2), 'utf8')
writeFileSync(new URL('../dist/constantes-leitura-rapida.json', import.meta.url), JSON.stringify(constantesDaLeituraRapida(), null, 2), 'utf8')
writeFileSync(new URL('../dist/constantes-conferencia-envio.json', import.meta.url), JSON.stringify(constantesDaConferencia(), null, 2), 'utf8')
console.log('dist/constantes.json, constantes-leitura-rapida.json e constantes-conferencia-envio.json gerados')

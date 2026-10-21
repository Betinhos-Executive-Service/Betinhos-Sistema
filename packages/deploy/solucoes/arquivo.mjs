import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Os JSON vêm do PowerShell 5.1, que pode gravar com BOM.
export async function lerJson(caminho) {
  return JSON.parse((await readFile(caminho, 'utf8')).replace(/^﻿/, ''))
}

// Diz se o módulo foi executado pelo node como CLI. Compara caminhos reais dos dois lados, para que
// chamar por junction ou symlink também acione a CLI (a comparação literal falhava aberta e saía com 0).
export function rodandoComoCli(urlDoModulo) {
  if (process.argv[1] === undefined) return false
  let script
  let modulo
  try {
    script = realpathSync(process.argv[1])
    modulo = realpathSync(fileURLToPath(urlDoModulo))
  } catch {
    return false
  }
  return process.platform === 'win32' ? script.toLowerCase() === modulo.toLowerCase() : script === modulo
}

import { readFile } from 'node:fs/promises'

// Os JSON vêm do PowerShell 5.1, que pode gravar com BOM.
export async function lerJson(caminho) {
  return JSON.parse((await readFile(caminho, 'utf8')).replace(/^\uFEFF/, ''))
}

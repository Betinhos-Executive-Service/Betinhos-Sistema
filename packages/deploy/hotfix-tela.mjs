import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { caminhoDaPublicacao, caminhoDoArquivo } from './caminho-publicacao.mjs'

// Trava do workflow "Hotfix da tela" (hotfix-tela.yml): confere os arquivos que a branch hotfix/* muda em relação à tag
// prod-publicado. Só a tela do Sistema Betinhos pode ir por esse caminho (exceção formal à regra "PROD só pela main",
// decisão do Renan, 23/11/2026); schema, plugin, flow, solução e qualquer outro WebResource vão pelas soluções.
// Reaproveita a classificação de caminho-publicacao.mjs e acrescenta uma trava: o script de publicação e o CI não mudam
// numa branch que roda com a conta de serviço do PROD (só o próprio hotfix-tela.yml pode entrar, para o dispatch achá-lo).

const WORKFLOW = '.github/workflows/hotfix-tela.yml'

// arquivos: lista do git diff --name-only prod-publicado...HEAD.
export function validarHotfixTela(arquivos) {
  const lista = [...new Set(arquivos.map((a) => a.trim()).filter(Boolean))]
  const erros = []
  if (lista.length === 0) return { ok: false, erros: ['a branch não muda nenhum arquivo em relação à tag prod-publicado'] }

  const resultado = caminhoDaPublicacao(lista)
  if (resultado.caminho !== 'front') {
    const fora = lista.filter((a) => !['front', 'nada'].includes(caminhoDoArquivo(a)))
    erros.push(
      resultado.caminho === 'nada'
        ? 'nenhum arquivo da tela mudou (apps/shell, packages/dataverse, pnpm-lock.yaml): não há o que publicar'
        : `o hotfix de tela só aceita a tela; vão pelas soluções: ${fora.slice(0, 10).join(', ')}${fora.length > 10 ? ` (+${fora.length - 10})` : ''}`,
    )
  }

  const protegidos = lista.filter((a) => caminhoDoArquivo(a) !== 'front' && a !== WORKFLOW && (a.startsWith('.github/') || a.startsWith('packages/deploy/')))
  if (protegidos.length) erros.push(`a branch muda CI ou script de publicação, que rodam com a conta de serviço do PROD: ${protegidos.slice(0, 10).join(', ')}`)

  return { ok: erros.length === 0, erros }
}

// Maior versão X.Y.Z entre as informadas (vazias e inválidas são ignoradas); '' se nenhuma.
export function maiorVersao(...versoes) {
  const partes = versoes
    .map((v) => String(v ?? '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/))
    .filter(Boolean)
    .map((m) => m.slice(1).map(Number))
  if (!partes.length) return ''
  partes.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
  return partes.at(-1).join('.')
}

// Uso: git diff --name-only prod-publicado...HEAD | node hotfix-tela.mjs   → imprime os erros e sai com 1 se reprovar
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, erros } = validarHotfixTela(readFileSync(0, 'utf8').split('\n'))
  if (!ok) for (const e of erros) console.error(`::error::${e}`)
  process.exit(ok ? 0 : 1)
}

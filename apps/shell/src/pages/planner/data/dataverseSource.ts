// Utilitário dos testes de contrato do adapter: lê o fonte de dataverse.ts e
// remove os tipos de um trecho, para avaliá-lo isolado como no Tela Planner
// (que fazia `new Function(source.slice(...))` sobre o .js).
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

export const readDataverseSource = () => readFile(new URL('./dataverse.ts', import.meta.url), 'utf8')

export function transpileSnippet(snippet: string) {
  return ts.transpileModule(snippet, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
}

/** Avalia um trecho do fonte injetando as dependências nomeadas e devolve a função `name`. */
export function evaluateSnippet<T>(snippet: string, name: string, dependencies: Record<string, unknown>): T {
  const factory = new Function(...Object.keys(dependencies), `${transpileSnippet(snippet)}; return ${name};`) as (...args: unknown[]) => T
  return factory(...Object.values(dependencies))
}

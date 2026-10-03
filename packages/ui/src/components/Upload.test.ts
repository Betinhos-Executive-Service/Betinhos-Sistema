import { expect, it } from 'vitest'
import { acceptFiles, formatFileSize } from './Upload'

const file = (name: string, size: number) => ({ name, size }) as File

it('formata tamanhos em pt-BR', () => {
  expect(formatFileSize(512)).toBe('512 B')
  expect(formatFileSize(348160)).toBe('340 KB')
  expect(formatFileSize(1258291)).toBe('1,2 MB')
})

it('recusa por tamanho e por quantidade, explicando', () => {
  const result = acceptFiles([file('a.pdf', 100), file('b.pdf', 5000), file('c.pdf', 100)], 1, { maxSize: 1000, maxFiles: 2 })
  expect(result.accepted.map((f) => f.name)).toEqual(['a.pdf'])
  expect(result.error).toBe('b.pdf passa de 1000 B. Limite de 2 arquivo(s) atingido; c.pdf ficou de fora.')
})

it('sem limites aceita tudo', () => {
  expect(acceptFiles([file('a', 1), file('b', 2)], 0, {})).toEqual({ accepted: [file('a', 1), file('b', 2)], error: null })
})

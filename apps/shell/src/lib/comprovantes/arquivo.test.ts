import { describe, expect, it } from 'vitest'
import { mimeDoArquivo, tipoPrevia } from './arquivo'

describe('prévia de comprovante', () => {
  it('usa o Content-Type do OneDrive e, se genérico, a extensão', () => {
    expect(mimeDoArquivo('x.bin', 'image/png; charset=binary')).toBe('image/png')
    expect(mimeDoArquivo('Nota.PDF', 'application/octet-stream')).toBe('application/pdf')
    expect(mimeDoArquivo('cupom.jpeg', null)).toBe('image/jpeg')
    expect(mimeDoArquivo('qa.txt', '')).toBe('application/octet-stream')
  })

  it('só imagem e PDF têm prévia', () => {
    expect(tipoPrevia('image/webp')).toBe('imagem')
    expect(tipoPrevia('application/pdf')).toBe('pdf')
    expect(tipoPrevia('image/heic')).toBeNull()
  })
})

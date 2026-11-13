import { describe, expect, it } from 'vitest'
import { ehVideo, mimeDoArquivo, tipoPrevia } from './arquivo'

describe('prévia de comprovante', () => {
  it('usa o Content-Type do OneDrive e, se genérico, a extensão', () => {
    expect(mimeDoArquivo('x.bin', 'image/png; charset=binary')).toBe('image/png')
    expect(mimeDoArquivo('Nota.PDF', 'application/octet-stream')).toBe('application/pdf')
    expect(mimeDoArquivo('cupom.jpeg', null)).toBe('image/jpeg')
    expect(mimeDoArquivo('qa.txt', '')).toBe('application/octet-stream')
  })

  it('imagem, PDF e vídeo têm prévia', () => {
    expect(tipoPrevia('image/webp')).toBe('imagem')
    expect(tipoPrevia('application/pdf')).toBe('pdf')
    expect(tipoPrevia(mimeDoArquivo('recebimento.MOV', null))).toBe('video')
    expect(tipoPrevia('video/webm')).toBe('video')
    expect(tipoPrevia('image/heic')).toBeNull()
  })

  it('vídeo pelo tipo informado ou, sem ele, pela extensão', () => {
    const base = { id: '1', url: null }
    expect(ehVideo({ ...base, nome: 'recebimento-1', midia: 'video' })).toBe(true)
    expect(ehVideo({ ...base, nome: 'clip.mp4', midia: 'foto' })).toBe(false)
    expect(ehVideo({ ...base, nome: 'clip.mp4' })).toBe(true)
    expect(ehVideo({ ...base, nome: 'cupom.jpg' })).toBe(false)
  })
})

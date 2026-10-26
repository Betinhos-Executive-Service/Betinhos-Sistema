// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FotoPerfil } from './FotoPerfil'

afterEach(cleanup)

const noop = async () => {}
const img = () => screen.getByRole('button').querySelector('img')

describe('FotoPerfil', () => {
  it('usa a miniatura quando a imagem cheia não carrega', () => {
    render(<FotoPerfil name="Danilo Novaes" src="https://org/api/foto/$value?size=full" fallback="data:image/jpeg;base64,AAA" size={56} onUpload={noop} onRemove={noop} />)
    expect(img()?.getAttribute('src')).toContain('size=full')
    fireEvent.error(img()!)
    expect(img()?.getAttribute('src')).toBe('data:image/jpeg;base64,AAA')
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('ver, trocar ou remover')
  })

  it('mostra as iniciais quando nenhuma imagem carrega', () => {
    render(<FotoPerfil name="Danilo Novaes" src="x" fallback="y" size={56} onUpload={noop} onRemove={noop} />)
    fireEvent.error(img()!)
    fireEvent.error(img()!)
    expect(img()).toBeNull()
    expect(screen.getByRole('button').textContent).toContain('DN')
  })
})

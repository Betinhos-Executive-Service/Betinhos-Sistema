// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COLISAO, MULTA } from '../data/schema'
import { EMPTY_DATA, type DataSource } from '../data/source'
import type { Colisao, FrotaData, Multa } from '../data/types'
import { RegistroDrawer, type KindRegistro } from './RegistroDrawer'
import { ToastProvider } from '@betinhos/ui'
import { manutencaoFalsa } from '../testUtils'

function fakeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    mode: 'mock', envLabel: 'TEST',
    ...manutencaoFalsa(),
    load: async () => ({ data: EMPTY_DATA, errors: {} }),
    currentStatus: async () => COLISAO.ENVIADO,
    dateBehaviors: async () => ({}),
    update: vi.fn(async () => {}),
    openForm: vi.fn(async () => {}),
    prepareFlow: vi.fn(async () => {}),
    fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, runFlow: vi.fn(async () => ({ message: null, shareUrl: null })), salvarItemPlano: async () => {}, inativarItemPlano: async () => {}, salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => ({ nome: 't.pdf', blob: new Blob() }), lembrarTermoMulta: async () => {}, listarParcelasTermo: async () => [],
    ...overrides,
  }
}

const multa: Multa = { id: 'u1', codigo: 'NT-1073', titulo: 'Multa sem condutor', status: MULTA.NOTIFICAR, dataHora: null, local: null, dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'ABC-1234' }, motorista: null, infracaoId: null, criadoEm: '2026-10-01T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null }
const colisao: Colisao = { id: 'c1', titulo: 'Batida leve', status: COLISAO.ENVIADO, tipo: null, dataHora: null, local: null, descricao: null, houveTerceiro: false, veiculo: { id: 'v1', label: 'ABC-1234' }, motorista: null, criadoEm: '2026-10-01T12:00:00Z' }
const data: FrotaData = { ...EMPTY_DATA, multas: [multa], colisoes: [colisao] }

function renderDrawer(source: DataSource, kind: KindRegistro, id: string) {
  const onClose = vi.fn()
  const onChanged = vi.fn()
  render(<ToastProvider><RegistroDrawer source={source} kind={kind} id={id} data={data} onClose={onClose} onChanged={onChanged} onOpenVeiculo={() => {}} /></ToastProvider>)
  return { onClose, onChanged }
}

afterEach(cleanup)

describe('RegistroDrawer', () => {
  it('fecha com Esc (cancel do dialog nativo) mesmo depois que o botão focado saiu da tela', () => {
    const { onClose } = renderDrawer(fakeSource(), 'colisao', 'c1')
    fireEvent.click(screen.getByRole('button', { name: 'Colocar em análise' }))
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeTruthy()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('mostra o erro e não recarrega quando o formulário não abre', async () => {
    const source = fakeSource({ openForm: vi.fn(async () => { throw new Error('Formulário indisponível') }) })
    const { onChanged } = renderDrawer(source, 'colisao', 'c1')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Abrir formulário/ })) })
    await waitFor(() => expect(screen.getByText(/Formulário indisponível/)).toBeTruthy())
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('recarrega depois que o formulário fecha', async () => {
    const { onChanged } = renderDrawer(fakeSource(), 'colisao', 'c1')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Abrir formulário/ })) })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('multa sem motorista: Notificar condutor desabilitado com o motivo visível', () => {
    renderDrawer(fakeSource(), 'multa', 'u1')
    expect((screen.getByRole('button', { name: 'Notificar condutor' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Informe o motorista no formulário antes desta ação')).toBeTruthy()
  })
})

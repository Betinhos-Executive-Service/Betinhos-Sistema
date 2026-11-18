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
    fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, salvarItemPlano: async () => {}, inativarItemPlano: async () => {}, salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => ({ nome: 't.pdf', blob: new Blob() }), lembrarTermoMulta: async () => {}, listarParcelasTermo: async () => [], listarDescontosPeriodo: async () => [], previstasAntes: async () => ({ quantidade: 0, maisAntigo: null }), listarParcelasMulta: async () => [], lancarDescontoFolha: async () => ({ parcelas: [], encerradas: [], reabertas: [] }), passoMulta: async () => { throw new Error('não usado neste teste') }, dossieMulta: async () => { throw new Error('não usado neste teste') }, enviarArquivoMulta: async () => {}, urlArquivoMulta: () => 'about:blank',
    ...overrides,
  }
}

const multa: Multa = { id: 'u1', codigo: 'NT-1073', titulo: 'Multa sem condutor', status: MULTA.NOTIFICAR, dataHora: null, local: null, dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'ABC-1234' }, motorista: null, infracaoId: null, criadoEm: '2026-10-01T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null }
const colisao: Colisao = { id: 'c1', titulo: 'Batida leve', status: COLISAO.ENVIADO, tipo: null, dataHora: null, local: null, descricao: null, houveTerceiro: false, veiculo: { id: 'v1', label: 'ABC-1234' }, motorista: null, criadoEm: '2026-10-01T12:00:00Z' }
const data: FrotaData = { ...EMPTY_DATA, multas: [multa, { ...multa, id: 'u2', titulo: 'Multa com condutor', status: MULTA.NOTIFICADO, motorista: { id: 'f1', label: 'Ana' }, dataAviso: '2026-10-02' }], colisoes: [colisao] }

const arquivos = { autuacao: 'auto-1.pdf', penalidade: 'penalidade-1.pdf', comprovante: null }

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

  it('multa não oferece mais Notificar condutor nem Gerar contrato', () => {
    renderDrawer(fakeSource(), 'multa', 'u1')
    expect(screen.queryByRole('button', { name: 'Notificar condutor' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Gerar contrato de indicação' })).toBeNull()
  })

  it('multa mostra o cartão e as etapas, sem selo, título "Passo a passo", rodapé nem lista com bolinha', () => {
    renderDrawer(fakeSource(), 'multa', 'u1')
    expect(screen.getByRole('list', { name: 'Etapas da multa' })).toBeTruthy()
    expect(screen.queryByText('Passo a passo')).toBeNull()
    expect(screen.queryByText('1. Identificar o responsável')).toBeNull()
    expect(screen.queryByRole('button', { name: /Abrir formulário/ })).toBeNull()
    expect(screen.queryByText(/Edição completa no formulário/)).toBeNull()
    expect(document.querySelector('details')).toBeNull()
    expect(screen.queryByText('Termo de acordo')).toBeNull()
  })

  it('multa tem as seções Feito até agora (só o que tem valor) e Dados da multa, sempre abertas', () => {
    renderDrawer(fakeSource(), 'multa', 'u2')
    expect(screen.getByText('Motorista avisado')).toBeTruthy()
    expect(screen.getByText('02/10/2026')).toBeTruthy()
    expect(screen.queryByText('Pagamento')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Feito até agora' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Dados da multa' })).toBeTruthy()
    expect(screen.getByText('Data da infração')).toBeTruthy()
    expect(screen.getByText('Local')).toBeTruthy()
  })

  it('multa sem nada feito não mostra a seção Feito até agora', () => {
    renderDrawer(fakeSource(), 'multa', 'u1')
    expect(screen.queryByRole('heading', { name: 'Feito até agora' })).toBeNull()
  })

  it('multa: arquivos viram links que baixam; sem arquivo não há link', () => {
    const urlArquivoMulta = vi.fn((id: string, coluna: string) => `https://dv.test/api/data/v9.2/cr40f_multases(${id})/${coluna}/$value`)
    const comArquivos: FrotaData = { ...data, multas: [{ ...multa, id: 'u3', titulo: 'Multa com arquivos', arquivos }] }
    render(<ToastProvider><RegistroDrawer source={fakeSource({ urlArquivoMulta })} kind="multa" id="u3" data={comArquivos} onClose={() => {}} onChanged={() => {}} onOpenVeiculo={() => {}} /></ToastProvider>)
    const auto = screen.getByRole('link', { name: /auto-1\.pdf/ })
    expect(auto.getAttribute('href')).toBe('https://dv.test/api/data/v9.2/cr40f_multases(u3)/cr40f_autodainfracao/$value')
    expect(auto.getAttribute('download')).toBe('auto-1.pdf')
    expect(screen.getByRole('link', { name: /penalidade-1\.pdf/ }).getAttribute('href')).toContain('/cr40f_pdfpenalidade/$value')
    expect(urlArquivoMulta).not.toHaveBeenCalledWith('u3', 'cr40f_comprovantepagamento')
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('multa sem arquivos não mostra link de download', () => {
    renderDrawer(fakeSource(), 'multa', 'u1')
    expect(screen.queryByRole('link')).toBeNull()
  })
})

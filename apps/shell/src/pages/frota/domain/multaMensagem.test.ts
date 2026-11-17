import { describe, expect, it } from 'vitest'
import { brl } from '../data/format'
import type { Dossie } from '../data/types'
import { mensagemWhatsApp } from './multaMensagem'

const dossie: Dossie = {
  multa: { id: 'u1', auto: '1A2B3C', placa: 'TST1A11', dataHora: '2026-11-10T16:00:00Z', local: 'Av. de Teste, 100', orgao: 'DSV', dataParaIndicar: '2026-11-30', infracao: { codigo: '7455-0', descricao: 'Velocidade até 20% acima', valor: 130.16 } },
  servicos: [{ id: 's1', codigo: 'S-1001', cliente: 'Cliente Alfa (fictício)', saida: '2026-11-10T15:00:00Z', retorno: '2026-11-10T18:00:00Z', motorista: 'Ana (fictício)', status: 'Concluído', noHorario: true }],
  infleet: { viagens: [{ inicio: '2026-11-10T15:40:00Z', fim: '2026-11-10T16:20:00Z', motoristaInfleet: 'drv-1', motorista: 'Ana' }] },
}

describe('mensagemWhatsApp', () => {
  it('monta o texto com notificação, serviço da agenda, rastreador e prazo', () => {
    expect(mensagemWhatsApp(dossie, 'Ana Souza (fictício)').split('\n')).toEqual([
      'Olá, Ana. Chegou uma notificação de multa do veículo TST1A11.',
      `Infração: 7455-0 - Velocidade até 20% acima (${brl(130.16)})`,
      'Quando: 10/11/2026 às 13:00',
      'Local: Av. de Teste, 100',
      'Serviço na agenda: S-1001 · Cliente Alfa (fictício) · 12:00–15:00 (Ana (fictício))',
      'Rastreador: viagem 12:40–13:20 com Ana',
      'Prazo para indicar o condutor: 30/11/2026',
      'Pode me confirmar se era você ao volante? Com a sua confirmação eu faço a indicação.',
    ])
  })

  it('sem serviço e com o rastreador fora do ar, avisa sem travar a mensagem', () => {
    const texto = mensagemWhatsApp({ ...dossie, servicos: [], infleet: { erro: 'Token da Infleet não configurado.' } }, null)
    expect(texto).toContain('Olá. Chegou uma notificação')
    expect(texto).toContain('Agenda: nenhum serviço desse veículo no horário.')
    expect(texto).toContain('Rastreador: indisponível (Token da Infleet não configurado.)')
  })

  it('serviço fora do horário aparece como próximo e viagem nenhuma é dita', () => {
    const texto = mensagemWhatsApp({ ...dossie, servicos: [{ ...dossie.servicos[0], noHorario: false, retorno: null }], infleet: { viagens: [] } }, 'Bruno')
    expect(texto).toContain('Serviço próximo do horário: S-1001 · Cliente Alfa (fictício) · 12:00 (Ana (fictício))')
    expect(texto).toContain('Rastreador: nenhuma viagem 30 minutos antes ou depois.')
  })
})

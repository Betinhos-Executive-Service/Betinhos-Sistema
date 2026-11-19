// Planilha de operação do backup: um Excel para operar sem o sistema, montado da pasta de exportar-dataverse.mjs (sem
// consulta nova ao PROD). Abas: serviços de hoje em diante, serviços dos últimos 60 dias e contatos de motoristas e
// solicitantes desses serviços. Cancelados entram, com o status visível (decisão do Renan, 19/11/2026).
//
//   node operacao.mjs <pasta-da-exportacao> <arquivo.xlsx>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registros, valorLegivel } from './planilhas.mjs'
import { partesBrasilia } from './retencao.mjs'
import { xlsx } from './xlsx.mjs'

export const DIAS_HISTORICO = 60
const SAIDA = 'cr40f_dataehorriodesada'

const colunas = (lista) => lista.map(([titulo, largura]) => ({ titulo, largura }))

// Ordem e largura das colunas das abas de serviços.
const COLUNAS = colunas([
  ['Saída', 16], ['Previsão de retorno', 16], ['Status', 14], ['Tipo do serviço', 16], ['Cliente', 22], ['Solicitante', 20],
  ['Telefone do solicitante', 18], ['Passageiros e telefones', 34], ['Perfil do passageiro', 24], ['Endereço de saída', 40],
  ['Destino', 34], ['Trajeto', 18], ['Motorista', 22], ['Telefone do motorista', 18], ['Tipo de veículo', 14], ['Veículo', 22],
  ['Obs de operação', 34], ['Observação interna', 34], ['CR', 10], ['ID', 12], ['Link do voucher', 30],
])
const COLUNAS_CONTATOS = colunas([['Tipo', 12], ['Nome', 30], ['Telefone', 18], ['Outros telefones', 34], ['E-mail', 30], ['Cliente', 22]])

// Meia-noite de hoje em Brasília como instante UTC e como "parede" (colunas sem fuso guardam a hora local com Z).
export function inicioDoDia(agora = new Date()) {
  const p = partesBrasilia(agora)
  const parede = Date.UTC(+p.year, p.month - 1, +p.day)
  // Brasília não tem horário de verão desde 2019: UTC−3 fixo.
  return { utc: parede + 3 * 3600_000, parede }
}

// Guarda só os campos usados: bancodedados tem milhares de linhas com dezenas de colunas.
async function porId(pasta, tabela, chave, campos) {
  const arquivo = join(pasta, 'tabelas', `${tabela}.ndjson.gz`)
  const mapa = new Map()
  if (!existsSync(arquivo)) {
    // Tabela fora da exportação (falhou ou excluída): a planilha sai, mas sem os dados dela.
    console.error(`::warning::Planilha de operação sem ${tabela}: telefones e dados dessa tabela ficam vazios.`)
    return mapa
  }
  for await (const r of registros(arquivo)) mapa.set(r[chave], Object.fromEntries(campos.map((c) => [c, r[c]])))
  return mapa
}

// Devolve { proximos, historico, contatos } já ordenados, prontos para as abas.
export async function montar(pasta, { agora = new Date(), semFuso = [] } = {}) {
  const [motoristas, veiculos, pessoas] = await Promise.all([
    porId(pasta, 'cr40f_funcionarios', 'cr40f_funcionariosid', ['cr40f_telefonecorporativo', 'cr40f_celular', 'cr40f_telefonepessoal', 'cr40f_telefonedeemergencia', 'cr40f_emailbetinhos']),
    porId(pasta, 'cr40f_veiculos', 'cr40f_veiculosid', ['cr40f_modelo']),
    porId(pasta, 'cr40f_bancodedados', 'cr40f_bancodedadosid', ['cr40f_telefone', 'cr40f_email']),
  ])
  const v = (r, c) => valorLegivel(r, c, semFuso.includes(c))
  const hoje = inicioDoDia(agora)
  const corte = semFuso.includes(SAIDA) ? hoje.parede : hoje.utc
  const desde = corte - DIAS_HISTORICO * 86_400_000
  const proximos = []
  const historico = []
  const contatos = new Map()
  for await (const r of registros(join(pasta, 'tabelas', 'cr40f_reservadeveculos.ndjson.gz'))) {
    const ms = Date.parse(r[SAIDA] ?? '')
    if (!(ms >= desde)) continue
    const motorista = motoristas.get(r._cr40f_motorista_value)
    // O veículo real (troca na hora) vale mais que o planejado.
    const colVeiculo = r._new_veiculoreal_value ? '_new_veiculoreal_value' : '_cr40f_veiculo_value'
    const veiculo = veiculos.get(r[colVeiculo])
    const solicitante = pessoas.get(r._cr40f_solicitante_value)
    const telMotorista = [motorista?.cr40f_telefonecorporativo, motorista?.cr40f_celular, motorista?.cr40f_telefonepessoal].find(Boolean) ?? ''
    const linha = [
      v(r, SAIDA), v(r, 'cr40f_horrioprevistoderetorno'), v(r, 'cr40f_status'), v(r, 'cr40f_tipodoservico'), v(r, '_cr40f_cliente_value'),
      v(r, '_cr40f_solicitante_value'), solicitante?.cr40f_telefone ?? '', v(r, 'cr40f_passageirosetelefonedecontato'),
      v(r, 'cr40f_perfildopassageiro'), [v(r, 'cr40f_endereodesada'), v(r, 'new_enderecodesaidapersonalizado')].filter(Boolean).join('\n'),
      v(r, 'cr40f_destino'), v(r, 'cr40f_trajeto'), v(r, '_cr40f_motorista_value'), telMotorista, v(r, 'cr40f_tipodeveiculo'),
      [v(r, colVeiculo), veiculo?.cr40f_modelo].filter(Boolean).join(' · '), v(r, 'cr40f_obsdeoperao'), v(r, 'cr40f_observaointerna'),
      v(r, 'cr40f_cr'), v(r, 'cr40f_id'), v(r, 'new_linkdovoucher'),
    ]
    ;(ms >= corte ? proximos : historico).push({ ms, linha })
    if (motorista && !contatos.has(`m${r._cr40f_motorista_value}`)) {
      contatos.set(`m${r._cr40f_motorista_value}`, ['Motorista', v(r, '_cr40f_motorista_value'), telMotorista,
        [motorista.cr40f_celular, motorista.cr40f_telefonepessoal, motorista.cr40f_telefonedeemergencia && `emergência ${motorista.cr40f_telefonedeemergencia}`].filter((t) => t && t !== telMotorista).join(' / '),
        motorista.cr40f_emailbetinhos ?? '', ''])
    }
    if (solicitante && !contatos.has(`s${r._cr40f_solicitante_value}`)) {
      contatos.set(`s${r._cr40f_solicitante_value}`, ['Solicitante', v(r, '_cr40f_solicitante_value'), solicitante.cr40f_telefone ?? '', '', solicitante.cr40f_email ?? '', v(r, '_cr40f_cliente_value')])
    }
  }
  proximos.sort((a, b) => a.ms - b.ms)
  historico.sort((a, b) => b.ms - a.ms)
  return {
    proximos: proximos.map((x) => x.linha),
    historico: historico.map((x) => x.linha),
    contatos: [...contatos.values()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1], 'pt-BR')),
  }
}

export function planilhaOperacao({ proximos, historico, contatos }) {
  return xlsx([
    { nome: 'Próximos serviços', colunas: COLUNAS, linhas: proximos },
    { nome: `Últimos ${DIAS_HISTORICO} dias`, colunas: COLUNAS, linhas: historico },
    { nome: 'Contatos', colunas: COLUNAS_CONTATOS, linhas: contatos },
  ])
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [pasta, destino] = process.argv.slice(2)
  const manifesto = JSON.parse(readFileSync(join(pasta, 'manifesto.json'), 'utf8'))
  const reservas = manifesto.tabelas.find((t) => t.tabela === 'cr40f_reservadeveculos')
  if (!reservas?.registros) {
    console.error('A exportação não tem serviços (cr40f_reservadeveculos).')
    process.exit(1)
  }
  const dados = await montar(pasta, { semFuso: reservas.semFuso })
  writeFileSync(destino, planilhaOperacao(dados))
  console.log(`Operação: ${dados.proximos.length} próximos, ${dados.historico.length} nos últimos ${DIAS_HISTORICO} dias, ${dados.contatos.length} contatos.`)
}

import type { Row } from '@betinhos/dataverse'
import type { ChoiceSet } from '../domain/types'
import { normalize } from '../domain/text'

const opts = (first: number, labels: string[]) => labels.map((label, index) => ({ value: first + index, label }))

export const MOCK_CHOICES: ChoiceSet = {
  status: [
    { value: 100000000, label: 'Novo' }, { value: 100000001, label: 'Em análise' }, { value: 100000002, label: 'Aprovado para banco' },
    { value: 100000003, label: 'Reprovado' }, { value: 100000004, label: 'Contratado' },
  ],
  cnh: opts(100000000, ['A', 'B', 'C', 'D', 'E', 'AB', 'ACC', 'Não informado']),
  origem: opts(100000000, ['Indicação', 'WhatsApp', 'Site', 'LinkedIn', 'Instagram', 'Presencial', 'Outro']),
  disponibilidade: opts(100000000, ['Imediata', 'Até 7 dias', 'Até 15 dias', 'Até 30 dias', 'A combinar']),
}

type Seed = [nome: string, cargo: string, cidade: string, uf: string, status: number | null, cnh: number | null, nota: number | null, origem: number | null, indicado: string, telefone: string, cpf: string, dias: number]

const SEEDS: Seed[] = [
  ['Ana Paula Ribeiro', 'Motorista executivo', 'São Paulo', 'SP', 100000000, 100000001, 8, 100000000, 'Carlos Henrique', '(11) 98888-2001', '123.456.789-01', 0],
  ['Bruno Teixeira', 'Motorista executivo', 'Guarulhos', 'SP', 100000000, 100000003, 7, 100000001, '', '(11) 98888-2002', '', 1],
  ['Camila Duarte', 'Assistente operacional', 'Osasco', 'SP', null, null, null, 100000002, '', '(11) 98888-2003', '', 3],
  ['Diego Martins', 'Motorista executivo', 'São Paulo', 'SP', 100000001, 100000004, 9, 100000003, '', '(11) 98888-2004', '', 5],
  ['Elaine Souza', 'Coordenadora de tráfego', 'Santo André', 'SP', 100000001, 100000001, 6, 100000000, 'Marina Lopes', '(11) 3333-4444', '', 8],
  ['Fábio Nogueira', 'Motorista executivo', 'Campinas', 'SP', 100000001, 100000005, 7, 100000005, '', '(19) 97777-1005', '', 12],
  ['Gisele Araújo', 'Atendimento ao cliente', 'São Paulo', 'SP', 100000002, null, 8, 100000004, '', '(11) 96666-1006', '', 20],
  ['Henrique Lima', 'Motorista executivo', 'Barueri', 'SP', 100000002, 100000003, 10, 100000000, 'Rita Fernandes', '(11) 95555-1007', '', 26],
  ['Isabela Rocha', 'Motorista executivo', 'São Bernardo do Campo', 'SP', 100000002, 100000001, 8, 100000002, '', '(11) 94444-1008', '', 33],
  ['João Victor Prado', 'Motorista executivo', 'São Paulo', 'SP', 100000004, 100000003, 9, 100000000, 'Carlos Henrique', '(11) 93333-1009', '', 41],
  ['Karina Melo', 'Assistente operacional', 'Rio de Janeiro', 'RJ', 100000003, null, 4, 100000006, '', '(21) 92222-1010', '', 47],
  ['Lucas Pereira', 'Motorista executivo', 'Mogi das Cruzes', 'SP', 100000003, 100000001, 5, 100000001, '', '(11) 91111-1011', '', 60],
]

/** Linhas no formato da Web API, com casos de cada etapa, status vazio e CPF repetível (123.456.789-01). */
export function createMockRows(now: Date): Row[] {
  return SEEDS.map(([nome, cargo, cidade, uf, status, cnh, nota, origem, indicado, telefone, cpf, dias], index) => {
    const slug = normalize(nome).replace(/\s+/g, '.')
    return {
      new_curriculoid: `mock-${index + 1}`, new_nomecompleto: nome, new_cargointeresse: cargo, new_cidade: cidade, new_estado: uf,
      new_statuscurriculo: status, new_categoriacnh: cnh, new_nota: nota, new_origemcurriculo: origem, new_indicadopor: indicado,
      new_telefone: telefone, new_whatsapp: telefone, new_cpf: cpf, new_email: `${slug}@exemplo.com`,
      new_pretensaosalarial: 3200 + index * 150, new_disponibilidade: 100000000 + (index % 5),
      new_ultimocargo: 'Motorista particular', new_ultimaempresa: 'Transportes Exemplo',
      new_experiencia: 'Experiência com transporte executivo e atendimento a clientes corporativos.',
      new_linkcurriculo: index % 3 === 0 ? `https://exemplo.invalid/curriculos/${slug}.pdf` : null,
      new_observacoes: index === 3 ? 'Disponível para plantão aos fins de semana.' : '',
      createdon: new Date(now.getTime() - dias * 86_400_000).toISOString(),
    }
  })
}

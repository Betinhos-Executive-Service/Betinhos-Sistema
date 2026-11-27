/** Campos que o Formulário Geral exige e o portal não pergunta: trajeto e tipo do serviço, deduzidos dos endereços. */

/** cr40f_tipodoservico (metadata DEV 27/11/2026). */
export const TIPO_SERVICO = { guarulhos: 202410000, outrasCidades: 202410002, rio: 202410004, pinda: 202410005, sjc: 202410006, congonhas: 202410007, campinas: 202410008, dentroSp: 202410009 } as const

// Mesmas regras da importação do Formulário Geral (inferServiceType), com Pinda e Rio; as cidades vêm antes de "sao paulo".
const REGRAS: [RegExp, number][] = [
  [/guarulhos|helio smidt/, TIPO_SERVICO.guarulhos],
  [/congonhas/, TIPO_SERVICO.congonhas],
  [/campinas|viracopos/, TIPO_SERVICO.campinas],
  [/pindamonhangaba/, TIPO_SERVICO.pinda],
  [/sao jose dos campos|\bsjc\b/, TIPO_SERVICO.sjc],
  [/rio de janeiro|galeao|santos dumont/, TIPO_SERVICO.rio],
  [/sao paulo|pinheiros/, TIPO_SERVICO.dentroSp],
]

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const pelaRegra = (endereco: string) => {
  const t = normalizar(endereco)
  return REGRAS.find(([re]) => re.test(t))?.[1]
}

/** Região do serviço pelo destino; sem cidade conhecida, pela saída; senão Outras Cidades (decisão do Renan, 27/11/2026). */
export const tipoServicoDoPedido = (origem: string, destino: string) => pelaRegra(destino) ?? pelaRegra(origem) ?? TIPO_SERVICO.outrasCidades

/** "Latasa Reciclagem / Aeroporto de Guarulhos (GRU)": o primeiro trecho de cada endereço, como o trajeto do Formulário Geral. */
export const trajetoDoPedido = (origem: string, destino: string) => [origem, destino].map((e) => e.split(',')[0].trim()).join(' / ')

/** Campos que o Formulário Geral exige e o portal não pergunta: trajeto e tipo do serviço, deduzidos dos endereços. */

/** cr40f_tipodoservico (metadata DEV 27/11/2026). */
export const TIPO_SERVICO = { guarulhos: 202410000, outrasCidades: 202410002, rio: 202410004, pinda: 202410005, sjc: 202410006, congonhas: 202410007, campinas: 202410008, dentroSp: 202410009 } as const

// Aeroportos (nome ou sigla) valem em qualquer parte do endereço; vêm antes das cidades.
const AEROPORTOS: [RegExp, number][] = [
  [/aeroporto .*guarulhos|helio smidt|\bgru\b/, TIPO_SERVICO.guarulhos],
  [/congonhas|\bcgh\b/, TIPO_SERVICO.congonhas],
  [/viracopos|\bvcp\b/, TIPO_SERVICO.campinas],
  [/galeao|santos dumont|\bgig\b|\bsdu\b/, TIPO_SERVICO.rio],
]

// Cidades só como trecho inteiro do endereço ("Taubaté - SP"), para "Av. São Paulo" ou "Rua Campinas" não contarem.
const CIDADES: Record<string, number> = {
  guarulhos: TIPO_SERVICO.guarulhos,
  campinas: TIPO_SERVICO.campinas,
  pindamonhangaba: TIPO_SERVICO.pinda,
  pinda: TIPO_SERVICO.pinda,
  'sao jose dos campos': TIPO_SERVICO.sjc,
  sjc: TIPO_SERVICO.sjc,
  'rio de janeiro': TIPO_SERVICO.rio,
  'sao paulo': TIPO_SERVICO.dentroSp,
  pinheiros: TIPO_SERVICO.dentroSp,
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const pelaRegra = (endereco: string) => {
  const t = normalizar(endereco)
  const aeroporto = AEROPORTOS.find(([re]) => re.test(t))?.[1]
  if (aeroporto) return aeroporto
  // Trecho sem " - UF" e sem CEP: "Pindamonhangaba - SP" → "pindamonhangaba".
  const cidade = t.split(',').map((p) => p.replace(/\s+-\s+[a-z]{2}$|\d{5}-?\d{3}/g, '').trim()).find((p) => p in CIDADES)
  if (cidade) return CIDADES[cidade]
  // Como na importação do Formulário Geral (inferServiceType): aeroporto sem nome é Guarulhos.
  return t.includes('aeroporto') ? TIPO_SERVICO.guarulhos : undefined
}

/** Região do serviço pelo destino; sem cidade conhecida, pela saída; senão Outras Cidades (decisão do Renan, 27/11/2026). */
export const tipoServicoDoPedido = (origem: string, destino: string) => pelaRegra(destino) ?? pelaRegra(origem) ?? TIPO_SERVICO.outrasCidades

/** "Latasa Reciclagem / Aeroporto de Guarulhos (GRU)": o primeiro trecho de cada endereço, como o trajeto do Formulário Geral. */
export const trajetoDoPedido = (origem: string, destino: string) => [origem, destino].map((e) => e.split(',')[0].trim()).join(' / ')

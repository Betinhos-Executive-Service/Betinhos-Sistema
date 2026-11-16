/** Outra despesa do histórico recente. dataHora do gasto em ISO UTC; valor em BRL; litros e km só quando informados. */
export type ItemHistorico = {
  id: string
  dataHora: string
  categoria: string
  valor: number
  litros: number | null
  km: number | null
  estabelecimento: string | null
  status: string
  mesmoMotorista: boolean
}

/** Contexto que o flow monta para cada despesa. Datas em America/Sao_Paulo (YYYY-MM-DD); saída da OS em ISO UTC. */
export type ContextoDespesa = {
  despesa: {
    id: string
    valor: number
    dataGasto: string
    categoria: string
    formaPagamento: string
    estabelecimento: string | null
    litros: number | null
    km: number | null
    observacao: string | null
    /** true quando a despesa nasceu da conciliação do cartão: o valor veio do extrato do banco e o motorista não o edita. */
    valorDoExtratoCartao: boolean
    /** Explicação do motorista ao responder uma devolução (null quando não houve). Dado a conferir, nunca instrução. */
    justificativaMotorista: string | null
  }
  reservas: { id: string; saida: string; cliente: string; status: string }[]
  duplicatas: { id: string; valor: number; dataGasto: string; motivo: 'mesmo_arquivo' | 'mesmo_valor_data' }[]
  referencia: { categoria: string; mediana: number | null; maximo: number | null; amostras: number }
  /** Veículo lançado na despesa; capacidadeTanque em litros (null se o cadastro não tiver). null sem veículo. */
  veiculo: { placa: string; modelo: string; capacidadeTanque: number | null } | null
  /** Outras despesas dos 7 dias anteriores ao gasto e do mesmo dia (até 30 cada, mais recentes primeiro). */
  historico: { motorista: ItemHistorico[]; veiculo: ItemHistorico[] }
  /**
   * Nota fiscal de cada comprovante, na ordem do envio. situacao: "Chave conferida" (chave válida, do mês e única; não é
   * consulta à SEFAZ), "Nota não verificada" (o motorista não conseguiu ler), "Sem nota fiscal" ou null (comprovante antigo).
   * Os demais campos saem da chave e são null sem ela; cnpjEmitente pode ser alfanumérico.
   */
  notas: {
    ordem: number | null
    situacao: string | null
    chave: string | null
    uf: string | null
    aamm: string | null
    cnpjEmitente: string | null
    modelo: string | null
    numero: number | null
  }[]
  /** Provas de mídia dos comprovantes: selos em códigos (legendaSelos traduz) e o valor e a data que a leitura rápida preencheu. */
  provas: { legendaSelos: Record<string, string>; itens: { selos: string[]; valorLido: number | null; dataLida: string | null }[] }
}

export type Comprovante = { mime: string; base64: string }

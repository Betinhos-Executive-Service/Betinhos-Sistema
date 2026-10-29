export const MOCK_ENTITY_SETS = {
  cr40f_errooperacional: "cr40f_errooperacionals",
  cr40f_acaooperacional: "cr40f_acaooperacionals",
  cr40f_reservadeveculos: "cr40f_reservadeveculoses",
  cr40f_funcionarios: "cr40f_funcionarioses",
  cr40f_veiculos: "cr40f_veiculoses",
  annotation: "annotations",
  cr40f_errooperacionalarquivo: "cr40f_errooperacionalarquivos",
};

const STORAGE_KEY = "betinhos-operational-errors-v1";
const iso = (days, hour = 9) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
};

export const MOCK_LOOKUPS = {
  cr40f_reservadeveculos: [
    { id: "res-24071", name: "BTH-24071 · GRU → Fasano" },
    { id: "res-24068", name: "BTH-24068 · Congonhas → Faria Lima" },
    { id: "res-24052", name: "BTH-24052 · Alphaville → Guarulhos" },
    { id: "res-24049", name: "BTH-24049 · Viracopos → São Paulo" },
  ],
  cr40f_funcionarios: [
    { id: "func-carlos", name: "Carlos Henrique" },
    { id: "func-mariana", name: "Mariana Costa" },
    { id: "func-roberto", name: "Roberto Lima" },
    { id: "func-ana", name: "Ana Beatriz" },
    { id: "func-marcos", name: "Marcos Vinícius" },
  ],
  cr40f_veiculos: [
    { id: "vei-s500", name: "Mercedes S-500 · BET-5000" },
    { id: "vei-eqs", name: "Mercedes EQS · BET-2026" },
    { id: "vei-sprinter", name: "Sprinter VIP · BET-1515" },
  ],
};

const initialDatabase = () => ({
  cr40f_errooperacional: [
    {
      cr40f_errooperacionalid: "err-1", cr40f_codigo: "ERR-000041",
      cr40f_titulo: "Motorista chegou após o horário de apresentação",
      cr40f_dataocorrencia: iso(-1, 6), cr40f_categoria: 100000001, cr40f_gravidade: 100000003,
      cr40f_status: 100000002, cr40f_origem: 100000000,
      cr40f_descricao: "Apresentação prevista às 05h45. Motorista chegou às 06h18 e o passageiro aguardou no desembarque.",
      cr40f_impacto: "Espera de 33 minutos e reclamação do passageiro.", cr40f_prazoresolucao: iso(1, 17),
      cr40f_reservanome: "BTH-24071 · GRU → Fasano", cr40f_reservaid: "res-24071",
      cr40f_motoristanome: "Carlos Henrique", cr40f_motoristaid: "func-carlos",
      cr40f_veiculonome: "Mercedes S-500 · BET-5000", cr40f_veiculoid: "vei-s500",
      cr40f_responsavelnome: "Mariana Costa", cr40f_responsavelid: "func-mariana",
      createdon: iso(-1, 7), modifiedon: iso(0, 8),
    },
    {
      cr40f_errooperacionalid: "err-2", cr40f_codigo: "ERR-000040",
      cr40f_titulo: "Veículo divergente do confirmado ao cliente",
      cr40f_dataocorrencia: iso(-3, 14), cr40f_categoria: 100000002, cr40f_gravidade: 100000002,
      cr40f_status: 100000001, cr40f_origem: 100000003,
      cr40f_descricao: "Reserva confirmada com sedan executivo, porém a escala apontou uma van.",
      cr40f_impacto: "Reescala emergencial antes do atendimento.", cr40f_prazoresolucao: iso(2, 12),
      cr40f_reservanome: "BTH-24068 · Congonhas → Faria Lima", cr40f_reservaid: "res-24068",
      cr40f_veiculonome: "Mercedes EQS · BET-2026", cr40f_veiculoid: "vei-eqs",
      cr40f_responsavelnome: "Roberto Lima", cr40f_responsavelid: "func-roberto",
      createdon: iso(-3, 14), modifiedon: iso(-2, 10),
    },
    {
      cr40f_errooperacionalid: "err-3", cr40f_codigo: "ERR-000039",
      cr40f_titulo: "Alteração de voo não chegou ao monitoramento",
      cr40f_dataocorrencia: iso(-5, 18), cr40f_categoria: 100000003, cr40f_gravidade: 100000002,
      cr40f_status: 100000003, cr40f_origem: 100000002,
      cr40f_descricao: "Cliente informou alteração ao atendimento, mas a informação não foi registrada na operação.",
      cr40f_impacto: "Risco de perda do atendimento.", cr40f_prazoresolucao: iso(-1, 16),
      cr40f_reservanome: "BTH-24052 · Alphaville → Guarulhos", cr40f_reservaid: "res-24052",
      cr40f_responsavelnome: "Ana Beatriz", cr40f_responsavelid: "func-ana",
      createdon: iso(-5, 19), modifiedon: iso(-1, 10),
    },
    {
      cr40f_errooperacionalid: "err-4", cr40f_codigo: "ERR-000038",
      cr40f_titulo: "Fornecedor não confirmou veículo de apoio",
      cr40f_dataocorrencia: iso(-8, 11), cr40f_categoria: 100000005, cr40f_gravidade: 100000001,
      cr40f_status: 100000004, cr40f_origem: 100000004,
      cr40f_descricao: "Confirmação recebida somente após segunda cobrança da operação.",
      cr40f_causa: "Contato principal do fornecedor estava ausente.",
      cr40f_solucao: "Criado contato secundário e confirmação D-1 obrigatória.",
      cr40f_dataresolucao: iso(-6, 15), cr40f_prazoresolucao: iso(-6, 17),
      cr40f_reservanome: "BTH-24049 · Viracopos → São Paulo", cr40f_reservaid: "res-24049",
      cr40f_responsavelnome: "Mariana Costa", cr40f_responsavelid: "func-mariana",
      createdon: iso(-8, 11), modifiedon: iso(-6, 15),
    },
    {
      cr40f_errooperacionalid: "err-5", cr40f_codigo: "ERR-000037",
      cr40f_titulo: "Integração deixou de atualizar o painel operacional",
      cr40f_dataocorrencia: iso(-12, 7), cr40f_categoria: 100000007, cr40f_gravidade: 100000003,
      cr40f_status: 100000005, cr40f_origem: 100000005,
      cr40f_descricao: "Atualizações ficaram paradas por 47 minutos.",
      cr40f_causa: "Token de integração expirado.", cr40f_solucao: "Token renovado e alerta de expiração configurado.",
      cr40f_dataresolucao: iso(-12, 9), cr40f_responsavelnome: "Roberto Lima", cr40f_responsavelid: "func-roberto",
      createdon: iso(-12, 7), modifiedon: iso(-12, 10),
    },
  ],
  cr40f_acaooperacional: [
    {
      cr40f_acaooperacionalid: "act-1", cr40f_titulo: "Revisar escala e ouvir o motorista",
      cr40f_descricao: "Validar sequência de avisos e motivo do atraso.", cr40f_tipoacao: 100000001,
      cr40f_status: 100000001, cr40f_prioridade: 100000003, cr40f_agendadoem: iso(0, 14), cr40f_prazo: iso(1, 17),
      cr40f_erroid: "err-1", cr40f_erronome: "ERR-000041 · Motorista chegou após o horário",
      cr40f_responsavelid: "func-mariana", cr40f_responsavelnome: "Mariana Costa",
    },
    {
      cr40f_acaooperacionalid: "act-2", cr40f_titulo: "Corrigir regra de seleção de categoria",
      cr40f_descricao: "Revisar validação entre reserva e veículo escalado.", cr40f_tipoacao: 100000002,
      cr40f_status: 100000000, cr40f_prioridade: 100000002, cr40f_agendadoem: iso(1, 10), cr40f_prazo: iso(3, 17),
      cr40f_erroid: "err-2", cr40f_erronome: "ERR-000040 · Veículo divergente",
      cr40f_responsavelid: "func-roberto", cr40f_responsavelnome: "Roberto Lima",
    },
    {
      cr40f_acaooperacionalid: "act-3", cr40f_titulo: "Definir canal único para mudanças de voo",
      cr40f_descricao: "Formalizar entrada e confirmação pela operação.", cr40f_tipoacao: 100000001,
      cr40f_status: 100000002, cr40f_prioridade: 100000002, cr40f_agendadoem: iso(-2, 15), cr40f_prazo: iso(-1, 16),
      cr40f_erroid: "err-3", cr40f_erronome: "ERR-000039 · Alteração de voo",
      cr40f_responsavelid: "func-ana", cr40f_responsavelnome: "Ana Beatriz",
    },
    {
      cr40f_acaooperacionalid: "act-4", cr40f_titulo: "Confirmar contato secundário do fornecedor",
      cr40f_descricao: "Registrar dois contatos válidos.", cr40f_tipoacao: 100000000,
      cr40f_status: 100000003, cr40f_prioridade: 100000001, cr40f_agendadoem: iso(-7, 13), cr40f_prazo: iso(-6, 17),
      cr40f_dataconclusao: iso(-6, 15), cr40f_resultado: "Contatos confirmados e comunicados à equipe.",
      cr40f_erroid: "err-4", cr40f_erronome: "ERR-000038 · Fornecedor sem confirmação",
      cr40f_responsavelid: "func-mariana", cr40f_responsavelnome: "Mariana Costa",
    },
  ],
  annotation: [
    { annotationid: "note-1", objectid: "err-1", notetext: "Passageiro recebeu retorno da operação às 08h10.", createdon: iso(0, 8) },
  ],
  cr40f_errooperacionalarquivo: [],
});

export function loadMockDatabase() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* localStorage indisponível */ }
  const data = initialDatabase();
  saveMockDatabase(data);
  return data;
}

export function saveMockDatabase(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* memória continua funcional */ }
}

export function resetMockDatabase() {
  const data = initialDatabase();
  saveMockDatabase(data);
  return data;
}

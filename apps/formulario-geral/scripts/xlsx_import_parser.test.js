const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const importCore = require("./xlsx_import_core");

const {
  REQUIRED_XLSX_HEADERS,
  normalizeImportedRows,
  buildImportPrograms,
  IMPORT_REVIEW_STATUSES,
  IMPORT_OPERATIONAL_DECISIONS,
  IMPORT_OPERATIONAL_MODES,
  applyImportOperationalDecision,
  confirmImportedTrechoReview,
  ignoreImportedTrechoReview,
  markImportedTrechoPending,
  markImportedTrechoSaved,
  mergeImportedTrechosAsSameCar,
  scoreImportedTrechoDuplicate,
  splitImportedTrecho,
  summarizeImportReviewTrechos,
  validateImportHeaders
} = importCore;

const root = path.resolve(__dirname, "..");
const workbookPath = path.join(root, "Relatorio - 2026-05-15T144227.698.xlsx");

function readZipEntries(filePath) {
  const buffer = fs.readFileSync(filePath);
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === eocdSignature) {
      eocdOffset = index;
      break;
    }
  }
  assert.ok(eocdOffset >= 0, "XLSX invalido: diretorio ZIP nao encontrado");

  const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let cursor = centralDirOffset;
  const end = centralDirOffset + centralDirSize;

  while (cursor < end) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50, "Entrada ZIP central invalida");
    const compression = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + fileNameLength);

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    const inflated = compression === 0 ? data : zlib.inflateRawSync(data);
    entries.set(name.replace(/\\/g, "/"), inflated.toString("utf8"));

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function columnIndex(cellRef) {
  const letters = /^[A-Z]+/.exec(cellRef)?.[0] || "";
  return [...letters].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target || {}, key);
}

function readPassengersSheet(filePath) {
  const entries = readZipEntries(filePath);
  const sharedStringsXml = entries.get("xl/sharedStrings.xml") || "";
  const sharedStrings = [...sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => (
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((text) => decodeXml(text[1])).join("")
  ));
  const sheetXml = entries.get("xl/worksheets/sheet1.xml");
  assert.ok(sheetXml, "Aba Passengers nao encontrada em sheet1.xml");

  const rows = [...sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = /\br="([^"]+)"/.exec(attrs)?.[1] || "";
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] || "";
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || "";
      const value = type === "s" ? sharedStrings[Number(raw)] || "" : decodeXml(raw);
      cells[columnIndex(ref)] = value;
    }
    return cells;
  });

  const headers = rows[0].map((item) => String(item || "").trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = String(cells[index] || "").trim();
    });
    return record;
  });
}

assert.ok(fs.existsSync(workbookPath), "Arquivo XLSX real precisa estar na pasta do projeto");
assert.equal(importCore.createManualImportTrecho, undefined, "core nao deve expor criacao de servico manual na PG");

const rawRows = readPassengersSheet(workbookPath);
const normalized = normalizeImportedRows(rawRows);
const programs = buildImportPrograms(normalized);

assert.equal(rawRows.length, 286, "deve ler 286 linhas de dados do XLSX real");
assert.deepEqual(
  REQUIRED_XLSX_HEADERS.filter((header) => !(header in rawRows[0])),
  [],
  "todos os cabecalhos obrigatorios devem existir"
);
assert.deepEqual(
  validateImportHeaders([
    "Data da Viagem (inicial)",
    "Número Programação",
    "Horário Passageiro",
    "Nome Passageiro",
    "Origem",
    "Destino"
  ]),
  [],
  "colunas opcionais ausentes nao devem bloquear importacao"
);
const minimalColumnPrograms = buildImportPrograms(normalizeImportedRows([
  {
    "Data da Viagem (inicial)": "20/05/2026",
    "Número Programação": "PGMIN/1",
    "Horário Passageiro": "07:30",
    "Nome Passageiro": "FULANO TESTE",
    "Origem": "Casa Fulano",
    "Destino": "Aeroporto de Congonhas"
  }
]));
assert.equal(minimalColumnPrograms.length, 1, "planilha com apenas colunas essenciais deve importar a PG");
assert.equal(minimalColumnPrograms[0].trechos.length, 1, "planilha com colunas opcionais ausentes deve criar OS");
assert.equal(minimalColumnPrograms[0].trechos[0].passageiros[0].nome, "FULANO TESTE", "linha minima deve preservar passageiro");
const normalizedEmailRows = normalizeImportedRows([
  {
    "Nome Passageiro": "FULANO EMAIL",
    "Email Passageiro": "FULANO.EMAIL@EXEMPLO.COM "
  }
]);
assert.equal(normalizedEmailRows[0].email, "fulano.email@exemplo.com", "email opcional do passageiro deve ser normalizado");
const passengerEmailRows = [{
  sourceRow: 2,
  programacao: "PGEMAIL/1",
  data: "20/05/2026",
  dataIso: "2026-05-20",
  horario: "07:30",
  origem: "Casa Fulano",
  origemKey: "casa fulano",
  destino: "Aeroporto de Congonhas",
  destinoKey: "aeroporto de congonhas",
  nomePassageiro: "FULANO EMAIL",
  email: normalizedEmailRows[0].email
}];
const passengerEmailTrecho = buildImportPrograms(passengerEmailRows)[0].trechos[0];
assert.equal(passengerEmailTrecho.passageiros[0].email, "fulano.email@exemplo.com", "email importado deve chegar ao passageiro do trecho");
const statusTrecho = buildImportPrograms(normalizeImportedRows([{
  "Data da Viagem (inicial)": "20/05/2026",
  "Número Programação": "PGSTATUS/1",
  "Status": "Agendado",
  "Horário Passageiro": "07:30",
  "Nome Passageiro": "FULANO STATUS",
  "Origem": "Casa Fulano",
  "Destino": "Aeroporto de Congonhas"
}]))[0].trechos[0];
assert.deepEqual(statusTrecho.statusExternos, ["Agendado"], "status externo do XLSX deve chegar ao trecho");
const valueColumnRows = normalizeImportedRows([
  {
    "Data da Viagem (inicial)": "20/05/2026",
    "Número Programação": "PGVALOR/1",
    "Horário Passageiro": "07:30",
    "Nome Passageiro": "FULANO TESTE",
    "Origem": "Casa Fulano",
    "Destino": "Aeroporto de Congonhas",
    "Outros/VALOR DA VIAGEM": "300,00",
    "Valor Bruto da Viagem": "200,00",
    "Custo total da viagem": "100,00",
    "Custo Passageiro": "50,00"
  }
]);
const valueColumnTrecho = buildImportPrograms(valueColumnRows)[0].trechos[0];
assert.equal(hasOwn(valueColumnRows[0], "valor"), false, "colunas de valor do XLSX devem ser descartadas na normalizacao");
assert.equal(hasOwn(valueColumnTrecho, "valor"), false, "trecho importado nao deve carregar cotacao");
assert.equal(hasOwn(valueColumnTrecho.linhasImportadas[0], "valor"), false, "linha importada nao deve expor valor do relatorio");
const stopColumnPrograms = buildImportPrograms(normalizeImportedRows([
  {
    "Data da Viagem (inicial)": "20/05/2026",
    "Número Programação": "PGPARADA/1",
    "Horário Passageiro": "05:55",
    "Nome Passageiro": "AZORRA",
    "Origem": "Rodovia Helio Smidt, Guarulhos, SP",
    "Cidade Origem": "Guarulhos",
    "Horário Parada 1": "06:30",
    "Parada 1": "Avenida Sao Joao, 2200 - Sao Jose dos Campos, SP",
    "Horário Parada 2": "07:00",
    "Parada 2": "Avenida Doutor Nelson D'Avila, 2200 - Sao Jose dos Campos, SP",
    "Horário Parada 4": "07:40",
    "Parada 4": "Rua Teste, 400 - Sao Jose dos Campos, SP",
    "Destino": "Avenida Brigadeiro Faria Lima, 2170 - Sao Jose dos Campos, SP"
  }
]));
const stopColumnTrecho = stopColumnPrograms[0].trechos[0];
assert.equal(stopColumnTrecho.linhasImportadas[0].paradas.length, 3, "paradas devem ser lidas dinamicamente mesmo com numeracao pulada");
assert.equal(
  stopColumnTrecho.origem,
  "05:55 - AZORRA - Rodovia Helio Smidt, Guarulhos, SP\nParada 1 - 06:30 - AZORRA - Avenida Sao Joao, 2200 - Sao Jose dos Campos, SP\nParada 2 - 07:00 - AZORRA - Avenida Doutor Nelson D'Avila, 2200 - Sao Jose dos Campos, SP\nParada 4 - 07:40 - AZORRA - Rua Teste, 400 - Sao Jose dos Campos, SP",
  "endereco de saida deve incluir origem e todas as paradas em ordem, com horario, pax e endereco"
);
assert.equal(
  stopColumnTrecho.destino,
  "AZORRA - Avenida Brigadeiro Faria Lima, 2170 - Sao Jose dos Campos, SP",
  "destino deve manter apenas o destino final"
);
assert.equal(programs.length, 131, "deve agrupar 131 programacoes externas por PG");
assert.ok(
  programs.some((program) => program.trechos.some((trecho) => trecho.solicitanteNome)),
  "trechos devem carregar o solicitante externo para cadastro automatico"
);

const multiSegmentProgram = programs.find((program) => program.programacao === "PG2026/31241");
assert.ok(multiSegmentProgram, "PG2026/31241 deve existir no resumo");
assert.equal(multiSegmentProgram.trechos.length, 1, "PG2026/31241 deve nascer como uma OS unica por PG");
assert.ok(multiSegmentProgram.trechos[0].retornoPrevistoHorario, "PG2026/31241 deve calcular horario previsto de retorno");

const sharedPickupPrograms = buildImportPrograms([
  {
    sourceRow: 2,
    programacao: "PGTEST/1",
    solicitacao: "ST1",
    data: "20/05/2026",
    dataIso: "2026-05-20",
    horario: "08:00",
    origem: "Av. Brigadeiro Faria Lima, 1000",
    origemKey: "av brigadeiro faria lima 1000",
    destino: "Hotel A",
    destinoKey: "hotel a",
    cidadeOrigem: "Sao Paulo",
    cidadeDestino: "Sao Paulo",
    nomePassageiro: "ANA TESTE",
    telefone: "11999990000",
    centroCusto: "CR1",
    motoristaNome: "Carlos",
    prefixoMotorista: "CAR-01",
    tipoTransporteExterno: "Carro executivo",
    tipoServicoSugerido: "Dentro de Sao Paulo",
    tipoVeiculoSugerido: "Executivo"
  },
  {
    sourceRow: 3,
    programacao: "PGTEST/1",
    solicitacao: "ST2",
    data: "20/05/2026",
    dataIso: "2026-05-20",
    horario: "08:00",
    origem: "Av. Brigadeiro Faria Lima, 1000",
    origemKey: "av brigadeiro faria lima 1000",
    destino: "Hotel B",
    destinoKey: "hotel b",
    cidadeOrigem: "Sao Paulo",
    cidadeDestino: "Sao Paulo",
    nomePassageiro: "BRUNO TESTE",
    telefone: "11988880000",
    centroCusto: "CR2",
    motoristaNome: "Carlos",
    prefixoMotorista: "CAR-01",
    tipoTransporteExterno: "Carro executivo",
    tipoServicoSugerido: "Dentro de Sao Paulo",
    tipoVeiculoSugerido: "Executivo"
  }
]);
const sharedPickupTrecho = sharedPickupPrograms[0].trechos[0];
assert.equal(sharedPickupPrograms[0].trechos.length, 1, "mesma PG deve virar um unico servico por padrao");
assert.deepEqual(sharedPickupTrecho.passageiros.map((passenger) => passenger.nome), ["ANA TESTE", "BRUNO TESTE"], "ordem dos passageiros deve seguir a ordem da planilha");
assert.deepEqual(sharedPickupTrecho.passageiros.map((passenger) => passenger.destino), ["Hotel A", "Hotel B"], "destino individual deve ficar editavel por passageiro");
assert.equal(sharedPickupTrecho.origem, "08:00 - ANA, BRUNO - Av. Brigadeiro Faria Lima, 1000", "enderecos iguais devem agrupar passageiros no endereco de saida");
assert.equal(sharedPickupTrecho.destino, "ANA - Hotel A\nBRUNO - Hotel B", "destinos diferentes devem ser consolidados por pax e destino, sem horario");
assert.equal(sharedPickupTrecho.retornoPrevistoHorario, "", "horarios iguais nao devem preencher retorno previsto");

const waitPrograms = buildImportPrograms([
  {
    sourceRow: 10,
    programacao: "PGWAIT/1",
    solicitacao: "ST10",
    data: "20/05/2026",
    dataIso: "2026-05-20",
    horario: "08:00",
    origem: "Hotel A",
    origemKey: "hotel a",
    destino: "Escritorio A",
    destinoKey: "escritorio a",
    cidadeOrigem: "Sao Paulo",
    cidadeDestino: "Campinas",
    nomePassageiro: "ANA TESTE",
    telefone: "11999990000",
    centroCusto: "CR1",
    tipoServicoSugerido: "Dentro de Sao Paulo",
    tipoVeiculoSugerido: "Executivo",
    solicitanteNome: "SOLICITANTE TESTE",
    observacao: "Aguardar no local"
  },
  {
    sourceRow: 11,
    programacao: "PGWAIT/1",
    solicitacao: "ST11",
    data: "20/05/2026",
    dataIso: "2026-05-20",
    horario: "08:00",
    origem: "Hotel A",
    origemKey: "hotel a",
    destino: "Escritorio B",
    destinoKey: "escritorio b",
    cidadeOrigem: "Sao Paulo",
    cidadeDestino: "Campinas",
    nomePassageiro: "BRUNO TESTE",
    telefone: "11988880000",
    centroCusto: "CR2",
    tipoServicoSugerido: "Dentro de Sao Paulo",
    tipoVeiculoSugerido: "Executivo",
    solicitanteNome: "SOLICITANTE TESTE"
  },
  {
    sourceRow: 12,
    programacao: "PGWAIT/1",
    solicitacao: "ST12",
    data: "20/05/2026",
    dataIso: "2026-05-20",
    horario: "17:00",
    origem: "Escritorio A",
    origemKey: "escritorio a",
    destino: "Hotel A",
    destinoKey: "hotel a",
    cidadeOrigem: "Campinas",
    cidadeDestino: "Sao Paulo",
    nomePassageiro: "ANA TESTE",
    telefone: "11999990000",
    centroCusto: "CR1",
    tipoServicoSugerido: "Dentro de Sao Paulo",
    tipoVeiculoSugerido: "Executivo",
    solicitanteNome: "SOLICITANTE TESTE"
  }
]);
const waitTrecho = waitPrograms[0].trechos[0];
assert.equal(waitPrograms[0].trechos.length, 1, "ida e volta da mesma PG devem virar uma OS de espera por padrao");
assert.equal(waitTrecho.horario, "08:00", "saida deve usar o menor horario da PG");
assert.equal(waitTrecho.retornoPrevistoDataIso, "2026-05-20", "retorno previsto deve usar a data da linha mais tarde");
assert.equal(waitTrecho.retornoPrevistoHorario, "17:00", "retorno previsto deve usar o maior horario da PG");
assert.deepEqual(waitTrecho.passageiros.map((passenger) => passenger.nome), ["ANA TESTE", "BRUNO TESTE"], "mesmo pax em horarios diferentes nao deve duplicar relacionamento");
assert.equal(waitTrecho.origem, "08:00 - ANA, BRUNO - Hotel A", "OS com retorno validado deve listar apenas a ida no endereco de saida");
assert.equal(waitTrecho.destino, "ANA - Escritorio A\nBRUNO - Escritorio B", "OS com retorno validado deve listar apenas destino da ida, sem horario");
assert.equal(waitTrecho.trajetoCidades, "Sao Paulo / Campinas / Sao Paulo", "trajeto deve usar sequencia unica de cidades");
assert.equal(waitTrecho.operationalMode, IMPORT_OPERATIONAL_MODES.SEPARABLE, "PG com dois horarios sem indicacao de espera deve sugerir ida/busca separaveis");
assert.equal(waitTrecho.operationalDecision, IMPORT_OPERATIONAL_DECISIONS.KEEP_WAITING, "PG separavel deve assumir motorista a disposicao por padrao");
assert.equal(waitTrecho.operationalSuggestion, "Manter espera", "sugestao deve refletir o padrao operacional");
assert.ok(!waitTrecho.pendencias.includes("Decidir se motorista fica a disposicao ou separar ida/busca."), "PG separavel nao deve bloquear validacao quando nao houve split");

const validatedReturnPrograms = buildImportPrograms([
  {
    sourceRow: 70,
    programacao: "PGRETURN/1",
    solicitacao: "ST70",
    data: "20/05/2026",
    dataIso: "2026-05-20",
    horario: "05:40",
    origem: "Rua Francisco Ricci, 181 - Vila Ema, Sao Jose dos Campos, SP",
    origemKey: "rua francisco ricci 181 vila ema sao jose dos campos sp",
    destino: "Avenida das Nacoes Unidas, 8501 - Pinheiros, Sao Paulo, SP, ECO",
    destinoKey: "avenida das nacoes unidas 8501 pinheiros sao paulo sp eco",
    cidadeOrigem: "Sao Jose dos Campos",
    cidadeDestino: "Sao Paulo",
    nomePassageiro: "MARCOS TESTE",
    telefone: "11933330000",
    centroCusto: "CR1",
    tipoServicoSugerido: "Intermunicipal",
    tipoVeiculoSugerido: "Executivo"
  },
  {
    sourceRow: 71,
    programacao: "PGRETURN/1",
    solicitacao: "ST71",
    data: "20/05/2026",
    dataIso: "2026-05-20",
    horario: "05:50",
    origem: "Rua Benedito Osvaldo Lecques, 300 - Parque Residencial Aquarius, Sao Jose dos Campos, SP",
    origemKey: "rua benedito osvaldo lecques 300 parque residencial aquarius sao jose dos campos sp",
    destino: "Avenida das Nacoes Unidas, 8501 - Pinheiros, Sao Paulo, SP",
    destinoKey: "avenida das nacoes unidas 8501 pinheiros sao paulo sp",
    cidadeOrigem: "Sao Jose dos Campos",
    cidadeDestino: "Sao Paulo",
    nomePassageiro: "DANIEL TESTE",
    telefone: "11944440000",
    centroCusto: "CR2",
    tipoServicoSugerido: "Intermunicipal",
    tipoVeiculoSugerido: "Executivo"
  },
  {
    sourceRow: 72,
    programacao: "PGRETURN/1",
    solicitacao: "ST72",
    data: "20/05/2026",
    dataIso: "2026-05-20",
    horario: "18:30",
    origem: "Avenida das Nacoes Unidas, 8501 - Pinheiros, Sao Paulo, SP",
    origemKey: "avenida das nacoes unidas 8501 pinheiros sao paulo sp",
    destino: "Rua Benedito Osvaldo Lecques, 300 - Parque Residencial Aquarius, Sao Jose dos Campos, SP",
    destinoKey: "rua benedito osvaldo lecques 300 parque residencial aquarius sao jose dos campos sp",
    cidadeOrigem: "Sao Paulo",
    cidadeDestino: "Sao Jose dos Campos",
    nomePassageiro: "DANIEL TESTE",
    telefone: "11944440000",
    centroCusto: "CR2",
    tipoServicoSugerido: "Intermunicipal",
    tipoVeiculoSugerido: "Executivo"
  },
  {
    sourceRow: 73,
    programacao: "PGRETURN/1",
    solicitacao: "ST73",
    data: "20/05/2026",
    dataIso: "2026-05-20",
    horario: "18:30",
    origem: "Avenida das Nacoes Unidas, 8501 - Pinheiros, Sao Paulo, SP, ECO",
    origemKey: "avenida das nacoes unidas 8501 pinheiros sao paulo sp eco",
    destino: "Rua Francisco Ricci, 181 - Vila Ema, Sao Jose dos Campos, SP",
    destinoKey: "rua francisco ricci 181 vila ema sao jose dos campos sp",
    cidadeOrigem: "Sao Paulo",
    cidadeDestino: "Sao Jose dos Campos",
    nomePassageiro: "MARCOS TESTE",
    telefone: "11933330000",
    centroCusto: "CR1",
    tipoServicoSugerido: "Intermunicipal",
    tipoVeiculoSugerido: "Executivo"
  }
]);
const validatedReturnTrecho = validatedReturnPrograms[0].trechos[0];
assert.equal(validatedReturnTrecho.retornoPrevistoHorario, "18:30", "retorno validado deve preencher horario previsto");
assert.equal(validatedReturnTrecho.origem, "05:40 - MARCOS - Rua Francisco Ricci, 181 - Vila Ema, Sao Jose dos Campos, SP\n05:50 - DANIEL - Rua Benedito Osvaldo Lecques, 300 - Parque Residencial Aquarius, Sao Jose dos Campos, SP", "retorno validado nao deve incluir linhas do retorno no endereco de saida");
assert.equal(validatedReturnTrecho.destino, "MARCOS - Avenida das Nacoes Unidas, 8501 - Pinheiros, Sao Paulo, SP, ECO\nDANIEL - Avenida das Nacoes Unidas, 8501 - Pinheiros, Sao Paulo, SP", "retorno validado deve manter apenas destino da ida");

const invalidReturnPrograms = buildImportPrograms([
  {
    ...validatedReturnPrograms[0].trechos[0].linhasImportadas[0],
    sourceRow: 74,
    programacao: "PGRETURNBAD/1",
    solicitacao: "ST74"
  },
  {
    ...validatedReturnPrograms[0].trechos[0].linhasImportadas[3],
    sourceRow: 75,
    programacao: "PGRETURNBAD/1",
    solicitacao: "ST75",
    origem: "Shopping Morumbi, Sao Paulo, SP",
    origemKey: "shopping morumbi sao paulo sp"
  }
]);
const invalidReturnTrecho = invalidReturnPrograms[0].trechos[0];
assert.equal(invalidReturnTrecho.retornoPrevistoHorario, "18:30", "retorno suspeito ainda deve preencher horario previsto");
assert.equal(invalidReturnTrecho.origem, "05:40 - MARCOS - Rua Francisco Ricci, 181 - Vila Ema, Sao Jose dos Campos, SP\n18:30 - MARCOS - Shopping Morumbi, Sao Paulo, SP", "retorno suspeito deve continuar visivel no endereco de saida para revisao");

applyImportOperationalDecision(waitTrecho, IMPORT_OPERATIONAL_DECISIONS.KEEP_WAITING);
assert.equal(waitTrecho.operationalDecision, IMPORT_OPERATIONAL_DECISIONS.KEEP_WAITING, "decisao de manter espera deve ficar registrada");
assert.ok(!waitTrecho.pendencias.includes("Decidir se motorista fica a disposicao ou separar ida/busca."), "manter espera deve liberar a pendencia operacional");

const keepOnePrograms = buildImportPrograms([
  {
    sourceRow: 25,
    programacao: "PGONE/1",
    solicitacao: "ST25",
    data: "20/05/2026",
    dataIso: "2026-05-20",
    horario: "09:30",
    origem: "Hotel A",
    origemKey: "hotel a",
    destino: "Escritorio A",
    destinoKey: "escritorio a",
    cidadeOrigem: "Sao Paulo",
    cidadeDestino: "Sao Paulo",
    nomePassageiro: "CARLA TESTE",
    telefone: "11955550000",
    centroCusto: "CR1",
    tipoServicoSugerido: "Dentro de Sao Paulo",
    tipoVeiculoSugerido: "Executivo",
    solicitanteNome: "SOLICITANTE TESTE"
  }
]);
const keepOneTrecho = keepOnePrograms[0].trechos[0];
applyImportOperationalDecision(keepOneTrecho, IMPORT_OPERATIONAL_DECISIONS.KEEP_ONE);
assert.equal(keepOneTrecho.operationalDecision, IMPORT_OPERATIONAL_DECISIONS.KEEP_ONE, "decisao de manter 1 OS deve ficar registrada sem virar espera");
assert.equal(keepOneTrecho.operationalSuggestion, "OS unica", "manter 1 OS deve ficar como decisao interna sem botao visual");

const multiPickupPrograms = buildImportPrograms([
  {
    sourceRow: 30,
    programacao: "PGMULTI/1",
    solicitacao: "ST30",
    data: "20/05/2026",
    dataIso: "2026-05-20",
    horario: "05:00",
    origem: "Casa Fulano",
    origemKey: "casa fulano",
    destino: "Aeroporto de Congonhas",
    destinoKey: "aeroporto de congonhas",
    cidadeOrigem: "Sao Paulo",
    cidadeDestino: "Sao Paulo",
    nomePassageiro: "FULANO TESTE",
    telefone: "11911110000",
    centroCusto: "CR1",
    tipoServicoSugerido: "Dentro de Sao Paulo",
    tipoVeiculoSugerido: "Executivo",
    solicitanteNome: "SOLICITANTE TESTE"
  },
  {
    sourceRow: 31,
    programacao: "PGMULTI/1",
    solicitacao: "ST30",
    data: "20/05/2026",
    dataIso: "2026-05-20",
    horario: "05:20",
    origem: "Casa Beltrano",
    origemKey: "casa beltrano",
    destino: "Aeroporto de Congonhas",
    destinoKey: "aeroporto de congonhas",
    cidadeOrigem: "Sao Paulo",
    cidadeDestino: "Sao Paulo",
    nomePassageiro: "BELTRANO TESTE",
    telefone: "11922220000",
    centroCusto: "CR2",
    tipoServicoSugerido: "Dentro de Sao Paulo",
    tipoVeiculoSugerido: "Executivo",
    solicitanteNome: "SOLICITANTE TESTE"
  }
]);
const multiPickupTrecho = multiPickupPrograms[0].trechos[0];
assert.equal(multiPickupPrograms[0].trechos.length, 1, "mesmo destino dentro de 1h30 deve virar uma OS multi-coleta");
assert.equal(multiPickupTrecho.operationalMode, IMPORT_OPERATIONAL_MODES.MULTI_PICKUP, "mesmo destino com pax diferentes deve ser classificado como multi-coleta");
assert.equal(multiPickupTrecho.operationalSuggestion, "Multi-coleta", "sugestao deve priorizar destino comum");
assert.equal(multiPickupTrecho.retornoPrevistoHorario, "", "multi-coleta nao deve virar retorno previsto");
assert.deepEqual(multiPickupTrecho.passageiros.map((passenger) => passenger.nome), ["FULANO TESTE", "BELTRANO TESTE"], "multi-coleta deve manter pax unicos na mesma OS");

const multiPickupThreePaxPrograms = buildImportPrograms([
  { ...multiPickupPrograms[0].trechos[0].linhasImportadas[0], sourceRow: 32, programacao: "PGMULTI3/1", horario: "05:00", cidadeOrigem: "Jacarei", cidadeDestino: "Sao Paulo", nomePassageiro: "ANA TESTE" },
  { ...multiPickupPrograms[0].trechos[0].linhasImportadas[1], sourceRow: 33, programacao: "PGMULTI3/1", horario: "05:15", cidadeOrigem: "Sao Jose dos Campos", cidadeDestino: "Sao Paulo", nomePassageiro: "BRUNO TESTE" },
  { ...multiPickupPrograms[0].trechos[0].linhasImportadas[1], sourceRow: 34, programacao: "PGMULTI3/1", horario: "05:30", cidadeOrigem: "Cacapava", cidadeDestino: "Sao Paulo", nomePassageiro: "CARLA TESTE" }
]);
assert.equal(multiPickupThreePaxPrograms[0].trechos[0].trajetoCidades, "Jacarei / Sao Jose dos Campos / Cacapava / Sao Paulo", "multi-coleta deve listar primeiro as cidades de origem em ordem de saida e depois os destinos");

const distantSameDestinationPrograms = buildImportPrograms([
  { ...multiPickupPrograms[0].trechos[0].linhasImportadas[0], sourceRow: 40, programacao: "PGDIST/1", horario: "05:00", nomePassageiro: "FULANO TESTE" },
  { ...multiPickupPrograms[0].trechos[0].linhasImportadas[1], sourceRow: 41, programacao: "PGDIST/1", horario: "06:45", nomePassageiro: "BELTRANO TESTE" }
]);
assert.equal(distantSameDestinationPrograms[0].trechos.length, 2, "mesmo destino acima de 1h30 deve virar dois servicos");
assert.deepEqual(distantSameDestinationPrograms[0].trechos.map((trecho) => trecho.horario), ["05:00", "06:45"], "servicos separados devem manter horarios originais");
const sameCarMergedTrecho = mergeImportedTrechosAsSameCar(
  distantSameDestinationPrograms[0],
  distantSameDestinationPrograms[0].trechos.map((trecho) => trecho.key),
  { key: "PGDIST/1|same-car|1" }
);
assert.ok(sameCarMergedTrecho, "usuario deve conseguir mesclar dois servicos separados da mesma PG");
assert.equal(distantSameDestinationPrograms[0].trechos.length, 1, "mesclar como mesmo carro deve voltar para uma OS unica");
assert.equal(sameCarMergedTrecho.key, "PGDIST/1|same-car|1", "merge mesmo carro deve criar chave estavel na PG");
assert.equal(sameCarMergedTrecho.horario, "05:00", "merge mesmo carro deve usar o primeiro horario");
assert.equal(sameCarMergedTrecho.retornoPrevistoHorario, "", "merge mesmo carro nao deve criar retorno previsto");
assert.equal(sameCarMergedTrecho.operationalMode, IMPORT_OPERATIONAL_MODES.MULTI_PICKUP, "merge mesmo carro deve virar multi-coleta manual");
assert.equal(sameCarMergedTrecho.operationalSuggestion, "Mesmo carro", "merge mesmo carro deve explicar a decisao do usuario");
assert.deepEqual(sameCarMergedTrecho.passageiros.map((passenger) => passenger.nome), ["FULANO TESTE", "BELTRANO TESTE"], "merge mesmo carro deve manter pax unicos");
assert.equal(sameCarMergedTrecho.destino, "FULANO, BELTRANO - Aeroporto de Congonhas", "merge mesmo carro deve agrupar destino igual sem horario");

const multiDatePrograms = buildImportPrograms([
  { ...waitPrograms[0].trechos[0].linhasImportadas[0], sourceRow: 20, programacao: "PGDATE/1", data: "20/05/2026", dataIso: "2026-05-20" },
  { ...waitPrograms[0].trechos[0].linhasImportadas[0], sourceRow: 21, programacao: "PGDATE/1", data: "21/05/2026", dataIso: "2026-05-21", horario: "09:00" }
]);
assert.ok(multiDatePrograms[0].trechos[0].pendencias.includes("PG com datas diferentes."), "PG com datas diferentes deve bloquear revisao manual");

const splitClone = splitImportedTrecho(waitPrograms[0], waitTrecho, { key: "PGWAIT/1|split|1" });
assert.equal(waitTrecho.retornoPrevistoHorario, "", "Split deve limpar retorno previsto da OS original");
assert.equal(waitTrecho.operationalDecision, IMPORT_OPERATIONAL_DECISIONS.SPLIT, "Split deve registrar decisao operacional na OS original");
assert.deepEqual(waitTrecho.solicitacoes, ["ST10", "ST11"], "Split deve manter na OS original apenas STs da ida");
assert.deepEqual(waitTrecho.sourceRows, [10, 11], "Split deve manter na OS original apenas as linhas de ida");
assert.deepEqual(waitTrecho.passageiros.map((passenger) => passenger.nome), ["ANA TESTE", "BRUNO TESTE"], "OS original do Split deve manter apenas pax da ida");
assert.equal(waitTrecho.origem, "08:00 - ANA, BRUNO - Hotel A", "Split deve recalcular saida original apenas com a ida");
assert.equal(waitTrecho.destino, "ANA - Escritorio A\nBRUNO - Escritorio B", "Split deve recalcular destino original apenas com a ida e sem horario");
assert.equal(waitTrecho.trajetoCidades, "Sao Paulo / Campinas", "Split deve recalcular trajeto original apenas com a ida");
assert.equal(splitClone.key, "PGWAIT/1|split|1", "Split deve criar chave estavel na PG");
assert.equal(splitClone.importOrigin, "split", "Split deve marcar origem tecnica");
assert.equal(waitTrecho.splitGroupId, splitClone.splitGroupId, "ida e busca do Split devem compartilhar grupo em memoria");
assert.equal(waitTrecho.splitRole, "outbound", "OS original do Split deve ser marcada como ida");
assert.equal(splitClone.splitRole, "return", "clone do Split deve ser marcado como retorno");
assert.equal(splitClone.reviewStatus, IMPORT_REVIEW_STATUSES.PENDING, "Split deve nascer pendente");
assert.deepEqual(splitClone.solicitacoes, ["ST12"], "Split deve manter no clone apenas STs da busca");
assert.deepEqual(splitClone.sourceRows, [12], "Split deve manter no clone apenas as linhas de retorno");
assert.deepEqual(splitClone.passageiros.map((passenger) => passenger.nome), ["ANA TESTE"], "Split deve copiar para o clone apenas pax da busca");
assert.equal(splitClone.dataIso, "2026-05-20", "Split deve pre-preencher data da busca quando houver linha de retorno clara");
assert.equal(splitClone.horario, "17:00", "Split deve pre-preencher horario da busca quando houver linha de retorno clara");
assert.equal(splitClone.origem, "17:00 - ANA - Escritorio A", "Split deve pre-preencher endereco de saida da busca");
assert.equal(splitClone.destino, "ANA - Hotel A", "Split deve pre-preencher destino da busca sem horario");
assert.equal(splitClone.trajetoCidades, "Campinas / Sao Paulo", "Split deve pre-preencher trajeto da busca");
assert.equal(splitClone.operationalDecision, IMPORT_OPERATIONAL_DECISIONS.SPLIT_DRAFT, "clone deve nascer como rascunho de busca separada");

const exactDuplicateScore = scoreImportedTrechoDuplicate(sharedPickupTrecho, {
  recordId: "reserva-exata",
  programacao: "PGTEST/1",
  dataSaida: "2026-05-20T08:00:00",
  trajeto: "Sao Paulo > Sao Paulo",
  enderecoView: "Av. Brigadeiro Faria Lima, 1000",
  destino: "1. ANA - Hotel A;\n2. BRUNO - Hotel B",
  paxView: "ANA TESTE - 11999990000; BRUNO TESTE - 11988880000"
});
assert.equal(exactDuplicateScore.level, "exact", "mesma PG existente deve bloquear duplicidade");
assert.ok(exactDuplicateScore.reasons.includes("mesmo horario"), "duplicidade deve explicar horario");
assert.ok(exactDuplicateScore.reasons.includes("mesmos passageiros"), "duplicidade deve explicar passageiros");

const samePgDifferentServiceScore = scoreImportedTrechoDuplicate(sharedPickupTrecho, {
  recordId: "reserva-outra",
  programacao: "PGTEST/1",
  dataSaida: "2026-05-20T15:30:00",
  trajeto: "Sao Paulo > Campinas",
  enderecoView: "Rua Oscar Freire, 200",
  destino: "Aeroporto de Viracopos",
  paxView: "CARLA TESTE - 11977770000"
});
assert.equal(samePgDifferentServiceScore.level, "exact", "mesma PG ja existente no Dataverse deve bloquear mesmo com outro horario/trajeto/pax");
assert.ok(samePgDifferentServiceScore.reasons.includes("mesma PG"), "duplicidade deve explicar PG existente");

const possibleDuplicateScore = scoreImportedTrechoDuplicate(sharedPickupTrecho, {
  recordId: "reserva-parecida",
  programacao: "PGTEST/2",
  dataSaida: "2026-05-20T08:10:00",
  trajeto: "Sao Paulo > Sao Paulo",
  enderecoView: "Av Brigadeiro Faria Lima 1000",
  destino: "Hotel A / Hotel B",
  paxView: "ANA TESTE"
});
assert.equal(possibleDuplicateScore.level, "possible", "servico muito parecido deve avisar sem bloquear automaticamente");

const allTrechos = programs.flatMap((program) => program.trechos);
assert.ok(allTrechos.length > 0, "fixture deve gerar trechos importados");
assert.ok(IMPORT_REVIEW_STATUSES, "core deve exportar estados de revisão de importados");
assert.ok(
  allTrechos.every((trecho) => trecho.reviewStatus === IMPORT_REVIEW_STATUSES.PENDING),
  "todo trecho importado deve iniciar como Pendente para revisão humana"
);

const reviewTrechos = [
  {
    key: "ok",
    reviewStatus: IMPORT_REVIEW_STATUSES.PENDING,
    passageiros: []
  },
  {
    key: "bad",
    reviewStatus: IMPORT_REVIEW_STATUSES.PENDING,
    passageiros: []
  },
  {
    key: "ignored",
    reviewStatus: IMPORT_REVIEW_STATUSES.PENDING,
    passageiros: []
  },
  {
    key: "saved",
    reviewStatus: IMPORT_REVIEW_STATUSES.PENDING,
    passageiros: []
  }
];

confirmImportedTrechoReview(reviewTrechos[0], []);
assert.equal(reviewTrechos[0].reviewStatus, IMPORT_REVIEW_STATUSES.CONFIRMED, "confirmar sem pendencia deve marcar Confirmado");

confirmImportedTrechoReview(reviewTrechos[1], ["Destino vazio."]);
assert.equal(reviewTrechos[1].reviewStatus, IMPORT_REVIEW_STATUSES.BLOCKED, "confirmar com pendencia deve marcar Bloqueado");
assert.equal(reviewTrechos[1].reviewBlockReason, "Destino vazio.", "Bloqueado deve guardar o motivo exato");

ignoreImportedTrechoReview(reviewTrechos[2]);
assert.equal(reviewTrechos[2].reviewStatus, IMPORT_REVIEW_STATUSES.IGNORED, "ignorar deve marcar Ignorado");
assert.equal(reviewTrechos[2].reviewBlockReason, "Ignorado manualmente na revisão.", "ignorar deve guardar motivo padrao");

markImportedTrechoSaved(reviewTrechos[3], "reserva-1");
assert.equal(reviewTrechos[3].reviewStatus, IMPORT_REVIEW_STATUSES.SAVED, "salvar deve marcar Salvo");
assert.equal(reviewTrechos[3].savedRecordId, "reserva-1", "Salvo deve manter o id criado");

let summary = summarizeImportReviewTrechos(reviewTrechos);
assert.equal(summary.canScheduleConfirmed, false, "Agendar confirmados deve bloquear enquanto houver Bloqueado");
assert.deepEqual(summary.saveableTrechos.map((trecho) => trecho.key), ["ok"], "Ignorado nao entra nos trechos para salvar");
assert.equal(summary.counts.ignored, 1, "Ignorado deve aparecer no resumo");
assert.equal(summary.counts.saved, 1, "Salvo deve aparecer no resumo");

markImportedTrechoPending(reviewTrechos[0]);
assert.equal(reviewTrechos[0].reviewStatus, IMPORT_REVIEW_STATUSES.PENDING, "editar trecho confirmado deve voltar para Pendente");

// Relatório Embraer a partir de 05/11/2026: sem "Cidade Origem/Destino" (cidade só no endereço).
const semCidadeRows = normalizeImportedRows([
  {
    "Data da Viagem (inicial)": "10/11/2026",
    "Número Programação": "PGSEMCIDADE/1",
    "Horário Passageiro": "17:30",
    "Nome Passageiro": "GUILHERME FARIA LIMA PAIVA",
    "Origem": "Avenida Brigadeiro Faria Lima, 2170 - Putim, São José dos Campos, SP, F56",
    "Destino": "Rodovia Hélio Smidt, s/nº - Aeroporto, Guarulhos, SP, terminal 2"
  },
  {
    "Data da Viagem (inicial)": "10/11/2026",
    "Número Programação": "PGSEMCIDADE/2",
    "Horário Passageiro": "07:20",
    "Nome Passageiro": "Patrick Quayle",
    "Origem": "Rua Elídio Gonçalves da Silva, 646 - Campos do Jordão, SP",
    "Destino": "São José dos Campos, SP, Rua das Pescadas, 136 - Parque Residencial Aquarius"
  },
  {
    "Data da Viagem (inicial)": "10/11/2026",
    "Número Programação": "PGSEMCIDADE/3",
    "Horário Passageiro": "08:00",
    "Nome Passageiro": "SEM UF",
    "Origem": "Hotel Novotel",
    "Destino": "Aeroporto, Guarulhos, SP"
  }
]);
assert.equal(semCidadeRows[0].cidadeOrigem, "São José dos Campos", "sem coluna de cidade, usa a cidade antes da UF no endereco");
assert.equal(semCidadeRows[0].cidadeDestino, "Guarulhos", "cidade de destino vem do endereco");
assert.equal(semCidadeRows[1].cidadeOrigem, "Campos do Jordão", "cidade depois do ultimo ' - ' do trecho antes da UF");
assert.equal(semCidadeRows[1].cidadeDestino, "São José dos Campos", "cidade no inicio do endereco");
assert.equal(semCidadeRows[2].cidadeOrigem, "", "endereco sem UF nao inventa cidade");
const semCidadeTrechos = buildImportPrograms(semCidadeRows).map((program) => program.trechos[0]);
assert.equal(semCidadeTrechos[0].trajetoCidades, "São José dos Campos / Guarulhos", "trajeto por cidade sem as colunas de cidade");
assert.equal(semCidadeTrechos[1].trajetoCidades, "Campos do Jordão / São José dos Campos", "trajeto por cidade com cidade no inicio do destino");
assert.equal(semCidadeTrechos[2].trajetoCidades, "Guarulhos", "trajeto usa so as cidades encontradas");

const cidadeFormatos = normalizeImportedRows([
  ["Av. Brigadeiro Faria Lima, 2170 - Putim, São José dos Campos - SP, 12227-000, Brasil", "Rua X, 100, AP, 52, Campinas, SP"],
  ["Rua X, 10 - São Paulo/SP", "Rua X, 10, SP"]
].map(([origem, destino], index) => ({
  "Data da Viagem (inicial)": "10/11/2026",
  "Número Programação": `PGFORMATO/${index + 1}`,
  "Horário Passageiro": "08:00",
  "Nome Passageiro": "FORMATO",
  "Origem": origem,
  "Destino": destino
})));
assert.equal(cidadeFormatos[0].cidadeOrigem, "São José dos Campos", "cidade no formato 'Cidade - UF'");
assert.equal(cidadeFormatos[0].cidadeDestino, "Campinas", "complemento AP nao e confundido com UF");
assert.equal(cidadeFormatos[1].cidadeOrigem, "São Paulo", "cidade no formato 'Cidade/UF'");
assert.equal(cidadeFormatos[1].cidadeDestino, "", "numero antes da UF nao vira cidade");

// Formato antigo: as colunas de cidade continuam valendo sobre o endereco.
const comCidadeRow = normalizeImportedRows([
  {
    "Data da Viagem (inicial)": "05/08/2025",
    "Número Programação": "PGCOMCIDADE/1",
    "Horário Passageiro": "09:00",
    "Nome Passageiro": "ANA",
    "Origem": "Rodovia Hélio Smidt, s/nº - Aeroporto, Guarulhos, SP",
    "Cidade Origem": "Aerop. Guarulhos",
    "Destino": "Avenida Brigadeiro Faria Lima, 2170 - Putim, São José dos Campos, SP",
    "Cidade Destino": "SJCampos"
  }
])[0];
assert.equal(comCidadeRow.cidadeOrigem, "Aerop. Guarulhos", "coluna Cidade Origem tem prioridade");
assert.equal(comCidadeRow.cidadeDestino, "SJCampos", "coluna Cidade Destino tem prioridade");

console.log("xlsx_import_parser: ok");

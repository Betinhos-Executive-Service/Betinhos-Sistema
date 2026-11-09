const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function normalizeLineEndings(value) {
  return String(value).replace(/\r\n/g, "\n");
}

function includes(source, value, label = value) {
  assert.ok(normalizeLineEndings(source).includes(normalizeLineEndings(value)), `Esperado: ${label}`);
}

function excludes(source, value, label = value) {
  assert.ok(!normalizeLineEndings(source).includes(normalizeLineEndings(value)), `Nao esperado: ${label}`);
}

function extractCssRule(source, selector) {
  const normalizedSource = normalizeLineEndings(source);
  const normalizedSelector = normalizeLineEndings(selector);
  const start = normalizedSource.indexOf(normalizedSelector);
  assert.ok(start >= 0, `Regra CSS nao encontrada: ${selector}`);
  const end = normalizedSource.indexOf("}", start);
  assert.ok(end > start, `Regra CSS incompleta: ${selector}`);
  return normalizedSource.slice(start, end + 1);
}

function extractFunction(source, name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `Funcao nao encontrada: ${name}`);
  const start = match.index;
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Funcao incompleta: ${name}`);
}

function buildPassengerMatcher() {
  const functionNames = [
    "cleanGuid",
    "sameId",
    "normalize",
    "onlyDigits",
    "scorePassengerCandidate",
    "phoneNumbersMatch",
    "phoneNumbersNearlyMatch",
    "emailsProbablySame",
    "splitEmail",
    "nameSimilarity",
    "normalizeName",
    "tokenFuzzyNameScore",
    "stringSimilarity",
    "hammingDistance",
    "damerauLevenshteinDistance",
    "levenshteinDistance"
  ];
  const body = `${functionNames.map((name) => extractFunction(app, name)).join("\n")}
return { scorePassengerCandidate, nameSimilarity };`;
  return Function(body)();
}

function buildImportedMatchSelector() {
  const body = `${extractFunction(app, "cleanGuid")}
${extractFunction(app, "sameId")}
${extractFunction(app, "normalize")}
${extractFunction(app, "selectImportedExistingMatch")}
return { selectImportedExistingMatch };`;
  return Function(body)();
}

function buildPhoneParser() {
  const start = app.indexOf("const PHONE_MAX_LENGTH");
  const end = app.indexOf("function formatCpf");
  assert.ok(start >= 0 && end > start, "Bloco de telefone nao encontrado");
  const phoneBlock = app.slice(start, end);
  const body = `${extractFunction(app, "onlyDigits")}
${phoneBlock}
return { parsePhoneNumber, parsePhoneNumberForInput, parsePhoneNumberForSelectedCountry, phoneStorageValue };`;
  return Function(body)();
}

function buildMockDbHarness() {
  const body = `
const MOCK_STORE_KEY = "formulario_geral_mock_db_v1";
const state = { xrm: null, mockMode: true };
const storage = new Map();
const localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); }
};
${extractFunction(app, "cleanGuid")}
${extractFunction(app, "sameId")}
${extractFunction(app, "uniquePassengersById")}
${extractFunction(app, "getMockDb")}
${extractFunction(app, "setMockDb")}
${extractFunction(app, "persistMockPassengerRecord")}
return { getMockDb, setMockDb, persistMockPassengerRecord };`;
  return Function(body)();
}

function buildLaunchParamHarness() {
  const body = `
let window = { location: { search: "" } };
${extractFunction(app, "cleanGuid")}
${extractFunction(app, "getUrlParam")}
${extractFunction(app, "parseLaunchDataParam")}
${extractFunction(app, "findRecordIdInLaunchData")}
${extractFunction(app, "findGuidInValue")}
${extractFunction(app, "getRecordIdFromHostContext")}
${extractFunction(app, "getRecordIdFromUrl")}
return function parse(search, hostId = "") {
  window = {
    location: { search },
    parent: hostId
      ? { Xrm: { WebApi: {}, Page: { data: { entity: { getId: () => hostId } } } } }
      : null,
    top: null,
    opener: null
  };
  return getRecordIdFromUrl();
};`;
  return Function(body)();
}

function buildPassengerClientDefaultHarness() {
  const body = `
let sideEffects = [];
const el = {
  cliente: {
    value: "",
    options: []
  }
};
function findOptionValue(field, label) {
  if (field === "cliente" && label === "Cliente A") return "cliente-a";
  return "";
}
function refreshCustomSelect() {}
${extractFunction(app, "setSelectValue")}
function applyStatusFaturamentoDefault() {
  sideEffects.push("status-default");
}
function renderStatusFaturamento() {
  sideEffects.push("render-status");
}
${extractFunction(app, "applySelectedPassengerClientDefault")}
return {
  run(passenger, currentValue = "", options = [{ value: "cliente-a" }]) {
    el.cliente.value = currentValue;
    el.cliente.options = options;
    sideEffects = [];
    applySelectedPassengerClientDefault(passenger);
    return { value: el.cliente.value, sideEffects: [...sideEffects] };
  }
};`;
  return Function(body)();
}

[
  "riskList",
  "saveLogList",
  "draftStatus",
  "confirmSaveButton",
  "bdExistingPassenger"
].forEach((id) => {
  excludes(app, `$("` + id + `")`, `binding fantasma #${id}`);
});

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
[...app.matchAll(/\$\("([^"]+)"\)/g)]
  .map((match) => match[1])
  .forEach((id) => {
    assert.ok(htmlIds.has(id), `Binding JS sem elemento no HTML: #${id}`);
  });

includes(html, "class=\"ai-draft-workspace\"", "workspace C3 deve separar extração e fonte");
includes(html, "id=\"aiDraftSourceEmailTab\"", "aba de e-mail original deve existir");
includes(html, "id=\"aiDraftSourceAlertsTab\"", "aba de alertas deve existir");
includes(html, "id=\"aiDraftApproveHint\"", "aprovação deve expor motivo de bloqueio");
includes(app, "function aiDraftReadiness", "prontidão da aprovação deve ter cálculo único");
includes(app, "el.aiDraftApprove.disabled = !readiness.ready", "aprovação deve bloquear visualmente pendências");
includes(app, "Texto original removido conforme política de retenção", "corpo expirado deve ter fallback explícito");
includes(css, ".ai-draft-workspace", "layout C3 deve ter workspace próprio");
assert.match(css, /@container\s*\(max-width:\s*1080px\)/, "workspace deve responder à largura do Web Resource");
includes(css, ".ai-draft-source", "fonte do e-mail deve ter painel próprio");

includes(app, "{ value: 202410005, label: \"Pendente\" }", "fallback real de Status de Faturamento");
includes(app, "{ value: 202410000, label: \"Cartao de credito\" }", "fallback real de Forma de Pagamento");
includes(app, "{ value: 202410000, label: \"Guarulhos\" }", "fallback real de Tipo do Servico");
includes(app, "{ value: 202410000, label: \"Basico\" }", "fallback real de Tipo do Veiculo");
excludes(app, "{ value: 1, label: \"Aeroporto ida e volta\" }", "fallback antigo inventado");
excludes(app, "{ value: 30, label: \"Ativo\" }", "fallback antigo inventado para status passageiro");
excludes(app, "function createManualImportedTrecho", "importacao nao deve criar servico manual dentro da PG");
excludes(app, "add-manual-trecho", "acao de adicionar servico manual por PG deve ficar removida");
excludes(app, "Adicionar serviço manual", "botao de servico manual nao deve existir");
excludes(app, "originStatus: \"Manual\"", "trecho manual nao deve ser criado pela importacao");
excludes(app, "importOrigin: \"manual\"", "origem tecnica manual nao deve ser criada pela importacao");

includes(app, "async function searchPassengersServer", "busca server-side de passageiros");
includes(app, "async function ensurePassengersByIds", "carga pontual por ids de passageiros");
includes(app, "INITIAL_PASSENGER_LOOKUP_LIMIT", "solicitante deve carregar Banco de Dados no inicio");
includes(app, "renderPassengerPickerHint(query ? \"Pesquisando passageiros...\" : \"Carregando Banco de Dados...\")", "picker deve listar Banco de Dados sem exigir texto");
excludes(app, "Digite pelo menos 1 caractere", "busca no Banco de Dados nao deve exigir 1 caractere");
includes(app, "apelido: \"new_apelido\"", "motorista deve usar campo de apelido");
includes(app, "label: r[f.funcionario.apelido] || r[f.funcionario.nome]", "motorista deve exibir apelido com fallback para nome completo");

includes(html, "id=\"passengerMatchOverlay\"", "overlay de possivel duplicidade de passageiro");
includes(html, "viewport-fit=cover", "webresource deve permitir calculo correto de safe area no iPhone");
includes(app, "function currentViewportMetrics", "app deve calcular viewport real via visualViewport");
includes(app, "window.visualViewport?.addEventListener(\"resize\", syncViewportMetrics)", "iPhone deve recalcular altura visual ao mudar viewport");
includes(html, "id=\"closeRwButton\"", "topbar deve ter botao de fechar RW");
includes(html, "id=\"globalImportHistoryActions\"", "topbar deve ter undo/redo global em todas as abas");
includes(app, "function closeWebResourceToGeral", "botao fechar deve voltar para Geral");
includes(app, "el.closeSuccess?.addEventListener(\"click\", closeWebResourceToGeral);", "OK de sucesso deve fechar RW pela mesma funcao do botao fechar");
const toastFunction = extractFunction(app, "toast");
includes(toastFunction, "item.addEventListener(\"click\"", "toast deve fechar ao clicar no corpo");
includes(toastFunction, "if (getSelectedText()) return;", "toast nao deve fechar durante selecao de texto");
includes(toastFunction, "event.stopPropagation();", "botao de fechar do toast nao deve disparar clique do corpo");
includes(app, "pageType: \"entitylist\"", "fechar RW deve navegar para lista Model-driven");
includes(app, "entityName: CONFIG.entities.reserva", "fechar RW deve usar tabela real Geral");
includes(css, "--app-viewport-height", "CSS deve usar altura visual calculada");
includes(css, "--shell-padding-top: 8px;", "mobile nao deve duplicar safe-area do host Power Apps");
includes(css, ".status-select > span,", "regra do label de status nao deve afetar valor do select customizado");
includes(css, ".topbar .status-select > span", "mobile deve ocultar so o label direto do status");
excludes(css, ".topbar .status-select span {\n    display: none;", "mobile nao pode esconder o texto selecionado do status");
includes(app, "function findPassengerDuplicateCandidates", "validacao multipla de duplicidade");
includes(app, "function scorePassengerCandidate", "pontuacao de candidato duplicado");
includes(app, "Certeza que este nao e o passageiro desejado?", "pergunta de confirmacao de duplicidade");
includes(app, "Telefone igual", "validacao por telefone");
includes(app, "Email igual", "validacao por email");
includes(app, "Nome muito parecido", "validacao por nome parecido");
includes(app, "Mesmo cliente", "validacao por cliente");

const matcher = buildPassengerMatcher();
const importedMatchSelector = buildImportedMatchSelector();
const phone = buildPhoneParser();
const passengerClientDefault = buildPassengerClientDefaultHarness();
assert.ok(
  matcher.scorePassengerCandidate(
    { label: "Ricardo Almeida", clienteId: "cliente-a", telefone: "", email: "" },
    { id: "pax-1", label: "Rciardo Almedia", clienteId: "cliente-a", telefone: "", email: "" }
  ),
  "deve capturar nome com letras transpostas e mesmo cliente"
);
assert.ok(
  matcher.scorePassengerCandidate(
    { label: "Marina Costa", clienteId: "", telefone: "", email: "" },
    { id: "pax-2", label: "Marina Cotsa", clienteId: "", telefone: "", email: "" }
  ),
  "deve capturar erro claro de digitacao mesmo sem telefone/email"
);
assert.ok(
  matcher.scorePassengerCandidate(
    { label: "Carlos Eduardo Silva", clienteId: "cliente-a", telefone: "", email: "" },
    { id: "pax-3", label: "Silva Carlos Eduardo", clienteId: "cliente-a", telefone: "", email: "" }
  ),
  "deve capturar nome em ordem diferente com mesmo cliente"
);
assert.equal(
  importedMatchSelector.selectImportedExistingMatch([
    {
      passenger: { id: "pax-4", label: "Pedro Vega", clienteId: "cliente-a" },
      score: 105,
      reasons: ["Telefone igual", "Mesmo cliente"]
    }
  ], { id: "cliente-a", label: "Embraer" }),
  null,
  "importacao nao deve auto-vincular telefone igual quando o nome e muito diferente"
);
assert.ok(
  importedMatchSelector.selectImportedExistingMatch([
    {
      passenger: { id: "pax-5", label: "Porter", clienteId: "cliente-a" },
      score: 135,
      reasons: ["Telefone igual", "Nome quase igual", "Mesmo cliente"]
    }
  ], { id: "cliente-a", label: "Embraer" }),
  "importacao deve auto-vincular telefone igual quando o nome tambem confere"
);
assert.ok(
  importedMatchSelector.selectImportedExistingMatch([
    {
      passenger: { id: "pax-6", label: "Porter", clienteId: "cliente-a" },
      score: 65,
      reasons: ["Nome igual", "Nome quase igual", "Mesmo cliente"],
      candidateMissingContact: true
    }
  ], { id: "cliente-a", label: "Embraer" }),
  "importacao deve auto-vincular nome identico e mesmo cliente quando o importado nao tem telefone/email"
);
assert.equal(
  importedMatchSelector.selectImportedExistingMatch([
    {
      passenger: { id: "pax-7", label: "Porter", clienteId: "cliente-a" },
      score: 65,
      reasons: ["Nome igual", "Nome quase igual", "Mesmo cliente"],
      candidateMissingContact: false
    }
  ], { id: "cliente-a", label: "Embraer" }),
  null,
  "importacao nao deve auto-vincular nome identico quando o importado tem contato sem bater"
);
assert.deepEqual(
  passengerClientDefault.run({ clienteId: "cliente-a", clienteLabel: "Cliente A" }),
  { value: "cliente-a", sideEffects: ["status-default", "render-status"] },
  "selecionar passageiro deve preencher cliente vazio com o cliente salvo no cadastro"
);
assert.deepEqual(
  passengerClientDefault.run(
    { clienteId: "cliente-a", clienteLabel: "Cliente A" },
    "cliente-manual",
    [{ value: "cliente-a" }, { value: "cliente-manual" }]
  ),
  { value: "cliente-manual", sideEffects: [] },
  "cliente escolhido manualmente nao deve ser sobrescrito ao selecionar passageiro"
);
assert.deepEqual(
  passengerClientDefault.run({ clienteId: "", clienteLabel: "" }),
  { value: "", sideEffects: [] },
  "passageiro sem cliente salvo nao deve alterar o formulario"
);

assert.equal(
  phone.parsePhoneNumberForInput("+54 11 9999-9999").formatted,
  "+54 11 9999-9999",
  "deve manter caracteres comuns de telefone ao colar"
);
assert.equal(
  phone.parsePhoneNumberForSelectedCountry("+54 11 9999-9999").formatted,
  "+54 11 9999-9999",
  "parser simplificado nao deve depender de seletor de pais"
);
assert.equal(
  phone.parsePhoneNumberForInput("4155552671").digits,
  "4155552671",
  "deve aceitar numero nacional simples"
);
assert.equal(
  phone.parsePhoneNumberForInput("14155552671").digits,
  "14155552671",
  "nao deve reformatar numero ja digitado"
);
assert.equal(
  phone.parsePhoneNumberForInput("02079460056").digits,
  "02079460056",
  "nao deve validar DDD, tronco ou padrao internacional"
);
assert.equal(
  phone.phoneStorageValue("+55 (11) 98765-4321"),
  "+55 (11) 98765-4321",
  "valor salvo deve preservar mascara comum de telefone"
);

const mockDb = buildMockDbHarness();
mockDb.setMockDb({ reservas: [{ id: "res-1" }], relacoes: [{ reservaId: "res-1" }] });
assert.deepEqual(mockDb.getMockDb().passageiros, [], "mock antigo sem passageiros deve continuar valido");
mockDb.persistMockPassengerRecord({ id: "local-pax-1", label: "Pessoa Local", clienteId: "cliente-embraer" });
assert.equal(mockDb.getMockDb().passageiros.length, 1, "mock deve persistir passageiro local");
mockDb.persistMockPassengerRecord({ id: "local-pax-1", label: "Pessoa Editada", clienteId: "cliente-embraer" });
assert.equal(mockDb.getMockDb().passageiros.length, 1, "mock deve atualizar passageiro local sem duplicar");
assert.equal(mockDb.getMockDb().passageiros[0].label, "Pessoa Editada", "mock deve manter hot edit local");

const parseLaunchRecordId = buildLaunchParamHarness();
const launchGuid = "11111111-2222-3333-4444-555555555555";
assert.equal(
  parseLaunchRecordId(`?data=${encodeURIComponent(JSON.stringify({ entityId: `{${launchGuid}}` }))}`),
  launchGuid,
  "abertura por command bar deve aceitar data.entityId"
);
assert.equal(
  parseLaunchRecordId(`?data=${encodeURIComponent(JSON.stringify({ selectedItemReferences: [{ Id: `{${launchGuid}}` }] }))}`),
  launchGuid,
  "abertura por lista deve aceitar selectedItemReferences"
);
assert.equal(
  parseLaunchRecordId(`?ids=%7B${launchGuid}%7D`),
  launchGuid,
  "abertura por comando de grid deve aceitar ids"
);
assert.equal(
  parseLaunchRecordId("", `{${launchGuid}}`),
  launchGuid,
  "web resource em formulario principal deve ler o id do formulario pai"
);

includes(app, "MAX_FREQUENT_SERVICE_DAYS", "limite para periodo recorrente");
includes(app, "Data de retorno nao pode ser anterior a saida", "validacao retorno antes da saida");
includes(app, "Periodo frequente muito grande", "validacao de recorrencia grande demais");
includes(app, "buildRecurringRetornoPrevisto", "recorrencia deve recalcular previsao de retorno por data gerada");
excludes(app, "Agendar Retorno' ao mesmo tempo", "Retorno e Repetir podem ser usados juntos na criacao");
includes(app, "collectInactiveActivationDrafts", "save deve interceptar abas preenchidas sem ativar");
includes(app, "hasInactiveReturnDraft", "retorno preenchido sem ativar deve ter estado pendente");
includes(app, "hasInactiveRepeatDraft", "repetir preenchido sem ativar deve ter estado pendente");
{
  const saveFormFunction = extractFunction(app, "saveForm");
  excludes(saveFormFunction, "if (state.isNew && !hasPrimaryDraftChanges())", "salvar formulario vazio deve focar o primeiro campo obrigatorio");
  includes(saveFormFunction, "const context = buildSaveContext();", "save deve montar contexto antes de validar");
  includes(saveFormFunction, "proceedSaveContext(context);", "save deve entrar no fluxo de validacao");
}
{
  const proceedStart = app.indexOf("function proceedSaveContext");
  assert.ok(proceedStart >= 0, "Funcao proceedSaveContext deve existir");
  const proceedEnd = app.indexOf("async function performSave", proceedStart);
  assert.ok(proceedEnd > proceedStart, "Funcao proceedSaveContext deve vir antes de performSave");
  const proceedSaveContext = app.slice(proceedStart, proceedEnd);
  const validationIndex = proceedSaveContext.indexOf("const validation = validateContext(context);");
  const guardIndex = proceedSaveContext.indexOf("const inactiveDrafts = collectInactiveActivationDrafts();");
  assert.ok(validationIndex >= 0, "proceedSaveContext deve validar campos obrigatorios");
  assert.ok(guardIndex >= 0, "proceedSaveContext deve checar abas pendentes");
  assert.ok(
    validationIndex < guardIndex,
    "guard de ativacao deve rodar depois das validacoes obrigatorias"
  );
  includes(proceedSaveContext, "skipActivationGuard", "salvar sem ativar nao deve reabrir o mesmo popup");
}
includes(html, "id=\"activationGuardOverlay\"", "popup de confirmacao para abas preenchidas sem ativar");
includes(html, "id=\"activationGuardActivate\"", "popup deve permitir ativar e agendar");
includes(html, "id=\"receberRetorno\"", "aba retorno deve ter receber separado da ida");
includes(html, "id=\"valorReceber\"", "formulario deve expor campo Valor a receber");
includes(html, "id=\"returnReceiveScopeOverlay\"", "repetir ida e retorno deve perguntar escopo do receber retorno");
includes(app, "resolveReceberPayloadValue", "payload deve separar receber da ida e do retorno");
includes(app, "valorReceber: \"cr40f_valor_a_receber\"", "formulario deve mapear campo Valor a receber");
includes(app, "origemVeiculo: \"new_origemveiculo\"", "formulario deve mapear Origem do Veiculo da Geral");
includes(app, "veiculo: \"cr40f_veiculo\"", "formulario deve mapear lookup Veiculo da Geral");
includes(app, "veiculo: \"cr40f_Veiculo\"", "formulario deve usar nav property do lookup Veiculo");
includes(app, "setChoice(payload, CONFIG.fields.reserva.origemVeiculo, 100000001)", "payload manual deve marcar Origem do Veiculo Manual");
excludes(app, "CONFIG.fields.reserva.origemVeiculo, 100000000", "formulario nao deve gravar Origem Automatico: o carro automatico fica com o servidor");
excludes(app, "bindAutomaticVehicleLookup", "formulario nao deve preencher carro pela posse do motorista");
includes(app, "if (!state.vehicleOriginManual) return;", "payload so manda carro quando escolhido manualmente");
includes(app, "if (state.vehicleOriginManual || !state.isNew) return;", "trocar motorista so limpa o carro automatico em servico novo, nunca o manual");
includes(app, "state.vehicleOriginManual = !state.isNew || !!el.veiculo.value;", "servico novo com carro limpo nao deve mandar origem Manual sem carro");
includes(app, "[f.valorReceber]: parseNumber(el.valorReceber.value)", "payload deve salvar Valor a receber como money");
includes(app, "shouldAskReturnReceiveScope", "salvar deve perguntar se receber retorno vale para todos ou ultimo");
includes(app, "receberRetornoUltimoTimestamp", "escopo apenas ultimo deve marcar somente o ultimo retorno");
includes(css, ".tab.is-pending::after", "aba pendente deve ter bolinha amarela propria");
includes(html, "section-head inline activation-head", "cabecalho de ativacao deve ter layout proprio");
includes(css, ".activation-head .activation-switch", "switch de ativacao deve ter estilo compacto proprio");
const activationSwitchRule = extractCssRule(css, ".activation-head .activation-switch {");
includes(activationSwitchRule, "width: 148px;", "switch de ativacao deve ter largura fixa pelo texto Desativado");
includes(activationSwitchRule, "min-width: 148px;", "switch de ativacao nao deve encolher ao mostrar Ativado");
const activationSwitchTextRule = extractCssRule(css, ".activation-head .activation-switch span {");
includes(activationSwitchTextRule, "white-space: nowrap;", "texto do switch de ativacao nao deve quebrar");
includes(activationSwitchTextRule, "overflow: hidden;", "texto do switch de ativacao nao deve vazar do botao");
includes(app, "function syncActivationSwitchLabels()", "switch de ativacao deve sincronizar legenda dinamica");
includes(app, "text.textContent = input.checked ? \"Ativado\" : \"Desativado\";", "switch desligado deve mostrar Desativado");
const mobileActivationHeadRule = extractCssRule(css, "  .section-head.inline.activation-head {");
includes(mobileActivationHeadRule, "position: sticky;", "mobile deve fixar cabecalho de ativacao no topo");
includes(mobileActivationHeadRule, "grid-template-columns: repeat(2, minmax(0, 1fr));", "mobile deve distribuir ativacao e receber em duas colunas");
includes(mobileActivationHeadRule, "align-items: center;", "mobile deve centralizar titulo com botao de ativacao");
includes(mobileActivationHeadRule, "padding: 0 2px 3px 0;", "mobile deve reduzir padding do bloco de ativacao");
const mobileActivationSwitchRule = extractCssRule(css, "  .activation-head .activation-switch {");
includes(mobileActivationSwitchRule, "justify-self: end;", "mobile deve fixar botao de ativacao no canto superior direito");
includes(mobileActivationSwitchRule, "width: 100%;", "mobile deve ocupar a coluna com o botao de ativacao");
includes(mobileActivationSwitchRule, "padding: 6px 7px;", "mobile deve reduzir padding do botao de ativacao");
const returnDateTimeFieldRule = extractCssRule(css, "#tab-panel-return .field.datetime-field,");
includes(returnDateTimeFieldRule, "flex: 1 1 min(100%, var(--datetime-field-width));", "data de retorno deve crescer quando sobrar espaco");
includes(returnDateTimeFieldRule, "width: auto;", "data de retorno nao deve travar largura fixa no desktop");
excludes(css, "#tab-panel-return .section-head.inline.activation-head", "retorno deve herdar o mesmo activation-head do repetir");
excludes(css, "#tab-panel-return .activation-head .activation-switch", "retorno deve herdar o mesmo switch do repetir");
const mobileReturnDateTimeFieldRule = extractCssRule(css, "  #tab-panel-return .field.datetime-field,");
includes(mobileReturnDateTimeFieldRule, "flex: 1 1 100%;", "mobile deve forcar data de retorno em largura total");
includes(html, "return-address-field", "aba retorno deve permitir endereco em coluna compacta");
includes(html, "return-destination-field", "aba retorno deve permitir destino em coluna compacta");
const returnFormSectionRule = extractCssRule(css, "#tab-panel-return .form-section {");
includes(returnFormSectionRule, "padding: 0;", "aba retorno nao deve ter borda lateral maior por padding extra do form-section");
includes(css, "#tab-panel-return .return-address-field", "aba retorno deve ter layout compacto proprio");
includes(css, "#tab-panel-return .return-observation-field textarea", "observacao do retorno deve ficar menos alta");
includes(css, ".switch", "switch deve ter regra CSS propria");
includes(css, "cursor: pointer;", "controles clicaveis devem exibir cursor de clique");
includes(css, "input[type=\"datetime-local\"]:not(:disabled)", "seletor de data/hora deve ter cursor clicavel");
includes(css, "::-webkit-calendar-picker-indicator", "icone nativo de calendario deve ter cursor clicavel");
includes(app, "const PT_BR_LOCALE = \"pt-BR\";", "locale pt-BR deve ser constante unica para datas");
includes(app, "function enforceDocumentPtBrLocale", "documento deve reforcar locale pt-BR");
includes(app, "installPtBrDateLocaleObserver();", "datas dinamicas devem receber locale pt-BR automaticamente");
includes(app, "input.setAttribute(\"lang\", PT_BR_LOCALE);", "date/datetime nativo deve receber lang pt-BR");
includes(app, "input.setAttribute(\"autocomplete\", \"off\");", "date/datetime nativo deve desativar autocomplete do browser");
includes(app, "input.setAttribute(\"data-locale\", PT_BR_LOCALE);", "date/datetime nativo deve carregar marcador de locale");
includes(app, "parseDateInputValue(startValue)", "periodo frequente deve parsear date local sem depender do parser nativo");
excludes(app, "function installPtBrDateInput", "date/datetime nao deve trocar controle nativo por display texto");
excludes(css, ".ptbr-date-native", "controle nativo nao deve ser ocultado");
{
  const returnPanelStart = html.indexOf("id=\"tab-panel-return\"");
  const returnPanelEnd = html.indexOf("<section class=\"form-section\">", returnPanelStart);
  const returnHead = html.slice(returnPanelStart, returnPanelEnd);
  assert.ok(
    returnHead.indexOf("<h2>Agendar retorno</h2>") < returnHead.indexOf("class=\"switch activation-switch\""),
    "switch de retorno deve ficar a direita do titulo"
  );
  assert.ok(
    returnHead.indexOf("id=\"receberRetorno\"") > returnHead.indexOf("class=\"switch activation-switch\""),
    "receber retorno deve ficar ao lado do switch de ativacao no cabecalho"
  );

  const repeatPanelStart = html.indexOf("id=\"tab-panel-repeat\"");
  const repeatPanelEnd = html.indexOf("<section class=\"form-section\">", repeatPanelStart);
  const repeatHead = html.slice(repeatPanelStart, repeatPanelEnd);
  assert.ok(
    repeatHead.indexOf("<h2>Serviços frequentes</h2>") < repeatHead.indexOf("class=\"switch activation-switch\""),
    "switch de repetir deve ficar a direita do titulo"
  );
}

includes(html, "id=\"importXlsxButton\"", "botao de upload XLSX");
includes(html, "id=\"xlsxImportInput\"", "input de arquivo XLSX");
includes(html, "data-tab=\"import\"", "aba de revisao do import XLSX");
includes(html, "id=\"tab-panel-import\"", "painel de revisao do import XLSX");
excludes(html, "id=\"importReviewOverlay\"", "overlay antigo de revisao do import XLSX");
excludes(html, "import-review-dialog\" role=\"dialog\"", "importacao nao deve abrir como dialog modal");
excludes(html, "id=\"importSaveAll\"", "aba de importacao nao deve exibir botao de salvar todos validos");
excludes(html, "Salvar todos válidos", "botao de salvar todos validos deve ser removido");
excludes(html, "id=\"importReviewCancel\"", "aba de importacao nao deve exibir botao voltar aos detalhes");
excludes(html, "Voltar aos detalhes", "botao voltar aos detalhes deve ser removido");
excludes(app, "saveAllValidImportedTrechos", "handler de salvar todos validos deve ser removido");
excludes(app, "closeImportReview", "handler de voltar aos detalhes deve ser removido");
includes(html, "scripts/xlsx_import_core.js", "core de import XLSX carregado antes do app");
excludes(html, "vendor/xlsx.full.min.js", "SheetJS nao deve carregar no boot");
includes(app, "async function ensureXlsxLibrary", "SheetJS deve carregar sob demanda");
includes(app, "script.src = \"vendor/xlsx.full.min.js\";", "SheetJS local deve continuar disponivel para importacao");
includes(app, "idExterno: \"new_idexterno\"", "campo externo PG no payload da reserva");
const importedReservaTenarisIdFieldFn = extractFunction(app, "importedReservaTenarisIdField");
includes(importedReservaTenarisIdFieldFn, "return CONFIG.fields.reserva.idExterno;", "PG importada deve usar campo texto new_idexterno");
excludes(importedReservaTenarisIdFieldFn, "idTenaris", "PG importada nao deve usar cr40f_idtenaris inteiro");
includes(app, "splitGroupId", "Split deve manter grupo temporario compartilhado");
includes(app, "source.splitRole = \"outbound\"", "Split deve identificar trecho de ida");
includes(app, "splitRole: \"return\"", "Split deve identificar trecho de retorno");
includes(app, "function isAuthorizedImportedSplitSibling", "mesma PG so pode ser liberada para irmao Split autorizado");
includes(app, "findExistingImportedReservasByProgramacao", "validacao de PG deve consultar todos os registros existentes");
excludes(app, "?$select=${select}&$filter=${filter}&$top=1", "validacao de PG nao deve limitar ao primeiro registro");
includes(app, "Split vinculado", "cards do Split devem exibir selo de vinculo");
includes(app, "importDefaults:", "configuracao padrao de importacao");
includes(app, "clienteLabel: \"Embraer\"", "cliente padrao Embraer para importacao");
includes(app, "function getImportClient", "resolucao do cliente padrao Embraer");
includes(app, "function ensureImportedSolicitanteRecord", "criacao/resolucao automatica do solicitante importado");
includes(app, "function selectImportedExistingMatch", "match automatico seguro de cadastro existente");
includes(app, "function createImportedPersonRecord", "criacao automatica de solicitante/passageiro importado");
includes(app, "function findImportedExistingPersonFromDuplicateError", "erro de passageiro duplicado deve reaproveitar cadastro existente");
includes(app, "function extractDuplicatePassengerId", "erro Dataverse deve permitir extrair ID do passageiro duplicado");
includes(app, "findImportedExistingPerson(person)\n              || await findImportedExistingPersonFromDuplicateError(person, error)", "criacao importada deve usar fallback robusto para chave duplicada");
includes(app, "ultimoServico: \"cr40f_datadoultimoservico\"", "campo Data do Ultimo Servico deve estar mapeado no passageiro");
includes(app, "async function updatePassengersLastServiceDate", "salvamento deve atualizar Data do Ultimo Servico dos passageiros");
includes(app, "await updatePassengersLastServiceDate(context.colOrdemPassageiros, maxServiceResultDate(results))", "formulario deve atualizar passageiro pela maior data salva");
includes(app, "await updatePassengersLastServiceDate(context.colOrdemPassageiros, context.dataHoraPrincipal)", "importacao deve atualizar passageiro pela data do trecho salvo");
includes(app, "function uniquePassengerRelationItems", "vinculos servico-passageiro devem deduplicar passageiro antes do Dataverse");
includes(app, "const relationPassengers = uniquePassengerRelationItems(passengers);", "salvamento deve usar lista deduplicada para evitar chave duplicada");
includes(app, "Falha ao desfazer reserva importada incompleta", "falha em vinculo importado deve tentar desfazer reserva recem-criada");
includes(app, "\"aguardando prestador\"", "status XLSX Aguardando prestador deve existir para ignorar automaticamente");
includes(app, "function applyImportedExternalStatusRules", "importacao deve aplicar regra de status externo antes da revisao");
includes(app, "function notifyImportedAutoIgnoredExternalStatuses", "status Aguardando prestador deve avisar o usuario");
includes(app, "serviço(s) com status XLSX Aguardando prestador foram ignorados automaticamente", "aviso de Aguardando prestador deve explicar ignorados automaticos");
includes(app, "function notifyUnknownImportedExternalStatuses", "status XLSX desconhecido deve avisar o operador");
includes(app, "Estes serviços serão assumidos como Confirmado", "status desconhecido deve assumir Confirmado com aviso");
includes(app, "function resolveImportedOperationStatusLabel", "salvamento importado deve resolver status operacional pelo status XLSX");
includes(app, "function resolveImportedOperationStatusValue", "salvamento importado deve permitir override do status Dataverse");
includes(app, "setChoice(payload, f.status, resolveImportedOperationStatusValue(trecho))", "payload importado deve usar status Dataverse escolhido/conversao XLSX");
excludes(app, "showTemporaryStatusLogicReminder", "lembrete temporario de status deve ser removido");
excludes(app, "LEMBRETE TEMPORARIO", "toast temporario de status deve ser removido");
const createImportedPersonRecordFn = extractFunction(app, "createImportedPersonRecord");
includes(createImportedPersonRecordFn, "[CONFIG.fields.passageiro.email]: normalizeEmail(person.email || \"\")", "passageiro novo importado deve gravar email quando existir");
includes(createImportedPersonRecordFn, "[CONFIG.fields.passageiro.telefone]: phoneStorageValue(person.telefone || \"\")", "passageiro novo importado deve gravar telefone");
includes(createImportedPersonRecordFn, "setChoice(payload, CONFIG.fields.passageiro.status, getActivePassengerStatusValue())", "passageiro novo importado deve gravar status Ativo");
excludes(createImportedPersonRecordFn, "[CONFIG.fields.passageiro.cr]: person.centroCusto || \"\"", "passageiro novo importado nao deve gravar CR");
includes(createImportedPersonRecordFn, "bindLookup(payload, CONFIG.nav.cliente, CONFIG.entitySets.cliente, importClient.id)", "passageiro novo importado deve gravar cliente");
includes(createImportedPersonRecordFn, "cr: \"\",", "registro local criado por importacao nao deve fingir CR salvo no BD");
excludes(createImportedPersonRecordFn, "setChoice(payload, CONFIG.fields.passageiro.classificacao", "passageiro novo importado nao deve gravar classificacao automatica");
excludes(createImportedPersonRecordFn, "CONFIG.fields.passageiro.cadastro", "passageiro novo importado nao deve gravar data de cadastro pela importacao");
includes(app, "function openXlsxImportPicker", "abertura do seletor XLSX");
includes(app, "async function handleXlsxImportFile", "leitura do XLSX");
includes(app, "document.addEventListener(\"dragenter\", handleXlsxImportDragEnter)", "importacao XLSX deve aceitar dragenter global");
includes(app, "document.addEventListener(\"drop\", handleXlsxImportDrop)", "importacao XLSX deve aceitar drop global");
includes(app, "async function processXlsxImportFile", "input e drag/drop devem reutilizar o mesmo pipeline XLSX");
const canStartXlsxImportFn = extractFunction(app, "canStartXlsxImport");
includes(canStartXlsxImportFn, "hasPrimaryDraftChanges()", "upload XLSX deve bloquear formulario comum editado");
includes(canStartXlsxImportFn, "hasImportedServicesDraft()", "upload XLSX deve bloquear nova importacao quando ja existe revisao");
includes(app, "function hasImportedServicesDraft()", "estado de importacao carregada deve ter guard proprio");
includes(app, "Já existe uma importação em revisão", "bloqueio de novo XLSX deve explicar que ja existe importacao");
includes(app, "showSuccess(savedCount === 1 ? \"1 serviço importado!\" : `${savedCount} serviços importados!`);", "agendamento importado totalmente bem-sucedido deve abrir popup final com retorno para Geral");
includes(app, "getDroppedXlsxFile(event)", "drop deve extrair arquivo XLSX do DataTransfer");
includes(app, "Arquivo inválido. Solte um .xlsx.", "drop deve bloquear arquivo que nao seja XLSX");
includes(app, "if (el.importDropOverlay) el.importDropOverlay.hidden = false", "overlay de drop deve remover hidden ao arrastar arquivo");
includes(app, "if (el.importDropOverlay) el.importDropOverlay.hidden = true", "overlay de drop deve voltar a hidden ao encerrar drag/drop");
includes(app, "let xlsxDropOverlayState = \"\";", "overlay de drop deve cachear estado visual para evitar repaint em dragover");
const xlsxDragOverHandler = extractFunction(app, "handleXlsxImportDragOver");
excludes(xlsxDragOverHandler, "previewXlsxDrop(event)", "dragover nao deve atualizar DOM continuamente");
excludes(xlsxDragOverHandler, "getDroppedXlsxFile(event)", "dragover nao deve ler arquivos continuamente");
includes(app, "function renderImportReview", "render do resumo de importacao");
includes(app, "function renderImportReviewFilters", "importReviewStats deve virar barra de filtros");
includes(app, "state.importReviewFilter = importReviewFilters().ALL", "nova importacao deve iniciar no filtro Todos");
includes(app, "dataset.importFilter", "filtros devem ser clicaveis por data attribute");
includes(app, "buildImportReviewFilterButton(\"Todos\"", "filtro Todos deve existir");
includes(app, "buildImportReviewFilterButton(\"Validados\"", "filtro Validados deve existir");
includes(app, "buildImportReviewFilterButton(\"Pendentes\"", "filtro Pendentes deve existir");
includes(app, "buildImportReviewFilterButton(\"Ignorados\"", "filtro Ignorados deve existir");
excludes(app, "function importStat", "importReviewStats nao deve renderizar cards passivos antigos");
excludes(app, "importStat(\"Linhas\"", "cards passivos Linhas/PGs/Trechos devem sair do header");
includes(app, "async function saveImportedTrecho", "salvamento de trecho importado");
excludes(app, "async function applyImportedTrechoToForm", "servico importado nao deve abrir no formulario comum");
includes(app, "async function checkImportedProgramDuplicates", "checagem de duplicidade por servico importado");
includes(app, "function scoreImportedTrechoDuplicate", "pontuacao de duplicidade por horario/trajeto/endereco/passageiros");
includes(app, "possibleDuplicateMatches", "alerta de servico parecido sem bloquear automaticamente");
includes(app, "await findExistingImportedReservasByProgramacao(trecho.programacao)", "salvamento importado deve revalidar todos os registros da PG antes de criar reserva");
includes(app, "markImportedTrechoAsDuplicate(trecho, existingReserva", "salvamento importado deve bloquear PG existente antes do create");
includes(app, "if (isDataverseDuplicateKeyError(error))", "erro Dataverse de chave duplicada deve ter tratamento especifico");
includes(app, "const existing = await findImportedExistingPerson(person);", "duplicidade de passageiro importado deve tentar vincular cadastro existente");
includes(app, "function handleImportFieldCopy", "campo bloqueado deve copiar valor clicado");
includes(app, "Serviço criado com sucesso", "mensagem simples ao criar 1 servico");
includes(app, "serviços criados com sucesso!", "mensagem simples ao criar varios servicos");
includes(app, "Serviço editado com sucesso!", "mensagem simples ao editar");
excludes(app, "serviço(s) solicitado(s) com sucesso!", "mensagem antiga com plural generico removida");
excludes(app, "Tipo do Veículo:", "mensagem de conclusao nao deve detalhar veiculo");
includes(app, "dataset.importCopy = \"1\"", "campos bloqueados devem expor acao de copia");
includes(app, "function addClassIfPresent", "classList.add dinamico deve ignorar token vazio");
includes(app, "addClassIfPresent(button, `is-${normalizeImportedReviewStatus(trecho) || \"\"}`)", "status de importacao deve usar classe segura");
excludes(app, "classList.add(isDuplicated ? \"duplicado\" : \"\")", "inspector nao pode quebrar com classList.add vazio");
excludes(app, "function buildImportDecisionPanel", "revisao importada nao deve renderizar painel de decisao operacional");
excludes(app, "import-decision-panel", "painel de decisao operacional deve ser removido");
excludes(app, "Interpretação da PG", "revisao importada nao deve mostrar rotulo redundante de interpretacao da PG");
includes(app, "MULTI_PICKUP", "revisao importada deve respeitar PG com coletas sequenciais sem mensagem visual");
excludes(app, "Manter 1 OS", "revisao importada nao deve exibir botao desnecessario quando a PG ja e uma OS");
excludes(app, "É o mesmo carro", "revisao importada nao deve expor botao de mesmo carro");
excludes(app, "toggle-same-car-selection", "lista de importacao nao deve expor seletor de merge");
excludes(app, "merge-same-car", "lista de importacao nao deve expor acao de merge mesmo carro");
excludes(app, "Abrir formulário", "inspector de importacao nao deve exibir botao Abrir formulario");
includes(app, "function undoImportReviewChange", "importacao deve ter undo funcional");
includes(app, "function redoImportReviewChange", "importacao deve ter redo funcional");
includes(app, "captureImportReviewHistory(\"Editar campo do serviço\")", "edicao de campo do servico deve entrar no historico");
includes(app, "captureImportReviewHistory(`Editar passageiro importado: ${field.label}`)", "edicao no popup de passageiro importado deve entrar no historico");
includes(app, "function renderGlobalImportHistoryControls", "botoes de historico devem ser renderizados no topo global");
includes(app, "function handleGlobalImportHistoryAction", "topbar deve acionar undo/redo em qualquer aba");
includes(app, "data-import-history-action", "botoes de historico devem manter contrato de acao");
includes(app, "if (state.isNew) {\n      buttons.push(buildImportHistoryButton(\"Limpar\"", "botao Limpar deve aparecer somente em novo servico");
includes(app, "state.globalHistory = { undo: [], redo: [], pending: null }", "Limpar formulario deve zerar historico global");
includes(app, "if (el.importXlsxButton) el.importXlsxButton.hidden = !state.isNew", "botao XLSX deve sumir em modo edicao");
includes(app, "el.tabBd.hidden = false;", "aba Cadastrar Passageiro deve ficar disponivel em modo edicao");
includes(app, "if ((tab === \"import\" || tab === \"return\" || tab === \"repeat\") && !state.isNew)", "modo edicao deve bloquear abas de criacao sem bloquear cadastro de passageiro");
excludes(app, "tab === \"bd\" || tab === \"return\"", "modo edicao nao deve bloquear aba Cadastrar Passageiro");
includes(app, "Limpar formulário só está disponível em novo serviço.", "limpar deve ter bloqueio defensivo em edicao");
includes(app, "function importHistoryIconSvg", "botoes de historico devem usar icones SVG");
includes(app, "function focusImportHistoryTarget", "undo/redo deve focar item restaurado");
includes(app, "Foco: ${focusLabel}", "toast de undo/redo deve informar o foco restaurado");
includes(app, "function notifyImportHistoryToast", "undo/redo deve exibir toast de confirmacao");
includes(app, "handleImportHistoryShortcut", "Ctrl+Z/Ctrl+Y devem acionar historico do importador");
includes(css, ".import-history-button", "botoes Voltar/Para frente devem ter estilo proprio");
includes(css, ".import-history-icon", "icones de historico devem ter estilo proprio");
excludes(css, ".import-service-merge-toggle", "CSS do seletor de merge da galeria deve sair");
excludes(css, ".import-same-car-button", "CSS do botao Mesmo carro deve sair");
includes(app, "Separar ida/busca", "Split deve aparecer com linguagem operacional");
excludes(app, "buildImportAction(\"Manter espera\"", "usuario nao deve ter botao Manter espera no formulario importado");
excludes(app, "action.dataset.importAction === \"keep-waiting\"", "handler visual de Manter espera deve sair");
includes(app, "function buildImportInspectorReviewActions", "inspector deve expor acoes de Validar/Ignorar ao lado da edicao");
includes(app, "canShowImportedSplitAction(trecho, reviewStatus, isDuplicated)", "Split deve ser decidido junto das acoes do inspector");
const importTrechoCardStart = app.indexOf("function buildImportTrechoCard");
const importReviewActionsStart = app.indexOf("function buildImportInspectorReviewActions", importTrechoCardStart);
assert.ok(importTrechoCardStart >= 0 && importReviewActionsStart > importTrechoCardStart, "Funcao buildImportTrechoCard nao encontrada");
const importTrechoCardFunction = app.slice(importTrechoCardStart, importReviewActionsStart);
excludes(importTrechoCardFunction, "buildImportEditorSection", "formulario importado nao deve dividir campos em secoes internas");
includes(importTrechoCardFunction, "fieldStack.className = \"import-hot-grid import-editor-stack\";", "formulario importado deve renderizar campos soltos no mesmo stack");
includes(importTrechoCardFunction, "buildImportObservationField(trecho)", "observacao importada deve usar o mesmo modelo segmentado do formulario comum");
includes(app, "function ensureImportedObservationState", "observacao importada deve manter buffers motorista/interna/final/passageiro");
includes(app, "data-import-observation-text", "textarea de observacao importada deve ter contrato proprio");
includes(app, "switch-import-obs", "observacao importada deve trocar entre Mot/Interna/Final/Pref Pax");
includes(app, "[f.obsOperacao]: importObs.motorista", "salvamento importado deve gravar observacao motorista");
includes(app, "[f.obsInterna]: importObs.interna", "salvamento importado deve gravar observacao interna");
includes(app, "[f.obsFinal]: importObs.final", "salvamento importado deve gravar observacao final");
includes(app, "[f.perfilPassageiro]: importObs.passageiro", "salvamento importado deve gravar preferencias do passageiro");
includes(importTrechoCardFunction, "buildImportSelect(\"Tipo do serviço\", \"tipoServicoValue\", sortByLabel(state.options.tipoServico)", "tipo do servico importado deve seguir label e ordenacao do formulario comum");
includes(importTrechoCardFunction, "buildImportSelect(\"Tipo do veículo\", \"tipoVeiculoValue\", state.options.tipoVeiculo", "tipo do veiculo importado deve seguir label do formulario comum");
includes(importTrechoCardFunction, "buildImportedDataverseStatusField(trecho)", "servico importado deve exibir Status Dataverse no stack de campos editaveis");
assert.ok(importTrechoCardFunction.indexOf("buildImportedDataverseStatusField(trecho)") < importTrechoCardFunction.indexOf("buildImportInput(\"Data e hora\""), "Status Dataverse deve ser o primeiro campo importado");
includes(importTrechoCardFunction, "const solicitanteSection = buildImportSolicitanteSection(trecho, {\n      editable: isEditing", "solicitante importado deve ter secao propria com modo de edicao");
includes(importTrechoCardFunction, "const isPassengerPickerOpen = !!trecho.passengerPickerOpen && isEditing;", "adicionar passageiro deve abrir seletor inline em modo editavel");
includes(importTrechoCardFunction, "buildImportAction(\"+\", \"add-import-passenger\", !isEditing)", "adicionar passageiro deve ficar disponivel sempre que o servico estiver em edicao");
excludes(importTrechoCardFunction, "buildImportAction(\"+\", \"add-import-passenger\", !isEditing || hasSolicitante)", "adicionar passageiro nao deve bloquear quando houver solicitante");
includes(importTrechoCardFunction, "picker.className = \"import-passenger-add-picker\";", "seletor de adicionar passageiro deve renderizar inline");
includes(importTrechoCardFunction, "picker.appendChild(buildImportPassengerAddSelect(trecho));", "seletor de passageiro deve usar campo dedicado");
includes(app, "function importedTrechoHasSolicitante(trecho)", "regra de solicitante atual deve ser centralizada");
excludes(app, "Remova o solicitante antes de adicionar passageiro.", "adicionar passageiro nao deve exigir remover solicitante");
includes(app, "head.className = \"import-passengers-head import-solicitante-head\"", "solicitante importado deve usar titulo igual ao de passageiros");
includes(app, "row.className = `import-passenger import-solicitante-row import-passenger-row passenger-row", "row do solicitante deve herdar a mesma anatomia visual do passageiro");
includes(app, "rowTitle.className = \"row-title passenger-name-button import-passenger-name-button import-solicitante-name-button\"", "solicitante importado deve usar o mesmo botao hot edit do passageiro");
includes(app, "rowTitle.dataset.importAction = \"open-import-solicitante\"", "solicitante importado deve abrir hot edit pelo nome");
includes(app, "renderPassengerPreview(rowPreview, importedSolicitantePreviewRecord", "solicitante importado deve ter hover preview igual ao passageiro");
includes(app, "buildImportRemoveButton(\"remove-import-passenger\", `Remover ${displayName}`)", "passageiro importado deve ter botao de remover em modo edicao");
includes(app, "buildImportRemoveButton(\"remove-import-solicitante\", \"Remover solicitante\")", "solicitante importado deve ter botao de remover em modo edicao");
includes(app, "svg.classList.add(\"import-row-remove-icon\")", "remover deve usar icone X de fechar sem texto visivel");
includes(app, "path.setAttribute(\"d\", \"M7 7l10 10M17 7L7 17\")", "icone de remover deve ser X/fechar");
includes(app, "buildImportAction(\"+\", \"add-import-solicitante\")", "solicitante vazio deve ter botao sutil de adicionar em modo edicao");
includes(app, "function importedSolicitanteCandidateRows(trecho = null)", "seletor deve incluir candidatos XLSX pendentes de cadastro");
includes(app, "function importedPassengerIdentityKey", "importacao deve ter identidade logica unica para pax/solicitante");
includes(app, "function linkedImportedPassengerForSolicitante", "solicitante igual ao pax deve localizar o mesmo registro importado");
includes(app, "syncImportedSolicitanteFromPassenger(trecho, passenger, previousIdentity)", "edicao do pax deve sincronizar solicitante igual");
includes(app, "syncImportedPassengerFromSolicitante(trecho, next, previousIdentity)", "edicao do solicitante deve sincronizar pax igual");
includes(app, "const solicitanteRecord = await ensureImportedSolicitanteRecord(trecho, colOrdemPassageiros)", "salvar deve resolver passageiros antes do solicitante para reaproveitar mesmo registro");
includes(app, "const linkedPassengerRecord = linkedPassengerIndex >= 0 ? colOrdemPassageiros[linkedPassengerIndex]?.passageiro : null", "solicitante igual ao pax deve reaproveitar record ja criado do passageiro");
excludes(app, "rowTitle.textContent = \"Solicitante\";", "solicitante nao deve aparecer dentro da row");
const passengerLoopEnd = normalizeLineEndings(importTrechoCardFunction).indexOf("    });\n    const solicitanteSection = buildImportSolicitanteSection(trecho, {");
assert.ok(passengerLoopEnd > 0, "Bloco de solicitante deve vir depois da lista de passageiros");
includes(css, ".import-inspector-head > div:not(.import-inspector-actions)", "regra do titulo nao deve empilhar botoes do inspector");
const importContentRule = extractCssRule(css, ".content:has(.import-review-panel.is-active)");
includes(importContentRule, "overflow: hidden;", "aba de importacao nao deve scrollar a tela inteira");
const importPanelRule = extractCssRule(css, ".import-review-panel.is-active {");
includes(importPanelRule, "height: 100%;", "painel de importacao deve ocupar a altura util da tela");
includes(importPanelRule, "grid-template-rows: auto auto minmax(0, 1fr);", "galeria deve ficar na linha flexivel do painel fixo");
const importProgramsRule = extractCssRule(css, ".import-review-programs {");
includes(importProgramsRule, "overflow: hidden;", "programas importados devem conter o scroll interno");
const importWorkbenchRule = extractCssRule(css, ".import-workbench {");
includes(importWorkbenchRule, "height: 100%;", "workbench importado deve ocupar a area disponivel");
const importServiceListRule = extractCssRule(css, ".import-service-list {");
includes(importServiceListRule, "overflow: auto;", "galeria importada deve ser a area scrollavel");
const importServiceRowRule = extractCssRule(css, ".import-service-row {");
includes(importServiceRowRule, "min-height: 50px;", "card da galeria importada deve ser mais enxuto");
includes(importServiceRowRule, "padding: 7px 9px 7px 12px;", "card da galeria importada deve ter padding compacto");
includes(app, "title.textContent = importedTrechoServiceListTimeLabel(trecho);", "galeria importada deve mostrar data, saida e retorno no titulo do servico");
includes(app, "function importedTrechoServiceListTimeLabel(trecho)", "galeria importada deve ter label de horario proprio para ida e retorno");
includes(app, "return [date, window].filter(Boolean).join(\" · \");", "label da galeria importada deve separar data e janela por ponto medio");
includes(app, "meta.textContent = composeImportTrajeto(trecho) || trecho.destino || \"rota pendente\";", "galeria importada deve mostrar apenas trajeto abaixo do titulo");
excludes(app, "pax.className = \"import-service-pax\";", "galeria nao deve exibir contador de pax");
includes(app, "main.append(title, meta);", "galeria deve manter apenas titulo e trajeto no lado esquerdo");
includes(app, "side.append(badge);", "lado direito da galeria deve ficar apenas com status");
excludes(app, "side.append(mode, badge);", "galeria nao deve exibir modo operacional no lado direito");
excludes(app, "side.append(pax, mode, badge);", "contador de pax nao deve ficar no lado direito");
excludes(app, "title.textContent = `${program.programacao} · Serviço ${index + 1}`;", "galeria importada nao deve mostrar PG e numero do servico no titulo");
const importServiceMainRule = extractCssRule(css, ".import-service-main {");
excludes(importServiceMainRule, "grid-template-columns: minmax(0, max-content) auto;", "lado esquerdo nao deve reservar coluna para pax");
excludes(css, ".import-service-pax", "CSS do contador de pax da galeria deve ser removido");
const importInspectorRule = extractCssRule(css, ".import-inspector {\n  --import-status-color");
includes(importInspectorRule, "overflow: auto;", "inspector deve conter overflow sem puxar scroll da tela");
const importEditorStackRule = extractCssRule(css, ".import-editor-stack {");
includes(importEditorStackRule, "display: flex;", "formulario importado deve seguir logica flex do formulario comum");
includes(importEditorStackRule, "flex-wrap: wrap;", "formulario importado deve quebrar por min-width");
excludes(css, ".import-editor-section", "formulario importado nao deve ter CSS de secoes internas");
const importFieldRule = extractCssRule(css, "\n.import-field {");
includes(importFieldRule, "--import-field-min: 200px;", "campos importados devem ter min-width base compactado");
includes(importFieldRule, "min-width: min(100%, var(--import-field-min));", "campos importados devem respeitar min-width responsivo");
includes(importFieldRule, "min-height: 66px;", "campos importados devem usar altura do field comum");
includes(importFieldRule, "padding: 8px;", "campos importados devem usar padding do field comum");
const importTrechoDesktopRule = extractCssRule(css, "@media (min-width: 980px) {\n  .import-trecho {");
excludes(importTrechoDesktopRule, "\"decision passengers\"", "formulario importado nao deve reservar linha para painel de decisao");
includes(importTrechoDesktopRule, "grid-template-columns: minmax(0, 1fr) var(--import-passenger-block-width, max-content);", "formulario importado deve reservar coluna real para passageiros");
const importPassengersDesktopRule = extractCssRule(css, "  .import-passengers {\n    grid-area: passengers;");
includes(importPassengersDesktopRule, "position: static;", "lista de passageiros nao deve sobrepor campos com position absolute");
includes(importPassengersDesktopRule, "justify-self: end;", "lista de passageiros deve alinhar no topo direito da coluna real");
excludes(importPassengersDesktopRule, "position: absolute;", "lista de passageiros nao deve usar position absolute no desktop");
const importSolicitanteRowRule = extractCssRule(css, ".import-solicitante-row.passenger-row {");
includes(importSolicitanteRowRule, "grid-template-columns: minmax(0, 1fr) auto;", "solicitante deve usar a mesma estrutura de row do passageiro");
includes(importSolicitanteRowRule, "align-items: center;", "solicitante deve alinhar controle como row compacta");
excludes(css, ".import-solicitante-record-title", "solicitante nao deve ter tipografia propria diferente do passageiro");
const importSolicitanteFieldRule = extractCssRule(css, ".import-solicitante-picker .import-solicitante-field {");
includes(importSolicitanteFieldRule, "width: 100%;", "seletor do solicitante deve ocupar a linha mantendo shell comum");
const importPassengerAddFieldRule = extractCssRule(css, ".import-passenger-add-picker .import-passenger-add-field {");
includes(importPassengerAddFieldRule, "width: 100%;", "seletor de adicionar passageiro deve ocupar a linha mantendo shell comum");
excludes(css, ".import-solicitante-picker .import-solicitante-field > span", "label do seletor de solicitante deve aparecer igual ao formulario comum");
excludes(css, ".import-solicitante-picker .custom-select-trigger", "seletor de solicitante importado nao deve sobrescrever o trigger comum");
includes(app, "wrap.className = \"field required import-solicitante-field is-select\"", "seletor do solicitante importado deve usar a mesma classe base do formulario comum");
includes(app, "function initializeImportReviewControls()", "formulario importado deve inicializar custom select igual ao formulario comum");
includes(app, "wrap.className = \"field required import-field is-select\"", "tipo de servico e veiculo importados devem usar field required igual ao formulario comum");
includes(app, "select.setAttribute(\"aria-required\", \"true\")", "select importado obrigatorio deve expor aria-required");
includes(app, "function buildImportPassengerAddSelect(trecho, lookupRows = null)", "adicionar passageiro deve usar seletor inline em vez de popup direto");
includes(app, "select.dataset.importField = \"passengerRecordIdToAdd\";", "seletor inline de passageiro deve ter campo proprio");
includes(app, "select.dataset.placeholderLabel = \"Selecionar passageiro\";", "seletor inline de passageiro deve ter placeholder claro");
includes(app, "function createImportPassengerFromSelectedPerson", "seletor inline deve criar passageiro a partir do registro escolhido");
includes(app, "field === \"passengerRecordIdToAdd\"", "handler deve tratar selecao de passageiro inline");
includes(app, "const importClientLabel = getImportClient()?.label || CONFIG.importDefaults.clienteLabel || \"Cliente da importação\";", "candidatos XLSX devem exibir cliente abaixo do nome");
includes(app, "clienteLabel: person.clienteLabel || importClientLabel", "opcoes XLSX do solicitante devem usar subtitulo de cliente");
const importRowRemoveRule = extractCssRule(css, ".import-row-remove-button {");
includes(importRowRemoveRule, "width: 24px;", "remover de passageiro e solicitante deve ser icone compacto");
includes(importRowRemoveRule, "background: transparent;", "remover deve ser sutil em repouso");
includes(importRowRemoveRule, "opacity: 0.58;", "remover deve ter baixa presenca visual");
const importRowRemoveIconRule = extractCssRule(css, ".import-row-remove-icon {");
includes(importRowRemoveIconRule, "stroke: currentColor;", "icone de fechar deve herdar cor do botao");
const importInspectorActionsRule = extractCssRule(css, ".import-inspector-actions {");
includes(importInspectorActionsRule, "flex-wrap: nowrap;", "botoes do inspector devem ficar lado a lado");
includes(importInspectorActionsRule, "--import-inspector-action-height: 32px;", "botoes do inspector devem compartilhar altura fixa");
const importInspectorActionButtonRule = extractCssRule(css, ".import-inspector-actions .import-edit-toggle,");
includes(importInspectorActionButtonRule, "height: var(--import-inspector-action-height);", "editar, validar e ignorar devem ter a mesma altura");
const importValidateActionRule = extractCssRule(css, ".import-inspector-actions .primary-action[data-import-action=\"confirm-review\"]");
includes(importValidateActionRule, "var(--success)", "botao Validar deve usar verde semantico");
excludes(app, "keep-one", "revisao importada nao deve expor acao visual de manter 1 OS");
excludes(app, "manual-operational-review", "botao de revisar manual deve ser removido");
excludes(app, "Revisar manual", "botao de revisar manual nao deve aparecer");
excludes(app, "Ignorado: este trecho não será salvo.", "servico ignorado nao deve exibir aviso redundante no formulario");
excludes(app, "buildImportAction(\"Revisar novamente\", \"review-pending\")", "servico ignorado nao deve exibir botao interno de revisar novamente");
includes(app, "Validar", "acao principal da revisao deve ser Validar");
includes(app, "Ignorar", "acao secundaria da revisao deve ser Ignorar");
includes(app, "Serviço validado. Ele será incluído ao salvar a importação.", "toast de validar deve deixar claro que ainda precisa salvar");
includes(app, "Serviço ignorado. Ele não será salvo nesta importação.", "toast de ignorar deve confirmar a decisão");
includes(app, "toast(\"Serviço ignorado. Ele não será salvo nesta importação.\", \"error\", 4500)", "toast de ignorar deve usar vermelho");
includes(app, "Não validado:", "toast de bloqueio deve evitar parecer confirmação");
includes(app, "function getValidatedImportTrechos", "servicos validados devem sair da fila principal");
includes(app, "function getImportedIgnoredReason(trecho)", "servico ignorado deve resolver motivo fixo");
includes(app, "function buildImportIgnoredReasonNotice(trecho)", "inspector deve exibir motivo fixo de ignorado");
includes(app, "reason.className = \"import-ignored-reason-strip\"", "galeria deve exibir motivo do ignorado abaixo do card");
includes(app, "Ignorado manualmente na revis", "ignorar manualmente deve gravar motivo persistente");
includes(app, "status !== statuses.CONFIRMED && status !== statuses.SAVED && status !== statuses.IGNORED", "fila principal nao deve exibir confirmados, salvos ou ignorados");
includes(app, "function getImportProgramsByReviewFilter", "todos os filtros devem alimentar a mesma galeria");
includes(app, "filter === filters.VALIDATED", "filtro Validados deve montar programas filtrados");
includes(app, "filter === filters.IGNORED", "filtro Ignorados deve montar programas filtrados");
includes(app, "function canEditImportedTrechoStatus(reviewStatus)", "servico importado resolvido deve controlar exibicao do botao editar");
includes(app, "reviewStatus !== statuses.CONFIRMED\n      && reviewStatus !== statuses.IGNORED", "servico validado ou ignorado nao deve exibir botao editar no inspector");
includes(app, "if (reviewStatus === statuses.IGNORED || reviewStatus === statuses.CONFIRMED)", "validado e ignorado devem expor apenas Revisar no inspector");
excludes(app, "state.importReviewFilter = importReviewFilters().PENDING;", "Revisar nao deve navegar automaticamente para outro filtro");
includes(app, "if (status === statuses.IGNORED) return { label: \"Ignorado\", tone: \"danger\" };", "badge do trecho ignorado deve usar vermelho");
includes(app, "const visiblePrograms = getImportProgramsByReviewFilter(importedPrograms, activeFilter)", "workbench deve receber uma unica fonte filtrada");
excludes(app, "mode.className = \"import-mode-chip\"", "galeria nao deve exibir chip de modo operacional");
includes(css, ".import-filter-count", "contador pequeno deve existir dentro do filtro");
includes(css, ".import-filter.is-active", "filtro ativo deve ter estado visual claro");
includes(css, ".import-service-row.is-confirmed,", "servico validado deve ter estado visual proprio na galeria");
includes(css, ".import-service-row.is-ignored", "servico ignorado deve ter estado visual proprio na galeria");
const importValidatedFilterRule = extractCssRule(css, ".import-filter[data-import-filter=\"validated\"] {");
includes(importValidatedFilterRule, "var(--success)", "filtro Validados deve usar verde");
const importPendingFilterRule = extractCssRule(css, ".import-filter[data-import-filter=\"pending\"].is-active {");
includes(importPendingFilterRule, "var(--warning)", "filtro Pendentes deve usar amarelo");
const importIgnoredFilterRule = extractCssRule(css, ".import-filter[data-import-filter=\"ignored\"] {");
includes(importIgnoredFilterRule, "var(--danger)", "filtro Ignorados deve usar vermelho");
const importPendingRowRule = extractCssRule(css, ".import-service-row.is-pending {");
includes(importPendingRowRule, "var(--warning)", "servico pendente deve usar amarelo");
const importIgnoredRowRule = extractCssRule(css, ".import-service-row.is-ignored {");
includes(importIgnoredRowRule, "var(--danger)", "servico ignorado deve usar vermelho");
const importIgnoredReasonStripRule = extractCssRule(css, ".import-ignored-reason-strip {");
includes(importIgnoredReasonStripRule, "grid-template-columns: auto minmax(0, 1fr);", "motivo do ignorado na galeria deve ter label fixa e texto");
includes(importIgnoredReasonStripRule, "box-shadow: inset 3px 0 0 var(--danger);", "motivo do ignorado na galeria deve manter ancora visual vermelha");
const importIgnoredReasonNoticeRule = extractCssRule(css, ".import-ignored-reason-notice {");
includes(importIgnoredReasonNoticeRule, "position: sticky;", "motivo do ignorado no inspector deve ficar fixo durante scroll");
includes(importIgnoredReasonNoticeRule, "top: 0;", "motivo do ignorado no inspector deve ficar ancorado no topo");
const importSelectedRowRule = extractCssRule(css, ".import-service-row.is-selected {");
includes(importSelectedRowRule, "scale(1.012)", "servico selecionado deve crescer sutilmente");
includes(importSelectedRowRule, "border-width: 2px;", "servico selecionado deve reforcar borda sem usar azul");
includes(importSelectedRowRule, "0 10px 22px", "servico selecionado deve usar sombra mais forte");
excludes(importSelectedRowRule, "var(--accent)", "servico selecionado nao deve ficar azul");
excludes(importSelectedRowRule, "background:", "servico selecionado nao deve trocar a cor de fundo do status");
const importTrechoDangerRule = extractCssRule(css, ".import-trecho:has(.import-badge.danger) {");
includes(importTrechoDangerRule, "border-left-color: var(--danger);", "formulario ignorado deve manter apenas borda vermelha");
excludes(importTrechoDangerRule, "background:", "formulario ignorado nao deve mudar cor de fundo");
excludes(css, ".import-mode-chip", "CSS do chip de modo operacional da galeria deve ser removido");
includes(app, "function canShowImportedSplitAction", "Split deve ter regra unica de exibicao no inspector");
includes(app, "reviewStatus === statuses.PENDING", "Split deve depender do status pendente normalizado");
includes(app, "currentDecision !== decisions.SPLIT", "Split deve ser escondido quando ja estiver separado");
includes(app, "trecho?.operationalMode !== modes.MULTI_PICKUP", "Split nao deve aparecer em multi-coleta");
includes(app, "trecho?.operationalMode !== modes.INDEPENDENT_SERVICES", "Split nao deve aparecer em servicos independentes");
includes(app, "if (normalizeImportedReviewStatus(trecho) !== importReviewStatuses().PENDING)", "handler de Split deve bloquear servico validado ou ignorado");
includes(app, "permitido enquanto o serviço está pendente.", "toast deve explicar bloqueio de Split fora de pendente");
excludes(app, "function buildImportTimeline", "formulario importado nao deve renderizar bloco Janela da PG");
excludes(app, "Janela da PG", "formulario importado nao deve exibir Janela da PG");
excludes(css, ".import-timeline", "CSS do bloco Janela da PG deve sair do importador");
includes(app, "trajetoCidades", "revisao importada deve permitir revisar trajeto por cidades");
includes(app, "dataset.importInputType = type", "campos importados devem expor tipo para largura responsiva");
includes(app, "dataset.importInputType = \"textarea\"", "textareas importados devem ter tipo proprio no layout");
includes(app, "textarea.placeholder = \"Ex.: preferir veículo com água, sem paradas, rota direta.\"", "observacao importada deve usar placeholder do formulario comum");
excludes(app, "textarea.maxLength = 500;", "textareas importados nao devem limitar caracteres");
excludes(html, 'maxlength="500"', "observacoes do formulario nao devem limitar caracteres");
const importHotGridRule = extractCssRule(css, "\n.import-hot-grid {");
includes(importHotGridRule, "display: flex;", "grade do formulario importado deve usar largura dinamica");
includes(importHotGridRule, "flex-wrap: wrap;", "grade do formulario importado deve quebrar sem empilhar desnecessariamente");
includes(importHotGridRule, "align-items: stretch;", "grade do formulario importado deve alinhar campos");
const importDateTimeFieldRule = extractCssRule(css, ".import-field[data-import-input-type=\"datetime-local\"] {");
includes(importDateTimeFieldRule, "var(--datetime-field-width)", "DateTime importado deve usar largura especifica do formulario principal");
includes(importDateTimeFieldRule, "flex: 1 1 min(100%, var(--datetime-field-width));", "DateTime importado deve crescer quando sobrar espaco na linha");
includes(importDateTimeFieldRule, "width: auto;", "DateTime importado nao deve travar largura fixa");
const importDateFieldRule = extractCssRule(css, ".import-field[data-import-input-type=\"date\"] {");
includes(importDateFieldRule, "var(--date-field-width)", "Date importado deve usar largura especifica do formulario principal");
includes(importDateFieldRule, "flex: 1 1 min(100%, var(--date-field-width));", "Date importado deve crescer quando sobrar espaco na linha");
const importPassengerExistingDotRule = extractCssRule(css, ".import-passenger-row.is-use-existing .import-passenger-status-dot {");
includes(importPassengerExistingDotRule, "var(--success)", "bolinha de passageiro existente deve ser verde");
const importPassengerRowRule = extractCssRule(css, ".import-passenger-row.passenger-row {");
includes(importPassengerRowRule, "--import-passenger-row-inset: 7px;", "row importado deve usar inset comum nos marcadores");
includes(importPassengerRowRule, "grid-template-columns: minmax(0, 1fr) auto;", "row importado deve reservar coluna para botao remover");
const importPassengerLabelRule = extractCssRule(css, ".import-passenger-row.passenger-row .row-label {");
includes(importPassengerLabelRule, "grid-column: 1;", "label do passageiro deve ficar na primeira coluna para o remover nao cair abaixo");
const importPassengerDecisionRule = extractCssRule(css, ".import-passenger-decision {");
includes(importPassengerDecisionRule, "grid-column: 2;", "acoes compactas devem ficar na coluna lateral");
includes(importPassengerDecisionRule, "grid-row: 1;", "acoes compactas devem ficar na mesma linha do passageiro");
includes(importPassengerDecisionRule, "padding-top: 0;", "acoes compactas nao devem empurrar o row para baixo");
const importPassengerStatusDotRule = extractCssRule(css, ".import-passenger-status-dot {");
includes(importPassengerStatusDotRule, "right: var(--import-passenger-row-inset);", "bolinha de status deve usar o mesmo inset lateral do indice");
const importPassengerNewDotRule = extractCssRule(css, ".import-passenger-row.is-create-new .import-passenger-status-dot {");
includes(importPassengerNewDotRule, "var(--accent)", "bolinha de passageiro novo deve ter cor diferente do existente");
const importPassengerAmbiguousDotRule = extractCssRule(css, ".import-passenger-row.is-ambiguous .import-passenger-status-dot {");
includes(importPassengerAmbiguousDotRule, "var(--warning)", "bolinha de passageiro a decidir deve ser aviso");
const importPassengerRowBeforeRule = extractCssRule(css, ".import-passenger-row.import-passenger::before {");
includes(importPassengerRowBeforeRule, "content: none !important;", "passageiro importado nao deve exibir selo textual sobre a linha");
excludes(css, "content: \"Confirmado\";", "passageiro importado nao deve ter selo Confirmado em CSS");
includes(app, "function createImportPassengerDraft", "rascunho de passageiro extra na edicao do servico importado");
includes(app, "add-import-passenger", "inspector lateral deve permitir adicionar passageiro na edicao do servico importado");
const addImportPassengerHandlerStart = app.indexOf("if (action.dataset.importAction === \"add-import-passenger\")");
const addImportSolicitanteHandlerStart = app.indexOf("if (action.dataset.importAction === \"add-import-solicitante\")", addImportPassengerHandlerStart);
assert.ok(addImportPassengerHandlerStart >= 0 && addImportSolicitanteHandlerStart > addImportPassengerHandlerStart, "Handler de adicionar passageiro importado nao encontrado");
const addImportPassengerHandler = app.slice(addImportPassengerHandlerStart, addImportSolicitanteHandlerStart);
includes(addImportPassengerHandler, "trecho.passengerPickerOpen = true;", "clique em adicionar passageiro deve abrir seletor inline");
excludes(addImportPassengerHandler, "openImportedPassengerEdit", "clique em adicionar passageiro nao deve abrir popup");
const createNewPassengerHandlerStart = app.indexOf("if (action.dataset.importAction === \"create-new-passenger\")");
const editGuardAfterCreateNewStart = app.indexOf("if (!isImportedTrechoEditing", createNewPassengerHandlerStart);
assert.ok(createNewPassengerHandlerStart >= 0 && editGuardAfterCreateNewStart > createNewPassengerHandlerStart, "Handler de passageiro novo importado nao encontrado");
const createNewPassengerHandler = app.slice(createNewPassengerHandlerStart, editGuardAfterCreateNewStart);
excludes(createNewPassengerHandler, "openImportedPassengerEdit", "clicar em Novo na comparacao nao deve abrir popup de edicao");
includes(app, "function openImportedPassengerEdit", "clicar em passageiro importado deve abrir tela de edicao propria");
includes(app, "function getImportedPassengerEditFields", "passageiro importado deve usar schema de campos no popup de passageiro");
const importedPassengerEditFields = extractFunction(app, "getImportedPassengerEditFields");
excludes(importedPassengerEditFields, 'key: "origem"', "popup de passageiro importado nao deve cadastrar origem no passageiro");
excludes(importedPassengerEditFields, 'key: "destino"', "popup de passageiro importado nao deve cadastrar destino no passageiro");
const importedPassengerPreviewFields = extractFunction(app, "importedPassengerPreviewRecord");
excludes(importedPassengerPreviewFields, "origem:", "hover do passageiro importado nao deve tratar origem como dado cadastral");
excludes(importedPassengerPreviewFields, "destino:", "hover do passageiro importado nao deve tratar destino como dado cadastral");
includes(importedPassengerPreviewFields, "cr: \"\",", "hover do passageiro importado nao deve exibir CR como dado do passageiro");
const importedCrResolver = extractFunction(app, "importedTrechoCr");
includes(importedCrResolver, "String(trecho.programacao || \"\").trim()", "CR da reserva importada deve ser a PG");
includes(app, "[f.cr]: importedTrechoCr(trecho)", "reserva importada deve gravar PG no campo CR");
const importedInternalObsResolver = extractFunction(app, "importedDefaultInternalObservation");
includes(importedInternalObsResolver, "return String(trecho.programacao || \"\").trim();", "observacao interna padrao importada deve ser apenas a PG");
excludes(importedInternalObsResolver, "Importado via XLSX", "observacao interna importada nao deve salvar texto explicativo");
excludes(importedInternalObsResolver, "solicitacoes", "observacao interna importada nao deve salvar ST");
const importPassengerDraftFields = extractFunction(app, "createImportPassengerDraft");
excludes(importPassengerDraftFields, "origem:", "rascunho manual de passageiro importado nao deve herdar origem do servico");
excludes(importPassengerDraftFields, "destino:", "rascunho manual de passageiro importado nao deve carregar destino proprio");
includes(app, "renderImportedPassengerEditFields(passenger)", "passageiro importado deve renderizar no popup passenger-edit");
includes(app, "function saveImportedPassengerEditField", "popup deve salvar alteracoes locais do passageiro importado");
includes(app, "activeImportedPassengerEditRef", "popup deve guardar o passageiro importado ativo");
includes(app, "[\"nome\", \"telefone\", \"email\"].includes(passengerField)", "edicao local deve atualizar apenas dados cadastrais do novo passageiro");
const importedObservationStateFn = extractFunction(app, "ensureImportedObservationState");
includes(importedObservationStateFn, "motorista: existing.motorista ?? trecho?.observacaoOperacional ?? importedMotoristaObservationFromXlsx(trecho)", "OBS Mot importada deve manter edicao local e usar XLSX apenas como valor inicial");
const importedObservationSyncFn = extractFunction(app, "syncImportedObservationFields");
includes(importedObservationSyncFn, "trecho.observacaoOperacional = obs.motorista || \"\";", "OBS Mot editada no import deve persistir no trecho");
excludes(app, "activeObsType === \"motorista\"", "OBS Mot importada nao deve ficar travada por tipo ativo");
excludes(app, "if (current === \"motorista\") {", "digitacao em OBS Mot importada nao deve ser descartada");
excludes(app, "function buildImportPassengerDraftEditor", "importacao nao deve abrir editor inline de passageiro");
excludes(css, ".import-passenger-draft-editor", "CSS do editor inline de passageiro importado deve sair");
excludes(css, ".import-passenger-row.is-draft-editing", "linha do passageiro importado nao deve virar formulario inline");
includes(app, "import-add-inline-button", "botao inline deve atender a adicao de passageiro, nao de servico");
excludes(app, "PG já existe no Dataverse. Este item não pode ser editado", "bloqueio nao pode ser explicado so pela PG");
includes(app, "Serviço repetido provável", "servico repetido deve ser explicado por similaridade operacional");
includes(app, "Possível duplicidade", "servico parecido deve avisar antes de salvar");
excludes(app, "Serviço repetido não abre no formulário. Edite o registro original no Dataverse.", "servico importado nao deve ter caminho de abertura no formulario comum");
includes(app, "Não edite este serviço", "copy forte para bloqueio de servico repetido");
excludes(app, "Criar novo trecho mesmo assim?", "sem brecha de confirmacao para criar duplicado");
includes(app, "bindLookup(payload, CONFIG.nav.cliente, CONFIG.entitySets.cliente, context.importClient.id)", "reserva importada vinculada ao cliente Embraer");
includes(app, "bindLookup(payload, CONFIG.nav.solicitante, CONFIG.entitySets.passageiro, context.solicitanteRecord?.id", "reserva importada vinculada ao solicitante automatico");
excludes(app, "importReviewOverlay: $(\"importReviewOverlay\")", "binding antigo do overlay de importacao");
includes(app, "passageiros: Array.isArray(parsed?.passageiros)", "mock db local deve persistir passageiros");
includes(app, "function persistMockPassengerRecord", "helper de persistencia local de passageiro");
includes(app, "const storedPassengers = getMockDb().passageiros", "mock deve recarregar passageiros salvos localmente");
includes(app, "persistMockPassengerRecord(newPassenger)", "cadastro manual deve salvar passageiro no banco local");
includes(app, "persistMockPassengerRecord(updatedPassenger)", "hot edit local deve salvar alteracoes do passageiro");
includes(app, "persistMockPassengerRecord(record)", "importacao deve salvar solicitante/passageiro no banco local");
excludes(app, "function openPassengerRecord", "passageiro deve abrir hot edit direto sem fallback morto para form nativo");
includes(app, "log: \"new_appmotoristaslog\"", "formulario deve usar tabela unificada de LOG do Dataverse");
includes(app, "function installAppErrorLogging", "formulario deve instalar captura global de erro");
includes(app, "logger.installErrorLogger({", "captura global (window.error/unhandledrejection) deve vir do error-logger compartilhado");
includes(app, "appName: APP_ERROR_LOG_APP_NAME", "logger deve manter o appName da tela");
includes(app, "const APP_ERROR_LOG_APP_NAME = \"Tela Formulario Geral\"", "appName dos logs nao pode mudar");
includes(app, "getScreen: () => state.currentTab", "logger deve registrar a aba atual em new_screen");
excludes(app, "window.addEventListener(\"unhandledrejection\"", "nao duplicar listener global que o pacote ja instala");
includes(app, "console.error = (...args)", "erros capturados em catch via console.error devem virar log Dataverse");
includes(app, "if (type === \"error\")", "toast de erro deve virar registro de log");
includes(app, "migrateLegacyErrorLogQueue()", "fila local antiga deve passar para a fila do pacote");

const passengerTextareaRule = extractCssRule(css, ".passenger-edit-field textarea.passenger-edit-control {");
includes(passengerTextareaRule, "resize: vertical;", "textarea de passageiro readonly deve permitir ajuste de tamanho");
includes(passengerTextareaRule, "max-height: none;", "textarea de passageiro nao deve limitar resize vertical");
excludes(passengerTextareaRule, "resize: none;", "textarea de passageiro nao pode bloquear resize");

const importCopyPointerRule = extractCssRule(css, ".import-trecho.is-locked [data-import-copy] input[readonly]");
excludes(importCopyPointerRule, "textarea[readonly]", "textarea importado bloqueado deve manter pointer events para resize");

console.log("formulario_operational_features: ok");

/**
 * Cole no console do Model-driven App, dentro do ambiente alvo (DEV primeiro).
 *
 * Alvo:
 * - tabela nova: new_inscricaopushmotorista (uma linha por aparelho inscrito no Web Push do PWA)
 * - lookup: motorista (cr40f_funcionarios)
 *
 * Faz:
 * - cria a tabela, as colunas e o lookup que faltarem (idempotente);
 * - publica as personalizações;
 * - imprime o entity set real (deve ser new_inscricaopushmotoristas, usado em DATAVERSE.inscricoesPush).
 *
 * Permissões dos papéis (motorista cria/lê/exclui só as próprias linhas; o plugin lê tudo) ficam na fatia do emissor.
 * Plano: docs/plano-web-push-pwa.md
 */
(async () => {
  const TABLE = {
    logicalName: "new_inscricaopushmotorista",
    schemaName: "new_InscricaoPushMotorista",
    displayName: "Inscrição de push do motorista",
    displayCollectionName: "Inscrições de push dos motoristas"
  };

  const COLUMNS = [
    { schemaName: "new_Endpoint", label: "Endpoint do push", maxLength: 2000 },
    { schemaName: "new_ChaveP256dh", label: "Chave p256dh", maxLength: 200 },
    { schemaName: "new_ChaveAuth", label: "Chave auth", maxLength: 100 },
    { schemaName: "new_Aparelho", label: "Aparelho (user agent)", maxLength: 200 }
  ];

  const LOOKUPS = [
    { schemaName: "new_Funcionario", label: "Motorista", referencedEntity: "cr40f_funcionarios", relationship: "cr40f_funcionarios_new_inscricaopushmotorista" }
  ];

  const pickXrm = () => {
    try {
      if (window.Xrm?.Utility?.getGlobalContext) return window.Xrm;
      if (window.parent?.Xrm?.Utility?.getGlobalContext) return window.parent.Xrm;
    } catch {
      return window.Xrm ?? null;
    }
    return null;
  };

  const xrm = pickXrm();
  if (!xrm) throw new Error("Xrm nao encontrado. Cole este script dentro do Model-driven App/Power Apps.");

  const clientUrl = xrm.Utility.getGlobalContext().getClientUrl().replace(/\/$/, "");
  const apiUrl = `${clientUrl}/api/data/v9.2`;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0"
  };

  async function request(path, options = {}) {
    const response = await fetch(`${apiUrl}/${path}`, { credentials: "same-origin", headers, ...options });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = data?.error?.message || text || response.statusText;
      const error = new Error(`${response.status} ${response.statusText}: ${message}`);
      error.response = data;
      throw error;
    }
    return data;
  }

  function label(value) {
    return {
      LocalizedLabels: [{ Label: value, LanguageCode: 1046 }],
      UserLocalizedLabel: { Label: value, LanguageCode: 1046 }
    };
  }

  const requiredNone = {
    Value: "None",
    CanBeChanged: true,
    ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings"
  };

  async function exists(path) {
    try {
      await request(path);
      return true;
    } catch (error) {
      if (String(error.message).startsWith("404 ")) return false;
      throw error;
    }
  }

  const tableExists = () => exists(`EntityDefinitions(LogicalName='${TABLE.logicalName}')?$select=LogicalName`);
  const columnExists = (logicalName) =>
    exists(`EntityDefinitions(LogicalName='${TABLE.logicalName}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`);

  const buildColumn = (column) => ({
    "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
    SchemaName: column.schemaName,
    DisplayName: label(column.label),
    Description: label(column.label),
    RequiredLevel: requiredNone,
    FormatName: { Value: "Text" },
    MaxLength: column.maxLength
  });

  async function createTable() {
    await request("EntityDefinitions", {
      method: "POST",
      body: JSON.stringify({
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        SchemaName: TABLE.schemaName,
        DisplayName: label(TABLE.displayName),
        DisplayCollectionName: label(TABLE.displayCollectionName),
        Description: label("Aparelhos inscritos no Web Push do PWA do App Motoristas."),
        OwnershipType: "UserOwned",
        IsActivity: false,
        HasActivities: false,
        HasNotes: false,
        Attributes: [{
          "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
          AttributeType: "String",
          AttributeTypeName: { Value: "StringType" },
          SchemaName: "new_name",
          DisplayName: label("Inscrição"),
          Description: label("Identificação da inscrição"),
          IsPrimaryName: true,
          RequiredLevel: { ...requiredNone, Value: "ApplicationRequired" },
          FormatName: { Value: "Text" },
          MaxLength: 160
        }]
      })
    });
  }

  const createColumn = (column) =>
    request(`EntityDefinitions(LogicalName='${TABLE.logicalName}')/Attributes`, { method: "POST", body: JSON.stringify(buildColumn(column)) });

  const createLookup = (lookup) =>
    request("RelationshipDefinitions", {
      method: "POST",
      body: JSON.stringify({
        "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        SchemaName: lookup.relationship,
        ReferencedEntity: lookup.referencedEntity,
        ReferencingEntity: TABLE.logicalName,
        CascadeConfiguration: {
          Assign: "NoCascade", Delete: "Cascade", Merge: "NoCascade",
          Reparent: "NoCascade", Share: "NoCascade", Unshare: "NoCascade"
        },
        Lookup: {
          "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
          SchemaName: lookup.schemaName,
          DisplayName: label(lookup.label),
          Description: label(lookup.label),
          RequiredLevel: requiredNone
        }
      })
    });

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const summary = { table: TABLE.logicalName, createdTable: false, created: [], existing: [] };

  if (!(await tableExists())) {
    console.log("[InscricaoPush] criando tabela", TABLE.logicalName);
    await createTable();
    summary.createdTable = true;
    await sleep(8000);
  }

  const items = [
    ...COLUMNS.map((item) => ({ item, create: createColumn })),
    ...LOOKUPS.map((item) => ({ item, create: createLookup }))
  ];
  for (const { item, create } of items) {
    const name = item.schemaName.toLowerCase();
    if (await columnExists(name)) {
      summary.existing.push(name);
      continue;
    }
    await create(item);
    summary.created.push(name);
    await sleep(1200);
  }

  console.log("[InscricaoPush] publicando personalizacoes");
  await request("PublishAllXml", { method: "POST", body: "{}" });
  await sleep(10000);

  const entitySet = await request(`EntityDefinitions(LogicalName='${TABLE.logicalName}')?$select=EntitySetName`);
  summary.entitySetName = entitySet?.EntitySetName ?? "";
  console.table(summary.created.map((name) => ({ coluna: name, criadaAgora: true })));
  console.log("[InscricaoPush] pronto", summary);
  return summary;
})();

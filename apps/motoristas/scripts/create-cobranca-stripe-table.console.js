/**
 * Cole no console do Model-driven App, dentro do ambiente alvo (DEV primeiro).
 *
 * Alvo:
 * - tabela nova: cr40f_cobrancastripe (uma linha por tentativa de cobrança por QR code)
 * - lookups: reserva (cr40f_reservadeveculos) e motorista (cr40f_funcionarios)
 *
 * Faz:
 * - cria a tabela, as colunas e os lookups que faltarem (idempotente);
 * - publica as personalizações;
 * - lista o que foi criado e o que já existia.
 *
 * Contrato usado pelos Flows: docs/superpowers/specs/2026-10-21-cobranca-stripe-qr-design.md
 */
(async () => {
  const TABLE = {
    logicalName: "cr40f_cobrancastripe",
    schemaName: "cr40f_CobrancaStripe",
    displayName: "Cobrança Stripe",
    displayCollectionName: "Cobranças Stripe"
  };

  const COLUMNS = [
    { type: "string", schemaName: "cr40f_SessionId", label: "Sessão Stripe", maxLength: 255 },
    { type: "string", schemaName: "cr40f_Status", label: "Status (aguardando, pago, expirado, cancelado)", maxLength: 20 },
    { type: "decimal", schemaName: "cr40f_Valor", label: "Valor cobrado (R$)", precision: 2 },
    { type: "string", schemaName: "cr40f_PaganteNome", label: "Quem pagou", maxLength: 200 },
    { type: "string", schemaName: "cr40f_PaganteEmail", label: "E-mail para o recibo", maxLength: 320 },
    { type: "string", schemaName: "cr40f_Idioma", label: "Idioma do passageiro (pt-BR, en-US, es-ES)", maxLength: 5 },
    { type: "string", schemaName: "cr40f_PaymentIntentId", label: "PaymentIntent Stripe", maxLength: 255 },
    { type: "decimal", schemaName: "cr40f_Tarifa", label: "Tarifa Stripe", precision: 2 },
    { type: "decimal", schemaName: "cr40f_ValorLiquido", label: "Valor líquido", precision: 2 },
    { type: "string", schemaName: "cr40f_PaisCartao", label: "País do cartão", maxLength: 2 },
    { type: "string", schemaName: "cr40f_Bandeira", label: "Bandeira do cartão", maxLength: 30 },
    { type: "string", schemaName: "cr40f_Carteira", label: "Carteira digital", maxLength: 30 },
    { type: "datetime", schemaName: "cr40f_ExpiraEm", label: "Expira em" },
    { type: "datetime", schemaName: "cr40f_PagoEm", label: "Pago em" }
  ];

  const LOOKUPS = [
    { schemaName: "cr40f_Reserva", label: "Reserva", referencedEntity: "cr40f_reservadeveculos", relationship: "cr40f_reservadeveculos_cobrancastripe" },
    { schemaName: "cr40f_Motorista", label: "Motorista", referencedEntity: "cr40f_funcionarios", relationship: "cr40f_funcionarios_cobrancastripe" }
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

  function buildColumn(column) {
    const common = { SchemaName: column.schemaName, DisplayName: label(column.label), Description: label(column.label), RequiredLevel: requiredNone };
    if (column.type === "datetime") {
      return { "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", ...common, Format: "DateAndTime", DateTimeBehavior: { Value: "UserLocal" } };
    }
    if (column.type === "decimal") {
      return { "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata", ...common, Precision: column.precision, MinValue: 0, MaxValue: 100000000 };
    }
    return { "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", ...common, FormatName: { Value: "Text" }, MaxLength: column.maxLength };
  }

  async function createTable() {
    await request("EntityDefinitions", {
      method: "POST",
      body: JSON.stringify({
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        SchemaName: TABLE.schemaName,
        DisplayName: label(TABLE.displayName),
        DisplayCollectionName: label(TABLE.displayCollectionName),
        Description: label("Cobranças por QR code (Stripe Checkout) geradas pelo App Motoristas."),
        OwnershipType: "UserOwned",
        IsActivity: false,
        HasActivities: false,
        HasNotes: false,
        Attributes: [{
          "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
          AttributeType: "String",
          AttributeTypeName: { Value: "StringType" },
          SchemaName: "cr40f_name",
          DisplayName: label("Cobrança"),
          Description: label("Reserva da cobrança"),
          IsPrimaryName: true,
          RequiredLevel: { ...requiredNone, Value: "ApplicationRequired" },
          FormatName: { Value: "Text" },
          MaxLength: 160
        }]
      })
    });
  }

  async function createColumn(column) {
    await request(`EntityDefinitions(LogicalName='${TABLE.logicalName}')/Attributes`, {
      method: "POST",
      body: JSON.stringify(buildColumn(column))
    });
  }

  async function createLookup(lookup) {
    await request("RelationshipDefinitions", {
      method: "POST",
      body: JSON.stringify({
        "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        SchemaName: lookup.relationship,
        ReferencedEntity: lookup.referencedEntity,
        ReferencingEntity: TABLE.logicalName,
        CascadeConfiguration: {
          Assign: "NoCascade", Delete: "RemoveLink", Merge: "NoCascade",
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
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const summary = { table: TABLE.logicalName, createdTable: false, created: [], existing: [] };

  if (!(await tableExists())) {
    console.log("[CobrancaStripe] criando tabela", TABLE.logicalName);
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

  console.log("[CobrancaStripe] publicando personalizacoes");
  await request("PublishAllXml", { method: "POST", body: "{}" });
  await sleep(10000);

  const entitySet = await request(`EntityDefinitions(LogicalName='${TABLE.logicalName}')?$select=EntitySetName`);
  summary.entitySetName = entitySet?.EntitySetName ?? "";
  console.table(summary.created.map((name) => ({ coluna: name, criadaAgora: true })));
  console.log("[CobrancaStripe] pronto", summary);
  return summary;
})();

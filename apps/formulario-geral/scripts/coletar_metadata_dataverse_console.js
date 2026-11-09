/*
Cole no console do Model-driven App.
Ele baixa um JSON com tabelas, campos, lookups e choices da solucao.
Troque SOLUTION_UNIQUE_NAME se a solucao alvo nao for AppBetinhos.
*/
(async () => {
  const SOLUTION_UNIQUE_NAME = "AppBetinhos";
  const X = window.parent?.Xrm || window.Xrm;
  if (!X?.Utility) throw new Error("Xrm nao encontrado. Rode dentro do Model-driven App.");

  const clientUrl = X.Utility.getGlobalContext().getClientUrl();
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0"
  };

  async function api(path) {
    const res = await fetch(`${clientUrl}/api/data/v9.2/${path}`, { headers });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
    return res.json();
  }

  async function apiAll(path) {
    const rows = [];
    let url = `${clientUrl}/api/data/v9.2/${path}`;
    while (url) {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
      const data = await res.json();
      rows.push(...(data.value || []));
      url = data["@odata.nextLink"] || "";
    }
    return rows;
  }

  function label(localizedLabel) {
    return localizedLabel?.UserLocalizedLabel?.Label || "";
  }

  function optionLabel(option) {
    return option?.Label?.UserLocalizedLabel?.Label || "";
  }

  function metadataKey(id) {
    return String(id || "").toLowerCase();
  }

  const solutionResult = await api(`solutions?$select=solutionid,uniquename,friendlyname,version&$filter=uniquename eq '${SOLUTION_UNIQUE_NAME}'`);
  const solution = solutionResult.value?.[0];
  if (!solution) throw new Error(`Solucao nao encontrada: ${SOLUTION_UNIQUE_NAME}`);

  let publisher = null;
  try {
    const solutionDetails = await api(`solutions(${solution.solutionid})?$select=_publisherid_value`);
    const publisherId = solutionDetails?._publisherid_value;
    if (publisherId) {
      publisher = await api(`publishers(${publisherId})?$select=publisherid,uniquename,friendlyname,customizationprefix`);
    }
  } catch (error) {
    publisher = { error: error.message };
  }

  const components = await apiAll(
    `solutioncomponents?$select=componenttype,objectid&$filter=_solutionid_value eq ${solution.solutionid} and (componenttype eq 1 or componenttype eq 9)`
  );

  const entityComponentIds = components.filter((c) => c.componenttype === 1).map((c) => c.objectid);
  const optionSetComponentIds = components.filter((c) => c.componenttype === 9).map((c) => c.objectid);

  const tables = [];
  for (const metadataId of entityComponentIds) {
    const table = await api(
      `EntityDefinitions(${metadataId})?$select=MetadataId,LogicalName,SchemaName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,DisplayName`
    );
    const attributes = await apiAll(
      `EntityDefinitions(${metadataId})/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,DisplayName,RequiredLevel,IsValidForRead,IsValidForCreate,IsValidForUpdate`
    );
    const lookupAttributes = await apiAll(
      `EntityDefinitions(${metadataId})/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=MetadataId,Targets`
    );
    const lookupTargetsById = new Map(
      lookupAttributes.map((a) => [metadataKey(a.MetadataId), a.Targets || []])
    );
    const manyToOne = await apiAll(
      `EntityDefinitions(${metadataId})/ManyToOneRelationships?$select=SchemaName,ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity,ReferencedEntityNavigationPropertyName`
    );
    tables.push({
      logicalName: table.LogicalName,
      schemaName: table.SchemaName,
      entitySetName: table.EntitySetName,
      metadataId: table.MetadataId,
      label: label(table.DisplayName),
      primaryIdAttribute: table.PrimaryIdAttribute,
      primaryNameAttribute: table.PrimaryNameAttribute,
      attributes: attributes.map((a) => ({
        logicalName: a.LogicalName,
        schemaName: a.SchemaName,
        label: label(a.DisplayName),
        type: a.AttributeType,
        requiredLevel: a.RequiredLevel?.Value,
        targets: lookupTargetsById.get(metadataKey(a.MetadataId)) || [],
        validForRead: a.IsValidForRead,
        validForCreate: a.IsValidForCreate,
        validForUpdate: a.IsValidForUpdate
      })),
      manyToOne: manyToOne.map((r) => ({
        schemaName: r.SchemaName,
        referencingAttribute: r.ReferencingAttribute,
        bindName: r.ReferencingEntityNavigationPropertyName,
        referencedEntity: r.ReferencedEntity,
        referencedNavigation: r.ReferencedEntityNavigationPropertyName
      }))
    });
  }

  const globalOptionSets = [];
  for (const metadataId of optionSetComponentIds) {
    try {
      const optionSet = await api(`GlobalOptionSetDefinitions(${metadataId})`);
      globalOptionSets.push({
        name: optionSet.Name,
        displayName: label(optionSet.DisplayName),
        metadataId: optionSet.MetadataId,
        options: (optionSet.Options || []).map((o) => ({
          value: o.Value,
          label: optionLabel(o)
        }))
      });
    } catch (error) {
      globalOptionSets.push({ metadataId, error: error.message });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    orgUrl: clientUrl,
    solution: { ...solution, publisher },
    tables,
    globalOptionSets
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `metadata-${SOLUTION_UNIQUE_NAME}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  console.log("Metadata coletada:", output);
})();

using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>
    /// Carrega as âncoras (serviços "depois de / antes de") de uma troca no modo Entre serviços.
    /// A janela técnica é calculada só no registro/atualização pela API; alertas de âncora
    /// alterada são calculados na exibição (o guard não enxerga updates intermediários na pré-validação).
    /// </summary>
    internal sealed class ExchangeAnchorLoader
    {
        private readonly IOrganizationService _service;
        private readonly ITracingService _tracing;

        public ExchangeAnchorLoader(IOrganizationService service, ITracingService tracing)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _tracing = tracing;
        }

        public ExchangeWindowPolicy.Anchor LoadAnchor(EntityReference serviceReference)
        {
            if (serviceReference == null || serviceReference.Id == Guid.Empty) return null;
            if (serviceReference.LogicalName != PluginConfig.ServiceTable)
                throw new InvalidPluginExecutionException("[EXCHANGE_ANCHOR_INVALID] Serviço de referência inválido.");
            var row = _service.Retrieve(
                PluginConfig.ServiceTable,
                serviceReference.Id,
                new ColumnSet(PluginConfig.ServiceStartDate, PluginConfig.ServiceDriverLookup, PluginConfig.ServiceStatus, "statecode"));
            var departure = row.GetAttributeValue<DateTime?>(PluginConfig.ServiceStartDate);
            if (!departure.HasValue)
                throw new InvalidPluginExecutionException("[EXCHANGE_ANCHOR_INVALID] Serviço de referência sem data de saída.");
            var canceled = row.GetAttributeValue<OptionSetValue>(PluginConfig.ServiceStatus)?.Value == PluginConfig.ServiceStatusCanceled ||
                row.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1;
            return new ExchangeWindowPolicy.Anchor(
                row.Id,
                row.GetAttributeValue<EntityReference>(PluginConfig.ServiceDriverLookup)?.Id,
                DateTime.SpecifyKind(departure.Value, DateTimeKind.Utc),
                canceled);
        }

        public List<ExchangeWindowPolicy.DriverAnchors> BuildDriverAnchors(
            EntityReference driver1,
            EntityReference driver2,
            EntityReference driver1After,
            EntityReference driver1Before,
            EntityReference driver2After,
            EntityReference driver2Before)
        {
            var result = new List<ExchangeWindowPolicy.DriverAnchors>();
            if (driver1 != null) result.Add(new ExchangeWindowPolicy.DriverAnchors(driver1.Id, LoadAnchor(driver1After), LoadAnchor(driver1Before)));
            if (driver2 != null) result.Add(new ExchangeWindowPolicy.DriverAnchors(driver2.Id, LoadAnchor(driver2After), LoadAnchor(driver2Before)));
            return result;
        }
    }
}

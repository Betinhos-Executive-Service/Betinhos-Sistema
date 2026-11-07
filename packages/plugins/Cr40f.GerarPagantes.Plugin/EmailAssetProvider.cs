using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.GerarPagantes.Plugin;

public sealed class EmailAssetProvider
{
    private static readonly AssetDefinition[] Definitions =
    {
        new("header", "cabecalho.png", "image/png"),
        new("instructions-header", "instrucoes-cabecalho.jpg", "image/jpeg"),
        new("instructions", "instrucoes.jpg", "image/jpeg"),
        new("trip-feedback", "conte-como-foi-a-viagem.jpg", "image/jpeg"),
        new("finance-icon", "icone-financeiro.png", "image/png"),
        new("operations-icon", "icone-operacional.png", "image/png"),
        new("commercial-icon", "icone-comercial.png", "image/png")
    };

    private readonly IOrganizationService _service;
    private readonly string _prefix;

    public EmailAssetProvider(IOrganizationService service, string prefix)
    {
        _service = service;
        _prefix = prefix.EndsWith("/", StringComparison.Ordinal) ? prefix : prefix + "/";
    }

    public IReadOnlyCollection<InlineEmailAsset> Load()
    {
        var assets = new List<InlineEmailAsset>();
        foreach (var definition in Definitions)
        {
            var name = _prefix + definition.FileName;
            var rows = _service.RetrieveMultiple(new QueryExpression("webresource")
            {
                ColumnSet = new ColumnSet("name", "content", "webresourcetype"),
                TopCount = 2,
                Criteria = new FilterExpression(LogicalOperator.And)
                {
                    Conditions =
                    {
                        new ConditionExpression("name", ConditionOperator.Equal, name),
                        new ConditionExpression("componentstate", ConditionOperator.Equal, 0)
                    }
                }
            }).Entities;
            if (rows.Count != 1) throw new InvalidPluginExecutionException($"Web resource de e-mail ausente ou duplicado: {name}.");
            var content = rows[0].GetAttributeValue<string>("content");
            if (string.IsNullOrWhiteSpace(content)) throw new InvalidPluginExecutionException($"Web resource de e-mail sem conteúdo: {name}.");
            assets.Add(new InlineEmailAsset(definition.ContentId, definition.FileName, definition.ContentType, content));
        }
        return assets;
    }

    private sealed class AssetDefinition
    {
        public AssetDefinition(string contentId, string fileName, string contentType) { ContentId = contentId; FileName = fileName; ContentType = contentType; }
        public string ContentId { get; }
        public string FileName { get; }
        public string ContentType { get; }
    }
}

public sealed class InlineEmailAsset
{
    public InlineEmailAsset(string contentId, string fileName, string contentType, string contentBytes)
    {
        ContentId = contentId;
        FileName = fileName;
        ContentType = contentType;
        ContentBytes = contentBytes;
    }

    public string ContentId { get; }
    public string FileName { get; }
    public string ContentType { get; }
    public string ContentBytes { get; }
}

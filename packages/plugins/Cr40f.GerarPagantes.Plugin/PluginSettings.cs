using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.GerarPagantes.Plugin;

public sealed class PluginSettings
{
    public const string CieloClientIdVariable = "cr40f_GerarPagantesCieloClientId";
    public const string CieloClientSecretVariable = "cr40f_GerarPagantesCieloClientSecret";
    public const string GraphTenantIdVariable = "cr40f_GerarPagantesGraphTenantId";
    public const string GraphClientIdVariable = "cr40f_GerarPagantesGraphClientId";
    public const string GraphClientSecretVariable = "cr40f_GerarPagantesGraphClientSecret";
    public const string SenderEmailVariable = "cr40f_GerarPagantesSenderEmail";
    public const string ReplyToEmailVariable = "cr40f_GerarPagantesReplyToEmail";
    public const string InternalRecipientsVariable = "cr40f_GerarPagantesInternalRecipients";
    public const string EmailAssetPrefixVariable = "cr40f_GerarPagantesEmailAssetPrefix";

    public string CieloClientId { get; private set; } = string.Empty;
    public string CieloClientSecret { get; private set; } = string.Empty;
    public string GraphTenantId { get; private set; } = string.Empty;
    public string GraphClientId { get; private set; } = string.Empty;
    public string GraphClientSecret { get; private set; } = string.Empty;
    public string SenderEmail { get; private set; } = string.Empty;
    public string ReplyToEmail { get; private set; } = string.Empty;
    public List<string> InternalRecipients { get; private set; } = new();
    public string EmailAssetPrefix { get; private set; } = "cr40f_/GerarPagantes/email/";

    public static PluginSettings Load(IOrganizationService service)
    {
        var values = LoadTextValues(service, new[]
        {
            CieloClientIdVariable,
            CieloClientSecretVariable,
            GraphTenantIdVariable,
            GraphClientIdVariable,
            GraphClientSecretVariable,
            SenderEmailVariable,
            ReplyToEmailVariable,
            InternalRecipientsVariable,
            EmailAssetPrefixVariable
        });

        return new PluginSettings
        {
            CieloClientId = Get(values, CieloClientIdVariable),
            CieloClientSecret = Get(values, CieloClientSecretVariable),
            GraphTenantId = Get(values, GraphTenantIdVariable),
            GraphClientId = Get(values, GraphClientIdVariable),
            GraphClientSecret = Get(values, GraphClientSecretVariable),
            SenderEmail = Get(values, SenderEmailVariable),
            ReplyToEmail = Get(values, ReplyToEmailVariable),
            InternalRecipients = Get(values, InternalRecipientsVariable)
                .Split(new[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(value => value.Trim())
                .Where(IsEmail)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList(),
            EmailAssetPrefix = string.IsNullOrWhiteSpace(Get(values, EmailAssetPrefixVariable))
                ? "cr40f_/GerarPagantes/email/"
                : Get(values, EmailAssetPrefixVariable)
        };
    }

    public void ValidateFor(GerarPagantesRequest request, bool requiresCielo)
    {
        if (requiresCielo &&
            (string.IsNullOrWhiteSpace(CieloClientId) || string.IsNullOrWhiteSpace(CieloClientSecret)))
            throw new InvalidOperationException("Configuração Cielo ausente nas variáveis de ambiente da solução.");

        if (!request.Pagantes.Any(payer => payer.SendEmail)) return;
        if (new[] { GraphTenantId, GraphClientId, GraphClientSecret, SenderEmail }.Any(string.IsNullOrWhiteSpace))
            throw new InvalidOperationException("Configuração Microsoft Graph incompleta nas variáveis de ambiente da solução.");
        if (!IsEmail(SenderEmail) || !string.IsNullOrWhiteSpace(ReplyToEmail) && !IsEmail(ReplyToEmail))
            throw new InvalidOperationException("Configuração de remetente ou Reply-To inválida nas variáveis de ambiente da solução.");
    }

    private static Dictionary<string, string> LoadTextValues(IOrganizationService service, IReadOnlyCollection<string> schemaNames)
    {
        var definitionQuery = new QueryExpression("environmentvariabledefinition")
        {
            ColumnSet = new ColumnSet("schemaname", "defaultvalue")
        };
        definitionQuery.Criteria.AddCondition("schemaname", ConditionOperator.In, schemaNames.Cast<object>().ToArray());
        var definitions = service.RetrieveMultiple(definitionQuery).Entities;
        var valuesByDefinition = new Dictionary<Guid, string>();

        if (definitions.Count > 0)
        {
            var valueQuery = new QueryExpression("environmentvariablevalue")
            {
                ColumnSet = new ColumnSet("environmentvariabledefinitionid", "value")
            };
            valueQuery.Criteria.AddCondition("environmentvariabledefinitionid", ConditionOperator.In, definitions.Select(definition => (object)definition.Id).ToArray());
            foreach (var value in service.RetrieveMultiple(valueQuery).Entities)
            {
                var definition = value.GetAttributeValue<EntityReference>("environmentvariabledefinitionid");
                if (definition != null && !valuesByDefinition.ContainsKey(definition.Id))
                    valuesByDefinition[definition.Id] = value.GetAttributeValue<string>("value")?.Trim() ?? string.Empty;
            }
        }

        return definitions.ToDictionary(
            definition => definition.GetAttributeValue<string>("schemaname") ?? string.Empty,
            definition => valuesByDefinition.TryGetValue(definition.Id, out var value)
                ? value
                : definition.GetAttributeValue<string>("defaultvalue")?.Trim() ?? string.Empty,
            StringComparer.OrdinalIgnoreCase);
    }

    private static string Get(IReadOnlyDictionary<string, string> values, string schemaName) =>
        values.TryGetValue(schemaName, out var value) ? value.Trim() : string.Empty;

    private static bool IsEmail(string? value) => !string.IsNullOrWhiteSpace(value) &&
        System.Text.RegularExpressions.Regex.IsMatch(value!.Trim(), @"^\S+@\S+\.\S+$");
}

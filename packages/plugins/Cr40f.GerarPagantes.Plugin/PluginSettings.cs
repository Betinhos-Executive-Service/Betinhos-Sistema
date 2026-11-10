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

    // Segredos na tabela cr40f_segredo (coluna com segurança de campo). A tabela vence; vazia, ausente ou ilegível,
    // vale a variável de ambiente (legado, a esvaziar depois da migração). Nunca registra o valor em trace.
    public const string SecretTable = "cr40f_segredo";
    public const string SecretNameColumn = "cr40f_name";
    public const string SecretValueColumn = "cr40f_valor";
    public const string CieloClientSecretName = "cielo.client-secret";
    public const string GraphClientSecretName = "graph.gerar-pagantes.client-secret";

    public string CieloClientId { get; private set; } = string.Empty;
    public string CieloClientSecret { get; private set; } = string.Empty;
    public string GraphTenantId { get; private set; } = string.Empty;
    public string GraphClientId { get; private set; } = string.Empty;
    public string GraphClientSecret { get; private set; } = string.Empty;
    public string SenderEmail { get; private set; } = string.Empty;
    public string ReplyToEmail { get; private set; } = string.Empty;
    public List<string> InternalRecipients { get; private set; } = new();
    public string EmailAssetPrefix { get; private set; } = "cr40f_/GerarPagantes/email/";

    public static PluginSettings Load(IOrganizationService service, ITracingService? tracing = null)
    {
        var secrets = LoadSecrets(service, new[] { CieloClientSecretName, GraphClientSecretName }, tracing);
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
            CieloClientSecret = Get(secrets, CieloClientSecretName) is { Length: > 0 } cielo ? cielo : Get(values, CieloClientSecretVariable),
            GraphTenantId = Get(values, GraphTenantIdVariable),
            GraphClientId = Get(values, GraphClientIdVariable),
            GraphClientSecret = Get(secrets, GraphClientSecretName) is { Length: > 0 } graph ? graph : Get(values, GraphClientSecretVariable),
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
            throw new InvalidOperationException("Configuração Cielo ausente (tabela de segredos ou variáveis de ambiente da solução).");

        if (!request.Pagantes.Any(payer => payer.SendEmail)) return;
        if (new[] { GraphTenantId, GraphClientId, GraphClientSecret, SenderEmail }.Any(string.IsNullOrWhiteSpace))
            throw new InvalidOperationException("Configuração Microsoft Graph incompleta (tabela de segredos ou variáveis de ambiente da solução).");
        if (!IsEmail(SenderEmail) || !string.IsNullOrWhiteSpace(ReplyToEmail) && !IsEmail(ReplyToEmail))
            throw new InvalidOperationException("Configuração de remetente ou Reply-To inválida nas variáveis de ambiente da solução.");
    }

    // Lida com o serviço de SYSTEM (o usuário não tem privilégio na tabela nem no perfil de campo).
    private static Dictionary<string, string> LoadSecrets(IOrganizationService service, IReadOnlyCollection<string> names, ITracingService? tracing)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var query = new QueryExpression(SecretTable) { ColumnSet = new ColumnSet(SecretNameColumn, SecretValueColumn) };
            query.Criteria.AddCondition(SecretNameColumn, ConditionOperator.In, names.Cast<object>().ToArray());
            foreach (var row in service.RetrieveMultiple(query).Entities)
            {
                var name = row.GetAttributeValue<string>(SecretNameColumn);
                var value = row.GetAttributeValue<string>(SecretValueColumn)?.Trim();
                if (!string.IsNullOrEmpty(name) && !string.IsNullOrEmpty(value)) result[name!] = value!;
            }
        }
        catch (Exception error)
        {
            tracing?.Trace("cr40f_GerarPagantes: tabela de segredos ilegível ({0}), usando as variáveis de ambiente", error.GetType().Name);
            return result;
        }
        foreach (var name in names.Where(name => !result.ContainsKey(name)))
            tracing?.Trace("cr40f_GerarPagantes: segredo {0} sem valor na tabela, usando a variável de ambiente", name);
        return result;
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

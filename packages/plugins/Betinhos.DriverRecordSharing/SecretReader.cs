using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Ordem: tabela cr40f_segredo (coluna com segurança de campo, lida como SYSTEM) → configuração segura do step (legado)
    // → variável de ambiente (legado, a esvaziar depois da migração; tipo Secret ou String). Nunca registra o valor em trace.
    public static class SecretReader
    {
        public const string Table = "cr40f_segredo";
        public const string NameColumn = "cr40f_name";
        public const string ValueColumn = "cr40f_valor";

        // Variável de ambiente legada → nome do segredo na tabela.
        public static readonly IReadOnlyDictionary<string, string> SecretNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [FuelSchema.EnvApiKey] = "anthropic.combustivel",
            [OrganizeObservationPlugin.EnvApiKey] = "anthropic.observacao-motorista"
        };

        public static string Read(IOrganizationService system, string schemaName, ITracingService tracing = null, string secureConfig = null)
        {
            if (SecretNames.TryGetValue(schemaName, out var name))
            {
                var fromTable = ReadTable(system, name, tracing);
                if (fromTable != null) return fromTable;
            }
            if (!string.IsNullOrWhiteSpace(secureConfig)) return secureConfig.Trim();
            try
            {
                var request = new OrganizationRequest("RetrieveEnvironmentVariableSecretValue");
                request.Parameters["EnvironmentVariableName"] = schemaName;
                var value = system.Execute(request).Results["EnvironmentVariableSecretValue"] as string;
                if (!string.IsNullOrWhiteSpace(value)) return value;
            }
            catch (Exception) { /* não é Secret ou Key Vault indisponível: tenta String */ }
            return EnvironmentVariables.Read(system, schemaName);
        }

        // Segredo que só existia na configuração segura do step (não viaja na solução): tabela primeiro, depois a configuração.
        // Registra só a fonte usada (tabela, config segura ou ausente), nunca o valor. Null quando ausente.
        public static string ReadTableOrSecureConfig(IOrganizationService system, string name, string secureConfig, ITracingService tracing = null)
        {
            var value = ReadTable(system, name, tracing);
            var source = "tabela";
            if (value == null)
            {
                value = string.IsNullOrWhiteSpace(secureConfig) ? null : secureConfig.Trim();
                source = value == null ? "ausente" : "config segura";
            }
            tracing?.Trace("Segredo {0}: fonte {1}", name, source);
            return value;
        }

        // Valor do segredo pelo nome, ou null (ausente, vazio ou tabela ilegível, por exemplo antes do schema chegar ao ambiente).
        public static string ReadTable(IOrganizationService system, string name, ITracingService tracing = null)
        {
            try
            {
                var query = new QueryExpression(Table) { ColumnSet = new ColumnSet(ValueColumn), TopCount = 1 };
                query.Criteria.AddCondition(NameColumn, ConditionOperator.Equal, name);
                var rows = system.RetrieveMultiple(query).Entities;
                var value = rows.Count > 0 ? rows[0].GetAttributeValue<string>(ValueColumn)?.Trim() : null;
                if (string.IsNullOrEmpty(value)) { tracing?.Trace("Segredo {0}: sem valor na tabela, usando a próxima fonte", name); return null; }
                return value;
            }
            catch (Exception error)
            {
                tracing?.Trace("Segredo {0}: tabela ilegível ({1}), usando a próxima fonte", name, error.GetType().Name);
                return null;
            }
        }
    }
}

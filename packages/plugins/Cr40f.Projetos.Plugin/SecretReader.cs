using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Projetos.Plugin;

/// <summary>
/// Leitura da tabela cr40f_segredo (seção "Segredos" do CLAUDE.md), igual a SecretReader.ReadTable do
/// Betinhos.DriverRecordSharing: sem fallback para configuração segura nem variável de ambiente. Nunca rastreia o valor.
/// </summary>
public static class SecretReader
{
    public const string Table = "cr40f_segredo";
    public const string NameColumn = "cr40f_name";
    public const string ValueColumn = "cr40f_valor";

    /// <summary>Valor do segredo pelo nome, ou null (ausente, vazio ou tabela ilegível).</summary>
    public static string? ReadTable(IOrganizationService system, string name, ITracingService? tracing = null)
    {
        try
        {
            var query = new QueryExpression(Table) { ColumnSet = new ColumnSet(ValueColumn), TopCount = 1 };
            query.Criteria.AddCondition(NameColumn, ConditionOperator.Equal, name);
            var rows = system.RetrieveMultiple(query).Entities;
            var value = rows.Count > 0 ? rows[0].GetAttributeValue<string>(ValueColumn)?.Trim() : null;
            if (string.IsNullOrEmpty(value)) { tracing?.Trace("Segredo {0}: sem valor na tabela", name); return null; }
            return value;
        }
        catch (Exception error)
        {
            tracing?.Trace("Segredo {0}: tabela ilegível ({1})", name, error.GetType().Name);
            return null;
        }
    }
}

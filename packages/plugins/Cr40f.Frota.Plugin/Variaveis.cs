using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

/// <summary>Variável de ambiente (não secreta): valor atual; sem ele, o padrão da definição. Igual a EnvironmentVariables do DriverRecordSharing.</summary>
public static class Variaveis
{
    public static string? Ler(IOrganizationService system, string schema)
    {
        var definicao = new QueryExpression("environmentvariabledefinition") { ColumnSet = new ColumnSet("defaultvalue"), TopCount = 1 };
        definicao.Criteria.AddCondition("schemaname", ConditionOperator.Equal, schema);
        var achadas = system.RetrieveMultiple(definicao).Entities;
        if (achadas.Count == 0) return null;
        var valor = new QueryExpression("environmentvariablevalue") { ColumnSet = new ColumnSet("value"), TopCount = 1 };
        valor.Criteria.AddCondition("environmentvariabledefinitionid", ConditionOperator.Equal, achadas[0].Id);
        var atual = system.RetrieveMultiple(valor).Entities;
        var texto = atual.Count > 0 ? atual[0].GetAttributeValue<string>("value") : null;
        return string.IsNullOrWhiteSpace(texto) ? achadas[0].GetAttributeValue<string>("defaultvalue") : texto;
    }
}

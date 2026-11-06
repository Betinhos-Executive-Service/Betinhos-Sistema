using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    public static class EnvironmentVariables
    {
        // Valor atual da variável de ambiente; sem valor, usa o padrão da definição.
        public static string Read(IOrganizationService system, string schemaName)
        {
            var definition = new QueryExpression("environmentvariabledefinition")
            {
                ColumnSet = new ColumnSet("defaultvalue"),
                TopCount = 1
            };
            definition.Criteria.AddCondition("schemaname", ConditionOperator.Equal, schemaName);
            var found = system.RetrieveMultiple(definition).Entities;
            if (found.Count == 0) return null;

            var value = new QueryExpression("environmentvariablevalue") { ColumnSet = new ColumnSet("value"), TopCount = 1 };
            value.Criteria.AddCondition("environmentvariabledefinitionid", ConditionOperator.Equal, found[0].Id);
            var current = system.RetrieveMultiple(value).Entities;
            var text = current.Count > 0 ? current[0].GetAttributeValue<string>("value") : null;
            return string.IsNullOrWhiteSpace(text) ? found[0].GetAttributeValue<string>("defaultvalue") : text;
        }
    }
}

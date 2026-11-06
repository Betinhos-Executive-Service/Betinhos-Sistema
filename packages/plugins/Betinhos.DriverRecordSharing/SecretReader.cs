using System;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Lê variável de ambiente tipo Secret (Azure Key Vault). Durante a migração, variável String ainda funciona.
    public static class SecretReader
    {
        public static string Read(IOrganizationService system, string schemaName)
        {
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
    }
}

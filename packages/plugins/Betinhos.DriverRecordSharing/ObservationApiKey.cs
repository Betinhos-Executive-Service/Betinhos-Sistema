using System;

namespace Betinhos.DriverRecordSharing
{
    public static class ObservationApiKey
    {
        // A configuração segura do step vence. Sem ela, cai na variável de ambiente (legado, a esvaziar depois da migração).
        public static string Resolve(string secureConfig, Func<string> readEnvironmentVariable)
        {
            return string.IsNullOrWhiteSpace(secureConfig) ? readEnvironmentVariable() : secureConfig;
        }
    }
}

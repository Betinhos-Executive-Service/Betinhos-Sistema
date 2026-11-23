using System;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>
    /// Recusa no servidor de um módulo do App desligado para o motorista, nas Custom APIs que só o App chama (checklists, postos próximos, minha nota).
    /// Quem chama já resolveu a ficha do motorista a partir do usuário; outra pessoa nunca chega aqui. Falha ao ler a configuração libera: só vai ao trace.
    /// </summary>
    public static class AppConfigGuarda
    {
        public const string ChecklistsDesligado = "Checklists não estão disponíveis no seu App no momento. Procure o escritório.";
        public const string PostosProximosDesligado = "Postos próximos não está disponível no seu App no momento. Procure o escritório.";
        public const string MinhaNotaDesligada = "Minha nota não está disponível no seu App no momento. Procure o escritório.";

        public static void Exigir(IOrganizationService system, Guid funcionarioId, string chave, string mensagem, ITracingService tracing, Func<DateTime> utcNow)
        {
            bool ligado;
            try { ligado = new AppConfigLeitor(system, utcNow).Ligado(funcionarioId, chave); }
            catch (Exception erro)
            {
                tracing?.Trace("AppConfig {0}: leitura da configuração falhou, liberado. {1}", chave, erro.GetType().Name);
                return;
            }
            if (!ligado) throw new InvalidPluginExecutionException(mensagem);
        }
    }
}

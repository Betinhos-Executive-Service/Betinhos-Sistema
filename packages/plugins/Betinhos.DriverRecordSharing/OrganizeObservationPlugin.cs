using System;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_OrganizarObservacao: organiza a observação do motorista em tópicos (Claude Haiku).
    // Não grava nada; o App Motoristas mostra os tópicos para o motorista conferir antes de finalizar.
    public sealed class OrganizeObservationPlugin : IPlugin
    {
        public const string MessageName = "new_OrganizarObservacao";
        public const string TextParameter = "new_Texto";
        public const string ResultParameter = "new_ResultadoJson";
        public const string EnvApiKey = "new_AnthropicKeyObservacaoMotorista";

        private readonly string _secureConfig;

        // Configuração segura do step: chave da API. Sem ela (null ou vazia), vale a variável de ambiente.
        public OrganizeObservationPlugin(string unsecureConfig, string secureConfig) { _secureConfig = secureConfig; }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.MessageName != MessageName)
                throw new InvalidPluginExecutionException("Mensagem não suportada pelo organizador de observação.");

            var texto = context.InputParameters.Contains(TextParameter) ? context.InputParameters[TextParameter] as string : null;
            string apiKey = null;
            // Variável de ambiente (Secret do Key Vault ou String) lida como sistema: o motorista não precisa de privilégio nela.
            try { apiKey = ObservationApiKey.Resolve(_secureConfig, () => SecretReader.Read(factory.CreateOrganizationService(null), EnvApiKey)); }
            catch (Exception error) { tracing?.Trace("OrganizarObservacao: variável de ambiente ilegível ({0})", error.GetType().Name); }

            var result = ObservationOrganizer.Organize(apiKey, texto, ObservationOrganizer.HttpPost, tracing);
            context.OutputParameters[ResultParameter] = ObservationOrganizer.ToJson(result);
        }
    }
}

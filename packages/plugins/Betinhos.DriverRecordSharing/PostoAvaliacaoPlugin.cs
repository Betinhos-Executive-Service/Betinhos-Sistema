using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_AvaliarPosto: grava como sistema a avaliação do motorista logado (uma por posto; avaliar de novo substitui) e devolve o resumo do posto.
    public sealed class PostoAvaliacaoPlugin : IPlugin
    {
        public const string InputParameter = "new_AvaliacaoJson";
        public const string ResultParameter = "new_ResultadoJson";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.MessageName != FuelSchema.ApiAvaliar)
                throw new InvalidPluginExecutionException("Mensagem não suportada pela avaliação de postos.");

            var system = factory.CreateOrganizationService(null);
            var driver = new DriverResolver(system, tracing).ResolveFromUser(new EntityReference(PluginConfig.UserTable, context.InitiatingUserId));
            if (driver?.EmployeeReference == null) throw new InvalidPluginExecutionException("Motorista não encontrado para este usuário.");
            var json = context.InputParameters.Contains(InputParameter) ? context.InputParameters[InputParameter] as string : null;
            context.OutputParameters[ResultParameter] = Salvar(system, driver.EmployeeReference.Id, json, DateTime.UtcNow);
        }

        public static string Salvar(IOrganizationService system, Guid motoristaId, string json, DateTime nowUtc)
        {
            var envio = PostoAvaliacoes.Validar(json);
            var repo = new FuelRepository(system);
            if (!repo.LoadPostoNames(new[] { envio.PostoId }).TryGetValue(envio.PostoId, out var posto))
                throw new InvalidPluginExecutionException("Posto não encontrado.");
            repo.SaveAvaliacao(envio, motoristaId, repo.LoadNomeMotorista(motoristaId), posto, nowUtc);
            var avaliacoes = repo.LoadAvaliacoes(new[] { envio.PostoId }, nowUtc.AddDays(-PostoAvaliacoes.JanelaDias));
            return new JavaScriptSerializer().Serialize(new Dictionary<string, object>
            {
                ["ok"] = true,
                ["avaliacoes"] = PostoAvaliacoes.Resumir(avaliacoes, motoristaId)
            });
        }
    }
}

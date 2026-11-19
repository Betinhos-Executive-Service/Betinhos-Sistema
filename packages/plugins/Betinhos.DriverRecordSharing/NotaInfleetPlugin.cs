using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_NotaInfleet: devolve a nota de condução da Infleet do motorista logado (90 dias, comportamentos e 6 meses).
    public sealed class NotaInfleetPlugin : IPlugin
    {
        public const string ApiName = "new_NotaInfleet";
        public const string ResultParameter = "new_Result";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.MessageName != ApiName)
                throw new InvalidPluginExecutionException("Mensagem não suportada pela nota da Infleet.");

            var system = factory.CreateOrganizationService(null);
            var driver = new DriverResolver(system, tracing).ResolveFromUser(new EntityReference(PluginConfig.UserTable, context.InitiatingUserId));
            if (driver?.EmployeeReference == null) throw new InvalidPluginExecutionException("Motorista não encontrado para este usuário.");

            var funcionario = system.Retrieve(driver.EmployeeReference.LogicalName, driver.EmployeeReference.Id, new ColumnSet(PluginConfig.EmployeeInfleetDriverId));
            var infleetId = funcionario.GetAttributeValue<string>(PluginConfig.EmployeeInfleetDriverId);

            InfleetGraphQlGateway gateway = null;
            Func<string, Dictionary<string, object>, Dictionary<string, object>> consultar = (query, variables) =>
            {
                if (gateway == null) gateway = new InfleetGraphQlGateway(InfleetGraphQlGateway.ReadToken(system, null, tracing));
                return gateway.Query(query, variables);
            };

            try
            {
                var json = Resultado(infleetId, DateTime.UtcNow, consultar);
                context.OutputParameters[ResultParameter] = json;
                tracing?.Trace("nota-infleet: situacao=" + (string.IsNullOrWhiteSpace(infleetId) ? "sem_cadastro" : "consultada"));
            }
            catch (InvalidPluginExecutionException)
            {
                tracing?.Trace("nota-infleet: infleet indisponível");
                throw;
            }
        }

        public static string Resultado(string infleetDriverId, DateTime agoraUtc, Func<string, Dictionary<string, object>, Dictionary<string, object>> consultar)
        {
            var serializer = new JavaScriptSerializer();
            if (string.IsNullOrWhiteSpace(infleetDriverId))
                return serializer.Serialize(NotaInfleet.SemCadastro(agoraUtc));

            var periodos = NotaInfleet.Periodos(agoraUtc);
            try
            {
                var data = consultar(NotaInfleet.Consulta(periodos), new Dictionary<string, object> { ["d"] = infleetDriverId.Trim() });
                return serializer.Serialize(NotaInfleet.Montar(data, periodos));
            }
            catch (InfleetUnavailableException)
            {
                throw new InvalidPluginExecutionException("Não foi possível consultar a Infleet agora.");
            }
        }
    }
}

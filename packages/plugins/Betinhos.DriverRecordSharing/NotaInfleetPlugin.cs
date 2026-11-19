using System;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_NotaInfleet: devolve a nota de condução do motorista logado (90 dias, comportamentos e meses), lida de new_notamotorista.
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
            var agora = DateTime.UtcNow;
            var linhas = string.IsNullOrWhiteSpace(infleetId) ? new List<Entity>() : Linhas(system, driver.EmployeeReference.Id, agora);
            context.OutputParameters[ResultParameter] = Resultado(infleetId,
                linhas.FirstOrDefault(l => l.GetAttributeValue<OptionSetValue>("new_periodo")?.Value == (int)NotaTipo.Dias90),
                linhas.Where(l => l.GetAttributeValue<OptionSetValue>("new_periodo")?.Value == (int)NotaTipo.Mes), agora);
            tracing?.Trace("nota-infleet: situacao=" + (string.IsNullOrWhiteSpace(infleetId) ? "sem_cadastro" : "lida da tabela"));
        }

        public static string Resultado(string infleetDriverId, Entity p90, IEnumerable<Entity> meses, DateTime agoraUtc)
        {
            var serializer = new JavaScriptSerializer();
            return serializer.Serialize(string.IsNullOrWhiteSpace(infleetDriverId) ? NotaInfleet.SemCadastro(agoraUtc) : NotaInfleet.MontarDaTabela(p90, meses, agoraUtc));
        }

        private static readonly string[] Colunas = new[] { "new_periodo", "new_data", "new_inicio", "new_fim", "new_situacao", "new_nota", "new_km", "new_outroscomportamentos", "new_sincronizadoem" }
            .Concat(NotaSync.ColunasConducao).ToArray();

        private static List<Entity> Linhas(IOrganizationService system, Guid funcionarioId, DateTime agoraUtc)
        {
            var q = new QueryExpression(NotaSync.Tabela) { ColumnSet = new ColumnSet(Colunas), TopCount = 50 };
            q.Criteria.AddCondition("new_motorista", ConditionOperator.Equal, funcionarioId);
            q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var periodo = q.Criteria.AddFilter(LogicalOperator.Or);
            periodo.AddCondition("new_periodo", ConditionOperator.Equal, (int)NotaTipo.Dias90);
            var mes = periodo.AddFilter(LogicalOperator.And);
            mes.AddCondition("new_periodo", ConditionOperator.Equal, (int)NotaTipo.Mes);
            mes.AddCondition("new_data", ConditionOperator.OnOrAfter, agoraUtc.AddMonths(-(NotaInfleet.Meses + 1)).Date);
            return system.RetrieveMultiple(q).Entities.ToList();
        }
    }
}

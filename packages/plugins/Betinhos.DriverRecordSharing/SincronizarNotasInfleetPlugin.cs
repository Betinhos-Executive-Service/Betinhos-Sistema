using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_SincronizarNotasInfleet: grava em new_notamotorista a nota da Infleet (90 dias, meses e dias) de cada motorista com id da Infleet.
    public sealed class SincronizarNotasInfleetPlugin : IPlugin
    {
        public const string ApiName = "new_SincronizarNotasInfleet";
        public const string ResultParameter = "new_Result";
        public const int MesesPadrao = 2;
        public const int DiasPadrao = 3;
        public static readonly TimeSpan LimiteExecucao = TimeSpan.FromSeconds(80); // o sandbox derruba em 120 s; um lote pode levar ~25 s (2 tentativas de 10 s + upserts)

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.MessageName != ApiName) throw new InvalidPluginExecutionException("Mensagem não suportada pela sincronização da nota.");
            var relogio = Stopwatch.StartNew();
            var system = factory.CreateOrganizationService(null);

            InfleetGraphQlGateway gateway;
            try { gateway = new InfleetGraphQlGateway(InfleetGraphQlGateway.ReadToken(system, null, tracing)); }
            catch (InfleetUnavailableException error) { throw new InvalidPluginExecutionException(error.Message); }

            var resumo = Rodar(system, LerMotoristas(system), DateTime.UtcNow, Data(context, "Ate"),
                Inteiro(context, "Meses", MesesPadrao), Inteiro(context, "Dias", DiasPadrao),
                q => gateway.Query(q, null), () => relogio.Elapsed, tracing);
            context.OutputParameters[ResultParameter] = NotaSync.Json.Serialize(resumo);
            tracing?.Trace("nota-sync: gravadas={0} falhas={1} incompleto={2}", resumo["gravadas"], ((List<string>)resumo["falhas"]).Count, resumo["incompleto"]);
        }

        public static Dictionary<string, object> Rodar(IOrganizationService system, IReadOnlyList<NotaMotorista> motoristas, DateTime agoraUtc, DateTime? ate,
            int meses, int dias, Func<string, Dictionary<string, object>> consultar, Func<TimeSpan> decorrido, ITracingService tracing = null)
        {
            var janelas = NotaSync.Janelas(agoraUtc, ate, meses, dias);
            var gravadas = 0;
            var falhas = new List<string>();
            var incompleto = false;
            var fila = new Queue<List<NotaItem>>(NotaSync.Lotes(NotaSync.Itens(motoristas, janelas)));
            while (fila.Count > 0)
            {
                if (decorrido() > LimiteExecucao) { incompleto = true; break; }
                var lote = fila.Dequeue();
                Dictionary<string, object> data;
                try { data = consultar(NotaSync.Consulta(lote)); }
                catch (InfleetUnavailableException error)
                {
                    tracing?.Trace("nota-sync: lote de " + lote.Count + " falhou: " + error.Message);
                    // Um id inválido derruba o lote inteiro (a Infleet devolve errors); refeito item a item, só ele fica em falha.
                    if (lote.Count > 1) { foreach (var item in lote) fila.Enqueue(new List<NotaItem> { item }); continue; }
                    var id = lote[0].Motorista.Id.ToString();
                    if (!falhas.Contains(id)) falhas.Add(id);
                    continue;
                }
                foreach (var item in lote)
                {
                    var perfil = data != null && data.TryGetValue(item.Alias, out var v) ? v as Dictionary<string, object> : null;
                    var linha = NotaSync.Entidade(item, perfil, agoraUtc);
                    if (linha == null) continue;
                    system.Execute(new UpsertRequest { Target = linha });
                    gravadas++;
                }
            }
            return new Dictionary<string, object>
            {
                ["motoristas"] = motoristas.Count, ["periodos"] = janelas.Count, ["gravadas"] = gravadas, ["falhas"] = falhas, ["incompleto"] = incompleto
            };
        }

        private static IReadOnlyList<NotaMotorista> LerMotoristas(IOrganizationService system)
        {
            var q = new QueryExpression(PluginConfig.EmployeeTable) { ColumnSet = new ColumnSet(PluginConfig.EmployeeName, PluginConfig.EmployeeInfleetDriverId) };
            q.Criteria.AddCondition(PluginConfig.EmployeeInfleetDriverId, ConditionOperator.NotNull);
            q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            return system.RetrieveMultiple(q).Entities
                .Select(e => new NotaMotorista { Id = e.Id, Nome = e.GetAttributeValue<string>(PluginConfig.EmployeeName) ?? "", InfleetId = e.GetAttributeValue<string>(PluginConfig.EmployeeInfleetDriverId) })
                .Where(m => !string.IsNullOrWhiteSpace(m.InfleetId)).ToList();
        }

        private static int Inteiro(IPluginExecutionContext c, string nome, int padrao) =>
            c.InputParameters.Contains(nome) && c.InputParameters[nome] is int v && v >= 0 ? v : padrao;

        private static DateTime? Data(IPluginExecutionContext c, string nome) =>
            c.InputParameters.Contains(nome) && c.InputParameters[nome] is DateTime v ? v.Date : (DateTime?)null;
    }
}

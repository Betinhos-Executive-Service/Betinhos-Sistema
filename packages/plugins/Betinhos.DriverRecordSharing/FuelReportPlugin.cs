using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_ObterRelatorioCombustivel: devolve ao motorista logado os últimos 6 meses (nota, gasto, economia perdida),
    // os abastecimentos do mês corrente e do anterior e os insights do resumo mais recente. Lê tudo como sistema, mas só do próprio motorista;
    // dados de outros motoristas nunca são carregados.
    public sealed class FuelReportPlugin : IPlugin
    {
        public const string ResultParameter = "new_RelatorioJson";
        public const int Months = 6;
        private static readonly TimeSpan Brasilia = TimeSpan.FromHours(3);

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.MessageName != FuelSchema.ApiRelatorio)
                throw new InvalidPluginExecutionException("Mensagem não suportada pelo relatório de combustível.");

            context.OutputParameters[ResultParameter] = Run(factory.CreateOrganizationService(null), context.InitiatingUserId, tracing, DateTime.UtcNow);
        }

        public static string Run(IOrganizationService system, Guid userId, ITracingService tracing, DateTime nowUtc)
        {
            var driver = new DriverResolver(system, tracing).ResolveFromUser(new EntityReference(PluginConfig.UserTable, userId));
            if (driver?.EmployeeReference == null) return SemMotoristaJson();

            var repo = new FuelRepository(system);
            var resumos = repo.LoadMonthSummaries(driver.EmployeeReference.Id, Months);
            var fromUtc = FuelRepository.MonthStartUtc(FuelRepository.MonthOf(nowUtc)).AddMonths(-1);
            var despesas = repo.LoadFuelings(driver.EmployeeReference.Id, fromUtc);
            var postoIds = despesas.SelectMany(d => new[] { d.GetAttributeValue<EntityReference>("new_posto"), d.GetAttributeValue<EntityReference>("new_postomaisbarato") })
                .Where(r => r != null).Select(r => r.Id);
            tracing?.Trace("RelatorioCombustivel: meses={0} abastecimentos={1}", resumos.Count, despesas.Count);
            return BuildJson(resumos, despesas, repo.LoadPostoNames(postoIds));
        }

        public static string SemMotoristaJson() => new JavaScriptSerializer().Serialize(new Dictionary<string, object> { ["ok"] = false, ["motivo"] = "sem_motorista" });

        public static string BuildJson(IList<Entity> resumos, IList<Entity> despesas, IDictionary<Guid, string> nomesPostos)
        {
            var meses = resumos.OrderByDescending(r => r.GetAttributeValue<string>("new_mes")).ToList();
            var latest = meses.FirstOrDefault();
            var root = new Dictionary<string, object>
            {
                ["ok"] = true,
                ["meses"] = meses.Select(Month).ToList(),
                ["abastecimentos"] = despesas.OrderByDescending(d => d.GetAttributeValue<DateTime>("cr40f_datagasto")).Select(d => Fueling(d, nomesPostos)).ToList(),
                ["insights"] = Insights(latest),
                ["insightsGeradoEm"] = InsightsDate(latest)
            };
            return new JavaScriptSerializer().Serialize(root);
        }

        private static Dictionary<string, object> Month(Entity r) => new Dictionary<string, object>
        {
            ["mes"] = r.GetAttributeValue<string>("new_mes"),
            ["qtd"] = r.GetAttributeValue<int?>("new_qtdabastecimentos") ?? 0,
            ["litros"] = r.GetAttributeValue<decimal?>("new_litros") ?? 0m,
            ["gasto"] = r.GetAttributeValue<Money>("new_gastototal")?.Value ?? 0m,
            ["economiaPerdida"] = r.GetAttributeValue<Money>("new_economiaperdida")?.Value ?? 0m,
            ["nota"] = r.GetAttributeValue<int?>("new_nota"),
            ["notaPreco"] = r.GetAttributeValue<decimal?>("new_notapreco"),
            ["notaConsumo"] = r.GetAttributeValue<decimal?>("new_notaconsumo"),
            ["notaRegistro"] = r.GetAttributeValue<decimal?>("new_notaregistro"),
            ["kml"] = r.GetAttributeValue<decimal?>("new_kml"),
            ["kmlReferencia"] = r.GetAttributeValue<decimal?>("new_kmlreferencia")
        };

        private static Dictionary<string, object> Fueling(Entity d, IDictionary<Guid, string> nomes)
        {
            var date = AsUtc(d.GetAttributeValue<DateTime>("cr40f_datagasto")).Subtract(Brasilia);
            var temCnpj = !string.IsNullOrWhiteSpace(d.GetAttributeValue<string>("new_cnpjposto"));
            return new Dictionary<string, object>
            {
                ["id"] = d.Id.ToString("D"),
                ["data"] = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                ["posto"] = NameOf(d.GetAttributeValue<EntityReference>("new_posto"), nomes),
                ["precoLitro"] = d.GetAttributeValue<decimal?>("new_precolitro"),
                ["litros"] = d.GetAttributeValue<decimal?>("cr40f_litros"),
                ["valor"] = d.GetAttributeValue<Money>("cr40f_valor")?.Value,
                ["status"] = Status(d, temCnpj),
                ["mediana"] = d.GetAttributeValue<decimal?>("new_medianaregiao"),
                ["menorPreco"] = d.GetAttributeValue<decimal?>("new_menorprecoproximo"),
                ["postoMaisBarato"] = NameOf(d.GetAttributeValue<EntityReference>("new_postomaisbarato"), nomes),
                ["distanciaMetros"] = d.GetAttributeValue<int?>("new_distanciapostobarato"),
                ["economiaPerdida"] = d.GetAttributeValue<Money>("new_economiaperdida")?.Value,
                ["temCnpj"] = temCnpj,
                ["temKm"] = d.GetAttributeValue<int?>("cr40f_kminformado") != null
            };
        }

        private static string NameOf(EntityReference reference, IDictionary<Guid, string> nomes) =>
            reference != null && nomes.TryGetValue(reference.Id, out var name) ? name : null;

        // Despesa ainda não processada pelo step assíncrono: com CNPJ aguarda o posto, sem CNPJ não tem como comparar.
        private static string Status(Entity d, bool temCnpj)
        {
            switch (d.GetAttributeValue<OptionSetValue>("new_statuscomparacao")?.Value)
            {
                case FuelSchema.ComparacaoComparado: return "comparado";
                case FuelSchema.ComparacaoPostoPendente: return "posto_pendente";
                case FuelSchema.ComparacaoSemReferencia: return "sem_referencia";
                case FuelSchema.ComparacaoSemCnpj: return "sem_cnpj";
                default: return temCnpj ? "posto_pendente" : "sem_cnpj";
            }
        }

        private static List<string> Insights(Entity latest)
        {
            var json = latest?.GetAttributeValue<string>("new_insightsjson");
            if (string.IsNullOrWhiteSpace(json)) return new List<string>();
            try { return new JavaScriptSerializer().Deserialize<List<string>>(json) ?? new List<string>(); }
            catch (Exception) { return new List<string>(); }
        }

        private static string InsightsDate(Entity latest)
        {
            var date = latest?.GetAttributeValue<DateTime?>("new_insightsgeradoem");
            return date == null ? null : AsUtc(date.Value).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
        }

        private static DateTime AsUtc(DateTime value) => value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : DateTime.SpecifyKind(value, DateTimeKind.Utc);
    }
}

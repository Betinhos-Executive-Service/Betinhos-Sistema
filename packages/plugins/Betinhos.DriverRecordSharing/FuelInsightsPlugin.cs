using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_GerarInsightsCombustivel (chamada pelo Flow noturno): escreve os insights dos resumos marcados com new_precisainsight.
    // No máximo 8 por chamada (8 x 8 s cabe nos 2 min do sandbox). Falha da IA ou chave ausente mantém a marca para a noite seguinte.
    public sealed class FuelInsightsPlugin : IPlugin
    {
        public const string ResultParameter = "new_ResultadoJson";
        public const int BatchSize = 8;
        // Orçamento de tempo do laço: o sandbox corta a Custom API em 2 min, e cada chamada de IA pode passar de 8 s (conexão + leitura).
        public static readonly TimeSpan TimeBudget = TimeSpan.FromSeconds(90);
        private static readonly CultureInfo Br = new CultureInfo("pt-BR");
        // Chave da Anthropic na configuração segura do step (só administradores leem); sem ela, cai na variável de ambiente Secret.
        private readonly string _secureConfig;

        public FuelInsightsPlugin() { }
        public FuelInsightsPlugin(string unsecureConfig, string secureConfig) { _secureConfig = secureConfig; }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.MessageName != FuelSchema.ApiInsights)
                throw new InvalidPluginExecutionException("Mensagem não suportada pela geração de insights de combustível.");

            var system = factory.CreateOrganizationService(null);
            string apiKey = null;
            try { apiKey = SecretReader.Read(system, FuelSchema.EnvApiKey, tracing, _secureConfig); }
            catch (Exception error) { tracing?.Trace("InsightsCombustivel: variável de ambiente ilegível ({0})", error.GetType().Name); }

            context.OutputParameters[ResultParameter] = Process(system, apiKey, ObservationOrganizer.HttpPost, tracing);
        }

        public static string Process(IOrganizationService system, string apiKey, ObservationOrganizer.Post post, ITracingService tracing)
        {
            var repo = new FuelRepository(system);
            var processed = 0;
            var clock = System.Diagnostics.Stopwatch.StartNew();
            if (string.IsNullOrWhiteSpace(apiKey)) tracing?.Trace("InsightsCombustivel: sem chave; nada processado");
            else
            {
                foreach (var resumo in repo.LoadPendingInsights(BatchSize))
                {
                    if (clock.Elapsed > TimeBudget) { tracing?.Trace("InsightsCombustivel: orçamento de tempo esgotado; o restante fica para a próxima chamada"); break; }
                    try
                    {
                        if (resumo.GetAttributeValue<EntityReference>("new_motorista") == null) { repo.DeferInsight(resumo.Id); continue; }
                        var result = FuelInsightWriter.Write(apiKey.Trim(), BuildFacts(repo, resumo), post, tracing);
                        if (!result.Ok) { repo.DeferInsight(resumo.Id); continue; }
                        repo.SaveInsights(resumo.Id, result.Insights, DateTime.UtcNow);
                        processed++;
                    }
                    catch (Exception error)
                    {
                        tracing?.Trace("InsightsCombustivel: resumo {0} falhou ({1})", resumo.Id, error.GetType().Name);
                        try { repo.DeferInsight(resumo.Id); } catch (Exception) { }
                    }
                }
            }
            return new JavaScriptSerializer().Serialize(new Dictionary<string, object> { ["processados"] = processed, ["pendentes"] = repo.CountPendingInsights() });
        }

        public static FuelInsightWriter.Facts BuildFacts(FuelRepository repo, Entity resumo)
        {
            var motoristaId = resumo.GetAttributeValue<EntityReference>("new_motorista").Id;
            var mes = resumo.GetAttributeValue<string>("new_mes");
            var anterior = DateTime.ParseExact(mes + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture).AddMonths(-1).ToString("yyyy-MM", CultureInfo.InvariantCulture);
            var start = FuelRepository.MonthStartUtc(mes);

            return new FuelInsightWriter.Facts
            {
                Mes = mes,
                Qtd = resumo.GetAttributeValue<int?>("new_qtdabastecimentos") ?? 0,
                Litros = resumo.GetAttributeValue<decimal?>("new_litros") ?? 0m,
                Gasto = resumo.GetAttributeValue<Money>("new_gastototal")?.Value ?? 0m,
                EconomiaPerdida = resumo.GetAttributeValue<Money>("new_economiaperdida")?.Value ?? 0m,
                Nota = resumo.GetAttributeValue<int?>("new_nota"),
                NotaPreco = resumo.GetAttributeValue<decimal?>("new_notapreco"),
                NotaConsumo = resumo.GetAttributeValue<decimal?>("new_notaconsumo"),
                NotaRegistro = resumo.GetAttributeValue<decimal?>("new_notaregistro"),
                Kml = resumo.GetAttributeValue<decimal?>("new_kml"),
                KmlReferencia = resumo.GetAttributeValue<decimal?>("new_kmlreferencia"),
                MesAnteriorNota = repo.LoadMonthSummary(motoristaId, anterior)?.GetAttributeValue<int?>("new_nota"),
                PiorAbastecimento = WorstFueling(repo, repo.LoadFuelings(motoristaId, start, start.AddMonths(1)))
            };
        }

        // Abastecimento do mês com maior economia perdida: "<posto>: R$ x,xx/L; <posto mais barato> a <d> km: R$ y,yy/L".
        private static string WorstFueling(FuelRepository repo, IList<Entity> fuelings)
        {
            var worst = fuelings.Where(f => (f.GetAttributeValue<Money>("new_economiaperdida")?.Value ?? 0m) > 0m)
                .OrderByDescending(f => f.GetAttributeValue<Money>("new_economiaperdida").Value).FirstOrDefault();
            var posto = worst?.GetAttributeValue<EntityReference>("new_posto");
            var barato = worst?.GetAttributeValue<EntityReference>("new_postomaisbarato");
            var preco = worst?.GetAttributeValue<decimal?>("new_precolitro");
            var menor = worst?.GetAttributeValue<decimal?>("new_menorprecoproximo");
            if (posto == null || barato == null || preco == null || menor == null) return null;

            var names = repo.LoadPostoNames(new[] { posto.Id, barato.Id });
            if (!names.TryGetValue(posto.Id, out var nomePosto) || !names.TryGetValue(barato.Id, out var nomeBarato)) return null;
            var metros = worst.GetAttributeValue<int?>("new_distanciapostobarato");
            var distancia = metros == null ? "" : " a " + (metros.Value / 1000m).ToString("0.#", Br) + " km";
            return nomePosto + ": " + Price(preco.Value) + "/L; " + nomeBarato + distancia + ": " + Price(menor.Value) + "/L";
        }

        private static string Price(decimal value) => "R$ " + value.ToString("N2", Br);
    }
}

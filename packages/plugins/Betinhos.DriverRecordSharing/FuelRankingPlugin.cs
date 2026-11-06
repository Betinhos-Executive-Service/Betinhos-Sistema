using System;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_ObterRankingPostos: lê como sistema os abastecimentos da frota e devolve só o agregado por posto
    // e data e R$/litro dos últimos abastecimentos, porque o motorista não enxerga despesas de colegas. Nada dos abastecimentos identifica motorista;
    // só as avaliações saem assinadas, por decisão do Renan.
    public sealed class FuelRankingPlugin : IPlugin
    {
        public const string ResultParameter = "new_RankingJson";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.MessageName != FuelSchema.ApiRanking)
                throw new InvalidPluginExecutionException("Mensagem não suportada pelo ranking de postos.");

            context.OutputParameters[ResultParameter] = Run(factory.CreateOrganizationService(null), context.InitiatingUserId, tracing, DateTime.UtcNow, PostoGeocoder.HttpGet);
        }

        public static string Run(IOrganizationService system, Guid userId, ITracingService tracing, DateTime nowUtc, PostoGeocoder.Get get)
        {
            var driver = new DriverResolver(system, tracing).ResolveFromUser(new EntityReference(PluginConfig.UserTable, userId));
            if (driver?.EmployeeReference == null) return FuelReportPlugin.SemMotoristaJson();

            var repo = new FuelRepository(system);
            var abastecimentos = repo.LoadFleetFuelings(nowUtc.AddDays(-FuelRanking.JanelaDias)).Select(Mapear).ToList();
            var cnpjs = FuelRanking.Cnpjs(abastecimentos);
            var postos = repo.LoadPostos(cnpjs);
            var novo = EscolherNovo(cnpjs, postos, nowUtc);
            if (novo != null)
            {
                // O cadastro é um extra: se gravar falhar (ex.: outro motorista criou o mesmo posto agora), a lista sai com o que já existe.
                try { var resolvido = repo.EnsurePosto(novo, get, adiarSeFalhar: true); if (resolvido != null) postos[novo] = resolvido; }
                catch (Exception e) { tracing?.Trace("RankingPostos: posto novo não gravado: {0}", e.Message); }
            }
            tracing?.Trace("RankingPostos: abastecimentos={0} postos={1}", abastecimentos.Count, postos.Count);
            return BuildJson(abastecimentos, postos, CarregarAvaliacoes(repo, postos, nowUtc, tracing), driver.EmployeeReference.Id);
        }

        // Avaliação é um extra: o assembly é único e pode chegar a um ambiente sem a tabela, e a lista de preços não pode cair por isso.
        // Devolve null em vez de lista vazia: "não sei" não pode virar "sem avaliações", ou quem já avaliou abriria o formulário em branco.
        private static IList<PostoAvaliacoes.Avaliacao> CarregarAvaliacoes(FuelRepository repo, IDictionary<string, Entity> postos, DateTime nowUtc, ITracingService tracing)
        {
            try { return repo.TemTabelaAvaliacoes() ? repo.LoadAvaliacoes(postos.Values.Select(p => p.Id).ToList(), nowUtc.AddDays(-PostoAvaliacoes.JanelaDias)) : null; }
            catch (Exception e)
            {
                tracing?.Trace("RankingPostos: avaliações não carregadas: {0}", e.Message);
                return null;
            }
        }

        // Um posto novo por abertura: a resposta não pode demorar, e ANP e Nominatim limitam as chamadas.
        // Escolhe pelo relógio para um posto que sempre falha não travar os outros da fila. Usa segundos porque os Ticks
        // andam em passos pares (o relógio do Windows tem resolução de ms) e o resto daria sempre o mesmo índice.
        public static string EscolherNovo(IEnumerable<string> cnpjs, IDictionary<string, Entity> postos, DateTime nowUtc)
        {
            var faltando = cnpjs.Where(c => !postos.ContainsKey(c)).ToList();
            return faltando.Count == 0 ? null : faltando[(int)(nowUtc.Ticks / TimeSpan.TicksPerSecond % faltando.Count)];
        }

        public static string BuildJson(IEnumerable<FuelRanking.Abastecimento> abastecimentos, IDictionary<string, Entity> postos, IList<PostoAvaliacoes.Avaliacao> avaliacoes = null, Guid motoristaId = default(Guid))
        {
            var porPosto = avaliacoes?.ToLookup(a => a.PostoId);
            var locais = postos.Select(p => new { p.Key, Local = LocalDe(p.Value) }).Where(x => x.Local != null).ToDictionary(x => x.Key, x => x.Local);
            return new JavaScriptSerializer().Serialize(new Dictionary<string, object>
            {
                ["ok"] = true,
                ["dias"] = FuelRanking.JanelaDias,
                ["postos"] = FuelRanking.Montar(abastecimentos, locais, porPosto == null ? (Func<Guid, Dictionary<string, object>>)null : id => PostoAvaliacoes.Resumir(porPosto[id], motoristaId))
            });
        }

        // Pendente fica fora: sem coordenada ou só com o ponto do bairro ou da cidade, a distância enganaria.
        public static FuelRanking.Local LocalDe(Entity posto)
        {
            var status = posto.GetAttributeValue<OptionSetValue>("new_statusgeo")?.Value;
            var lat = posto.GetAttributeValue<decimal?>("new_latitude");
            var lon = posto.GetAttributeValue<decimal?>("new_longitude");
            if (status == FuelSchema.StatusGeoPendente || lat == null || lon == null) return null;
            var precisa = status == FuelSchema.StatusGeoManual || posto.GetAttributeValue<string>("new_precisaogeo") == PostoGeocoder.PrecisaoAnp;
            return new FuelRanking.Local { Lat = (double)lat.Value, Lon = (double)lon.Value, Aproximada = !precisa, Endereco = EnderecoDe(posto), PostoId = posto.Id };
        }

        private static string EnderecoDe(Entity posto)
        {
            string Texto(string campo) => (posto.GetAttributeValue<string>(campo) ?? "").Trim();
            string Juntar(string separador, params string[] partes) => string.Join(separador, partes.Where(p => p.Length > 0));
            return Juntar(" - ", Juntar(", ", Texto("new_logradouro"), Texto("new_numero")), Juntar("/", Texto("new_municipio"), Texto("new_uf")));
        }

        private static FuelRanking.Abastecimento Mapear(Entity d) => new FuelRanking.Abastecimento
        {
            Cnpj = d.GetAttributeValue<string>(FuelSchema.DespesaCnpjLido),
            Nome = d.GetAttributeValue<string>("cr40f_estabelecimento"),
            Valor = d.GetAttributeValue<Money>("cr40f_valor")?.Value ?? 0m,
            Litros = d.GetAttributeValue<decimal?>("cr40f_litros") ?? 0m,
            DataUtc = d.GetAttributeValue<DateTime>("cr40f_datagasto")
        };
    }
}

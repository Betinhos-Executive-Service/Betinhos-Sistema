using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Leitura e escrita do relatório de combustível. Sempre com o serviço do sistema (o motorista não escreve nestas tabelas).
    public sealed class FuelRepository
    {
        private const string PostoAlias = "p";
        private const string VeiculoAlias = "v";
        private static readonly TimeSpan Brasilia = TimeSpan.FromHours(3);
        private readonly IOrganizationService service;

        public FuelRepository(IOrganizationService system) { service = system; }

        public static string LocalDay(DateTime dataGastoUtc) => AsUtc(dataGastoUtc).Subtract(Brasilia).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        public static string MonthOf(DateTime dataGastoUtc) => AsUtc(dataGastoUtc).Subtract(Brasilia).ToString("yyyy-MM", CultureInfo.InvariantCulture);

        // Início do mês (meia-noite de Brasília) em UTC.
        public static DateTime MonthStartUtc(string mes) =>
            DateTime.SpecifyKind(DateTime.ParseExact(mes + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture), DateTimeKind.Utc).Add(Brasilia);

        public static string DigitsOnly(string text) => new string((text ?? "").Where(char.IsDigit).ToArray());

        private static DateTime AsUtc(DateTime value) => value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : DateTime.SpecifyKind(value, DateTimeKind.Utc);

        public Entity LoadExpense(Guid id) => service.Retrieve(FuelSchema.Despesa, id, new ColumnSet(
            "cr40f_valor", "cr40f_litros", "cr40f_kminformado", "cr40f_datagasto", "new_cnpjposto", FuelSchema.DespesaMotorista, FuelSchema.DespesaCategoria, FuelSchema.DespesaVeiculo));

        public bool IsFuel(Entity expense)
        {
            var categoria = expense.GetAttributeValue<EntityReference>(FuelSchema.DespesaCategoria);
            if (categoria == null) return false;
            var nome = service.Retrieve(FuelSchema.Categoria, categoria.Id, new ColumnSet(FuelSchema.CategoriaNome)).GetAttributeValue<string>(FuelSchema.CategoriaNome);
            return Normalize(nome) == Normalize(FuelSchema.CategoriaCombustivel);
        }

        private static string Normalize(string text)
        {
            var decomposed = (text ?? "").Trim().Normalize(NormalizationForm.FormD);
            return new string(decomposed.Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark).ToArray()).ToLowerInvariant();
        }

        public IDictionary<string, Entity> LoadPostos(IList<string> cnpjs)
        {
            if (cnpjs.Count == 0) return new Dictionary<string, Entity>();
            var query = new QueryExpression(FuelSchema.Posto) { ColumnSet = new ColumnSet("new_cnpj", "new_latitude", "new_longitude", "new_precisaogeo", "new_statusgeo", "new_logradouro", "new_numero", "new_municipio", "new_uf") };
            query.Criteria.AddCondition("new_cnpj", ConditionOperator.In, cnpjs.Cast<object>().ToArray());
            return RetrieveAll(query).ToDictionary(p => p.GetAttributeValue<string>("new_cnpj"));
        }

        // Posto existente nunca dispara HTTP (mesmo pendente: o gestor corrige à mão). Novo posto nasce geocodificado ou pendente.
        // adiarSeFalhar: não grava nada quando uma chamada falha, porque o posto gravado nunca mais seria consultado.
        public Entity EnsurePosto(string cnpj, PostoGeocoder.Get get, bool adiarSeFalhar = false)
        {
            var query = new QueryExpression(FuelSchema.Posto) { ColumnSet = new ColumnSet(true), TopCount = 2 };
            query.Criteria.AddCondition("new_cnpj", ConditionOperator.Equal, cnpj);
            var found = service.RetrieveMultiple(query).Entities.FirstOrDefault();
            if (found != null) return found;

            var info = PostoGeocoder.Resolve(cnpj, get, adiarSeFalhar);
            if (adiarSeFalhar && info.FalhaTemporaria) return null;
            var posto = new Entity(FuelSchema.Posto)
            {
                ["new_cnpj"] = cnpj,
                ["new_name"] = string.IsNullOrWhiteSpace(info.Nome) ? cnpj : info.Nome,
                ["new_logradouro"] = info.Logradouro, ["new_numero"] = info.Numero, ["new_bairro"] = info.Bairro,
                ["new_municipio"] = info.Municipio, ["new_uf"] = info.Uf, ["new_cep"] = info.Cep, ["new_precisaogeo"] = info.Precisao,
                ["new_statusgeo"] = new OptionSetValue(info.Status == "geocodificado" ? FuelSchema.StatusGeoGeocodificado : FuelSchema.StatusGeoPendente)
            };
            if (info.Lat != null && info.Lon != null) { posto["new_latitude"] = (decimal)info.Lat.Value; posto["new_longitude"] = (decimal)info.Lon.Value; }
            posto.Id = service.Create(posto);
            return posto;
        }

        // Abastecimentos já comparados (com preço e posto) de todos os motoristas na janela da comparação.
        public IList<FuelComparison.Fueling> LoadNeighbors(DateTime dataGastoUtc)
        {
            var day = AsUtc(dataGastoUtc).Date;
            var query = new QueryExpression(FuelSchema.Despesa) { ColumnSet = new ColumnSet("new_precolitro", "cr40f_litros", "cr40f_datagasto", "new_posto", FuelSchema.DespesaMotorista) };
            query.Criteria.AddCondition("cr40f_datagasto", ConditionOperator.GreaterEqual, day.AddDays(-FuelComparison.JanelaDias));
            query.Criteria.AddCondition("cr40f_datagasto", ConditionOperator.LessThan, day.AddDays(1));
            query.Criteria.AddCondition("new_precolitro", ConditionOperator.NotNull);
            query.Criteria.AddCondition("new_posto", ConditionOperator.NotNull);
            var link = query.AddLink(FuelSchema.Posto, "new_posto", "new_postocombustivelid", JoinOperator.Inner);
            link.EntityAlias = PostoAlias;
            link.Columns = new ColumnSet("new_latitude", "new_longitude", "new_name", "new_statusgeo");

            var list = new List<FuelComparison.Fueling>();
            foreach (var row in RetrieveAll(query))
            {
                var status = Aliased<OptionSetValue>(row, PostoAlias, "new_statusgeo")?.Value;
                var lat = Aliased<decimal?>(row, PostoAlias, "new_latitude");
                var lon = Aliased<decimal?>(row, PostoAlias, "new_longitude");
                if (status == FuelSchema.StatusGeoPendente || lat == null || lon == null) continue;
                list.Add(new FuelComparison.Fueling(row.Id, AsUtc(row.GetAttributeValue<DateTime>("cr40f_datagasto")), row.GetAttributeValue<decimal>("new_precolitro"),
                    row.GetAttributeValue<decimal?>("cr40f_litros") ?? 0m, row.GetAttributeValue<EntityReference>("new_posto")?.Id, Aliased<string>(row, PostoAlias, "new_name"),
                    (double)lat.Value, (double)lon.Value, row.GetAttributeValue<EntityReference>(FuelSchema.DespesaMotorista)?.Id));
            }
            return list;
        }

        // RetrieveMultiple devolve no máximo 5000 linhas por página: consultas sem TopCount percorrem todas as páginas.
        private const int PageSize = 5000;

        private List<Entity> RetrieveAll(QueryExpression query)
        {
            var all = new List<Entity>();
            query.PageInfo = new PagingInfo { PageNumber = 1, Count = PageSize };
            while (true)
            {
                var page = service.RetrieveMultiple(query);
                all.AddRange(page.Entities);
                if (!page.MoreRecords) return all;
                query.PageInfo.PageNumber++;
                query.PageInfo.PagingCookie = page.PagingCookie;
            }
        }

        private static T Aliased<T>(Entity row, string alias, string column)
        {
            var key = alias + "." + column;
            return row.Contains(key) && row[key] is AliasedValue aliased && aliased.Value is T value ? value : default(T);
        }

        private static int StatusChoice(string status)
        {
            switch (status)
            {
                case "comparado": return FuelSchema.ComparacaoComparado;
                case "posto_pendente": return FuelSchema.ComparacaoPostoPendente;
                case "sem_referencia": return FuelSchema.ComparacaoSemReferencia;
                default: return FuelSchema.ComparacaoSemCnpj;
            }
        }

        // Grava só colunas fora do filtro do step (sem laço). Campos sem valor são limpos para não sobrar comparação antiga.
        public void SaveComparison(Guid expenseId, decimal? preco, Guid? postoId, FuelComparison.Result r)
        {
            var comparado = r.Status == "comparado";
            service.Update(new Entity(FuelSchema.Despesa, expenseId)
            {
                ["new_precolitro"] = preco,
                ["new_posto"] = postoId == null ? null : new EntityReference(FuelSchema.Posto, postoId.Value),
                ["new_statuscomparacao"] = new OptionSetValue(StatusChoice(r.Status)),
                ["new_referenciascomparacao"] = r.Referencias,
                ["new_medianaregiao"] = comparado ? r.Mediana : null,
                ["new_menorprecoproximo"] = comparado ? r.MenorPreco : null,
                ["new_postomaisbarato"] = comparado && r.PostoMaisBaratoId != null ? new EntityReference(FuelSchema.Posto, r.PostoMaisBaratoId.Value) : null,
                ["new_distanciapostobarato"] = comparado ? r.DistanciaMetros : null,
                ["new_economiaperdida"] = comparado && r.EconomiaPerdida != null ? new Money(r.EconomiaPerdida.Value) : null
            });
        }

        public void RecomputeMonth(Guid motoristaId, string mes, Guid categoriaId)
        {
            var start = MonthStartUtc(mes);
            var end = start.AddMonths(1);

            var mine = MonthExpenses(start, end, categoriaId, motoristaId);
            var entries = mine.Select(e => new FuelScore.Entry(
                e.GetAttributeValue<decimal?>("new_precolitro") ?? 0m, e.GetAttributeValue<decimal?>("cr40f_litros") ?? 0m,
                e.GetAttributeValue<decimal?>("new_precolitro") == null ? null : e.GetAttributeValue<decimal?>("new_medianaregiao"),
                !string.IsNullOrWhiteSpace(e.GetAttributeValue<string>("new_cnpjposto")), e.GetAttributeValue<int?>("cr40f_kminformado"),
                e.GetAttributeValue<EntityReference>(FuelSchema.DespesaVeiculo)?.Id, AsUtc(e.GetAttributeValue<DateTime>("cr40f_datagasto")),
                AsUtc(e.GetAttributeValue<DateTime?>("createdon") ?? e.GetAttributeValue<DateTime>("cr40f_datagasto")))).ToList();

            var mainVehicle = entries.Where(e => e.VeiculoId != null).GroupBy(e => e.VeiculoId).OrderByDescending(g => g.Count()).Select(g => g.Key).FirstOrDefault();
            var score = FuelScore.Month(entries, null, mainVehicle == null ? new List<FuelScore.VehicleKml>() : SameModelConsumption(start, end, categoriaId, mainVehicle.Value));

            var resumo = new Entity(FuelSchema.Resumo, "new_name", motoristaId.ToString("D") + "|" + mes)
            {
                ["new_motorista"] = new EntityReference(FuelSchema.Funcionario, motoristaId),
                ["new_mes"] = mes,
                ["new_qtdabastecimentos"] = score.Qtd,
                ["new_litros"] = entries.Sum(e => e.Litros),
                ["new_gastototal"] = new Money(mine.Sum(e => e.GetAttributeValue<Money>("cr40f_valor")?.Value ?? 0m)),
                ["new_economiaperdida"] = new Money(mine.Sum(e => e.GetAttributeValue<Money>("new_economiaperdida")?.Value ?? 0m)),
                ["new_kmrodados"] = score.KmRodados, ["new_kml"] = score.Kml, ["new_kmlreferencia"] = score.KmlReferencia,
                ["new_notapreco"] = score.NotaPreco, ["new_notaconsumo"] = score.NotaConsumo, ["new_notaregistro"] = score.NotaRegistro,
                ["new_nota"] = score.Nota,
                ["new_precisainsight"] = score.Qtd > 0
            };
            // Mês que ficou sem abastecimentos: zera os totais e descarta o insight antigo em vez de pedir outro à IA.
            if (score.Qtd == 0) { resumo["new_insightsjson"] = null; resumo["new_insightsgeradoem"] = null; }
            service.Execute(new UpsertRequest { Target = resumo });
        }

        private static readonly ColumnSet ResumoColumns = new ColumnSet("new_mes", "new_qtdabastecimentos", "new_litros", "new_gastototal", "new_economiaperdida", "new_kml", "new_kmlreferencia",
            "new_notapreco", "new_notaconsumo", "new_notaregistro", "new_nota", "new_insightsjson", "new_insightsgeradoem", "new_precisainsight", "new_motorista");

        // Últimos meses do motorista, mais recente primeiro.
        public IList<Entity> LoadMonthSummaries(Guid motoristaId, int months)
        {
            var query = new QueryExpression(FuelSchema.Resumo) { ColumnSet = ResumoColumns, TopCount = months };
            query.Criteria.AddCondition("new_motorista", ConditionOperator.Equal, motoristaId);
            query.AddOrder("new_mes", OrderType.Descending);
            return service.RetrieveMultiple(query).Entities.ToList();
        }

        public Entity LoadMonthSummary(Guid motoristaId, string mes)
        {
            var query = new QueryExpression(FuelSchema.Resumo) { ColumnSet = ResumoColumns, TopCount = 1 };
            query.Criteria.AddCondition("new_motorista", ConditionOperator.Equal, motoristaId);
            query.Criteria.AddCondition("new_mes", ConditionOperator.Equal, mes);
            return service.RetrieveMultiple(query).Entities.FirstOrDefault();
        }

        // Resumos que aguardam insight, o mais antigo primeiro.
        public IList<Entity> LoadPendingInsights(int top)
        {
            var query = new QueryExpression(FuelSchema.Resumo) { ColumnSet = ResumoColumns, TopCount = top };
            query.Criteria.AddCondition("new_precisainsight", ConditionOperator.Equal, true);
            query.AddOrder("modifiedon", OrderType.Ascending);
            return service.RetrieveMultiple(query).Entities.ToList();
        }

        public int CountPendingInsights()
        {
            var query = new QueryExpression(FuelSchema.Resumo) { ColumnSet = new ColumnSet("new_mes") };
            query.Criteria.AddCondition("new_precisainsight", ConditionOperator.Equal, true);
            return RetrieveAll(query).Count;
        }

        public void SaveInsights(Guid resumoId, IList<string> insights, DateTime generatedUtc) =>
            service.Update(new Entity(FuelSchema.Resumo, resumoId)
            {
                ["new_insightsjson"] = new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(insights),
                ["new_insightsgeradoem"] = generatedUtc,
                ["new_precisainsight"] = false
            });

        // Falha da IA: mantém pendente, mas regrava para atualizar modifiedon e mandar o resumo ao fim da fila.
        public void DeferInsight(Guid resumoId) =>
            service.Update(new Entity(FuelSchema.Resumo, resumoId) { ["new_precisainsight"] = true });

        // Abastecimentos do motorista (mais recente primeiro) desde fromUtc (e antes de toUtc, se informado).
        public IList<Entity> LoadFuelings(Guid motoristaId, DateTime fromUtc, DateTime? toUtc = null)
        {
            var categoria = service.RetrieveMultiple(CategoriaQuery()).Entities.FirstOrDefault();
            if (categoria == null) return new List<Entity>();

            var query = new QueryExpression(FuelSchema.Despesa)
            {
                ColumnSet = new ColumnSet("cr40f_valor", "cr40f_litros", "cr40f_kminformado", "cr40f_datagasto", "new_cnpjposto", "new_precolitro", "new_statuscomparacao", "new_medianaregiao",
                    "new_menorprecoproximo", "new_distanciapostobarato", "new_economiaperdida", "new_posto", "new_postomaisbarato")
            };
            query.Criteria.AddCondition(FuelSchema.DespesaMotorista, ConditionOperator.Equal, motoristaId);
            query.Criteria.AddCondition(FuelSchema.DespesaCategoria, ConditionOperator.Equal, categoria.Id);
            query.Criteria.AddCondition("cr40f_datagasto", ConditionOperator.GreaterEqual, fromUtc);
            if (toUtc != null) query.Criteria.AddCondition("cr40f_datagasto", ConditionOperator.LessThan, toUtc.Value);
            query.AddOrder("cr40f_datagasto", OrderType.Descending);
            return RetrieveAll(query);
        }

        // Abastecimentos de toda a frota com CNPJ lido: só o ranking agregado usa, nunca volta linha a linha ao motorista.
        // Recusados e cancelados ficam fora.
        public IList<Entity> LoadFleetFuelings(DateTime fromUtc)
        {
            var nomes = new QueryExpression(FuelSchema.Categoria) { ColumnSet = new ColumnSet(false) };
            nomes.Criteria.AddCondition(FuelSchema.CategoriaNome, ConditionOperator.In, FuelSchema.CategoriasRanking.Cast<object>().ToArray());
            var categorias = service.RetrieveMultiple(nomes).Entities.Select(c => (object)c.Id).ToArray();
            if (categorias.Length == 0) return new List<Entity>();

            var query = new QueryExpression(FuelSchema.Despesa)
            {
                ColumnSet = new ColumnSet("cr40f_valor", "cr40f_litros", "cr40f_datagasto", "cr40f_estabelecimento", FuelSchema.DespesaCnpjLido, FuelSchema.DespesaMotorista)
            };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition(FuelSchema.DespesaStatus, ConditionOperator.In, FuelSchema.StatusDespesaEnviado, FuelSchema.StatusDespesaPrecisaCorrigir, FuelSchema.StatusDespesaValidado);
            query.Criteria.AddCondition(FuelSchema.DespesaCategoria, ConditionOperator.In, categorias);
            query.Criteria.AddCondition(FuelSchema.DespesaCnpjLido, ConditionOperator.NotNull);
            query.Criteria.AddCondition("cr40f_datagasto", ConditionOperator.GreaterEqual, fromUtc);
            return RetrieveAll(query);
        }

        // Pergunta à metadata em vez de capturar o erro da consulta: falha engolida dentro da transação do plugin pode derrubar a resposta inteira.
        public bool TemTabelaAvaliacoes()
        {
            var filtro = new MetadataFilterExpression(LogicalOperator.And);
            filtro.Conditions.Add(new MetadataConditionExpression("LogicalName", MetadataConditionOperator.Equals, FuelSchema.Avaliacao));
            var consulta = new EntityQueryExpression { Criteria = filtro, Properties = new MetadataPropertiesExpression("LogicalName") };
            return ((RetrieveMetadataChangesResponse)service.Execute(new RetrieveMetadataChangesRequest { Query = consulta })).EntityMetadata.Count > 0;
        }

        public IList<PostoAvaliacoes.Avaliacao> LoadAvaliacoes(IList<Guid> postoIds, DateTime fromUtc)
        {
            if (postoIds.Count == 0) return new List<PostoAvaliacoes.Avaliacao>();
            var query = new QueryExpression(FuelSchema.Avaliacao)
            {
                ColumnSet = new ColumnSet("new_posto", "new_motorista", "new_autor", "new_recomenda", "new_motivos", "new_comentario", "new_oculta", "new_avaliadoem")
            };
            query.Criteria.AddCondition("new_posto", ConditionOperator.In, postoIds.Cast<object>().ToArray());
            query.Criteria.AddCondition("new_avaliadoem", ConditionOperator.GreaterEqual, fromUtc);
            return RetrieveAll(query).Select(a => new PostoAvaliacoes.Avaliacao
            {
                PostoId = a.GetAttributeValue<EntityReference>("new_posto").Id,
                MotoristaId = a.GetAttributeValue<EntityReference>("new_motorista")?.Id ?? Guid.Empty,
                Autor = a.GetAttributeValue<string>("new_autor"),
                Recomenda = a.GetAttributeValue<bool>("new_recomenda"),
                Motivos = (a.GetAttributeValue<string>("new_motivos") ?? "").Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries),
                Comentario = a.GetAttributeValue<string>("new_comentario"),
                Oculta = a.GetAttributeValue<bool>("new_oculta"),
                DataUtc = AsUtc(a.GetAttributeValue<DateTime>("new_avaliadoem"))
            }).ToList();
        }

        public string LoadNomeMotorista(Guid motoristaId) =>
            service.Retrieve(FuelSchema.Funcionario, motoristaId, new ColumnSet(PluginConfig.EmployeeName)).GetAttributeValue<string>(PluginConfig.EmployeeName) ?? "Motorista";

        // new_avaliadoem é a data da avaliação: modifiedon mudaria quando a gestão oculta um comentário.
        // new_oculta fica de fora: editar a avaliação não desfaz a ocultação feita pela gestão.
        public void SaveAvaliacao(PostoAvaliacoes.Envio envio, Guid motoristaId, string autor, string posto, DateTime nowUtc)
        {
            var query = new QueryExpression(FuelSchema.Avaliacao) { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition("new_posto", ConditionOperator.Equal, envio.PostoId);
            query.Criteria.AddCondition("new_motorista", ConditionOperator.Equal, motoristaId);
            var existente = service.RetrieveMultiple(query).Entities.FirstOrDefault();

            var nome = $"{posto} - {autor}"; // A coluna aceita 200 caracteres e a razão social pode ser longa.
            var avaliacao = new Entity(FuelSchema.Avaliacao)
            {
                ["new_name"] = nome.Length > 200 ? nome.Substring(0, 200) : nome,
                ["new_autor"] = autor,
                ["new_recomenda"] = envio.Recomenda,
                ["new_motivos"] = string.Join(",", envio.Motivos),
                ["new_comentario"] = envio.Comentario,
                ["new_avaliadoem"] = nowUtc
            };
            if (existente != null) { avaliacao.Id = existente.Id; service.Update(avaliacao); return; }
            avaliacao["new_posto"] = new EntityReference(FuelSchema.Posto, envio.PostoId);
            avaliacao["new_motorista"] = new EntityReference(FuelSchema.Funcionario, motoristaId);
            service.Create(avaliacao);
        }

        private static QueryExpression CategoriaQuery()
        {
            var query = new QueryExpression(FuelSchema.Categoria) { ColumnSet = new ColumnSet(FuelSchema.CategoriaNome), TopCount = 1 };
            query.Criteria.AddCondition(FuelSchema.CategoriaNome, ConditionOperator.Equal, FuelSchema.CategoriaCombustivel);
            return query;
        }

        public IDictionary<Guid, string> LoadPostoNames(IEnumerable<Guid> ids)
        {
            var distinct = ids.Distinct().Cast<object>().ToArray();
            var names = new Dictionary<Guid, string>();
            if (distinct.Length == 0) return names;
            var query = new QueryExpression(FuelSchema.Posto) { ColumnSet = new ColumnSet("new_name") };
            query.Criteria.AddCondition("new_postocombustivelid", ConditionOperator.In, distinct);
            foreach (var posto in service.RetrieveMultiple(query).Entities) names[posto.Id] = posto.GetAttributeValue<string>("new_name");
            return names;
        }

        private List<Entity> MonthExpenses(DateTime start, DateTime end, Guid categoriaId, Guid? motoristaId)
        {
            var query = new QueryExpression(FuelSchema.Despesa)
            {
                ColumnSet = new ColumnSet("cr40f_valor", "cr40f_litros", "cr40f_kminformado", "cr40f_datagasto", "createdon", "new_cnpjposto", "new_precolitro", "new_medianaregiao", "new_economiaperdida", FuelSchema.DespesaVeiculo)
            };
            query.Criteria.AddCondition(FuelSchema.DespesaCategoria, ConditionOperator.Equal, categoriaId);
            query.Criteria.AddCondition("cr40f_datagasto", ConditionOperator.GreaterEqual, start);
            query.Criteria.AddCondition("cr40f_datagasto", ConditionOperator.LessThan, end);
            if (motoristaId != null) query.Criteria.AddCondition(FuelSchema.DespesaMotorista, ConditionOperator.Equal, motoristaId.Value);
            return RetrieveAll(query);
        }

        // km/l do mês de cada outro veículo do mesmo modelo do veículo principal do motorista.
        private List<FuelScore.VehicleKml> SameModelConsumption(DateTime start, DateTime end, Guid categoriaId, Guid vehicleId)
        {
            var modelo = Normalize(service.Retrieve(FuelSchema.Veiculo, vehicleId, new ColumnSet(FuelSchema.VeiculoModelo)).GetAttributeValue<string>(FuelSchema.VeiculoModelo));
            if (modelo.Length == 0) return new List<FuelScore.VehicleKml>();

            var query = new QueryExpression(FuelSchema.Despesa) { ColumnSet = new ColumnSet("cr40f_litros", "cr40f_kminformado", "cr40f_datagasto", FuelSchema.DespesaVeiculo) };
            query.Criteria.AddCondition(FuelSchema.DespesaCategoria, ConditionOperator.Equal, categoriaId);
            query.Criteria.AddCondition("cr40f_datagasto", ConditionOperator.GreaterEqual, start);
            query.Criteria.AddCondition("cr40f_datagasto", ConditionOperator.LessThan, end);
            query.Criteria.AddCondition("cr40f_kminformado", ConditionOperator.NotNull);
            var link = query.AddLink(FuelSchema.Veiculo, FuelSchema.DespesaVeiculo, "cr40f_veiculosid", JoinOperator.Inner);
            link.EntityAlias = VeiculoAlias;
            link.Columns = new ColumnSet(FuelSchema.VeiculoModelo);

            return RetrieveAll(query)
                .Where(e => Normalize(Aliased<string>(e, VeiculoAlias, FuelSchema.VeiculoModelo)) == modelo)
                .GroupBy(e => e.GetAttributeValue<EntityReference>(FuelSchema.DespesaVeiculo).Id)
                .Select(g => new { g.Key, Kml = FuelScore.KmlOf(g.Select(e => new FuelScore.Entry(0m, e.GetAttributeValue<decimal?>("cr40f_litros") ?? 0m, null, false,
                    e.GetAttributeValue<int?>("cr40f_kminformado"), g.Key, AsUtc(e.GetAttributeValue<DateTime>("cr40f_datagasto")), DateTime.MinValue))).kml })
                .Where(x => x.Kml != null)
                .Select(x => new FuelScore.VehicleKml(x.Key, x.Kml.Value))
                .ToList();
        }
    }
}

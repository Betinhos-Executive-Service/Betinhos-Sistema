using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_DossieMulta (unbound, só leitura; spec §5.6): o que o gestor manda ao motorista no WhatsApp.
    // Entrada new_MultaId (Guid); saída new_DossieJson: dados da notificação, serviços da agenda (cr40f_reservadeveculos) daquela
    // placa no horário da infração e viagens do InFleet em ±30 min (TermoInfleetGateway, token infleet.token) com o nome do motorista.
    // Falha do InFleet vira {"erro": "..."} e o dossiê sai mesmo assim. Só quem lê a multa recebe o dossiê.
    public sealed class DossieMultaPlugin : IPlugin
    {
        public const string MessageName = "new_DossieMulta";
        private readonly Func<IOrganizationService, ITracingService, ITermoInfleet> infleet;

        public DossieMultaPlugin() : this((string)null, (string)null) { }

        public DossieMultaPlugin(string unsecureConfig, string secureConfig)
            : this((system, tracing) => new TermoInfleetGateway(system, secureConfig, tracing)) { }

        public DossieMultaPlugin(Func<IOrganizationService, ITracingService, ITermoInfleet> infleet)
        {
            this.infleet = infleet ?? throw new ArgumentNullException(nameof(infleet));
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            try
            {
                if (context.MessageName != MessageName) throw new InvalidPluginExecutionException("Mensagem não suportada pelo dossiê da multa.");
                if (!context.InputParameters.Contains("new_MultaId") || !(context.InputParameters["new_MultaId"] is Guid id) || id == Guid.Empty)
                    throw new InvalidPluginExecutionException("Informe a multa.");
                factory.CreateOrganizationService(context.InitiatingUserId).Retrieve("cr40f_multas", id, new ColumnSet("cr40f_multasid"));
                var system = factory.CreateOrganizationService(null);
                context.OutputParameters["new_DossieJson"] = Montar(system, id, infleet(system, tracing));
            }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception error)
            {
                tracing?.Trace("DossieMulta falhou: {0}", error);
                throw new InvalidPluginExecutionException("Não foi possível montar o dossiê da multa.", error);
            }
        }

        public static string Montar(IOrganizationService system, Guid multaId, ITermoInfleet infleet)
        {
            var multa = system.Retrieve("cr40f_multas", multaId, new ColumnSet("cr40f_novacoluna", "cr40f_dataehorario", "cr40f_localdainfracao", "cr40f_placa", "cr40f_codigodainfracao", "cr40f_dataparaindicar", "cr40f_nomedoorgaoautuador"));
            var placaRef = multa.GetAttributeValue<EntityReference>("cr40f_placa");
            var placa = placaRef == null ? null : system.Retrieve(placaRef.LogicalName, placaRef.Id, new ColumnSet("cr40f_placa")).GetAttributeValue<string>("cr40f_placa");
            var utc = Utc(multa, "cr40f_dataehorario");
            var infracaoRef = multa.GetAttributeValue<EntityReference>("cr40f_codigodainfracao");
            var infracao = infracaoRef == null ? null : system.Retrieve(infracaoRef.LogicalName, infracaoRef.Id, new ColumnSet("cr40f_codigodainfracao", "cr40f_descricaodainfracao", "cr40f_valordamulta"));

            Dictionary<string, object> viagens;
            if (placa == null || !utc.HasValue) viagens = new Dictionary<string, object> { ["erro"] = "Multa sem placa ou sem data e hora." };
            else
            {
                try { viagens = infleet.Coletar(placa, utc.Value); NomearMotoristas(system, viagens); }
                catch (Exception error) { viagens = new Dictionary<string, object> { ["erro"] = error.Message }; }
            }

            var dossie = new Dictionary<string, object>
            {
                ["multa"] = new Dictionary<string, object>
                {
                    ["id"] = multaId.ToString("D"),
                    ["auto"] = multa.GetAttributeValue<string>("cr40f_novacoluna"),
                    ["placa"] = placa,
                    ["dataHora"] = utc.HasValue ? Iso(utc.Value) : null,
                    ["local"] = multa.GetAttributeValue<string>("cr40f_localdainfracao"),
                    ["orgao"] = multa.GetAttributeValue<string>("cr40f_nomedoorgaoautuador"),
                    ["dataParaIndicar"] = Dia(multa, "cr40f_dataparaindicar"),
                    ["infracao"] = infracao == null ? null : new Dictionary<string, object>
                    {
                        ["codigo"] = infracao.GetAttributeValue<string>("cr40f_codigodainfracao"),
                        ["descricao"] = infracao.GetAttributeValue<string>("cr40f_descricaodainfracao"),
                        ["valor"] = infracao.GetAttributeValue<Money>("cr40f_valordamulta")?.Value,
                    },
                },
                ["servicos"] = placaRef != null && utc.HasValue ? Servicos(system, placaRef.Id, utc.Value).Cast<object>().ToArray() : new object[0],
                ["infleet"] = viagens,
            };
            return new JavaScriptSerializer { MaxJsonLength = 1000000 }.Serialize(dossie);
        }

        // Serviço que cobre o horário (saída <= infração <= retorno; sem retorno, 12 h depois da saída). Sem nenhum, os que saíram
        // até 6 h antes ou depois, marcados com noHorario = false.
        public static List<Dictionary<string, object>> Servicos(IOrganizationService system, Guid veiculoId, DateTime infracaoUtc)
        {
            var q = new QueryExpression("cr40f_reservadeveculos")
            {
                ColumnSet = new ColumnSet("cr40f_idnovo", "cr40f_id", "cr40f_dataehorriodesada", "cr40f_horrioprevistoderetorno", "cr40f_cliente", "cr40f_motorista", "cr40f_status"),
                TopCount = 50,
            };
            q.Criteria.AddCondition("cr40f_veiculo", ConditionOperator.Equal, veiculoId);
            q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            q.Criteria.AddCondition("cr40f_dataehorriodesada", ConditionOperator.GreaterEqual, infracaoUtc.AddHours(-24));
            q.Criteria.AddCondition("cr40f_dataehorriodesada", ConditionOperator.LessEqual, infracaoUtc.AddHours(6));
            q.AddOrder("cr40f_dataehorriodesada", OrderType.Ascending);
            var linhas = system.RetrieveMultiple(q).Entities.Where(l => Utc(l, "cr40f_dataehorriodesada").HasValue).ToList();
            var durante = linhas.Where(l =>
            {
                var saida = Utc(l, "cr40f_dataehorriodesada").Value;
                var retorno = Utc(l, "cr40f_horrioprevistoderetorno") ?? saida.AddHours(12);
                return saida <= infracaoUtc && infracaoUtc <= retorno;
            }).ToList();
            var escolhidas = durante.Count > 0 ? durante : linhas.Where(l => Math.Abs((Utc(l, "cr40f_dataehorriodesada").Value - infracaoUtc).TotalHours) <= 6).ToList();
            return escolhidas.Select(l => new Dictionary<string, object>
            {
                ["id"] = l.Id.ToString("D"),
                ["codigo"] = l.GetAttributeValue<string>("cr40f_idnovo") ?? l.GetAttributeValue<string>("cr40f_id"),
                ["cliente"] = l.GetAttributeValue<EntityReference>("cr40f_cliente")?.Name,
                ["saida"] = Iso(Utc(l, "cr40f_dataehorriodesada").Value),
                ["retorno"] = Utc(l, "cr40f_horrioprevistoderetorno") is DateTime r ? Iso(r) : null,
                ["motorista"] = l.GetAttributeValue<EntityReference>("cr40f_motorista")?.Name,
                ["status"] = l.FormattedValues.Contains("cr40f_status") ? l.FormattedValues["cr40f_status"] : null,
                ["noHorario"] = durante.Count > 0,
            }).ToList();
        }

        private static void NomearMotoristas(IOrganizationService system, Dictionary<string, object> dados)
        {
            if (!dados.TryGetValue("viagens", out var valor) || !(valor is IEnumerable<object> lista)) return;
            var viagens = lista.OfType<Dictionary<string, object>>().ToList();
            var ids = viagens.Select(v => v.TryGetValue("motoristaInfleet", out var id) ? id as string : null).Where(id => !string.IsNullOrEmpty(id)).Distinct().Cast<object>().ToArray();
            if (ids.Length == 0) return;
            var q = new QueryExpression("cr40f_funcionarios") { ColumnSet = new ColumnSet("new_infleetdriverid", "new_apelido", "cr40f_nomecompleto") };
            q.Criteria.AddCondition("new_infleetdriverid", ConditionOperator.In, ids);
            var nomes = system.RetrieveMultiple(q).Entities
                .GroupBy(e => e.GetAttributeValue<string>("new_infleetdriverid"))
                .ToDictionary(g => g.Key, g => g.First().GetAttributeValue<string>("new_apelido") ?? g.First().GetAttributeValue<string>("cr40f_nomecompleto"));
            foreach (var v in viagens) v["motorista"] = v.TryGetValue("motoristaInfleet", out var id) && id is string s && nomes.TryGetValue(s, out var nome) ? nome : null;
        }

        private static DateTime? Utc(Entity e, string coluna)
        {
            var valor = e.GetAttributeValue<DateTime?>(coluna);
            if (!valor.HasValue) return null;
            return valor.Value.Kind == DateTimeKind.Local ? valor.Value.ToUniversalTime() : DateTime.SpecifyKind(valor.Value, DateTimeKind.Utc);
        }

        // Dia em São Paulo: "Somente data" (meia-noite UTC) fica como está; data e hora volta 3 h (sem horário de verão desde 2019).
        private static string Dia(Entity e, string coluna)
        {
            var utc = Utc(e, coluna);
            if (!utc.HasValue) return null;
            var dia = utc.Value.TimeOfDay == TimeSpan.Zero ? utc.Value : utc.Value.AddHours(-3);
            return dia.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        private static string Iso(DateTime d) => d.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
    }
}

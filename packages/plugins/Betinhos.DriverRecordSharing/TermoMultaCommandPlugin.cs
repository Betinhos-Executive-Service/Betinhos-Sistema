using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Evidência do InFleet no horário da infração. Falha vira {"erro": "..."} no JSON e o envio segue.
    public interface ITermoInfleet
    {
        Dictionary<string, object> Coletar(string placa, DateTime infracaoUtc);
    }

    public sealed class TermoInfleetGateway : ITermoInfleet
    {
        private readonly IOrganizationService system;
        private readonly string secureConfig;
        private readonly ITracingService tracing;

        public TermoInfleetGateway(IOrganizationService system, string secureConfig, ITracingService tracing)
        {
            this.system = system;
            this.secureConfig = secureConfig;
            this.tracing = tracing;
        }

        public Dictionary<string, object> Coletar(string placa, DateTime infracaoUtc)
        {
            var gateway = new InfleetGraphQlGateway(InfleetGraphQlGateway.ReadToken(system, secureConfig, tracing));
            var vehicle = gateway.FindVehicleByPlate(placa);
            if (vehicle == null) return new Dictionary<string, object> { ["erro"] = "Veículo " + placa + " não encontrado no InFleet." };
            var from = infracaoUtc.AddMinutes(-30);
            var to = infracaoUtc.AddMinutes(30);
            var trips = gateway.ListTrips(new[] { new InfleetVehicle(vehicle.Id, vehicle.Plate) }, from, to);
            return new Dictionary<string, object>
            {
                ["veiculoId"] = vehicle.Id,
                ["janela"] = new[] { Iso(from), Iso(to) },
                ["viagens"] = trips.Select(t => new Dictionary<string, object> { ["inicio"] = Iso(t.StartUtc), ["fim"] = Iso(t.EndUtc), ["motoristaInfleet"] = t.InfleetDriverId }).ToArray(),
            };
        }

        private static string Iso(DateTime d) => d.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
    }

    // Custom APIs do termo de multa (enviar, assinar, contestar, cancelar, expirar) e a trava de imutabilidade
    // (steps pre-operation de Update/Delete em new_termomulta e new_parcelamultafolha).
    public sealed class TermoMultaCommandPlugin : IPlugin
    {
        private const string Termo = "new_termomulta";
        private const string ParcelaTable = "new_parcelamultafolha";
        private const string Multa = "cr40f_multas";
        private const string Funcionario = "cr40f_funcionarios";
        private const int Pendente = 100000000, Assinado = 100000001, Contestado = 100000002, Expirado = 100000003, Cancelado = 100000004;
        private const int Guia = 100000000, Folha = 100000001;
        private const int Prevista = 100000000, Descontada = 100000001, ParcelaCancelada = 100000002;
        private const int TextoTipoTermo = 100000000;
        private const int TextoTipoAditivo = 100000001;
        private const string ColunaAditivo = "new_aditivoassinatura";
        private const string PassoMulta = "cr40f_PassoMulta";
        private const int MaxParcelas = 3; // decisão da Frota, 24/11/2026: 1x a 3x; termos antigos com 4 a 12 seguem válidos
        private const string VersaoProvisoria = "v0-placeholder";
        private const string MultaMudouDeEtapa = "Esta multa mudou de etapa e o termo não pode mais ser assinado. Procure o escritório.";
        private const int StatusIndicar = 202410004;
        private const int CanalSenatran = 100000000;
        private const int SelfieMaxBytes = 1572864; // 1,5 MB
        public const string ServerWriteVariable = "termo_server_write";
        private const string Bloqueado = "Termo assinado não pode ser alterado nem excluído.";
        private const string ParcelaBloqueada = "Parcela de multa só é lançada ou desfeita pela tela Descontos em folha e não pode ser alterada nem excluída por fora.";
        private const string SemAditivo = "O motorista ainda não tem o aditivo de assinatura eletrônica registrado.";
        // APIs que gravam termo e parcela pelo servidor. cr40f_PassoMulta e cr40f_LancarDescontoFolha (Cr40f.Frota.Plugin)
        // criam e lançam as parcelas do Acertar -> folha (RH bloco 1).
        private static readonly string[] Apis = { "new_EnviarTermoMulta", "new_AssinarTermoMulta", "new_ContestarTermoMulta", "new_CancelarTermoMulta", "new_ExpirarTermoMulta", "new_LembrarTermoMulta", "cr40f_PassoMulta", "cr40f_LancarDescontoFolha" };
        private const string NaoESeu = "Este termo não é seu.";
        private const string MultasDesligado = "Multas não está disponível no seu App no momento. Procure o escritório.";
        private const string PrivilegioGestor = "prvCreatenew_TermoMulta";
        private const string CadastroDuplicado = "Seu cadastro está duplicado. Procure o escritório.";
        private static readonly CultureInfo PtBr = CultureInfo.GetCultureInfo("pt-BR");

        private readonly Func<DateTime> clock;
        private readonly Func<IOrganizationService, ITracingService, ITermoInfleet> infleet;

        public TermoMultaCommandPlugin() : this((string)null, (string)null) { }

        public TermoMultaCommandPlugin(string unsecureConfig, string secureConfig)
            : this(() => DateTime.UtcNow, (system, tracing) => new TermoInfleetGateway(system, secureConfig, tracing)) { }

        public TermoMultaCommandPlugin(Func<DateTime> clock, Func<ITermoInfleet> infleet)
            : this(clock, infleet == null ? null : (Func<IOrganizationService, ITracingService, ITermoInfleet>)((system, tracing) => infleet())) { }

        private TermoMultaCommandPlugin(Func<DateTime> clock, Func<IOrganizationService, ITracingService, ITermoInfleet> infleet)
        {
            this.clock = clock ?? throw new ArgumentNullException(nameof(clock));
            this.infleet = infleet ?? throw new ArgumentNullException(nameof(infleet));
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var caller = factory.CreateOrganizationService(context.InitiatingUserId);
            var system = factory.CreateOrganizationService(null);

            try
            {
                switch (context.MessageName)
                {
                    case "new_EnviarTermoMulta": Enviar(context, caller, system, tracing); break;
                    case "new_AssinarTermoMulta": Assinar(context, system, tracing); break;
                    case "new_ContestarTermoMulta": Contestar(context, system, tracing); break;
                    case "new_CancelarTermoMulta": Encerrar(context, caller, system, Cancelado, "Só é possível cancelar termo pendente.", null); break;
                    case "new_ExpirarTermoMulta": Encerrar(context, caller, system, Expirado, "Só é possível expirar termo pendente.", clock()); break;
                    case "new_LembrarTermoMulta": Lembrar(context, caller, system); break;
                    case "new_BaixarPdfTermoMulta": BaixarPdf(context, system, tracing); break;
                    case "new_ConsultarAditivoMotorista": ConsultarAditivo(context, system, tracing); break;
                    case "new_MinhasMultas": MinhasMultasDoMotorista(context, system, tracing); break;
                    case "new_DeclararAceiteMulta": DeclararAceite(context, system, tracing); break;
                    case "new_LembrarAceiteMulta": LembrarAceite(context, caller, system); break;
                    case "new_GerarAditivoMotorista": GerarAditivo(context, system); break;
                    case "new_RegistrarAditivoMotorista": RegistrarAditivo(context, system); break;
                    case "Create":
                    case "Update":
                    case "Delete":
                        Guard(context, system, tracing);
                        break;
                    default:
                        throw new InvalidPluginExecutionException("Ação de termo de multa desconhecida.");
                }
            }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception error)
            {
                tracing?.Trace("TermoMulta {0} falhou: {1}", context.MessageName, error);
                throw new InvalidPluginExecutionException("Falha ao processar termo de multa. Contate a operação.", error);
            }
        }

        // ---------------- Trava ----------------

        private static void Guard(IPluginExecutionContext context, IOrganizationService system, ITracingService tracing)
        {
            var targetEntity = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
            if (targetEntity != null) tracing?.Trace("TermoMulta trava {0} {1}: colunas {2}", context.MessageName, targetEntity.LogicalName, string.Join(",", targetEntity.Attributes.Keys));
            if (IsServerWrite(context)) return;
            var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] : null;
            var entity = target as Entity;
            var reference = entity != null ? entity.ToEntityReference() : target as EntityReference;
            if (reference == null) return;

            if (reference.LogicalName == Termo)
            {
                if (context.MessageName == "Create") return;
                var changed = entity == null ? new List<string>() : Changed(entity, "new_termomultaid").ToList();
                if (entity != null && changed.All(a => a == "new_copiaenviadaem" || a == "new_copiacanal")) return;
                // Status e colunas de assinatura/envio só mudam pelo próprio plugin, mesmo com o termo Pendente.
                if (changed.Any(ProtectedTermoColumns.Contains)) throw new InvalidPluginExecutionException(Bloqueado);
                var current = system.Retrieve(Termo, reference.Id, new ColumnSet("new_status"));
                if (Choice(current, "new_status") == Pendente) return;
                throw new InvalidPluginExecutionException(Bloqueado);
            }
            if (reference.LogicalName == ParcelaTable)
            {
                if (context.MessageName == "Create") throw new InvalidPluginExecutionException("Parcela de multa só é criada pela assinatura do termo ou pelo acerto da multa.");
                // Lançar e desfazer só pela cr40f_LancarDescontoFolha, que grava a data e encerra ou reabre a multa (spec RH §8).
                throw new InvalidPluginExecutionException(ParcelaBloqueada);
            }
        }

        private static readonly HashSet<string> ProtectedTermoColumns = new HashSet<string>
        {
            "new_status", "new_assinadoem", "new_hashpdf", "new_selfie", "new_assinaturajson", "new_assinatura", "new_pdf",
            "new_latitude", "new_longitude", "new_precisaogps", "new_dispositivo", "new_enviadoem", "new_motivocontestacao",
            "new_textotermo", "new_versaotexto", "new_evidenciasjson", "new_formapagamento", "new_parcelas", "new_valortotal",
            "new_valorparcela", "new_primeiracompetencia", "new_multa", "new_motorista", "new_ultimolembreteem", "new_enviadopor",
        };

        // Colunas que a própria plataforma injeta no Target do pre-operation (auditoria e moeda).
        private static readonly HashSet<string> PlatformColumns = new HashSet<string>
        {
            "modifiedon", "modifiedby", "modifiedonbehalfby", "exchangerate", "transactioncurrencyid",
            "new_valortotal_base", "new_valorparcela_base", "new_valor_base", "versionnumber", "timezoneruleversionnumber", "utcconversiontimezonecode",
        };

        private static IEnumerable<string> Changed(Entity target, string primaryId) =>
            target.Attributes.Keys.Where(k => k != primaryId && !PlatformColumns.Contains(k)).OrderBy(k => k, StringComparer.Ordinal).ToList();

        // Só vale vindo de um contexto pai (gravação feita pelo próprio plugin); o contexto raiz pode ter sido montado pelo cliente.
        private static bool IsServerWrite(IPluginExecutionContext context)
        {
            for (var parent = context.ParentContext; parent != null; parent = parent.ParentContext)
            {
                if (Apis.Contains(parent.MessageName)) return true;
                if (parent.SharedVariables.Contains(ServerWriteVariable) && Equals(parent.SharedVariables[ServerWriteVariable], true)) return true;
            }
            return false;
        }

        // ---------------- Enviar ----------------

        private void Enviar(IPluginExecutionContext context, IOrganizationService caller, IOrganizationService system, ITracingService tracing)
        {
            context.SharedVariables[ServerWriteVariable] = true;
            var multaId = InputGuid(context, "new_MultaId");
            caller.Retrieve(Multa, multaId, new ColumnSet("cr40f_multasid"));
            var multa = system.Retrieve(Multa, multaId, new ColumnSet("cr40f_novacoluna", "cr40f_dataehorario", "cr40f_localdainfracao", "cr40f_placa", "cr40f_motorista", "cr40f_codigodainfracao", "new_valorguia", "cr40f_status", "cr40f_datadeavisoaocondutor", "cr40f_dataparaindicar"));
            var hoje = TimeZoneInfo.ConvertTimeFromUtc(clock(), SaoPaulo()).Date;
            var prazo = multa.GetAttributeValue<DateTime?>("cr40f_dataparaindicar");
            var etapa2 = multa.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value == StatusIndicar
                && multa.GetAttributeValue<DateTime?>("cr40f_datadeavisoaocondutor") == null
                && (prazo == null || prazo.Value.Date >= hoje);
            if (!etapa2) throw new InvalidPluginExecutionException("O termo só é enviado na etapa 2, antes da indicação.");
            if (TermoPrazos.PrazoCurtoParaEnviar(prazo, hoje)) throw new InvalidPluginExecutionException("Faltam menos de 3 dias para o prazo de indicação; indique sem o termo.");
            var forma = InputInt(context, "new_FormaPagamento");
            var parcelas = InputInt(context, "new_Parcelas");
            var valorTotal = context.InputParameters.Contains("new_ValorTotal") ? Convert.ToDecimal(context.InputParameters["new_ValorTotal"], CultureInfo.InvariantCulture) : 0m;
            var competencia = context.InputParameters.Contains("new_PrimeiraCompetencia") && context.InputParameters["new_PrimeiraCompetencia"] is DateTime c ? c : (DateTime?)null;

            var motoristaRef = multa.GetAttributeValue<EntityReference>("cr40f_motorista");
            var motorista = motoristaRef == null ? null : system.Retrieve(Funcionario, motoristaRef.Id, new ColumnSet("cr40f_nomecompleto", "cr40f_numerodocpf", "cr40f_emailmicrosoft", "new_aditivoassinaturaem", "new_aditivoassinatura"));
            var pendenteQuery = new QueryExpression(Termo) { ColumnSet = new ColumnSet("new_termomultaid"), TopCount = 1 };
            pendenteQuery.Criteria.AddCondition("new_multa", ConditionOperator.Equal, multaId);
            pendenteQuery.Criteria.AddCondition("new_status", ConditionOperator.Equal, Pendente);

            // A base é o valor cheio da multa (guia ou catálogo da infração), não o que o gestor digitou: o servidor é a fonte.
            var infracao = multa.GetAttributeValue<EntityReference>("cr40f_codigodainfracao");
            var catalogo = infracao == null ? null : system.Retrieve(infracao.LogicalName, infracao.Id, new ColumnSet("cr40f_codigodainfracao", "cr40f_descricaodainfracao", "cr40f_valordamulta"));
            var valorCheio = multa.GetAttributeValue<Money>("new_valorguia")?.Value ?? catalogo?.GetAttributeValue<Money>("cr40f_valordamulta")?.Value;
            if (valorCheio > 0) valorTotal = valorCheio.Value;

            var erro = ValidarAcordo(forma, parcelas, valorTotal, competencia, hoje,
                temMotorista: motorista != null,
                temAditivo: motorista != null && TemAditivo(motorista),
                termoPendente: () => system.RetrieveMultiple(pendenteQuery).Entities.Count > 0);
            if (erro != null) throw new InvalidPluginExecutionException(erro);

            var primeira = DateOnly(competencia.Value);
            var plano = forma == Folha ? CalcularParcelas(valorTotal, parcelas, primeira) : new List<Parcela>();
            var texto = TextoVigente(system);
            if (texto.GetAttributeValue<string>("new_versao") == VersaoProvisoria) throw new InvalidPluginExecutionException("O texto do termo ainda é provisório.");
            var placa = Placa(system, multa);
            var infracaoTexto = catalogo == null ? (infracao?.Name ?? "não informada")
                : (catalogo.GetAttributeValue<string>("cr40f_codigodainfracao") + " - " + catalogo.GetAttributeValue<string>("cr40f_descricaodainfracao")).Trim(' ', '-');
            var formaTexto = forma == Folha ? "Desconto em folha" : "Paga a guia";
            var motoristaNome = motorista.GetAttributeValue<string>("cr40f_nomecompleto") ?? "";

            var corpo = (texto.GetAttributeValue<string>("new_texto") ?? "")
                .Replace("{motorista}", motoristaNome)
                .Replace("{cpf}", motorista.GetAttributeValue<string>("cr40f_numerodocpf") ?? "não informado")
                .Replace("{placa}", placa)
                .Replace("{infracao}", infracaoTexto)
                .Replace("{valor}", TermoMultaDocumento.Brl(valorTotal))
                .Replace("{forma}", formaTexto)
                .Replace("{parcelas}", parcelas.ToString(CultureInfo.InvariantCulture))
                .Replace("{datahora}", DataHoraBr(multa.GetAttributeValue<DateTime?>("cr40f_dataehorario")))
                .Replace("{local}", multa.GetAttributeValue<string>("cr40f_localdainfracao") ?? "")
                .Replace("{auto}", multa.GetAttributeValue<string>("cr40f_novacoluna") ?? "")
                .Replace("{primeiromes}", primeira.ToString("MM/yyyy", PtBr));

            var dataInfracao = multa.GetAttributeValue<DateTime?>("cr40f_dataehorario");
            Dictionary<string, object> infleetDados;
            try { infleetDados = dataInfracao.HasValue ? infleet(system, tracing).Coletar(placa, dataInfracao.Value) : new Dictionary<string, object> { ["erro"] = "Multa sem data/hora." }; }
            catch (Exception error) { infleetDados = new Dictionary<string, object> { ["erro"] = error.Message }; }
            var evidencias = new Dictionary<string, object>
            {
                ["multa"] = new Dictionary<string, object>
                {
                    ["id"] = multaId.ToString("D"),
                    ["titulo"] = multa.GetAttributeValue<string>("cr40f_novacoluna"),
                    ["placa"] = placa,
                    ["dataHora"] = dataInfracao?.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture),
                    ["local"] = multa.GetAttributeValue<string>("cr40f_localdainfracao"),
                    ["valorGuia"] = multa.GetAttributeValue<Money>("new_valorguia")?.Value,
                },
                ["infracao"] = catalogo == null ? null : new Dictionary<string, object>
                {
                    ["codigo"] = catalogo.GetAttributeValue<string>("cr40f_codigodainfracao"),
                    ["descricao"] = catalogo.GetAttributeValue<string>("cr40f_descricaodainfracao"),
                    ["valor"] = catalogo.GetAttributeValue<Money>("cr40f_valordamulta")?.Value,
                },
                ["infleet"] = infleetDados,
            };

            var agora = clock();
            var termo = new Entity(Termo);
            var nome = "TM-" + placa + "-" + TimeZoneInfo.ConvertTimeFromUtc(agora, SaoPaulo()).ToString("yyyyMMdd", CultureInfo.InvariantCulture);
            termo["new_name"] = nome;
            termo["new_multa"] = new EntityReference(Multa, multaId);
            termo["new_motorista"] = new EntityReference(Funcionario, motorista.Id);
            termo["new_status"] = new OptionSetValue(Pendente);
            termo["new_formapagamento"] = new OptionSetValue(forma);
            termo["new_parcelas"] = parcelas;
            termo["new_valortotal"] = new Money(valorTotal);
            termo["new_valorparcela"] = new Money(plano.Count > 0 ? plano[0].Valor : valorTotal);
            termo["new_primeiracompetencia"] = primeira;
            termo["new_versaotexto"] = Limit(texto.GetAttributeValue<string>("new_versao"), 20);
            termo["new_textotermo"] = Limit(corpo, 20000);
            termo["new_evidenciasjson"] = Limit(Json(evidencias), 20000);
            termo["new_enviadoem"] = agora;
            termo["ownerid"] = new EntityReference("systemuser", context.InitiatingUserId);
            // createdby fica como SYSTEM (o termo é criado pelo serviço de sistema): o aviso ao gestor usa esta coluna.
            termo["new_enviadopor"] = new EntityReference("systemuser", context.InitiatingUserId);
            var termoId = system.Create(termo);

            var driver = new DriverResolver(system, tracing ?? NullTrace.Instance).Resolve(new EntityReference(Funcionario, motorista.Id), DriverResolutionMode.StrictForGrant);
            if (driver?.UserReference == null) throw new InvalidPluginExecutionException("O motorista não tem usuário Microsoft ativo para assinar o termo.");
            system.Execute(new GrantAccessRequest
            {
                Target = new EntityReference(Termo, termoId),
                PrincipalAccess = new PrincipalAccess { Principal = driver.UserReference, AccessMask = AccessRights.ReadAccess },
            });

            system.Update(new Entity(Multa, multaId) { ["new_termovigente"] = new EntityReference(Termo, termoId) });
            // O push dos comunicados é disparado por flow a partir de new_pushstatus do destinatário; new_termomulta não tem essa coluna.
            tracing?.Trace("TermoMulta: termo {0} criado; o push ao motorista é feito pelo flow \"Termo de multa | Push ao motorista\".", termoId);
            context.OutputParameters["new_TermoId"] = termoId;
        }

        private static string DataHoraBr(DateTime? utc) =>
            utc == null ? "" : TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc.Value, DateTimeKind.Utc), SaoPaulo()).ToString("dd/MM/yyyy HH:mm", PtBr);

        /// Espelha validarAcordo de apps/shell/src/pages/frota/domain/termoMulta.ts (mesma ordem e mensagens).
        public static string ValidarAcordo(int forma, int parcelas, decimal valorTotal, DateTime? competencia, DateTime hoje, bool temMotorista, bool temAditivo, Func<bool> termoPendente)
        {
            if (!temMotorista) return "A multa não tem motorista indicado.";
            if (!temAditivo) return SemAditivo;
            if (termoPendente()) return "Já existe um termo pendente para esta multa.";
            if (forma != Folha) return "O termo agora é só para desconto em folha.";
            if (parcelas < 1 || parcelas > MaxParcelas) return "Escolha de 1 a 3 parcelas.";
            if (!competencia.HasValue || DateOnly(competencia.Value).Day != 1 || competencia.Value.TimeOfDay != TimeSpan.Zero) return "Competência inválida.";
            var de = new DateTime(hoje.Year, hoje.Month, 1).AddMonths(-1);
            var ate = new DateTime(hoje.Year, hoje.Month, 1).AddMonths(12);
            var mes = DateOnly(competencia.Value);
            if (mes < de || mes > ate) return $"Escolha um mês entre {de.ToString("MM/yyyy", PtBr)} e {ate.ToString("MM/yyyy", PtBr)}.";
            if (!(EmCentavos(valorTotal) >= parcelas)) return "Informe um valor maior que zero.";
            return null;
        }

        public sealed class Parcela
        {
            public int Numero;
            public DateTime Competencia;
            public decimal Valor;
        }

        /// Espelha calcularParcelas: centavos inteiros, a sobra vai para a última parcela, soma exata.
        public static List<Parcela> CalcularParcelas(decimal valorTotal, int parcelas, DateTime primeiraCompetencia)
        {
            var total = EmCentavos(valorTotal);
            var baseCentavos = total / parcelas;
            var sobra = total - baseCentavos * parcelas;
            return Enumerable.Range(0, parcelas).Select(i => new Parcela
            {
                Numero = i + 1,
                Competencia = primeiraCompetencia.Date.AddMonths(i),
                Valor = (baseCentavos + (i == parcelas - 1 ? sobra : 0)) / 100m,
            }).ToList();
        }

        // Math.round(Number((valor * 100).toFixed(2))): toFixed arredonda meio para longe do zero; Math.round meio para cima.
        private static long EmCentavos(decimal valor) => (long)Math.Floor(Math.Round(valor * 100m, 2, MidpointRounding.AwayFromZero) + 0.5m);

        private static DateTime DateOnly(DateTime value) => new DateTime(value.Year, value.Month, value.Day, 0, 0, 0, DateTimeKind.Unspecified);

        private static bool TemAditivo(Entity funcionario) =>
            funcionario.GetAttributeValue<DateTime?>("new_aditivoassinaturaem").HasValue
            && funcionario.Contains("new_aditivoassinatura") && funcionario["new_aditivoassinatura"] != null;

        private static Entity TextoVigente(IOrganizationService system, int tipo = TextoTipoTermo)
        {
            var query = new QueryExpression("new_textotermomulta") { ColumnSet = new ColumnSet("new_versao", "new_texto") };
            query.Criteria.AddCondition("new_tipo", ConditionOperator.Equal, tipo);
            query.Criteria.AddCondition("new_vigente", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var rows = system.RetrieveMultiple(query).Entities;
            if (rows.Count != 1) throw new InvalidPluginExecutionException(tipo == TextoTipoAditivo
                ? "Cadastre exatamente um texto de aditivo vigente antes de gerar."
                : "Cadastre exatamente um texto de termo vigente antes de enviar.");
            return rows[0];
        }

        private static string Placa(IOrganizationService system, Entity multa)
        {
            var veiculo = multa.GetAttributeValue<EntityReference>("cr40f_placa");
            if (veiculo == null) return "sem placa";
            return system.Retrieve(veiculo.LogicalName, veiculo.Id, new ColumnSet("cr40f_placa")).GetAttributeValue<string>("cr40f_placa") ?? veiculo.Name ?? "sem placa";
        }

        // ---------------- Assinar / Contestar ----------------

        private Entity TermoDoMotorista(IPluginExecutionContext context, IOrganizationService system, ITracingService tracing)
        {
            var termo = system.Retrieve(Termo, InputGuid(context, "new_TermoId"), new ColumnSet(
                "new_status", "new_motorista", "new_multa", "new_formapagamento", "new_parcelas", "new_valortotal", "new_primeiracompetencia", "new_textotermo", "new_versaotexto", "new_evidenciasjson", "new_name"));
            var driver = new DriverResolver(system, tracing ?? NullTrace.Instance).ResolveFromUser(new EntityReference("systemuser", context.InitiatingUserId));
            var dono = termo.GetAttributeValue<EntityReference>("new_motorista");
            if (!EhDono(driver, dono)) throw new InvalidPluginExecutionException(NaoESeu);
            ExigirMultas(system, driver.EmployeeReference.Id);
            if (Choice(termo, "new_status") != Pendente)
                throw new InvalidPluginExecutionException("Este termo não está mais pendente.");
            return termo;
        }

        private void Assinar(IPluginExecutionContext context, IOrganizationService system, ITracingService tracing)
        {
            context.SharedVariables[ServerWriteVariable] = true;
            var termo = TermoDoMotorista(context, system, tracing);
            var motoristaRef = termo.GetAttributeValue<EntityReference>("new_motorista");
            var motorista = system.Retrieve(Funcionario, motoristaRef.Id, new ColumnSet("cr40f_nomecompleto", "cr40f_telefonecorporativo", "new_aditivoassinaturaem", "new_aditivoassinatura"));
            if (!TemAditivo(motorista)) throw new InvalidPluginExecutionException(SemAditivo);

            var selfie = Selfie(InputString(context, "new_SelfieBase64"));
            var assinaturaJson = InputString(context, "new_AssinaturaJson");
            var tracos = Tracos(assinaturaJson);
            var lat = InputDecimal(context, "new_Latitude");
            var lon = InputDecimal(context, "new_Longitude");
            var precisao = InputDecimal(context, "new_PrecisaoGps");
            if ((lat.HasValue && (lat < -90 || lat > 90)) || (lon.HasValue && (lon < -180 || lon > 180)))
                throw new InvalidPluginExecutionException("Localização inválida.");
            var dispositivo = Limit(InputString(context, "new_Dispositivo").Trim(), 500);

            var agora = clock();
            var forma = Choice(termo, "new_formapagamento");
            var parcelas = termo.GetAttributeValue<int>("new_parcelas");
            var valorTotal = termo.GetAttributeValue<Money>("new_valortotal")?.Value ?? 0m;
            var multaRef = termo.GetAttributeValue<EntityReference>("new_multa");
            var plano = forma == Folha ? CalcularParcelas(valorTotal, parcelas, DateOnly(termo.GetAttributeValue<DateTime>("new_primeiracompetencia"))) : new List<Parcela>();

            var pdf = TermoMultaDocumento.Build(new TermoPdfDados
            {
                TermoId = termo.Id,
                VersaoTexto = termo.GetAttributeValue<string>("new_versaotexto"),
                Texto = termo.GetAttributeValue<string>("new_textotermo"),
                EvidenciasJson = termo.GetAttributeValue<string>("new_evidenciasjson"),
                Motorista = motorista.GetAttributeValue<string>("cr40f_nomecompleto"),
                TelefoneCorporativo = motorista.GetAttributeValue<string>("cr40f_telefonecorporativo"),
                Forma = forma == Folha ? "Desconto em folha" : "Paga a guia",
                Parcelas = parcelas,
                ValorTotal = valorTotal,
                ParcelasFolha = plano,
                Selfie = selfie,
                Assinatura = tracos,
                Latitude = lat,
                Longitude = lon,
                PrecisaoGps = precisao,
                Dispositivo = dispositivo,
                AssinadoEmUtc = agora,
            });
            var hash = Sha256Hex.Of(pdf);

            // O passo vem antes de qualquer gravação: se a multa já saiu da etapa 2, nada fica pelo caminho (nem PDF órfão).
            var dia = TimeZoneInfo.ConvertTimeFromUtc(agora, SaoPaulo()).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            RegistrarPasso(system, tracing, multaRef.Id, "TermoAssinado", "{\"data\":\"" + dia + "\"}", MultaMudouDeEtapa);

            // Grava tudo enquanto o termo ainda está Pendente; o status muda por último.
            // new_assinatura (PNG) fica vazio: o sandbox não tem encoder de imagem e o PDF já leva a assinatura vetorial.
            var dados = new Entity(Termo, termo.Id);
            dados["new_selfie"] = selfie;
            dados["new_assinaturajson"] = assinaturaJson;
            if (lat.HasValue) dados["new_latitude"] = lat.Value;
            if (lon.HasValue) dados["new_longitude"] = lon.Value;
            if (precisao.HasValue) dados["new_precisaogps"] = precisao.Value;
            dados["new_dispositivo"] = dispositivo;
            dados["new_assinadoem"] = agora;
            dados["new_hashpdf"] = hash;
            system.Update(dados);
            UploadPdf(system, termo.ToEntityReference(), (termo.GetAttributeValue<string>("new_name") ?? "termo") + ".pdf", pdf);
            system.Update(new Entity(Termo, termo.Id) { ["new_status"] = new OptionSetValue(Assinado) });

            context.OutputParameters["new_HashPdf"] = hash;
        }

        private void Contestar(IPluginExecutionContext context, IOrganizationService system, ITracingService tracing)
        {
            context.SharedVariables[ServerWriteVariable] = true;
            var termo = TermoDoMotorista(context, system, tracing);
            var motivo = InputString(context, "new_Motivo").Trim();
            if (motivo.Length < 10 || motivo.Length > 2000)
                throw new InvalidPluginExecutionException("Descreva o motivo da contestação (10 a 2.000 caracteres).");
            system.Update(new Entity(Termo, termo.Id)
            {
                ["new_status"] = new OptionSetValue(Contestado),
                ["new_motivocontestacao"] = motivo,
                ["new_assinadoem"] = clock(),
            });
            var multa = termo.GetAttributeValue<EntityReference>("new_multa");
            RegistrarPasso(system, tracing, multa.Id, "TermoContestado", "{}", MultaMudouDeEtapa);
        }

        // A multa só muda pelo cr40f_PassoMulta; a trava reconhece este plugin pelo ParentContext. Recusa vira mensagem para o motorista.
        private static void RegistrarPasso(IOrganizationService system, ITracingService tracing, Guid multaId, string passo, string dadosJson, string mensagemSeRecusar)
        {
            try
            {
                system.Execute(new OrganizationRequest(PassoMulta) { ["MultaId"] = multaId, ["Passo"] = passo, ["DadosJson"] = dadosJson });
            }
            catch (InvalidPluginExecutionException error)
            {
                tracing?.Trace("TermoMulta: passo {0} recusado: {1}", passo, error.Message);
                throw new InvalidPluginExecutionException(mensagemSeRecusar);
            }
        }

        private static void Encerrar(IPluginExecutionContext context, IOrganizationService caller, IOrganizationService system, int status, string erro, DateTime? agoraParaPrazo)
        {
            context.SharedVariables[ServerWriteVariable] = true;
            var id = InputGuid(context, "new_TermoId");
            caller.Retrieve(Termo, id, new ColumnSet("new_status"));
            var termo = system.Retrieve(Termo, id, new ColumnSet("new_status", "new_multa", "new_enviadoem"));
            var expirando = agoraParaPrazo.HasValue;
            if (Choice(termo, "new_status") != Pendente)
            {
                // O flow de expiração lista os pendentes e pode perder a corrida para a assinatura: devolve false, sem erro.
                if (expirando) { context.OutputParameters["new_Expirou"] = false; return; }
                throw new InvalidPluginExecutionException(erro);
            }
            var multaRef = termo.GetAttributeValue<EntityReference>("new_multa");
            if (expirando)
            {
                var enviadoEm = termo.GetAttributeValue<DateTime?>("new_enviadoem");
                var prazo = multaRef == null ? (DateTime?)null : system.Retrieve(Multa, multaRef.Id, new ColumnSet("cr40f_dataparaindicar")).GetAttributeValue<DateTime?>("cr40f_dataparaindicar");
                if (!enviadoEm.HasValue || !TermoPrazos.Expirou(enviadoEm.Value, prazo, agoraParaPrazo.Value))
                {
                    context.OutputParameters["new_Expirou"] = false;
                    return;
                }
            }
            system.Update(new Entity(Termo, id) { ["new_status"] = new OptionSetValue(status) });
            if (expirando) context.OutputParameters["new_Expirou"] = true;
            if (multaRef == null) return;
            var multa = system.Retrieve(Multa, multaRef.Id, new ColumnSet("new_termovigente"));
            if (multa.GetAttributeValue<EntityReference>("new_termovigente")?.Id == id)
                system.Update(new Entity(Multa, multaRef.Id) { ["new_termovigente"] = null });
        }

        // Configuração do App (fase B2): com o módulo "multas" desligado para o motorista, o servidor recusa mesmo que o App antigo chame.
        // Falha de leitura da configuração não é engolida: sem a regra, o sensível não abre.
        private void ExigirMultas(IOrganizationService system, Guid funcionarioId)
        {
            if (!new AppConfigLeitor(system, clock).Ligado(funcionarioId, AppConfigLeitor.ChaveMultas))
                throw new InvalidPluginExecutionException(MultasDesligado);
        }

        private static bool EhDono(ResolvedDriver driver, EntityReference dono) =>
            driver?.EmployeeReference != null && dono != null && driver.EmployeeReference.Id == dono.Id;

        // ---------------- Lembrar / Baixar PDF / Aditivo ----------------

        private void Lembrar(IPluginExecutionContext context, IOrganizationService caller, IOrganizationService system)
        {
            context.SharedVariables[ServerWriteVariable] = true;
            var id = InputGuid(context, "new_TermoId");
            caller.Retrieve(Termo, id, new ColumnSet("new_status"));
            var termo = system.Retrieve(Termo, id, new ColumnSet("new_status", "new_ultimolembreteem", "new_enviadoem", "new_multa"));
            var automatico = context.InputParameters.Contains("new_Automatico") && context.InputParameters["new_Automatico"] is bool b && b;
            if (Choice(termo, "new_status") != Pendente)
            {
                if (automatico) { context.OutputParameters["new_Lembrou"] = false; return; }
                throw new InvalidPluginExecutionException("Só é possível lembrar termo pendente.");
            }
            var agora = clock();
            var ultimo = termo.GetAttributeValue<DateTime?>("new_ultimolembreteem");
            if (automatico)
            {
                var enviadoEm = termo.GetAttributeValue<DateTime?>("new_enviadoem");
                var multaRef = termo.GetAttributeValue<EntityReference>("new_multa");
                var prazo = multaRef == null ? (DateTime?)null : system.Retrieve(Multa, multaRef.Id, new ColumnSet("cr40f_dataparaindicar")).GetAttributeValue<DateTime?>("cr40f_dataparaindicar");
                if (!enviadoEm.HasValue || !TermoPrazos.LembrarTermo(enviadoEm.Value, ultimo, prazo, agora))
                {
                    context.OutputParameters["new_Lembrou"] = false;
                    return;
                }
            }
            else if (ultimo.HasValue && ultimo.Value.AddHours(24) > agora)
                throw new InvalidPluginExecutionException("Já foi enviado um lembrete nas últimas 24 horas.");
            // O flow "Termo de multa | Push ao motorista" dispara na alteração desta coluna.
            system.Update(new Entity(Termo, id) { ["new_ultimolembreteem"] = agora });
            context.OutputParameters["new_Lembrou"] = true;
        }

        // O PDF tem segurança de campo: o motorista dono (ou quem pode criar termo) recebe o arquivo lido como sistema.
        private static void BaixarPdf(IPluginExecutionContext context, IOrganizationService system, ITracingService tracing)
        {
            var termo = system.Retrieve(Termo, InputGuid(context, "new_TermoId"), new ColumnSet("new_status", "new_motorista", "new_name"));
            var driver = new DriverResolver(system, tracing ?? NullTrace.Instance).ResolveFromUser(new EntityReference("systemuser", context.InitiatingUserId));
            if (!EhDono(driver, termo.GetAttributeValue<EntityReference>("new_motorista")) && !TemPrivilegio(system, context.InitiatingUserId, PrivilegioGestor))
            {
                RecusarSeDuplicado(system, driver, tracing);
                throw new InvalidPluginExecutionException(NaoESeu);
            }
            if (Choice(termo, "new_status") != Assinado) throw new InvalidPluginExecutionException("Este termo ainda não tem PDF assinado.");
            context.OutputParameters["new_PdfBase64"] = Convert.ToBase64String(DownloadPdf(system, termo.ToEntityReference()));
            context.OutputParameters["new_NomeArquivo"] = (termo.GetAttributeValue<string>("new_name") ?? "termo-multa") + ".pdf";
        }

        // Só um booleano: o motorista não lê o próprio cadastro nem o arquivo do aditivo.
        private static void ConsultarAditivo(IPluginExecutionContext context, IOrganizationService system, ITracingService tracing)
        {
            var driver = new DriverResolver(system, tracing ?? NullTrace.Instance).ResolveFromUser(new EntityReference("systemuser", context.InitiatingUserId));
            RecusarSeDuplicado(system, driver, tracing);
            var tem = false;
            if (driver?.EmployeeReference != null)
                tem = TemAditivo(system.Retrieve(Funcionario, driver.EmployeeReference.Id, new ColumnSet("new_aditivoassinaturaem", "new_aditivoassinatura")));
            context.OutputParameters["new_TemAditivo"] = tem;
        }

        // O DriverResolver não escolhe entre dois funcionários ativos com o mesmo e-mail: falha fechado, com o motivo.
        private static void RecusarSeDuplicado(IOrganizationService system, ResolvedDriver driver, ITracingService tracing)
        {
            if (driver == null || driver.EmployeeReference != null || string.IsNullOrWhiteSpace(driver.Email)) return;
            var query = new QueryExpression(Funcionario) { ColumnSet = new ColumnSet(false), TopCount = 2 };
            query.Criteria.AddCondition("cr40f_emailmicrosoft", ConditionOperator.Equal, driver.Email);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            if (system.RetrieveMultiple(query).Entities.Count < 2) return;
            tracing?.Trace("TermoMulta: cadastro duplicado para o usuário {0}.", driver.UserReference?.Id);
            throw new InvalidPluginExecutionException(CadastroDuplicado);
        }

        private static bool TemPrivilegio(IOrganizationService system, Guid userId, string privilegio)
        {
            var request = new OrganizationRequest("RetrieveUserPrivilegeByPrivilegeName");
            request["UserId"] = userId;
            request["PrivilegeName"] = privilegio;
            var privileges = system.Execute(request).Results["RolePrivileges"] as RolePrivilege[];
            return privileges != null && privileges.Length > 0;
        }

        private static byte[] DownloadPdf(IOrganizationService system, EntityReference target)
        {
            var init = new OrganizationRequest("InitializeFileBlocksDownload");
            init["Target"] = target;
            init["FileAttributeName"] = "new_pdf";
            var initResponse = system.Execute(init);
            var token = (string)initResponse.Results["FileContinuationToken"];
            var size = Convert.ToInt64(initResponse.Results["FileSizeInBytes"], CultureInfo.InvariantCulture);
            const long BlockSize = 4 * 1024 * 1024;
            var pdf = new byte[size];
            long offset = 0;
            while (offset < size)
            {
                var download = new OrganizationRequest("DownloadBlock");
                download["Offset"] = offset;
                download["BlockLength"] = Math.Min(BlockSize, size - offset);
                download["FileContinuationToken"] = token;
                var data = (byte[])system.Execute(download).Results["Data"];
                if (data == null || data.Length == 0) throw new InvalidPluginExecutionException("Não foi possível ler o PDF do termo.");
                Buffer.BlockCopy(data, 0, pdf, (int)offset, data.Length);
                offset += data.Length;
            }
            return pdf;
        }

        private static byte[] Selfie(string base64)
        {
            // Base64 de 1,5 MB tem ~2.000.000 caracteres: recusa antes de alocar o decodificado.
            if ((base64 ?? "").Length > 2000000) throw new InvalidPluginExecutionException("A selfie deve ter até 1,5 MB.");
            byte[] bytes;
            try { bytes = Convert.FromBase64String(base64 ?? ""); }
            catch (FormatException) { throw new InvalidPluginExecutionException("Selfie inválida."); }
            if (bytes.Length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8) throw new InvalidPluginExecutionException("A selfie precisa ser uma foto JPEG.");
            if (bytes.Length > SelfieMaxBytes) throw new InvalidPluginExecutionException("A selfie deve ter até 1,5 MB.");
            return bytes;
        }

        private static List<IReadOnlyList<double[]>> Tracos(string json)
        {
            if (string.IsNullOrWhiteSpace(json) || json.Length > 100000) throw new InvalidPluginExecutionException("Assinatura inválida ou grande demais.");
            object parsed;
            try { parsed = new JavaScriptSerializer { MaxJsonLength = 100000 }.DeserializeObject(json); }
            catch { throw new InvalidPluginExecutionException("Assinatura inválida."); }
            var strokes = parsed as object[];
            if (strokes == null || strokes.Length == 0) throw new InvalidPluginExecutionException("Desenhe sua assinatura.");
            var result = new List<IReadOnlyList<double[]>>();
            foreach (var strokeValue in strokes)
            {
                var stroke = strokeValue as object[] ?? throw new InvalidPluginExecutionException("Traço de assinatura inválido.");
                var points = new List<double[]>();
                foreach (var pointValue in stroke)
                {
                    var point = pointValue as object[];
                    if (point == null || point.Length != 2) throw new InvalidPluginExecutionException("Ponto de assinatura inválido.");
                    var xy = point.Select(v => double.TryParse(Convert.ToString(v, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out var n) ? n : double.NaN).ToArray();
                    if (xy.Any(n => double.IsNaN(n) || n < 0 || n > 1)) throw new InvalidPluginExecutionException("Coordenada de assinatura inválida.");
                    points.Add(xy);
                }
                result.Add(points);
            }
            if (!result.Any(s => s.Count >= 2)) throw new InvalidPluginExecutionException("Desenhe sua assinatura.");
            return result;
        }

        private static void UploadPdf(IOrganizationService system, EntityReference target, string fileName, byte[] pdf, string coluna = "new_pdf")
        {
            var init = new OrganizationRequest("InitializeFileBlocksUpload");
            init["Target"] = target;
            init["FileAttributeName"] = coluna;
            init["FileName"] = fileName;
            var token = (string)system.Execute(init).Results["FileContinuationToken"];
            const int BlockSize = 4 * 1024 * 1024;
            var blockIds = new List<string>();
            for (var offset = 0; offset < pdf.Length; offset += BlockSize)
            {
                var block = new byte[Math.Min(BlockSize, pdf.Length - offset)];
                Buffer.BlockCopy(pdf, offset, block, 0, block.Length);
                var blockId = BlockId(blockIds.Count);
                var upload = new OrganizationRequest("UploadBlock");
                upload["BlockId"] = blockId;
                upload["BlockData"] = block;
                upload["FileContinuationToken"] = token;
                system.Execute(upload);
                blockIds.Add(blockId);
            }
            var commit = new OrganizationRequest("CommitFileBlocksUpload");
            commit["FileName"] = fileName;
            commit["MimeType"] = "application/pdf";
            commit["BlockList"] = blockIds.ToArray();
            commit["FileContinuationToken"] = token;
            system.Execute(commit);
        }

        // ID de bloco do Azure Blob: base64 de tamanho fixo e sem '+', '/' ou '=', que quebram o parâmetro blockid na URL.
        public static string BlockId(int index) =>
            Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes(index.ToString("D6", CultureInfo.InvariantCulture)));

        // ---------------- App Motoristas: minhas multas, declarar e lembrar o aceite ----------------

        private void MinhasMultasDoMotorista(IPluginExecutionContext context, IOrganizationService system, ITracingService tracing)
        {
            var driver = new DriverResolver(system, tracing ?? NullTrace.Instance).ResolveFromUser(new EntityReference("systemuser", context.InitiatingUserId));
            RecusarSeDuplicado(system, driver, tracing);
            if (driver?.EmployeeReference == null) { context.OutputParameters["new_MultasJson"] = "[]"; return; }
            ExigirMultas(system, driver.EmployeeReference.Id);

            var query = new QueryExpression(Multa)
            {
                ColumnSet = new ColumnSet("cr40f_novacoluna", "cr40f_placa", "cr40f_dataehorario", "cr40f_localdainfracao", "cr40f_codigodainfracao", "cr40f_status", "cr40f_responsavel",
                    "cr40f_contestadaem", "cr40f_canalindicacao", "cr40f_datadeindicacao", "cr40f_aceiteem", "cr40f_aceitedeclaradoem", "cr40f_dataparaindicar", "cr40f_datadeavisoaocondutor",
                    "cr40f_encerradaem", "cr40f_canceladaem", "new_recursopendente", "new_termovigente"),
            };
            query.Criteria.AddCondition("cr40f_motorista", ConditionOperator.Equal, driver.EmployeeReference.Id);
            var multas = system.RetrieveMultiple(query).Entities;
            if (multas.Count == 0) { context.OutputParameters["new_MultasJson"] = "[]"; return; }
            var ids = multas.Select(m => (object)m.Id).ToArray();

            // Último termo de cada multa (mais recente pelo envio) e parcelas não canceladas.
            var termosQuery = new QueryExpression(Termo) { ColumnSet = new ColumnSet("new_multa", "new_status", "new_enviadoem") };
            termosQuery.Criteria.AddCondition("new_multa", ConditionOperator.In, ids);
            var termos = system.RetrieveMultiple(termosQuery).Entities
                .GroupBy(t => t.GetAttributeValue<EntityReference>("new_multa")?.Id ?? Guid.Empty)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(t => t.GetAttributeValue<DateTime?>("new_enviadoem") ?? DateTime.MinValue).ToList());
            var parcelasQuery = new QueryExpression(ParcelaTable) { ColumnSet = new ColumnSet("new_multa", "new_numero", "new_competencia", "new_valor", "new_status") };
            parcelasQuery.Criteria.AddCondition("new_multa", ConditionOperator.In, ids);
            var parcelas = system.RetrieveMultiple(parcelasQuery).Entities
                .Where(p => Choice(p, "new_status") != ParcelaCancelada)
                .GroupBy(p => p.GetAttributeValue<EntityReference>("new_multa")?.Id ?? Guid.Empty)
                .ToDictionary(g => g.Key, g => g.ToList());

            var placas = new Dictionary<Guid, string>();
            var infracoes = new Dictionary<Guid, string>();
            var linhas = new List<LinhaMinhaMulta>();
            foreach (var m in multas)
            {
                var linha = new LinhaMinhaMulta
                {
                    Id = m.Id,
                    Auto = m.GetAttributeValue<string>("cr40f_novacoluna"),
                    Placa = Cache(placas, m.GetAttributeValue<EntityReference>("cr40f_placa"), r => system.Retrieve(r.LogicalName, r.Id, new ColumnSet("cr40f_placa")).GetAttributeValue<string>("cr40f_placa")),
                    DataHora = m.GetAttributeValue<DateTime?>("cr40f_dataehorario"),
                    Local = m.GetAttributeValue<string>("cr40f_localdainfracao"),
                    Infracao = Cache(infracoes, m.GetAttributeValue<EntityReference>("cr40f_codigodainfracao"), r =>
                    {
                        var c = system.Retrieve(r.LogicalName, r.Id, new ColumnSet("cr40f_codigodainfracao", "cr40f_descricaodainfracao"));
                        return (c.GetAttributeValue<string>("cr40f_codigodainfracao") + " - " + c.GetAttributeValue<string>("cr40f_descricaodainfracao")).Trim(' ', '-');
                    }),
                    Status = Choice(m, "cr40f_status"),
                    Responsavel = ChoiceOuNulo(m, "cr40f_responsavel"),
                    Canal = ChoiceOuNulo(m, "cr40f_canalindicacao"),
                    ContestadaEm = m.GetAttributeValue<DateTime?>("cr40f_contestadaem"),
                    DataIndicacao = m.GetAttributeValue<DateTime?>("cr40f_datadeindicacao"),
                    AceiteEm = m.GetAttributeValue<DateTime?>("cr40f_aceiteem"),
                    AceiteDeclaradoEm = m.GetAttributeValue<DateTime?>("cr40f_aceitedeclaradoem"),
                    DataParaIndicar = m.GetAttributeValue<DateTime?>("cr40f_dataparaindicar"),
                    DataAviso = m.GetAttributeValue<DateTime?>("cr40f_datadeavisoaocondutor"),
                    EncerradaEm = m.GetAttributeValue<DateTime?>("cr40f_encerradaem"),
                    CanceladaEm = m.GetAttributeValue<DateTime?>("cr40f_canceladaem"),
                    RecursoPendente = m.GetAttributeValue<bool?>("new_recursopendente") ?? false,
                };
                var lista = termos.TryGetValue(m.Id, out var t) ? t : new List<Entity>();
                var vigenteId = m.GetAttributeValue<EntityReference>("new_termovigente")?.Id;
                var vigente = vigenteId == null ? null : lista.FirstOrDefault(x => x.Id == vigenteId.Value);
                if (vigente != null) { linha.TermoVigenteId = vigente.Id; linha.TermoVigenteStatus = Choice(vigente, "new_status"); }
                if (lista.Count > 0) { linha.UltimoTermoId = lista[0].Id; linha.UltimoTermoStatus = Choice(lista[0], "new_status"); }
                if (parcelas.TryGetValue(m.Id, out var ps))
                    foreach (var p in ps)
                        linha.Parcelas.Add(new MinhaParcela
                        {
                            Numero = p.GetAttributeValue<int?>("new_numero") ?? 0,
                            Competencia = p.GetAttributeValue<DateTime?>("new_competencia")?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                            Valor = p.GetAttributeValue<Money>("new_valor")?.Value ?? 0m,
                            Status = Choice(p, "new_status") == Descontada ? "descontada" : "prevista",
                        });
                linhas.Add(linha);
            }
            var hoje = TimeZoneInfo.ConvertTimeFromUtc(clock(), SaoPaulo()).Date;
            context.OutputParameters["new_MultasJson"] = Json(MinhasMultas.Montar(linhas, hoje).Select(m => m.ParaJson()).ToList());
        }

        private static string Cache(Dictionary<Guid, string> cache, EntityReference reference, Func<EntityReference, string> ler)
        {
            if (reference == null) return null;
            if (!cache.TryGetValue(reference.Id, out var valor)) cache[reference.Id] = valor = ler(reference);
            return valor;
        }

        private static int? ChoiceOuNulo(Entity entity, string name) => entity.GetAttributeValue<OptionSetValue>(name)?.Value;

        private static bool AceitePendente(Entity multa) =>
            Choice(multa, "cr40f_status") == StatusIndicar && Choice(multa, "cr40f_canalindicacao") == CanalSenatran
            && multa.GetAttributeValue<DateTime?>("cr40f_datadeindicacao") != null && multa.GetAttributeValue<DateTime?>("cr40f_aceiteem") == null;

        private static readonly ColumnSet ColunasAceite = new ColumnSet("cr40f_motorista", "cr40f_status", "cr40f_canalindicacao", "cr40f_datadeindicacao", "cr40f_aceiteem", "cr40f_aceitedeclaradoem", "cr40f_ultimolembreteaceiteem");

        private void DeclararAceite(IPluginExecutionContext context, IOrganizationService system, ITracingService tracing)
        {
            var multa = system.Retrieve(Multa, InputGuid(context, "new_MultaId"), ColunasAceite);
            var driver = new DriverResolver(system, tracing ?? NullTrace.Instance).ResolveFromUser(new EntityReference("systemuser", context.InitiatingUserId));
            RecusarSeDuplicado(system, driver, tracing);
            if (!EhDono(driver, multa.GetAttributeValue<EntityReference>("cr40f_motorista"))) throw new InvalidPluginExecutionException("Esta multa não é sua.");
            ExigirMultas(system, driver.EmployeeReference.Id);
            if (multa.GetAttributeValue<DateTime?>("cr40f_aceitedeclaradoem") != null) return;
            if (!AceitePendente(multa)) throw new InvalidPluginExecutionException("Esta multa não espera o aceite na CNH Digital.");
            system.Update(new Entity(Multa, multa.Id) { ["cr40f_aceitedeclaradoem"] = TimeZoneInfo.ConvertTimeFromUtc(clock(), SaoPaulo()).Date });
        }

        // Só o flow chama: exige o privilégio de gestor (como o brief pede) além do acesso à multa do chamador.
        private void LembrarAceite(IPluginExecutionContext context, IOrganizationService caller, IOrganizationService system)
        {
            var id = InputGuid(context, "new_MultaId");
            caller.Retrieve(Multa, id, new ColumnSet("cr40f_multasid"));
            if (!TemPrivilegio(system, context.InitiatingUserId, PrivilegioGestor)) throw new InvalidPluginExecutionException("Sem permissão para lembrar o aceite.");
            var multa = system.Retrieve(Multa, id, ColunasAceite);
            var indicacao = multa.GetAttributeValue<DateTime?>("cr40f_datadeindicacao");
            var hoje = TimeZoneInfo.ConvertTimeFromUtc(clock(), SaoPaulo()).Date;
            var lembrar = indicacao != null && AceitePendente(multa) && multa.GetAttributeValue<DateTime?>("cr40f_aceitedeclaradoem") == null
                && TermoPrazos.LembrarAceite(indicacao.Value, multa.GetAttributeValue<DateTime?>("cr40f_ultimolembreteaceiteem"), hoje);
            if (lembrar) system.Update(new Entity(Multa, id) { ["cr40f_ultimolembreteaceiteem"] = hoje });
            context.OutputParameters["new_Lembrou"] = lembrar;
        }

        // ---------------- Aditivo pelo gov.br ----------------

        private sealed class AditivoGerado
        {
            public Entity Funcionario;
            public string Versao;
            public byte[] Pdf;
        }

        // Só a gestão gera e anexa; o texto vigente do aditivo leva o nome e o CPF do funcionário.
        private static AditivoGerado RegerarAditivo(IPluginExecutionContext context, IOrganizationService system)
        {
            if (!TemPrivilegio(system, context.InitiatingUserId, PrivilegioGestor)) throw new InvalidPluginExecutionException("Só a gestão gera e anexa o aditivo.");
            var id = InputGuid(context, "new_FuncionarioId");
            Entity funcionario;
            try { funcionario = system.Retrieve(Funcionario, id, new ColumnSet("cr40f_nomecompleto", "cr40f_numerodocpf")); }
            catch (Exception) { throw new InvalidPluginExecutionException("Funcionário não encontrado."); }
            var texto = TextoVigente(system, TextoTipoAditivo);
            var versao = texto.GetAttributeValue<string>("new_versao") ?? "";
            if (versao == VersaoProvisoria) throw new InvalidPluginExecutionException("O texto do aditivo ainda é provisório.");
            var corpo = (texto.GetAttributeValue<string>("new_texto") ?? "")
                .Replace("{motorista}", funcionario.GetAttributeValue<string>("cr40f_nomecompleto") ?? "")
                .Replace("{cpf}", funcionario.GetAttributeValue<string>("cr40f_numerodocpf") ?? "não informado");
            return new AditivoGerado { Funcionario = funcionario, Versao = versao, Pdf = AditivoPdf.Gerar(corpo, versao, id) };
        }

        private static string SemAcento(string valor)
        {
            var decomposto = (valor ?? "").Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder();
            foreach (var c in decomposto)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
                sb.Append(char.IsLetterOrDigit(c) && c < 128 ? char.ToLowerInvariant(c) : '-');
            }
            return System.Text.RegularExpressions.Regex.Replace(sb.ToString(), "-+", "-").Trim('-');
        }

        private static void GerarAditivo(IPluginExecutionContext context, IOrganizationService system)
        {
            var aditivo = RegerarAditivo(context, system);
            var nome = SemAcento(aditivo.Funcionario.GetAttributeValue<string>("cr40f_nomecompleto"));
            context.OutputParameters["new_PdfBase64"] = Convert.ToBase64String(aditivo.Pdf);
            context.OutputParameters["new_NomeArquivo"] = "aditivo-" + (nome.Length == 0 ? "funcionario" : nome) + "-" + SemAcento(aditivo.Versao) + ".pdf";
        }

        private void RegistrarAditivo(IPluginExecutionContext context, IOrganizationService system)
        {
            var aditivo = RegerarAditivo(context, system);
            var base64 = InputString(context, "new_PdfBase64");
            if (string.IsNullOrWhiteSpace(base64)) throw new InvalidPluginExecutionException("Envie o PDF assinado.");
            // O limite vale antes de decodificar: 5 MB em bytes são cerca de 7 milhões de caracteres em base64.
            if (base64.Length > (AditivoPdf.MaxBytes / 3 + 2) * 4) throw new InvalidPluginExecutionException("O PDF passa de 5 MB.");
            byte[] assinado;
            try { assinado = Convert.FromBase64String(base64); }
            catch (FormatException) { throw new InvalidPluginExecutionException("Envie o PDF assinado."); }
            var assinadoEm = context.InputParameters.Contains("new_AssinadoEm") && context.InputParameters["new_AssinadoEm"] is DateTime d ? d : (DateTime?)null;
            if (assinadoEm == null) throw new InvalidPluginExecutionException("Informe a data da assinatura.");
            var dia = assinadoEm.Value.Kind == DateTimeKind.Utc ? TimeZoneInfo.ConvertTimeFromUtc(assinadoEm.Value, SaoPaulo()).Date : assinadoEm.Value.Date;
            var hoje = TimeZoneInfo.ConvertTimeFromUtc(clock(), SaoPaulo()).Date;
            if (dia > hoje) throw new InvalidPluginExecutionException("A data da assinatura não pode ser no futuro.");
            var erro = AditivoPdf.Conferir(assinado, aditivo.Pdf);
            if (erro != null) throw new InvalidPluginExecutionException(erro);
            var nome = "aditivo-" + SemAcento(aditivo.Funcionario.GetAttributeValue<string>("cr40f_nomecompleto")) + "-" + SemAcento(aditivo.Versao) + ".pdf";
            UploadPdf(system, aditivo.Funcionario.ToEntityReference(), nome, assinado, ColunaAditivo);
            system.Update(new Entity(Funcionario, aditivo.Funcionario.Id) { ["new_aditivoassinaturaem"] = DateTime.SpecifyKind(dia.AddHours(12), DateTimeKind.Utc) }); // dia de São Paulo às 12:00 UTC: meia-noite e meio-dia UTC caem no mesmo dia
        }

        // ---------------- Utilitários ----------------

        private static Guid InputGuid(IPluginExecutionContext context, string name)
        {
            if (!context.InputParameters.Contains(name) || !(context.InputParameters[name] is Guid id) || id == Guid.Empty)
                throw new InvalidPluginExecutionException("Identificador inválido: " + name + ".");
            return id;
        }

        private static int InputInt(IPluginExecutionContext context, string name) =>
            context.InputParameters.Contains(name) && context.InputParameters[name] != null ? Convert.ToInt32(context.InputParameters[name], CultureInfo.InvariantCulture) : 0;

        private static decimal? InputDecimal(IPluginExecutionContext context, string name) =>
            context.InputParameters.Contains(name) && context.InputParameters[name] != null ? Convert.ToDecimal(context.InputParameters[name], CultureInfo.InvariantCulture) : (decimal?)null;

        private static string InputString(IPluginExecutionContext context, string name) =>
            context.InputParameters.Contains(name) ? Convert.ToString(context.InputParameters[name]) ?? "" : "";

        private static int Choice(Entity entity, string name) => entity.GetAttributeValue<OptionSetValue>(name)?.Value ?? -1;

        private static string Limit(string value, int max) => value == null || value.Length <= max ? value : value.Substring(0, max);

        private static string Json(object value) => new JavaScriptSerializer { MaxJsonLength = 1000000 }.Serialize(value);

        internal static TimeZoneInfo SaoPaulo()
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time"); }
            catch (TimeZoneNotFoundException) { return TimeZoneInfo.CreateCustomTimeZone("BRT", TimeSpan.FromHours(-3), "BRT", "BRT"); }
        }

        private sealed class NullTrace : ITracingService
        {
            public static readonly NullTrace Instance = new NullTrace();
            public void Trace(string format, params object[] args) { }
        }
    }
}

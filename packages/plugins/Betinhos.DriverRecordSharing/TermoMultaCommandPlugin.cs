using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
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
        private const int MultaIndicada = 202410001, MultaRecurso = 202410002;
        private const int SelfieMaxBytes = 1572864; // 1,5 MB
        public const string ServerWriteVariable = "termo_server_write";
        private const string Bloqueado = "Termo assinado não pode ser alterado nem excluído.";
        private const string SemAditivo = "O motorista ainda não tem o aditivo de assinatura eletrônica registrado.";
        private static readonly string[] Apis = { "new_EnviarTermoMulta", "new_AssinarTermoMulta", "new_ContestarTermoMulta", "new_CancelarTermoMulta", "new_ExpirarTermoMulta", "new_LembrarTermoMulta" };
        private const string NaoESeu = "Este termo não é seu.";
        private const string PrivilegioGestor = "prvCreatenew_TermoMulta";
        private const string CadastroDuplicado = "Seu cadastro está duplicado. Procure o escritório.";
        private static readonly CultureInfo PtBr = CultureInfo.GetCultureInfo("pt-BR");

        private const int PrazoAssinaturaDias = 7;
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
                if (context.MessageName == "Create") throw new InvalidPluginExecutionException("Parcela de multa só é criada pela assinatura do termo.");
                if (entity != null && Changed(entity, "new_parcelamultafolhaid").SequenceEqual(new[] { "new_status" }))
                {
                    var current = system.Retrieve(ParcelaTable, reference.Id, new ColumnSet("new_status"));
                    var next = Choice(entity, "new_status");
                    if (Choice(current, "new_status") == Prevista && (next == Descontada || next == ParcelaCancelada)) return;
                }
                throw new InvalidPluginExecutionException(Bloqueado);
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
            var multa = system.Retrieve(Multa, multaId, new ColumnSet("cr40f_novacoluna", "cr40f_dataehorario", "cr40f_localdainfracao", "cr40f_placa", "cr40f_motorista", "cr40f_codigodainfracao", "new_valorguia", "new_recursopendente"));
            var forma = InputInt(context, "new_FormaPagamento");
            if (forma != Guia && forma != Folha) throw new InvalidPluginExecutionException("Forma de pagamento inválida.");
            var parcelas = InputInt(context, "new_Parcelas");
            var valorTotal = context.InputParameters.Contains("new_ValorTotal") ? Convert.ToDecimal(context.InputParameters["new_ValorTotal"], CultureInfo.InvariantCulture) : 0m;
            var competencia = context.InputParameters.Contains("new_PrimeiraCompetencia") && context.InputParameters["new_PrimeiraCompetencia"] is DateTime c ? c : (DateTime?)null;

            var motoristaRef = multa.GetAttributeValue<EntityReference>("cr40f_motorista");
            var motorista = motoristaRef == null ? null : system.Retrieve(Funcionario, motoristaRef.Id, new ColumnSet("cr40f_nomecompleto", "cr40f_numerodocpf", "cr40f_emailmicrosoft", "new_aditivoassinaturaem", "new_aditivoassinatura"));
            var pendenteQuery = new QueryExpression(Termo) { ColumnSet = new ColumnSet("new_termomultaid"), TopCount = 1 };
            pendenteQuery.Criteria.AddCondition("new_multa", ConditionOperator.Equal, multaId);
            pendenteQuery.Criteria.AddCondition("new_status", ConditionOperator.Equal, Pendente);

            var erro = ValidarAcordo(forma, parcelas, valorTotal, competencia,
                temMotorista: motorista != null,
                temAditivo: motorista != null && TemAditivo(motorista),
                recursoPendente: multa.GetAttributeValue<bool>("new_recursopendente"),
                termoPendente: () => system.RetrieveMultiple(pendenteQuery).Entities.Count > 0);
            if (erro != null) throw new InvalidPluginExecutionException(erro);

            var primeira = DateOnly(competencia.Value);
            var plano = forma == Folha ? CalcularParcelas(valorTotal, parcelas, primeira) : new List<Parcela>();
            var texto = TextoVigente(system);
            var placa = Placa(system, multa);
            var infracao = multa.GetAttributeValue<EntityReference>("cr40f_codigodainfracao");
            var catalogo = infracao == null ? null : system.Retrieve(infracao.LogicalName, infracao.Id, new ColumnSet("cr40f_codigodainfracao", "cr40f_descricaodainfracao", "cr40f_valordamulta"));
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
                .Replace("{parcelas}", parcelas.ToString(CultureInfo.InvariantCulture));

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

        /// Espelha validarAcordo de apps/shell/src/pages/frota/domain/termoMulta.ts (mesma ordem e mensagens).
        public static string ValidarAcordo(int forma, int parcelas, decimal valorTotal, DateTime? competencia, bool temMotorista, bool temAditivo, bool recursoPendente, Func<bool> termoPendente)
        {
            if (!temMotorista) return "A multa não tem motorista indicado.";
            if (!temAditivo) return SemAditivo;
            if (termoPendente()) return "Já existe um termo pendente para esta multa.";
            if (parcelas < 1 || parcelas > 3) return "Escolha de 1 a 3 parcelas.";
            if (!competencia.HasValue || DateOnly(competencia.Value).Day != 1 || competencia.Value.TimeOfDay != TimeSpan.Zero) return "Competência inválida.";
            if (!(EmCentavos(valorTotal) >= parcelas)) return "Informe um valor maior que zero.";
            if (forma == Folha && recursoPendente) return "Há recurso pendente: o desconto só pode ser acordado depois do resultado.";
            return null;
        }

        public sealed class Parcela
        {
            public int Numero;
            public DateTime Competencia;
            public decimal Valor;
        }

        /// Espelha calcularParcelas: centavos inteiros, sobra nas primeiras, soma exata.
        public static List<Parcela> CalcularParcelas(decimal valorTotal, int parcelas, DateTime primeiraCompetencia)
        {
            var total = EmCentavos(valorTotal);
            var baseCentavos = total / parcelas;
            var sobra = total - baseCentavos * parcelas;
            return Enumerable.Range(0, parcelas).Select(i => new Parcela
            {
                Numero = i + 1,
                Competencia = primeiraCompetencia.Date.AddMonths(i),
                Valor = (baseCentavos + (i < sobra ? 1 : 0)) / 100m,
            }).ToList();
        }

        // Math.round(Number((valor * 100).toFixed(2))): toFixed arredonda meio para longe do zero; Math.round meio para cima.
        private static long EmCentavos(decimal valor) => (long)Math.Floor(Math.Round(valor * 100m, 2, MidpointRounding.AwayFromZero) + 0.5m);

        private static DateTime DateOnly(DateTime value) => new DateTime(value.Year, value.Month, value.Day, 0, 0, 0, DateTimeKind.Unspecified);

        private static bool TemAditivo(Entity funcionario) =>
            funcionario.GetAttributeValue<DateTime?>("new_aditivoassinaturaem").HasValue
            && funcionario.Contains("new_aditivoassinatura") && funcionario["new_aditivoassinatura"] != null;

        private static Entity TextoVigente(IOrganizationService system)
        {
            var query = new QueryExpression("new_textotermomulta") { ColumnSet = new ColumnSet("new_versao", "new_texto") };
            query.Criteria.AddCondition("new_tipo", ConditionOperator.Equal, TextoTipoTermo);
            query.Criteria.AddCondition("new_vigente", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var rows = system.RetrieveMultiple(query).Entities;
            if (rows.Count != 1) throw new InvalidPluginExecutionException("Cadastre exatamente um texto de termo vigente antes de enviar.");
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
            var multa = system.Retrieve(Multa, multaRef.Id, new ColumnSet("new_recursopendente"));
            var recursoPendente = multa.GetAttributeValue<bool>("new_recursopendente");
            if (forma == Folha && recursoPendente)
                throw new InvalidPluginExecutionException("Há recurso pendente: o desconto só pode ser acordado depois do resultado.");
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

            // Guia com recurso pendente: assina, mas a multa continua em Recurso.
            if (!recursoPendente) system.Update(new Entity(Multa, multaRef.Id) { ["cr40f_status"] = new OptionSetValue(MultaIndicada) });
            if (forma == Folha)
            {
                foreach (var p in plano)
                {
                    system.Create(new Entity(ParcelaTable)
                    {
                        ["new_name"] = Limit((termo.GetAttributeValue<string>("new_name") ?? "TM") + " " + p.Numero + "/" + plano.Count, 100),
                        ["new_termo"] = termo.ToEntityReference(),
                        ["new_motorista"] = motoristaRef,
                        ["new_numero"] = p.Numero,
                        ["new_competencia"] = p.Competencia,
                        ["new_valor"] = new Money(p.Valor),
                        ["new_status"] = new OptionSetValue(Prevista),
                    });
                }
            }
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
            system.Update(new Entity(Multa, multa.Id) { ["cr40f_status"] = new OptionSetValue(MultaRecurso), ["new_recursopendente"] = true });
        }

        private static void Encerrar(IPluginExecutionContext context, IOrganizationService caller, IOrganizationService system, int status, string erro, DateTime? agoraParaPrazo)
        {
            context.SharedVariables[ServerWriteVariable] = true;
            var id = InputGuid(context, "new_TermoId");
            caller.Retrieve(Termo, id, new ColumnSet("new_status"));
            var termo = system.Retrieve(Termo, id, new ColumnSet("new_status", "new_multa", "new_enviadoem"));
            if (Choice(termo, "new_status") != Pendente) throw new InvalidPluginExecutionException(erro);
            if (agoraParaPrazo.HasValue)
            {
                var enviadoEm = termo.GetAttributeValue<DateTime?>("new_enviadoem");
                if (!enviadoEm.HasValue || enviadoEm.Value.AddDays(PrazoAssinaturaDias) > agoraParaPrazo.Value)
                    throw new InvalidPluginExecutionException("Este termo ainda está no prazo de assinatura.");
            }
            system.Update(new Entity(Termo, id) { ["new_status"] = new OptionSetValue(status) });
            var multaRef = termo.GetAttributeValue<EntityReference>("new_multa");
            if (multaRef == null) return;
            var multa = system.Retrieve(Multa, multaRef.Id, new ColumnSet("new_termovigente"));
            if (multa.GetAttributeValue<EntityReference>("new_termovigente")?.Id == id)
                system.Update(new Entity(Multa, multaRef.Id) { ["new_termovigente"] = null });
        }

        private static bool EhDono(ResolvedDriver driver, EntityReference dono) =>
            driver?.EmployeeReference != null && dono != null && driver.EmployeeReference.Id == dono.Id;

        // ---------------- Lembrar / Baixar PDF / Aditivo ----------------

        private void Lembrar(IPluginExecutionContext context, IOrganizationService caller, IOrganizationService system)
        {
            context.SharedVariables[ServerWriteVariable] = true;
            var id = InputGuid(context, "new_TermoId");
            caller.Retrieve(Termo, id, new ColumnSet("new_status"));
            var termo = system.Retrieve(Termo, id, new ColumnSet("new_status", "new_ultimolembreteem"));
            if (Choice(termo, "new_status") != Pendente) throw new InvalidPluginExecutionException("Só é possível lembrar termo pendente.");
            var agora = clock();
            var ultimo = termo.GetAttributeValue<DateTime?>("new_ultimolembreteem");
            if (ultimo.HasValue && ultimo.Value.AddHours(24) > agora)
                throw new InvalidPluginExecutionException("Já foi enviado um lembrete nas últimas 24 horas.");
            // O flow "Termo de multa | Push ao motorista" dispara na alteração desta coluna.
            system.Update(new Entity(Termo, id) { ["new_ultimolembreteem"] = agora });
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

        private static void UploadPdf(IOrganizationService system, EntityReference target, string fileName, byte[] pdf)
        {
            var init = new OrganizationRequest("InitializeFileBlocksUpload");
            init["Target"] = target;
            init["FileAttributeName"] = "new_pdf";
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

        private static TimeZoneInfo SaoPaulo()
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

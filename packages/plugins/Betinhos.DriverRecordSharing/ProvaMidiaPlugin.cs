using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_ProvaMidia (unbound): prova de captura das fotos e vídeos do App Motoristas.
    // Entrada new_Command (JSON com "acao": emitir | registrar), saída new_Result (JSON com "ok").
    // A chave HMAC fica na cr40f_segredo (midia.prova-captura), lida como SYSTEM; o motorista nunca a vê.
    public sealed class ProvaMidiaPlugin : IPlugin
    {
        public const string MessageName = "new_ProvaMidia";
        public const string CommandParameter = "new_Command";
        public const string ResultParameter = "new_Result";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.MessageName != MessageName) throw new InvalidPluginExecutionException("Mensagem não suportada pela prova de mídia.");
            var command = context.InputParameters.Contains(CommandParameter) ? Convert.ToString(context.InputParameters[CommandParameter], CultureInfo.InvariantCulture) : "";

            // Serviço elevado: o motorista não tem privilégio na tabela de provas; o handler resolve o motorista pelo chamador.
            var system = factory.CreateOrganizationService(null);
            var handler = new ProvaMidiaHandler(system, context.InitiatingUserId, tracing, () => DateTime.UtcNow);
            try
            {
                context.OutputParameters[ResultParameter] = handler.Handle(command);
            }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception error)
            {
                tracing?.Trace("ProvaMidia falhou: {0}", error.GetType().Name);
                throw new InvalidPluginExecutionException("Não foi possível registrar a prova da mídia agora.", error);
            }
        }
    }

    public sealed class ProvaMidiaHandler
    {
        public const string SecretName = "midia.prova-captura";
        public const string Table = "cr40f_provamidia";
        public const string CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        public const int CodeLength = 6;

        public const string SeloSemRede = "capturada-sem-rede";
        public const string SeloInvalido = "codigo-invalido";
        public const string SeloNaoAssinado = "codigo-nao-assinado";

        // Valores das choices da migration 20261116-1400-prova-midia.ps1 (a ordem é o contrato; a fase 2 só acrescenta).
        public static readonly IReadOnlyDictionary<string, int> Telas = Options("despesa", "recebimento", "manutencao", "finalizar", "colisao", "checklist");
        public static readonly IReadOnlyDictionary<string, int> TiposMidia = Options("foto", "video");
        public static readonly IReadOnlyDictionary<string, int> Origens = Options("camera-ao-vivo", "camera-nativa");
        public static readonly IReadOnlyDictionary<string, int> EstadosLocalizacao = Options("registrada", "negada", "indisponivel");
        public static readonly IReadOnlyDictionary<string, int> Selos = Options(SeloSemRede, SeloInvalido, SeloNaoAssinado);

        private static readonly Regex TableName = new Regex("^[a-z][a-z0-9_]{0,63}$", RegexOptions.CultureInvariant);
        private static readonly Regex Sha256Hex = new Regex("^[0-9a-f]{64}$", RegexOptions.CultureInvariant);

        private readonly IOrganizationService _system;
        private readonly Guid _callerUserId;
        private readonly ITracingService _tracing;
        private readonly Func<DateTime> _utcNow;

        public ProvaMidiaHandler(IOrganizationService system, Guid callerUserId, ITracingService tracing, Func<DateTime> utcNow)
        {
            _system = system;
            _callerUserId = callerUserId;
            _tracing = tracing ?? new NullTracing();
            _utcNow = utcNow;
        }

        public string Handle(string commandJson)
        {
            try
            {
                var command = Parse(commandJson);
                switch (QrChargeRules.Str(command, "acao"))
                {
                    case "emitir": return Emit(command);
                    case "registrar": return Register(command);
                    default: throw new Refusal("Ação da prova de mídia desconhecida.");
                }
            }
            catch (Refusal refusal)
            {
                return QrChargeRules.Serialize(new Dictionary<string, object> { ["ok"] = false, ["erro"] = refusal.Message });
            }
        }

        private static Dictionary<string, object> Parse(string json)
        {
            try { return QrChargeRules.ParseJson(json ?? ""); }
            catch (Exception) { throw new Refusal("Comando da prova de mídia inválido."); }
        }

        // ---------- emitir: não grava nada; o código é sem estado e assinado ----------

        private string Emit(Dictionary<string, object> command)
        {
            var origin = Origin(command);
            var driverId = CallerDriverId();
            var code = NewCode();
            var issuedAt = Iso(_utcNow());
            var key = ReadKey();
            var signature = key == null ? null : Sign(key, driverId, origin.Screen, origin.Table, origin.RecordId, code, issuedAt);
            return QrChargeRules.Serialize(new Dictionary<string, object>
            {
                ["ok"] = true,
                ["codigo"] = code,
                ["emitidoEm"] = issuedAt,
                ["assinatura"] = signature,
                ["assinada"] = signature != null
            });
        }

        // ---------- registrar: cria a linha; código inválido nunca bloqueia ----------

        private string Register(Dictionary<string, object> command)
        {
            var origin = Origin(command);
            var link = (QrChargeRules.Str(command, "link") ?? "").Trim();
            if (link.Length > 2000 || !Uri.TryCreate(link, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) throw new Refusal("O link do arquivo precisa ser https.");
            var sha = (QrChargeRules.Str(command, "sha256") ?? "").Trim().ToLowerInvariant();
            if (!Sha256Hex.IsMatch(sha)) throw new Refusal("A impressão digital (sha256) do arquivo é inválida.");
            var mediaType = Choice(TiposMidia, command, "tipoMidia", "Tipo de mídia desconhecido.");
            var captureOrigin = Choice(Origens, command, "origemCaptura", "Origem da captura desconhecida.");
            var location = QrChargeRules.Dict(command, "localizacao");
            var locationState = Choice(EstadosLocalizacao, location, "estado", "Estado da localização desconhecido.");

            var driverId = CallerDriverId();
            var offline = Bool(command, "semRede");
            var code = Truncate(QrChargeRules.Str(command, "codigo"), 20);
            var issuedText = QrChargeRules.Str(command, "emitidoEm");
            var issuedAt = offline ? null : ParseIso(issuedText);
            var capturedAt = ParseIso(QrChargeRules.Str(command, "capturadoEm"));
            var receivedAt = DateTime.SpecifyKind(_utcNow(), DateTimeKind.Utc);

            var seals = new List<string>();
            if (offline) seals.Add(SeloSemRede);
            else
            {
                // Sem chave no ambiente = não assinado; com chave, assinatura ausente ou diferente = inválido (o app não rebaixa o selo omitindo-a).
                var signature = QrChargeRules.Str(command, "assinatura");
                var key = ReadKey();
                if (key == null) seals.Add(SeloNaoAssinado);
                else if (string.IsNullOrEmpty(signature) || !IsCode(code) || issuedText == null || !SameSignature(Sign(key, driverId, origin.Screen, origin.Table, origin.RecordId, code, issuedText), signature)) seals.Add(SeloInvalido);
            }

            // Hora "do servidor" que não confere não é gravada como tal: o atraso passa a contar da captura.
            if (seals.Contains(SeloInvalido)) issuedAt = null;
            var start = issuedAt ?? capturedAt;
            var row = new Entity(Table)
            {
                ["cr40f_name"] = Truncate((code ?? "SEM-CODIGO") + " · " + origin.Screen, 100),
                ["cr40f_motorista"] = new EntityReference(PluginConfig.EmployeeTable, driverId),
                ["cr40f_tela"] = new OptionSetValue(Telas[origin.Screen]),
                ["cr40f_tabelaorigem"] = origin.Table,
                ["cr40f_registroorigemid"] = origin.RecordId,
                ["cr40f_link"] = link,
                ["cr40f_tipomidia"] = new OptionSetValue(mediaType),
                ["cr40f_tamanhobytes"] = ClampInt(QrChargeRules.Long(command, "tamanhoBytes")),
                ["cr40f_duracaosegundos"] = Decimal(command, "duracaoSegundos", 0m, 100000m, 1),
                ["cr40f_sha256"] = sha,
                ["cr40f_origemcaptura"] = new OptionSetValue(captureOrigin),
                ["cr40f_codigo"] = code,
                ["cr40f_emitidoem"] = issuedAt,
                ["cr40f_capturadoem"] = capturedAt,
                ["cr40f_recebidoem"] = receivedAt,
                ["cr40f_atrasominutos"] = start.HasValue ? (int?)Math.Round((receivedAt - start.Value).TotalMinutes) : null,
                ["cr40f_estadolocalizacao"] = new OptionSetValue(locationState)
            };
            if (locationState == EstadosLocalizacao["registrada"])
            {
                row["cr40f_latitude"] = Decimal(location, "latitude", -90m, 90m, 7);
                row["cr40f_longitude"] = Decimal(location, "longitude", -180m, 180m, 7);
                row["cr40f_precisaometros"] = Decimal(location, "precisaoMetros", 0m, 1000000m, 1);
            }
            if (seals.Count > 0) row["cr40f_selos"] = new OptionSetValueCollection(seals.Select(seal => new OptionSetValue(Selos[seal])).ToList());

            var id = _system.Create(row);
            _tracing.Trace("ProvaMidia registrada tela={0} selos={1}", origin.Screen, seals.Count == 0 ? "-" : string.Join(",", seals));
            return QrChargeRules.Serialize(new Dictionary<string, object> { ["ok"] = true, ["provaId"] = id.ToString("D"), ["selos"] = seals });
        }

        // ---------- regras ----------

        public static string Sign(string key, Guid driverId, string screen, string table, string recordId, string code, string issuedAt)
        {
            var payload = string.Join("|", driverId.ToString("D"), screen, table, recordId, code, issuedAt);
            using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(key)))
            {
                return Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload))).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            }
        }

        private static bool SameSignature(string expected, string actual) =>
            ComunicadoCommandPlugin.ConstantTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(actual));

        private static bool IsCode(string code) => code != null && code.Length == CodeLength && code.All(letter => CodeAlphabet.IndexOf(letter) >= 0);

        private static string NewCode()
        {
            var chars = new char[CodeLength];
            var buffer = new byte[1];
            using (var rng = RandomNumberGenerator.Create())
            {
                for (var i = 0; i < CodeLength;)
                {
                    rng.GetBytes(buffer);
                    // Rejeita o resto da divisão para não enviesar o alfabeto de 31 letras.
                    if (buffer[0] >= 248) continue;
                    chars[i++] = CodeAlphabet[buffer[0] % CodeAlphabet.Length];
                }
            }
            return new string(chars);
        }

        private string ReadKey() => SecretReader.ReadTableOrSecureConfig(_system, SecretName, null, _tracing);

        private Guid CallerDriverId()
        {
            var driver = new DriverResolver(_system, _tracing).ResolveFromUser(new EntityReference(PluginConfig.UserTable, _callerUserId));
            if (driver?.EmployeeReference == null) throw new Refusal("Seu usuário não está vinculado a um motorista ativo.");
            return driver.EmployeeReference.Id;
        }

        private static OriginRecord Origin(Dictionary<string, object> command)
        {
            var screen = QrChargeRules.Str(command, "tela");
            if (screen == null || !Telas.ContainsKey(screen)) throw new Refusal("Tela desconhecida para a prova de mídia.");
            var table = (QrChargeRules.Str(command, "tabela") ?? "").Trim();
            if (!TableName.IsMatch(table)) throw new Refusal("Tabela de origem inválida.");
            var recordId = (QrChargeRules.Str(command, "registroId") ?? "").Trim();
            if (recordId.Length == 0 || recordId.Length > 100) throw new Refusal("Registro de origem inválido.");
            return new OriginRecord(screen, table, recordId);
        }

        private static int Choice(IReadOnlyDictionary<string, int> options, Dictionary<string, object> source, string key, string message)
        {
            var value = QrChargeRules.Str(source, key);
            if (value == null || !options.TryGetValue(value, out var option)) throw new Refusal(message);
            return option;
        }

        private static IReadOnlyDictionary<string, int> Options(params string[] names) =>
            names.Select((name, index) => new { name, value = 100000000 + index }).ToDictionary(pair => pair.name, pair => pair.value, StringComparer.Ordinal);

        private static bool Bool(Dictionary<string, object> source, string key) =>
            source != null && source.TryGetValue(key, out var value) && value is bool flag && flag;

        private static decimal? Decimal(Dictionary<string, object> source, string key, decimal min, decimal max, int digits)
        {
            if (source == null || !source.TryGetValue(key, out var value) || value == null || value is string) return null;
            try
            {
                var number = Convert.ToDecimal(value, CultureInfo.InvariantCulture);
                return number < min || number > max ? (decimal?)null : Math.Round(number, digits);
            }
            catch (Exception) { return null; }
        }

        private static int? ClampInt(long? value) => value.HasValue && value.Value >= 0 ? (int?)Math.Min(value.Value, int.MaxValue) : null;

        // Hora declarada pelo celular: fora de 2000..2100 vira vazio (o Dataverse recusa antes de 1753 e o atraso em minutos estoura o int).
        private static readonly DateTime MinDeclared = new DateTime(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        private static readonly DateTime MaxDeclared = new DateTime(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        private static DateTime? ParseIso(string text)
        {
            if (!DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var value)) return null;
            var utc = DateTime.SpecifyKind(value, DateTimeKind.Utc);
            return utc < MinDeclared || utc > MaxDeclared ? (DateTime?)null : utc;
        }

        private static string Iso(DateTime utc) =>
            DateTime.SpecifyKind(utc, DateTimeKind.Utc).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

        private static string Truncate(string value, int max)
        {
            var text = value?.Trim();
            if (string.IsNullOrEmpty(text)) return null;
            return text.Length <= max ? text : text.Substring(0, max);
        }

        private sealed class OriginRecord
        {
            public OriginRecord(string screen, string table, string recordId) { Screen = screen; Table = table; RecordId = recordId; }
            public string Screen { get; }
            public string Table { get; }
            public string RecordId { get; }
        }

        private sealed class Refusal : Exception
        {
            public Refusal(string message) : base(message) { }
        }

        private sealed class NullTracing : ITracingService
        {
            public void Trace(string format, params object[] args) { }
        }
    }
}

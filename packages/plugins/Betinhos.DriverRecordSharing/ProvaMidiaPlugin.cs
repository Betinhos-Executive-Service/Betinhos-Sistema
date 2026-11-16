using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_ProvaMidia (unbound): prova de captura das fotos e vídeos do App Motoristas.
    // Entrada new_Command (JSON com "acao": emitir | conferir | registrar), saída new_Result (JSON com "ok").
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
        public const string SeloForaDaJanela = "fora-da-janela";
        public const string SeloSemData = "sem-data";
        public const string SeloRepetida = "repetida";
        public const string SeloParecida = "parecida";

        public const string ModoVariavel = "cr40f_ProvaMidiaModoRepetida";
        public const string Livre = "livre";
        public const string Repetida = "repetida";
        public const string ParecidaEmObservacao = "parecida-em-observacao";

        private static readonly TimeSpan AntesDaReferencia = TimeSpan.FromHours(24);
        private static readonly TimeSpan ToleranciaRelogio = TimeSpan.FromMinutes(10);

        // Data de referência da janela do evento, lida do registro de origem pelo id real (que o app manda no registrar assim
        // que o registro existe; a data declarada é ignorada). Id provisório "novo-..." (prova pendente antiga) usa a data
        // declarada pelo app. Despesa e devolução: data do gasto; manutenção e finalizar: abertura; colisão: data da colisão;
        // recebimento: data do serviço.
        public static readonly IReadOnlyDictionary<string, string> ColunaReferencia = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["cr40f_despesaoperacional"] = "cr40f_datagasto",
            ["cr40f_manutencoes"] = "createdon",
            ["cr40f_colisao_v2"] = "cr40f_datahora",
            ["cr40f_reservadeveculos"] = "cr40f_dataehorriodesada"
        };

        // Lookups da prova para os subgrids nativos de manutenção e colisão (só com id real).
        public static readonly IReadOnlyDictionary<string, string> LookupDaOrigem = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["cr40f_manutencoes"] = "cr40f_manutencao",
            ["cr40f_colisao_v2"] = "cr40f_colisao"
        };

        // Valores das choices das migrations 20261116-1400-prova-midia.ps1 e 20261116-1800-prova-midia-galeria.ps1
        // (a ordem é o contrato; cada fase só acrescenta no fim).
        public static readonly IReadOnlyDictionary<string, int> Telas = Options("despesa", "recebimento", "manutencao", "finalizar", "colisao", "checklist", "devolucao");
        public static readonly IReadOnlyDictionary<string, int> TiposMidia = Options("foto", "video", "pdf");
        public static readonly IReadOnlyDictionary<string, int> Origens = Options("camera-ao-vivo", "camera-nativa", "galeria");
        public static readonly IReadOnlyDictionary<string, int> EstadosLocalizacao = Options("registrada", "negada", "indisponivel");
        public static readonly IReadOnlyDictionary<string, int> Selos = Options(SeloSemRede, SeloInvalido, SeloNaoAssinado, SeloForaDaJanela, SeloSemData, SeloRepetida, SeloParecida);

        // Colunas do dHash: [0] imagem original (antes de carimbo e redução), [1] imagem final da câmera do app (com carimbo).
        public static readonly string[] ColunasDHash = { "cr40f_dhash", "cr40f_dhashcarimbo" };
        public static string ColunaFaixa(int slot, int faixa) => ColunasDHash[slot] + "faixa" + (faixa + 1).ToString(CultureInfo.InvariantCulture);

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
                    case "conferir": return Check(command);
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

        // ---------- conferir: antes do envio; só a repetida bloqueia, e sem dizer de quem nem onde ----------

        private string Check(Dictionary<string, object> command)
        {
            var origin = Origin(command);
            var driverId = CallerDriverId();
            var sha = Sha(command, "sha256", required: true);
            var hashes = DHashes(command);
            var found = FindDuplicate(origin, driverId, new[] { sha }, hashes);
            var mode = Mode();
            var blocked = found.Exact || (found.Similar && mode == ProvaMidiaRepetida.ModoBloquear);
            var result = blocked ? Repetida : found.Similar ? ParecidaEmObservacao : Livre;
            _tracing.Trace("ProvaMidia conferir tela={0} resultado={1} modo={2}", origin.Screen, result, mode);
            var response = new Dictionary<string, object> { ["ok"] = true, ["resultado"] = result };
            if (blocked && found.UsedAt.HasValue) response["usadaEm"] = Iso(found.UsedAt.Value);
            return QrChargeRules.Serialize(response);
        }

        private string Mode() => ProvaMidiaRepetida.Modo(EnvironmentVariables.Read(_system, ModoVariavel));

        private sealed class Duplicate
        {
            public bool Exact;
            public bool Similar;
            public DateTime? UsedAt;
        }

        private static readonly string[] ColunasBusca = new[] { "cr40f_sha256", "cr40f_sha256original", "cr40f_tabelaorigem", "cr40f_registroorigemid", "cr40f_sessaoid", "cr40f_motorista", "cr40f_recebidoem" }.Concat(ColunasDHash).ToArray();

        // SHA-256 igual (do arquivo enviado ou do original) ou dHash a até 3 bits, nos últimos 12 meses, fora do mesmo registro.
        // Duas consultas: a do SHA (igualdade exata, sempre conferida, poucas linhas) e a das faixas, só com dHash de entropia
        // normal (foto escura, estourada ou tampada fica só com o SHA) e com teto de PaginasMaximas x LinhasPorPagina linhas,
        // registrado no trace. A distância é calculada aqui.
        private Duplicate FindDuplicate(OriginRecord origin, Guid driverId, IEnumerable<string> shas, IList<ulong> hashes)
        {
            var shaList = shas.Where(sha => sha != null).Distinct().Cast<object>().ToArray();
            var result = new Duplicate();
            DateTime? exactAt = null, similarAt = null;

            var bySha = new FilterExpression(LogicalOperator.Or);
            foreach (var column in new[] { "cr40f_sha256", "cr40f_sha256original" }) bySha.AddCondition(column, ConditionOperator.In, shaList);
            foreach (var row in _system.RetrieveMultiple(Recent(bySha)).Entities)
            {
                if (SameRecord(row, origin, driverId)) continue;
                result.Exact = true;
                exactAt = Earliest(exactAt, row.GetAttributeValue<DateTime?>("cr40f_recebidoem"));
            }

            var searchable = hashes.Where(hash => !ProvaMidiaRepetida.BaixaEntropia(hash)).ToList();
            if (searchable.Count < hashes.Count) _tracing.Trace("ProvaMidia dhash de baixa entropia fora da busca: {0}", hashes.Count - searchable.Count);
            if (searchable.Count > 0)
            {
                var byBand = new FilterExpression(LogicalOperator.Or);
                for (var band = 0; band < ProvaMidiaRepetida.Faixas; band++)
                {
                    var values = searchable.Select(hash => (object)ProvaMidiaRepetida.Faixa(hash, band)).Distinct().ToArray();
                    for (var slot = 0; slot < ColunasDHash.Length; slot++) byBand.AddCondition(ColunaFaixa(slot, band), ConditionOperator.In, values);
                }
                var query = Recent(byBand);
                var read = 0;
                var capped = false;
                string cookie = null;
                for (var page = 1; ; page++)
                {
                    query.PageInfo = new PagingInfo { Count = ProvaMidiaRepetida.LinhasPorPagina, PageNumber = page, PagingCookie = cookie };
                    var batch = _system.RetrieveMultiple(query);
                    foreach (var row in batch.Entities)
                    {
                        read++;
                        if (SameRecord(row, origin, driverId)) continue;
                        var stored = ColunasDHash.Select(row.GetAttributeValue<string>).Where(ProvaMidiaRepetida.IsDHash).Select(ProvaMidiaRepetida.Parse).Where(hash => !ProvaMidiaRepetida.BaixaEntropia(hash));
                        if (ProvaMidiaRepetida.MenorDistancia(searchable, stored) > ProvaMidiaRepetida.LimiteParecida) continue;
                        result.Similar = true;
                        similarAt = Earliest(similarAt, row.GetAttributeValue<DateTime?>("cr40f_recebidoem"));
                    }
                    if (!batch.MoreRecords) break;
                    if (page >= ProvaMidiaRepetida.PaginasMaximas) { capped = true; break; }
                    cookie = batch.PagingCookie;
                }
                _tracing.Trace("ProvaMidia faixas linhas={0} teto={1}", read, capped ? "atingido" : "nao");
            }
            result.UsedAt = result.Exact ? exactAt : similarAt;
            return result;
        }

        private QueryExpression Recent(FilterExpression any)
        {
            var query = new QueryExpression(Table) { ColumnSet = new ColumnSet(ColunasBusca) };
            query.Criteria.AddCondition("cr40f_recebidoem", ConditionOperator.GreaterThan, _utcNow().AddMonths(-ProvaMidiaRepetida.MesesConsiderados));
            query.Criteria.AddFilter(any);
            return query;
        }

        // Mesmo registro: tabela igual e o id real ou o da sessão (rascunho de registro novo, antes de existir o id real)
        // iguais. A sessão é um id do aparelho, então só vale para o mesmo motorista.
        private static bool SameRecord(Entity row, OriginRecord origin, Guid driverId)
        {
            if (!string.Equals(row.GetAttributeValue<string>("cr40f_tabelaorigem"), origin.Table, StringComparison.Ordinal)) return false;
            if (origin.Ids.Contains(row.GetAttributeValue<string>("cr40f_registroorigemid") ?? "", StringComparer.OrdinalIgnoreCase)) return true;
            var session = row.GetAttributeValue<string>("cr40f_sessaoid");
            return session != null && origin.Ids.Contains(session, StringComparer.OrdinalIgnoreCase)
                && row.GetAttributeValue<EntityReference>("cr40f_motorista")?.Id == driverId;
        }

        private static DateTime? Earliest(DateTime? current, DateTime? candidate) =>
            !candidate.HasValue ? current : !current.HasValue || candidate.Value < current.Value ? candidate : current;

        // ---------- registrar: cria a linha; código inválido nunca bloqueia ----------

        private string Register(Dictionary<string, object> command)
        {
            var origin = Origin(command);
            var link = (QrChargeRules.Str(command, "link") ?? "").Trim();
            if (link.Length > 2000 || !Uri.TryCreate(link, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) throw new Refusal("O link do arquivo precisa ser https.");
            var sha = Sha(command, "sha256", required: true);
            var originalSha = Sha(command, "sha256Original", required: false);
            var hashes = DHashes(command);
            var mediaType = Choice(TiposMidia, command, "tipoMidia", "Tipo de mídia desconhecido.");
            var captureOrigin = Choice(Origens, command, "origemCaptura", "Origem da captura desconhecida.");
            var location = QrChargeRules.Dict(command, "localizacao");
            var locationState = Choice(EstadosLocalizacao, location, "estado", "Estado da localização desconhecido.");

            var driverId = CallerDriverId();
            // Idempotência: o mesmo idCliente (resposta perdida e reenvio) devolve a prova já gravada sem criar outra.
            var clientId = ClientId(command);
            var existing = clientId == null ? null : ExistingProof(clientId, driverId);
            if (existing != null) return existing;
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
                else if (string.IsNullOrEmpty(signature) || !IsCode(code) || issuedText == null || !SameSignature(Sign(key, driverId, origin.Screen, origin.Table, origin.SignedRecordId, code, issuedText), signature)) seals.Add(SeloInvalido);
            }

            var metadata = QrChargeRules.Dict(command, "metadados");
            var recordedAt = ParseIsoOffset(QrChargeRules.Str(metadata, "dataGravada"));
            if (captureOrigin == Origens["galeria"] && mediaType != TiposMidia["pdf"])
            {
                // A data gravada no arquivo nunca bloqueia: vira selo, recalculado aqui com a referência do registro.
                var reference = ReadReference(origin) ?? ParseIsoOffset(QrChargeRules.Str(command, "dataReferencia"));
                if (!recordedAt.HasValue) seals.Add(SeloSemData);
                else if ((reference.HasValue && recordedAt.Value < reference.Value - AntesDaReferencia) || recordedAt.Value > receivedAt + ToleranciaRelogio) seals.Add(SeloForaDaJanela);
            }
            // Recheca a repetida: quem pulou o conferir já subiu o arquivo, então a prova só ganha o selo.
            var duplicate = FindDuplicate(origin, driverId, new[] { sha, originalSha }, hashes);
            if (duplicate.Exact || (duplicate.Similar && Mode() == ProvaMidiaRepetida.ModoBloquear)) seals.Add(SeloRepetida);
            else if (duplicate.Similar) seals.Add(SeloParecida);

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
                ["cr40f_sessaoid"] = origin.SessionId,
                ["cr40f_idcliente"] = clientId,
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
            if (originalSha != null && originalSha != sha) row["cr40f_sha256original"] = originalSha;
            for (var slot = 0; slot < hashes.Count; slot++)
            {
                row[ColunasDHash[slot]] = hashes[slot].ToString("x16", CultureInfo.InvariantCulture);
                // dHash de baixa entropia não ganha faixas: senão toda foto escura casaria na busca das outras.
                if (ProvaMidiaRepetida.BaixaEntropia(hashes[slot])) continue;
                for (var band = 0; band < ProvaMidiaRepetida.Faixas; band++) row[ColunaFaixa(slot, band)] = ProvaMidiaRepetida.Faixa(hashes[slot], band);
            }
            var pages = QrChargeRules.Long(command, "paginas");
            if (mediaType == TiposMidia["pdf"] && pages.HasValue && pages.Value > 0 && pages.Value <= 1000) row["cr40f_paginas"] = (int)pages.Value;
            if (metadata != null)
            {
                row["cr40f_datagravada"] = recordedAt;
                row["cr40f_fusogravado"] = Truncate(QrChargeRules.Str(metadata, "offset"), 10);
                row["cr40f_marca"] = Truncate(QrChargeRules.Str(metadata, "marca"), 100);
                row["cr40f_modelo"] = Truncate(QrChargeRules.Str(metadata, "modelo"), 100);
                row["cr40f_software"] = Truncate(QrChargeRules.Str(metadata, "software"), 100);
            }
            if (LookupDaOrigem.TryGetValue(origin.Table, out var lookup) && Guid.TryParse(origin.RecordId, out var recordGuid))
                row[lookup] = new EntityReference(origin.Table, recordGuid);
            if (seals.Count > 0) row["cr40f_selos"] = new OptionSetValueCollection(seals.Select(seal => new OptionSetValue(Selos[seal])).ToList());

            var id = _system.Create(row);
            _tracing.Trace("ProvaMidia registrada tela={0} selos={1}", origin.Screen, seals.Count == 0 ? "-" : string.Join(",", seals));
            return QrChargeRules.Serialize(new Dictionary<string, object> { ["ok"] = true, ["provaId"] = id.ToString("D"), ["selos"] = seals });
        }

        private string ExistingProof(string clientId, Guid driverId)
        {
            var query = new QueryExpression(Table) { ColumnSet = new ColumnSet("cr40f_selos"), TopCount = 1 };
            query.Criteria.AddCondition("cr40f_idcliente", ConditionOperator.Equal, clientId);
            query.Criteria.AddCondition("cr40f_motorista", ConditionOperator.Equal, driverId);
            var row = _system.RetrieveMultiple(query).Entities.FirstOrDefault();
            if (row == null) return null;
            var names = Selos.ToDictionary(pair => pair.Value, pair => pair.Key);
            var seals = (row.GetAttributeValue<OptionSetValueCollection>("cr40f_selos") ?? new OptionSetValueCollection())
                .Where(option => names.ContainsKey(option.Value)).Select(option => names[option.Value]).ToList();
            _tracing.Trace("ProvaMidia registrar repetido: devolvida a prova existente");
            return QrChargeRules.Serialize(new Dictionary<string, object> { ["ok"] = true, ["provaId"] = row.Id.ToString("D"), ["selos"] = seals });
        }

        private static readonly Regex ClientIdFormat = new Regex("^[A-Za-z0-9-]{1,100}$", RegexOptions.CultureInvariant);

        // Opcional (o app da fase 1 não manda): uuid gerado pelo app por prova e guardado na fila de pendentes.
        private static string ClientId(Dictionary<string, object> command)
        {
            var text = (QrChargeRules.Str(command, "idCliente") ?? "").Trim();
            if (text.Length == 0) return null;
            if (!ClientIdFormat.IsMatch(text)) throw new Refusal("Identificador da prova (idCliente) inválido.");
            return text;
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

        private static string Sha(Dictionary<string, object> command, string key, bool required)
        {
            var sha = (QrChargeRules.Str(command, key) ?? "").Trim().ToLowerInvariant();
            if (sha.Length == 0 && !required) return null;
            if (!Sha256Hex.IsMatch(sha)) throw new Refusal("A impressão digital (sha256) do arquivo é inválida.");
            return sha;
        }

        // Até dois dHash: [0] original, [1] final com carimbo (câmera do app). Lista vazia = vídeo ou PDF.
        private static IList<ulong> DHashes(Dictionary<string, object> command)
        {
            var hashes = new List<ulong>();
            if (command == null || !command.TryGetValue("dhashes", out var raw) || raw == null) return hashes;
            if (!(raw is System.Collections.IEnumerable items) || raw is string) throw new Refusal("Impressão visual (dhash) inválida.");
            foreach (var item in items)
            {
                var text = (item as string ?? "").Trim().ToLowerInvariant();
                if (!ProvaMidiaRepetida.IsDHash(text) || hashes.Count == ColunasDHash.Length) throw new Refusal("Impressão visual (dhash) inválida.");
                hashes.Add(ProvaMidiaRepetida.Parse(text));
            }
            return hashes;
        }

        private DateTime? ReadReference(OriginRecord origin)
        {
            if (!ColunaReferencia.TryGetValue(origin.Table, out var column) || !Guid.TryParse(origin.RecordId, out var id)) return null;
            try
            {
                var value = _system.Retrieve(origin.Table, id, new ColumnSet(column)).GetAttributeValue<DateTime?>(column);
                return value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : (DateTime?)null;
            }
            catch (Exception error)
            {
                // Registro apagado ou sem acesso: a janela usa a data declarada pelo app.
                _tracing.Trace("ProvaMidia referencia indisponivel tabela={0}: {1}", origin.Table, error.GetType().Name);
                return null;
            }
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
            // sessaoId: id com que a câmera foi aberta (assinado no emitir) quando o registrar já leva o id real do registro novo.
            var session = (QrChargeRules.Str(command, "sessaoId") ?? "").Trim();
            if (session.Length > 100) throw new Refusal("Sessão da prova inválida.");
            return new OriginRecord(screen, table, recordId, session.Length == 0 || string.Equals(session, recordId, StringComparison.OrdinalIgnoreCase) ? null : session);
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

        // Data com fuso (ex.: data gravada no EXIF com OffsetTimeOriginal); sem fuso, vale como UTC.
        private static DateTime? ParseIsoOffset(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return null;
            if (!DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var value)) return null;
            var utc = DateTime.SpecifyKind(value.UtcDateTime, DateTimeKind.Utc);
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
            public OriginRecord(string screen, string table, string recordId, string sessionId = null)
            {
                Screen = screen; Table = table; RecordId = recordId; SessionId = sessionId;
                Ids = sessionId == null ? new[] { recordId } : new[] { recordId, sessionId };
            }
            public string Screen { get; }
            public string Table { get; }
            public string RecordId { get; }
            /// <summary>Id da sessão da câmera, quando diferente do id real; null nos demais casos.</summary>
            public string SessionId { get; }
            /// <summary>Id assinado no emitir: o da sessão, se houver.</summary>
            public string SignedRecordId => SessionId ?? RecordId;
            public string[] Ids { get; }
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

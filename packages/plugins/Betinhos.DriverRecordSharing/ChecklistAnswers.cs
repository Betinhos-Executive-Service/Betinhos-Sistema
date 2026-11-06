using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Itens copiados do modelo no momento da solicitação e respostas enviadas pelo App Motoristas.
    public sealed class ChecklistItem
    {
        public string Chave;
        public int Ordem;
        public string Rotulo;
        public string Instrucao;
        public string Tipo;
        public bool Obrigatorio;
        public string Unidade;
        public List<string> OpcoesProblema = new List<string>();
    }

    public sealed class ChecklistPhoto
    {
        public string Link;
        public string Caminho;
        public string NomeArquivo;
    }

    public sealed class ChecklistAnswer
    {
        public string Chave;
        public string Rotulo;
        public string Tipo;
        public string Valor;
        public List<ChecklistPhoto> Fotos = new List<ChecklistPhoto>();
        public List<string> Problemas = new List<string>();
        public string Observacao = "";
    }

    public static class ChecklistAnswers
    {
        public const string Foto = "foto";
        public const string Numero = "numero";
        public const string Texto = "texto";
        public const string OkNok = "okNok";
        public const int MaxPhotosPerItem = 5;
        public const int MaxProblems = 10;
        public const int MaxObservationLength = 500;
        public const int MaxTextLength = 2000;
        public const int MaxItems = 60;

        public static readonly string[] DefaultProblemOptions = { "Arranhado", "Amassado", "Trincado", "Quebrado", "Faltando", "Sujo", "Outro" };

        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 1000000 };

        public static string TipoFromChoice(int value)
        {
            switch (value)
            {
                case 100000000: return Foto;
                case 100000001: return Numero;
                case 100000002: return Texto;
                case 100000003: return OkNok;
                default: throw new InvalidPluginExecutionException("Tipo de item do checklist inválido.");
            }
        }

        public static List<string> ParseProblemOptions(string raw)
        {
            var options = (raw ?? "").Split('\n')
                .Select(line => line.Trim())
                .Where(line => line.Length > 0)
                .Select(line => Limit(line, 40))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(12)
                .ToList();
            return options.Count > 0 ? options : DefaultProblemOptions.ToList();
        }

        public static int CountProblems(IEnumerable<ChecklistAnswer> answers) => answers.Count(answer => answer.Tipo == OkNok && answer.Valor == "nok");

        public static string SerializeItems(IEnumerable<ChecklistItem> items)
        {
            return Json.Serialize(items.Select(item => new Dictionary<string, object>
            {
                ["chave"] = item.Chave,
                ["ordem"] = item.Ordem,
                ["rotulo"] = item.Rotulo,
                ["instrucao"] = item.Instrucao ?? "",
                ["tipo"] = item.Tipo,
                ["obrigatorio"] = item.Obrigatorio,
                ["unidade"] = item.Unidade ?? "",
                ["opcoesProblema"] = item.Tipo == OkNok ? item.OpcoesProblema : new List<string>()
            }).ToList());
        }

        public static List<ChecklistItem> ParseItems(string json)
        {
            var rows = ParseArray(json, "Itens do checklist inválidos.");
            var items = new List<ChecklistItem>();
            foreach (var row in rows)
            {
                var map = row as Dictionary<string, object>;
                if (map == null) throw new InvalidPluginExecutionException("Itens do checklist inválidos.");
                var item = new ChecklistItem
                {
                    Chave = Text(map, "chave"),
                    Ordem = Convert.ToInt32(map.ContainsKey("ordem") ? map["ordem"] : 0, CultureInfo.InvariantCulture),
                    Rotulo = Text(map, "rotulo"),
                    Instrucao = Text(map, "instrucao"),
                    Tipo = Text(map, "tipo"),
                    Obrigatorio = map.ContainsKey("obrigatorio") && map["obrigatorio"] is bool required && required,
                    Unidade = Text(map, "unidade")
                };
                item.OpcoesProblema = item.Tipo == OkNok ? StringList(map, "opcoesProblema", DefaultProblemOptions) : new List<string>();
                items.Add(item);
            }
            if (items.Count == 0 || items.Count > MaxItems || items.Any(item => item.Chave.Length == 0))
                throw new InvalidPluginExecutionException("Itens do checklist inválidos.");
            return items;
        }

        // Valida as respostas contra os itens copiados do modelo. Não há reprovação: só formato e obrigatoriedade.
        public static List<ChecklistAnswer> Validate(string itemsJson, string answersJson)
        {
            var items = ParseItems(itemsJson);
            if (string.IsNullOrWhiteSpace(answersJson) || answersJson.Length > 200000)
                throw new InvalidPluginExecutionException("Respostas do checklist inválidas.");
            var rows = ParseArray(answersJson, "Respostas do checklist inválidas.");
            var byKey = new Dictionary<string, Dictionary<string, object>>(StringComparer.Ordinal);
            foreach (var row in rows)
            {
                var map = row as Dictionary<string, object>;
                var key = map == null ? "" : Text(map, "chave");
                if (key.Length == 0 || byKey.ContainsKey(key))
                    throw new InvalidPluginExecutionException("Respostas do checklist inválidas.");
                if (!items.Any(item => item.Chave == key))
                    throw new InvalidPluginExecutionException("Resposta para item que não pertence a este checklist.");
                byKey[key] = map;
            }

            var result = new List<ChecklistAnswer>();
            foreach (var item in items.OrderBy(entry => entry.Ordem))
            {
                byKey.TryGetValue(item.Chave, out var map);
                var answer = new ChecklistAnswer { Chave = item.Chave, Rotulo = item.Rotulo, Tipo = item.Tipo, Valor = "" };
                switch (item.Tipo)
                {
                    case Foto:
                        answer.Fotos = Photos(map, item);
                        if (item.Obrigatorio && answer.Fotos.Count == 0)
                            throw new InvalidPluginExecutionException("Envie a foto: " + item.Rotulo + ".");
                        break;
                    case Numero:
                        answer.Valor = NumberValue(map, item);
                        if (item.Obrigatorio && answer.Valor.Length == 0)
                            throw new InvalidPluginExecutionException("Informe: " + item.Rotulo + ".");
                        break;
                    case Texto:
                        answer.Valor = map == null ? "" : Text(map, "valor").Trim();
                        if (answer.Valor.Length > MaxTextLength)
                            throw new InvalidPluginExecutionException("Texto grande demais em: " + item.Rotulo + ".");
                        if (item.Obrigatorio && answer.Valor.Length == 0)
                            throw new InvalidPluginExecutionException("Preencha: " + item.Rotulo + ".");
                        break;
                    case OkNok:
                        answer.Valor = map == null ? "" : Text(map, "valor").Trim();
                        if (answer.Valor.Length == 0)
                        {
                            if (item.Obrigatorio) throw new InvalidPluginExecutionException("Escolha OK ou Não OK: " + item.Rotulo + ".");
                            break;
                        }
                        if (answer.Valor != "ok" && answer.Valor != "nok")
                            throw new InvalidPluginExecutionException("Resposta inválida em: " + item.Rotulo + ".");
                        if (answer.Valor == "ok") break; // OK descarta fotos, problemas e observação enviados por engano.
                        answer.Fotos = Photos(map, item);
                        if (answer.Fotos.Count == 0) throw new InvalidPluginExecutionException("Tire a foto do problema: " + item.Rotulo + ".");
                        answer.Problemas = StringList(map, "problemas", null).Distinct(StringComparer.Ordinal).ToList();
                        if (answer.Problemas.Count == 0) throw new InvalidPluginExecutionException("Escolha o problema: " + item.Rotulo + ".");
                        if (answer.Problemas.Count > MaxProblems || answer.Problemas.Any(p => !item.OpcoesProblema.Contains(p, StringComparer.Ordinal)))
                            throw new InvalidPluginExecutionException("Problema inválido em: " + item.Rotulo + ".");
                        answer.Observacao = Text(map, "observacao").Trim();
                        if (answer.Observacao.Length > MaxObservationLength)
                            throw new InvalidPluginExecutionException("Observação grande demais em: " + item.Rotulo + ".");
                        break;
                    default:
                        throw new InvalidPluginExecutionException("Tipo de item do checklist inválido.");
                }
                result.Add(answer);
            }
            return result;
        }

        public static string SerializeAnswers(IEnumerable<ChecklistAnswer> answers)
        {
            return Json.Serialize(answers.Select(answer => new Dictionary<string, object>
            {
                ["chave"] = answer.Chave,
                ["rotulo"] = answer.Rotulo,
                ["tipo"] = answer.Tipo,
                ["valor"] = answer.Valor,
                ["problemas"] = answer.Problemas,
                ["observacao"] = answer.Observacao,
                ["fotos"] = answer.Fotos.Select(photo => new Dictionary<string, object>
                {
                    ["link"] = photo.Link,
                    ["caminho"] = photo.Caminho,
                    ["nomeArquivo"] = photo.NomeArquivo
                }).ToList()
            }).ToList());
        }

        private static List<ChecklistPhoto> Photos(Dictionary<string, object> map, ChecklistItem item)
        {
            var photos = new List<ChecklistPhoto>();
            if (map == null || !map.ContainsKey("fotos") || map["fotos"] == null) return photos;
            var rows = map["fotos"] as object[];
            if (rows == null || rows.Length > MaxPhotosPerItem)
                throw new InvalidPluginExecutionException("Fotos inválidas em: " + item.Rotulo + ".");
            foreach (var row in rows)
            {
                var photo = row as Dictionary<string, object>;
                var link = photo == null ? "" : Text(photo, "link").Trim();
                if (!link.StartsWith("https://", StringComparison.OrdinalIgnoreCase) || link.Length > 2000)
                    throw new InvalidPluginExecutionException("Foto sem link válido em: " + item.Rotulo + ".");
                photos.Add(new ChecklistPhoto
                {
                    Link = link,
                    Caminho = Limit(Text(photo, "caminho"), 500),
                    NomeArquivo = Limit(Text(photo, "nomeArquivo"), 255)
                });
            }
            return photos;
        }

        private static string NumberValue(Dictionary<string, object> map, ChecklistItem item)
        {
            if (map == null || !map.ContainsKey("valor") || map["valor"] == null) return "";
            var raw = Convert.ToString(map["valor"], CultureInfo.InvariantCulture).Trim();
            if (raw.Length == 0) return "";
            if (!decimal.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) || number < 0 || number > 10000000m)
                throw new InvalidPluginExecutionException("Número inválido em: " + item.Rotulo + ".");
            return number.ToString(CultureInfo.InvariantCulture);
        }

        private static List<string> StringList(Dictionary<string, object> map, string key, IEnumerable<string> fallback)
        {
            var rows = map != null && map.ContainsKey(key) ? map[key] as object[] ?? (map[key] as System.Collections.ArrayList)?.ToArray() : null;
            var list = rows == null ? new List<string>() : rows.Select(row => Convert.ToString(row, CultureInfo.InvariantCulture)?.Trim() ?? "").Where(row => row.Length > 0).ToList();
            return list.Count > 0 || fallback == null ? list : fallback.ToList();
        }

        private static object[] ParseArray(string json, string message)
        {
            object parsed;
            try { parsed = Json.DeserializeObject(json ?? ""); }
            catch { throw new InvalidPluginExecutionException(message); }
            if (parsed is object[] array) return array;
            if (parsed is System.Collections.ArrayList list) return list.ToArray();
            throw new InvalidPluginExecutionException(message);
        }

        private static string Text(Dictionary<string, object> map, string key)
        {
            return map != null && map.ContainsKey(key) && map[key] != null ? Convert.ToString(map[key], CultureInfo.InvariantCulture) : "";
        }

        private static string Limit(string value, int max) => value.Length <= max ? value : value.Substring(0, max);
    }
}

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Avalia o filtro de veículos de um modelo de checklist (new_checklistmodelo.new_filtrojson).
    // Formato: { "condicoes": [ { "campo": "...", "operador": "...", "valor": ... } ] }; todas precisam bater.
    // A allowlist e a semântica espelham src/lib/filtroVeiculo.ts (Gestão). Campo, operador ou valor fora do
    // contrato faz o filtro não casar com nenhum veículo.
    public static class VehicleFilter
    {
        private enum Kind { Texto, Inteiro, Booleano, Choice }

        private static readonly Dictionary<string, Kind> Fields = new Dictionary<string, Kind>(StringComparer.Ordinal)
        {
            ["cr40f_marca"] = Kind.Texto,
            ["cr40f_modelo"] = Kind.Texto,
            ["cr40f_cor"] = Kind.Texto,
            ["cr40f_placa"] = Kind.Texto,
            ["cr40f_anodemodelo"] = Kind.Inteiro,
            ["cr40f_anodefabricacao"] = Kind.Inteiro,
            ["cr40f_hodometro"] = Kind.Inteiro,
            ["cr40f_blindado"] = Kind.Booleano,
            ["new_categoriadoveiculo"] = Kind.Choice,
            ["new_propriedade"] = Kind.Choice
        };

        // Colunas do veículo que o filtro pode ler; a rotina as inclui no ColumnSet.
        public static readonly string[] Columns = Fields.Keys.ToArray();

        // Sem filtro (vazio, nulo ou sem condições) não casa: modelo não padrão sem filtro só vale na escolha manual.
        public static bool Matches(string json, Entity vehicle)
        {
            if (!(Parse(json) is Dictionary<string, object> root)) return false;
            if (!root.TryGetValue("condicoes", out var list) || !(list is object[] conditions) || conditions.Length == 0) return false;
            return conditions.All(condition => ConditionMatches(condition as Dictionary<string, object>, vehicle));
        }

        private static object Parse(string json)
        {
            try { return new JavaScriptSerializer { MaxJsonLength = 100000 }.DeserializeObject(json ?? ""); }
            catch (ArgumentException) { return null; }
            catch (InvalidOperationException) { return null; }
        }

        private static bool ConditionMatches(Dictionary<string, object> condition, Entity vehicle)
        {
            if (condition == null) return false;
            var field = condition.TryGetValue("campo", out var rawField) ? rawField as string : null;
            var op = condition.TryGetValue("operador", out var rawOp) ? rawOp as string : null;
            condition.TryGetValue("valor", out var value);
            if (field == null || op == null || !Fields.TryGetValue(field, out var kind)) return false;
            var current = vehicle.Contains(field) ? vehicle[field] : null;
            switch (kind)
            {
                case Kind.Texto: return TextMatches(current as string, op, value);
                case Kind.Inteiro: return IntegerMatches(current as int?, op, value);
                case Kind.Booleano: return op == "igual" && value is bool expected && ((current as bool?) ?? false) == expected;
                default: return ChoiceMatches((current as OptionSetValue)?.Value, op, value);
            }
        }

        private static bool TextMatches(string current, string op, object value)
        {
            if (!(value is string raw)) return false;
            var text = Normalize(current);
            var expected = Normalize(raw);
            switch (op)
            {
                case "igual": return text.Length > 0 && text == expected;
                case "contem": return text.Length > 0 && text.Contains(expected);
                case "diferente": return text.Length == 0 || text != expected;
                default: return false;
            }
        }

        private static bool IntegerMatches(int? current, string op, object value)
        {
            if (op == "entre")
            {
                if (!(value is object[] range) || range.Length != 2 || !TryInteger(range[0], out var min) || !TryInteger(range[1], out var max)) return false;
                return current.HasValue && current.Value >= min && current.Value <= max;
            }
            if (!TryInteger(value, out var expected) || !current.HasValue) return false;
            switch (op)
            {
                case "igual": return current.Value == expected;
                case "diferente": return current.Value != expected;
                case "maior": return current.Value > expected;
                case "menor": return current.Value < expected;
                default: return false;
            }
        }

        private static bool ChoiceMatches(int? current, string op, object value)
        {
            if (!(value is object[] list)) return false;
            var options = new List<long>();
            foreach (var entry in list)
            {
                if (!TryInteger(entry, out var option)) return false;
                options.Add(option);
            }
            var inList = current.HasValue && options.Contains(current.Value);
            switch (op)
            {
                case "em": return inList;
                case "fora": return !inList;
                default: return false;
            }
        }

        // JavaScriptSerializer entrega int, long ou decimal; só valores inteiros contam.
        private static bool TryInteger(object value, out long result)
        {
            switch (value)
            {
                case int number: result = number; return true;
                case long number: result = number; return true;
                case decimal number when number == decimal.Truncate(number) && number >= long.MinValue && number <= long.MaxValue:
                    result = (long)number; return true;
                default: result = 0; return false;
            }
        }

        // Sem diferenciar maiúsculas/minúsculas nem acentos, com trim.
        private static string Normalize(string value)
        {
            var decomposed = (value ?? "").Trim().Normalize(NormalizationForm.FormD);
            var builder = new StringBuilder(decomposed.Length);
            foreach (var character in decomposed)
                if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark) builder.Append(character);
            return builder.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();
        }
    }
}

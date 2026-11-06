using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Betinhos.DriverRecordSharing
{
    // Saída e paradas do link, na mesma ordem de prioridade em que o Formulário Geral grava o serviço:
    // 1) endereço personalizado da reserva; 2) passageiros do serviço (endereço do vínculo, senão o do Banco de Dados);
    // 3) cr40f_enderecodesaida1 (serviço de retorno); 4) VIEW "N. Nome - endereço"; 5) o embarque que já era enviado.
    public static class TrackingLinkStops
    {
        private static readonly Regex ViewLine = new Regex(@"^\s*\d+\s*\.\s*.*?\s-\s(.+)$", RegexOptions.CultureInvariant | RegexOptions.Singleline);

        public sealed class Entry
        {
            public int? Order { get; set; }
            public string Address { get; set; }
            public string DatabaseAddress { get; set; }
        }

        public sealed class Input
        {
            public string CustomAddress { get; set; }
            public IEnumerable<Entry> Passengers { get; set; }
            public string ReturnAddress { get; set; }
            public string ViewText { get; set; }
            public string CurrentDeparture { get; set; }
        }

        public sealed class Result
        {
            public string Departure { get; set; }
            public string[] Stops { get; set; }
        }

        public static Result Plan(Input input)
        {
            if (!string.IsNullOrWhiteSpace(input.CustomAddress))
                return new Result { Departure = input.CustomAddress.Trim(), Stops = new string[0] };

            var passengers = (input.Passengers ?? Enumerable.Empty<Entry>())
                .Where(e => e != null)
                .OrderBy(e => e.Order ?? int.MaxValue)
                .Select(e => !string.IsNullOrWhiteSpace(e.Address) ? e.Address : e.DatabaseAddress);
            var found = Distinct(passengers);
            if (found.Count == 0) found = Distinct(new[] { input.ReturnAddress });
            if (found.Count == 0) found = Distinct(ParseView(input.ViewText));
            if (found.Count == 0) return new Result { Departure = input.CurrentDeparture, Stops = new string[0] };

            return new Result { Departure = found[0], Stops = found.Skip(1).Take(TrackingLinkPayload.MaxStops).ToArray() };
        }

        private static IEnumerable<string> ParseView(string view)
        {
            if (string.IsNullOrWhiteSpace(view)) yield break;
            foreach (var raw in view.Split(new[] { ';', '\r', '\n' }, System.StringSplitOptions.RemoveEmptyEntries))
            {
                var line = raw.Trim();
                if (line.Length == 0) continue;
                var match = ViewLine.Match(line);
                var address = match.Success ? match.Groups[1].Value.Trim() : line;
                if (address.Equals("indeterminado", System.StringComparison.OrdinalIgnoreCase)) continue;
                yield return address;
            }
        }

        private static List<string> Distinct(IEnumerable<string> addresses)
        {
            var seen = new HashSet<string>();
            var list = new List<string>();
            foreach (var address in addresses)
            {
                if (string.IsNullOrWhiteSpace(address)) continue;
                var text = address.Trim();
                if (seen.Add(Key(text))) list.Add(text);
            }
            return list;
        }

        private static string Key(string text)
        {
            var sb = new StringBuilder();
            foreach (var c in text.Normalize(NormalizationForm.FormD))
            {
                if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark || char.IsWhiteSpace(c)) continue;
                sb.Append(char.ToLowerInvariant(c));
            }
            return sb.ToString();
        }
    }
}

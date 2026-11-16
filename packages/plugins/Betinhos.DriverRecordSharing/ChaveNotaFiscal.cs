using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace Betinhos.DriverRecordSharing
{
    // Chave de acesso da nota fiscal (NF-e 55, NFC-e 65, CF-e SAT 59). Mesmas regras do chaveNotaFiscal.ts do App Motoristas.
    // Posições (0-based): UF 0-1, AAMM 2-5, CNPJ 6-19, modelo 20-21, DV 43. NF-e/NFC-e: série 22-24, número 25-33.
    // CF-e SAT: série do SAT 22-30, número do cupom 31-36. DV em módulo 11, pesos 2..9 da direita; cada posição vale ASCII - 48
    // (cobre o CNPJ alfanumérico e dá o resultado de sempre para dígitos).
    public static class ChaveNotaFiscal
    {
        public static readonly IReadOnlyDictionary<string, string> Ufs = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["11"] = "RO", ["12"] = "AC", ["13"] = "AM", ["14"] = "RR", ["15"] = "PA", ["16"] = "AP", ["17"] = "TO",
            ["21"] = "MA", ["22"] = "PI", ["23"] = "CE", ["24"] = "RN", ["25"] = "PB", ["26"] = "PE", ["27"] = "AL", ["28"] = "SE", ["29"] = "BA",
            ["31"] = "MG", ["32"] = "ES", ["33"] = "RJ", ["35"] = "SP",
            ["41"] = "PR", ["42"] = "SC", ["43"] = "RS",
            ["50"] = "MS", ["51"] = "MT", ["52"] = "GO", ["53"] = "DF"
        };

        public static readonly ISet<string> Modelos = new HashSet<string>(StringComparer.Ordinal) { "55", "65", "59" };

        private static readonly Regex Formato = new Regex("^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$", RegexOptions.CultureInvariant);
        private static readonly Regex FormatoCnpj = new Regex("^[0-9A-Z]{12}[0-9]{2}$", RegexOptions.CultureInvariant);
        private static readonly Regex Limpeza = new Regex(@"[\s.\-/]", RegexOptions.CultureInvariant);

        public sealed class Nota
        {
            public string Chave;
            public string Uf;
            public string Aamm;
            public string Cnpj;
            public string Modelo;
            public string Serie;
            public int Numero;
        }

        public static string Normalizar(string texto) => Limpeza.Replace((texto ?? "").ToUpperInvariant(), "");

        private static int Modulo11(string texto)
        {
            var soma = 0;
            for (var i = 0; i < texto.Length; i++) soma += (texto[texto.Length - 1 - i] - 48) * (2 + (i % 8));
            var resto = soma % 11;
            return resto < 2 ? 0 : 11 - resto;
        }

        public static bool CnpjValido(string cnpj)
        {
            if (cnpj == null || !FormatoCnpj.IsMatch(cnpj) || cnpj.Trim('0').Length == 0) return false;
            var dv1 = Modulo11(cnpj.Substring(0, 12));
            var dv2 = Modulo11(cnpj.Substring(0, 12) + dv1.ToString(CultureInfo.InvariantCulture));
            return cnpj.EndsWith(dv1.ToString(CultureInfo.InvariantCulture) + dv2.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal);
        }

        /// <summary>Valida e decompõe. Devolve null e a mensagem (em português) quando recusa.</summary>
        public static Nota Validar(string texto, out string erro)
        {
            erro = null;
            var chave = Normalizar(texto);
            if (chave.Length != 44) { erro = "A chave da nota tem 44 números."; return null; }
            if (!Formato.IsMatch(chave)) { erro = "A chave da nota tem letra fora do lugar."; return null; }
            if (Modulo11(chave.Substring(0, 43)) != chave[43] - 48) { erro = "Chave da nota inválida: o dígito verificador não confere."; return null; }
            if (!Ufs.TryGetValue(chave.Substring(0, 2), out var uf)) { erro = "Chave da nota inválida: o estado não existe."; return null; }
            var mes = int.Parse(chave.Substring(4, 2), CultureInfo.InvariantCulture);
            if (mes < 1 || mes > 12) { erro = "Chave da nota inválida: o mês de emissão não existe."; return null; }
            var modelo = chave.Substring(20, 2);
            if (!Modelos.Contains(modelo)) { erro = "A chave não é de nota fiscal (NF-e, NFC-e ou cupom SAT)."; return null; }
            var cnpj = chave.Substring(6, 14);
            if (!CnpjValido(cnpj)) { erro = "Chave da nota inválida: o CNPJ do emitente não confere."; return null; }
            var sat = modelo == "59";
            return new Nota
            {
                Chave = chave, Uf = uf, Aamm = chave.Substring(2, 4), Cnpj = cnpj, Modelo = modelo,
                Serie = sat ? chave.Substring(22, 9) : chave.Substring(22, 3),
                Numero = int.Parse(sat ? chave.Substring(31, 6) : chave.Substring(25, 9), CultureInfo.InvariantCulture)
            };
        }

        /// <summary>AAMM da chave igual ao mês da despesa; no 1º e no último dia, aceita também o mês vizinho.</summary>
        public static bool MesConfere(string aamm, DateTime dataDespesa)
        {
            var chave = (2000 + int.Parse(aamm.Substring(0, 2), CultureInfo.InvariantCulture)) * 12 + int.Parse(aamm.Substring(2, 2), CultureInfo.InvariantCulture) - 1;
            var despesa = dataDespesa.Year * 12 + dataDespesa.Month - 1;
            if (chave == despesa) return true;
            var ultimo = DateTime.DaysInMonth(dataDespesa.Year, dataDespesa.Month);
            return (dataDespesa.Day == 1 && chave == despesa - 1) || (dataDespesa.Day == ultimo && chave == despesa + 1);
        }

        private static readonly string[] Meses = { "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro" };

        public static string MesPorExtenso(string aamm) =>
            Meses[int.Parse(aamm.Substring(2, 2), CultureInfo.InvariantCulture) - 1] + " de 20" + aamm.Substring(0, 2);

        /// <summary>Data do gasto (DateAndTime, UserLocal, gravada em UTC) no dia da operação (America/Sao_Paulo, UTC-3 fixo desde 2019).</summary>
        public static DateTime DiaDaOperacao(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Utc).AddHours(-3).Date;
    }
}

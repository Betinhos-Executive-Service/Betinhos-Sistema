using System;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Cr40f.Acesso.Plugin;

/// <summary>Regras puras do acesso: e-mail gerado, celular, senha. Sem Dataverse e sem HTTP.</summary>
public static class AcessoRules
{
    private const string Maiusculas = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private const string Minusculas = "abcdefghijkmnpqrstuvwxyz";
    private const string Digitos = "23456789";
    private const string Simbolos = "!@#$%&*?";

    public static bool NomeValido(string? nome) => Palavras(nome).Length >= 2;

    public static string PrimeiroNome(string? nome) => Palavras(nome).FirstOrDefault() ?? "";

    public static string PrefixoEmail(string? nome)
    {
        var palavras = Palavras(nome).Select(SemAcentos).Where(p => p.Length > 0).ToArray();
        if (palavras.Length == 0) return "";
        return palavras.Length == 1 ? palavras[0] : palavras[0] + "." + palavras[palavras.Length - 1];
    }

    public static string EmailComSufixo(string prefixo, string dominio, Func<string, bool> existe)
    {
        var candidato = prefixo + "@" + dominio;
        for (var n = 2; existe(candidato); n++) candidato = prefixo + n.ToString(CultureInfo.InvariantCulture) + "@" + dominio;
        return candidato;
    }

    /// <summary>Celular brasileiro em E.164 (+55DDD9XXXXXXXX). Inválido: null.</summary>
    public static string? NormalizarCelular(string? bruto)
    {
        var digitos = new string((bruto ?? "").Where(char.IsDigit).ToArray());
        if (digitos.StartsWith("55", StringComparison.Ordinal) && digitos.Length == 13) digitos = digitos.Substring(2);
        if (digitos.Length != 11 || digitos[2] != '9') return null;
        return "+55" + digitos;
    }

    public static string GerarSenha(Random rng)
    {
        var tudo = Maiusculas + Minusculas + Digitos + Simbolos;
        var chars = new[] { Sorteio(Maiusculas, rng), Sorteio(Minusculas, rng), Sorteio(Digitos, rng), Sorteio(Simbolos, rng) }
            .Concat(Enumerable.Range(0, 10).Select(_ => Sorteio(tudo, rng)))
            .OrderBy(_ => rng.Next()).ToArray();
        return new string(chars);
    }

    private static char Sorteio(string alfabeto, Random rng) => alfabeto[rng.Next(alfabeto.Length)];

    private static string[] Palavras(string? nome) => Regex.Split((nome ?? "").Trim(), @"\s+").Where(p => p.Length > 0).ToArray();

    /// <summary>Minúsculas, sem acentos e com espaços simples: compara nomes de pessoas.</summary>
    public static string NomeComparavel(string? nome)
    {
        var sb = new StringBuilder();
        foreach (var c in (nome ?? "").Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(char.ToLowerInvariant(c));
        return string.Join(" ", Palavras(sb.ToString()));
    }

    public static bool TemLicenca(GraphUsuario u, string skuId) => u.SkuIds.Any(s => string.Equals(s, skuId, StringComparison.OrdinalIgnoreCase));

    private static string SemAcentos(string texto)
    {
        var decomposto = texto.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in decomposto)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            if (char.IsLetterOrDigit(c) || c == '-') sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString();
    }
}

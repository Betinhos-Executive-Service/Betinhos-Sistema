using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Cr40f.Prontuario.Plugin;

/// <summary>Tabela cr40f_liberacaoanexo (org-owned, sem privilégio para os papéis comuns): guarda só o hash do token.</summary>
public static class Liberacao
{
    public const string Tabela = "cr40f_liberacaoanexo";
    public const string Nome = "cr40f_name";
    public const string Funcionario = "cr40f_funcionario";
    public const string Solicitante = "cr40f_solicitante";
    public const string TokenHash = "cr40f_tokenhash";
    public const string ExpiraEm = "cr40f_expiraem";
    public const string UsadaEm = "cr40f_usadaem";
    public const string Arquivos = "cr40f_arquivos";

    public const string TabelaFuncionario = "cr40f_funcionarios";
    public const string NomeFuncionario = "cr40f_nomecompleto";
    /// <summary>Variável de ambiente com a URL HTTP (com sig) do flow "Prontuário | Anexar pelo Claude".</summary>
    public const string VariavelUrlEnvio = "cr40f_URLFlowAnexarProntuario";
    /// <summary>Organização do DEV (mesmo critério da tela: DEV grava em Funcionarios/DEV/&lt;id&gt;).</summary>
    public static readonly Guid OrganizacaoDev = new("7e5f59f4-efce-f011-89f6-000d3ac0a3e1");

    public static readonly TimeSpan Validade = TimeSpan.FromMinutes(10);
    public const int MaxArquivos = 10;
    public const long MaxBytesArquivo = 10L * 1024 * 1024;
    /// <summary>O gatilho HTTP aceita até 100 MB de corpo; 50 MB em arquivos (~67 MB em base64) cabe com folga.</summary>
    public const long MaxBytesTotal = 50L * 1024 * 1024;

    /// <summary>Tipo MIME permitido → extensões aceitas no nome.</summary>
    public static readonly IReadOnlyDictionary<string, string[]> Tipos = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = new[] { ".jpg", ".jpeg" },
        ["image/png"] = new[] { ".png" },
        ["image/heic"] = new[] { ".heic" },
        ["image/heif"] = new[] { ".heif" },
        ["application/pdf"] = new[] { ".pdf" },
    };

    public static string Pasta(Guid funcionarioId, bool dev) => $"Funcionarios/{(dev ? "DEV/" : "")}{funcionarioId:D}/Anotacoes";
}

public static class Token
{
    public static byte[] BytesAleatorios()
    {
        var bytes = new byte[32];
        using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
        return bytes;
    }

    public static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>SHA-256 do token (UTF-8) em hex minúsculo (64).</summary>
    public static string Sha256Hex(string token)
    {
        using var sha = SHA256.Create();
        return string.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(token)).Select(b => b.ToString("x2")));
    }

    /// <summary>Compara sem sair cedo: o tempo não revela quantos caracteres batem.</summary>
    public static bool IguaisTempoConstante(string a, string b)
    {
        var x = Encoding.ASCII.GetBytes(a ?? "");
        var y = Encoding.ASCII.GetBytes(b ?? "");
        var diff = x.Length ^ y.Length;
        for (var i = 0; i < Math.Max(x.Length, y.Length); i++) diff |= (i < x.Length ? x[i] : 0) ^ (i < y.Length ? y[i] : 0);
        return diff == 0;
    }
}

/// <summary>Nomes e HTML no mesmo formato da tela de Funcionários (sharepoint.ts e notes.ts).</summary>
public static class Formato
{
    private static readonly TimeSpan FusoSaoPaulo = TimeSpan.FromHours(-3); // sem horário de verão desde 2019

    /// <summary>Igual a sanitizeFileName: o flow recusa "/", "\" e "..".</summary>
    public static string SanitizarNome(string nome)
    {
        var limpo = Regex.Replace(nome ?? "", "[\\\\/:*?\"<>|#%]+", "_");
        limpo = Regex.Replace(limpo, "\\.{2,}", ".");
        limpo = Regex.Replace(limpo, "\\s+", " ").Trim().TrimStart('.');
        var ponto = limpo.LastIndexOf('.');
        var bas = ponto > 0 ? limpo.Substring(0, ponto) : limpo;
        var ext = ponto > 0 ? limpo.Substring(ponto) : "";
        if (bas.Length == 0) bas = "arquivo";
        return (bas.Length > 120 ? bas.Substring(0, 120) : bas) + (ext.Length > 12 ? ext.Substring(0, 12) : ext);
    }

    /// <summary>Igual a nomeComData: "20261002-153012 foto.png" no horário de São Paulo.</summary>
    public static string NomeComData(string nome, DateTime agoraUtc)
    {
        var local = DateTime.SpecifyKind(agoraUtc, DateTimeKind.Utc).Add(FusoSaoPaulo);
        return SanitizarNome(local.ToString("yyyyMMdd-HHmmss", System.Globalization.CultureInfo.InvariantCulture) + " " + nome);
    }

    /// <summary>Igual a uniqueName: "laudo.pdf" repetido → "laudo (2).pdf".</summary>
    public static string NomeUnico(string nome, ISet<string> usados)
    {
        if (usados.Add(nome.ToLowerInvariant())) return nome;
        var ponto = nome.LastIndexOf('.');
        var bas = ponto > 0 ? nome.Substring(0, ponto) : nome;
        var ext = ponto > 0 ? nome.Substring(ponto) : "";
        for (var n = 2; ; n++)
        {
            var candidato = $"{bas} ({n}){ext}";
            if (usados.Add(candidato.ToLowerInvariant())) return candidato;
        }
    }

    public static string Escapar(string texto) => (texto ?? "").Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");

    /// <summary>
    /// Parágrafos do corpo da nota (sem o wrapper ck-content, que o flow põe em volta junto com os links):
    /// mesmas regras de textToNoteHtml, com "Anexado por &lt;solicitante&gt; via Claude" no fim.
    /// </summary>
    public static string ParagrafosNota(string? texto, string solicitante)
    {
        var linhas = Regex.Replace(texto ?? "", "\r\n?", "\n").Trim();
        var sb = new StringBuilder();
        if (linhas.Length > 0)
            foreach (var linha in linhas.Split('\n'))
                sb.Append("<p style=\"margin: 0;\">").Append(linha.Trim().Length > 0 ? Escapar(linha) : "&nbsp;").Append("</p>");
        sb.Append("<p style=\"margin: 0;\">").Append(Escapar("Anexado por " + (string.IsNullOrWhiteSpace(solicitante) ? "usuário do Sistema" : solicitante.Trim()) + " via Claude")).Append("</p>");
        return sb.ToString();
    }
}

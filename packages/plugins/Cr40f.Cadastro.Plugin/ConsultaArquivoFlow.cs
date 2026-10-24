using System;
using System.IO;
using System.Net;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace Cr40f.Cadastro.Plugin;

/// <summary>Arquivo lido do SharePoint.</summary>
public sealed class ArquivoLido
{
    public ArquivoLido(string mimeType, string conteudoBase64) { MimeType = mimeType; ConteudoBase64 = conteudoBase64; }
    public string MimeType { get; }
    public string ConteudoBase64 { get; }
}

/// <summary>Lê um arquivo do SharePoint pelo caminho relativo ao site. Lança exceção em falha.</summary>
public interface IConsultaArquivo
{
    ArquivoLido Ler(string caminhoSharePoint, string nomeArquivo);
}

/// <summary>POST no gatilho HTTP do "Flow - Consultar Arquivos Sharepoint" (contrato de apps/shell/.../sharepoint.ts).</summary>
public sealed class ConsultaArquivoFlow : IConsultaArquivo
{
    public const int TimeoutMs = 20_000;
    public const int LimiteBytes = 5 * 1024 * 1024;
    private readonly string _url;

    public ConsultaArquivoFlow(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || u.Scheme != Uri.UriSchemeHttps) throw new InvalidOperationException("URL do flow de consulta ausente ou inválida na configuração segura.");
        _url = url;
    }

    public ArquivoLido Ler(string caminhoSharePoint, string nomeArquivo)
    {
        // fileLocator vazio: o flow cai no ramo GetFileContentByPath (dataset = site BetinhosGestoInterna, path = caminhoSharePoint).
        var corpo = "{\"id\":" + JsonLeve.Texto(caminhoSharePoint) + ",\"fileLocator\":\"\",\"caminhoSharePoint\":" + JsonLeve.Texto(caminhoSharePoint) + ",\"nomeArquivo\":" + JsonLeve.Texto(nomeArquivo) + "}";
        var bytes = Encoding.UTF8.GetBytes(corpo);
        var req = (HttpWebRequest)WebRequest.Create(_url);
        req.Method = "POST";
        req.ContentType = "application/json";
        req.Timeout = TimeoutMs;
        req.ReadWriteTimeout = TimeoutMs;
        req.ContentLength = bytes.Length;
        using (var s = req.GetRequestStream()) s.Write(bytes, 0, bytes.Length);
        using var resp = (HttpWebResponse)req.GetResponse();
        if (resp.StatusCode != HttpStatusCode.OK) throw new InvalidOperationException("Flow respondeu " + (int)resp.StatusCode + ".");
        if (resp.ContentLength > LimiteBytes) throw new InvalidOperationException("Resposta do flow acima do limite.");
        using var stream = resp.GetResponseStream();
        var r = Desserializar(LerComLimite(stream, LimiteBytes));
        return new ArquivoLido(r.mimeType ?? "", r.conteudoBase64 ?? "");
    }

    public static byte[] LerComLimite(Stream origem, int limite)
    {
        using var ms = new MemoryStream();
        var buffer = new byte[81920];
        int lidos;
        while ((lidos = origem.Read(buffer, 0, buffer.Length)) > 0)
        {
            if (ms.Length + lidos > limite) throw new InvalidOperationException("Resposta do flow acima do limite.");
            ms.Write(buffer, 0, lidos);
        }
        return ms.ToArray();
    }

    public static RespostaFlow Desserializar(byte[] json)
    {
        using var ms = new MemoryStream(json);
        return (RespostaFlow)new DataContractJsonSerializer(typeof(RespostaFlow)).ReadObject(ms);
    }

    [DataContract]
    public sealed class RespostaFlow
    {
        [DataMember] public string? mimeType { get; set; }
        [DataMember] public string? conteudoBase64 { get; set; }
    }
}

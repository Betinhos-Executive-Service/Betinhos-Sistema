using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace Cr40f.Projetos.Plugin;

/// <summary>Resultado da Groq: Ok com o texto, ou a mensagem curta que vai para o campo.</summary>
public sealed class ResultadoGroq
{
    public ResultadoGroq(bool ok, string texto) { Ok = ok; Texto = texto; }
    public bool Ok { get; }
    public string Texto { get; }
}

/// <summary>
/// Transcrição pela Groq (endpoint OpenAI-compatível, Whisper Large v3 Turbo), igual a server/groq.ts do WhatsApp Inbox:
/// multipart com file, model, language=pt, response_format=json e temperature=0.
/// </summary>
public static class GroqClient
{
    public const string Endpoint = "https://api.groq.com/openai/v1/audio/transcriptions";
    public const string Modelo = "whisper-large-v3-turbo";
    // Abaixo dos 2 min do sandbox de plugin, com folga para baixar o anexo e gravar o texto.
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(90);

    private static readonly HttpClient Padrao = new() { Timeout = Timeout };

    public static ResultadoGroq Transcrever(byte[] audio, string mime, string chave, HttpMessageHandler? handler = null)
    {
        var http = handler == null ? Padrao : new HttpClient(handler, false) { Timeout = Timeout };
        using var form = new MultipartFormDataContent();
        var arquivo = new ByteArrayContent(audio);
        arquivo.Headers.ContentType = new MediaTypeHeaderValue(mime);
        form.Add(arquivo, "file", "audio." + Extensao(mime));
        form.Add(new StringContent(Modelo), "model");
        form.Add(new StringContent("pt"), "language");
        form.Add(new StringContent("json"), "response_format");
        form.Add(new StringContent("0"), "temperature");
        using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint) { Content = form };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", chave);
        HttpResponseMessage response;
        try { response = http.SendAsync(request).ConfigureAwait(false).GetAwaiter().GetResult(); }
        catch (OperationCanceledException)
        { return new ResultadoGroq(false, "A Groq demorou demais para transcrever o áudio."); }
        catch (HttpRequestException) { return new ResultadoGroq(false, "Não foi possível falar com a Groq para transcrever o áudio."); }
        using (response)
        {
            var corpo = response.Content.ReadAsStringAsync().ConfigureAwait(false).GetAwaiter().GetResult();
            var dados = Ler(corpo);
            var status = (int)response.StatusCode;
            if (status == 401) return new ResultadoGroq(false, "Chave da Groq inválida: confira o segredo groq.transcricao.");
            if (status == 429) return new ResultadoGroq(false, "Limite da Groq atingido: áudio não transcrito.");
            if (!response.IsSuccessStatusCode)
            {
                var detalhe = dados?.Erro?.Mensagem;
                if (detalhe != null && detalhe.Length > 200) detalhe = detalhe.Substring(0, 200);
                return new ResultadoGroq(false, $"A Groq não transcreveu o áudio ({status}{(string.IsNullOrEmpty(detalhe) ? "" : ": " + detalhe)}).");
            }
            if (dados?.Texto == null) return new ResultadoGroq(false, "A Groq respondeu sem o texto da transcrição.");
            return new ResultadoGroq(true, dados.Texto.Trim());
        }
    }

    public static string Extensao(string mime) => mime switch
    {
        "audio/mpeg" => "mp3",
        "audio/mp3" => "mp3",
        "audio/mp4" => "m4a",
        "audio/x-m4a" => "m4a",
        "audio/m4a" => "m4a",
        "audio/webm" => "webm",
        "audio/wav" => "wav",
        "audio/x-wav" => "wav",
        _ => "ogg",
    };

    private static Resposta? Ler(string json)
    {
        try
        {
            using var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));
            return new DataContractJsonSerializer(typeof(Resposta)).ReadObject(stream) as Resposta;
        }
        catch (Exception) { return null; }
    }

    [DataContract]
    private sealed class Resposta
    {
        [DataMember(Name = "text")] public string? Texto { get; set; }
        [DataMember(Name = "error")] public Erro? Erro { get; set; }
    }

    [DataContract]
    private sealed class Erro
    {
        [DataMember(Name = "message")] public string? Mensagem { get; set; }
    }
}

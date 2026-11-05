using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.ServiceModel;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Prontuario.Plugin;

[DataContract]
public sealed class ArquivoInfo
{
    [DataMember(Name = "nome", Order = 1)] public string Nome { get; set; } = "";
    [DataMember(Name = "mimeType", Order = 2)] public string MimeType { get; set; } = "";
    [DataMember(Name = "tamanho", Order = 3)] public long Tamanho { get; set; }
}

public sealed class ConsumoSaida
{
    public bool Ok { get; set; }
    /// <summary>"LIBERACAO" (token/estado) ou "ARQUIVOS" (tipo/tamanho/quantidade): o flow escolhe 403 ou 400.</summary>
    public string Codigo { get; set; } = "";
    public string Erro { get; set; } = "";
    public Guid FuncionarioId { get; set; }
    public string Solicitante { get; set; } = "";
    public string Pasta { get; set; } = "";
    public string Titulo { get; set; } = "";
    public string CorpoHtml { get; set; } = "";
    public List<ArquivoInfo> Arquivos { get; set; } = new();
}

/// <summary>
/// cr40f_ConsumirAnexoProntuario (só a conta do flow executa): valida liberação, token e arquivos e marca a
/// liberação como usada numa única atualização com controle de concorrência (RowVersion): duas chamadas
/// simultâneas com o mesmo token não passam as duas.
/// </summary>
public sealed class ConsumirAnexoHandler
{
    public const string TituloPadrao = "Anexo enviado pelo Claude";
    private const int ConcurrencyVersionMismatch = unchecked((int)0x80060882);
    private const string LiberacaoInvalida = "Liberação inválida. Peça uma nova ao Claude.";

    private readonly IOrganizationService _sistema;
    private readonly bool _dev;
    private readonly Func<DateTime> _agoraUtc;

    public ConsumirAnexoHandler(IOrganizationService sistema, bool dev, Func<DateTime>? agoraUtc = null)
    {
        _sistema = sistema; _dev = dev;
        _agoraUtc = agoraUtc ?? (() => DateTime.UtcNow);
    }

    public ConsumoSaida Executar(string? liberacaoIdTexto, string? token, string? arquivosJson, string? titulo, string? texto)
    {
        if (!Guid.TryParse(liberacaoIdTexto?.Trim(), out var liberacaoId) || liberacaoId == Guid.Empty || string.IsNullOrEmpty(token)) return Falha("LIBERACAO", LiberacaoInvalida);

        Entity lib;
        try { lib = _sistema.Retrieve(Liberacao.Tabela, liberacaoId, new ColumnSet(Liberacao.TokenHash, Liberacao.ExpiraEm, Liberacao.UsadaEm, Liberacao.Funcionario, Liberacao.Solicitante)); }
        catch (FaultException<OrganizationServiceFault>) { return Falha("LIBERACAO", LiberacaoInvalida); }

        // Hash primeiro: sem o token certo, ninguém descobre se a liberação existe, expirou ou foi usada.
        if (!Token.IguaisTempoConstante(Token.Sha256Hex(token!), lib.GetAttributeValue<string>(Liberacao.TokenHash) ?? "")) return Falha("LIBERACAO", LiberacaoInvalida);
        if (lib.GetAttributeValue<DateTime?>(Liberacao.UsadaEm) is not null) return Falha("LIBERACAO", "Esta liberação já foi usada. Peça uma nova ao Claude.");
        var agora = _agoraUtc();
        var expira = lib.GetAttributeValue<DateTime?>(Liberacao.ExpiraEm);
        if (expira is null || expira.Value.ToUniversalTime() <= agora) return Falha("LIBERACAO", "Liberação expirada (vale 10 minutos). Peça uma nova ao Claude.");
        var funcionario = lib.GetAttributeValue<EntityReference>(Liberacao.Funcionario);
        if (funcionario is null) return Falha("LIBERACAO", LiberacaoInvalida);

        var erroArquivos = ValidarArquivos(arquivosJson, agora, out var arquivos);
        if (erroArquivos is not null) return Falha("ARQUIVOS", erroArquivos);

        // Sem RowVersion não há como garantir uso único: falha fechada em vez de gravar sem controle de concorrência.
        if (string.IsNullOrEmpty(lib.RowVersion)) throw new InvalidOperationException(Liberacao.Tabela + " sem RowVersion (concorrência otimista desligada).");
        var marcar = new UpdateRequest
        {
            Target = new Entity(Liberacao.Tabela, liberacaoId) { RowVersion = lib.RowVersion, [Liberacao.UsadaEm] = agora, [Liberacao.Arquivos] = arquivos.Count },
            ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches,
        };
        try { _sistema.Execute(marcar); }
        catch (FaultException<OrganizationServiceFault> erro) when (erro.Detail?.ErrorCode == ConcurrencyVersionMismatch)
        {
            return Falha("LIBERACAO", "Esta liberação já foi usada. Peça uma nova ao Claude.");
        }

        var solicitante = NomeSolicitante(lib.GetAttributeValue<EntityReference>(Liberacao.Solicitante));
        var tituloFinal = string.IsNullOrWhiteSpace(titulo) ? TituloPadrao : titulo!.Trim();
        return new ConsumoSaida
        {
            Ok = true,
            FuncionarioId = funcionario.Id,
            Solicitante = solicitante,
            Pasta = Liberacao.Pasta(funcionario.Id, _dev),
            Titulo = tituloFinal.Length > 500 ? tituloFinal.Substring(0, 500) : tituloFinal,
            CorpoHtml = Formato.ParagrafosNota(texto, solicitante),
            Arquivos = arquivos,
        };
    }

    /// <summary>Até 10 arquivos, só foto/PDF com extensão coerente, cada um ≤ 10 MB e total ≤ 50 MB. Devolve os nomes finais.</summary>
    public static string? ValidarArquivos(string? json, DateTime agoraUtc, out List<ArquivoInfo> finais)
    {
        finais = new List<ArquivoInfo>();
        List<ArquivoInfo>? lista;
        try { lista = Ler(json); }
        catch (Exception) { return "Lista de arquivos inválida."; }
        if (lista is null || lista.Count == 0) return "Nenhum arquivo enviado.";
        if (lista.Count > Liberacao.MaxArquivos) return $"No máximo {Liberacao.MaxArquivos} arquivos por vez.";
        var usados = new HashSet<string>();
        long total = 0;
        foreach (var a in lista)
        {
            var nome = Formato.SanitizarNome(a?.Nome ?? "");
            var mime = (a?.MimeType ?? "").Trim().ToLowerInvariant();
            if (!Liberacao.Tipos.TryGetValue(mime, out var extensoes)) return $"{nome}: só fotos (JPG, PNG, HEIC) e PDF.";
            var ponto = nome.LastIndexOf('.');
            var ext = ponto > 0 ? nome.Substring(ponto).ToLowerInvariant() : "";
            if (!extensoes.Contains(ext)) return $"{nome}: a extensão não combina com o tipo {mime}.";
            if (a!.Tamanho <= 0) return $"{nome}: arquivo vazio.";
            if (a.Tamanho > Liberacao.MaxBytesArquivo) return $"{nome}: maior que 10 MB.";
            total += a.Tamanho;
            if (total > Liberacao.MaxBytesTotal) return "Os arquivos somam mais de 50 MB; envie em partes.";
            finais.Add(new ArquivoInfo { Nome = Formato.NomeUnico(Formato.NomeComData(nome, agoraUtc), usados), MimeType = mime, Tamanho = a.Tamanho });
        }
        return null;
    }

    private string NomeSolicitante(EntityReference? usuario)
    {
        if (usuario is null) return "";
        try { return _sistema.Retrieve("systemuser", usuario.Id, new ColumnSet("fullname")).GetAttributeValue<string>("fullname") ?? ""; }
        catch (FaultException<OrganizationServiceFault>) { return ""; }
    }

    public static List<ArquivoInfo>? Ler(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        using var ms = new MemoryStream(Encoding.UTF8.GetBytes(json));
        return (List<ArquivoInfo>?)new DataContractJsonSerializer(typeof(List<ArquivoInfo>)).ReadObject(ms);
    }

    public static string Escrever(List<ArquivoInfo> arquivos)
    {
        using var ms = new MemoryStream();
        new DataContractJsonSerializer(typeof(List<ArquivoInfo>)).WriteObject(ms, arquivos);
        return Encoding.UTF8.GetString(ms.ToArray());
    }

    private static ConsumoSaida Falha(string codigo, string erro) => new() { Ok = false, Codigo = codigo, Erro = erro };
}

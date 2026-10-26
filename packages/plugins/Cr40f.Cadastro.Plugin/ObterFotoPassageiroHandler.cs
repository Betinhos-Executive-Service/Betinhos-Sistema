using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Cadastro.Plugin;

/// <summary>Foto do passageiro para o App Motoristas: só o motorista do serviço Programado, só passageiro do serviço, só arquivo da biblioteca.</summary>
public sealed class ObterFotoPassageiroHandler
{
    public const int StatusProgramado = 202410005;
    public const string PrefixoLink = "https://betinhos.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/";
    public const string Biblioteca = "/Documentos Compartilhados/";
    public const string PastaFotos = "Passageiros/Fotos/";
    public const string Negado = "{\"ok\":false,\"motivo\":\"indisponivel\"}";

    private readonly IOrganizationService _sistema;
    private readonly IConsultaArquivo _arquivos;
    private readonly Action<string> _trace;

    public ObterFotoPassageiroHandler(IOrganizationService sistema, IConsultaArquivo arquivos, Action<string>? trace = null)
    {
        _sistema = sistema; _arquivos = arquivos; _trace = trace ?? (_ => { });
    }

    public string Executar(Guid usuarioId, string? reservaIdTexto, string? passageiroIdTexto)
    {
        if (!Guid.TryParse(reservaIdTexto, out var reservaId) || reservaId == Guid.Empty) return Negar("reserva inválida");
        if (!Guid.TryParse(passageiroIdTexto, out var passageiroId) || passageiroId == Guid.Empty) return Negar("passageiro inválido");

        var reserva = Buscar("cr40f_reservadeveculos", reservaId, new[] { "cr40f_status", "cr40f_motorista" }.Concat(PassageirosDoServico.ColunasReserva).ToArray());
        if (reserva is null) return Negar("reserva não encontrada");
        if (reserva.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value != StatusProgramado) return Negar("status diferente de Programado");

        var motoristaId = reserva.GetAttributeValue<EntityReference>("cr40f_motorista")?.Id;
        if (motoristaId is not Guid mid || mid == Guid.Empty) return Negar("serviço sem motorista");
        var emailMotorista = Normalizar(Buscar("cr40f_funcionarios", mid, "cr40f_emailmicrosoft")?.GetAttributeValue<string>("cr40f_emailmicrosoft"));
        if (emailMotorista is null) return Negar("motorista sem e-mail Microsoft");
        var usuario = Buscar("systemuser", usuarioId, "domainname", "internalemailaddress");
        if (usuario is null) return Negar("usuário iniciador não encontrado");
        var emails = new[] { Normalizar(usuario.GetAttributeValue<string>("domainname")), Normalizar(usuario.GetAttributeValue<string>("internalemailaddress")) };
        if (!emails.Contains(emailMotorista)) return Negar("usuário não é o motorista do serviço");

        if (!PassageirosDoServico.Ids(_sistema, reserva).Contains(passageiroId)) return Negar("passageiro fora do serviço");

        var link = Buscar("cr40f_bancodedados", passageiroId, "new_linkdafoto")?.GetAttributeValue<string>("new_linkdafoto");
        if (string.IsNullOrWhiteSpace(link)) return Negar("passageiro sem foto");
        var caminho = CaminhoNaBiblioteca(link!);
        if (caminho is null) return Negar("link da foto fora da biblioteca");

        ArquivoLido arquivo;
        try { arquivo = _arquivos.Ler(caminho, caminho.Substring(caminho.LastIndexOf('/') + 1)); }
        catch (Exception erro) { return Negar("falha ao ler a foto: " + erro.Message); }

        var mime = (arquivo.MimeType ?? "").Split(';')[0].Trim().ToLowerInvariant();
        if (!mime.StartsWith("image/", StringComparison.Ordinal)) return Negar("arquivo não é imagem (" + mime + ")");
        if (string.IsNullOrEmpty(arquivo.ConteudoBase64)) return Negar("foto vazia");
        try { Convert.FromBase64String(arquivo.ConteudoBase64); }
        catch (FormatException) { return Negar("base64 inválido"); }

        return "{\"ok\":true,\"mimeType\":" + JsonLeve.Texto(mime) + ",\"conteudoBase64\":" + JsonLeve.Texto(arquivo.ConteudoBase64) + "}";
    }

    /// <summary>Link /:i:/r/ da biblioteca → caminho decodificado relativo ao site ("/Documentos Compartilhados/..."); null se fora dela.</summary>
    public static string? CaminhoNaBiblioteca(string link)
    {
        var url = link.Trim();
        if (!url.StartsWith(PrefixoLink, StringComparison.OrdinalIgnoreCase)) return null;
        var resto = url.Substring(PrefixoLink.Length);
        var corte = resto.IndexOfAny(new[] { '?', '#' });
        if (corte >= 0) resto = resto.Substring(0, corte);
        string decodificado;
        try { decodificado = Uri.UnescapeDataString(resto); } catch (Exception) { return null; }
        if (decodificado.Length == 0 || decodificado.IndexOf('\\') >= 0 || decodificado.Any(char.IsControl)) return null;
        if (decodificado.Split('/').Any(p => p.Length == 0 || p == "." || p == "..")) return null;
        // Só a pasta de fotos de passageiros: um new_linkdafoto adulterado não abre outros arquivos do site.
        if (!decodificado.StartsWith(PastaFotos, StringComparison.OrdinalIgnoreCase)) return null;
        return Biblioteca + decodificado;
    }

    private Entity? Buscar(string tabela, Guid id, params string[] colunas)
    {
        try { return _sistema.Retrieve(tabela, id, new ColumnSet(colunas)); }
        catch (Exception erro) { _trace(tabela + " " + id + ": " + erro.Message); return null; }
    }

    private static string? Normalizar(string? email) => string.IsNullOrWhiteSpace(email) ? null : email!.Trim().ToLowerInvariant();

    private string Negar(string detalhe) { _trace("negado: " + detalhe); return Negado; }
}

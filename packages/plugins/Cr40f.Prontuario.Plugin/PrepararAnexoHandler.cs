using System;
using System.Globalization;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Prontuario.Plugin;

public sealed class PreparoSaida
{
    public Guid LiberacaoId { get; set; }
    public string Token { get; set; } = "";
    public DateTime ExpiraEm { get; set; }
    public string UrlEnvio { get; set; } = "";
}

/// <summary>
/// cr40f_PrepararAnexoProntuario: confere se quem pede (InitiatingUserId) pode anotar no funcionário e grava uma
/// liberação de uso único (10 min) com só o hash do token. O token puro volta uma vez, para o script do chat.
/// </summary>
public sealed class PrepararAnexoHandler
{
    private readonly IOrganizationService _sistema;
    private readonly IPermissoes _permissoes;
    private readonly IConfiguracao _config;
    private readonly Func<DateTime> _agoraUtc;
    private readonly Func<byte[]> _bytesToken;

    public PrepararAnexoHandler(IOrganizationService sistema, IPermissoes permissoes, IConfiguracao config, Func<DateTime>? agoraUtc = null, Func<byte[]>? bytesToken = null)
    {
        _sistema = sistema; _permissoes = permissoes; _config = config;
        _agoraUtc = agoraUtc ?? (() => DateTime.UtcNow);
        _bytesToken = bytesToken ?? Token.BytesAleatorios;
    }

    public PreparoSaida Executar(Guid usuarioId, string? funcionarioIdTexto)
    {
        if (!Guid.TryParse(funcionarioIdTexto?.Trim().Trim('{', '}'), out var funcionarioId) || funcionarioId == Guid.Empty)
            throw new ProntuarioException("Funcionário inválido: informe o id (GUID) do registro em cr40f_funcionarios.");

        Entity funcionario;
        try { funcionario = _sistema.Retrieve(Liberacao.TabelaFuncionario, funcionarioId, new ColumnSet(Liberacao.NomeFuncionario)); }
        catch (FaultException<OrganizationServiceFault>) { throw new ProntuarioException("Funcionário não encontrado."); }

        if (!_permissoes.PodeAnotar(usuarioId, funcionario.ToEntityReference()))
            throw new ProntuarioException("Você não tem permissão para anexar no prontuário deste funcionário (é preciso poder criar anotação nele). Fale com o administrador do Sistema.");

        var url = _config.UrlEnvio();
        if (url is null || !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            throw new ProntuarioException("Anexo pelo Claude não configurado neste ambiente (falta a variável " + Liberacao.VariavelUrlEnvio + ").");

        var bytes = _bytesToken();
        if (bytes is null || bytes.Length < 32) throw new InvalidOperationException("Token curto demais.");
        var token = Token.Base64Url(bytes);
        var agora = _agoraUtc();
        var expira = agora.Add(Liberacao.Validade);
        var nome = (funcionario.GetAttributeValue<string>(Liberacao.NomeFuncionario) ?? "Funcionário").Trim();
        var rotulo = "Anexo no prontuário · " + nome;
        var id = _sistema.Create(new Entity(Liberacao.Tabela)
        {
            [Liberacao.Nome] = rotulo.Length > 100 ? rotulo.Substring(0, 100) : rotulo,
            [Liberacao.Funcionario] = new EntityReference(Liberacao.TabelaFuncionario, funcionarioId),
            [Liberacao.Solicitante] = new EntityReference("systemuser", usuarioId),
            [Liberacao.TokenHash] = Token.Sha256Hex(token),
            [Liberacao.ExpiraEm] = expira,
        });
        return new PreparoSaida { LiberacaoId = id, Token = token, ExpiraEm = expira, UrlEnvio = url };
    }

    public static string Iso(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Utc).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
}

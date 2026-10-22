using System.Collections.Generic;

namespace Cr40f.Acesso.Plugin;

public sealed class GraphUsuario { public string Id = ""; public string Upn = ""; public string DisplayName = ""; public bool Ativo; public List<string> SkuIds = new(); }

public interface IGraphGateway
{
    GraphUsuario? UsuarioPorUpn(string upn);               // null quando não existe
    GraphUsuario CriarUsuario(string upn, string nome, string senhaTemporaria, string? celular);
    void DefinirAtivo(string usuarioId, bool ativo);
    void AtribuirLicenca(string usuarioId, string skuId);
    void RemoverLicenca(string usuarioId, string skuId);
    bool EhMembro(string grupoId, string usuarioId);
    void AdicionarAoGrupo(string grupoId, string usuarioId);
    void RemoverDoGrupo(string grupoId, string usuarioId);
    int LicencasLivres(string skuId);                       // prepaidUnits.enabled - consumedUnits
}

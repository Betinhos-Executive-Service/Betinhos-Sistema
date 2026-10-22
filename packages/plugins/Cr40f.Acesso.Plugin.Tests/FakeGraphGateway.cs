using System.Collections.Generic;
using System.Linq;
using Cr40f.Acesso.Plugin;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class FakeGraphGateway : IGraphGateway
{
    public readonly Dictionary<string, GraphUsuario> Usuarios = new();
    public readonly HashSet<(string Grupo, string Usuario)> Membros = new();
    public readonly List<string> Chamadas = new();
    public int Livres = 5;
    public string? FalharEm;   // nome do método que deve lançar GRAPH_INDISPONIVEL

    private void Registrar(string metodo) { Chamadas.Add(metodo); if (FalharEm == metodo) throw new AcessoException("GRAPH_INDISPONIVEL", "503 em " + metodo); }

    public GraphUsuario? UsuarioPorUpn(string upn) { Registrar("UsuarioPorUpn"); return Usuarios.TryGetValue(upn, out var u) ? u : null; }
    public GraphUsuario CriarUsuario(string upn, string nome, string senha, string? celular)
    {
        Registrar("CriarUsuario");
        var u = new GraphUsuario { Id = "id-" + upn, Upn = upn, DisplayName = nome, Ativo = true };
        Usuarios[upn] = u; return u;
    }
    public void DefinirAtivo(string id, bool ativo) { Registrar("DefinirAtivo"); Usuarios.Values.Single(u => u.Id == id).Ativo = ativo; }
    public void AtribuirLicenca(string id, string sku) { Registrar("AtribuirLicenca"); Usuarios.Values.Single(u => u.Id == id).SkuIds.Add(sku); }
    public void RemoverLicenca(string id, string sku) { Registrar("RemoverLicenca"); Usuarios.Values.Single(u => u.Id == id).SkuIds.Remove(sku); }
    public bool EhMembro(string g, string id) { Registrar("EhMembro"); return Membros.Contains((g, id)); }
    public void AdicionarAoGrupo(string g, string id) { Registrar("AdicionarAoGrupo"); Membros.Add((g, id)); }
    public void RemoverDoGrupo(string g, string id) { Registrar("RemoverDoGrupo"); Membros.Remove((g, id)); }
    public int LicencasLivres(string sku) { Registrar("LicencasLivres"); return Livres; }
}

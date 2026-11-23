using System;
using System.Collections.Generic;
using System.Linq;

namespace Cr40f.Acesso.Plugin;

/// <summary>Nomes dos papéis "Perfil - *" e a tradução entre eles, o pedido da tela e o JSON do histórico.</summary>
public static class AcessoCatalogo
{
    public const string Prefixo = "Perfil - ";
    public const string Base = Prefixo + "Base";
    public const string AdminAcessos = Prefixo + "Administrador de acessos";
    private static readonly string[] AdminDoSistema = { "Administrador do Sistema", "System Administrator" };
    private static readonly Dictionary<string, string> Areas = new(StringComparer.Ordinal)
    {
        ["operacional"] = "Operacional", ["financeiro"] = "Financeiro", ["frota"] = "Frota", ["rh"] = "RH",
    };
    private static readonly Dictionary<string, string> Niveis = new(StringComparer.Ordinal) { ["operador"] = "Operador", ["gestor"] = "Gestor" };

    public static string NomeDoPapel(string area, string nivel) => Prefixo + Areas[area] + " - " + Niveis[nivel];

    /// <summary>A lista fixa de perfis válidos: Base, Administrador de acessos e as 8 combinações área x nível.</summary>
    public static IReadOnlyCollection<string> Lista { get; } = new HashSet<string>(
        new[] { Base, AdminAcessos }.Concat(Areas.Keys.SelectMany(a => Niveis.Keys.Select(n => NomeDoPapel(a, n)))),
        StringComparer.Ordinal);

    /// <summary>Só pertence ao catálogo quem está na lista fixa; um "Perfil - Outro" criado à mão não.</summary>
    public static bool EhDoCatalogo(string nome) => Lista.Contains(nome);
    public static bool EhAdminDoSistema(IEnumerable<string> papeis) => papeis.Any(p => AdminDoSistema.Contains(p));

    /// <summary>Perfis de coluna da pessoa: um por área, com o mesmo nome do papel.</summary>
    public static List<string> PerfisDeColuna(PerfisDoUsuario p) => p.Areas.Select(a => NomeDoPapel(a.Key, a.Value)).ToList();

    /// <summary>Papéis da pessoa, sem o Base (que o handler sempre acrescenta).</summary>
    public static List<string> Papeis(PerfisDoUsuario p)
    {
        var nomes = PerfisDeColuna(p);
        if (p.Acessos) nomes.Add(AdminAcessos);
        return nomes;
    }

    public static PerfisDoUsuario DosPapeis(IEnumerable<string> nomes)
    {
        var perfis = new PerfisDoUsuario();
        var lista = nomes.ToList();
        foreach (var area in Areas.Keys)
            foreach (var nivel in Niveis.Keys)
                if (lista.Contains(NomeDoPapel(area, nivel))) perfis.Areas[area] = nivel;
        perfis.Acessos = lista.Contains(AdminAcessos);
        return perfis;
    }

    public static PerfisDoUsuario LerPedido(string? json)
    {
        var perfis = new PerfisDoUsuario();
        if (string.IsNullOrWhiteSpace(json)) return perfis;
        List<object?> itens;
        try { itens = JsonLeve.LerLista(json!); }
        catch (Exception) { throw Invalido("A lista de perfis não é um JSON válido."); }
        foreach (var item in itens)
        {
            if (item is not Dictionary<string, object?> campos || !campos.TryGetValue("perfil", out var p) || p is not string perfil)
                throw Invalido("Cada item precisa do campo perfil.");
            if (perfil == "acessos") { perfis.Acessos = true; continue; }
            if (!Areas.ContainsKey(perfil)) throw Invalido("Perfil desconhecido: " + perfil + ".");
            if (!campos.TryGetValue("nivel", out var n) || n is not string nivel || !Niveis.ContainsKey(nivel))
                throw Invalido("Nível inválido para " + perfil + ".");
            if (perfis.Areas.ContainsKey(perfil)) throw Invalido("Perfil repetido: " + perfil + ".");
            perfis.Areas[perfil] = nivel;
        }
        return perfis;
    }

    public static string Json(PerfisDoUsuario p)
    {
        var itens = p.Areas.Select(a => "{\"perfil\":" + JsonLeve.Texto(a.Key) + ",\"nivel\":" + JsonLeve.Texto(a.Value) + "}").ToList();
        if (p.Acessos) itens.Add("{\"perfil\":\"acessos\"}");
        return "[" + string.Join(",", itens) + "]";
    }

    private static AcessoException Invalido(string texto) => new("PERFIL_INVALIDO", texto);
}

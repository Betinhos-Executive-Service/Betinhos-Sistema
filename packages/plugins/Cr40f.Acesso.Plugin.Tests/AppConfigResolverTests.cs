using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Cr40f.Acesso.Plugin;
using Cr40f.AppConfig;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

/// <summary>Paridade com o pacote TypeScript: os dois lados leem packages/app-config/casos.json (copiado como casos.json).</summary>
public sealed class AppConfigResolverTests
{
    private static Dictionary<string, object?> Arquivo() => JsonLeve.Ler(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "casos.json")));
    private static List<object?> Casos() => (List<object?>)Arquivo()["casos"]!;
    private static Dictionary<string, object?> Obj(object? o) => (Dictionary<string, object?>)o!;

    public static IEnumerable<object[]> Indices() => Enumerable.Range(0, Casos().Count).Select(i => new object[] { i });

    private static AppConfigMatriz? Matriz(object? json)
    {
        if (json is null) return null;
        var m = new AppConfigMatriz();
        foreach (var perfil in AppConfigResolver.Perfis)
            if (Obj(json).TryGetValue(perfil, out var valores) && valores is not null)
                foreach (var par in Obj(valores)) m.Do(perfil)[par.Key] = (bool)par.Value!;
        return m;
    }

    private static AppConfigPessoa Pessoa(Dictionary<string, object?> json)
    {
        var p = new AppConfigPessoa();
        if (json.TryGetValue("vinculo", out var v) && v is decimal d) p.Vinculo = (int)d;
        if (json.TryGetValue("piloto", out var pi) && pi is bool b) p.Piloto = b;
        if (json.TryGetValue("excecoes", out var ex) && ex is List<object?> lista)
            foreach (var item in lista.Select(Obj))
                p.Excecoes.Add(new AppConfigExcecao
                {
                    Chave = (string)item["chave"]!, Ligado = (bool)item["ligado"]!,
                    Validade = item.TryGetValue("validade", out var val) ? val as string : null,
                    Encerrada = item.TryGetValue("encerrada", out var enc) && enc is true,
                });
        return p;
    }

    [Fact]
    public void Catalogo_do_csharp_e_o_do_json()
    {
        var doJson = ((List<object?>)Arquivo()["catalogo"]!).Select(Obj).ToList();
        Assert.Equal(doJson.Count, AppConfigCatalogo.Chaves.Count);
        for (var i = 0; i < doJson.Count; i++)
        {
            var j = doJson[i]; var c = AppConfigCatalogo.Chaves[i]; var padrao = Obj(j["padrao"]);
            Assert.Equal((string)j["chave"]!, c.Chave);
            Assert.Equal((string)j["rotulo"]!, c.Rotulo);
            Assert.Equal((string)j["tipo"]!, c.Tipo);
            Assert.Equal(j["pai"] as string, c.Pai);
            Assert.Equal((bool)j["fixa"]!, c.Fixa);
            Assert.Equal((bool)j["sensivel"]!, c.Sensivel);
            Assert.Equal((bool)padrao["proprio"]!, c.PadraoProprio);
            Assert.Equal((bool)padrao["terceiro"]!, c.PadraoTerceiro);
            Assert.Equal((bool)padrao["admin"]!, c.PadraoAdmin);
        }
    }

    [Theory]
    [MemberData(nameof(Indices))]
    public void Casos_compartilhados(int indice)
    {
        var caso = Obj(Casos()[indice]);
        var efetiva = AppConfigResolver.Efetiva(Matriz(caso["matriz"]), Pessoa(Obj(caso["pessoa"])), (string)caso["hoje"]!, null);
        Assert.Equal(AppConfigCatalogo.Chaves.Select(c => c.Chave), efetiva.Ordem);
        foreach (var par in Obj(caso["esperado"])) Assert.True((bool)par.Value! == efetiva.Chaves[par.Key], (string)caso["nome"]! + " / " + par.Key);
        if (caso.TryGetValue("origens", out var origens) && origens is not null)
            foreach (var par in Obj(origens)) Assert.True((string)par.Value! == efetiva.Origens[par.Key], (string)caso["nome"]! + " / origem de " + par.Key);
        if (caso.TryGetValue("perfil", out var perfil)) Assert.Equal((string)perfil!, efetiva.Perfil);
        if (caso.TryGetValue("piloto", out var piloto)) Assert.Equal((bool)piloto!, efetiva.Piloto);
        if (caso.TryGetValue("semVinculo", out var sem)) Assert.Equal((bool)sem!, efetiva.SemVinculo);
    }

    [Fact]
    public void Comparar_lista_so_o_que_muda_em_valor_resolvido()
    {
        var antes = new AppConfigMatriz(); antes.Proprio["history"] = true; antes.Terceiro["history"] = true;
        var depois = new AppConfigMatriz(); depois.Proprio["history"] = false; depois.Terceiro["history"] = true;
        var m = Assert.Single(AppConfigResolver.Comparar(antes, depois));
        Assert.Equal(("history", "proprio", true, false), (m.Chave, m.Perfil, m.De, m.Para));
        Assert.Empty(AppConfigResolver.Comparar(null, new AppConfigMatriz()));
    }

    [Fact]
    public void Validar_recusa_chave_fora_do_catalogo_e_chave_fixa_desligada()
    {
        var m = new AppConfigMatriz(); m.Proprio["nao-existe"] = true; m.Terceiro["services"] = false; m.Terceiro["comunicados"] = true;
        var erros = AppConfigResolver.Validar(m);
        Assert.Contains(erros, e => e.Codigo == "CHAVE_INVALIDA" && e.Chave == "nao-existe");
        Assert.Contains(erros, e => e.Codigo == "CHAVE_FIXA" && e.Chave == "services");
        Assert.Equal(2, erros.Count);
    }

    [Fact]
    public void Hoje_em_Sao_Paulo_vira_o_dia_as_03h_UTC()
    {
        Assert.Equal("2026-11-23", AppConfigResolver.HojeSaoPaulo(new DateTime(2026, 11, 24, 2, 59, 0, DateTimeKind.Utc)));
        Assert.Equal("2026-11-24", AppConfigResolver.HojeSaoPaulo(new DateTime(2026, 11, 24, 3, 0, 0, DateTimeKind.Utc)));
    }

    [Fact]
    public void Resolver_nao_aceita_chave_fora_do_catalogo()
        => Assert.Throws<ArgumentOutOfRangeException>(() => AppConfigResolver.Resolver("inexistente", null, null, "2026-11-23"));
}

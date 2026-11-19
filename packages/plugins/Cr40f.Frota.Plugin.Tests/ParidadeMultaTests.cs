using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

[DataContract]
public sealed class FixtureMultas
{
    [DataMember(Name = "hoje")] public string Hoje { get; set; } = "";
    [DataMember(Name = "divisoes")] public List<CasoDivisao> Divisoes { get; set; } = new();
    [DataMember(Name = "avaliacoes")] public List<CasoAvaliacao> Avaliacoes { get; set; } = new();
    [DataMember(Name = "validacoes")] public List<CasoValidacao> Validacoes { get; set; } = new();
    [DataMember(Name = "aplicacoes")] public List<CasoAplicacao> Aplicacoes { get; set; } = new();

    public static FixtureMultas Carregar() => Json.Ler<FixtureMultas>(File.ReadAllText(FixtureParidade.Caminho("Fixtures", "multa-etapas.json")));
}

[DataContract]
public sealed class CasoAvaliacao
{
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "multa")] public MultaEstado Multa { get; set; } = new();
    [DataMember(Name = "etapa")] public string Etapa { get; set; } = "";
    [DataMember(Name = "pendentes")] public List<string> Pendentes { get; set; } = new();
    [DataMember(Name = "proximoPasso")] public string ProximoPasso { get; set; } = "";
    [DataMember(Name = "proximoPrazo")] public string? ProximoPrazo { get; set; }
    [DataMember(Name = "prazoVencido")] public bool PrazoVencido { get; set; }
    [DataMember(Name = "aguardandoPenalidade")] public bool AguardandoPenalidade { get; set; }
    [DataMember(Name = "descontando")] public bool Descontando { get; set; }
    [DataMember(Name = "aguardandoTermo")] public bool AguardandoTermo { get; set; }
}

[DataContract]
public sealed class CasoDivisao
{
    [DataMember(Name = "valor")] public decimal Valor { get; set; }
    [DataMember(Name = "parcelas")] public int Parcelas { get; set; }
    [DataMember(Name = "primeira")] public string Primeira { get; set; } = "";
    [DataMember(Name = "esperado")] public List<ParcelaEsperada> Esperado { get; set; } = new();
}

[DataContract]
public sealed class ParcelaEsperada
{
    [DataMember(Name = "numero")] public int Numero { get; set; }
    [DataMember(Name = "competencia")] public string Competencia { get; set; } = "";
    [DataMember(Name = "valor")] public decimal Valor { get; set; }
}

[DataContract]
public sealed class CasoValidacao
{
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "multa")] public MultaEstado Multa { get; set; } = new();
    [DataMember(Name = "passo")] public string Passo { get; set; } = "";
    [DataMember(Name = "dados")] public DadosPasso? Dados { get; set; }
    [DataMember(Name = "erro")] public string? Erro { get; set; }
}

[DataContract]
public sealed class CasoAplicacao
{
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "multa")] public MultaEstado Multa { get; set; } = new();
    [DataMember(Name = "passo")] public string Passo { get; set; } = "";
    [DataMember(Name = "dados")] public DadosPasso? Dados { get; set; }
    [DataMember(Name = "mudancas")] public List<string> Mudancas { get; set; } = new();
}

public class ParidadeMultaTests
{
    private static string Linha(string nome, string etapa, IEnumerable<string> pendentes, string passo, string? prazo, bool vencido, bool penalidade, bool descontando, bool termo)
        => $"{nome} | {etapa} | {string.Join(",", pendentes)} | {passo} | {prazo ?? "null"} | {vencido} | {penalidade} | {descontando} | {termo}";

    [Fact]
    public void Avalia_igual_ao_shell()
    {
        var f = FixtureMultas.Carregar();
        Assert.NotEmpty(f.Avaliacoes);
        foreach (var c in f.Avaliacoes)
        {
            var s = MultaEtapas.Avaliar(c.Multa, f.Hoje);
            Assert.Equal(Linha(c.Nome, c.Etapa, c.Pendentes, c.ProximoPasso, c.ProximoPrazo, c.PrazoVencido, c.AguardandoPenalidade, c.Descontando, c.AguardandoTermo),
                Linha(c.Nome, s.Etapa, s.Pendentes, s.ProximoPasso, s.ProximoPrazo, s.PrazoVencido, s.AguardandoPenalidade, s.Descontando, s.AguardandoTermo));
        }
    }

    [Fact]
    public void Valida_igual_ao_shell()
    {
        var f = FixtureMultas.Carregar();
        Assert.NotEmpty(f.Validacoes);
        foreach (var c in f.Validacoes)
            Assert.Equal($"{c.Nome}: {c.Erro ?? "ok"}", $"{c.Nome}: {MultaEtapas.Validar(c.Multa, c.Passo, c.Dados ?? new DadosPasso(), f.Hoje) ?? "ok"}");
    }

    [Fact]
    public void Aplica_igual_ao_shell()
    {
        var f = FixtureMultas.Carregar();
        Assert.NotEmpty(f.Aplicacoes);
        foreach (var c in f.Aplicacoes)
        {
            var dados = c.Dados ?? new DadosPasso();
            Assert.Null(MultaEtapas.Validar(c.Multa, c.Passo, dados, f.Hoje));
            var depois = MultaEtapas.Aplicar(c.Multa, c.Passo, dados, f.Hoje);
            var mudancas = MultaEtapas.Mudancas(c.Multa, depois).Select(m => $"{m.Key}={MultaEtapas.Formatar(m.Value)}").OrderBy(x => x, StringComparer.Ordinal);
            Assert.Equal($"{c.Nome}: {string.Join(" ", c.Mudancas)}", $"{c.Nome}: {string.Join(" ", mudancas)}");
        }
    }

    [Fact]
    public void Divisoes_do_fixture()
    {
        var casos = FixtureMultas.Carregar().Divisoes;
        Assert.NotEmpty(casos);
        foreach (var c in casos)
        {
            var plano = MultaParcelas.Dividir(c.Valor, c.Parcelas, c.Primeira);
            Assert.Equal(c.Esperado.Select(e => (e.Numero, e.Competencia, e.Valor)), plano.Select(p => (p.Numero, p.Competencia, p.Valor)));
        }
    }

    [Fact]
    public void Todo_passo_tem_rotulo()
    {
        Assert.All(Passos.Todos, p => Assert.True(MultaEtapas.RotuloPasso.ContainsKey(p), p));
    }

    [Fact]
    public void Aplicar_nao_muda_o_estado_de_entrada()
    {
        var antes = new MultaEstado { Status = MultaCodigos.Identificar };
        MultaEtapas.Aplicar(antes, Passos.DefinirResponsavel, new DadosPasso { Responsavel = "empresa" }, "2026-11-17");
        Assert.Equal(MultaCodigos.Identificar, antes.Status);
        Assert.Null(antes.Responsavel);
    }
}

using System;
using System.Collections.Generic;
using Cr40f.Acesso.Plugin;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class AcessoRulesTests
{
    [Theory]
    [InlineData("João da Silva Ávila", "joao.avila")]
    [InlineData("  maria   clara  ", "maria.clara")]
    [InlineData("José", "jose")]
    [InlineData("Ana-Lúcia D'Ávila", "ana-lucia.davila")]
    public void PrefixoEmail_usa_primeiro_e_ultimo_nome_sem_acentos(string nome, string esperado)
        => Assert.Equal(esperado, AcessoRules.PrefixoEmail(nome));

    [Fact]
    public void EmailComSufixo_devolve_sem_sufixo_quando_livre()
        => Assert.Equal("joao.avila@betinhos.com.br", AcessoRules.EmailComSufixo("joao.avila", "betinhos.com.br", _ => false));

    [Fact]
    public void EmailComSufixo_incrementa_a_partir_de_2()
    {
        var ocupados = new HashSet<string> { "joao.avila@betinhos.com.br", "joao.avila2@betinhos.com.br" };
        Assert.Equal("joao.avila3@betinhos.com.br", AcessoRules.EmailComSufixo("joao.avila", "betinhos.com.br", ocupados.Contains));
    }

    [Theory]
    [InlineData("(12) 99123-4567", "+5512991234567")]
    [InlineData("12991234567", "+5512991234567")]
    [InlineData("+55 12 99123-4567", "+5512991234567")]
    [InlineData("1234", null)]
    [InlineData("", null)]
    public void NormalizarCelular_aceita_formatos_brasileiros(string bruto, string? esperado)
        => Assert.Equal(esperado, AcessoRules.NormalizarCelular(bruto));

    [Fact]
    public void GerarSenha_tem_14_caracteres_com_letra_numero_e_simbolo()
    {
        var senha = AcessoRules.GerarSenha(new Random(7));
        Assert.Equal(14, senha.Length);
        Assert.Contains(senha, char.IsUpper);
        Assert.Contains(senha, char.IsLower);
        Assert.Contains(senha, char.IsDigit);
        Assert.Contains(senha, c => "!@#$%&*?".IndexOf(c) >= 0);
        Assert.DoesNotContain(senha, c => "0O1lI".IndexOf(c) >= 0);
    }

    [Theory]
    [InlineData("João da Silva", true)]
    [InlineData("João", false)]
    [InlineData("", false)]
    public void NomeValido_exige_dois_nomes(string nome, bool esperado) => Assert.Equal(esperado, AcessoRules.NomeValido(nome));

    [Fact]
    public void PrimeiroNome_e_a_primeira_palavra() => Assert.Equal("João", AcessoRules.PrimeiroNome("  João da Silva "));
}

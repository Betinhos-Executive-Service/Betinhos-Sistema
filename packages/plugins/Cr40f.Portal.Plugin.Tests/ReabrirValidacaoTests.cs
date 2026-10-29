using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;
using P = Cr40f.Portal.Plugin.ReabrirValidacaoPlugin;

namespace Cr40f.Portal.Plugin.Tests;

public class ReabrirValidacaoTests
{
    // Quarta, 28/10/2026 10:00 em Brasília. +5 úteis pulando Finados (02/11) → 05/11.
    static readonly DateTime Agora = new(2026, 10, 28, 13, 0, 0, DateTimeKind.Utc);
    const int Aprovado = 100000003;

    static Entity Composicao(Guid id, decimal total) => new(P.Composicao, id) { [P.CpValor] = new Money(total) };
    static Entity Reserva(Guid composicao) => new(P.Reserva, Guid.NewGuid()) { [P.ReservaCpLookup] = new EntityReference(P.Composicao, composicao) };
    static Entity Validacao(Entity reserva, int status, decimal liberado, int estado = 0) => new(P.Validacao, Guid.NewGuid())
    {
        [P.ValReserva] = reserva.ToEntityReference(), [P.ValStatus] = new OptionSetValue(status), [P.ValValorLiberado] = new Money(liberado),
        ["statecode"] = new OptionSetValue(estado), [P.ValAprovadoEm] = Agora.AddDays(-1), [P.ValAprovadoPor] = "validador@tenaris.com",
    };

    static FakeContext Update(Guid composicao, decimal? totalAntes = null, int depth = 1)
    {
        var ctx = new FakeContext("Update", P.Composicao, composicao, depth);
        if (totalAntes.HasValue) ctx.PreEntityImages[P.ImagemAnterior] = new Entity(P.Composicao, composicao) { [P.CpValor] = new Money(totalAntes.Value) };
        return ctx;
    }

    [Fact]
    public void Aprovado_com_preco_novo_volta_para_liberado_com_valor_anterior_e_prazo_novo()
    {
        var cp = Guid.NewGuid();
        var reserva = Reserva(cp);
        var val = Validacao(reserva, Aprovado, 500m);
        var service = new FakeService().Com(Composicao(cp, 650m), reserva, val);

        Assert.Equal(1, P.Processar(Update(cp, 500m), service, Agora));

        Assert.Equal(P.StatusLiberado, val.GetAttributeValue<OptionSetValue>(P.ValStatus).Value);
        Assert.Equal(500m, val.GetAttributeValue<Money>(P.ValValorAnterior).Value);
        Assert.Equal(650m, val.GetAttributeValue<Money>(P.ValValorLiberado).Value);
        Assert.Equal(new DateTime(2026, 11, 5), val[P.ValPrazo]);
        Assert.Equal(Agora, val[P.ValLiberadoEm]);
        Assert.Null(val[P.ValAprovadoEm]);
        Assert.Null(val[P.ValAprovadoPor]);
        Assert.DoesNotContain(service.Atualizados, e => e.LogicalName == P.Composicao);
    }

    [Fact]
    public void Mesmo_valor_nao_muda_nada_com_ou_sem_imagem()
    {
        var cp = Guid.NewGuid();
        var reserva = Reserva(cp);
        var service = new FakeService().Com(Composicao(cp, 500m), reserva, Validacao(reserva, Aprovado, 500m));

        Assert.Equal(0, P.Processar(Update(cp, 500m), service, Agora));
        Assert.Equal(0, P.Processar(Update(cp), service, Agora));
        Assert.Empty(service.Atualizados);
    }

    [Fact]
    public void Segunda_execucao_e_idempotente()
    {
        var cp = Guid.NewGuid();
        var reserva = Reserva(cp);
        var service = new FakeService().Com(Composicao(cp, 650m), reserva, Validacao(reserva, Aprovado, 500m));

        Assert.Equal(1, P.Processar(Update(cp), service, Agora));
        Assert.Equal(0, P.Processar(Update(cp), service, Agora));
        Assert.Single(service.Atualizados);
    }

    [Fact]
    public void Retirado_inativo_ou_sem_validacao_nao_muda_nada()
    {
        var cp = Guid.NewGuid();
        var r1 = Reserva(cp);
        var r2 = Reserva(cp);
        var service = new FakeService().Com(Composicao(cp, 650m), r1, r2, Reserva(cp),
            Validacao(r1, P.StatusRetirado, 500m), Validacao(r2, Aprovado, 500m, estado: 1));

        Assert.Equal(0, P.Processar(Update(cp, 500m), service, Agora));
        Assert.Empty(service.Atualizados);
    }

    [Fact]
    public void Duas_reservas_na_mesma_composicao_reabrem_as_duas()
    {
        var cp = Guid.NewGuid();
        var r1 = Reserva(cp);
        var r2 = Reserva(cp);
        var outra = Reserva(Guid.NewGuid());
        var service = new FakeService().Com(Composicao(cp, 650m), r1, r2, outra,
            Validacao(r1, Aprovado, 500m), Validacao(r2, 100000001, 500m), Validacao(outra, Aprovado, 500m));

        Assert.Equal(2, P.Processar(Update(cp, 500m), service, Agora));
        var atualizadas = service.Linhas(P.Validacao).Where(v => v.GetAttributeValue<Money>(P.ValValorLiberado).Value == 650m).ToList();
        Assert.Equal(2, atualizadas.Count);
        Assert.All(atualizadas, v => Assert.Equal(P.StatusLiberado, v.GetAttributeValue<OptionSetValue>(P.ValStatus).Value));
    }

    [Fact]
    public void Depth_maior_que_1_sai_sem_ler_nem_gravar()
    {
        var cp = Guid.NewGuid();
        var reserva = Reserva(cp);
        var service = new FakeService().Com(Composicao(cp, 650m), reserva, Validacao(reserva, Aprovado, 500m));

        Assert.Equal(0, P.Processar(Update(cp, 500m, depth: 2), service, Agora));
        Assert.Empty(service.Atualizados);
        Assert.Equal(0, service.Leituras);
    }
}

public class DiasUteisTests
{
    [Fact]
    public void Sexta_mais_5_cai_na_sexta_seguinte() => Assert.Equal(new DateTime(2026, 10, 23), DiasUteis.Somar(new DateTime(2026, 10, 16)));

    [Fact]
    public void Pula_Finados() => Assert.Equal(new DateTime(2026, 11, 9), DiasUteis.Somar(new DateTime(2026, 10, 30)));

    [Fact]
    public void Hoje_em_Brasilia_usa_UTC_menos_3() => Assert.Equal(new DateTime(2026, 10, 30), DiasUteis.HojeEmBrasilia(new DateTime(2026, 10, 31, 2, 59, 0, DateTimeKind.Utc)));

    // Mesma lista de apps/portal-cliente/src/domain/regras.ts (2026–2027).
    [Theory]
    [InlineData(2026, "2026-01-01 2026-04-03 2026-04-21 2026-05-01 2026-09-07 2026-10-12 2026-11-02 2026-11-15 2026-11-20 2026-12-25")]
    [InlineData(2027, "2027-01-01 2027-03-26 2027-04-21 2027-05-01 2027-09-07 2027-10-12 2027-11-02 2027-11-15 2027-11-20 2027-12-25")]
    public void Feriados_nacionais(int ano, string esperado) =>
        Assert.Equal(esperado, string.Join(" ", DiasUteis.Feriados(ano).OrderBy(d => d).Select(d => d.ToString("yyyy-MM-dd"))));
}

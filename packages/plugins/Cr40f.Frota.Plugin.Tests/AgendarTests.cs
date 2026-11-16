using System;
using System.Linq;
using Cr40f.Frota.Plugin.Manutencao;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class AgendarTests
{
    static readonly DateTime Agora = new(2026, 11, 16, 13, 0, 0, DateTimeKind.Utc);
    readonly Guid _manutencaoId = Guid.NewGuid();
    readonly EntityReference _veiculo = new("cr40f_veiculos", Guid.NewGuid());

    Entity Manutencao(int status, DateTime? aprovadaEm = null) => new(M.Tabela, _manutencaoId)
    {
        [M.Status] = new OptionSetValue(status),
        [M.Veiculo] = _veiculo,
        [M.DataAprovacao] = aprovadaEm,
    };

    Entity Linha(int status, Guid? motorista = null) => new(G.Tabela, Guid.NewGuid())
    {
        [G.Manutencao] = new EntityReference(M.Tabela, _manutencaoId),
        [G.Categoria] = new OptionSetValue(G.CategoriaManutencao),
        [G.Status] = new OptionSetValue(status),
        [G.Motorista] = motorista is null ? null : new EntityReference("cr40f_funcionarios", motorista.Value),
        [G.FoiProgramado] = motorista is not null,
        ["statecode"] = new OptionSetValue(0),
    };

    ManutencaoService Servico(MemoriaService memoria) => new(memoria, () => Agora);

    AgendarPedido Semana(string? comentario = null) => new() { ManutencaoId = _manutencaoId.ToString(), Inicio = "2026-11-16", Fim = "2026-11-22", Comentario = comentario };

    [Fact]
    public void Primeiro_encaixe_cria_a_linha_da_Geral_e_agenda()
    {
        var memoria = new MemoriaService().Com(Manutencao(M.Solicitado));

        var resposta = Servico(memoria).Agendar(Semana("Levar até sexta"));

        var linha = memoria.Todas(G.Tabela).Single();
        Assert.Equal(resposta.GeralId, linha.Id.ToString());
        Assert.Equal(G.CategoriaManutencao, linha.GetAttributeValue<OptionSetValue>(G.Categoria).Value);
        Assert.Equal(_manutencaoId, linha.GetAttributeValue<EntityReference>(G.Manutencao).Id);
        Assert.Equal(_veiculo.Id, linha.GetAttributeValue<EntityReference>(G.Veiculo).Id);
        Assert.Equal(new DateTime(2026, 11, 16, 3, 0, 0, DateTimeKind.Utc), linha.GetAttributeValue<DateTime>(G.Saida));
        Assert.Equal(G.StatusAProgramar, linha.GetAttributeValue<OptionSetValue>(G.Status).Value);
        Assert.False(linha.GetAttributeValue<bool>(G.FoiProgramado));
        Assert.Equal(G.NaoFaturavel, linha.GetAttributeValue<OptionSetValue>(G.StatusFaturamento).Value);
        Assert.Equal(202410011, linha.GetAttributeValue<OptionSetValue>(G.StatusFaturamento).Value);
        Assert.Equal(G.TipoVeiculoBasico, linha.GetAttributeValue<OptionSetValue>(G.TipoVeiculo).Value);
        Assert.Equal(G.TipoServicoManutencao, linha.GetAttributeValue<OptionSetValue>(G.TipoServico).Value);
        Assert.Equal(G.TextoManutencao, linha.GetAttributeValue<string>(G.Destino));
        Assert.Equal(G.TextoManutencao, linha.GetAttributeValue<string>(G.ObsFaturamento));
        Assert.Equal(G.TextoTrajeto, linha.GetAttributeValue<string>(G.Trajeto));
        Assert.Equal("Levar até sexta", linha.GetAttributeValue<string>(G.ObsOperacao));
        Assert.False(linha.Contains(G.ObsInterna));
        Assert.False(linha.Contains(G.Motorista));

        var m = memoria.Linha(M.Tabela, _manutencaoId);
        Assert.Equal(M.Agendado, m.GetAttributeValue<OptionSetValue>(M.Status).Value);
        Assert.Equal(new DateTime(2026, 11, 16), m.GetAttributeValue<DateTime>(M.JanelaInicio));
        Assert.Equal(new DateTime(2026, 11, 22), m.GetAttributeValue<DateTime>(M.JanelaFim));
        Assert.Equal(Agora, m.GetAttributeValue<DateTime>(M.DataAprovacao));
        Assert.Equal("Levar até sexta", m.GetAttributeValue<string>(M.ComentarioAoMotorista));
    }

    [Fact]
    public void Primeiro_encaixe_leva_o_comentario_do_aprovador_para_a_observacao_interna()
    {
        var m = Manutencao(M.Solicitado);
        m[M.ComentarioAprovador] = "Cobrar orçamento";
        var memoria = new MemoriaService().Com(m);

        Servico(memoria).Agendar(Semana());

        var linha = memoria.Todas(G.Tabela).Single();
        Assert.Equal("Cobrar orçamento", linha.GetAttributeValue<string>(G.ObsInterna));
        Assert.False(linha.Contains(G.ObsOperacao));
    }

    [Fact]
    public void Reagendar_reaproveita_a_linha_tira_o_motorista_e_mantem_a_data_do_primeiro_encaixe()
    {
        var primeiroEncaixe = new DateTime(2026, 11, 10, 12, 0, 0, DateTimeKind.Utc);
        var linha = Linha(G.StatusProgramado, Guid.NewGuid());
        var memoria = new MemoriaService().Com(Manutencao(M.Programado, primeiroEncaixe), linha);

        var resposta = Servico(memoria).Agendar(new AgendarPedido { ManutencaoId = _manutencaoId.ToString(), Inicio = "2026-11-25", Fim = "2026-11-25" });

        Assert.Equal(linha.Id.ToString(), resposta.GeralId);
        Assert.Single(memoria.Todas(G.Tabela));
        var atual = memoria.Linha(G.Tabela, linha.Id);
        Assert.Null(atual.GetAttributeValue<EntityReference>(G.Motorista));
        Assert.Equal(G.StatusAProgramar, atual.GetAttributeValue<OptionSetValue>(G.Status).Value);
        Assert.False(atual.GetAttributeValue<bool>(G.FoiProgramado));
        Assert.Equal(new DateTime(2026, 11, 25, 3, 0, 0, DateTimeKind.Utc), atual.GetAttributeValue<DateTime>(G.Saida));
        Assert.False(atual.Contains(G.ObsOperacao)); // sem comentário novo, não mexe
        var m = memoria.Linha(M.Tabela, _manutencaoId);
        Assert.Equal(M.Agendado, m.GetAttributeValue<OptionSetValue>(M.Status).Value);
        Assert.Equal(primeiroEncaixe, m.GetAttributeValue<DateTime>(M.DataAprovacao));
    }

    [Fact]
    public void Reagendar_com_comentario_novo_atualiza_a_observacao_da_operacao()
    {
        var linha = Linha(G.StatusProgramado, Guid.NewGuid());
        var memoria = new MemoriaService().Com(Manutencao(M.Programado), linha);

        Servico(memoria).Agendar(new AgendarPedido { ManutencaoId = _manutencaoId.ToString(), Inicio = "2026-11-25", Fim = "2026-11-25", Comentario = "Agora só na quarta" });

        Assert.Equal("Agora só na quarta", memoria.Linha(G.Tabela, linha.Id).GetAttributeValue<string>(G.ObsOperacao));
    }

    [Fact]
    public void Linha_cancelada_nao_conta_como_ativa()
    {
        var memoria = new MemoriaService().Com(Manutencao(M.Solicitado), Linha(G.StatusCancelado));
        Servico(memoria).Agendar(Semana());
        Assert.Equal(2, memoria.Todas(G.Tabela).Count());
    }

    [Fact]
    public void Duas_linhas_ativas_e_erro()
    {
        var memoria = new MemoriaService().Com(Manutencao(M.Agendado), Linha(G.StatusAProgramar), Linha(G.StatusAProgramar));
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Agendar(Semana()));
        Assert.Contains("mais de uma", erro.Message);
    }

    [Fact]
    public void Sem_veiculo_nao_encaixa()
    {
        var m = Manutencao(M.Solicitado);
        m[M.Veiculo] = null;
        var memoria = new MemoriaService().Com(m);
        Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Agendar(Semana()));
        Assert.Empty(memoria.Criados);
    }

    [Fact]
    public void Realizada_nao_encaixa()
    {
        var memoria = new MemoriaService().Com(Manutencao(M.Realizado));
        Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Agendar(Semana()));
    }

    [Fact]
    public void Reprovar_exige_comentario_e_cancela_a_linha()
    {
        var linha = Linha(G.StatusAProgramar);
        var memoria = new MemoriaService().Com(Manutencao(M.Solicitado), linha);
        Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Reprovar(new MotivoPedido { ManutencaoId = _manutencaoId.ToString(), Comentario = " " }));

        Servico(memoria).Reprovar(new MotivoPedido { ManutencaoId = _manutencaoId.ToString(), Comentario = "Já foi feito semana passada" });

        var m = memoria.Linha(M.Tabela, _manutencaoId);
        Assert.Equal(M.Reprovado, m.GetAttributeValue<OptionSetValue>(M.Status).Value);
        Assert.Equal("Já foi feito semana passada", m.GetAttributeValue<string>(M.ComentarioAprovador));
        Assert.Equal(G.StatusCancelado, memoria.Linha(G.Tabela, linha.Id).GetAttributeValue<OptionSetValue>(G.Status).Value);
    }

    [Fact]
    public void Cancelar_programada_grava_manutencao_antes_da_linha()
    {
        var linha = Linha(G.StatusProgramado, Guid.NewGuid());
        var memoria = new MemoriaService().Com(Manutencao(M.Programado), linha);

        Servico(memoria).Cancelar(new MotivoPedido { ManutencaoId = _manutencaoId.ToString(), Comentario = "Carro vendido" });

        Assert.Equal(M.Cancelado, memoria.Linha(M.Tabela, _manutencaoId).GetAttributeValue<OptionSetValue>(M.Status).Value);
        Assert.Equal(G.StatusCancelado, memoria.Linha(G.Tabela, linha.Id).GetAttributeValue<OptionSetValue>(G.Status).Value);
        Assert.Equal(M.Tabela, memoria.Atualizados.First().LogicalName); // espelho vê a manutenção já encerrada
    }
}

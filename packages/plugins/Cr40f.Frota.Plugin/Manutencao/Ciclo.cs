using System;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Frota.Plugin.Manutencao;

/// <summary>Regras do ciclo da manutenção, sem Dataverse. Spec: docs/superpowers/specs/2026-11-16-manutencoes-v2-design.md.</summary>
public static class Ciclo
{
    static readonly int[] Pagamentos = { M.PagamentoCartao, M.PagamentoPedidoCompra, M.PagamentoPix, M.PagamentoDinheiro };

    public static InvalidPluginExecutionException Erro(string mensagem) => new(mensagem);

    /// <summary>Um dia (início = fim) ou uma semana de segunda a domingo.</summary>
    public static (DateTime Inicio, DateTime Fim) ValidarJanela(string inicio, string fim)
    {
        var i = LerDia(inicio);
        var f = LerDia(fim);
        if (i == f) return (i, f);
        if (i.DayOfWeek == DayOfWeek.Monday && f == i.AddDays(6)) return (i, f);
        throw Erro("A janela precisa ser um dia ou uma semana de segunda a domingo.");
    }

    /// <summary>00:00 de Brasília (UTC−3, sem horário de verão desde 2019) em UTC.</summary>
    public static DateTime InicioDoDiaUtc(DateTime dia) => DateTime.SpecifyKind(dia.Date.AddHours(3), DateTimeKind.Utc);

    public static void ExigirAgendavel(int status)
    {
        if (status is not (M.Solicitado or M.Agendado or M.Programado)) throw Erro("Só dá para encaixar uma manutenção em aberto.");
    }

    public static void ExigirReprovavel(int status)
    {
        if (status != M.Solicitado) throw Erro("Só dá para reprovar uma manutenção que ainda não foi encaixada.");
    }

    public static void ExigirCancelavel(int status)
    {
        if (Encerrada(status)) throw Erro("Esta manutenção já foi encerrada.");
    }

    public static void ExigirConcluivel(int status)
    {
        if (Encerrada(status)) throw Erro("Esta manutenção já foi encerrada.");
    }

    public static bool Encerrada(int status) => status is M.Realizado or M.Reprovado or M.Cancelado;

    public static void ValidarConclusao(ConcluirPedido p)
    {
        if (p.Servicos is null || p.Servicos.Length == 0) throw Erro("Escolha pelo menos um serviço realizado.");
        var fora = p.Servicos.Where(s => !Catalogo.Servicos.ContainsKey(s)).ToList();
        if (fora.Count > 0) throw Erro("Serviço desconhecido: " + string.Join(", ", fora) + ".");
        if (p.Km <= 0) throw Erro("Informe o km do veículo.");
        if (p.Valor <= 0) throw Erro("Informe o valor pago.");
        if (!Pagamentos.Contains(p.Pagamento)) throw Erro("Escolha a forma de pagamento.");
        if (string.IsNullOrWhiteSpace(p.Estabelecimento)) throw Erro("Informe o estabelecimento.");
        if (!Guid.TryParse(p.CidadeId, out _)) throw Erro("Informe a cidade.");
        if (!Guid.TryParse(p.RealizadoPorId, out _)) throw Erro("Informe quem realizou a manutenção.");
        LerDataHora(p.Data);
    }

    public static DateTime LerDataHora(string valor)
    {
        if (!DateTimeOffset.TryParse(valor, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var data))
            throw Erro("Data da manutenção inválida.");
        return data.UtcDateTime;
    }

    /// <summary>
    /// Novo status da manutenção quando a linha da Geral muda, ou null se não muda. Só age em manutenção encaixada
    /// (Agendado/Programado); conclusão e cancelamento são das Custom APIs, que gravam a manutenção antes da linha.
    /// </summary>
    public static int? Espelho(int statusManutencao, int? statusGeral, bool temMotorista)
    {
        if (statusManutencao is not (M.Agendado or M.Programado)) return null;
        if (statusGeral is G.StatusConcluido or G.StatusCancelado or G.StatusCanceladoComReservas) return null;
        var programada = statusGeral == G.StatusProgramado && temMotorista;
        if (programada && statusManutencao == M.Agendado) return M.Programado;
        if (!programada && statusManutencao == M.Programado) return M.Agendado;
        return null;
    }

    static DateTime LerDia(string valor)
    {
        if (!DateTime.TryParseExact(valor, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dia))
            throw Erro("Data da janela inválida (use aaaa-mm-dd).");
        return dia.Date;
    }
}

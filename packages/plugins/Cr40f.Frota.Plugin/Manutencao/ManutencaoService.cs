using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin.Manutencao;

/// <summary>
/// Ações da manutenção. Ordem das gravações: a manutenção encerrada é gravada antes da linha da Geral,
/// para o espelho (GeralManutencaoEspelhoPlugin) ver o estado final e não reabrir nada.
/// </summary>
public sealed partial class ManutencaoService
{
    readonly IOrganizationService _service;
    readonly Func<DateTime> _agoraUtc;

    public ManutencaoService(IOrganizationService service, Func<DateTime> agoraUtc)
    {
        _service = service;
        _agoraUtc = agoraUtc;
    }

    public AgendarResposta Agendar(AgendarPedido pedido)
    {
        var id = Id(pedido.ManutencaoId);
        var (inicio, fim) = Ciclo.ValidarJanela(pedido.Inicio, pedido.Fim);
        var m = _service.Retrieve(M.Tabela, id, new ColumnSet(M.Status, M.Veiculo, M.DataAprovacao, M.ComentarioAprovador));
        Ciclo.ExigirAgendavel(Status(m));
        var veiculo = m.GetAttributeValue<EntityReference>(M.Veiculo) ?? throw Ciclo.Erro("A manutenção não tem veículo. Informe o veículo antes de encaixar.");
        var saida = Ciclo.InicioDoDiaUtc(inicio);

        var linha = LinhaGeral.Ativa(_service, id);
        Guid geralId;
        if (linha is null)
            geralId = _service.Create(LinhaGeral.Nova(id, veiculo, saida, pedido.Comentario, m.GetAttributeValue<string>(M.ComentarioAprovador)));
        else
        {
            geralId = linha.Id;
            _service.Update(LinhaGeral.Reabrir(linha.Id, veiculo, saida, pedido.Comentario));
        }

        var patch = new Entity(M.Tabela, id)
        {
            [M.JanelaInicio] = inicio,
            [M.JanelaFim] = fim,
            [M.Status] = new OptionSetValue(M.Agendado),
        };
        if (m.GetAttributeValue<DateTime?>(M.DataAprovacao) is null) patch[M.DataAprovacao] = _agoraUtc();
        if (!string.IsNullOrWhiteSpace(pedido.Comentario)) patch[M.ComentarioAoMotorista] = pedido.Comentario!.Trim();
        _service.Update(patch);
        return new AgendarResposta { GeralId = geralId.ToString() };
    }

    public void Reprovar(MotivoPedido pedido)
    {
        var id = Id(pedido.ManutencaoId);
        if (string.IsNullOrWhiteSpace(pedido.Comentario)) throw Ciclo.Erro("Escreva o motivo da reprovação.");
        var m = _service.Retrieve(M.Tabela, id, new ColumnSet(M.Status));
        Ciclo.ExigirReprovavel(Status(m));
        Encerrar(id, M.Reprovado, pedido.Comentario!);
    }

    public void Cancelar(MotivoPedido pedido)
    {
        var id = Id(pedido.ManutencaoId);
        var m = _service.Retrieve(M.Tabela, id, new ColumnSet(M.Status));
        Ciclo.ExigirCancelavel(Status(m));
        Encerrar(id, M.Cancelado, pedido.Comentario);
    }

    void Encerrar(Guid id, int status, string? comentario)
    {
        var linha = LinhaGeral.Ativa(_service, id);
        var patch = new Entity(M.Tabela, id) { [M.Status] = new OptionSetValue(status) };
        if (!string.IsNullOrWhiteSpace(comentario)) patch[M.ComentarioAprovador] = comentario!.Trim();
        _service.Update(patch);
        if (linha is not null) _service.Update(LinhaGeral.Cancelar(linha.Id));
    }

    static Guid Id(string valor) => Guid.TryParse(valor, out var id) ? id : throw Ciclo.Erro("Manutenção não informada.");

    static int Status(Entity e, string coluna = M.Status) => e.GetAttributeValue<OptionSetValue>(coluna)?.Value ?? M.Solicitado;
}

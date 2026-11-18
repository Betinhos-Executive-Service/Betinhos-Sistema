using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

[DataContract]
public sealed class ResultadoParcela
{
    [DataMember(Name = "id", Order = 1)] public string Id { get; set; } = "";
    [DataMember(Name = "ok", Order = 2)] public bool Ok { get; set; }
    [DataMember(Name = "erro", Order = 3)] public string? Erro { get; set; }
}

[DataContract]
public sealed class ResultadoLancamento
{
    [DataMember(Name = "parcelas", Order = 1)] public List<ResultadoParcela> Parcelas { get; set; } = new();
    [DataMember(Name = "encerradas", Order = 2)] public List<string> Encerradas { get; set; } = new();
    [DataMember(Name = "reabertas", Order = 3)] public List<string> Reabertas { get; set; } = new();
}

/// <summary>
/// Custom API global cr40f_LancarDescontoFolha (spec RH §5). Lança ou desfaz parcelas de new_parcelamultafolha em lote; recusa por linha.
/// A multa muda só por Execute de cr40f_PassoMulta (ConcluirDesconto/ReabrirDesconto), como quem chama, para a MultaTravaPlugin valer.
/// Um Execute aninhado que falha aborta a transação inteira mesmo capturado: por isso o passo só é chamado depois de MultaEtapas.Validar
/// aceitar localmente, e o erro dele nunca é capturado aqui.
/// </summary>
public sealed class LancarDescontoFolhaPlugin : IPlugin
{
    public const string Mensagem = "cr40f_LancarDescontoFolha";
    public const int Cancelada = 100000002, Maximo = 200;

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelo lançamento da folha.");
            var json = context.InputParameters.Contains("ParcelaIdsJson") ? Convert.ToString(context.InputParameters["ParcelaIdsJson"]) : null;
            var acao = context.InputParameters.Contains("Acao") ? Convert.ToString(context.InputParameters["Acao"]) ?? "" : "";
            List<Guid> ids;
            try { ids = string.IsNullOrWhiteSpace(json) ? new List<Guid>() : Json.Ler<List<Guid>>(json!); }
            catch (Exception) { throw new InvalidPluginExecutionException("Lista de parcelas inválida."); }
            var hoje = FrotaPendenciasPlugin.ResolverHoje(null, DateTime.UtcNow);
            var caller = factory.CreateOrganizationService(context.UserId);
            var r = Executar(factory.CreateOrganizationService(null), ids, acao, hoje, (multa, passo, dados) =>
                caller.Execute(new OrganizationRequest(PassoMultaPlugin.Mensagem) { ["MultaId"] = multa, ["Passo"] = passo, ["DadosJson"] = dados }));
            context.OutputParameters["ResultadoJson"] = Json.Serializar(r);
            tracing.Trace("{0}: {1} em {2} parcelas, {3} encerradas, {4} reabertas", Mensagem, acao, ids.Count, r.Encerradas.Count, r.Reabertas.Count);
        }
        catch (InvalidPluginExecutionException) { throw; }
        catch (Exception error)
        {
            tracing.Trace("{0}: {1}", Mensagem, error);
            throw new InvalidPluginExecutionException("Não foi possível lançar as parcelas. Recarregue a tela e tente de novo.");
        }
    }

    public static ResultadoLancamento Executar(IOrganizationService sistema, IReadOnlyList<Guid> ids, string acao, string hoje, Action<Guid, string, string> passo)
    {
        if (acao != "lancar" && acao != "desfazer") throw new InvalidPluginExecutionException("Ação inválida: use lancar ou desfazer.");
        if (ids.Count < 1 || ids.Count > Maximo) throw new InvalidPluginExecutionException($"Escolha de 1 a {Maximo} parcelas.");
        var unicos = ids.Distinct().ToList();
        var q = new QueryExpression(PassoMultaPlugin.Parcelas) { ColumnSet = new ColumnSet("new_status", "new_multa") };
        q.Criteria.AddCondition("new_parcelamultafolhaid", ConditionOperator.In, unicos.Cast<object>().ToArray());
        var achadas = sistema.RetrieveMultiple(q).Entities.ToDictionary(e => e.Id);
        var lancar = acao == "lancar";
        var r = new ResultadoLancamento();
        var multas = new List<Guid>();
        foreach (var id in ids)
        {
            var linha = new ResultadoParcela { Id = id.ToString() };
            r.Parcelas.Add(linha);
            if (!achadas.TryGetValue(id, out var p)) { linha.Erro = "Parcela não encontrada."; continue; }
            var status = p.GetAttributeValue<OptionSetValue>("new_status")?.Value;
            linha.Erro = status == Cancelada ? "Esta parcela foi cancelada."
                : lancar && status == PassoMultaPlugin.Descontada ? "Esta parcela já foi lançada."
                : !lancar && status == PassoMultaPlugin.Prevista ? "Esta parcela ainda não foi lançada."
                : status != PassoMultaPlugin.Prevista && status != PassoMultaPlugin.Descontada ? "Situação da parcela desconhecida."
                : null;
            if (linha.Erro != null) continue;
            var novo = new OptionSetValue(lancar ? PassoMultaPlugin.Descontada : PassoMultaPlugin.Prevista);
            sistema.Update(new Entity(PassoMultaPlugin.Parcelas, id)
            {
                ["new_status"] = novo,
                ["new_lancadoem"] = lancar ? MultaMapper.DataGravada(hoje) : null,
            });
            p["new_status"] = novo; // id repetido no lote vira recusa
            linha.Ok = true;
            if (p.GetAttributeValue<EntityReference>("new_multa") is EntityReference m && !multas.Contains(m.Id)) multas.Add(m.Id);
        }
        foreach (var multaId in multas)
        {
            var estado = MultaMapper.Estado(sistema.Retrieve(MultaMapper.Tabela, multaId, new ColumnSet(MultaMapper.Colunas)));
            PassoMultaPlugin.ContarParcelas(sistema, multaId, estado);
            var nome = lancar ? Passos.ConcluirDesconto : Passos.ReabrirDesconto;
            var dados = lancar ? new DadosPasso { Data = hoje } : new DadosPasso();
            if (MultaEtapas.Validar(estado, nome, dados, hoje) != null) continue; // ainda há prevista, ou nada a reabrir
            passo(multaId, nome, Json.Serializar(dados));
            (lancar ? r.Encerradas : r.Reabertas).Add(multaId.ToString());
        }
        return r;
    }
}

using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

/// <summary>
/// Custom API global cr40f_PassoMulta (spec §5.2). Roda como quem chama (executeprivilegename = gravar cr40f_multas): valida o passo
/// com MultaEtapas, grava só o que mudou e devolve a situação seguinte. A trava (MultaTravaPlugin) reconhece esta mensagem no ParentContext.
/// </summary>
public sealed class PassoMultaPlugin : IPlugin
{
    public const string Mensagem = "cr40f_PassoMulta";
    public const string Parcelas = "new_parcelamultafolha";
    public static readonly string[] ApisDoTermo = { "new_AssinarTermoMulta", "new_ContestarTermoMulta" };
    public const int Prevista = 100000000, Descontada = 100000001;

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelo passo da multa.");
            var multaId = context.InputParameters.Contains("MultaId") && context.InputParameters["MultaId"] is Guid g && g != Guid.Empty
                ? g : throw new InvalidPluginExecutionException("Informe a multa.");
            var passo = context.InputParameters.Contains("Passo") ? Convert.ToString(context.InputParameters["Passo"]) ?? "" : "";
            var dados = context.InputParameters.Contains("DadosJson") ? Convert.ToString(context.InputParameters["DadosJson"]) : null;
            var hoje = FrotaPendenciasPlugin.ResolverHoje(null, DateTime.UtcNow);
            // Parcelas: a trava do termo só deixa o servidor gravar; criadas pelo SYSTEM com o dono = quem fez o acerto.
            context.OutputParameters["MultaJson"] = Executar(factory.CreateOrganizationService(context.UserId), multaId, passo, dados, hoje, factory.CreateOrganizationService(null), context.UserId, MultaTravaPlugin.TemPai(context, ApisDoTermo));
            tracing.Trace("{0}: {1} gravado na multa {2}", Mensagem, passo, multaId);
        }
        catch (InvalidPluginExecutionException) { throw; }
        catch (Exception error)
        {
            tracing.Trace("{0}: {1}", Mensagem, error);
            // O detalhe técnico fica só no trace: a tela mostra a mensagem do 400 como veio.
            throw new InvalidPluginExecutionException("Não foi possível gravar o passo da multa. Recarregue a tela e tente de novo.");
        }
    }

    public static string Executar(IOrganizationService service, Guid multaId, string passo, string? dadosJson, string hoje, IOrganizationService? sistema = null, Guid? dono = null, bool viaTermo = false)
    {
        sistema ??= service;
        DadosPasso? dados;
        try { dados = string.IsNullOrWhiteSpace(dadosJson) ? null : Json.Ler<DadosPasso>(dadosJson!); }
        catch (Exception) { throw new InvalidPluginExecutionException("Dados do passo inválidos."); }
        dados ??= new DadosPasso(); // "null" no JSON vale dados vazios: a validação do passo recusa com a mensagem do que falta.
        var linha = service.Retrieve(MultaMapper.Tabela, multaId, new ColumnSet(MultaMapper.Colunas));
        var antes = MultaMapper.Estado(linha);
        if ((passo == Passos.TermoAssinado || passo == Passos.TermoContestado) && !viaTermo)
            throw new InvalidPluginExecutionException("Este passo é registrado pelo termo do motorista.");
        var termoVigente = MultaMapper.CarregarTermo(sistema, linha, antes);
        if (passo == Passos.RegistrarAcerto && dados.Acerto == "folha" && antes.TermoParcelas != null && antes.TermoPrimeiroMes == null)
            throw new InvalidPluginExecutionException("O termo assinado não tem o primeiro mês; confira o termo antes de lançar na folha.");
        if (passo == Passos.Cancelar || passo == Passos.ConcluirDesconto || passo == Passos.ReabrirDesconto) ContarParcelas(sistema, multaId, antes); // só estes passos leem a contagem
        var erro = MultaEtapas.Validar(antes, passo, dados, hoje);
        if (erro != null) throw new InvalidPluginExecutionException(erro);
        var trocaMotorista = (passo == Passos.DefinirResponsavel && dados.Responsavel == "motorista") || !string.IsNullOrWhiteSpace(dados.MotoristaId);
        if (trocaMotorista && !Guid.TryParse(dados.MotoristaId, out _)) throw new InvalidPluginExecutionException("Motorista inválido.");
        var depois = MultaEtapas.Aplicar(antes, passo, dados, hoje);
        if (passo == Passos.RegistrarAcerto && dados.Acerto == "folha")
            CriarParcelas(sistema, multaId, linha.GetAttributeValue<string>("cr40f_novacoluna") ?? "sem número", antes, dados, dono, termoVigente);
        var mudancas = MultaEtapas.Mudancas(antes, depois);
        if (mudancas.Count > 0) service.Update(MultaMapper.Gravacao(multaId, mudancas));
        if (passo == Passos.PrazoVencido && antes.TermoPendente == true && termoVigente is Guid t)
        {
            sistema.Update(new Entity(MultaMapper.Termo, t) { ["new_status"] = new OptionSetValue(MultaMapper.TermoCancelado) });
            sistema.Update(new Entity(MultaMapper.Tabela, multaId) { ["new_termovigente"] = null });
        }
        return Json.Serializar(MultaEtapas.Avaliar(depois, hoje));
    }

    public static void ContarParcelas(IOrganizationService s, Guid multaId, MultaEstado e)
    {
        var q = new QueryExpression(Parcelas) { ColumnSet = new ColumnSet("new_status") };
        q.Criteria.AddCondition("new_multa", ConditionOperator.Equal, multaId);
        var status = s.RetrieveMultiple(q).Entities.Select(p => p.GetAttributeValue<OptionSetValue>("new_status")?.Value).ToList();
        e.ParcelasPrevistas = status.Count(v => v == Prevista);
        e.ParcelasDescontadas = status.Count(v => v == Descontada);
    }

    private static void CriarParcelas(IOrganizationService s, Guid multaId, string auto, MultaEstado m, DadosPasso d, Guid? dono, Guid? termoId)
    {
        foreach (var p in MultaParcelas.Dividir(m.ValorPago!.Value, d.Parcelas ?? 1, d.Competencia!))
        {
            var e = new Entity(Parcelas)
            {
                ["new_name"] = $"Multa {auto} · {p.Numero}/{p.Total}",
                ["new_multa"] = new EntityReference(MultaMapper.Tabela, multaId),
                ["new_motorista"] = new EntityReference("cr40f_funcionarios", Guid.Parse(m.MotoristaId!)),
                ["new_numero"] = p.Numero,
                ["new_competencia"] = MultaMapper.DataGravada(p.Competencia),
                ["new_valor"] = new Money(p.Valor),
                ["new_status"] = new OptionSetValue(Prevista),
            };
            if (m.TermoParcelas != null && termoId is Guid tid) e["new_termo"] = new EntityReference(MultaMapper.Termo, tid);
            if (dono is Guid u && u != Guid.Empty) e["ownerid"] = new EntityReference("systemuser", u);
            s.Create(e);
        }
    }
}

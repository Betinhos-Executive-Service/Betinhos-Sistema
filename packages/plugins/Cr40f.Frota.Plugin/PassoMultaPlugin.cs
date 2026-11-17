using System;
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
            context.OutputParameters["MultaJson"] = Executar(factory.CreateOrganizationService(context.UserId), multaId, passo, dados, hoje);
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

    public static string Executar(IOrganizationService service, Guid multaId, string passo, string? dadosJson, string hoje)
    {
        DadosPasso? dados;
        try { dados = string.IsNullOrWhiteSpace(dadosJson) ? null : Json.Ler<DadosPasso>(dadosJson!); }
        catch (Exception) { throw new InvalidPluginExecutionException("Dados do passo inválidos."); }
        dados ??= new DadosPasso(); // "null" no JSON vale dados vazios: a validação do passo recusa com a mensagem do que falta.
        var antes = MultaMapper.Estado(service.Retrieve(MultaMapper.Tabela, multaId, new ColumnSet(MultaMapper.Colunas)));
        var erro = MultaEtapas.Validar(antes, passo, dados, hoje);
        if (erro != null) throw new InvalidPluginExecutionException(erro);
        var trocaMotorista = (passo == Passos.DefinirResponsavel && dados.Responsavel == "motorista") || !string.IsNullOrWhiteSpace(dados.MotoristaId);
        if (trocaMotorista && !Guid.TryParse(dados.MotoristaId, out _)) throw new InvalidPluginExecutionException("Motorista inválido.");
        var depois = MultaEtapas.Aplicar(antes, passo, dados, hoje);
        var mudancas = MultaEtapas.Mudancas(antes, depois);
        if (mudancas.Count > 0) service.Update(MultaMapper.Gravacao(multaId, mudancas));
        return Json.Serializar(MultaEtapas.Avaliar(depois, hoje));
    }
}

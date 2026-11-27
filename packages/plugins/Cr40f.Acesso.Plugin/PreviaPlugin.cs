using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>Custom API cr40f_AcessoPrevia (ação): o que a pessoa deixa de ter com um pedido de perfis. Não grava nada.</summary>
public sealed class PreviaPlugin : IPlugin
{
    public const string Mensagem = "cr40f_AcessoPrevia";

    public PreviaPlugin(string unsecureConfig, string secureConfig) { }

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada: " + context.MessageName);
        try
        {
            var sistema = factory.CreateOrganizationService(null);
            var usuario = context.InputParameters.Contains("Usuario") && context.InputParameters["Usuario"] is Guid id ? id : Guid.Empty;
            var perfis = context.InputParameters.Contains("Perfis") ? context.InputParameters["Perfis"] as string : null;
            var tabelas = context.InputParameters.Contains("Tabelas") ? context.InputParameters["Tabelas"] as string : null;
            context.OutputParameters["Resultado"] = new PreviaHandler(sistema, context.OrganizationId, DateTime.UtcNow)
                .Executar(context.InitiatingUserId, usuario, perfis, DefinirPerfisPlugin.Sim(context, "RetirarAmplo"), tabelas);
        }
        catch (AcessoException erro)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro.Message);
            throw new InvalidPluginExecutionException(erro.Message, erro);
        }
        catch (Exception erro) when (erro is not InvalidPluginExecutionException)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro);
            throw new InvalidPluginExecutionException("Não foi possível montar a prévia.", erro);
        }
    }
}

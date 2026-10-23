using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Cadastro.Plugin;

/// <summary>Custom API new_GerarLinkCadastro. Erro de regra volta em new_LinkJson (ok=false); exceção só em falha inesperada.</summary>
public sealed class GerarLinkCadastroPlugin : IPlugin
{
    public const string Mensagem = "new_GerarLinkCadastro";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelo link de cadastro.");
            var usuario = factory.CreateOrganizationService(context.InitiatingUserId);
            var sistema = factory.CreateOrganizationService(null);
            var handler = new GerarLinkCadastroHandler(usuario, sistema);
            context.OutputParameters["new_LinkJson"] = handler.Executar(Texto(context, "new_ReservaId"), Texto(context, "new_PassageiroId"));
        }
        catch (Exception erro)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro);
            throw erro is InvalidPluginExecutionException ? erro : new InvalidPluginExecutionException("Não foi possível gerar o link de cadastro. " + erro.Message, erro);
        }
    }

    private static string? Texto(IPluginExecutionContext c, string nome) => c.InputParameters.Contains(nome) && c.InputParameters[nome] is string s && s.Length > 0 ? s : null;
}

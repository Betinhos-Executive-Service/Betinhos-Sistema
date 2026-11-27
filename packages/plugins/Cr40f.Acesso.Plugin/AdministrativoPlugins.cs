using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>Custom API cr40f_AcessoEncerrar: encerra o acesso de um administrativo (papéis, perfis de coluna, equipes e bloqueio).</summary>
public sealed class EncerrarAdministrativoPlugin : IPlugin
{
    public const string Mensagem = "cr40f_AcessoEncerrar";
    public EncerrarAdministrativoPlugin(string unsecureConfig, string secureConfig) { }

    public void Execute(IServiceProvider serviceProvider) => AdministrativoPlugin.Rodar(serviceProvider, Mensagem, "Não foi possível encerrar o acesso.",
        (sistema, context) => new EncerrarAdministrativoHandler(sistema).Executar(context.InitiatingUserId, AdministrativoPlugin.Usuario(context),
            context.InputParameters.Contains("Confirmacao") ? context.InputParameters["Confirmacao"] as string : null));
}

/// <summary>Custom API cr40f_AcessoReativar: reativa o acesso de um administrativo com o que o último encerramento tirou.</summary>
public sealed class ReativarAdministrativoPlugin : IPlugin
{
    public const string Mensagem = "cr40f_AcessoReativar";
    public ReativarAdministrativoPlugin(string unsecureConfig, string secureConfig) { }

    public void Execute(IServiceProvider serviceProvider) => AdministrativoPlugin.Rodar(serviceProvider, Mensagem, "Não foi possível reativar o acesso.",
        (sistema, context) => new ReativarAdministrativoHandler(sistema).Executar(context.InitiatingUserId, AdministrativoPlugin.Usuario(context)));
}

internal static class AdministrativoPlugin
{
    public static Guid Usuario(IPluginExecutionContext context) =>
        context.InputParameters.Contains("Usuario") && context.InputParameters["Usuario"] is Guid id ? id : Guid.Empty;

    public static void Rodar(IServiceProvider serviceProvider, string mensagem, string falha, Func<IOrganizationService, IPluginExecutionContext, Etapas> executar)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        if (context.MessageName != mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada: " + context.MessageName);
        try
        {
            // Serviço do sistema também na autorização: o chamador pode não ler systemuserroles/role.
            context.OutputParameters["Etapas"] = executar(factory.CreateOrganizationService(null), context).ToJson();
        }
        catch (AcessoException erro)
        {
            tracing.Trace("{0}: {1}", mensagem, erro.Message);
            throw new InvalidPluginExecutionException(erro.Message + (erro.Data["Etapas"] is string etapas ? " | etapas=" + etapas : ""), erro);
        }
        catch (Exception erro) when (erro is not InvalidPluginExecutionException)
        {
            tracing.Trace("{0}: {1}", mensagem, erro);
            throw new InvalidPluginExecutionException(falha + " " + erro.Message, erro);
        }
    }
}

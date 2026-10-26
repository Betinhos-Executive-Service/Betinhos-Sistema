using System;
using System.Net;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Cadastro.Plugin;

/// <summary>Custom API new_ObterFotoPassageiro. Step síncrono (stage 40) cuja configuração segura é a URL do gatilho do flow de consulta.</summary>
public sealed class ObterFotoPassageiroPlugin : IPlugin
{
    public const string Mensagem = "new_ObterFotoPassageiro";
    private readonly string? _secure;
    public ObterFotoPassageiroPlugin(string unsecureConfig, string secureConfig) { _secure = secureConfig; }

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pela foto do passageiro.");
        try
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var sistema = factory.CreateOrganizationService(null);
            var handler = new ObterFotoPassageiroHandler(sistema, new ConsultaArquivoFlow((_secure ?? "").Trim()), m => tracing.Trace("{0}: {1}", Mensagem, m));
            context.OutputParameters["new_FotoJson"] = handler.Executar(context.InitiatingUserId, Texto(context, "new_ReservaId"), Texto(context, "new_PassageiroId"));
        }
        catch (Exception erro)
        {
            // Configuração ausente ou falha inesperada: detalhe só no trace, resposta genérica.
            tracing.Trace("{0}: {1}", Mensagem, erro);
            context.OutputParameters["new_FotoJson"] = ObterFotoPassageiroHandler.Negado;
        }
    }

    private static string? Texto(IPluginExecutionContext c, string nome) => c.InputParameters.Contains(nome) && c.InputParameters[nome] is string s && s.Length > 0 ? s : null;
}

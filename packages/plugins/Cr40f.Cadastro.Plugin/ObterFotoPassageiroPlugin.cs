using System;
using System.Net;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Cadastro.Plugin;

/// <summary>Custom API new_ObterFotoPassageiro. Step síncrono (stage 40). A URL do gatilho do flow de consulta vem da variável new_URLFlowConsultarArquivosSharePoint; a configuração segura do step é só fallback.</summary>
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
            Action<string> trace = m => tracing.Trace("{0}: {1}", Mensagem, m);
            var url = UrlFlowConsulta.Ler(sistema, _secure, trace);
            var handler = new ObterFotoPassageiroHandler(sistema, url is null ? null : new ConsultaArquivoFlow(url), trace);
            context.OutputParameters["new_FotoJson"] = handler.Executar(context.InitiatingUserId, Texto(context, "new_ReservaId"), Texto(context, "new_PassageiroId"));
        }
        catch (Exception erro)
        {
            // URL inválida ou falha inesperada: detalhe só no trace (nenhuma mensagem leva a URL), resposta genérica.
            tracing.Trace("{0}: {1}", Mensagem, erro);
            context.OutputParameters["new_FotoJson"] = ObterFotoPassageiroHandler.Negado;
        }
    }

    private static string? Texto(IPluginExecutionContext c, string nome) => c.InputParameters.Contains(nome) && c.InputParameters[nome] is string s && s.Length > 0 ? s : null;
}

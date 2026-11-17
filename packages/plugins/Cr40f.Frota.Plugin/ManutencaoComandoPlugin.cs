using System;
using System.Runtime.Serialization;
using Cr40f.Frota.Plugin.Manutencao;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Frota.Plugin;

/// <summary>
/// Custom APIs globais das manutenções (entrada RequestJson, saída ResponseJson). Rodam no contexto de quem chama:
/// os privilégios do Dataverse continuam valendo (motorista conclui a dele, gestor encaixa).
/// </summary>
public sealed class ManutencaoComandoPlugin : IPlugin
{
    public const string Agendar = "cr40f_ManutencaoAgendar", Reprovar = "cr40f_ManutencaoReprovar", Cancelar = "cr40f_ManutencaoCancelar", Concluir = "cr40f_ManutencaoConcluir";
    public const string Entrada = "RequestJson", Saida = "ResponseJson";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            var service = factory.CreateOrganizationService(context.UserId);
            var json = context.InputParameters.Contains(Entrada) ? context.InputParameters[Entrada] as string : null;
            context.OutputParameters[Saida] = Executar(service, context.MessageName, json ?? "", () => DateTime.UtcNow);
            tracing.Trace("{0}: ok", context.MessageName);
        }
        catch (Exception error)
        {
            tracing.Trace("{0}: {1}", context.MessageName, error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível concluir a ação na manutenção. " + error.Message, error);
        }
    }

    public static string Executar(IOrganizationService service, string mensagem, string json, Func<DateTime> agoraUtc)
    {
        var acoes = new ManutencaoService(service, agoraUtc);
        switch (mensagem)
        {
            case Agendar: return Json.Serializar(acoes.Agendar(Ler<AgendarPedido>(json)));
            case Reprovar: acoes.Reprovar(Ler<MotivoPedido>(json)); return "{}";
            case Cancelar: acoes.Cancelar(Ler<MotivoPedido>(json)); return "{}";
            case Concluir: return Json.Serializar(acoes.Concluir(Ler<ConcluirPedido>(json)));
            default: throw Ciclo.Erro("Ação de manutenção desconhecida: " + mensagem + ".");
        }
    }

    static T Ler<T>(string json) where T : class
    {
        try { return Json.Ler<T>(json) ?? throw Ciclo.Erro("Pedido inválido."); }
        catch (Exception erro) when (erro is SerializationException or System.Xml.XmlException) { throw Ciclo.Erro("Pedido inválido."); }
    }
}

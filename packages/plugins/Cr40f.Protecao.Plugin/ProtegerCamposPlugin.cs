using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Protecao.Plugin;

/// <summary>
/// Step: cr40f_reservadeveculos Update, pré-operação (20) síncrono, filtro nos campos monitorados + snapshot, imagem "pre".
/// Altera só o Target (sem gravação extra). Nunca bloqueia o salvamento: erro vira trace.
/// </summary>
public sealed class ProtegerCamposPlugin : IPlugin
{
    public const string ImagemAnterior = "pre";
    public const string Reserva = "cr40f_reservadeveculos";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        try { Processar(context, tracing); }
        catch (Exception error) { tracing.Trace("Cr40f.Protecao: erro ignorado, gravação segue sem proteção. {0}", error); }
    }

    public static Resultado? Processar(IPluginExecutionContext context, ITracingService? tracing = null)
    {
        if (context.MessageName != "Update" || context.PrimaryEntityName != Reserva) return null;
        if (!(context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity alvo)) return null;
        var anterior = context.PreEntityImages.Contains(ImagemAnterior) ? context.PreEntityImages[ImagemAnterior] : null;
        var resultado = ProtecaoCampos.Aplicar(alvo, anterior);
        if (resultado.Adicionados.Count > 0) tracing?.Trace("Cr40f.Protecao: protegidos {0}", string.Join(",", resultado.Adicionados));
        if (resultado.Barrados.Count > 0) tracing?.Trace("Cr40f.Protecao: sincronização barrada em {0}", string.Join(",", resultado.Barrados));
        return resultado;
    }
}

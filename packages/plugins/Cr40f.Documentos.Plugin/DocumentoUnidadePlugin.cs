using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Documentos.Plugin;

/// <summary>Síncrono em Create/Update de cr40f_documento (PreValidation): documento de veículo na unidade Frota, de funcionário na raiz.</summary>
public sealed class DocumentoUnidadePlugin : IPlugin
{
    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        if (!(context.InputParameters["Target"] is Entity alvo) || alvo.LogicalName != "cr40f_documento") return;
        try
        {
            var antes = context.PreEntityImages.Contains("pre") ? context.PreEntityImages["pre"] : null;
            var unidades = Unidades.Ler(factory.CreateOrganizationService(null));
            var destino = UnidadeDoDocumento.Decidir(context.MessageName, alvo, antes, unidades);
            tracing.Trace("[documentos:unidade] {0} destino={1}", context.MessageName, destino.HasValue ? (destino == unidades.Frota ? "frota" : "raiz") : "nenhum");
            if (destino.HasValue) alvo["owningbusinessunit"] = new EntityReference("businessunit", destino.Value);
        }
        catch (InvalidPluginExecutionException) { throw; }
        catch (Exception error)
        {
            tracing.Trace("[documentos:unidade] erro: {0}", error);
            throw new InvalidPluginExecutionException("Não foi possível definir a unidade do documento. " + error.Message, error);
        }
    }
}

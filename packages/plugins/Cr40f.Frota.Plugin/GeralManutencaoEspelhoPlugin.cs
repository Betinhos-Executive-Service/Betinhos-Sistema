using System;
using Cr40f.Frota.Plugin.Manutencao;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

/// <summary>
/// Step pós-operação síncrono no Update de cr40f_reservadeveculos (filtro: cr40f_status, cr40f_motorista; imagem "pre").
/// Programar a linha de manutenção na Geral põe a manutenção em Programado; voltar para a programar (Confirmado)
/// ou ficar Programado sem motorista volta a Agendado. Outros status da Geral não mexem na manutenção.
/// Grava como SYSTEM: quem programa é a operação, que não precisa de escrita na tabela de manutenções.
/// </summary>
public sealed class GeralManutencaoEspelhoPlugin : IPlugin
{
    public const string ImagemPre = "pre";
    public const string AtributosPre = G.Categoria + "," + G.Manutencao + "," + G.Status + "," + G.Motorista;

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            var target = (Entity)context.InputParameters["Target"];
            var pre = context.PreEntityImages.Contains(ImagemPre) ? context.PreEntityImages[ImagemPre] : null;
            Aplicar(factory.CreateOrganizationService(null), target, pre);
        }
        catch (Exception error)
        {
            tracing.Trace("Espelho da manutenção: {0}", error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível atualizar a manutenção ligada a esta linha. " + error.Message, error);
        }
    }

    public static void Aplicar(IOrganizationService service, Entity target, Entity? pre)
    {
        // Categoria e manutenção vêm só da imagem pre (o que a linha era): um Update que as troque não faz o SYSTEM mexer em outra manutenção.
        if (pre?.GetAttributeValue<OptionSetValue>(G.Categoria)?.Value != G.CategoriaManutencao) return;
        var manutencao = pre.GetAttributeValue<EntityReference>(G.Manutencao);
        if (manutencao is null) return;
        var statusGeral = Final<OptionSetValue>(target, pre, G.Status)?.Value;
        var temMotorista = Final<EntityReference>(target, pre, G.Motorista) is not null;

        var m = service.Retrieve(M.Tabela, manutencao.Id, new ColumnSet(M.Status));
        var atual = m.GetAttributeValue<OptionSetValue>(M.Status)?.Value ?? M.Solicitado;
        var novo = Ciclo.Espelho(atual, statusGeral, temMotorista);
        if (novo is null) return;
        service.Update(new Entity(M.Tabela, manutencao.Id) { [M.Status] = new OptionSetValue(novo.Value) });
    }

    static T? Final<T>(Entity target, Entity? pre, string coluna) where T : class
        => target.Contains(coluna) ? target.GetAttributeValue<T>(coluna) : pre?.GetAttributeValue<T>(coluna);
}

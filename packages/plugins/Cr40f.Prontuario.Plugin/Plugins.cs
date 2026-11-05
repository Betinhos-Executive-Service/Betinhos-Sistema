using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Prontuario.Plugin;

/// <summary>Custom API cr40f_PrepararAnexoProntuario (chamada pelo conector MCP com o login de quem pede).</summary>
public sealed class PrepararAnexoProntuarioPlugin : IPlugin
{
    public const string Mensagem = "cr40f_PrepararAnexoProntuario";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada.");
            // Serviço do sistema: a tabela de liberações não tem privilégio para os papéis comuns; a autorização é a do handler.
            var sistema = factory.CreateOrganizationService(null);
            var saida = new PrepararAnexoHandler(sistema, new PermissoesDataverse(sistema), new ConfiguracaoDataverse(sistema))
                .Executar(context.InitiatingUserId, context.InputParameters.Contains("FuncionarioId") ? context.InputParameters["FuncionarioId"] as string : null);
            context.OutputParameters["LiberacaoId"] = saida.LiberacaoId.ToString("D");
            context.OutputParameters["Token"] = saida.Token;
            context.OutputParameters["ExpiraEm"] = PrepararAnexoHandler.Iso(saida.ExpiraEm);
            context.OutputParameters["UrlEnvio"] = saida.UrlEnvio;
            // Nunca rastreia o token.
            tracing.Trace("{0}: liberação {1} criada para {2}", Mensagem, saida.LiberacaoId, context.InitiatingUserId);
        }
        catch (ProntuarioException erro)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro.Message);
            throw new InvalidPluginExecutionException(erro.Message, erro);
        }
        catch (Exception erro) when (erro is not InvalidPluginExecutionException)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro);
            throw new InvalidPluginExecutionException("Não foi possível preparar o anexo agora. Tente de novo em instantes.", erro);
        }
    }
}

/// <summary>Custom API cr40f_ConsumirAnexoProntuario (só a conta do flow: execute privilege prvWritecr40f_liberacaoanexo).</summary>
public sealed class ConsumirAnexoProntuarioPlugin : IPlugin
{
    public const string Mensagem = "cr40f_ConsumirAnexoProntuario";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada.");
            var sistema = factory.CreateOrganizationService(null);
            string? Texto(string nome) => context.InputParameters.Contains(nome) ? context.InputParameters[nome] as string : null;
            var saida = new ConsumirAnexoHandler(sistema, context.OrganizationId == Liberacao.OrganizacaoDev)
                .Executar(Texto("LiberacaoId"), Texto("Token"), Texto("ArquivosJson"), Texto("Titulo"), Texto("Texto"));
            context.OutputParameters["Ok"] = saida.Ok;
            context.OutputParameters["Codigo"] = saida.Codigo;
            context.OutputParameters["Erro"] = saida.Erro;
            context.OutputParameters["FuncionarioId"] = saida.Ok ? saida.FuncionarioId.ToString("D") : "";
            context.OutputParameters["Solicitante"] = saida.Solicitante;
            context.OutputParameters["Pasta"] = saida.Pasta;
            context.OutputParameters["Titulo"] = saida.Titulo;
            context.OutputParameters["CorpoHtml"] = saida.CorpoHtml;
            context.OutputParameters["ArquivosJson"] = ConsumirAnexoHandler.Escrever(saida.Arquivos);
            tracing.Trace("{0}: ok={1} codigo={2}", Mensagem, saida.Ok, saida.Codigo);
        }
        catch (Exception erro) when (erro is not InvalidPluginExecutionException)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro);
            throw new InvalidPluginExecutionException("Não foi possível validar o anexo.", erro);
        }
    }
}

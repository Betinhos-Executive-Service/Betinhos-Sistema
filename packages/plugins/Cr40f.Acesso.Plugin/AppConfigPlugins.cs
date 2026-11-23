using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>Base das 4 Custom APIs da configuração do App: serviço do sistema (as tabelas não têm Create/Write para papel algum) e mapeamento de erro de domínio.</summary>
public abstract class AppConfigPluginBase : IPlugin
{
    protected abstract string Mensagem { get; }
    protected abstract void Executar(IPluginExecutionContext context, IOrganizationService sistema);

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada: " + context.MessageName);
            Executar(context, factory.CreateOrganizationService(null));
        }
        catch (AcessoException erro)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro.Message);
            throw new InvalidPluginExecutionException(erro.Message, erro);
        }
        catch (Exception erro)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro);
            throw erro is InvalidPluginExecutionException ? erro : new InvalidPluginExecutionException("Não foi possível concluir a operação da configuração do App. " + erro.Message, erro);
        }
    }

    protected static string? Texto(IPluginExecutionContext c, string nome) => c.InputParameters.Contains(nome) && c.InputParameters[nome] is string s && s.Length > 0 ? s : null;
    protected static bool Booleano(IPluginExecutionContext c, string nome) => c.InputParameters.Contains(nome) && c.InputParameters[nome] is true;
    protected static Guid? Guia(IPluginExecutionContext c, string nome) => c.InputParameters.Contains(nome) && c.InputParameters[nome] is Guid g && g != Guid.Empty ? g : null;
}

/// <summary>Custom API cr40f_AppConfigEfetiva: Funcionario (opcional) -> Resultado (JSON).</summary>
public sealed class AppConfigEfetivaPlugin : AppConfigPluginBase
{
    public const string NomeMensagem = "cr40f_AppConfigEfetiva";
    protected override string Mensagem => NomeMensagem;
    protected override void Executar(IPluginExecutionContext c, IOrganizationService sistema)
        => c.OutputParameters["Resultado"] = new AppConfigEfetivaHandler(new AppConfigRepository(sistema), new AppConfigAutorizacao(sistema), () => DateTime.UtcNow).Executar(c.InitiatingUserId, Guia(c, "Funcionario"));
}

/// <summary>Custom API cr40f_AppConfigSalvarRascunho: Conteudo, Base, Descartar -> Marca.</summary>
public sealed class AppConfigSalvarRascunhoPlugin : AppConfigPluginBase
{
    public const string NomeMensagem = "cr40f_AppConfigSalvarRascunho";
    protected override string Mensagem => NomeMensagem;
    protected override void Executar(IPluginExecutionContext c, IOrganizationService sistema)
        => c.OutputParameters["Marca"] = new AppConfigSalvarRascunhoHandler(new AppConfigRepository(sistema), new AppConfigAutorizacao(sistema)).Executar(c.InitiatingUserId, Texto(c, "Conteudo"), Texto(c, "Base"), Booleano(c, "Descartar"));
}

/// <summary>Custom API cr40f_AppConfigPublicar: Nota -> Numero da versão publicada.</summary>
public sealed class AppConfigPublicarPlugin : AppConfigPluginBase
{
    public const string NomeMensagem = "cr40f_AppConfigPublicar";
    protected override string Mensagem => NomeMensagem;
    protected override void Executar(IPluginExecutionContext c, IOrganizationService sistema)
        => c.OutputParameters["Numero"] = new AppConfigPublicarHandler(new AppConfigRepository(sistema), new AppConfigAutorizacao(sistema), () => DateTime.UtcNow).Executar(c.InitiatingUserId, Texto(c, "Nota"));
}

/// <summary>Custom API cr40f_AppConfigDefinirPessoa: Funcionario, Tipo, Chave, Ligado, Motivo, Validade, Encerrar -> Resultado (JSON).</summary>
public sealed class AppConfigDefinirPessoaPlugin : AppConfigPluginBase
{
    public const string NomeMensagem = "cr40f_AppConfigDefinirPessoa";
    protected override string Mensagem => NomeMensagem;
    protected override void Executar(IPluginExecutionContext c, IOrganizationService sistema)
    {
        var funcionario = Guia(c, "Funcionario") ?? throw new AcessoException("MOTORISTA_INVALIDO", "Informe o funcionário.");
        c.OutputParameters["Resultado"] = new AppConfigDefinirPessoaHandler(new AppConfigRepository(sistema), new AppConfigAutorizacao(sistema), () => DateTime.UtcNow)
            .Executar(c.InitiatingUserId, funcionario, Texto(c, "Tipo"), Texto(c, "Chave"), Booleano(c, "Ligado"), Texto(c, "Motivo"), Texto(c, "Validade"), Booleano(c, "Encerrar"));
    }
}

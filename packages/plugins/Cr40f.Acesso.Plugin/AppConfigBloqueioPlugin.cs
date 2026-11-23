using System;
using System.Linq;
using Cr40f.AppConfig;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>
/// Recusa no servidor de um módulo do App desligado para o motorista, quando a gravação é um Create/Update de tabela.
/// <see cref="ColunaFuncionario"/> é o lookup para o dono do registro; null = o registro não aponta para ninguém e vale o próprio chamador.
/// </summary>
public sealed class AppConfigBloqueioRegra
{
    public string Tabela { get; }
    public string Mensagem { get; }
    public string Chave { get; }
    public string TextoRecusa { get; }
    public string? ColunaFuncionario { get; }

    public AppConfigBloqueioRegra(string tabela, string mensagem, string chave, string textoRecusa, string? colunaFuncionario)
    { Tabela = tabela; Mensagem = mensagem; Chave = chave; TextoRecusa = textoRecusa; ColunaFuncionario = colunaFuncionario; }
}

public static class AppConfigBloqueios
{
    /// <summary>Boas ideias: Create em cr40f_boasideias pelo próprio motorista (o Planner do shell grava na mesma tabela, por gestão).</summary>
    public static readonly AppConfigBloqueioRegra Ideias = new(
        "cr40f_boasideias", "Create", "ideas", "Boas ideias não estão disponíveis no seu App no momento. Procure o escritório.", null);

    /// <summary>Treinamentos: o motorista grava abertura, confirmação, assinatura e quiz atualizando a própria participação.</summary>
    public static readonly AppConfigBloqueioRegra Treinamentos = new(
        "cr40f_treinamentoparticipacao", "Update", "treinamentos", "Treinamentos não estão disponíveis no seu App no momento. Procure o escritório.", "cr40f_funcionario");

    public static readonly AppConfigBloqueioRegra[] Todas = { Ideias, Treinamentos };

    /// <summary>Colunas que o motorista grava na participação; o step de Update só dispara por elas (o push e o lembrete do flow não passam por aqui).</summary>
    public static readonly string[] ColunasDoMotoristaNaParticipacao =
    {
        "cr40f_abertoem", "cr40f_confirmadoem", "cr40f_assinadoem", "cr40f_nomeassinante", "cr40f_assinaturajson", "cr40f_nota",
        "cr40f_aprovado", "cr40f_tentativas", "cr40f_respostasjson", "cr40f_concluidoem", "cr40f_conteudosnapshot", "cr40f_conteudohash",
    };

    public static AppConfigBloqueioRegra? Buscar(string? mensagem, string? tabela) =>
        Todas.FirstOrDefault(r => r.Mensagem == mensagem && r.Tabela == tabela);
}

public sealed class AppConfigBloqueioHandler
{
    private readonly AppConfigRepository _repo; private readonly AppConfigAutorizacao _aut; private readonly Func<DateTime> _agoraUtc;
    public AppConfigBloqueioHandler(AppConfigRepository repo, AppConfigAutorizacao aut, Func<DateTime> agoraUtc) { _repo = repo; _aut = aut; _agoraUtc = agoraUtc; }

    /// <summary>
    /// donoDoRegistro = valor da coluna de funcionário do registro (só para regras com ColunaFuncionario). Só recusa quando o chamador é a ficha
    /// ativa do dono do registro; gestão, administrador e conta de serviço nunca são recusados. Lança InvalidPluginExecutionException ao recusar.
    /// </summary>
    public void Executar(Guid chamador, AppConfigBloqueioRegra regra, Guid? donoDoRegistro)
    {
        var email = _repo.EmailDoUsuario(chamador);
        if (string.IsNullOrWhiteSpace(email)) return;
        var ficha = _repo.FichaPorEmail(email!);
        if (ficha is null || !ficha.TemAcesso) return;
        if (regra.ColunaFuncionario is not null && donoDoRegistro != ficha.Id) return; // registro de outra pessoa
        var publicada = _repo.LerPublicada();
        var ligado = AppConfigResolver.Resolver(regra.Chave, AppConfigConteudo.Ler(publicada?.Conteudo), _repo.PessoaDe(ficha), AppConfigResolver.HojeSaoPaulo(_agoraUtc())).Ligado;
        if (ligado) return;
        // Consulta de papéis só no caminho da recusa: o caso comum (módulo ligado) não paga por ela.
        if (_aut.EhGestor(chamador) || _aut.EhContaDeServico(chamador)) return;
        throw new InvalidPluginExecutionException(regra.TextoRecusa);
    }
}

/// <summary>
/// Step síncrono (PreOperation) genérico: uma classe para todos os módulos da tabela <see cref="AppConfigBloqueios"/>, escolhendo a regra
/// por mensagem + tabela. Serviço do sistema: as tabelas da configuração não dão leitura a papel algum.
/// </summary>
public sealed class AppConfigBloqueioPlugin : IPlugin
{
    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        var regra = AppConfigBloqueios.Buscar(context.MessageName, context.PrimaryEntityName);
        if (regra is null) return;
        if (!context.InputParameters.Contains("Target") || context.InputParameters["Target"] is not Entity alvo) return;
        try
        {
            var system = factory.CreateOrganizationService(null);
            Guid? dono = null;
            if (regra.ColunaFuncionario is not null)
                dono = alvo.GetAttributeValue<EntityReference>(regra.ColunaFuncionario)?.Id ?? new AppConfigRepository(system).DonoDoRegistro(regra.Tabela, alvo.Id, regra.ColunaFuncionario);
            var repo = new AppConfigRepository(system);
            new AppConfigBloqueioHandler(repo, new AppConfigAutorizacao(system), () => DateTime.UtcNow).Executar(context.InitiatingUserId, regra, dono);
        }
        catch (InvalidPluginExecutionException) { throw; }
        catch (Exception erro)
        {
            // Falha ao ler a configuração não pode impedir a gravação (falha aberta, só no trace).
            tracing.Trace("AppConfigBloqueio {0}: leitura da configuração falhou, gravação liberada. {1}", regra.Chave, erro);
        }
    }
}

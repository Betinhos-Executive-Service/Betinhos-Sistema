using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;

namespace Cr40f.Acesso.Plugin;

public sealed class Etapas
{
    private readonly List<(string Etapa, string Estado, string Detalhe)> _itens = new();
    public void Feita(string etapa, string detalhe) => _itens.Add((etapa, "feita", detalhe));
    public void Pulada(string etapa, string motivo) => _itens.Add((etapa, "pulada", motivo));
    public void Erro(string etapa, string mensagem) => _itens.Add((etapa, "erro", mensagem));
    /// <summary>Feito em parte; o restante conclui sozinho ou numa nova execução (ex.: Dataverse ainda liberando o usuário).</summary>
    public void Pendente(string etapa, string detalhe) => _itens.Add((etapa, "pendente", detalhe));
    /// <summary>Recebe o tempo de cada etapa (só no trace do plugin; não vai para a tela).</summary>
    public Action<string>? Trace { get; set; }
    /// <summary>Roda a etapa; falha vira erro registrado e, se não for de negócio, GRAPH_INDISPONIVEL.</summary>
    public T Executar<T>(string nome, Func<T> acao)
    {
        var relogio = Stopwatch.StartNew();
        try { return acao(); }
        catch (AcessoException erro) { Erro(nome, erro.Message); throw; }
        catch (Exception erro) { Erro(nome, erro.Message); throw new AcessoException("GRAPH_INDISPONIVEL", "Falha em " + nome + ": " + erro.Message); }
        finally { Trace?.Invoke("etapa " + nome + ": " + relogio.ElapsedMilliseconds + " ms"); }
    }

    public void Executar(string nome, Action acao) => Executar(nome, () => { acao(); return true; });

    public string ToJson()
    {
        var sb = new StringBuilder("[");
        for (var i = 0; i < _itens.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append("{\"etapa\":").Append(JsonLeve.Texto(_itens[i].Etapa))
              .Append(",\"estado\":").Append(JsonLeve.Texto(_itens[i].Estado))
              .Append(",\"detalhe\":").Append(JsonLeve.Texto(_itens[i].Detalhe)).Append('}');
        }
        return sb.Append(']').ToString();
    }
}

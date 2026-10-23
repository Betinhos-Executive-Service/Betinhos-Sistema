using System;
using System.Collections.Generic;
using System.Text;

namespace Cr40f.Acesso.Plugin;

public sealed class Etapas
{
    private readonly List<(string Etapa, string Estado, string Detalhe)> _itens = new();
    public void Feita(string etapa, string detalhe) => _itens.Add((etapa, "feita", detalhe));
    public void Pulada(string etapa, string motivo) => _itens.Add((etapa, "pulada", motivo));
    public void Erro(string etapa, string mensagem) => _itens.Add((etapa, "erro", mensagem));
    /// <summary>Roda a etapa; falha vira erro registrado e, se não for de negócio, GRAPH_INDISPONIVEL.</summary>
    public T Executar<T>(string nome, Func<T> acao)
    {
        try { return acao(); }
        catch (AcessoException erro) { Erro(nome, erro.Message); throw; }
        catch (Exception erro) { Erro(nome, erro.Message); throw new AcessoException("GRAPH_INDISPONIVEL", "Falha em " + nome + ": " + erro.Message); }
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

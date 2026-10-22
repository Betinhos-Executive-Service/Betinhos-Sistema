using System;
namespace Cr40f.Acesso.Plugin;
/// <summary>Erro de domínio: a mensagem viaja como "CODIGO: texto" até a tela.</summary>
public sealed class AcessoException : Exception
{
    public string Codigo { get; }
    public AcessoException(string codigo, string mensagem) : base(codigo + ": " + mensagem) { Codigo = codigo; }
}

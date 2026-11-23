using System;
using System.Collections.Generic;

namespace Cr40f.Acesso.Plugin;

/// <summary>Perfis de uma pessoa: nível por área (chave em minúsculas) e se é Administrador de acessos.</summary>
public sealed class PerfisDoUsuario
{
    public SortedDictionary<string, string> Areas { get; } = new(StringComparer.Ordinal);
    public bool Acessos { get; set; }
}

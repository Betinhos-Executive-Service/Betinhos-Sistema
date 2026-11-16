using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace Betinhos.DriverRecordSharing
{
    // Regras puras da foto repetida (fase 2 da prova de mídia): dHash de 64 bits em hex, distância de Hamming e as 4 faixas
    // de 16 bits que a consulta usa. Com distância até 3, ao menos uma das 4 faixas é igual (3 bits diferentes caem em no
    // máximo 3 faixas), então a busca por faixa igual não perde nenhum parecido.
    public static class ProvaMidiaRepetida
    {
        public const int LimiteParecida = 3;
        public const int Faixas = 4;
        public const int MesesConsiderados = 12;

        // Foto escura, estourada ou tampada dá dHash quase todo 0 ou 1 e casaria com todas as outras assim: com menos de
        // BitsMinimos ou mais de BitsMaximos bits ligados, o dHash fica fora da busca por faixas e só o SHA-256 vale.
        public const int BitsMinimos = 8;
        public const int BitsMaximos = 56;

        // Teto da consulta por faixas: 4 páginas de 250 linhas. Acima disso o trace avisa e o resto não é lido.
        public const int LinhasPorPagina = 250;
        public const int PaginasMaximas = 4;

        public const string ModoObservar = "observar";
        public const string ModoBloquear = "bloquear";

        private static readonly Regex DHashHex = new Regex("^[0-9a-f]{16}$", RegexOptions.CultureInvariant);

        public static bool IsDHash(string value) => value != null && DHashHex.IsMatch(value);

        public static ulong Parse(string hex) => ulong.Parse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture);

        public static int Distancia(ulong a, ulong b)
        {
            var x = a ^ b;
            var bits = 0;
            while (x != 0) { x &= x - 1; bits++; }
            return bits;
        }

        public static bool BaixaEntropia(ulong hash)
        {
            var bits = Distancia(hash, 0);
            return bits < BitsMinimos || bits > BitsMaximos;
        }

        /// <summary>Faixa i (0 a 3) de 16 bits, da mais alta para a mais baixa: o valor gravado nas colunas indexáveis.</summary>
        public static int Faixa(ulong hash, int indice) => (int)((hash >> (48 - 16 * indice)) & 0xFFFF);

        public static int[] TodasAsFaixas(ulong hash) => Enumerable.Range(0, Faixas).Select(i => Faixa(hash, i)).ToArray();

        /// <summary>Menor distância entre qualquer hash novo e qualquer hash guardado (int.MaxValue sem hash dos dois lados).</summary>
        public static int MenorDistancia(IEnumerable<ulong> novos, IEnumerable<ulong> guardados)
        {
            var lista = guardados.ToList();
            var menor = int.MaxValue;
            foreach (var novo in novos)
                foreach (var guardado in lista)
                    menor = Math.Min(menor, Distancia(novo, guardado));
            return menor;
        }

        /// <summary>Valor da variável de ambiente; qualquer coisa diferente de "bloquear" vale como observar.</summary>
        public static string Modo(string valor) =>
            string.Equals((valor ?? "").Trim(), ModoBloquear, StringComparison.OrdinalIgnoreCase) ? ModoBloquear : ModoObservar;
    }
}

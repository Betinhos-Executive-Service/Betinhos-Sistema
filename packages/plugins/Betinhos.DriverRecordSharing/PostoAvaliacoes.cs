using System;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Regras das avaliações de postos: validação do envio e resumo por posto. O autor aparece para os outros motoristas por decisão do Renan.
    // A ocultação da gestão tira só o comentário: o voto continua contando.
    public static class PostoAvaliacoes
    {
        public const int JanelaDias = 365;
        public const int MaxComentario = 280;
        private const int MaxComentariosExibidos = 5;
        private const int MaxMotivosExibidos = 3;
        private static readonly string[] MotivosRecomenda = { "combustivel_bom", "bom_atendimento", "sem_fila", "banheiro_limpo", "local_seguro" };
        private static readonly string[] MotivosNaoRecomenda = { "combustivel_ruim", "mau_atendimento", "fila_grande", "banheiro_ruim", "local_inseguro" };

        public sealed class Avaliacao
        {
            public Guid PostoId, MotoristaId;
            public string Autor, Comentario;
            public bool Recomenda, Oculta;
            public IList<string> Motivos = new List<string>();
            public DateTime DataUtc;
        }

        public sealed class Envio
        {
            public Guid PostoId;
            public bool Recomenda;
            public IList<string> Motivos;
            public string Comentario;
        }

        public sealed class Entrada
        {
            public string postoId;
            public bool? recomenda;
            public List<string> motivos;
            public string comentario;
        }

        public static Envio Validar(string json)
        {
            Entrada entrada;
            try { entrada = new JavaScriptSerializer().Deserialize<Entrada>(json ?? ""); }
            catch (Exception e) when (e is ArgumentException || e is InvalidOperationException) { throw Erro("Avaliação inválida."); }
            if (entrada == null || !Guid.TryParse(entrada.postoId, out var postoId)) throw Erro("Posto inválido.");
            if (entrada.recomenda == null) throw Erro("Diga se recomenda o posto.");

            var permitidos = entrada.recomenda.Value ? MotivosRecomenda : MotivosNaoRecomenda;
            var motivos = (entrada.motivos ?? new List<string>()).Distinct().ToList();
            if (motivos.Any(m => !permitidos.Contains(m))) throw Erro("Motivo inválido.");
            var comentario = (entrada.comentario ?? "").Trim();
            if (comentario.Length > MaxComentario) throw Erro($"O comentário pode ter até {MaxComentario} caracteres.");
            return new Envio { PostoId = postoId, Recomenda = entrada.recomenda.Value, Motivos = motivos, Comentario = comentario };
        }

        private static InvalidPluginExecutionException Erro(string mensagem) => new InvalidPluginExecutionException(mensagem);

        public static Dictionary<string, object> Resumir(IEnumerable<Avaliacao> avaliacoes, Guid motoristaId)
        {
            var lista = avaliacoes.OrderByDescending(a => a.DataUtc).ToList();
            var minha = lista.FirstOrDefault(a => a.MotoristaId == motoristaId);
            var principais = lista.SelectMany(a => a.Motivos).GroupBy(m => m)
                .OrderByDescending(g => g.Count()).ThenBy(g => g.Key, StringComparer.Ordinal)
                .Take(MaxMotivosExibidos).ToList();
            return new Dictionary<string, object>
            {
                ["total"] = lista.Count,
                ["recomendam"] = lista.Count(a => a.Recomenda),
                ["motivos"] = principais.Select(g => g.Key).ToList(),
                ["contagemMotivos"] = principais.ToDictionary(g => g.Key, g => g.Count()),
                ["comentarios"] = lista.Where(a => !a.Oculta && !string.IsNullOrEmpty(a.Comentario)).Take(MaxComentariosExibidos)
                    .Select(a => new Dictionary<string, object>
                    {
                        ["autor"] = a.Autor,
                        ["data"] = FuelRepository.LocalDay(a.DataUtc),
                        ["recomenda"] = a.Recomenda,
                        ["texto"] = a.Comentario
                    }).ToList(),
                ["minha"] = minha == null ? null : new Dictionary<string, object>
                {
                    ["recomenda"] = minha.Recomenda,
                    ["motivos"] = minha.Motivos,
                    ["comentario"] = minha.Comentario ?? ""
                }
            };
        }
    }
}

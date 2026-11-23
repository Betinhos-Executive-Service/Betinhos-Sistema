using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Cr40f.AppConfig;

namespace Cr40f.Acesso.Plugin;

/// <summary>Conteúdo da versão: { "proprio": { chave: true|false }, "terceiro": { ... } }. Administrador não entra.</summary>
public static class AppConfigConteudo
{
    /// <summary>null/vazio = sem matriz. JSON inválido, perfil desconhecido ou valor que não é booleano = CHAVE_INVALIDA.</summary>
    public static AppConfigMatriz? Ler(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        Dictionary<string, object?> raiz;
        try { raiz = JsonLeve.Ler(json!); }
        catch (Exception) { throw new AcessoException("CHAVE_INVALIDA", "Conteúdo da configuração não é um JSON válido."); }
        var matriz = new AppConfigMatriz();
        foreach (var par in raiz)
        {
            if (!AppConfigResolver.Perfis.Contains(par.Key)) throw new AcessoException("CHAVE_INVALIDA", "Perfil fora do esperado: " + par.Key + ".");
            if (par.Value is not Dictionary<string, object?> valores) throw new AcessoException("CHAVE_INVALIDA", "O perfil " + par.Key + " precisa ser um objeto de chaves.");
            foreach (var v in valores)
            {
                if (v.Value is not bool ligado) throw new AcessoException("CHAVE_INVALIDA", "A chave " + v.Key + " precisa ser verdadeiro ou falso.");
                matriz.Do(par.Key)[v.Key] = ligado;
            }
        }
        return matriz;
    }

    /// <summary>Lança o primeiro erro de catálogo: chave fora do catálogo ou chave fixa desligada.</summary>
    public static void Validar(AppConfigMatriz matriz)
    {
        var erro = AppConfigResolver.Validar(matriz).FirstOrDefault();
        if (erro is null) return;
        throw new AcessoException(erro.Codigo, erro.Codigo == "CHAVE_FIXA"
            ? "A chave " + erro.Chave + " é fixa e não pode ser desligada."
            : "A chave " + erro.Chave + " não existe no catálogo.");
    }

    /// <summary>JSON canônico: chaves do catálogo, na ordem do catálogo.</summary>
    public static string Escrever(AppConfigMatriz matriz)
    {
        var sb = new StringBuilder("{");
        for (var p = 0; p < AppConfigResolver.Perfis.Length; p++)
        {
            var perfil = AppConfigResolver.Perfis[p];
            var valores = matriz.Do(perfil);
            sb.Append(p > 0 ? "," : "").Append('"').Append(perfil).Append("\":{");
            sb.Append(string.Join(",", AppConfigCatalogo.Chaves.Where(c => valores.ContainsKey(c.Chave)).Select(c => "\"" + c.Chave + "\":" + (valores[c.Chave] ? "true" : "false"))));
            sb.Append('}');
        }
        return sb.Append('}').ToString();
    }
}

public sealed class AppConfigEfetivaHandler
{
    private readonly AppConfigRepository _repo; private readonly AppConfigAutorizacao _aut; private readonly Func<DateTime> _agoraUtc;
    public AppConfigEfetivaHandler(AppConfigRepository repo, AppConfigAutorizacao aut, Func<DateTime> agoraUtc) { _repo = repo; _aut = aut; _agoraUtc = agoraUtc; }

    /// <summary>funcionarioId null = o próprio chamador (achado pelo e-mail). De outra pessoa: gestor, administrador ou conta de serviço.</summary>
    public string Executar(Guid chamador, Guid? funcionarioId)
    {
        AppConfigFicha? ficha;
        var emailChamador = _repo.EmailDoUsuario(chamador);
        if (funcionarioId is null || funcionarioId == Guid.Empty)
            ficha = string.IsNullOrWhiteSpace(emailChamador) ? null : _repo.FichaPorEmail(emailChamador!);
        else
        {
            ficha = _repo.Ficha(funcionarioId.Value);
            var proprio = ficha?.Email is not null && emailChamador is not null && string.Equals(ficha.Email, emailChamador, StringComparison.OrdinalIgnoreCase);
            if (!proprio && !_aut.EhGestor(chamador) && !_aut.EhContaDeServico(chamador))
                throw new AcessoException("SEM_PERMISSAO", "Só o próprio motorista, a gestão ou a conta de serviço leem a configuração de outro motorista.");
        }
        if (ficha is null || !ficha.TemAcesso) throw new AcessoException("MOTORISTA_INVALIDO", "Funcionário inexistente, inativo ou sem acesso ao App.");
        var publicada = _repo.LerPublicada();
        var matriz = AppConfigConteudo.Ler(publicada?.Conteudo);
        return AppConfigResolver.Efetiva(matriz, _repo.PessoaDe(ficha), AppConfigResolver.HojeSaoPaulo(_agoraUtc()), publicada?.Numero).ToJson();
    }
}

public sealed class AppConfigSalvarRascunhoHandler
{
    private readonly AppConfigRepository _repo; private readonly AppConfigAutorizacao _aut;
    public AppConfigSalvarRascunhoHandler(AppConfigRepository repo, AppConfigAutorizacao aut) { _repo = repo; _aut = aut; }

    /// <summary>Devolve a marca do rascunho gravado (vazia ao descartar); a tela a manda de volta em "baseMarca" no próximo salvamento.</summary>
    public string Executar(Guid chamador, string? conteudo, string? baseMarca, bool descartar)
    {
        _aut.ExigirGestor(chamador);
        var atual = _repo.LerRascunho();
        if (descartar)
        {
            if (atual is not null) _repo.ExcluirVersao(atual.Id);
            return "";
        }
        var matriz = AppConfigConteudo.Ler(conteudo) ?? throw new AcessoException("CHAVE_INVALIDA", "Conteúdo da configuração vazio.");
        AppConfigConteudo.Validar(matriz);
        var json = AppConfigConteudo.Escrever(matriz);
        var base_ = baseMarca ?? "";
        if (atual is null)
        {
            if (base_.Length > 0) throw new AcessoException("RASCUNHO_ALTERADO", "O rascunho que você abriu não existe mais. Recarregue a configuração.");
            _repo.CriarRascunho(json, chamador);
        }
        else
        {
            if (base_ != atual.Marca) throw new AcessoException("RASCUNHO_ALTERADO", "Outra pessoa alterou o rascunho depois que você o abriu. Recarregue a configuração.");
            _repo.AtualizarRascunho(atual.Id, json, chamador);
        }
        return _repo.LerRascunho()!.Marca;
    }
}

public sealed class AppConfigPublicarHandler
{
    private readonly AppConfigRepository _repo; private readonly AppConfigAutorizacao _aut; private readonly Func<DateTime> _agoraUtc;
    public AppConfigPublicarHandler(AppConfigRepository repo, AppConfigAutorizacao aut, Func<DateTime> agoraUtc) { _repo = repo; _aut = aut; _agoraUtc = agoraUtc; }

    /// <summary>Cria a versão seguinte como Publicada, marca a anterior como Substituída e remove o rascunho. Devolve o número.</summary>
    public int Executar(Guid chamador, string? nota)
    {
        _aut.ExigirGestor(chamador);
        var rascunho = _repo.LerRascunho() ?? throw new AcessoException("NADA_A_PUBLICAR", "Não há rascunho para publicar.");
        var matriz = AppConfigConteudo.Ler(rascunho.Conteudo) ?? throw new AcessoException("NADA_A_PUBLICAR", "O rascunho está vazio.");
        AppConfigConteudo.Validar(matriz);
        var publicada = _repo.LerPublicada();
        if (publicada is not null && AppConfigResolver.Comparar(AppConfigConteudo.Ler(publicada.Conteudo), matriz).Count == 0)
            throw new AcessoException("NADA_A_PUBLICAR", "O rascunho é igual à versão " + publicada.Numero + " já publicada.");
        var numero = _repo.MaiorNumero() + 1;
        _repo.CriarPublicada(numero, AppConfigConteudo.Escrever(matriz), nota, chamador, _agoraUtc());
        if (publicada is not null) _repo.Substituir(publicada.Id);
        _repo.ExcluirVersao(rascunho.Id);
        return numero;
    }
}

public sealed class AppConfigDefinirPessoaHandler
{
    private readonly AppConfigRepository _repo; private readonly AppConfigAutorizacao _aut; private readonly Func<DateTime> _agoraUtc;
    public AppConfigDefinirPessoaHandler(AppConfigRepository repo, AppConfigAutorizacao aut, Func<DateTime> agoraUtc) { _repo = repo; _aut = aut; _agoraUtc = agoraUtc; }

    public const string TipoExcecao = "excecao", TipoPiloto = "piloto";

    /// <summary>Cria (ou, com encerrar, encerra) uma exceção de chave ou a entrada no grupo piloto. Devolve JSON { "criadas": n, "encerradas": n }.</summary>
    public string Executar(Guid chamador, Guid funcionarioId, string? tipo, string? chave, bool ligado, string? motivo, string? validade, bool encerrar)
    {
        var piloto = tipo == TipoPiloto;
        if (!piloto && tipo != TipoExcecao) throw new AcessoException("CHAVE_INVALIDA", "Tipo precisa ser 'excecao' ou 'piloto'.");
        if (piloto) _aut.ExigirAdmin(chamador); else _aut.ExigirGestor(chamador);
        var agora = _agoraUtc();
        var tipoLinha = piloto ? AppConfigRepository.TipoPiloto : AppConfigRepository.TipoExcecao;

        if (!piloto)
        {
            var item = AppConfigCatalogo.Buscar(chave) ?? throw new AcessoException("CHAVE_INVALIDA", "A chave " + chave + " não existe no catálogo.");
            if (item.Fixa) throw new AcessoException("CHAVE_FIXA", "A chave " + item.Chave + " é fixa e não aceita exceção.");
        }
        if (encerrar) return Resultado(0, _repo.Encerrar(funcionarioId, tipoLinha, chave, chamador, agora));

        var ficha = _repo.Ficha(funcionarioId);
        if (ficha is null || !ficha.TemAcesso) throw new AcessoException("MOTORISTA_INVALIDO", "Funcionário inexistente, inativo ou sem acesso ao App.");
        if (piloto)
        {
            // Já está no piloto: nada a fazer (idempotente).
            if (_repo.TemPilotoAberto(funcionarioId)) return Resultado(0, 0);
            _repo.CriarPiloto(funcionarioId, ficha.Nome, motivo, chamador);
            return Resultado(1, 0);
        }
        if (string.IsNullOrWhiteSpace(motivo)) throw new AcessoException("MOTIVO_OBRIGATORIO", "Informe o motivo da exceção.");
        if (!string.IsNullOrEmpty(validade))
        {
            var hoje = AppConfigResolver.HojeSaoPaulo(agora);
            if (!DateTime.TryParseExact(validade, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) || string.CompareOrdinal(validade, hoje) < 0)
                throw new AcessoException("VALIDADE_INVALIDA", "A validade precisa ser hoje ou uma data futura (aaaa-mm-dd).");
        }
        // Exceção nova numa chave que já tem exceção vigente encerra a anterior.
        var encerradas = _repo.Encerrar(funcionarioId, tipoLinha, chave, chamador, agora);
        _repo.CriarExcecao(funcionarioId, ficha.Nome, chave!, ligado, motivo!.Trim(), string.IsNullOrEmpty(validade) ? null : validade, chamador);
        return Resultado(1, encerradas);
    }

    private static string Resultado(int criadas, int encerradas) => "{\"criadas\":" + criadas.ToString(CultureInfo.InvariantCulture) + ",\"encerradas\":" + encerradas.ToString(CultureInfo.InvariantCulture) + "}";
}

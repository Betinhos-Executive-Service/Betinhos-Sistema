using System.Collections.Generic;

namespace Cr40f.Frota.Plugin;

/// <summary>Rótulos de new_servicosmanutencao, gerados de apps/shell/src/pages/frota/domain/manutencaoCatalogo.json (CatalogoTests confere).</summary>
public static class Catalogo
{
    public static readonly IReadOnlyDictionary<int, string> Servicos = new Dictionary<int, string>
    {
        [100000000] = "Troca de óleo e filtro de óleo",
        [100000001] = "Filtro de ar do motor",
        [100000002] = "Filtro de combustível",
        [100000003] = "Velas e ignição",
        [100000004] = "Correias",
        [100000005] = "Arrefecimento",
        [100000006] = "Motor e injeção (diagnóstico)",
        [100000007] = "Pastilhas de freio",
        [100000008] = "Discos de freio",
        [100000009] = "Fluido de freio",
        [100000010] = "Lonas e tambores",
        [100000011] = "Outros reparos de freio",
        [100000012] = "Troca de pneu",
        [100000013] = "Conserto de pneu",
        [100000014] = "Alinhamento e balanceamento",
        [100000015] = "Rodízio e calibragem",
        [100000016] = "Rodas e calotas",
        [100000017] = "Amortecedores e molas",
        [100000018] = "Buchas, bandejas e pivôs",
        [100000019] = "Direção",
        [100000020] = "Embreagem",
        [100000021] = "Câmbio e óleo da transmissão",
        [100000022] = "Bateria",
        [100000023] = "Alternador e motor de partida",
        [100000024] = "Faróis, lanternas e lâmpadas",
        [100000025] = "Elétrica e eletrônica embarcada",
        [100000026] = "Filtro de cabine",
        [100000027] = "Recarga e higienização do ar",
        [100000028] = "Compressor e componentes do ar",
        [100000029] = "Funilaria e lataria",
        [100000030] = "Pintura e retoque",
        [100000031] = "Para-brisa, vidros e palhetas",
        [100000032] = "Lavagem e higienização",
        [100000033] = "Polimento e cristalização",
        [100000034] = "Bancos e acabamento interno",
        [100000035] = "Revisão periódica",
        [100000037] = "Rolamentos e cubos de roda",
        [100000038] = "Borrachas, vedação e fechaduras",
        [100000039] = "Chave e controle",
        [100000040] = "Ruído ou diagnóstico geral",
        [100000036] = "Outros serviços",
    };

    public static string Rotulo(int servico) => Servicos.TryGetValue(servico, out var r) ? r : "Serviço " + servico;
}

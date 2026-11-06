// Command Button JS — GerarRecibo
// flowUrl lida de Variável de Ambiente Dataverse: new_FlowUrlGerarRecibo
//
// O PDF é montado neste navegador (pdf-lib + fundos em cr40f_/recibo/), em ~1 s, sem Word Online.
// Depois vai ao Flow só para entrega: { ID_PAG, GUID, SEND_EMAIL, PDF_BASE64 }.
// O Flow responde 202, salva no OneDrive, grava o link e o status no pagante
// (new_statusgeracaorecibo, new_errogeracaorecibo, cr40f_linkdorecibo) e envia o e-mail.
// O modal acompanha o registro; Abrir/Baixar usam o PDF local assim que ele fica pronto.

var GR_VERSAO = "v0.0.4 · 13/10/2026 14:46";         // gravada por publicar-dev.js a cada publicação
var TAG_GR = "[BT-GERAR-RECIBO]";
var GR_MAX_PARALELO = 4;          // entregas simultâneas ao Flow
var GR_TIMEOUT_MS = 30000;        // POST de início; o Flow responde 202 em ~2 s
var GR_POLL_MS = 4000;            // intervalo de leitura do pagante
var GR_AVISO_LENTO_MS = 60000;    // a partir daqui avisa que o OneDrive está lento
var GR_ESPERA_MAX_MS = 600000;    // para de acompanhar (o Flow segue rodando)
var GR_ST = { processando: 100000001, concluido: 100000002, erro: 100000003 };

// ─── ENV VAR ─────────────────────────────────────────────────────────────────

function getEnvVarValue_GR(schemaName) {
    var baseUrl = Xrm.Utility.getGlobalContext().getClientUrl();
    var url =
        baseUrl +
        "/api/data/v9.2/environmentvariabledefinitions" +
        "?$filter=schemaname eq '" + schemaName + "'" +
        "&$select=defaultvalue,schemaname" +
        "&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)";

    return fetch(url, {
        headers: {
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            "Accept": "application/json",
            "Content-Type": "application/json; charset=utf-8"
        }
    })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data || !data.value || !data.value.length) return null;
            var def = data.value[0];
            var cur = def["environmentvariabledefinition_environmentvariablevalue"];
            if (cur && cur.length && cur[0].value) return cur[0].value;
            if (def.defaultvalue) return def.defaultvalue;
            return null;
        })
        .catch(function (e) {
            console.error(TAG_GR, "Erro ao buscar env var:", e);
            return null;
        });
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

function GerarRecibo(primaryControl) {
    var grid = primaryControl.getGrid();
    if (!grid) return;

    var selectedRows = grid.getSelectedRows();
    if (selectedRows.getLength() === 0) return;

    var registros = [];
    selectedRows.forEach(function (row) {
        try {
            var entity = row.getData().getEntity();
            var id = entity.getId().replace(/[{}]/g, "");
            var entityName = entity.getEntityName();
            if (id) registros.push({ id: id, entityName: entityName });
        } catch (e) {
            console.warn(TAG_GR, "Erro ao extrair row:", e);
        }
    });

    if (registros.length === 0) return;

    Xrm.Utility.showProgressIndicator("Carregando pagantes...");
    // Baixa libs, fundos e fontes enquanto o usuário revisa o modal
    carregarRecursos_GR().catch(function (e) { console.warn(TAG_GR, "Pré-carga dos recursos do PDF falhou:", e); });

    Promise.all([
        getEnvVarValue_GR("new_FlowUrlGerarRecibo"),
        Promise.all(registros.map(carregarPagante_GR))
    ]).then(function (results) {
        try { Xrm.Utility.closeProgressIndicator(); } catch (e) {}

        var flowUrl = results[0];
        var pagantes = results[1];

        if (!flowUrl) {
            Xrm.Navigation.openAlertDialog({
                text:
                    "Variável de ambiente 'new_FlowUrlGerarRecibo' não encontrada ou sem valor.\n" +
                    "Configure-a em Power Apps > Soluções > Variáveis de Ambiente."
            });
            return;
        }

        console.log(TAG_GR, "pagantes:", pagantes.length);
        mostrarModalGaleria_GR(flowUrl, pagantes, primaryControl);
    }).catch(function (e) {
        try { Xrm.Utility.closeProgressIndicator(); } catch (e2) {}
        console.error(TAG_GR, "Erro ao preparar recibos:", e);
        Xrm.Navigation.openAlertDialog({ text: "Não foi possível carregar os pagantes selecionados. Tente novamente." });
    });
}

function carregarPagante_GR(reg) {
    return Xrm.WebApi.retrieveRecord(
        reg.entityName,
        reg.id,
        "?$select=cr40f_id,cr40f_valor,cr40f_formadepagamento,new_observacaodorecibo,_cr40f_bancodedados_value,_cr40f_financeiro_value,cr40f_emailrecibo&$expand=cr40f_DestinatarioRecibo($select=cr40f_email)"
    )
        .then(function (record) {
            return montarDescricaoPadrao_GR(record._cr40f_financeiro_value)
                .then(function (fin) {
                    record.__descricaoPadrao = fin.texto;
                    record.__idFin = fin.idFin;
                    return record;
                });
        })
        .then(function (record) {
            // Nome do passageiro via anotação OData do lookup
            var nomePassageiro =
                record["_cr40f_bancodedados_value@OData.Community.Display.V1.FormattedValue"] || "";

            // GUID do passageiro
            var passageiroGuid = "";
            for (var prop in record) {
                if (
                    prop.toLowerCase().indexOf("bancodedados") !== -1 &&
                    prop.endsWith("_value") &&
                    prop.indexOf("@") === -1
                ) {
                    passageiroGuid = record[prop]
                        ? String(record[prop]).replace(/[{}]/g, "")
                        : "";
                    break;
                }
            }

            // Forma de pagamento — campo choice retorna o rótulo na anotação
            var formaPagamento =
                record["cr40f_formadepagamento@OData.Community.Display.V1.FormattedValue"] ||
                record["cr40f_formadepagamento"] || "";

            // EntityName da tabela do passageiro (via annotation do lookup)
            var paxEntityName =
                record["_cr40f_bancodedados_value@Microsoft.Dynamics.CRM.lookuplogicalname"] || "";

            var pagamento = {
                ok: true,
                id: reg.id,
                entityName: reg.entityName,
                seqId: record.cr40f_id || "",
                valor: record.cr40f_valor != null ? record.cr40f_valor : null,
                formaPagamento: formaPagamento,
                passageiroGuid: passageiroGuid,
                nomePassageiro: nomePassageiro || ("Pagante " + (record.cr40f_id || reg.id.slice(0, 8))),
                emailPassageiro: "",
                descricaoPadrao: record.__descricaoPadrao || "",
                idFin: record.__idFin || "",
                obs: record.new_observacaodorecibo || "",
                nomeNoRecibo: nomePassageiro,
                cliente: ""
            };

            if (!passageiroGuid || !paxEntityName) return pagamento;

            return Xrm.WebApi.retrieveRecord(paxEntityName, passageiroGuid,
                "?$select=cr40f_email,cr40f_nomedopassageiro,_cr40f_cliente_value")
                .then(function (pax) {
                    var pessoaRecibo = record.cr40f_DestinatarioRecibo || pax;
                    pagamento.emailPassageiro = record.cr40f_emailrecibo || (pessoaRecibo && pessoaRecibo.cr40f_email) || "";
                    if (pax && pax.cr40f_nomedopassageiro) pagamento.nomeNoRecibo = pax.cr40f_nomedopassageiro;
                    var cliId = pax && pax._cr40f_cliente_value;
                    var cliEnt = pax && pax["_cr40f_cliente_value@Microsoft.Dynamics.CRM.lookuplogicalname"];
                    if (!cliId || !cliEnt) return pagamento;
                    return Xrm.WebApi.retrieveRecord(cliEnt, cliId, "?$select=cr40f_nomedocliente")
                        .then(function (cli) {
                            pagamento.cliente = (cli && cli.cr40f_nomedocliente) || "";
                            return pagamento;
                        });
                })
                .catch(function (e) {
                    console.warn(TAG_GR, "Passageiro/cliente não carregado:", reg.id, e);
                    return pagamento;
                });
        })
        .catch(function (e) {
            console.error(TAG_GR, "Erro ao buscar registro:", reg.id, e);
            return {
                ok: false,
                id: reg.id,
                entityName: reg.entityName,
                seqId: "",
                valor: null,
                formaPagamento: "",
                passageiroGuid: "",
                nomePassageiro: "Pagante " + reg.id.slice(0, 8),
                emailPassageiro: "",
                descricaoPadrao: ""
            };
        });
}

// ─── DESCRIÇÃO PADRÃO ────────────────────────────────────────────────────────
// Texto padrão (mesmo do antigo Compose_Descricao do Flow):
// período da OP (datas em UTC, como o formatDateTime do Flow) + tipos de
// serviço distintos das OS da OP.

function formatarDataUtc_GR(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    function dois(n) { return (n < 10 ? "0" : "") + n; }
    return dois(d.getUTCDate()) + "/" + dois(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear();
}

function juntarLista_GR(itens) {
    if (itens.length <= 1) return itens.join("");
    return itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1];
}

function montarDescricaoPadrao_GR(financeiroId) {
    if (!financeiroId) return Promise.resolve({ texto: "", idFin: "" });

    var pFin = Xrm.WebApi.retrieveRecord(
        "cr40f_financeiro", financeiroId, "?$select=cr40f_datado1servico,cr40f_datadoultimoservico,cr40f_idfinanceiro");
    var pOs = Xrm.WebApi.retrieveMultipleRecords(
        "cr40f_reservadeveculos",
        "?$select=cr40f_tipodoservico&$filter=_cr40f_financeiro_value eq " + financeiroId +
        "&$orderby=cr40f_dataehorriodesada asc");

    return Promise.all([pFin, pOs]).then(function (r) {
        var fin = r[0];
        var trajetos = [];
        (r[1].entities || []).forEach(function (os) {
            var t = (os["cr40f_tipodoservico@OData.Community.Display.V1.FormattedValue"] || "").trim();
            if (t && trajetos.indexOf(t) === -1) trajetos.push(t);
        });
        return {
            idFin: fin.cr40f_idfinanceiro || "",
            texto: "Serviço(s) de transporte terrestre executivo prestado(s) no período de " +
                formatarDataUtc_GR(fin.cr40f_datado1servico) + " - " +
                formatarDataUtc_GR(fin.cr40f_datadoultimoservico) + ".\n\n" +
                "Viagens percorridas nos seguintes trajetos: " + juntarLista_GR(trajetos)
        };
    }).catch(function (e) {
        console.warn(TAG_GR, "Não foi possível montar a descrição padrão:", financeiroId, e);
        return { texto: "", idFin: "" };
    });
}

// ─── PDF NO NAVEGADOR ────────────────────────────────────────────────────────
// Fundo = template 3 (Comum/J&J) convertido uma vez em PDF por recibo/gerar-fundos.py;
// recibo-campos.json traz posição, fonte, cor e alinhamento de cada campo.
// A descrição pode ter várias linhas: como no Word, cada linha extra empurra a fatia
// do meio do fundo (Total, Observações, CNPJ) para baixo; o rodapé fica fixo.

var GR_OBS_ENTRELINHA = 1.235;    // medido no Word (12,3 pt para fonte 9,96)
var _grRecursos = null;           // Promise com libs, layout, fundos e fontes (carrega uma vez)

function urlRecursos_GR() {
    if (typeof GR_RECURSOS_URL === "string") return GR_RECURSOS_URL; // teste local
    return Xrm.Utility.getGlobalContext().getClientUrl() + "/WebResources/cr40f_/recibo/";
}

// UMD: se a página tiver AMD (define.amd), a lib se registraria como módulo e não como global.
function carregarScript_GR(url, global) {
    if (window[global]) return Promise.resolve(window[global]);
    return new Promise(function (resolve, reject) {
        var defineOriginal = window.define;
        window.define = undefined;
        var s = document.createElement("script");
        s.src = url;
        s.onload = function () {
            window.define = defineOriginal;
            window[global] ? resolve(window[global]) : reject(new Error("Biblioteca não carregou: " + url));
        };
        s.onerror = function () {
            window.define = defineOriginal;
            reject(new Error("Falha ao baixar " + url));
        };
        document.head.appendChild(s);
    });
}

function base64ParaBytes_GR(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

// pacote = window.GR_RECIBO_RECURSOS (recibo-recursos.js, gerado por recibo/montar-recursos.py)
function abrirPacote_GR(pacote) {
    var fontes = {};
    Object.keys(pacote.fontes).forEach(function (n) { fontes[n] = base64ParaBytes_GR(pacote.fontes[n]); });
    return {
        layout: pacote.layout,
        fundos: { comum: base64ParaBytes_GR(pacote.fundos.comum), jj: base64ParaBytes_GR(pacote.fundos.jj) },
        fontes: fontes
    };
}

function carregarRecursos_GR() {
    if (_grRecursos) return _grRecursos;
    var base = urlRecursos_GR();
    var v = "?v=" + encodeURIComponent(GR_VERSAO); // evita pacote antigo em cache após publicar
    _grRecursos = Promise.all([
        carregarScript_GR(base + "pdf-lib.min.js" + v, "PDFLib"),
        carregarScript_GR(base + "fontkit.umd.min.js" + v, "fontkit"),
        carregarScript_GR(base + "recibo-recursos.js" + v, "GR_RECIBO_RECURSOS")
    ]).then(function (r) { return abrirPacote_GR(r[2]); });
    _grRecursos.catch(function () { _grRecursos = null; }); // nova tentativa no próximo recibo
    return _grRecursos;
}

function corRgb_GR(hex) {
    var n = parseInt(String(hex).replace("#", ""), 16);
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Quebra por palavras respeitando \n do texto; linha vazia é mantida.
function quebrarLinhas_GR(texto, fonte, tamanho, largura) {
    var linhas = [];
    String(texto || "").replace(/\r/g, "").split("\n").forEach(function (par) {
        var atual = "";
        par.split(/ +/).forEach(function (palavra) {
            var teste = atual ? atual + " " + palavra : palavra;
            if (atual && fonte.widthOfTextAtSize(teste, tamanho) > largura) {
                linhas.push(atual);
                atual = palavra;
            } else {
                atual = teste;
            }
        });
        linhas.push(atual);
    });
    return linhas;
}

function formatarValor_GR(v) {
    return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hojeSaoPaulo_GR() {
    return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// dados: { modelo: "comum"|"jj", passageiro, cliente, idPag, data, forma, descricao, valor, obs, idFin }
function gerarPdf_GR(dados) {
    return carregarRecursos_GR().then(function (rec) {
        var L = rec.layout[dados.modelo];
        var C = L.campos;
        var H = L.alturaPagina;
        var W = L.larguraPagina;
        var fontesUsadas = {};

        return PDFLib.PDFDocument.create().then(function (pdf) {
            pdf.registerFontkit(fontkit);
            pdf.setTitle("Recibo - " + dados.idPag);
            pdf.setAuthor("Betinhos Executive Service");
            Object.keys(C).forEach(function (k) { fontesUsadas[C[k].fonte] = true; });
            fontesUsadas[C.valor.rotulo.fonte] = true;

            return Promise.all([
                PDFLib.PDFDocument.load(rec.fundos[dados.modelo]),
                Promise.all(Object.keys(fontesUsadas).map(function (n) {
                    if (!rec.fontes[n]) throw new Error("Fonte sem arquivo: " + n);
                    return pdf.embedFont(rec.fontes[n], { subset: true }).then(function (f) { fontesUsadas[n] = f; });
                }))
            ]).then(function (r) {
                var fundo = r[0].getPage(0);
                var d = C.descricao;
                var fonteDesc = fontesUsadas[d.fonte];

                // Célula da descrição como no Word: altura mínima com texto centralizado na
                // vertical; passou disso, cresce e empurra o meio. Encolhe a fonte só se não
                // couber até o rodapé.
                var folga = L.inicioRodape - L.fimMeio;
                var tam = d.tamanho, linhas, lh, altura, desloc;
                for (;;) {
                    linhas = quebrarLinhas_GR(dados.descricao, fonteDesc, tam, d.largura);
                    lh = d.entrelinha * (tam / d.tamanho);
                    altura = Math.max(d.alturaMinima, linhas.length * lh + d.margemVertical);
                    desloc = altura - d.alturaMinima;
                    if (desloc <= folga || tam <= 7) break;
                    tam -= 0.5;
                }
                desloc = Math.min(desloc, folga);
                // deslocamento da 1ª linha em relação ao marcador (1 linha centralizada)
                var dyDesc = (altura - linhas.length * lh) / 2 - (d.alturaMinima - d.entrelinha) / 2;

                // Fundo embutido uma vez e desenhado em 3 fatias recortadas
                // (coordenadas pdf-lib: origem embaixo à esquerda).
                return pdf.embedPage(fundo).then(function (fundoEmb) {
                    var pag = pdf.addPage([W, H]);
                    function fatia(yBase, altura, dy) {
                        pag.pushOperators(PDFLib.pushGraphicsState(), PDFLib.rectangle(0, yBase - dy, W, altura),
                            PDFLib.clip(), PDFLib.endPath());
                        pag.drawPage(fundoEmb, { x: 0, y: -dy });
                        pag.pushOperators(PDFLib.popGraphicsState());
                    }
                    fatia(H - L.corteDescricao, L.corteDescricao, 0);                              // topo
                    fatia(H - L.inicioRodape, L.inicioRodape - L.corteDescricao, desloc);           // meio, empurrado
                    fatia(0, H - L.inicioRodape, 0);                                                // rodapé

                    function escrever(nome, texto, opc) {
                        var c = C[nome];
                        texto = String(texto == null ? "" : texto);
                        if (!texto) return;
                        var fonte = fontesUsadas[c.fonte];
                        var tamanho = (opc && opc.tamanho) || c.tamanho;
                        var baseline = c.baseline + (c.baseline > L.corteDescricao ? desloc : 0);
                        var largura = fonte.widthOfTextAtSize(texto, tamanho);
                        var x = c.alinhamento === "right" ? c.xFim - largura
                            : c.alinhamento === "center" ? (c.x + c.xFim - largura) / 2
                            : c.x;
                        pag.drawText(texto, { x: x, y: H - baseline - ((opc && opc.dy) || 0), size: tamanho, font: fonte, color: corRgb_GR(c.cor) });
                        return x;
                    }

                    escrever("passageiro", dados.passageiro);
                    escrever("cliente", dados.cliente);
                    escrever("idPag", dados.idPag);
                    escrever("data", dados.data);
                    escrever("forma", dados.forma);
                    var xValor = escrever("valor", dados.valor);
                    var rot = C.valor.rotulo; // "Total" anda junto com o valor, como no Word
                    pag.drawText(rot.texto, {
                        x: (xValor == null ? C.valor.x : xValor) + rot.dx, y: H - C.valor.baseline - desloc,
                        size: rot.tamanho, font: fontesUsadas[rot.fonte], color: corRgb_GR(rot.cor)
                    });
                    escrever("idFin", dados.idFin);
                    linhas.forEach(function (linha, i) {
                        escrever("descricao", linha, { tamanho: tam, dy: dyDesc + i * lh });
                    });
                    var o = C.obs;
                    quebrarLinhas_GR(dados.obs, fontesUsadas[o.fonte], o.tamanho, o.largura).forEach(function (linha, i) {
                        escrever("obs", linha, { dy: i * o.tamanho * GR_OBS_ENTRELINHA });
                    });
                    return pdf.save();
                });
            });
        });
    });
}

function paraBase64_GR(bytes) {
    var partes = [];
    for (var i = 0; i < bytes.length; i += 0x8000) {
        partes.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
    }
    return btoa(partes.join(""));
}

// ─── ESTILOS (Betinhos Design System 1.5.0) ─────────────────────────────────
// Tokens copiados de design-tokens.json e escopados em .gr-overlay para não vazar
// no Dynamics. Light-only, sem gradiente; ícones Lucide desenhados via SVG.

function garantirEstilos_GR(doc) {
    if (doc.getElementById("gr-recibo-ds")) return;
    // Manrope não vem instalada no Dynamics; sem ela o modal cai para Segoe UI
    if (!doc.getElementById("gr-recibo-font")) {
        var fonte = doc.createElement("link");
        fonte.id = "gr-recibo-font";
        fonte.rel = "stylesheet";
        fonte.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap";
        doc.head.appendChild(fonte);
    }
    var st = doc.createElement("style");
    st.id = "gr-recibo-ds";
    var R = ".gr-overlay ";
    st.textContent = [
        ".gr-overlay{--bt-color-brand:#001a3d;--bt-color-brand-hover:#0b2d5a;--bt-color-action:#2159d2;" +
        "--bt-color-action-soft:#edf3ff;--bt-color-text-primary:#0f172a;--bt-color-slate-700:#475569;" +
        "--bt-color-text-secondary:#64748b;--bt-color-text-tertiary:#94a3b8;--bt-color-canvas:#f0f0f0;" +
        "--bt-color-surface:#fff;--bt-color-surface-soft:#f7f9fc;--bt-color-surface-neutral:#fcfcfb;" +
        "--bt-color-border:#e2e8f0;--bt-color-border-hover:#c7d2e2;--bt-color-success:#147a4b;" +
        "--bt-color-success-soft:#eaf8f1;--bt-color-warning:#856000;--bt-color-warning-soft:#fff7df;" +
        "--bt-color-danger:#c12f45;--bt-color-danger-soft:#fff0f3;--bt-focus-border:#6c91e8;" +
        "--bt-focus-ring:0 0 0 3px rgba(33,89,210,.11);--bt-font:'Manrope','Segoe UI',sans-serif;" +
        "--bt-ease-out:cubic-bezier(.23,1,.32,1);--bt-ease-drawer:cubic-bezier(.32,.72,0,1);" +
        "--bt-shadow-surface:0 8px 24px rgba(0,26,61,.045);" +
        "--bt-shadow-popover:0 18px 42px rgba(15,23,42,.18),0 2px 7px rgba(15,23,42,.08);" +
        "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;" +
        "background:rgba(0,26,61,.48);opacity:0;transition:opacity 200ms var(--bt-ease-out);" +
        "font-family:var(--bt-font);color:var(--bt-color-text-primary);-webkit-font-smoothing:antialiased}",
        R + "*{box-sizing:border-box}",
        R + "p{margin:0}",
        ".gr-overlay.gr-aberto{opacity:1}",
        ".gr-overlay.gr-fechando{transition-duration:150ms}",

        // Modal
        R + ".gr-modal{display:flex;flex-direction:column;width:100%;max-width:600px;max-height:88vh;margin:16px;" +
        "overflow:hidden;background:var(--bt-color-canvas);border-radius:12px;box-shadow:var(--bt-shadow-popover);" +
        "opacity:0;transform:translateY(8px) scale(.98);" +
        "transition:transform 220ms var(--bt-ease-drawer),opacity 200ms var(--bt-ease-out)}",
        ".gr-overlay.gr-aberto .gr-modal{opacity:1;transform:none}",
        ".gr-overlay.gr-fechando .gr-modal{transition-duration:150ms}",

        // Cabeçalho
        R + ".gr-head{display:flex;align-items:flex-start;gap:12px;min-height:64px;padding:16px 20px;" +
        "background:var(--bt-color-surface);border-bottom:1px solid var(--bt-color-border);flex-shrink:0}",
        R + ".gr-head-txt{flex:1;min-width:0}",
        R + ".gr-eyebrow{font:800 11px/14px var(--bt-font);letter-spacing:.08em;text-transform:uppercase;" +
        "color:var(--bt-color-text-secondary);margin-bottom:4px}",
        R + ".gr-title{font:800 20px/25px var(--bt-font);letter-spacing:-.3px;color:var(--bt-color-brand)}",
        R + ".gr-sub{margin-top:4px;font:400 13px/20px var(--bt-font);color:var(--bt-color-text-secondary)}",

        // Lista e cards
        R + ".gr-list{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}",
        R + ".gr-card{background:var(--bt-color-surface);border:1px solid var(--bt-color-border);border-radius:12px;" +
        "padding:14px 16px;box-shadow:var(--bt-shadow-surface);transition:box-shadow 150ms var(--bt-ease-out)}",
        R + ".gr-card[data-status=gerando]{box-shadow:inset 3px 0 0 var(--bt-color-action),var(--bt-shadow-surface)}",
        R + ".gr-card[data-status=ok]{box-shadow:inset 3px 0 0 var(--bt-color-success),var(--bt-shadow-surface)}",
        R + ".gr-card[data-status=erro]{box-shadow:inset 3px 0 0 var(--bt-color-danger),var(--bt-shadow-surface)}",
        R + ".gr-card[data-status=aguardando]{box-shadow:inset 3px 0 0 var(--bt-color-warning),var(--bt-shadow-surface)}",
        R + ".gr-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}",
        R + ".gr-info{flex:1;min-width:0}",
        R + ".gr-id{font:800 11px/14px var(--bt-font);letter-spacing:.08em;text-transform:uppercase;" +
        "color:var(--bt-color-text-secondary);font-variant-numeric:tabular-nums}",
        R + ".gr-nome{margin-top:2px;font:700 14px/22px var(--bt-font);color:var(--bt-color-text-primary);" +
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        R + ".gr-email{display:flex;align-items:center;gap:6px;margin-top:2px;font:500 12px/17px var(--bt-font);" +
        "color:var(--bt-color-text-secondary);min-width:0}",
        R + ".gr-email-input{flex:1;min-width:0;border:0;border-bottom:1px solid var(--bt-color-border);background:transparent;font:inherit;color:inherit}",
        R + ".gr-email-input[aria-invalid=true]{border-bottom-color:var(--bt-color-danger)}",
        R + ".gr-email-sem{color:var(--bt-color-warning);font-weight:600}",
        R + ".gr-valor{margin-top:2px;font:600 12px/17px var(--bt-font);color:var(--bt-color-slate-700);" +
        "font-variant-numeric:tabular-nums}",
        R + ".gr-ico{display:inline-flex;flex-shrink:0}",
        R + ".gr-ico svg{display:block}",

        // Lado direito: switch de e-mail e badge de status
        R + ".gr-side{display:flex;align-items:center;gap:8px;flex-shrink:0;min-height:24px}",
        R + ".gr-toggle-label{font:700 12px/17px var(--bt-font);color:var(--bt-color-slate-700);cursor:pointer;" +
        "user-select:none}",
        R + ".gr-switch{position:relative;width:44px;height:24px;padding:0;border:0;border-radius:999px;" +
        "background:var(--bt-color-text-secondary);cursor:pointer;flex-shrink:0;" +
        "transition:background-color 150ms var(--bt-ease-out)}",
        R + ".gr-switch[aria-checked=true]{background:var(--bt-color-action)}",
        R + ".gr-thumb{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;" +
        "background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.2);pointer-events:none;" +
        "transition:transform 150ms var(--bt-ease-out)}",
        R + ".gr-switch[aria-checked=true] .gr-thumb{transform:translateX(20px)}",
        R + ".gr-badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border-radius:999px;" +
        "font:800 11px/14px var(--bt-font);white-space:nowrap}",
        R + ".gr-badge[data-status=fila]{color:var(--bt-color-text-primary);background:var(--bt-color-border)}",
        R + ".gr-badge[data-status=gerando]{color:var(--bt-color-action);background:var(--bt-color-action-soft)}",
        R + ".gr-badge[data-status=ok]{color:var(--bt-color-success);background:var(--bt-color-success-soft)}",
        R + ".gr-badge[data-status=erro]{color:var(--bt-color-danger);background:var(--bt-color-danger-soft)}",
        R + ".gr-badge[data-status=aguardando]{color:var(--bt-color-warning);background:var(--bt-color-warning-soft)}",

        // Descrição
        R + ".gr-desc-bloco{margin-top:12px}",
        R + ".gr-desc-topo{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}",
        R + ".gr-label{font:800 12px/17px var(--bt-font);color:var(--bt-color-slate-700)}",
        R + ".gr-desc{display:block;width:100%;min-height:96px;resize:vertical;padding:10px 12px;margin:0;" +
        "background:var(--bt-color-surface-neutral);color:var(--bt-color-text-primary);" +
        "border:1px solid var(--bt-color-border);border-radius:10px;font:400 13px/20px var(--bt-font);" +
        "transition:border-color 150ms var(--bt-ease-out),box-shadow 150ms var(--bt-ease-out)}",
        R + ".gr-desc:focus-visible{outline:0;border-color:var(--bt-focus-border);box-shadow:var(--bt-focus-ring)}",
        R + ".gr-desc:disabled{background:var(--bt-color-surface-soft);color:var(--bt-color-slate-700);cursor:default}",
        R + ".gr-ajuda{margin-top:4px;font:500 12px/17px var(--bt-font);color:var(--bt-color-text-secondary)}",
        R + ".gr-link{background:none;border:0;padding:4px 0;color:var(--bt-color-action);cursor:pointer;" +
        "font:700 12px/17px var(--bt-font);border-radius:6px}",
        R + ".gr-link:disabled{opacity:.55;cursor:not-allowed}",

        // Rodapé do card (mensagem + ações)
        R + ".gr-card-foot{display:none;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;padding-top:12px;" +
        "border-top:1px solid var(--bt-color-border)}",
        R + ".gr-msg{flex:1 1 100%;font:500 12px/17px var(--bt-font);color:var(--bt-color-slate-700)}",
        R + ".gr-msg[data-tone=erro]{color:var(--bt-color-danger)}",
        R + ".gr-msg[data-tone=aguardando]{color:var(--bt-color-warning)}",
        R + ".gr-acoes{display:flex;flex-wrap:wrap;gap:8px}",

        // Botões
        R + ".gr-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;" +
        "margin:0;border:1px solid transparent;border-radius:10px;font:700 13px/1 var(--bt-font);white-space:nowrap;" +
        "cursor:pointer;transition:background-color 150ms var(--bt-ease-out),border-color 150ms var(--bt-ease-out)," +
        "color 150ms var(--bt-ease-out),transform 150ms var(--bt-ease-out)}",
        R + ".gr-btn:active:not(:disabled){transform:scale(.97)}",
        R + ".gr-btn:disabled{opacity:.55;cursor:not-allowed}",
        R + ".gr-btn[aria-busy=true]{opacity:1;cursor:progress}",
        R + ".gr-btn-primary{background:var(--bt-color-brand);color:#fff}",
        R + ".gr-btn-secondary{background:var(--bt-color-surface);color:var(--bt-color-brand-hover);" +
        "border-color:var(--bt-color-border)}",
        R + ".gr-btn-action{background:var(--bt-color-action);color:#fff}",
        R + ".gr-btn-danger{background:var(--bt-color-danger);color:#fff}",
        R + ".gr-btn-compact{height:32px;padding:0 12px;font-size:12px;gap:6px}",
        R + ".gr-btn-icon{width:40px;padding:0;background:var(--bt-color-surface);color:var(--bt-color-text-secondary);" +
        "border-color:var(--bt-color-border);flex-shrink:0}",
        "@media (hover:hover) and (pointer:fine){" +
        R + ".gr-btn-primary:hover:not(:disabled){background:var(--bt-color-brand-hover)}" +
        R + ".gr-btn-action:hover:not(:disabled){background:var(--bt-color-brand-hover)}" +
        R + ".gr-btn-secondary:hover:not(:disabled)," + R + ".gr-btn-icon:hover:not(:disabled)" +
        "{background:var(--bt-color-surface-soft);border-color:var(--bt-color-border-hover)}" +
        R + ".gr-desc:hover:not(:disabled):not(:focus){border-color:var(--bt-color-border-hover)}}",
        "@media (pointer:coarse){" + R + ".gr-btn," + R + ".gr-btn-compact{height:44px}" +
        R + ".gr-btn-icon{width:44px}}",

        // Foco visível (anel do DS; em fundo navy/azul, anel branco + azul claro)
        R + ".gr-foco:focus-visible{outline:0;box-shadow:0 0 0 2px #fff,0 0 0 5px var(--bt-focus-border)}",
        R + ".gr-btn-secondary.gr-foco:focus-visible," + R + ".gr-btn-icon.gr-foco:focus-visible" +
        "{border-color:var(--bt-focus-border);box-shadow:var(--bt-focus-ring)}",

        // Rodapé do modal
        R + ".gr-foot{display:flex;flex-direction:column;gap:10px;padding:12px 20px 8px;flex-shrink:0;" +
        "background:var(--bt-color-surface);border-top:1px solid var(--bt-color-border)}",
        R + ".gr-resumo{display:none;font:600 13px/20px var(--bt-font);color:var(--bt-color-success)}",
        R + ".gr-resumo[data-tone=erro]{color:var(--bt-color-danger)}",
        R + ".gr-resumo[data-tone=aguardando]{color:var(--bt-color-warning)}",
        R + ".gr-actions{display:flex;justify-content:flex-end;gap:8px}",
        R + ".gr-confirm{display:none;flex-direction:column;gap:10px}",
        R + ".gr-confirm-txt{font:600 13px/20px var(--bt-font);color:var(--bt-color-text-primary)}",
        R + ".gr-versao{font:500 11px/14px var(--bt-font);color:var(--bt-color-text-tertiary);text-align:right;" +
        "pointer-events:none;user-select:none}",

        // Spinner
        "@keyframes grSpin{to{transform:rotate(360deg)}}",
        R + ".gr-spin{display:inline-block;width:12px;height:12px;border:2px solid currentColor;" +
        "border-right-color:transparent;border-radius:50%;animation:grSpin 800ms linear infinite;flex-shrink:0}",

        // Mobile: modal ocupa a tela; ações empilhadas
        "@media (max-width:560px){" + R + ".gr-modal{margin:0;max-width:none;height:100%;max-height:none;border-radius:0}" +
        R + ".gr-head{padding:14px 16px}" + R + ".gr-list{padding:12px}" + R + ".gr-foot{padding:12px 16px 8px}" +
        R + ".gr-actions{flex-direction:column-reverse}" + R + ".gr-actions .gr-btn{width:100%}" +
        R + ".gr-card-top{flex-direction:column}}",

        "@media (prefers-reduced-motion:reduce){.gr-overlay,.gr-overlay *{transition-duration:.01ms!important}" +
        R + ".gr-spin{animation-duration:2.4s}}"
    ].join("");
    (doc.head || doc.body).appendChild(st);
}

// Ícones Lucide (outline, stroke 2). Montados com createElementNS: sem innerHTML com markup.
var GR_ICONES = {
    x: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]],
    arquivo: [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }],
        ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M16 13H8" }], ["path", { d: "M16 17H8" }],
        ["path", { d: "M10 9H8" }]],
    email: [["rect", { width: "20", height: "16", x: "2", y: "4", rx: "2" }],
        ["path", { d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" }]],
    alerta: [["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }],
        ["path", { d: "M12 9v4" }], ["path", { d: "M12 17h.01" }]],
    check: [["path", { d: "M20 6 9 17l-5-5" }]],
    erro: [["circle", { cx: "12", cy: "12", r: "10" }], ["path", { d: "M12 8v4" }], ["path", { d: "M12 16h.01" }]],
    relogio: [["circle", { cx: "12", cy: "12", r: "10" }], ["path", { d: "M12 6v6l4 2" }]],
    abrir: [["path", { d: "M15 3h6v6" }], ["path", { d: "M10 14 21 3" }],
        ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }]],
    baixar: [["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }], ["path", { d: "m7 10 5 5 5-5" }],
        ["path", { d: "M12 15V3" }]],
    repetir: [["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }], ["path", { d: "M3 3v5h5" }]],
    atualizar: [["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }], ["path", { d: "M21 3v5h-5" }],
        ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }], ["path", { d: "M8 16H3v5" }]]
};

function icone_GR(doc, nome, tamanho) {
    var NS = "http://www.w3.org/2000/svg";
    var wrap = doc.createElement("span");
    wrap.className = "gr-ico";
    wrap.setAttribute("aria-hidden", "true");
    var svg = doc.createElementNS(NS, "svg");
    var t = String(tamanho || 16);
    var attrs = { width: t, height: t, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
        "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" };
    Object.keys(attrs).forEach(function (k) { svg.setAttribute(k, attrs[k]); });
    GR_ICONES[nome].forEach(function (parte) {
        var el = doc.createElementNS(NS, parte[0]);
        Object.keys(parte[1]).forEach(function (k) { el.setAttribute(k, parte[1][k]); });
        svg.appendChild(el);
    });
    wrap.appendChild(svg);
    return wrap;
}

// ─── MODAL ───────────────────────────────────────────────────────────────────

function mostrarModalGaleria_GR(flowUrl, pagantes, primaryControl) {
    var doc;
    try { doc = window.top.document; } catch (e) { doc = document; }
    garantirEstilos_GR(doc);

    // Cores ficam no CSS (data-status); aqui só rótulo e ícone
    var STATUS = {
        fila:       { txt: "Na fila" },
        gerando:    { txt: "Gerando" },
        ok:         { txt: "Pronto",       ico: "check" },
        erro:       { txt: "Erro",         ico: "erro" },
        aguardando: { txt: "Em andamento", ico: "relogio" }
    };
    var focoAnterior = doc.activeElement;

    var estado = "idle";          // idle | rodando | fim
    var fila = [];
    var ativos = 0;
    var fechado = false;          // modal fechado: para de acompanhar
    var itens = pagantes.map(function (p) {
        return { p: p, enviarEmail: true, emailDestino: p.emailPassageiro || "", descricao: p.descricaoPadrao || "", status: null, url: null, els: {} };
    });

    function criarEl(tag, cls, txt) {
        var el = doc.createElement(tag);
        if (cls) el.className = cls;
        if (txt != null) el.textContent = txt;
        return el;
    }

    // ── Overlay / modal ──────────────────────────────────────────────────────
    var overlay = criarEl("div", "gr-overlay");
    var modal = criarEl("div", "gr-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    // ── Header ───────────────────────────────────────────────────────────────
    var header = criarEl("div", "gr-head");
    var headTxt = criarEl("div", "gr-head-txt");
    var eyebrow = criarEl("p", "gr-eyebrow",
        pagantes.length === 1 ? "1 pagante selecionado" : pagantes.length + " pagantes selecionados");
    var titulo = criarEl("h2", "gr-title", pagantes.length === 1 ? "Gerar recibo" : "Gerar recibos");
    titulo.id = "gr-titulo";
    modal.setAttribute("aria-labelledby", "gr-titulo");
    var subtitulo = criarEl("p", "gr-sub",
        "Revise a descrição de cada recibo e escolha quem recebe por e-mail.");
    subtitulo.setAttribute("aria-live", "polite");
    headTxt.appendChild(eyebrow);
    headTxt.appendChild(titulo);
    headTxt.appendChild(subtitulo);
    var btnFechar = criarEl("button", "gr-btn gr-btn-icon gr-foco");
    btnFechar.type = "button";
    btnFechar.setAttribute("aria-label", "Fechar");
    btnFechar.title = "Fechar";
    btnFechar.appendChild(icone_GR(doc, "x", 18));
    header.appendChild(headTxt);
    header.appendChild(btnFechar);

    // ── Lista ────────────────────────────────────────────────────────────────
    var lista = criarEl("div", "gr-list");

    itens.forEach(function (item) {
        var p = item.p;
        var card = criarEl("div", "gr-card");

        var linha = criarEl("div", "gr-card-top");
        var info = criarEl("div", "gr-info");

        info.appendChild(criarEl("div", "gr-id", p.seqId ? ("ID " + p.seqId) : "—"));
        var nomeEl = criarEl("div", "gr-nome", p.nomePassageiro);
        nomeEl.title = p.nomePassageiro;
        info.appendChild(nomeEl);

        var emailEl = criarEl("div", "gr-email" + (p.emailPassageiro ? "" : " gr-email-sem"));
        emailEl.appendChild(icone_GR(doc, p.emailPassageiro ? "email" : "alerta", 14));
        // A troca vale só para este envio e não altera o pagante.
        var emailInput = criarEl("input", "gr-email-input gr-foco");
        emailInput.type = "email";
        emailInput.value = item.emailDestino;
        emailInput.placeholder = p.emailPassageiro ? "Informe um e-mail ou desligue o envio" : "Sem e-mail cadastrado (cópia só para o financeiro)";
        emailInput.setAttribute("aria-label", "E-mail que recebe o recibo de " + p.nomePassageiro);
        emailInput.addEventListener("input", function () {
            item.emailDestino = emailInput.value.trim();
            emailInput.removeAttribute("aria-invalid");
        });
        item.els.emailInput = emailInput;
        emailEl.appendChild(emailInput);
        info.appendChild(emailEl);

        var valorStr = p.valor != null
            ? "R$ " + Number(p.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : "—";
        info.appendChild(criarEl("div", "gr-valor", valorStr + (p.formaPagamento ? " · " + p.formaPagamento : "")));

        // Lado direito: switch de e-mail (antes de gerar) → badge de status (depois)
        var direita = criarEl("div", "gr-side");

        var toggleLabel = criarEl("span", "gr-toggle-label", "Enviar e-mail");
        toggleLabel.setAttribute("aria-hidden", "true"); // o switch já tem aria-label
        var track = criarEl("button", "gr-switch gr-foco");
        track.type = "button";
        track.setAttribute("role", "switch");
        track.setAttribute("aria-checked", "true");
        track.setAttribute("aria-label", "Enviar e-mail para " + p.nomePassageiro);
        track.appendChild(criarEl("span", "gr-thumb"));

        track.addEventListener("click", function () {
            if (estado !== "idle") return;
            item.enviarEmail = !item.enviarEmail;
            track.setAttribute("aria-checked", item.enviarEmail ? "true" : "false");
        });
        toggleLabel.addEventListener("click", function () { track.click(); });

        var pill = criarEl("span", "gr-badge");
        pill.style.display = "none";

        direita.appendChild(toggleLabel);
        direita.appendChild(track);
        direita.appendChild(pill);

        linha.appendChild(info);
        linha.appendChild(direita);

        // Mensagem + ações por item (aparecem após gerar)
        var rodapeCard = criarEl("div", "gr-card-foot");
        var msg = criarEl("div", "gr-msg");
        msg.setAttribute("aria-live", "polite");
        var acoes = criarEl("div", "gr-acoes");
        rodapeCard.appendChild(msg);
        rodapeCard.appendChild(acoes);

        // Descrição editável (texto inteiro vai para o campo Descricao do template)
        var descBloco = criarEl("div", "gr-desc-bloco");
        var descTopo = criarEl("div", "gr-desc-topo");
        var descId = "gr-desc-" + p.id;
        var descLabel = criarEl("label", "gr-label", "Descrição do recibo");
        descLabel.htmlFor = descId;
        var btnRestaurar = criarEl("button", "gr-link gr-foco", "Restaurar padrão");
        btnRestaurar.type = "button";
        descTopo.appendChild(descLabel);
        descTopo.appendChild(btnRestaurar);

        var desc = criarEl("textarea", "gr-desc");
        desc.id = descId;
        desc.rows = 4;
        desc.value = item.descricao;
        desc.placeholder = "Ex.: Serviço(s) de transporte terrestre executivo prestado(s) no período de...";
        var descAjuda = criarEl("div", "gr-ajuda",
            p.descricaoPadrao
                ? "Texto padrão montado com o período e os trajetos da OP. Edite à vontade."
                : "Não foi possível montar o texto padrão. Escreva a descrição antes de gerar.");
        descAjuda.id = descId + "-ajuda";
        desc.setAttribute("aria-describedby", descAjuda.id);

        function atualizarRestaurar() {
            btnRestaurar.style.visibility = (p.descricaoPadrao && desc.value !== p.descricaoPadrao) ? "visible" : "hidden";
        }
        desc.addEventListener("input", function () {
            item.descricao = desc.value;
            atualizarRestaurar();
        });
        btnRestaurar.addEventListener("click", function () {
            if (desc.disabled) return;
            desc.value = p.descricaoPadrao;
            item.descricao = desc.value;
            atualizarRestaurar();
            desc.focus();
        });
        atualizarRestaurar();

        descBloco.appendChild(descTopo);
        descBloco.appendChild(desc);
        descBloco.appendChild(descAjuda);

        card.appendChild(linha);
        card.appendChild(descBloco);
        card.appendChild(rodapeCard);
        lista.appendChild(card);

        item.els = {
            card: card, track: track, toggleLabel: toggleLabel, pill: pill,
            rodapeCard: rodapeCard, msg: msg, acoes: acoes, desc: desc, btnRestaurar: btnRestaurar
        };
    });

    // ── Rodapé ───────────────────────────────────────────────────────────────
    var rodape = criarEl("div", "gr-foot");
    var resumo = criarEl("div", "gr-resumo");
    resumo.setAttribute("aria-live", "polite");

    var btnPrincipal = criarEl("button", "gr-btn gr-btn-primary gr-foco");
    btnPrincipal.type = "button";
    function rotuloPrincipal(icone, texto) {
        btnPrincipal.textContent = "";
        if (icone === "spin") btnPrincipal.appendChild(criarEl("span", "gr-spin"));
        else if (icone) btnPrincipal.appendChild(icone_GR(doc, icone, 18));
        btnPrincipal.appendChild(doc.createTextNode(texto));
    }
    rotuloPrincipal("arquivo", "Gerar " + pagantes.length + " recibo" + (pagantes.length > 1 ? "s" : ""));

    var btnCancelar = criarEl("button", "gr-btn gr-btn-secondary gr-foco", "Cancelar");
    btnCancelar.type = "button";

    var acoesRodape = criarEl("div", "gr-actions");
    acoesRodape.appendChild(btnCancelar);
    acoesRodape.appendChild(btnPrincipal);

    // Confirmação ao fechar com descrição editada (antes de gerar)
    var confirmar = criarEl("div", "gr-confirm");
    confirmar.setAttribute("role", "alertdialog");
    confirmar.setAttribute("aria-labelledby", "gr-confirm-txt");
    var confirmarTxt = criarEl("p", "gr-confirm-txt", "Descartar alterações? As descrições editadas serão perdidas.");
    confirmarTxt.id = "gr-confirm-txt";
    var confirmarAcoes = criarEl("div", "gr-actions");
    var btnContinuar = criarEl("button", "gr-btn gr-btn-secondary gr-foco", "Continuar editando");
    btnContinuar.type = "button";
    var btnDescartar = criarEl("button", "gr-btn gr-btn-danger gr-foco", "Descartar");
    btnDescartar.type = "button";
    confirmarAcoes.appendChild(btnContinuar);
    confirmarAcoes.appendChild(btnDescartar);
    confirmar.appendChild(confirmarTxt);
    confirmar.appendChild(confirmarAcoes);

    // Versão do script: discreta, não captura clique nem foco
    var versao = criarEl("div", "gr-versao", GR_VERSAO);
    versao.setAttribute("aria-hidden", "true");

    rodape.appendChild(resumo);
    rodape.appendChild(confirmar);
    rodape.appendChild(acoesRodape);
    rodape.appendChild(versao);

    // ── Helpers de UI ────────────────────────────────────────────────────────
    function criarBotaoCard(texto, primario, icone) {
        var b = criarEl("button", "gr-btn gr-btn-compact gr-foco " + (primario ? "gr-btn-action" : "gr-btn-secondary"));
        b.type = "button";
        if (icone) b.appendChild(icone_GR(doc, icone, 16));
        b.appendChild(doc.createTextNode(texto));
        return b;
    }

    // item.pdfUrl = PDF montado neste navegador (blob); item.url = link do OneDrive (cr40f_linkdorecibo)
    function abrirPdf(item) {
        try { window.open(item.pdfUrl || item.url, "_blank", "noopener"); } catch (e) {}
    }

    function baixarPdf(item) {
        if (item.pdfUrl) {
            var a = document.createElement("a");
            a.href = item.pdfUrl;
            a.download = item.pdfNome;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return;
        }
        var sep = item.url.indexOf("?") === -1 ? "?" : "&";
        try { window.open(item.url + sep + "download=1", "_blank", "noopener"); } catch (e) {}
    }

    // Abre a aba do recibo durante o clique; ela mostra "Gerando…" até receber o blob.
    // O navegador pode bloquear a 2ª aba em diante (pop-up): nesse caso fica o botão "Abrir recibo".
    function abrirAbaEspera(item) {
        var w = null;
        try { w = window.open("", "_blank"); } catch (e) {}
        item.aba = w;
        if (!w) return;
        try {
            w.opener = null;
            w.document.title = "Gerando recibo " + (item.p.seqId || "") + "…";
            w.document.body.style.cssText = "margin:0;display:flex;align-items:center;justify-content:center;" +
                "height:100vh;background:#f0f0f0;color:#475569;font:600 14px 'Manrope','Segoe UI',sans-serif;";
            w.document.body.textContent = "Gerando recibo " + (item.p.seqId || "") + "…";
        } catch (e) {}
    }

    function mostrarNaAba(item) {
        var w = item.aba;
        item.aba = null;
        if (!w || w.closed) return;
        try { w.location.href = item.pdfUrl; } catch (e) { console.warn(TAG_GR, "Não abriu o PDF na aba:", e); }
    }

    function fecharAba(item) {
        try { if (item.aba && !item.aba.closed) item.aba.close(); } catch (e) {}
        item.aba = null;
    }

    // Abrir/Baixar disponíveis assim que o PDF existe, mesmo antes (ou sem) a entrega pelo Flow.
    function mostrarAcoesPdf(item) {
        var els = item.els;
        els.acoes.textContent = "";
        var bAbrir = criarBotaoCard("Abrir recibo", true, "abrir");
        bAbrir.onclick = function () { abrirPdf(item); };
        var bBaixar = criarBotaoCard("Baixar PDF", false, "baixar");
        bBaixar.onclick = function () { baixarPdf(item); };
        els.acoes.appendChild(bAbrir);
        els.acoes.appendChild(bBaixar);
    }

    function setStatus(item, status, mensagem) {
        var s = STATUS[status];
        var els = item.els;
        item.status = status;
        els.track.style.display = "none";
        els.toggleLabel.style.display = "none";
        els.pill.style.display = "inline-flex";
        // Descrição só volta a ser editável quando o recibo falhou (para corrigir e tentar de novo)
        els.desc.disabled = status !== "erro";
        els.btnRestaurar.disabled = status !== "erro";
        els.pill.setAttribute("data-status", status);
        els.pill.textContent = "";
        if (status === "gerando") els.pill.appendChild(criarEl("span", "gr-spin"));
        else if (s.ico) els.pill.appendChild(icone_GR(doc, s.ico, 14));
        els.pill.appendChild(doc.createTextNode(s.txt));
        els.card.setAttribute("data-status", status);

        els.acoes.textContent = "";
        els.msg.textContent = mensagem || "";
        els.msg.setAttribute("data-tone", status);
        els.rodapeCard.style.display = (mensagem || status === "ok" || status === "erro" || status === "aguardando") ? "flex" : "none";

        var temPdf = !!(item.pdfUrl || item.url);
        if (temPdf && status !== "fila" && status !== "gerando") mostrarAcoesPdf(item);

        if (status === "aguardando") {
            var bVerificar = criarBotaoCard("Verificar de novo", false, "atualizar");
            bVerificar.onclick = function () {
                ativos++;
                estado = "rodando";
                setStatus(item, "gerando", "");
                atualizarRodape();
                acompanhar(item, Date.now());
            };
            els.acoes.appendChild(bVerificar);
        } else if (status === "erro") {
            var bRetry = criarBotaoCard("Tentar novamente", false, "repetir");
            bRetry.onclick = function () {
                abrirAbaEspera(item);
                setStatus(item, "fila", "");
                fila.push(item);
                iniciarExecucao();
            };
            els.acoes.appendChild(bRetry);
        }
    }

    function contar(status) {
        return itens.filter(function (i) { return i.status === status; }).length;
    }

    function atualizarRodape() {
        var total = itens.length;
        var prontos = contar("ok");
        var erros = contar("erro");
        var pendentes = contar("aguardando");

        if (estado === "rodando") {
            btnPrincipal.disabled = true;
            btnPrincipal.setAttribute("aria-busy", "true");
            rotuloPrincipal("spin",
                "Gerando… " + (prontos + erros + pendentes) + " de " + total + " concluído" + (total > 1 ? "s" : ""));
            btnCancelar.style.display = "";
            btnCancelar.textContent = "Fechar e continuar em segundo plano";
            resumo.style.display = "none";
            subtitulo.textContent = "Quando todos os PDFs estiverem prontos, pode fechar: o OneDrive e o e-mail continuam no servidor.";
            return;
        }

        if (estado === "fim") {
            btnPrincipal.disabled = false;
            btnPrincipal.removeAttribute("aria-busy");
            rotuloPrincipal(null, "Fechar");
            btnCancelar.style.display = "none";

            var partes = [prontos + " de " + total + " pronto" + (prontos === 1 ? "" : "s")];
            if (erros) partes.push(erros + " com erro");
            if (pendentes) partes.push(pendentes + " ainda em andamento");
            resumo.style.display = "block";
            resumo.setAttribute("data-tone", erros ? "erro" : pendentes ? "aguardando" : "ok");
            resumo.textContent = partes.join(" · ");
            subtitulo.textContent = erros
                ? "Alguns recibos falharam. Veja o motivo em cada card."
                : pendentes
                    ? "Alguns recibos ainda estão sendo gerados. O link aparece no registro quando terminar."
                    : "Todos os recibos foram gerados.";
        }
    }

    // ── Execução com fila (máx. GR_MAX_PARALELO simultâneos) ────────────────
    function emailsValidos() {
        // Campo limpo não cancela o envio: o Flow cairia no destinatário gravado.
        var invalido = itens.filter(function (i) {
            if (!i.enviarEmail) return false;
            return i.emailDestino ? !/^\S+@\S+\.\S+$/.test(i.emailDestino) : Boolean(i.p.emailPassageiro);
        })[0];
        if (!invalido) return true;
        invalido.els.emailInput.setAttribute("aria-invalid", "true");
        invalido.els.emailInput.focus();
        return false;
    }

    function iniciarExecucao() {
        itens.forEach(function (i) { i.els.emailInput.disabled = true; });
        estado = "rodando";
        atualizarRodape();
        processarFila();
    }

    function processarFila() {
        while (ativos < GR_MAX_PARALELO && fila.length) executar(fila.shift());
        if (ativos === 0 && fila.length === 0) {
            estado = "fim";
            atualizarRodape();
        } else {
            atualizarRodape();
        }
    }

    function mensagemErroHttp(req) {
        var base = req.status === 429
            ? "Muitas solicitações simultâneas ao Flow (429)."
            : "Não foi possível iniciar a geração (erro " + req.status + ").";
        var m = "";
        try {
            var j = JSON.parse(req.responseText || "{}");
            m = (j.error && (j.error.message || j.error.code)) || j.message || "";
        } catch (e) {
            m = String(req.responseText || "").slice(0, 160);
        }
        return m ? base + " " + m : base;
    }

    // Termina o acompanhamento de um item e libera a vaga na fila.
    function concluir(item, status, mensagem) {
        if (fechado || item.status !== "gerando") return;
        ativos--;
        setStatus(item, status, mensagem);
        processarFila();
    }

    // Lê o pagante até o Flow gravar Concluído/Erro.
    function acompanhar(item, inicio) {
        if (fechado || item.status !== "gerando") return;
        Xrm.WebApi.retrieveRecord(item.p.entityName, item.p.id,
            "?$select=new_statusgeracaorecibo,new_errogeracaorecibo,cr40f_linkdorecibo")
            .then(function (r) {
                if (r.new_statusgeracaorecibo === GR_ST.concluido && r.cr40f_linkdorecibo) {
                    item.url = r.cr40f_linkdorecibo;
                    concluir(item, "ok", r.new_errogeracaorecibo ||
                        ("Recibo gerado." + (item.enviarEmail ? " E-mail enviado." : "")));
                    return;
                }
                if (r.new_statusgeracaorecibo === GR_ST.erro) {
                    concluir(item, "erro", r.new_errogeracaorecibo || "Não foi possível gerar o recibo.");
                    return;
                }
                agendar();
            }, function (e) {
                console.warn(TAG_GR, "Leitura do pagante falhou; tentando de novo:", item.p.id, e);
                agendar();
            });

        function agendar() {
            var decorrido = Date.now() - inicio;
            if (decorrido > GR_ESPERA_MAX_MS) {
                concluir(item, "aguardando", "PDF pronto; ainda salvando no OneDrive. O link aparece no registro " +
                    "quando terminar; não é preciso gerar de novo.");
                return;
            }
            if (decorrido > GR_AVISO_LENTO_MS && !item.avisouLento) {
                item.avisouLento = true;
                item.els.msg.textContent = "O OneDrive está mais lento que o normal. Pode fechar esta janela: " +
                    "o PDF já está pronto e a entrega continua no servidor.";
                item.els.rodapeCard.style.display = "flex";
            }
            setTimeout(function () { acompanhar(item, inicio); }, GR_POLL_MS);
        }
    }

    // Depois do 202: lê o pagante só para trocar a mensagem do card (link salvo) ou apontar erro.
    // Não ocupa vaga na fila.
    function vigiar(item, inicio) {
        if (fechado || item.status !== "ok") return;
        Xrm.WebApi.retrieveRecord(item.p.entityName, item.p.id,
            "?$select=new_statusgeracaorecibo,new_errogeracaorecibo,cr40f_linkdorecibo")
            .then(function (r) {
                if (fechado || item.status !== "ok") return;
                if (r.new_statusgeracaorecibo === GR_ST.concluido && r.cr40f_linkdorecibo) {
                    item.url = r.cr40f_linkdorecibo;
                    item.els.msg.textContent = r.new_errogeracaorecibo ||
                        ("Recibo salvo no OneDrive." + (item.enviarEmail ? " E-mail enviado." : ""));
                    return;
                }
                if (r.new_statusgeracaorecibo === GR_ST.erro) {
                    setStatus(item, "erro", r.new_errogeracaorecibo || "Falha ao salvar ou enviar o recibo.");
                    atualizarRodape();
                    return;
                }
                proxima();
            }, proxima);

        function proxima() {
            if (Date.now() - inicio < GR_ESPERA_MAX_MS) setTimeout(function () { vigiar(item, inicio); }, GR_POLL_MS);
        }
    }

    function executar(item) {
        ativos++;
        var p = item.p;
        item.avisouLento = false;
        setStatus(item, "gerando", "");

        var t0 = Date.now();
        gerarPdf_GR({
            modelo: p.cliente === "Johnson&Johnson" ? "jj" : "comum", // mesma regra do Switch do Flow antigo
            passageiro: p.nomeNoRecibo,
            cliente: p.cliente,
            idPag: p.seqId,
            data: hojeSaoPaulo_GR(),
            forma: p.formaPagamento,
            descricao: (item.descricao || "").trim() || p.descricaoPadrao,
            valor: formatarValor_GR(p.valor),
            obs: p.obs,
            idFin: p.idFin
        }).then(function (bytes) {
            console.log(TAG_GR, "PDF montado em", Date.now() - t0, "ms:", p.id, bytes.length, "bytes");
            // Não revoga o blob anterior: pode estar aberto em outra aba.
            item.pdfUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
            item.pdfNome = "Recibo - " + (p.seqId || p.id) + ".pdf";
            mostrarNaAba(item);
            entregar(item, paraBase64_GR(bytes));
        }, function (e) {
            console.error(TAG_GR, "Falha ao montar PDF:", p.id, e);
            fecharAba(item);
            concluir(item, "erro", "Não foi possível montar o PDF: " + (e && e.message ? e.message : e));
        });
    }

    // Envia o PDF pronto ao Flow, que salva no OneDrive, grava o link e manda o e-mail.
    function entregar(item, pdfBase64) {
        var p = item.p;
        var payload = {
            ID_PAG: p.seqId ? String(p.seqId) : "",
            GUID: String(p.id),
            SEND_EMAIL: item.enviarEmail === true,
            PDF_BASE64: pdfBase64
        };
        if (item.emailDestino && item.emailDestino !== p.emailPassageiro) payload.EMAIL_DESTINO = item.emailDestino;
        console.log(TAG_GR, "Entrega →", p.id, { ID_PAG: payload.ID_PAG, SEND_EMAIL: payload.SEND_EMAIL });
        item.els.msg.textContent = "PDF pronto. Salvando no OneDrive" + (item.enviarEmail ? " e enviando o e-mail…" : "…");
        item.els.rodapeCard.style.display = "flex";
        mostrarAcoesPdf(item);

        var inicio = Date.now();
        var req = new XMLHttpRequest();
        req.open("POST", flowUrl, true);
        req.setRequestHeader("Content-Type", "application/json");
        req.timeout = GR_TIMEOUT_MS;

        req.onload = function () {
            if (req.status === 202 || req.status === 200) {
                // Flow aceitou o PDF: para o usuário o recibo está pronto; OneDrive e e-mail seguem no servidor.
                concluir(item, "ok", "PDF pronto." + (item.enviarEmail ? " O e-mail está sendo enviado." : "") +
                    " O link do OneDrive aparece no registro quando terminar de salvar.");
                vigiar(item, inicio);
            } else {
                console.error(TAG_GR, "Falha ao iniciar guid:", p.id, req.status, req.responseText);
                concluir(item, "erro", mensagemErroHttp(req));
            }
        };
        req.onerror = function () {
            concluir(item, "erro", "Falha de rede ao chamar o Flow. Verifique a conexão e tente novamente.");
        };
        req.ontimeout = function () {
            // Sem 202 não dá para saber se começou; o registro diz a verdade.
            acompanhar(item, inicio);
        };
        req.send(JSON.stringify(payload));
    }

    // ── Fechar ───────────────────────────────────────────────────────────────
    function fecharModal() {
        var iniciou = estado !== "idle";
        fechado = true; // para o acompanhamento; o Flow continua no servidor
        doc.removeEventListener("keydown", onKey, true);
        overlay.classList.add("gr-fechando");
        overlay.classList.remove("gr-aberto");
        setTimeout(function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            try { if (focoAnterior && focoAnterior.focus) focoAnterior.focus(); } catch (e) {}
        }, 160);

        if (iniciou) {
            try { if (primaryControl && primaryControl.refresh) primaryControl.refresh(); } catch (e) {}
        }
    }

    // Antes de gerar, descrição editada é alteração não salva: pede confirmação.
    function temAlteracoes() {
        return estado === "idle" && itens.some(function (i) { return i.descricao !== (i.p.descricaoPadrao || ""); });
    }

    function confirmando() { return confirmar.style.display === "flex"; }

    function mostrarConfirmacao(sim) {
        confirmar.style.display = sim ? "flex" : "";
        acoesRodape.style.display = sim ? "none" : "";
        try { (sim ? btnContinuar : btnCancelar).focus(); } catch (e) {}
    }

    function pedirFechar() {
        if (temAlteracoes()) { mostrarConfirmacao(true); return; }
        fecharModal();
    }

    function focaveis() {
        return Array.prototype.filter.call(
            modal.querySelectorAll("button,textarea,input,select,a[href],[tabindex]:not([tabindex='-1'])"),
            function (el) { return !el.disabled && el.offsetParent !== null; });
    }

    function onKey(ev) {
        if (ev.key === "Escape") {
            ev.stopPropagation();
            if (confirmando()) mostrarConfirmacao(false);
            else pedirFechar();
            return;
        }
        if (ev.key === "Tab") { // foco contido no modal
            var f = focaveis();
            if (!f.length) return;
            var atual = doc.activeElement;
            var fora = !modal.contains(atual);
            if (ev.shiftKey && (fora || atual === f[0])) { ev.preventDefault(); f[f.length - 1].focus(); }
            else if (!ev.shiftKey && (fora || atual === f[f.length - 1])) { ev.preventDefault(); f[0].focus(); }
        }
    }

    btnContinuar.onclick = function () { mostrarConfirmacao(false); };
    btnDescartar.onclick = function () { fecharModal(); };
    btnFechar.onclick = function (ev) { ev.preventDefault(); pedirFechar(); };

    btnPrincipal.onclick = function (ev) {
        ev.preventDefault();
        if (estado === "fim") { fecharModal(); return; }
        if (estado !== "idle") return;
        if (!emailsValidos()) return;

        var totalEmail = itens.filter(function (i) { return i.enviarEmail; }).length;
        console.log(TAG_GR, "Iniciando geração. Total:", itens.length, "| Com email:", totalEmail);

        // Abas abertas já no clique (abrir depois, quando o PDF fica pronto, o navegador bloqueia)
        itens.forEach(function (i) { abrirAbaEspera(i); setStatus(i, "fila", ""); fila.push(i); });
        iniciarExecucao();
    };

    btnCancelar.onclick = function (ev) { ev.preventDefault(); pedirFechar(); };
    // Clique fora não fecha durante a geração (evita perder o acompanhamento sem querer)
    overlay.onclick = function (ev) { if (ev.target === overlay && estado !== "rodando") pedirFechar(); };
    doc.addEventListener("keydown", onKey, true);

    // ── Montar DOM ───────────────────────────────────────────────────────────
    modal.appendChild(header);
    modal.appendChild(lista);
    modal.appendChild(rodape);
    overlay.appendChild(modal);
    doc.body.appendChild(overlay);

    requestAnimationFrame(function () {
        overlay.classList.add("gr-aberto");
        try { btnPrincipal.focus(); } catch (e) {}
    });
}

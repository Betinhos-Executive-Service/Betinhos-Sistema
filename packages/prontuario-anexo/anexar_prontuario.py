#!/usr/bin/env python3
"""Anexa fotos/PDF do chat ao prontuário de um funcionário (flow "Prontuário | Anexar pelo Claude").

O arquivo não passa pelo modelo: o script lê do disco (/mnt/user-data/uploads/...) e manda direto ao flow.
Antes, o Claude chama a Custom API cr40f_PrepararAnexoProntuario pelo conector (com o login de quem pede)
e recebe liberacaoId, token (uso único, 10 min) e urlEnvio. Nenhuma credencial fica na skill.

  python3 anexar_prontuario.py --url URL_ENVIO --liberacao ID --token TOKEN \
      --titulo "Documento RG" --texto "Frente e verso" /mnt/user-data/uploads/rg.jpg [...]

Saída (stdout, JSON): {"sucesso": true, "annotationId": "...", "arquivos": N} ou {"sucesso": false, "erro": "..."}.
Código de saída: 0 sucesso, 1 recusado/erro do flow, 2 erro de uso ou arquivo inválido (nada enviado).
Só biblioteca padrão.
"""
import argparse
import base64
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MAX_ARQUIVOS = 10
MAX_BYTES = 10 * 1024 * 1024
MAX_TOTAL = 50 * 1024 * 1024
TIPOS = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.heic': 'image/heic', '.heif': 'image/heif', '.pdf': 'application/pdf'}
# Destinos aceitos: gatilho HTTP do Power Automate (Logic Apps ou endpoint novo do Power Platform).
HOSTS = ('.logic.azure.com', '.powerplatform.com')


class ErroUso(Exception):
    """Erro antes de enviar qualquer coisa (código 2)."""


def assinatura_ok(mime, inicio):
    if mime == 'image/jpeg':
        return inicio[:3] == b'\xff\xd8\xff'
    if mime == 'image/png':
        return inicio[:8] == b'\x89PNG\r\n\x1a\n'
    if mime == 'application/pdf':
        return inicio[:5] == b'%PDF-'
    return inicio[4:8] == b'ftyp'  # HEIC/HEIF (ISO BMFF)


def validar(caminhos):
    """Valida todos antes de enviar qualquer um. Devolve [(Path, mime, bytes)]."""
    if not caminhos:
        raise ErroUso('Nenhum arquivo informado.')
    if len(caminhos) > MAX_ARQUIVOS:
        raise ErroUso(f'No máximo {MAX_ARQUIVOS} arquivos por vez.')
    arquivos, total = [], 0
    for caminho in caminhos:
        arquivo = Path(caminho)
        if not arquivo.is_file():
            raise ErroUso(f'Arquivo não encontrado: {arquivo.name}')
        mime = TIPOS.get(arquivo.suffix.lower())
        if not mime:
            raise ErroUso(f'{arquivo.name}: só fotos (JPG, PNG, HEIC) e PDF.')
        tamanho = arquivo.stat().st_size
        if tamanho == 0:
            raise ErroUso(f'{arquivo.name}: arquivo vazio.')
        if tamanho > MAX_BYTES:
            raise ErroUso(f'{arquivo.name}: maior que 10 MB.')
        total += tamanho
        if total > MAX_TOTAL:
            raise ErroUso('Os arquivos somam mais de 50 MB; envie em partes.')
        dados = arquivo.read_bytes()
        if not assinatura_ok(mime, dados[:16]):
            raise ErroUso(f'{arquivo.name}: o conteúdo não é {mime} (extensão trocada?).')
        arquivos.append((arquivo, mime, dados))
    return arquivos


def validar_url(url, permitir_local=False):
    partes = urllib.parse.urlsplit(url)
    if permitir_local and partes.scheme == 'http' and partes.hostname in ('127.0.0.1', 'localhost'):
        return
    if partes.scheme != 'https' or not (partes.hostname or '').endswith(HOSTS):
        raise ErroUso('URL de envio inválida: use a urlEnvio devolvida por cr40f_PrepararAnexoProntuario.')


def montar_corpo(liberacao, token, titulo, texto, arquivos):
    return {
        'liberacaoId': liberacao,
        'token': token,
        'titulo': titulo,
        'texto': texto,
        'arquivos': [{'nome': a.name, 'mimeType': mime, 'conteudoBase64': base64.b64encode(dados).decode('ascii')} for a, mime, dados in arquivos],
    }


def enviar(url, corpo, timeout=180):
    req = urllib.request.Request(url, data=json.dumps(corpo).encode('utf-8'), headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status, bruto = resp.status, resp.read()
    except urllib.error.HTTPError as erro:
        status, bruto = erro.code, erro.read()
    except (urllib.error.URLError, TimeoutError, OSError) as erro:
        return {'sucesso': False, 'erro': f'Sem resposta do flow ({getattr(erro, "reason", erro)}). Confira no prontuário antes de tentar de novo.'}
    try:
        resultado = json.loads(bruto or b'{}')
    except ValueError:
        resultado = {}
    if not isinstance(resultado, dict):
        resultado = {}
    if status < 300 and resultado.get('sucesso') is True:
        return resultado
    if status >= 500 and not resultado.get('erro'):
        # Ex.: 502/504 quando o flow passa de 2 min para responder; ele pode ter salvo mesmo assim.
        return {'sucesso': False, 'erro': f'Sem resposta completa do flow (HTTP {status}). Confira no prontuário antes de tentar de novo.', 'http': status}
    return {'sucesso': False, 'erro': str(resultado.get('erro') or f'O flow recusou o envio (HTTP {status}).'), 'http': status}


def main(argv=None, permitir_local=False):
    p = argparse.ArgumentParser(description='Anexa fotos/PDF ao prontuário do funcionário.')
    p.add_argument('--url', required=True, help='urlEnvio de cr40f_PrepararAnexoProntuario')
    p.add_argument('--liberacao', required=True, help='liberacaoId')
    p.add_argument('--token', required=True)
    p.add_argument('--titulo', default='')
    p.add_argument('--texto', default='')
    p.add_argument('arquivos', nargs='+')
    args = p.parse_args(argv)
    try:
        validar_url(args.url, permitir_local)
        arquivos = validar(args.arquivos)
    except ErroUso as erro:
        print(json.dumps({'sucesso': False, 'erro': str(erro)}, ensure_ascii=False))
        print(f'ERRO: {erro}', file=sys.stderr)
        return 2
    resultado = enviar(args.url, montar_corpo(args.liberacao, args.token, args.titulo, args.texto, arquivos))
    print(json.dumps(resultado, ensure_ascii=False))
    if resultado.get('sucesso') is not True:
        print(f'ERRO: {resultado.get("erro")}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

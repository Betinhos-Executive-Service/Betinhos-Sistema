"""Testes do anexar_prontuario.py contra um servidor HTTP falso (python -m unittest, só stdlib)."""
import base64
import contextlib
import io
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import anexar_prontuario as ap

JPG = b'\xff\xd8\xff\xe0' + b'0' * 100
PDF = b'%PDF-1.7\n' + b'1' * 50
PNG = b'\x89PNG\r\n\x1a\n' + b'2' * 20
HEIC = b'\x00\x00\x00\x18ftypheic' + b'3' * 10


class Falso(BaseHTTPRequestHandler):
    resposta = (200, {'sucesso': True, 'annotationId': 'a1', 'arquivos': 1})
    recebidos = []

    def do_POST(self):
        tamanho = int(self.headers['Content-Length'])
        Falso.recebidos.append((self.headers['Content-Type'], json.loads(self.rfile.read(tamanho))))
        status, corpo = Falso.resposta
        bruto = corpo if isinstance(corpo, bytes) else json.dumps(corpo).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(bruto)))
        self.end_headers()
        self.wfile.write(bruto)

    def log_message(self, *args):
        pass


class AnexarTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(('127.0.0.1', 0), Falso)
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/invoke'
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        Falso.recebidos.clear()
        Falso.resposta = (200, {'sucesso': True, 'annotationId': 'a1', 'arquivos': 1})

    def tearDown(self):
        self.dir.cleanup()

    def arq(self, nome, dados):
        caminho = Path(self.dir.name) / nome
        caminho.write_bytes(dados)
        return str(caminho)

    def rodar(self, *arquivos, url=None, extra=()):
        saida, erro = io.StringIO(), io.StringIO()
        argv = ['--url', url or self.url, '--liberacao', 'L1', '--token', 'T0k', '--titulo', 'RG', '--texto', 'Frente\nVerso', *extra, *arquivos]
        with contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro):
            codigo = ap.main(argv, permitir_local=True)
        return codigo, json.loads(saida.getvalue()), erro.getvalue()

    def test_sucesso_envia_corpo_combinado_com_o_flow(self):
        codigo, res, _ = self.rodar(self.arq('rg.jpg', JPG), self.arq('laudo.PDF', PDF))
        self.assertEqual(codigo, 0)
        self.assertEqual(res, {'sucesso': True, 'annotationId': 'a1', 'arquivos': 1})
        tipo, corpo = Falso.recebidos[0]
        self.assertEqual(tipo, 'application/json')
        self.assertEqual(set(corpo), {'liberacaoId', 'token', 'titulo', 'texto', 'arquivos'})
        self.assertEqual((corpo['liberacaoId'], corpo['token'], corpo['titulo'], corpo['texto']), ('L1', 'T0k', 'RG', 'Frente\nVerso'))
        self.assertEqual([(a['nome'], a['mimeType']) for a in corpo['arquivos']], [('rg.jpg', 'image/jpeg'), ('laudo.PDF', 'application/pdf')])
        self.assertEqual(base64.b64decode(corpo['arquivos'][0]['conteudoBase64']), JPG)

    def test_png_e_heic_aceitos(self):
        codigo, _, _ = self.rodar(self.arq('a.png', PNG), self.arq('b.heic', HEIC), self.arq('c.heif', HEIC))
        self.assertEqual(codigo, 0)
        self.assertEqual([a['mimeType'] for a in Falso.recebidos[0][1]['arquivos']], ['image/png', 'image/heic', 'image/heif'])

    def assertRecusadoSemEnviar(self, trecho, *arquivos, url=None):
        codigo, res, erro = self.rodar(*arquivos, url=url)
        self.assertEqual(codigo, 2)
        self.assertFalse(res['sucesso'])
        self.assertIn(trecho, res['erro'])
        self.assertIn('ERRO:', erro)
        self.assertEqual(Falso.recebidos, [])

    def test_tipo_nao_permitido(self):
        self.assertRecusadoSemEnviar('só fotos', self.arq('x.exe', b'MZ'))

    def test_extensao_trocada(self):
        self.assertRecusadoSemEnviar('não é application/pdf', self.arq('virus.pdf', b'MZ\x90\x00'))

    def test_maior_que_10_mb(self):
        self.assertRecusadoSemEnviar('maior que 10 MB', self.arq('g.jpg', JPG[:4] + b'0' * (10 * 1024 * 1024)))

    def test_vazio_e_inexistente(self):
        self.assertRecusadoSemEnviar('vazio', self.arq('v.jpg', b''))
        self.assertRecusadoSemEnviar('não encontrado', str(Path(self.dir.name) / 'nada.jpg'))

    def test_mais_de_10_arquivos(self):
        self.assertRecusadoSemEnviar('No máximo 10', *[self.arq(f'f{i}.jpg', JPG) for i in range(11)])

    def test_valida_todos_antes_de_enviar(self):
        self.assertRecusadoSemEnviar('só fotos', self.arq('ok.jpg', JPG), self.arq('ruim.txt', b'x'))

    def test_url_fora_do_power_automate(self):
        self.assertRecusadoSemEnviar('URL de envio inválida', self.arq('ok.jpg', JPG), url='https://exemplo.com/x')
        with self.assertRaises(ap.ErroUso):
            ap.validar_url(self.url)  # http local só nos testes
        ap.validar_url('https://prod-12.brazilsouth.logic.azure.com:443/workflows/x/triggers/manual/paths/invoke?sig=y')
        ap.validar_url('https://abc.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/x')

    def test_recusa_do_flow_sai_com_codigo_1_e_mensagem(self):
        Falso.resposta = (403, {'sucesso': False, 'erro': 'Liberação expirada (vale 10 minutos). Peça uma nova ao Claude.'})
        codigo, res, erro = self.rodar(self.arq('rg.jpg', JPG))
        self.assertEqual(codigo, 1)
        self.assertEqual(res['erro'], 'Liberação expirada (vale 10 minutos). Peça uma nova ao Claude.')
        self.assertEqual(res['http'], 403)
        self.assertIn('expirada', erro)

    def test_erro_500_sem_json(self):
        Falso.resposta = (500, b'<html>falha</html>')
        codigo, res, _ = self.rodar(self.arq('rg.jpg', JPG))
        self.assertEqual(codigo, 1)
        self.assertIn('HTTP 500', res['erro'])

    def test_200_sem_sucesso_true_e_erro(self):
        Falso.resposta = (200, {'ok': True})
        codigo, res, _ = self.rodar(self.arq('rg.jpg', JPG))
        self.assertEqual(codigo, 1)
        self.assertFalse(res['sucesso'])

    def test_sem_resposta(self):
        codigo, res, _ = self.rodar(self.arq('rg.jpg', JPG), url='http://127.0.0.1:9/fechado')
        self.assertEqual(codigo, 1)
        self.assertIn('Sem resposta', res['erro'])


if __name__ == '__main__':
    unittest.main()

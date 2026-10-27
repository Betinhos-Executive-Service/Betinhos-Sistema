# Extensão Betinhos · WhatsApp para Planner

Extensão Manifest V3 para Chrome/Edge. O WAHA é opcional e serve somente para resolver telefone quando o WhatsApp Web entrega um `@lid`.

## Desenvolvimento local

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione esta pasta `extension/`.
5. Abra o WhatsApp Web e mantenha uma aba autenticada do Planner aberta.

O endpoint da IA fica configurável no popup. Nunca coloque `DEEPSEEK_API_KEY` nesta pasta.

## WAHA local opcional

O projeto inclui `docker-compose.waha.yml` com um único container GOWS, preso ao loopback, sem download de mídia e com sessão persistida em `.waha-sessions/`. O WAHA não é consultado continuamente: a extensão faz uma única chamada somente quando a conversa classificada não tem telefone.

No PowerShell, na raiz do projeto:

```powershell
.\scripts\waha-install.ps1
```

Depois, no popup, habilite **Usar WAHA para resolver telefone**, informe a chave gerada em `.env.waha.local` e mantenha a sessão `default`. Para parear, abra `http://127.0.0.1:3000/dashboard` uma única vez.

No Docker Desktop, habilite **Start Docker Desktop when you sign in** e desabilite **Open Docker Dashboard when Docker Desktop starts**. O engine e o container poderão iniciar em segundo plano, sem abrir a janela do Docker.

## Contrato da triagem

O service worker chama `POST /v1/triage` e espera `TriageResult` em JSON. O Planner recebe somente entradas aprovadas pela colaboradora via bridge `postMessage`.

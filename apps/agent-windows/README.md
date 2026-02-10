# Agente de monitoramento (Windows)

Agente que roda em cada computador a ser monitorado. Registra o dispositivo na API e envia o preview da tela (1–2 fps) via WebSocket para o dashboard e modo TV.

## Requisitos

- **Node.js 18+** (recomendado 20+)
- **Windows** (o pacote `screenshot-desktop` também funciona em macOS/Linux)

## Formas de executar

### 1. Executável (.exe) com interface gráfica — recomendado

O agente é distribuído como um **único .exe** com janela de configuração integrada. Não é necessário usar BAT nem variáveis de ambiente: tudo é configurado pela interface.

**Gerar o executável e o instalador:**

- **No Windows:** `npm run build:exe` gera os dois artefatos (portable + instalador NSIS).
- **No Linux/macOS:** `npm run build:exe` gera só o **portable** (o instalador NSIS não é suportado nessa plataforma). O CI no GitHub (Windows) gera os dois ao publicar uma release.

```bash
# Na raiz do repositório (monorepo):
npm ci
npm run build:exe --workspace=@monitoramento/agent-windows
```

Ou dentro da pasta do agente (depois de `npm install` na raiz e na pasta):

```bash
cd apps/agent-windows
npm run build:exe
```

Serão criados em **`apps/agent-windows/dist/`**:
- **`monitoramento-agent.exe`** — executável portátil (copie e execute sem instalar); gerado em qualquer OS.
- **`Monitoramento de Telas - Agente Setup 1.0.0.exe`** — instalador NSIS (só no Windows); quem instala recebe atualizações automáticas pelo app.

**No PC que será monitorado:**

1. Copie o **`monitoramento-agent.exe`** para o PC.
2. Dê **duplo clique** no .exe.
3. Abre uma **janela de configuração** (tema escuro, formulário simples).
4. Preencha:
   - **URL da API** — ex.: `http://192.168.4.90:4001`
   - **ID do agente** — ex.: `PC-SALA-01` (opcional)
   - **Nome exibido** — ex.: `Sala Reuniões` (opcional)
   - **Segredo de registro** — o mesmo configurado na API (ex.: `dev-agent-secret`)
5. Clique em **Salvar e iniciar**. A configuração é salva localmente e o agente começa a enviar a tela para o servidor.
6. Na próxima vez que abrir o .exe, ele usará a configuração salva e tentará conectar automaticamente. Para alterar, use o botão **Apenas reconfigurar** ou feche e apague o arquivo de config.

**Onde fica a configuração:** em `%APPDATA%/monitoramento-agent/config.json`. Para “reinstalar do zero”, apague essa pasta e abra o .exe de novo.

**Atualização automática:** o .exe verifica atualizações no [GitHub Releases](https://github.com/DanielCherutti/monitoramento-telas/releases). Ao abrir ou a cada 4 h ele consulta nova versão; se houver, baixa e oferece reiniciar. Use o botão **Verificar atualizações** na janela de configuração. Ao publicar uma release manualmente, anexe o executável com o nome **`monitoramento-agent.exe`** para o atualizador reconhecer (e não marque como "Pre-release" se quiser que todos recebam).

### 2. Duplo clique no .bat (Node instalado no PC)

1. Copie a pasta **`apps/agent-windows`** inteira para o PC (com `node_modules` e `dist` já gerados, ou só o código).
2. No PC, instale o [Node.js](https://nodejs.org) se ainda não tiver.
3. Abra um terminal na pasta do agente e rode: `npm install` e `npm run build`.
4. Dê **duplo clique** em **`executar-agente.bat`**. O agente inicia e a janela permanece aberta; fechar a janela encerra o agente.

### 3. Linha de comando (npm)

```bash
cd apps/agent-windows
npm install
npm run dev
```

Ou em produção: `npm run build` e depois `npm start`.

## Instalação (para opções 2 e 3)

```bash
cd apps/agent-windows
npm install
```

## Configuração

**Executável com interface:** a configuração é feita na própria janela do .exe (veja opção 1 acima). As demais opções usam variáveis de ambiente ou arquivo `.env`:

Variáveis de ambiente (opções 2 e 3):

| Variável | Obrigatório | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `API_URL` | Não | URL da API | `http://192.168.4.90:4001` |
| `AGENT_ID` | Não | Identificador único do agente (padrão: hostname) | `PC-SALA-01` |
| `HOSTNAME` | Não | Nome exibido no dashboard (padrão: hostname do SO) | `Sala Reuniões` |
| `REGISTRATION_SECRET` | Sim* | Segredo para registrar o dispositivo (igual ao da API) | `dev-agent-secret` |
| `FPS` | Não | Frames por segundo do preview (0.25–2, padrão: 1) | `1` |

\* Se a API estiver com o segredo padrão `dev-agent-secret`, não precisa definir.

## Executar

**Desenvolvimento (com recarregamento):**
```bash
npm run dev
```

**Produção (compilado):**
```bash
npm run build
npm start
```

**Exemplo com variáveis:**
```bash
set API_URL=http://192.168.4.90:4001
set AGENT_ID=PC-SALA-01
set HOSTNAME=Sala Reunioes
set REGISTRATION_SECRET=dev-agent-secret
npm run dev
```

No PowerShell:
```powershell
$env:API_URL="http://192.168.4.90:4001"
$env:AGENT_ID="PC-SALA-01"
$env:HOSTNAME="Sala Reunioes"
npm run dev
```

## Fluxo

1. **Registro:** o agente envia `POST /devices/register` com `agentId`, `hostname` e `secret`.
2. **Preview:** conecta em `ws://API/ws/device/preview?agentId=...` e envia frames JPEG em binário.
3. O dashboard e a página **Modo TV** (`/monitor`) exibem o preview ao vivo dos dispositivos favoritos.

## Adicionar ao dashboard

1. No **dashboard** (web), acesse a lista de **Dispositivos**.
2. O computador onde o agente está rodando aparecerá na lista (depois do primeiro registro).
3. Clique em **Favoritar** para que a tela apareça no dashboard e no **Modo TV** (`/monitor`).

## Rodar como serviço no Windows (opcional)

Para o agente iniciar com o Windows e ficar rodando em segundo plano:

- Use **NSSM** (Non-Sucking Service Manager) ou **node-windows** para criar um serviço Windows.
- Ou coloque um atalho do `npm start` na pasta **Inicializar** do Windows.

## API

A API deve estar rodando e com a variável `AGENT_REGISTRATION_SECRET` igual ao `REGISTRATION_SECRET` do agente (ou use o padrão `dev-agent-secret` em desenvolvimento).

# Como ver se o PC está barrando o agente

Se o **Testar conexão** mostra OK, mas no dashboard o dispositivo fica **Offline** ou **Conectando...**, algo no PC pode estar bloqueando o agente depois que ele inicia. Siga estes passos no PC onde o agente **não** funciona.

---

## 1. Ver o log do agente (novo)

1. Abra a janela do agente (ícone na bandeja → abrir).
2. Clique em **"Abrir pasta do log (diagnóstico)"** no rodapé — o Explorer abre na pasta certa.
3. Dentro da pasta, abra o arquivo **`agent-log.txt`** (só existe depois de o agente ter rodado pelo menos uma vez).
4. Envie o conteúdo desse arquivo para quem está configurando o sistema.

**Onde fica a pasta (se quiser ir manualmente):**

- **Windows:**  
  `C:\Users\<nome-do-usuário>\AppData\Roaming\Monitoramento de Telas - Agente`  
  O arquivo do log é: `agent-log.txt` dentro dessa pasta.
- Para abrir a pasta rápido: no Explorador de Arquivos, na barra de endereço, cole:  
  `%APPDATA%\Monitoramento de Telas - Agente`  
  e pressione Enter.

O log mostra se o registro na API deu certo, se o WebSocket conectou e se a captura de tela está falhando. Assim dá para ver exatamente onde parou.

---

## 2. Firewall do Windows

O Windows pode estar bloqueando o **executável** do agente (não o teste de conexão).

1. **Windows Security** → **Firewall e proteção de rede** → **Configurações avançadas**.
2. **Regras de entrada** e **Regras de saída**.
3. Verifique se existe regra que **bloqueia** o `.exe` do agente (nome do executável ou pasta onde está).
4. Se quiser liberar: **Nova regra** → **Programa** → escolher o `.exe` do agente → **Permitir** (entrada e saída).

Ou, só para teste, desative o firewall por alguns minutos e veja se o dashboard passa a mostrar o dispositivo online.

---

## 3. Antivírus / segurança corporativa

- Antivírus ou solução corporativa podem **bloquear** ou **encerrar** o agente depois que ele abre.
- Adicione uma **exceção** para a pasta do agente (ou o `.exe`).
- Ou desative o antivírus **só para teste** e veja se o preview aparece no dashboard.

---

## 4. Rodar pelo terminal (para ver erros)

1. Abra **cmd** ou **PowerShell**.
2. Vá até a pasta onde está o executável do agente.
3. Rode o `.exe` direto pelo terminal, por exemplo:  
   `.\MonitoramentoTelas-Agente.exe`  
   (ou o nome real do executável).
4. Deixe a janela aberta e observe se aparecem mensagens em vermelho ou erros.
5. Se aparecer algo como `[register] Falha` ou `[preview] Erro`, anote e envie.

---

## 5. Rede / VPN / proxy

- Se o PC usa **VPN** ou **proxy**, a conexão pode ser diferente da do “Testar conexão”.
- Teste com a VPN desligada (se for permitido).
- Em rede corporativa, o firewall da empresa pode bloquear **WebSocket** ou a porta do servidor (ex.: 4001). Confirme com o TI se há liberação para o IP e porta do servidor.

---

## Resumo

| O que fazer | Objetivo |
|-------------|----------|
| **Abrir pasta do log** e enviar `agent-log.txt` | Ver onde o agente parou (registro, WebSocket, captura). |
| **Firewall** | Ver se o Windows está bloqueando o .exe. |
| **Antivírus** | Ver se está bloqueando ou encerrando o agente. |
| **Rodar o .exe no cmd** | Ver mensagens de erro na tela. |
| **VPN / rede** | Descobrir se a rede ou proxy bloqueia a conexão. |

Depois de gerar o log e (se possível) testar firewall/antivírus, envie o **agent-log.txt** e qualquer mensagem de erro que aparecer no terminal para analisar.

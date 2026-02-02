@echo off
chcp 65001 >nul
title Monitoramento de Telas - Agente
cd /d "%~dp0"

echo ============================================
echo   Agente de Monitoramento - Use este .bat
echo   para ver mensagens e erros (nao abra o .exe direto)
echo ============================================
echo.

REM Execute o .exe que esta na MESMA pasta deste .bat
if not exist "monitoramento-agent.exe" (
  if exist "dist\monitoramento-agent.exe" (
    echo Executando dist\monitoramento-agent.exe ...
    echo.
    dist\monitoramento-agent.exe
  ) else (
    echo ERRO: monitoramento-agent.exe nao encontrado.
    echo Coloque este .bat na MESMA pasta do monitoramento-agent.exe
    echo ou execute a partir da pasta do projeto (onde esta a pasta dist).
  )
) else (
  monitoramento-agent.exe
)

echo.
echo --------------------------------------------
echo O agente encerrou. Veja as mensagens acima.
echo Pressione qualquer tecla para fechar esta janela.
pause >nul

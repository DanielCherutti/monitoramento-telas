@echo off
title Monitoramento de Telas - Agente
cd /d "%~dp0"

REM Se existir o .exe, use-o (nao precisa de Node instalado)
if exist "dist\monitoramento-agent.exe" (
  echo Iniciando agente (executavel)...
  dist\monitoramento-agent.exe
  pause
  exit /b 0
)

REM Senao, use Node (npm install + build necessarios)
if not exist "node_modules" (
  echo Instalando dependencias... Execute: npm install
  npm install
  if errorlevel 1 (
    echo Erro ao instalar. Instale o Node.js em https://nodejs.org
    pause
    exit /b 1
  )
)

if not exist "dist\index.js" (
  echo Compilando... Execute: npm run build
  npm run build
  if errorlevel 1 (
    echo Erro ao compilar.
    pause
    exit /b 1
  )
)

node dist\index.js
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  StudyRAG - MySQL Local + Gemini
 echo ============================================
if not exist node_modules (
  echo Instalando bibliotecas do projeto...
  call npm install
  if errorlevel 1 (
    echo Falha ao instalar. Verifique sua internet e o Node.js.
    pause
    exit /b 1
  )
)
if not exist .env (
  call npm run setup
  echo.
  echo ARQUIVO .env CRIADO.
  echo Abra o arquivo .env, configure DB_PASSWORD e Gemini, e execute iniciar.bat novamente.
  pause
  exit /b 0
)
echo Verifique se o MySQL Server esta iniciado.
echo Iniciando StudyRAG em http://localhost:5173 ...
start "" http://localhost:5173
call npm run dev
pause

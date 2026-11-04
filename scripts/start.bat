@echo off
REM Start the full stack (backend + frontend) on Windows.
REM Usage: double-click, or run: scripts\start.bat  (from the project root)
cd /d %~dp0..
if not exist backend\.venv (
  echo Creating backend virtual environment...
  python -m venv backend\.venv
  call backend\.venv\Scripts\activate.bat
  pip install -r backend\requirements.txt
)
if not exist frontend\node_modules (
  echo Installing frontend dependencies...
  cd frontend && call npm install && cd ..
)
echo Starting backend on http://localhost:5000 ...
start "AquaWatch backend" cmd /k "cd backend && ..\.venv\Scripts\activate.bat && python app.py"
echo Starting frontend on http://localhost:5173 ...
cd frontend && npm run dev

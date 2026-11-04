#!/usr/bin/env bash
# Start the full stack (backend + frontend) for local development.
# Usage: bash scripts/start.sh   (from the project root)
set -e
cd "$(dirname "$0")/.."

if [ ! -d "backend/.venv" ]; then
  echo "Creating backend virtual environment..."
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -r backend/requirements.txt
fi
if [ ! -d "frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  (cd frontend && npm install)
fi

echo "Starting backend on http://localhost:5000 ..."
(cd backend && ../backend/.venv/bin/python app.py > /tmp/aquawatch-backend.log 2>&1 &) || (cd backend && .venv/bin/python app.py > /tmp/aquawatch-backend.log 2>&1 &)
echo "Starting frontend on http://localhost:5173 ..."
(cd frontend && npm run dev)

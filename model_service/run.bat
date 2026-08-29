@echo off
REM Starts the model service using this folder's venv, regardless of PATH.
setlocal
set HERE=%~dp0
if not exist "%HERE%.venv\Scripts\python.exe" (
    echo venv missing - creating it and installing requirements...
    python -m venv "%HERE%.venv"
    "%HERE%.venv\Scripts\python.exe" -m pip install --upgrade pip
    "%HERE%.venv\Scripts\python.exe" -m pip install -r "%HERE%requirements.txt"
)
"%HERE%.venv\Scripts\python.exe" "%HERE%main.py"

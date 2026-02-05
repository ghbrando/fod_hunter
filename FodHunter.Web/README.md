# FOD Hunter

This repo has three runtime pieces that talk to each other:

- React UI (Vite) in `FodHunter.Web`
- .NET API + vision server in `DotNetServer/src/FodHunter.Vision`
- Whisper transcription service in `whisper_server.py`

The fastest way to run everything is to open **three terminals**, one per service.

## Prerequisites

- Node.js + npm
- .NET SDK (8.x recommended)
- Python 3.10+ (for Whisper)
- A `best.onnx` model file in `DotNetServer/src/FodHunter.Vision` (the API loads it from the working directory)

## Install Dependencies (one-time)

### 1) React UI

```powershell
cd FodHunter.Web
npm install
```

### 2) .NET API

```powershell
cd DotNetServer/src/FodHunter.Vision
dotnet restore
```

### 3) Whisper server

```powershell
cd <repo root>
python -m venv whisper_env
.\whisper_env\Scripts\Activate.ps1
pip install -r requirements.txt
```

If you already have `whisper_env` created, just activate it and install requirements.

## Run Everything (3 Terminals)

Open three terminals at the repo root and run the following:

### Terminal 1: Whisper server (port 8000)

```powershell
.\whisper_env\Scripts\Activate.ps1
python .\whisper_server.py
```

### Terminal 2: .NET API + vision (port 5000)

```powershell
cd DotNetServer/src/FodHunter.Vision
dotnet run
```

### Terminal 3: React UI (port 5173)

```powershell
cd FodHunter.Web
npm run dev
```

Once all three are up, open the UI at `http://localhost:5173`.

## Optional: Unity Sim

The Unity project lives in `UnitySim/`. Open it in the Unity Editor and press Play after the three services above are running. Unity will post frames to the .NET API and poll for drone commands.

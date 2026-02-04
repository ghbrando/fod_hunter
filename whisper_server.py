import os
import sys

# 1. MOVE THIS TO THE VERY TOP - BEFORE ANY OTHER IMPORTS
lib_path = r"C:\Users\griss\projects\fod_hunter\libs"

if os.path.exists(lib_path):
    # Add to DLL directory for Python 3.8+
    os.add_dll_directory(lib_path)
    # Add to system PATH for the underlying C++ libraries
    os.environ["PATH"] = lib_path + os.pathsep + os.environ["PATH"]
    print(f"--- SYSTEM PATH UPDATED: {lib_path} ---")

# Now import the rest
import shutil
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import uvicorn

app = FastAPI()

# 2. CORS (Allows Brandon's React app to talk to Eli's 4090)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. INITIALIZE MODEL (This will no longer crash)
print("Loading Large-v3 on 4090...")
model = WhisperModel("large-v3", device="cuda", compute_type="float16")
print("--- WHISPER SERVER ONLINE ---")

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    temp_path = "incoming_voice.webm"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # beam_size=1 is faster and prevents 'Connection Reset' errors
    segments, _ = model.transcribe(temp_path, beam_size=1)
    text = " ".join([s.text for s in segments]).strip()
    
    return {"text": text}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
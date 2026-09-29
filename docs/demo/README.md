# Recording the demo

`demo.gif` is recorded against the real vision server, model, and web consoles.
The Unity drone sim isn't needed: `feeder.py` stands in for it by panning over a
flight deck built from the sim's own frame and posting each view to the server,
the same way Unity does. Voice input is not shown.

```bash
# 1. Vision server (:5000) and web consoles (:5173)
cd DotNetServer/src/FodHunter.Vision && dotnet run
cd FodHunter.Web && npm install && npm run dev

# 2. Simulated drone feed
pip install pillow
python docs/demo/feeder.py DotNetServer/src/FodHunter.Vision/debug_server_view.jpg

# 3. Drive the consoles and record (uses installed Microsoft Edge)
npm i -D playwright && node docs/demo/record.mjs    # writes out/*.webm
```

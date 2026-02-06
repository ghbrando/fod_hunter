using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using System.Drawing;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReact", policy =>
    {
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();
app.UseCors("AllowReact");

// ==========================================
// DRONE MOVEMENT SYSTEM
// ==========================================
MoveCommand currentCommand = new MoveCommand { direction = "none", speed = 0f };
object commandLock = new object();

app.MapPost("/drone/move", (MoveCommand cmd) =>
{
    lock (commandLock)
    {
        currentCommand = cmd;
        Console.WriteLine($"[DRONE] Command: {cmd.direction} @ {cmd.speed}");
    }
    return Results.Ok(new { success = true });
});

app.MapGet("/drone/command", () =>
{
    MoveCommand cmdToSend;
    lock (commandLock)
    {
        cmdToSend = currentCommand;
        currentCommand = new MoveCommand { direction = "none", speed = 0f };
    }
    return Results.Json(cmdToSend);
});

// ==========================================
// WHISPER TRANSCRIPTION
// ==========================================
app.MapPost("/whisper", async (IFormFile file) =>
{
    if (file == null || file.Length == 0) return Results.BadRequest("No audio file");
    using var client = new HttpClient();
    using var content = new MultipartFormDataContent();
    using var stream = file.OpenReadStream();
    var fileContent = new StreamContent(stream);
    content.Add(fileContent, "file", "audio.webm");
    var response = await client.PostAsync("http://localhost:8000/transcribe", content);
    var jsonResponse = await response.Content.ReadAsStringAsync();
    return Results.Content(jsonResponse, "application/json");
});

// ==========================================
// AI VISION SYSTEM
// ==========================================
string modelPath = "best.onnx";
byte[] latestFrame = Array.Empty<byte>();
object frameLock = new object();
// Ensure best.onnx exists or wrap in try-catch if needed
var session = new InferenceSession(modelPath); 
List<DetectionResult> lastAiResult = new List<DetectionResult>();

Console.WriteLine("✅ FOD Hunter MVP: Server Restarted & Ready!");

// 1. STREAM ENDPOINT (Used by React Video Feed)
app.MapGet("/stream", async (HttpContext context) =>
{
    var token = context.RequestAborted;
    context.Response.ContentType = "multipart/x-mixed-replace; boundary=frame";
    while (!token.IsCancellationRequested)
    {
        byte[] frameToSend;
        lock (frameLock) { frameToSend = latestFrame; }
        if (frameToSend != null && frameToSend.Length > 0)
        {
            try 
            {
                await context.Response.Body.WriteAsync(Encoding.UTF8.GetBytes("--frame\r\n"), token);
                await context.Response.Body.WriteAsync(Encoding.UTF8.GetBytes("Content-Type: image/jpeg\r\n"), token);
                await context.Response.Body.WriteAsync(Encoding.UTF8.GetBytes($"Content-Length: {frameToSend.Length}\r\n\r\n"), token);
                await context.Response.Body.WriteAsync(frameToSend.AsMemory(), token);
                await context.Response.Body.WriteAsync(Encoding.UTF8.GetBytes("\r\n"), token);
                await context.Response.Body.FlushAsync(token); 
            } 
            catch { break; } 
        }
        await Task.Delay(33, token); // ~30 FPS cap
    }
});

// 2. UNITY UPLOAD: STREAM FRAME (With Red Boxes)
app.MapPost("/upload_stream", async (HttpContext context) =>
{
    using var ms = new MemoryStream();
    await context.Request.Body.CopyToAsync(ms);
    byte[] imageBytes = ms.ToArray();
    if (imageBytes.Length > 0) lock (frameLock) { latestFrame = imageBytes; }
    return Results.Ok();
});

// 3. UNITY UPLOAD: INFERENCE FRAME (Clean / No Boxes)
app.MapPost("/upload_inference", async (HttpContext context) =>
{
    using var ms = new MemoryStream();
    await context.Request.Body.CopyToAsync(ms);
    byte[] imageBytes = ms.ToArray();
    if (imageBytes.Length == 0) return Results.BadRequest();

    // Run AI on this clean frame, but DON'T update the video feed
    var result = RunDetection(session, imageBytes);
    lastAiResult = ApplyNMS(result, 0.45f);
    return Results.Json(lastAiResult);
});

app.MapGet("/latest", () => Results.Json(lastAiResult));

// ==========================================
// LOGGING SYSTEM
// ==========================================
List<FodEntry> deckLog = new List<FodEntry>();
app.MapGet("/deck-logs", () => deckLog);
app.MapPost("/resolve/{id}", (string id) => {
    var entry = deckLog.FirstOrDefault(e => e.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
    if (entry != null) {
        entry.IsResolved = true;
        return Results.Ok();
    }
    return Results.NotFound();
});
app.MapPost("/commit", (FodEntry entry) => {
    entry.Timestamp = DateTime.Now.ToString("HH:mm:ss");
    deckLog.Add(entry);
    return Results.Ok();
});

app.Run("http://localhost:5000");

// --- HELPER METHODS ---
List<DetectionResult> RunDetection(InferenceSession session, byte[] imageBytes)
{
    var detections = new List<DetectionResult>();
    try {
        using var ms = new MemoryStream(imageBytes);
        using var bitmap = new Bitmap(ms); 
        using var resized = new Bitmap(bitmap, new Size(640, 640));
        var name = session.InputMetadata.Keys.First();
        var tensor = new DenseTensor<float>(new[] { 1, 3, 640, 640 });

        for (int y = 0; y < 640; y++) {
            for (int x = 0; x < 640; x++) {
                var p = resized.GetPixel(x, y);
                tensor[0, 0, y, x] = p.R / 255.0f;
                tensor[0, 1, y, x] = p.G / 255.0f;
                tensor[0, 2, y, x] = p.B / 255.0f;
            }
        }
        var inputs = new List<NamedOnnxValue> { NamedOnnxValue.CreateFromTensor(name, tensor) };
        using var results = session.Run(inputs);
        var output = results.First().AsTensor<float>();

        for (int i = 0; i < 8400; i++) {
            float conf = output[0, 4, i]; 
            if (conf > 0.80f) {
                detections.Add(new DetectionResult { 
                    x = output[0,0,i], y = output[0,1,i], 
                    w = output[0,2,i], h = output[0,3,i], conf = conf 
                });
            }
        }
    } catch (Exception ex) { Console.WriteLine("AI Error: " + ex.Message); }
    return detections;
}

List<DetectionResult> ApplyNMS(List<DetectionResult> detections, float iouThreshold)
{
    var result = new List<DetectionResult>();
    var sorted = detections.OrderByDescending(d => d.conf).ToList();
    while (sorted.Count > 0) {
        var main = sorted[0];
        result.Add(main);
        sorted.RemoveAt(0);
        sorted.RemoveAll(next => CalculateIoU(main, next) > iouThreshold);
    }
    return result;
}

float CalculateIoU(DetectionResult boxA, DetectionResult boxB)
{
    float x1 = Math.Max(boxA.x - boxA.w/2, boxB.x - boxB.w/2);
    float y1 = Math.Max(boxA.y - boxA.h/2, boxB.y - boxB.h/2);
    float x2 = Math.Min(boxA.x + boxA.w/2, boxB.x + boxB.w/2);
    float y2 = Math.Min(boxA.y + boxA.h/2, boxB.y + boxB.h/2);
    float intersection = Math.Max(0, x2 - x1) * Math.Max(0, y2 - y1);
    return intersection / (boxA.w * boxA.h + boxB.w * boxB.h - intersection);
}

// ==========================================
// MISSING CLASSES ADDED BELOW
// ==========================================

public class MoveCommand 
{ 
    public string direction { get; set; } = "none";
    public float speed { get; set; } = 0f;
}

public class DetectionResult 
{ 
    public float x {get; set;} 
    public float y {get; set;} 
    public float w {get; set;} 
    public float h {get; set;} 
    public float conf {get; set;} 
}

public class FodEntry 
{
    public string Id { get; set; }
    public string Desc { get; set; }
    public string Priority { get; set; }
    public string Timestamp { get; set; }
    public bool IsResolved { get; set; } = false;
    public float X { get; set; } 
    public float Y { get; set; }
}
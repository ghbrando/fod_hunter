using System;
using System.Collections.Generic;
using System.Linq;
using System.Drawing; // Requires System.Drawing.Common package
using System.Drawing.Imaging;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

// The data structure we need for the Visualizer
public class YoloItem 
{
    public string Label { get; set; }
    public float Confidence { get; set; }
    public float X { get; set; }      // Center X (Pixels)
    public float Y { get; set; }      // Center Y (Pixels)
    public float Width { get; set; }  // Width (Pixels)
    public float Height { get; set; } // Height (Pixels)
}

public class YoloProcessor : IDisposable
{
    private InferenceSession _session;
    private string[] _labels = new string[] { "FOD" }; 

    public YoloProcessor(string modelPath)
    {
        var options = new SessionOptions();
        try { 
            // Attempt to load CUDA (NVIDIA GPU)
            options.AppendExecutionProvider_CUDA(0); 
        } 
        catch (Exception) { 
            Console.WriteLine("[WARNING] GPU not found. Falling back to CPU.");
        } 
        _session = new InferenceSession(modelPath, options);
    }

    public List<YoloItem> Process(Bitmap image)
    {
        // 1. Resize to 640x640 (Model Input Size)
        // Note: For maximum FPS, you'd usually use LockBits here, 
        // but this is cleaner for the tutorial.
        Bitmap resized = null;
        if (image.Width != 640 || image.Height != 640)
            resized = new Bitmap(image, new Size(640, 640));
        else
            resized = image;

        // 2. Convert Image to Tensor
        var tensor = new DenseTensor<float>(new[] { 1, 3, 640, 640 });
        
        // Fast Unsafe Bitmap Processing
        unsafe
        {
            BitmapData data = resized.LockBits(new Rectangle(0, 0, 640, 640), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
            
            int bytesPerPixel = 3;
            byte* ptr = (byte*)data.Scan0;

            for (int y = 0; y < 640; y++)
            {
                byte* row = ptr + (y * data.Stride);
                for (int x = 0; x < 640; x++)
                {
                    // OpenCV/YOLO usually expects BGR or RGB depending on training.
                    // Ultralytics YOLOv8 expects RGB 0-1.
                    // Windows Bitmap is BGR in memory.
                    
                    tensor[0, 0, y, x] = row[x * bytesPerPixel + 2] / 255.0f; // R
                    tensor[0, 1, y, x] = row[x * bytesPerPixel + 1] / 255.0f; // G
                    tensor[0, 2, y, x] = row[x * bytesPerPixel + 0] / 255.0f; // B
                }
            }
            resized.UnlockBits(data);
        }

        // 3. Run Inference
        var inputs = new List<NamedOnnxValue> { NamedOnnxValue.CreateFromTensor("images", tensor) };
        using var results = _session.Run(inputs);
        
        // 4. Parse Output [1, 5, 8400]
        var output = results.First().AsTensor<float>();
        var items = new List<YoloItem>();
        
        int anchors = 8400; // YOLOv8 Standard
        
        for (int i = 0; i < anchors; i++)
        {
            float confidence = output[0, 4, i]; // Index 4 is confidence for Class 0
            if (confidence < 0.5f) continue; // Filter low confidence
            
            items.Add(new YoloItem 
            {
                Label = "FOD",
                Confidence = confidence,
                X = output[0, 0, i],
                Y = output[0, 1, i],
                Width = output[0, 2, i],
                Height = output[0, 3, i]
            });
        }
        
        // Return sorted by confidence (Highest first)
        // (Simple NMS can be added here, but this is enough to see boxes)
        return items.OrderByDescending(x => x.Confidence).Take(10).ToList(); 
    }

    public void Dispose()
    {
        _session?.Dispose();
    }
}
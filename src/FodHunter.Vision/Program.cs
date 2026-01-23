using System;
using System.IO;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Drawing;
using System.Text; // Added for Encoding

class Program
{
    static void Main(string[] args)
    {
        // Path Fix
        var currentPath = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.Process);
        var newPath = @"C:\Users\griss\anaconda3\Lib\site-packages\torch\lib;C:\Users\griss\anaconda3\Library\bin;" + currentPath;
        Environment.SetEnvironmentVariable("Path", newPath, EnvironmentVariableTarget.Process);

        Console.WriteLine("--- F.O.D. HUNTER: 4090 EDITION ---");

        string modelPath = "fod.onnx";
        if (!File.Exists(modelPath)) return;

        try
        {
            using var processor = new YoloProcessor(modelPath);
            
            // 1. LISTENER (Incoming Images from Unity)
            int listenPort = 5005;
            using var listener = new UdpClient(listenPort);
            IPEndPoint unityEndPoint = new IPEndPoint(IPAddress.Any, listenPort);

            // 2. SENDER (Outgoing Boxes back to Unity)
            int sendPort = 5006;
            using var sender = new UdpClient();
            IPEndPoint visualizerEndPoint = new IPEndPoint(IPAddress.Parse("127.0.0.1"), sendPort);

            Console.WriteLine("[System] 4090 LIVE. Relay Active (5005 -> 5006)...");

            var sw = new Stopwatch();
            
            while (true)
            {
                byte[] imageBytes = listener.Receive(ref unityEndPoint);

                using (var ms = new MemoryStream(imageBytes))
                using (var image = new Bitmap(ms))
                {
                    sw.Restart();
                    var results = processor.Process(image); 

                    // 3. SEND BOXES BACK TO UNITY
                    if (results.Count > 0)
                    {
                        // Format: "x1,y1,w1,h1|x2,y2,w2,h2"
                        string packet = "";
                        foreach(var item in results)
                        {
                            // Assuming your Processor returns [x,y,w,h] in pixels or normalized 
                            // We need NORMALIZED values (0.0 - 1.0) for Unity.
                            // If your processor returns Pixels, divide by 640.0f
                            
                            // CHECK YOUR YoloProcessor.cs:
                            // If it returns pixels (e.g. 320, 200), use this:
                            float nx = item.X / 640f; 
                            float ny = item.Y / 640f;
                            float nw = item.Width / 640f;
                            float nh = item.Height / 640f;

                            packet += $"{nx},{ny},{nw},{nh}|";
                        }

                        byte[] data = Encoding.UTF8.GetBytes(packet);
                        sender.Send(data, data.Length, visualizerEndPoint);

                        Console.Write($"\r[ALERT] {results.Count} Targets | Speed: {sw.ElapsedMilliseconds}ms   ");
                    }
                    else
                    {
                        Console.Write($"\r[Scanning] ... ({sw.ElapsedMilliseconds}ms)      ");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"\n[ERROR]: {ex.Message}");
        }
    }
}
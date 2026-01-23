using UnityEngine;
using System.Net.Sockets;
using System.Net;
using System.Text;
using System.Collections.Generic;

public class FodVisualizer : MonoBehaviour
{
    private UdpClient udp;
    private int port = 5006; // Listen on this port
    private List<Rect> detectedBoxes = new List<Rect>();
    private object lockObj = new object();

    void Start()
    {
        udp = new UdpClient(port);
        udp.BeginReceive(new System.AsyncCallback(ReceiveCallback), null);
    }

    private void ReceiveCallback(System.IAsyncResult ar)
    {
        IPEndPoint ip = new IPEndPoint(IPAddress.Any, port);
        byte[] bytes = udp.EndReceive(ar, ref ip);
        string message = Encoding.UTF8.GetString(bytes);

        // Parse Data: "x,y,w,h|x,y,w,h"
        List<Rect> newBoxes = new List<Rect>();
        string[] objects = message.Split('|');

        foreach (string obj in objects)
        {
            if (string.IsNullOrEmpty(obj)) continue;
            string[] coords = obj.Split(',');
            if (coords.Length < 4) continue;

            float x = float.Parse(coords[0]);
            float y = float.Parse(coords[1]);
            float w = float.Parse(coords[2]);
            float h = float.Parse(coords[3]);

            // Convert to Screen Coordinates
            // YOLO (0,0) is Top-Left. Unity GUI (0,0) is Top-Left.
            // But we need to scale by Screen Width/Height

            // Note: x/y are usually Center in YOLO, but if your processor converts to Top-Left, use as is.
            // Assuming Top-Left for now:
            newBoxes.Add(new Rect(x * Screen.width, y * Screen.height, w * Screen.width, h * Screen.height));
        }

        lock (lockObj)
        {
            detectedBoxes = newBoxes;
        }

        // Listen again
        udp.BeginReceive(new System.AsyncCallback(ReceiveCallback), null);
    }

    void OnGUI()
    {
        GUI.color = Color.red;
        lock (lockObj)
        {
            foreach (Rect box in detectedBoxes)
            {
                GUI.Box(box, "FOD"); // Draws a box with text
            }
        }
    }

    void OnApplicationQuit()
    {
        if (udp != null) udp.Close();
    }
}
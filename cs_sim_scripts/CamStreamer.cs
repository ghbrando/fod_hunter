using UnityEngine;
using System.Net.Sockets;
using System.Net;

public class CamStreamer : MonoBehaviour
{
    public Camera droneCam;
    public string ipAddress = "127.0.0.1";
    public int port = 5005;

    private UdpClient udp;
    private IPEndPoint remoteEndPoint;
    private Texture2D texture;
    private RenderTexture renderTexture;

    void Start()
    {
        udp = new UdpClient();
        remoteEndPoint = new IPEndPoint(IPAddress.Parse(ipAddress), port);

        // Create the 640x640 "Eye" for the AI
        renderTexture = new RenderTexture(640, 640, 24);
        texture = new Texture2D(640, 640, TextureFormat.RGB24, false);

        // IMPORTANT: We do NOT assign droneCam.targetTexture here anymore.
        // That was causing the black screen.
    }

    void Update()
    {
        if (droneCam == null) return;

        // --- STEP 1: CAPTURE FOR AI ---
        // Temporarily point camera at our texture
        droneCam.targetTexture = renderTexture;
        droneCam.Render(); // Force a manual photo

        // Read the pixels
        RenderTexture.active = renderTexture;
        texture.ReadPixels(new Rect(0, 0, 640, 640), 0, 0);
        texture.Apply();

        // --- STEP 2: RESTORE FOR PILOT ---
        // Point camera back at the screen so YOU can see
        droneCam.targetTexture = null;
        RenderTexture.active = null;

        // --- STEP 3: SEND TO 4090 ---
        byte[] bytes = texture.EncodeToJPG(50);
        try
        {
            udp.Send(bytes, bytes.Length, remoteEndPoint);
        }
        catch (System.Exception e) { }
    }

    void OnApplicationQuit()
    {
        if (udp != null) udp.Close();
    }
}
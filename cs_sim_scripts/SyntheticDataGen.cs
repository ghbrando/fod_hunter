using UnityEngine;
using System.IO;
using System.Linq;

public class SyntheticDataGen : MonoBehaviour
{
    public Camera droneCam;
    public int maxPhotos = 600;
    public float captureInterval = 0.3f; // Takes a photo every 0.3 seconds

    private int photoCount = 0;
    private float timer = 0;
    private string savePath;

    void Start()
    {
        // Creates a folder on your Desktop called "FOD_Training_Data"
        savePath = System.Environment.GetFolderPath(System.Environment.SpecialFolder.Desktop) + "/FOD_Training_Data";

        Directory.CreateDirectory(savePath);
        Directory.CreateDirectory(savePath + "/images");
        Directory.CreateDirectory(savePath + "/labels");

        Debug.Log($"[DataGen] INITIALIZED. Saving to: {savePath}");
    }

    void Update()
    {
        if (photoCount >= maxPhotos) return;

        timer += Time.deltaTime;
        if (timer >= captureInterval)
        {
            CaptureFrame();
            timer = 0;
        }
    }

    void CaptureFrame()
    {
        // 1. Find ALL objects tagged "FOD"
        GameObject[] allFod = GameObject.FindGameObjectsWithTag("FOD");

        if (allFod.Length == 0) return;

        string labelData = "";
        bool foundAny = false;

        // 2. Check each object to see if it's in the camera frame
        foreach (GameObject obj in allFod)
        {
            Vector3 screenPos = droneCam.WorldToViewportPoint(obj.transform.position);

            // Is it visible? (0-1 range and in front of camera)
            if (screenPos.x > 0.05f && screenPos.x < 0.95f &&
                screenPos.y > 0.05f && screenPos.y < 0.95f &&
                screenPos.z > 0)
            {
                // Calculate Dynamic Box Size based on distance
                float dist = Vector3.Distance(droneCam.transform.position, obj.transform.position);

                // Adjust this if boxes are too small/big
                float boxSize = Mathf.Clamp(1.0f / dist, 0.02f, 0.5f);

                // YOLO Format: <class> <x> <y> <w> <h>
                // We use Class "0" for ALL FOD items
                labelData += $"0 {screenPos.x} {1 - screenPos.y} {boxSize} {boxSize}\n";
                foundAny = true;
            }
        }

        // 3. Only save if we actually saw something
        if (foundAny)
        {
            string filename = $"fod_{System.DateTime.Now:MMdd_HHmmss_fff}";

            // Save the Image
            ScreenCapture.CaptureScreenshot($"{savePath}/images/{filename}.jpg");

            // Save the Label
            File.WriteAllText($"{savePath}/labels/{filename}.txt", labelData);

            photoCount++;
            if (photoCount % 50 == 0)
                Debug.Log($"[DataGen] Captured {photoCount}/{maxPhotos} Multi-FOD Images.");
        }
    }
}
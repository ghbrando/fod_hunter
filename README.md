# FOD Hunter

A drone-based foreign object detection system using YOLOv8 and .NET framework for real-time object detection on naval aircraft carriers.

## Setup

### Prerequisites
- Unity project: `fod_hunter_sim`
- .NET framework
- Python environment with YOLOv8

### Getting Started

1. **Open the Unity Project**
   - Open `fod_hunter_sim` in Unity
   - Navigate to and start the Navy Pack Demo Scene

2. **Start the .NET Server**
   - Navigate to `src\FodHunter.Vision`
   - Run the following command:
     ```bash
     dotnet run
     ```

3. **Run the Simulation**
   - Press the play button in Unity to start the simulation
   - You'll be in the perspective of a drone operator flying over a naval aircraft carrier runway

## Overview

The objective is to detect foreign objects (screwdrivers, screws, bolts, etc.) on the runway to ensure clear or obstruction-free landings.

## Architecture

- **Detection Engine**: The .NET framework server handles YOLOv8 object detection
- **Visualization**: Detection results (bounding boxes) are sent to Unity for display
- **Model Format**: The YOLOv8 model is converted from `.pt` (PyTorch) to `.onnx` format to run on the .NET infrastructure

## Model Training

### Process
1. Train the YOLOv8 model using Python (`train_fod.py`)
2. Python outputs a `.pt` file that is converted to `.onnx` format
3. The `.onnx` file is compatible with the C# .NET framework

### Training Data
- Data is acquired through the virtual simulation in Unity
- The simulation captures images of foreign objects by flying the drone around the carrier runway
- These images are used to train the model

## Project Structure

- `src/FodHunter.Vision/` - .NET server application
- `cs_sim_scripts/` - C# simulation scripts
- `fod_training/` - Training results and model weights
- `datasets/` - Training dataset
- `FOD_Training_Data/` - Raw training data and labels
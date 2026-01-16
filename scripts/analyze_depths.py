
import pandas as pd
import matplotlib.pyplot as plt
import os

def analyze_depths():
    # Resolve path relative to this script file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(script_dir, "..", "depths_debug.csv")
    csv_path = os.path.normpath(csv_path)
    
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found. Run the C# Precomputer first.")
        return

    print("Loading depths data...")
    df = pd.read_csv(csv_path)
    
    depths = df["WaterDepthMeters"]
    total = len(depths)
    
    print(f"Total Water Voxels: {total}")
    print(f"Min Depth: {depths.min():.4f} m")
    print(f"Max Depth: {depths.max():.4f} m")
    print(f"Mean Depth: {depths.mean():.4f} m")
    print(f"Median Depth: {depths.median():.4f} m")

    # Check for the 0.01 issue (High-32 bit = 1 -> 0.01m)
    count_001 = len(depths[depths < 0.02])
    print(f"Count < 0.02m: {count_001} ({count_001/total*100:.2f}%)")

    # Histogram
    plt.figure(figsize=(12, 6))
    # Bins: 0 to Max, step 0.1? Or generic
    plt.hist(depths, bins=100, color='skyblue', edgecolor='black', alpha=0.7)
    plt.title("Water Depth Distribution")
    plt.xlabel("Depth (m)")
    plt.ylabel("Frequency")
    plt.grid(True, alpha=0.3)
    
    output_img = "depth_distribution.png"
    plt.savefig(output_img)
    print(f"Histogram saved to {os.path.abspath(output_img)}")
    
    # Detailed Binning (First 2 meters)
    print("\nDetailed Low-Depth Breakdown:")
    bins = [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 100.0]
    counts = pd.cut(depths, bins=bins).value_counts().sort_index()
    print(counts)

if __name__ == "__main__":
    analyze_depths()

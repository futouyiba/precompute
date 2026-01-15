#nullable disable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.IO;

namespace FishWeightPrecomputer
{
    public class AggregatedCondition
    {
        [JsonPropertyName("depth")]
        public double Depth { get; set; }

        [JsonPropertyName("structureMask")]
        public int StructureMask { get; set; }

        [JsonPropertyName("layers")]
        public List<int> Layers { get; set; }

        // Helper for dictionary key
        public string GetKey()
        {
            // Depth rounded to 2 decimals for key stability
            return $"{Depth:F2}_{StructureMask}_{string.Join(",", Layers.OrderBy(x => x))}";
        }
    }

    public class AggregatedResult
    {
        [JsonPropertyName("conditions")]
        public AggregatedCondition Conditions { get; set; }

        [JsonPropertyName("weights")]
        public float[] Weights { get; set; }

        [JsonPropertyName("voxelCount")]
        public int VoxelCount { get; set; }

        [JsonPropertyName("maxVariance")]
        public float MaxVariance { get; set; }
    }

    public class WeightAggregator
    {
        private Calculator _calculator;
        private List<int> _speciesList;
        private List<StockRelease> _activeReleases;
        private Dictionary<string, FishRelease> _fishReleases;

        public WeightAggregator(
            Calculator calculator,
            List<int> speciesList,
            List<StockRelease> activeReleases,
            Dictionary<string, FishRelease> fishReleases)
        {
            _calculator = calculator;
            _speciesList = speciesList;
            _activeReleases = activeReleases;
            _fishReleases = fishReleases;
        }

        public void RunAggregation(
            int[] voxelData,
            int dimX, int dimY, int dimZ,
            float[] origin, float[] step,
            double waterMinZ, double waterMaxZ,
            int weatherId, string periodKey,
            double weatherWaterTemp, double bottomTemp,
            string outputPath
        )
        {
            Console.WriteLine("Starting Aggregation Analysis...");
            var groupedResults = new Dictionary<string, AggregatedResult>();
            long totalVoxels = (long)dimX * dimY * dimZ;
            int processedCount = 0;
            int inconsistencyCount = 0;

            // Cache water depth
            double totalWaterDepth = waterMaxZ - waterMinZ;

            for (int i = 0; i < voxelData.Length; i++)
            {
                int bitmask = voxelData[i];
                if ((bitmask & 1) == 0) continue; // Skip non-water

                // Coordinates
                int temp = i;
                int z = temp % dimZ;
                temp /= dimZ;
                int y = temp % dimY;
                int x = temp / dimY;

                double voxelWorldY = origin[1] + y * step[1];
                double baitDepth = waterMaxZ - voxelWorldY;

                // 1. Determine Conditions
                var layers = _calculator.GetLayerTypes(baitDepth, totalWaterDepth).ToList();
                layers.Sort();

                var condition = new AggregatedCondition
                {
                    Depth = Math.Round(baitDepth, 2),
                    StructureMask = bitmask,
                    Layers = layers
                };

                string key = condition.GetKey();

                // Calculate weights for current voxel
                float[] currentWeights = new float[_speciesList.Count];
                for (int s = 0; s < _speciesList.Count; s++)
                {
                    int fishEnvId = _speciesList[s];
                    var release = _activeReleases.FirstOrDefault(r => r.FishEnvId == fishEnvId);
                    if (release == null || !_fishReleases.TryGetValue(release.ReleaseId.ToString(), out var fishRelease))
                    {
                        currentWeights[s] = 0;
                        continue;
                    }

                    double w = _calculator.CalculateWeight(
                        fishEnvId, x, y, z,
                        baitDepth, totalWaterDepth, bitmask,
                        weatherId, periodKey,
                        fishRelease.ProbWeightIdeal, fishRelease.MinEnvCoeff,
                        weatherWaterTemp, bottomTemp, waterMinZ, waterMaxZ
                    );
                    currentWeights[s] = (float)w;
                }

                // 2. Aggregate
                if (!groupedResults.TryGetValue(key, out var result))
                {
                    result = new AggregatedResult
                    {
                        Conditions = condition,
                        Weights = currentWeights,
                        VoxelCount = 1,
                        MaxVariance = 0
                    };
                    groupedResults[key] = result;
                }
                else
                {
                    result.VoxelCount++;
                    // Check Consistency
                    for (int k = 0; k < currentWeights.Length; k++)
                    {
                        float diff = Math.Abs(currentWeights[k] - result.Weights[k]);
                        if (diff > 0.0001f) // Tolerance
                        {
                            if (diff > result.MaxVariance) result.MaxVariance = diff;
                            // Only log first few inconsistencies
                            // if (inconsistencyCount < 5) Console.WriteLine($"Variance detected Key={key} Idx={k} Diff={diff}");
                            // inconsistencyCount++;
                        }
                    }
                }

                processedCount++;
                if (processedCount % 100000 == 0)
                {
                    Console.Write($"\rAggregating... {processedCount} voxels processed. Unique Groups: {groupedResults.Values.Count}");
                }
            }

            Console.WriteLine($"\nAggregation Complete. Total Unique Groups: {groupedResults.Count}");


            // 3. Serialize
            var options = new JsonSerializerOptions { WriteIndented = true };
            string json = JsonSerializer.Serialize(groupedResults.Values, options);
            File.WriteAllText(outputPath, json);
            Console.WriteLine($"Aggregated results saved to {outputPath}");
        }
    }
}

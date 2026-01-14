using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace FishWeightPrecomputer
{
    class Program
    {
        static void Main(string[] args)
        {
            try
            {
                Console.WriteLine("Starting Fish Weight Precomputer...");
                
                // 1. Setup Paths
                // Hardcode logic for demo as requested or infer.
                string rootPath = @"d:\fishinggame\precompute";
                string userDataPath = Path.Combine(rootPath, @"data\1\1001");
                string mapDataPath = Path.Combine(rootPath, @"data"); // Fallback
                
                // Verify Data Loader
                var dataLoader = new DataLoader(userDataPath, mapDataPath);

                // 2. Load Configs
                Console.WriteLine("Loading configurations...");
                var affinityConst = dataLoader.LoadJson<EnvAffinityConst>("env_affinity_const.json");
                // Struct: Dictionary<id, StructAffinityProfile>
                var structAffinitiesRaw = dataLoader.LoadJson<Dictionary<string, StructAffinityProfile>>("struct_affinity.json");
                var structAffinities = structAffinitiesRaw.Values.ToDictionary(v => v.Id);

                var tempAffinitiesRaw = dataLoader.LoadJson<Dictionary<string, TempAffinity>>("temp_affinity.json");
                var tempAffinities = tempAffinitiesRaw.Values.ToList();

                var layerAffinitiesRaw = dataLoader.LoadJson<Dictionary<string, WaterLayerProfile>>("water_layer_affinity.json");
                var layerAffinities = layerAffinitiesRaw.Values.ToList();

                var weatherFactorsRaw = dataLoader.LoadJson<Dictionary<string, WeatherFactor>>("weather_factor.json");
                var weatherFactors = weatherFactorsRaw.Values.ToList();

                var periodAffinitiesRaw = dataLoader.LoadJson<Dictionary<string, PeriodAffinity>>("period_affinity.json");
                var periodAffinities = periodAffinitiesRaw.Values.ToList();

                var fishEnvAffinitiesRaw = dataLoader.LoadJson<Dictionary<string, FishEnvAffinity>>("fish_env_affinity.json");
                var fishEnvAffinities = fishEnvAffinitiesRaw.Values.ToList();
                
                var fishStocksRaw = dataLoader.LoadJson<Dictionary<string, FishStock>>("fish_stock.json");
                var fishPondsRaw = dataLoader.LoadJson<Dictionary<string, FishPond>>("fish_pond_list.json");
                var mapBasic = dataLoader.LoadJson<Dictionary<string, MapBasicConfig>>("map_basic.json").Values.FirstOrDefault();
                
                // Release Data
                var fishReleasesRaw = dataLoader.LoadJson<Dictionary<string, FishRelease>>("fish_release.json");
                var stockReleasesRaw = dataLoader.LoadJson<Dictionary<string, StockRelease>>("stock_release.json");

                // 3. Initialize Calculator
                var calculator = new Calculator(
                    affinityConst,
                    structAffinities,
                    tempAffinities,
                    layerAffinities,
                    weatherFactors,
                    periodAffinities,
                    fishEnvAffinities
                );

                // 4. Identify Active Species for this Map
                // Assuming MapId 1001? (From path).
                int mapId = 1001; // Or derived from map_basic
                if (mapBasic != null) mapId = mapBasic.Id;
                
                Console.WriteLine($"Map ID: {mapId}");
                
                var activePonds = fishPondsRaw.Values.Where(p => p.MapId == mapId).ToList();
                var activeSpecies = new HashSet<int>(); // Set of FishEnvIds
                
                // Map: FishEnvId -> (ProbWeight, MinEnvCoeff) - Simplifying: taking avg or first?
                // Actually weight calc uses Release Data.
                // We'll store ReleaseInfo per FishEnvId.
                var activeReleases = new List<StockRelease>();

                foreach (var pond in activePonds)
                {
                    var stockReleases = stockReleasesRaw.Values.Where(r => r.StockId == pond.FishStockId);
                    foreach(var sr in stockReleases)
                    {
                        activeReleases.Add(sr);
                        activeSpecies.Add(sr.FishEnvId);
                        Console.WriteLine($"Found active FishEnvId: {sr.FishEnvId} in Stock {sr.StockId}");
                    }
                }
                
                Console.WriteLine($"Total active FishEnvIds: {activeSpecies.Count}");

                // 5. Load Map Data (NPY)
                string npyPath = Path.Combine(rootPath, @"Fishing_1006001_Dense_20260107_154037\Fishing_1006001_Global.npy");
                if (!File.Exists(npyPath))
                {
                    Console.WriteLine($"NPY file not found at: {npyPath}");
                    return;
                }
                
                Console.WriteLine($"Loading NPY Data: {npyPath}");
                int[] dimensions;
                int[] voxelData = NpyReader.ReadInt32(npyPath, out dimensions);
                
                int dimX = dimensions[0];
                int dimY = dimensions[1];
                int dimZ = dimensions[2];
                Console.WriteLine($"Map Dimensions: {dimX}x{dimY}x{dimZ}");

                // 6. Iterate and Calculate
                // Test Parameters
                int weatherId = 1001; // Example Default
                string periodKey = "period9_12"; 
                double weatherWaterTemp = 20.0;
                double bottomTemp = 10.0;
                
                // Constants from MapBasic
                double waterMinZ = mapBasic?.WaterMinZ ?? -20.0;
                double waterMaxZ = mapBasic?.WaterMaxZ ?? 0.0;
                
                // Origin/Step? NPY doesn't give them. 
                // We assume Voxel Z to Depth conversion: 
                // Depth = WaterMaxZ - (OriginZ + VoxelZ * StepZ)
                // Need MapDataConfig for Origin/Step.
                // Hardcoding defaults as per checking `map_data.json` failed.
                // Standard: Origin=[0,0,0]? Or [-500, -20, -500]?
                // VoxelMapDataFormat example: Origin=[-500, -20, -500], Step=[1, 0.5, 1].
                float[] origin = new float[] { -500f, -20f, -500f };
                float[] step = new float[] { 1f, 0.5f, 1f }; 

                long totalVoxels = (long)dimX * dimY * dimZ;
                Console.WriteLine($"Processing {totalVoxels} voxels for {activeSpecies.Count} species...");

                // Basic Loop (Demo limited to first N valid voxels to avoid console flooding)
                int validVoxelsCount = 0;
                int calcLimit = 100;

                for (int i = 0; i < voxelData.Length; i++)
                {
                    int bitmask = voxelData[i];
                    if ((bitmask & 1) == 0) continue; // Not Water

                    // Calculate Coordinates
                    // Flat Index = x * dimY * dimZ + y * dimZ + z  (NumPy standard is usually C-order: z, y, x? or x, y, z?)
                    // NumPy default is row-major (C-style): dim0, dim1, dim2.
                    // Shape is [X, Y, Z]? No, [X, Y, Z] in C# output usually implies dim0=X.
                    // Index = x * (Y*Z) + y * (Z) + z.
                    
                    int temp = i;
                    int z = temp % dimZ;
                    temp /= dimZ;
                    int y = temp % dimY;
                    int x = temp / dimY;
                    
                    // Coordinates
                    double voxelWorldY = origin[1] + y * step[1]; // Elevation
                    // Depth: Surface (WaterMaxZ) - voxelWorldY.
                    double baitDepth = waterMaxZ - voxelWorldY;
                    double waterDepth = waterMaxZ - waterMinZ; // Local Column Depth (Approximation)

                    if (validVoxelsCount < calcLimit)
                    {
                        Console.WriteLine($"Voxel [{x},{y},{z}] Bitmask: {bitmask} Depth: {baitDepth:F2}");
                        foreach (var release in activeReleases)
                        {
                            if (!fishReleasesRaw.TryGetValue(release.ReleaseId.ToString(), out var fishRelease)) continue;

                            double weight;
                            if (validVoxelsCount < 3) 
                            {
                                weight = calculator.CalculateWeightDebug(
                                    release.FishEnvId,
                                    x, y, z,
                                    baitDepth, waterDepth, bitmask,
                                    weatherId, periodKey,
                                    1.0, 
                                    fishRelease.MinEnvCoeff,
                                    weatherWaterTemp, bottomTemp, waterMinZ, waterMaxZ
                                );
                            }
                            else
                            {
                                weight = calculator.CalculateWeight(
                                    release.FishEnvId,
                                    x, y, z,
                                    baitDepth, waterDepth, bitmask,
                                    weatherId, periodKey,
                                    1.0, 
                                    fishRelease.MinEnvCoeff,
                                    weatherWaterTemp, bottomTemp, waterMinZ, waterMaxZ
                                );
                            }
                            
                            Console.WriteLine($"  - Species {release.FishEnvId}: Weight Factor = {weight:F4}");
                        }
                        validVoxelsCount++;
                    }
                }

                Console.WriteLine("Pre-calculation Demo Completed.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
                Console.WriteLine(ex.StackTrace);
            }
        }
    }
}

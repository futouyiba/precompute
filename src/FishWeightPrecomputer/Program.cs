#nullable disable
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
                Console.WriteLine("Starting Fish Weight Precomputer (Dynamic Map ID)...");
                
                // 1. Setup Paths
                // Use current directory to find the root "precompute" folder
                // Executing from src/FishWeightPrecomputer/bin/Debug/net9.0/ or similar, so need to go up multiple levels
                // OR assuming run from src/FishWeightPrecomputer via "dotnet run"
                // Let's try to find the "data" directory by going up.
                string rootPath = AppContext.BaseDirectory;
                while (!Directory.Exists(Path.Combine(rootPath, "data")) && Directory.GetParent(rootPath) != null)
                {
                    rootPath = Directory.GetParent(rootPath).FullName;
                }
                
                if (!Directory.Exists(Path.Combine(rootPath, "data")))
                {
                    // Fallback to specific path if auto-detection fails (for debug)
                    rootPath = @"e:\precompute\precompute";
                }

                Console.WriteLine($"Root Path resolved to: {rootPath}");

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

                // 4. Determine Map ID dynamically
                // Logic: map_data.json -> global.dataFile -> sceneId -> map_scene.json -> mapId

                // Load map_data.json first
                string mapDataJsonPath = Path.Combine(rootPath, @"Fishing_1006001_Dense_20260107_154037\map_data.json");
                if (!File.Exists(mapDataJsonPath))
                {
                    Console.WriteLine($"Error: map_data.json not found at {mapDataJsonPath}");
                    return;
                }

                string mapDataJson = File.ReadAllText(mapDataJsonPath);
                var mapDataConfig = System.Text.Json.JsonSerializer.Deserialize<MapDataConfig>(mapDataJson);
                var origin = mapDataConfig.Global.Origin;
                var step = mapDataConfig.Global.Step;
                Console.WriteLine($"Loaded map_data.json: Origin=[{origin[0]}, {origin[1]}, {origin[2]}]");

                // Extract SceneID from Global DataFile (e.g. "Fishing_1006001_Global.npy" -> "1006001")
                string globalNpyFile = mapDataConfig.Global.DataFile; // "Fishing_1006001_Global.npy"
                string sceneIdStr = globalNpyFile.Split('_')[1]; // Assumes format Fishing_{ID}_...
                Console.WriteLine($"Extracted SceneID (AssetId): {sceneIdStr}");

                // Load map_scene.json and resolve MapID
                var mapScenesRaw = dataLoader.LoadJson<Dictionary<string, MapSceneInfo>>("map_scene.json");
                var mapSceneInfo = mapScenesRaw.Values.FirstOrDefault(m => m.AssetId == sceneIdStr);
                
                if (mapSceneInfo == null)
                {
                    Console.WriteLine($"Error: Could not find Map Scene info for AssetId {sceneIdStr}");
                    return;
                }

                int mapId = mapSceneInfo.Id;
                Console.WriteLine($"Resolved Map ID: {mapId} (from SceneID {sceneIdStr})");

                // Filter Active Species
                var activePonds = fishPondsRaw.Values.Where(p => p.MapId == mapId).ToList();
                var activeSpecies = new HashSet<int>(); 
                
                var activeReleases = new List<StockRelease>();

                foreach (var pond in activePonds)
                {
                    var stockReleases = stockReleasesRaw.Values.Where(r => r.StockId == pond.FishStockId);
                    foreach(var sr in stockReleases)
                    {
                        activeReleases.Add(sr);
                        activeSpecies.Add(sr.FishEnvId);
                        // Console.WriteLine($"Found active FishEnvId: {sr.FishEnvId} in Stock {sr.StockId}");
                    }
                }
                
                Console.WriteLine($"Total active FishEnvIds: {activeSpecies.Count}");

                // Origin/Step already loaded
                string? mapDir = Path.GetDirectoryName(mapDataJsonPath);
                if (mapDir == null) return;
                string npyPath = Path.Combine(mapDir, mapDataConfig.Global.DataFile);

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

                long totalVoxels = (long)dimX * dimY * dimZ;
                // Sort species by name from fishEnvAffinities for deterministic ordering
                var speciesList = activeSpecies
                    .OrderBy(id => fishEnvAffinities.FirstOrDefault(f => f.Id == id)?.Name ?? id.ToString())
                    .ToList();
                int numSpecies = speciesList.Count;
                Console.WriteLine($"Processing {totalVoxels} voxels for {numSpecies} species...");
                
                // Result Array: [x, y, z, species] flattened
                // Index = (x * dimY * dimZ + y * dimZ + z) * numSpecies + speciesIndex
                // Wait, typically [x,y,z,f] means f is the last dimension.
                // However, creating a huge array might be memory intensive if dimensions are large.
                // 134*8*134 * 60 * 4 bytes ~= 34 MB. Safe.
                
                // Using a flat array for binary writing
                long totalElements = totalVoxels * numSpecies;
                float[] resultData = new float[totalElements];

                int processedCount = 0;
                long lastReportTime = DateTime.Now.Ticks;

                for (int i = 0; i < voxelData.Length; i++)
                {
                    int bitmask = voxelData[i];
                    
                    // Coordinates logic
                    int temp = i;
                    int z = temp % dimZ;
                    temp /= dimZ;
                    int y = temp % dimY;
                    int x = temp / dimY;
                    
                    if ((bitmask & 1) == 0) 
                    {
                        // Explicitly set 0 for non-water (array is init to 0 anyway, but for clarity)
                        continue; 
                    }

                    // Coordinates
                    double voxelWorldY = origin[1] + y * step[1]; // Elevation
                    double baitDepth = waterMaxZ - voxelWorldY;
                    double waterDepth = waterMaxZ - waterMinZ; 

                    for (int s = 0; s < numSpecies; s++)
                    {
                        int fishEnvId = speciesList[s];
                        // Find release info for this species
                        // Assuming taking the first release config found for simplicity or need specific logic
                        // In reality, might need to sum up if multiple releases? 
                        // For now using the first matching release in activeReleases
                        var release = activeReleases.FirstOrDefault(r => r.FishEnvId == fishEnvId);
                        if (release == null) continue;

                        if (!fishReleasesRaw.TryGetValue(release.ReleaseId.ToString(), out var fishRelease)) continue;

                        double weight = calculator.CalculateWeight(
                            fishEnvId,
                            x, y, z,
                            baitDepth, waterDepth, bitmask,
                            weatherId, periodKey,
                            fishRelease.ProbWeightIdeal, 
                            fishRelease.MinEnvCoeff,
                            weatherWaterTemp, bottomTemp, waterMinZ, waterMaxZ
                        );

                        // Calculate index
                        long flatIndex = ((long)x * dimY * dimZ + y * dimZ + z) * numSpecies + s;
                        resultData[flatIndex] = (float)weight;
                    }
                    
                    processedCount++;
                    if (processedCount % 10000 == 0)
                    {
                         Console.Write($"\rProcessed {processedCount}/{totalVoxels} voxels...");
                    }
                }
                Console.WriteLine($"\nCalculation Completed.");

                // 7. Save to Binary File
                string outputPath = Path.Combine(rootPath, "weights.bin");
                Console.WriteLine($"Saving results to {outputPath}...");
                
                using (var stream = File.Open(outputPath, FileMode.Create))
                using (var writer = new BinaryWriter(stream))
                {
                    // Header
                    writer.Write(0x46495348); // Magic "FISH"
                    writer.Write(1); // Version
                    writer.Write(dimX);
                    writer.Write(dimY);
                    writer.Write(dimZ);
                    writer.Write(numSpecies);
                    
                    // Species IDs mapping
                    foreach(var sid in speciesList) writer.Write(sid);
                    
                    // Body
                    foreach(var val in resultData) writer.Write(val);
                }
                
                // Output species mapping JSON for visualization
                var speciesMapping = speciesList.Select((id, index) => new {
                    index = index,
                    fishEnvId = id,
                    name = fishEnvAffinities.FirstOrDefault(f => f.Id == id)?.Name ?? $"Unknown_{id}"
                }).ToList();
                
                string mappingJson = System.Text.Json.JsonSerializer.Serialize(speciesMapping, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
                string mappingPath = Path.Combine(rootPath, "species_mapping.json");
                File.WriteAllText(mappingPath, mappingJson);
                Console.WriteLine($"Species mapping saved to: {mappingPath}");
                
                Console.WriteLine("Done.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
                Console.WriteLine(ex.StackTrace);
            }
        }
    }
}

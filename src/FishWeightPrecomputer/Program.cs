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
                var mapBasicConfigs = dataLoader.LoadJson<Dictionary<string, MapBasicConfig>>("map_basic.json");

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

                int mapId = mapSceneInfo.Desc;
                Console.WriteLine($"Resolved Game Map ID: {mapId} (from SceneID {sceneIdStr}, EntryID {mapSceneInfo.Id})");

                if (!mapBasicConfigs.TryGetValue(mapId.ToString(), out var mapBasic))
                {
                    Console.WriteLine($"WARNING: Map config for ID {mapId} not found. Using default.");
                    mapBasic = mapBasicConfigs.Values.FirstOrDefault();
                }
                Console.WriteLine($"Map Config: {mapBasic?.Name} (Water: {mapBasic?.WaterMinZ:F1} to {mapBasic?.WaterMaxZ:F1})");

                // Debug: Inspect Fish Pond Data
                Console.WriteLine("DEBUG CHECK: Inspecting Fish Ponds Data...");
                int pondCount = 0;
                foreach (var kvp in fishPondsRaw)
                {
                    if (pondCount < 5)
                    {
                        Console.WriteLine($"  Key: {kvp.Key}, Id: {kvp.Value.Id}, MapId: {kvp.Value.MapId}, Name: {kvp.Value.Name}");
                    }
                    pondCount++;
                }
                Console.WriteLine($"  Total Fish Ponds: {pondCount}");

                // Filter Active Species
                var activePonds = fishPondsRaw.Values.Where(p => p.MapId == mapId).ToList();
                Console.WriteLine($"DEBUG CHECK: Found {activePonds.Count} active ponds using MapId == {mapId}");
                var activeSpecies = new HashSet<int>();

                var activeReleases = new List<StockRelease>();

                foreach (var pond in activePonds)
                {
                    var stockReleases = stockReleasesRaw.Values.Where(r => r.StockId == pond.FishStockId);
                    foreach (var sr in stockReleases)
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
                long[] voxelData = NpyReader.ReadInt64(npyPath, out dimensions);

                int dimX = dimensions[0];
                int dimY = dimensions[1];
                int dimZ = dimensions[2];
                Console.WriteLine($"Map Dimensions: {dimX}x{dimY}x{dimZ}");

                // 6. Iterate and Calculate
                // --- APP CONFIG ---
                string appConfigPath = Path.Combine(rootPath, "src/FishWeightPrecomputer/app_config.json");
                if (!File.Exists(appConfigPath)) appConfigPath = "app_config.json";

                int debugLimit = 2;
                List<string> weatherSequence = new List<string>();

                if (File.Exists(appConfigPath))
                {
                    try
                    {
                        var jsonNode = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(appConfigPath));
                        if (jsonNode != null)
                        {
                            if (jsonNode["DebugLimit"] != null)
                            {
                                debugLimit = jsonNode["DebugLimit"].GetValue<int>();
                                Console.WriteLine($"Loaded DebugLimit from config: {debugLimit}");
                            }
                            if (jsonNode["WeatherSequence"] != null)
                            {
                                var seqArray = jsonNode["WeatherSequence"].AsArray();
                                foreach (var item in seqArray)
                                {
                                    weatherSequence.Add(item.GetValue<string>());
                                }
                                Console.WriteLine($"Loaded {weatherSequence.Count} weather scenarios from config.");
                            }
                        }
                    }
                    catch (Exception ex) { Console.WriteLine($"Failed to load app_config.json: {ex.Message}"); }
                }

                if (weatherSequence.Count == 0)
                {
                    // Default Fallback
                    weatherSequence.Add("SS_weather_sunny9_12");
                    Console.WriteLine("Warning: No weather sequence found, using default.");
                }

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

                // --- MODE SELECTION ---
                Console.WriteLine("\nSelect Mode:");
                Console.WriteLine("1. Normal Precompute (Binary Output) - All Scenarios");
                Console.WriteLine("2. Aggregation Analysis (JSON Output) - First Scenario Only");
                Console.Write("Enter choice (default 1): ");
                string modeInput = Console.ReadLine();
                bool isAggregationMode = modeInput?.Trim() == "2";

                if (isAggregationMode)
                {
                    string scenario = weatherSequence[0];
                    ParseScenario(scenario, weatherFactors, activePonds, out int wId, out string pKey, out double wTemp, out double bTemp);

                    var aggregator = new WeightAggregator(calculator, speciesList, activeReleases, fishReleasesRaw);
                    string aggOutputPath = Path.Combine(rootPath, "agg_weights.json");
                    aggregator.RunAggregation(
                        voxelData,
                        dimX, dimY, dimZ,
                        origin, step,
                        waterMinZ, waterMaxZ,
                        wId, pKey,
                        wTemp, bTemp,
                        aggOutputPath
                    );
                    Console.WriteLine("Aggregation Analysis Finished.");
                    return;
                }

                // --- NORMAL PRECOMPUTE MODE ---
                string outputPath = Path.Combine(rootPath, "weights.bin");
                Console.WriteLine($"Saving results to {outputPath}...");

                // We will stream write to the file to handle large data
                using (var stream = File.Open(outputPath, FileMode.Create))
                using (var writer = new BinaryWriter(stream))
                {
                    // HEADER V2
                    writer.Write(0x46495348); // Magic "FISH"
                    writer.Write(2); // Version 2
                    writer.Write(dimX);
                    writer.Write(dimY);
                    writer.Write(dimZ);
                    writer.Write(numSpecies);
                    writer.Write(weatherSequence.Count); // NumScenarios

                    // Species IDs mapping
                    foreach (var sid in speciesList) writer.Write(sid);

                    // Scenario Names
                    foreach (var scen in weatherSequence) writer.Write(scen);

                    Console.WriteLine("Header written. Starting Scenario Loop...");

                    // DATA BODY
                    int scenarioIdx = 0;
                    foreach (var scenario in weatherSequence)
                    {
                        Console.WriteLine($"\n--- Processing Scenario {scenarioIdx + 1}/{weatherSequence.Count}: {scenario} ---");
                        ParseScenario(scenario, weatherFactors, activePonds, out int weatherId, out string periodKey, out double weatherWaterTemp, out double bottomTemp);

                        // Calculate Results
                        int processedCount = 0;
                        int debugCount = 0;

                        // Reuse result buffer? No, let's write per voxel or buffer per scenario. 
                        // To allow contiguous writing of [x,y,z,species] block, we can buffer calculation.
                        // totalElements = totalVoxels * numSpecies. 
                        // If 20MB per frame, we can alloc one buffer and reuse it.
                        long totalElements = totalVoxels * numSpecies;
                        float[] resultData = new float[totalElements];

                        Random rnd = new Random();
                        for (int i = 0; i < voxelData.Length; i++)
                        {
                            long rawValue = voxelData[i];
                            int bitmask = (int)(rawValue & 0xFFFFFFFF); // Low 32 bits: flags
                            int depthCm = (int)(rawValue >> 32);        // High 32 bits: max depth at this column (cm)

                            if ((bitmask & 1) != 0 && rnd.Next(10000) == 0) // Sample ~0.01% of water voxels
                            {
                                Console.WriteLine($"[DEBUG SAMPLE] Idx:{i} Raw:{rawValue:X16} High(Depth):{depthCm} Low(Flag):{bitmask} WaterDepth:{depthCm / 100.0}m");
                            }

                            if ((bitmask & 1) == 0) continue; // 0 weight for non-water

                            // New index order: [x, depthIndex, z]
                            int temp = i;
                            int z = temp % dimZ;
                            temp /= dimZ;
                            int depthIndex = temp % dimY;
                            int x = temp / dimY;

                            // Depth calculation: depthIndex represents how deep from surface
                            // baitDepth = depthIndex * step[1]
                            double baitDepth = depthIndex * step[1];
                            double waterDepth = depthCm / 100.0; // Convert cm to meters

                            for (int s = 0; s < numSpecies; s++)
                            {
                                int fishEnvId = speciesList[s];
                                var release = activeReleases.FirstOrDefault(r => r.FishEnvId == fishEnvId);
                                if (release == null || !fishReleasesRaw.TryGetValue(release.ReleaseId.ToString(), out var fishRelease)) continue;

                                bool doDebug = (debugCount < debugLimit && scenarioIdx == 0); // Only debug first scenario to avoid spam
                                double weight;

                                if (doDebug)
                                {
                                    weight = calculator.CalculateWeightDebug(
                                        fishEnvId, x, depthIndex, z,
                                        baitDepth, waterDepth, bitmask,
                                        weatherId, periodKey,
                                        fishRelease.ProbWeightIdeal, fishRelease.MinEnvCoeff,
                                        weatherWaterTemp, bottomTemp, waterMinZ, waterMaxZ
                                    );
                                }
                                else
                                {
                                    weight = calculator.CalculateWeight(
                                        fishEnvId, x, depthIndex, z,
                                        baitDepth, waterDepth, bitmask,
                                        weatherId, periodKey,
                                        fishRelease.ProbWeightIdeal, fishRelease.MinEnvCoeff,
                                        weatherWaterTemp, bottomTemp, waterMinZ, waterMaxZ
                                    );
                                }

                                long flatIndex = ((long)x * dimY * dimZ + depthIndex * dimZ + z) * numSpecies + s;
                                resultData[flatIndex] = (float)weight;
                            }

                            if (debugCount < debugLimit && scenarioIdx == 0)
                            {
                                debugCount++;
                                Console.WriteLine("--------------------------------------------------");
                            }
                            processedCount++;
                            if (processedCount % 50000 == 0) Console.Write($"\rCalc... {processedCount}/{totalVoxels}");
                        }

                        // Write Buffer
                        Console.WriteLine($"\nWriting {resultData.Length} floats for scenario {scenario}...");
                        foreach (var val in resultData) writer.Write(val);

                        scenarioIdx++;
                    }
                }

                // Output species mapping JSON for visualization
                var speciesMapping = speciesList.Select((id, index) => new
                {
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

        private static void ParseScenario(string selectedScenario, List<WeatherFactor> weatherFactors, List<FishPond> activePonds,
            out int weatherId, out string periodKey, out double weatherWaterTemp, out double bottomTemp)
        {
            // Format: {WeatherName}{PeriodKeySuffix}
            string weatherName = selectedScenario;
            string periodSuffix = "";

            string[] periods = new string[] { "6_9", "9_12", "12_15", "15_18", "18_21", "21_0", "0_3", "3_6" };
            foreach (var p in periods)
            {
                if (selectedScenario.EndsWith(p))
                {
                    periodSuffix = p;
                    break;
                }
            }

            periodKey = "period" + periodSuffix;

            var weatherFactor = weatherFactors.FirstOrDefault(w => w.Name == weatherName);
            weatherId = weatherFactor?.Id ?? 1001;

            if (weatherFactor == null) Console.WriteLine($"WARNING: Weather '{weatherName}' not found. using 1001.");

            if (weatherFactor != null && weatherFactor.WaterTemp != null && weatherFactor.WaterTemp.Length >= 2)
            {
                weatherWaterTemp = (weatherFactor.WaterTemp[0] + weatherFactor.WaterTemp[1]) / 20.0;
            }
            else
            {
                weatherWaterTemp = 20.0;
            }
            bottomTemp = (activePonds.FirstOrDefault()?.HypolimnionT ?? 100) / 10.0;
        }
    }
}

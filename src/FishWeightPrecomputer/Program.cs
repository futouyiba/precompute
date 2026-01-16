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

                int mapId = mapSceneInfo.Desc;
                Console.WriteLine($"Resolved Game Map ID: {mapId} (from SceneID {sceneIdStr}, EntryID {mapSceneInfo.Id})");

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
                int[] voxelData = NpyReader.ReadInt32(npyPath, out dimensions);

                int dimX = dimensions[0];
                int dimY = dimensions[1];
                int dimZ = dimensions[2];
                Console.WriteLine($"Map Dimensions: {dimX}x{dimY}x{dimZ}");

                // 6. Iterate and Calculate
                // --- APP CONFIG ---
                string appConfigPath = Path.Combine(rootPath, "src/FishWeightPrecomputer/app_config.json");
                // Fallback to local dir if running from bin
                if (!File.Exists(appConfigPath)) appConfigPath = "app_config.json";

                int debugLimit = 2;
                if (File.Exists(appConfigPath))
                {
                    try
                    {
                        var jsonNode = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(appConfigPath));
                        if (jsonNode != null && jsonNode["DebugLimit"] != null)
                        {
                            debugLimit = jsonNode["DebugLimit"].GetValue<int>();
                            Console.WriteLine($"Loaded DebugLimit from config: {debugLimit}");
                        }
                    }
                    catch { Console.WriteLine("Failed to load app_config.json, using default."); }
                }

                // --- WEATHER SEQUENCE ---
                string[] weatherSequence = new string[]
                {
                    "SS_weather_sunny6_9",
                    "SS_weather_sunny9_12",
                    "SS_weather_sunny12_15",
                    "SS_weather_sunny15_18",
                    "SS_weather_cloudy6_9",
                    "SS_weather_fine_rain9_12",
                    "SS_weather_fine_rain12_15",
                    "SS_weather_fine_rain15_18",
                    "SS_weather_fine_rain6_9",
                    "SS_weather_cloudy9_12",
                    "SS_weather_sunny12_15",
                    "SS_weather_sunny15_18"
                };

                Console.WriteLine("\nAvailable Weather Scenarios:");
                for (int i = 0; i < weatherSequence.Length; i++)
                {
                    Console.WriteLine($"{i}. {weatherSequence[i]}");
                }
                Console.Write("Select Scenario Index (default 0): ");
                string scenarioInput = Console.ReadLine();
                int scenarioIndex = 0;
                int.TryParse(scenarioInput, out scenarioIndex);
                if (scenarioIndex < 0 || scenarioIndex >= weatherSequence.Length) scenarioIndex = 0;

                string selectedScenario = weatherSequence[scenarioIndex];
                Console.WriteLine($"Selected Scenario: {selectedScenario}");

                // Parse Scenario
                // Format: {WeatherName}{PeriodKeySuffix}
                // Try to match period suffixes: 6_9, 9_12, 12_15, 15_18, 18_21, 21_24, 0_3, 3_6
                string periodSuffix = "";
                string weatherName = "";

                string[] periods = new string[] { "6_9", "9_12", "12_15", "15_18", "18_21", "21_24", "0_3", "3_6" };
                foreach (var p in periods)
                {
                    if (selectedScenario.EndsWith(p))
                    {
                        periodSuffix = p;
                        weatherName = selectedScenario.Substring(0, selectedScenario.Length - p.Length);
                        break;
                    }
                }

                string periodKey = "period" + periodSuffix;

                // Resolve Weather ID by Name
                var weatherFactor = weatherFactors.FirstOrDefault(w => w.Name == weatherName);
                if (weatherFactor == null)
                {
                    Console.WriteLine($"WARNING: Weather Name '{weatherName}' not found in configuration! Using default ID 1001.");
                    // Fallback to avoid crash, or maybe explicit error? 
                    // Let's try to match loosely or default.
                }
                int weatherId = weatherFactor?.Id ?? 1001;

                Console.WriteLine($"Resolved Config -> Weather: {weatherName} (ID: {weatherId}), Period: {periodKey}");
                Console.WriteLine($"Environment: WaterTemp={weatherFactor?.WaterTemp / 10.0 ?? 20.0:F1} (derived from factor), BottomTemp={activePonds.FirstOrDefault()?.HypolimnionT / 10.0 ?? 10.0:F1}");

                // Update Temps based on Weather
                // Note: weatherWaterTemp should come from the WeatherFactor if available? 
                // The doc says: "Extract scalar from weather config... use to calculate temp affinity... note temp needs float /10"
                // Checking WeatherFactor definition in DataModels.cs: public int WaterTemp { get; set; }
                double weatherWaterTemp = (weatherFactor?.WaterTemp ?? 200) / 10.0;

                // Bottom Temp comes from Pond Config
                // Assuming single pond logic as before or average? 
                // The Calculator uses 'bottomTemp' passed in. 
                // Let's grab it from the first active pond (since usually one map = one pond logic for precompute?)
                // Or if we iterate voxels, is it pond specific? Voxel loop doesn't check pond per voxel.
                // Assuming Global Map -> Single 'HypolimnionT' for the main water body.
                double bottomTemp = (activePonds.FirstOrDefault()?.HypolimnionT ?? 100) / 10.0;

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
                Console.WriteLine("1. Normal Precompute (Binary Output)");
                Console.WriteLine("2. Aggregation Analysis (JSON Output)");
                Console.Write("Enter choice (default 1): ");
                string modeInput = Console.ReadLine();
                bool isAggregationMode = modeInput?.Trim() == "2";

                if (isAggregationMode)
                {
                    var aggregator = new WeightAggregator(calculator, speciesList, activeReleases, fishReleasesRaw);
                    string aggOutputPath = Path.Combine(rootPath, "agg_weights.json");
                    aggregator.RunAggregation(
                        voxelData,
                        dimX, dimY, dimZ,
                        origin, step,
                        waterMinZ, waterMaxZ,
                        weatherId, periodKey,
                        weatherWaterTemp, bottomTemp,
                        aggOutputPath
                    );
                    Console.WriteLine("Aggregation Analysis Finished.");
                    return;
                }

                // --- NORMAL PRECOMPUTE MODE ---
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

                // --- DEBUG & STATS VARIABLES ---
                // debugLimit is loaded from config
                int debugCount = 0;
                // Stat: FishId -> (Min, Max, Sum, PositiveCount)
                // Initialize stats
                var stats = new Dictionary<int, (double Min, double Max, double Sum, long Count, long ZeroCount)>();
                foreach (var sid in speciesList)
                {
                    stats[sid] = (double.MaxValue, double.MinValue, 0d, 0, 0);
                }
                // --------------------------------

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

                        bool doDebug = (debugCount < debugLimit);
                        double weight;

                        if (doDebug)
                        {
                            string fishName = fishEnvAffinities.FirstOrDefault(f => f.Id == fishEnvId)?.Name ?? $"Unknown_{fishEnvId}";
                            weight = calculator.CalculateWeightDebug(
                                fishEnvId,
                                x, y, z,
                                baitDepth, waterDepth, bitmask,
                                weatherId, periodKey,
                                fishRelease.ProbWeightIdeal,
                                fishRelease.MinEnvCoeff,
                                weatherWaterTemp, bottomTemp, waterMinZ, waterMaxZ,
                                mapId,
                                selectedScenario,
                                fishName
                            );
                        }
                        else
                        {
                            weight = calculator.CalculateWeight(
                                fishEnvId,
                                x, y, z,
                                baitDepth, waterDepth, bitmask,
                                weatherId, periodKey,
                                fishRelease.ProbWeightIdeal,
                                fishRelease.MinEnvCoeff,
                                weatherWaterTemp, bottomTemp, waterMinZ, waterMaxZ
                            );
                        }

                        // Calculate index
                        long flatIndex = ((long)x * dimY * dimZ + y * dimZ + z) * numSpecies + s;
                        resultData[flatIndex] = (float)weight;

                        // Update Stats
                        var currentStat = stats[fishEnvId];
                        if (weight > 0)
                        {
                            if (weight < currentStat.Min) currentStat.Min = weight;
                            if (weight > currentStat.Max) currentStat.Max = weight;
                            currentStat.Sum += weight;
                            currentStat.Count++;
                        }
                        else
                        {
                            currentStat.ZeroCount++;
                        }
                        stats[fishEnvId] = currentStat;
                    }

                    if (debugCount < debugLimit)
                    {
                        debugCount++;
                        Console.WriteLine("--------------------------------------------------");
                    }
                    processedCount++;
                    if (processedCount % 10000 == 0)
                    {
                        Console.Write($"\rProcessed {processedCount}/{totalVoxels} voxels...");
                    }
                }
                Console.WriteLine($"\nCalculation Completed.");

                // --- PRINT STATISTICS ---
                Console.WriteLine("\n================ SPECIES STATISTICS ================");
                Console.WriteLine($"{"ID",-10} | {"Name",-20} | {"NonZero#",-10} | {"Zero#",-10} | {"Min",-10} | {"Max",-10} | {"Avg(NZ)",-10}");
                Console.WriteLine(new string('-', 95));
                foreach (var sid in speciesList)
                {
                    var s = stats[sid];
                    string name = fishEnvAffinities.FirstOrDefault(f => f.Id == sid)?.Name ?? sid.ToString();
                    if (name.Length > 20) name = name.Substring(0, 17) + "...";

                    double avg = s.Count > 0 ? s.Sum / s.Count : 0;
                    double dispMin = s.Count > 0 ? s.Min : 0;
                    double dispMax = s.Count > 0 ? s.Max : 0;

                    Console.WriteLine($"{sid,-10} | {name,-20} | {s.Count,-10} | {s.ZeroCount,-10} | {dispMin,-10:F4} | {dispMax,-10:F4} | {avg,-10:F4}");
                }
                Console.WriteLine("====================================================\n");

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
                    foreach (var sid in speciesList) writer.Write(sid);

                    // Body
                    foreach (var val in resultData) writer.Write(val);
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
    }
}

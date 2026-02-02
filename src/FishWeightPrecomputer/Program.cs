#nullable disable
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace FishWeightPrecomputer
{
    class Program
    {
        // Static fields to share state across methods
        private static string rootPath;
        private static Calculator calculator;
        private static long[] voxelData;
        private static int dimX, dimY, dimZ;
        private static float[] depthData;
        private static int[] depthDimensions;
        private static float[] step;
        private static List<int> speciesList;
        private static int numSpecies;
        private static List<StockRelease> activeReleases;
        private static Dictionary<string, FishRelease> fishReleasesRaw;
        private static List<FishEnvAffinity> fishEnvAffinities;
        private static List<string> weatherSequence;
        private static List<WeatherFactor> weatherFactors;
        private static List<FishPond> activePonds;
        private static int mapId;
        private static double waterMinZ, waterMaxZ;
        private static int debugLimit;
        private static long totalVoxels;

        static void Main(string[] args)
        {
            try
            {
                Console.WriteLine("Starting Fish Weight Precomputer (Dynamic Map ID)...");

                // 1. Setup Paths
                rootPath = AppContext.BaseDirectory;
                while (!Directory.Exists(Path.Combine(rootPath, "data")) && Directory.GetParent(rootPath) != null)
                {
                    rootPath = Directory.GetParent(rootPath).FullName;
                }

                if (!Directory.Exists(Path.Combine(rootPath, "data")))
                {
                    rootPath = @"e:\precompute\precompute";
                }

                Console.WriteLine($"Root Path resolved to: {rootPath}");

                string userDataPath = Path.Combine(rootPath, @"data\1\1001");
                string mapDataPath = Path.Combine(rootPath, @"data");

                // Verify Data Loader
                var dataLoader = new DataLoader(userDataPath, mapDataPath);

                // 2. Load Configs
                Console.WriteLine("Loading configurations...");
                var affinityConst = dataLoader.LoadJson<EnvAffinityConst>("env_affinity_const.json");
                var structAffinitiesRaw = dataLoader.LoadJson<Dictionary<string, StructAffinityProfile>>("struct_affinity.json");
                var structAffinities = structAffinitiesRaw.Values.ToDictionary(v => v.Id);

                var tempAffinitiesRaw = dataLoader.LoadJson<Dictionary<string, TempAffinity>>("temp_affinity.json");
                var tempAffinities = tempAffinitiesRaw.Values.ToList();

                var layerAffinitiesRaw = dataLoader.LoadJson<Dictionary<string, WaterLayerProfile>>("water_layer_affinity.json");
                var layerAffinities = layerAffinitiesRaw.Values.ToList();

                var weatherFactorsRaw = dataLoader.LoadJson<Dictionary<string, WeatherFactor>>("weather_factor.json");
                weatherFactors = weatherFactorsRaw.Values.ToList();

                var periodAffinitiesRaw = dataLoader.LoadJson<Dictionary<string, PeriodAffinity>>("period_affinity.json");
                var periodAffinities = periodAffinitiesRaw.Values.ToList();

                var fishEnvAffinitiesRaw = dataLoader.LoadJson<Dictionary<string, FishEnvAffinity>>("fish_env_affinity.json");
                fishEnvAffinities = fishEnvAffinitiesRaw.Values.ToList();

                var fishStocksRaw = dataLoader.LoadJson<Dictionary<string, FishStock>>("fish_stock.json");
                var fishPondsRaw = dataLoader.LoadJson<Dictionary<string, FishPond>>("fish_pond_list.json");
                var mapBasicConfigs = dataLoader.LoadJson<Dictionary<string, MapBasicConfig>>("map_basic.json");

                // Release Data
                fishReleasesRaw = dataLoader.LoadJson<Dictionary<string, FishRelease>>("fish_release.json");
                var stockReleasesRaw = dataLoader.LoadJson<Dictionary<string, StockRelease>>("stock_release.json");

                // 3. Initialize Calculator
                calculator = new Calculator(
                    affinityConst,
                    structAffinities,
                    tempAffinities,
                    layerAffinities,
                    weatherFactors,
                    periodAffinities,
                    fishEnvAffinities
                );

                // 3.5 Load App Config
                string appConfigPath = Path.Combine(rootPath, "src/FishWeightPrecomputer/app_config.json");
                if (!File.Exists(appConfigPath)) appConfigPath = "app_config.json";

                debugLimit = 2;
                weatherSequence = new List<string>();
                string configMapDataPath = "../ExportedData/Fishing_1006001_Dense";

                if (File.Exists(appConfigPath))
                {
                    try
                    {
                        var jsonNode = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(appConfigPath));
                        if (jsonNode != null)
                        {
                            if (jsonNode["DebugLimit"] != null) debugLimit = jsonNode["DebugLimit"].GetValue<int>();
                            if (jsonNode["MapDataPath"] != null) configMapDataPath = jsonNode["MapDataPath"].GetValue<string>();
                            if (jsonNode["WeatherSequence"] != null)
                            {
                                var seqArray = jsonNode["WeatherSequence"].AsArray();
                                foreach (var item in seqArray) weatherSequence.Add(item.GetValue<string>());
                            }
                        }
                    }
                    catch (Exception ex) { Console.WriteLine($"Failed to load app_config.json: {ex.Message}"); }
                }

                if (weatherSequence.Count == 0) weatherSequence.Add("SS_weather_sunny9_12");

                // 4. Determine Map ID dynamically
                string mapDataJsonPath = Path.GetFullPath(Path.Combine(rootPath, configMapDataPath, "map_data.json"));
                if (!File.Exists(mapDataJsonPath))
                {
                    // Fallback to local precompute folder if config path not found
                    mapDataJsonPath = Path.Combine(rootPath, @"Fishing_1006001_Dense\map_data.json");
                }
                if (!File.Exists(mapDataJsonPath))
                {
                    Console.WriteLine($"Error: map_data.json not found at {mapDataJsonPath}");
                    return;
                }

                string mapDataJson = File.ReadAllText(mapDataJsonPath);
                var mapDataConfig = System.Text.Json.JsonSerializer.Deserialize<MapDataConfig>(mapDataJson);
                var origin = mapDataConfig.Global.Origin;
                step = mapDataConfig.Global.Step;
                Console.WriteLine($"Loaded map_data.json: Origin=[{origin[0]}, {origin[1]}, {origin[2]}]");

                string globalNpyFile = mapDataConfig.Global.DataFile;
                string sceneIdStr = globalNpyFile.Split('_')[1];
                Console.WriteLine($"Extracted SceneID (AssetId): {sceneIdStr}");

                var mapScenesRaw = dataLoader.LoadJson<Dictionary<string, MapSceneInfo>>("map_scene.json");
                var mapSceneInfo = mapScenesRaw.Values.FirstOrDefault(m => m.AssetId == sceneIdStr);

                if (mapSceneInfo == null)
                {
                    Console.WriteLine($"Error: Could not find Map Scene info for AssetId {sceneIdStr}");
                    return;
                }

                mapId = mapSceneInfo.Desc;
                Console.WriteLine($"Resolved Game Map ID: {mapId}");

                if (!mapBasicConfigs.TryGetValue(mapId.ToString(), out var mapBasic))
                {
                    mapBasic = mapBasicConfigs.Values.FirstOrDefault();
                }

                // Filter Active Species
                activePonds = fishPondsRaw.Values.Where(p => p.MapId == mapId).ToList();
                var activeSpecies = new HashSet<int>();
                activeReleases = new List<StockRelease>();

                foreach (var pond in activePonds)
                {
                    var stockReleases = stockReleasesRaw.Values.Where(r => r.StockId == pond.FishStockId);
                    foreach (var sr in stockReleases)
                    {
                        activeReleases.Add(sr);
                        activeSpecies.Add(sr.FishEnvId);
                    }
                }

                Console.WriteLine($"Total active FishEnvIds: {activeSpecies.Count}");

                string mapDir = Path.GetDirectoryName(mapDataJsonPath);
                string npyPath = Path.Combine(mapDir, mapDataConfig.Global.DataFile);

                if (!File.Exists(npyPath))
                {
                    Console.WriteLine($"NPY file not found at: {npyPath}");
                    return;
                }

                Console.WriteLine($"Loading NPY Data: {npyPath}");
                int[] dimensions;
                voxelData = NpyReader.ReadInt64(npyPath, out dimensions);

                dimX = dimensions[0];
                dimY = dimensions[1];
                dimZ = dimensions[2];
                Console.WriteLine($"Map Dimensions: {dimX}x{dimY}x{dimZ}");

                // Load Depth Data
                depthData = null;
                depthDimensions = null;
                string depthFile = mapDataConfig.Global.DepthFile;
                if (!string.IsNullOrEmpty(depthFile))
                {
                    string depthPath = Path.Combine(mapDir, depthFile);
                    if (File.Exists(depthPath))
                    {
                        Console.WriteLine($"Loading Depth Data: {depthPath}");
                        depthData = NpyReader.ReadFloat32(depthPath, out depthDimensions);
                        Console.WriteLine($"Depth Dimensions: {depthDimensions[0]}x{depthDimensions[1]}");
                    }
                    else
                    {
                        Console.WriteLine($"Warning: Depth file not found: {depthPath}");
                    }
                }
                else
                {
                    Console.WriteLine("Warning: No depthFile specified in map_data.json. Using fallback (packed depth).");
                }

                // 6. Iterate and Calculate
                waterMinZ = mapBasic?.WaterMinZ ?? -20.0;
                waterMaxZ = mapBasic?.WaterMaxZ ?? 0.0;
                totalVoxels = (long)dimX * dimY * dimZ;
                speciesList = activeSpecies
                    .OrderBy(id => fishEnvAffinities.FirstOrDefault(f => f.Id == id)?.Name ?? id.ToString())
                    .ToList();
                numSpecies = speciesList.Count;

                Console.WriteLine("\nSelect Mode:");
                Console.WriteLine("1. Normal Precompute (Binary Output) - All Scenarios");
                Console.WriteLine("2. Aggregation Analysis (JSON Output) - First Scenario Only");

                string modeInput = "";
                if (args.Length > 0)
                {
                    string arg = args[0].ToLower();
                    if (arg == "normal" || arg == "1") modeInput = "1";
                    else if (arg == "aggregate" || arg == "2") modeInput = "2";

                    if (!string.IsNullOrEmpty(modeInput))
                    {
                        Console.WriteLine($"Using mode from command-line argument: {arg}");
                    }
                }

                if (string.IsNullOrEmpty(modeInput))
                {
                    Console.Write("Enter choice (default 1 / keywords: normal, aggregate): ");
                    try
                    {
                        modeInput = Console.ReadLine()?.ToLower();
                    }
                    catch
                    {
                        // Ignore console read errors
                    }

                    if (modeInput == "normal") modeInput = "1";
                    else if (modeInput == "aggregate") modeInput = "2";
                }

                if (string.IsNullOrEmpty(modeInput)) modeInput = "1";

                bool isAggregationMode = (modeInput == "2");

                if (isAggregationMode)
                {
                    RunAggregationAnalysis();
                }
                else
                {
                    RunNormalPrecompute();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
                Console.WriteLine(ex.StackTrace);
            }
        }

        private static void RunAggregationAnalysis()
        {
            // --- AGGREGATION ANALYSIS MODE ---
            string aggOutputPath = Path.Combine(rootPath, "agg_weights.json");
            Console.WriteLine($"Starting Aggregation Analysis (Output: {aggOutputPath})...");

            // Only process the FIRST scenario
            string scenario = weatherSequence.FirstOrDefault();
            if (string.IsNullOrEmpty(scenario))
            {
                Console.WriteLine("Error: No weather scenario defined.");
                return;
            }

            Console.WriteLine($"Aggregating for scenario: {scenario}");
            ParseScenario(scenario, weatherFactors, activePonds, out int weatherId, out string periodKey, out double weatherWaterTemp, out double bottomTemp);

            // Dictionary to hold aggregated results
            // Key: (RoundedDepth, StructureMask, LayersSig) -> Index in result list
            var aggregationMap = new Dictionary<string, AggregatedData>();
            var resultList = new List<AggregatedData>();

            long processedCount = 0;
            Console.WriteLine("Iterating voxels for aggregation...");

            for (int i = 0; i < voxelData.Length; i++)
            {
                long rawValue = voxelData[i];
                long bitmask = rawValue;

                if ((bitmask & 1) == 0) continue; // Skip non-water

                int temp = i;
                int z = temp % dimZ;
                temp /= dimZ;
                int depthIndex = temp % dimY;
                int x = temp / dimY;

                double waterDepth = 0.0;
                if (depthData != null && depthDimensions != null)
                {
                    int depthIdx = x * depthDimensions[1] + z;
                    if (depthIdx >= 0 && depthIdx < depthData.Length) waterDepth = depthData[depthIdx];
                }
                else
                {
                    int depthCm = (int)(rawValue >> 32);
                    waterDepth = depthCm / 100.0;
                }

                double baitDepth = depthIndex * step[1];

                // Calculate Conditions
                double roundedDepth = Math.Round(baitDepth * 100) / 100.0; // Use Voxel Depth (BaitDepth)

                // Get Layers
                var layers = calculator.GetLayerTypes(baitDepth, waterDepth);
                var sortedLayers = layers.OrderBy(l => l).ToList();
                string layersSig = string.Join(",", sortedLayers);

                string key = $"{roundedDepth}_{bitmask}_{layersSig}";

                if (!aggregationMap.TryGetValue(key, out var aggData))
                {
                    aggData = new AggregatedData
                    {
                        Conditions = new ConditionKey
                        {
                            VoxelDepth = roundedDepth,
                            StructureMask = bitmask,
                            Layers = sortedLayers
                        },
                        Weights = new double[numSpecies],
                        VoxelCount = 0
                    };
                    aggregationMap[key] = aggData;
                    resultList.Add(aggData);
                }

                aggData.VoxelCount++;

                // Sum Weights
                for (int s = 0; s < numSpecies; s++)
                {
                    int fishEnvId = speciesList[s];
                    var release = activeReleases.FirstOrDefault(r => r.FishEnvId == fishEnvId);
                    if (release == null || !fishReleasesRaw.TryGetValue(release.ReleaseId.ToString(), out var fishRelease)) continue;

                    double weight = calculator.CalculateWeight(
                        fishEnvId, x, depthIndex, z,
                        baitDepth, waterDepth, bitmask,
                        weatherId, periodKey,
                        fishRelease.ProbWeightIdeal, fishRelease.MinEnvCoeff,
                        weatherWaterTemp, bottomTemp, waterMinZ, waterMaxZ
                    );

                    aggData.Weights[s] += weight;
                }

                processedCount++;
                if (processedCount % 50000 == 0) Console.Write($"\rAggregating... {processedCount}");
            }

            Console.WriteLine($"\nAggregation complete. Unique conditions: {resultList.Count}");

            // Serialize
            var options = new System.Text.Json.JsonSerializerOptions { WriteIndented = true, PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase };
            string jsonOutput = System.Text.Json.JsonSerializer.Serialize(resultList, options);
            File.WriteAllText(aggOutputPath, jsonOutput);
            Console.WriteLine("Saved aggregation results.");
        }

        private static void RunNormalPrecompute()
        {
            // --- NORMAL PRECOMPUTE MODE ---
            string outputPath = Path.Combine(rootPath, "weights.bin");
            Console.WriteLine($"Saving results to {outputPath}...");

            // Debug CSV Writer
            string csvPath = Path.Combine(rootPath, "depths_debug.csv");
            Console.WriteLine($"Writing debug depths to {csvPath}...");

            using (var debugWriter = new StreamWriter(csvPath))
            using (var stream = File.Open(outputPath, FileMode.Create))
            using (var writer = new BinaryWriter(stream))
            {
                debugWriter.WriteLine("WaterDepthMeters");

                writer.Write(0x46495348); // Magic "FISH"
                writer.Write(2); // Version 2
                writer.Write(dimX);
                writer.Write(dimY);
                writer.Write(dimZ);
                writer.Write(numSpecies);
                writer.Write(weatherSequence.Count);

                foreach (var sid in speciesList) writer.Write(sid);
                foreach (var scen in weatherSequence) writer.Write(scen);

                int scenarioIdx = 0;
                foreach (var scenario in weatherSequence)
                {
                    Console.WriteLine($"\n--- Processing Scenario {scenarioIdx + 1}/{weatherSequence.Count}: {scenario} ---");
                    ParseScenario(scenario, weatherFactors, activePonds, out int weatherId, out string periodKey, out double weatherWaterTemp, out double bottomTemp);

                    int processedCount = 0;
                    int debugCount = 0;

                    long totalElements = totalVoxels * numSpecies;
                    float[] resultData = new float[totalElements];

                    for (int i = 0; i < voxelData.Length; i++)
                    {
                        long rawValue = voxelData[i];
                        // New format: rawValue is pure flags (int64), depth is in separate file
                        long bitmask = rawValue;

                        if ((bitmask & 1) == 0) continue;

                        int temp = i;
                        int z = temp % dimZ;
                        temp /= dimZ;
                        int depthIndex = temp % dimY;
                        int x = temp / dimY;

                        // Get water depth from separate depth array
                        double waterDepth = 0.0;
                        if (depthData != null && depthDimensions != null)
                        {
                            // Depth data is 2D: [dimX, dimZ]
                            int depthIdx = x * depthDimensions[1] + z;
                            if (depthIdx >= 0 && depthIdx < depthData.Length)
                            {
                                waterDepth = depthData[depthIdx];
                            }
                        }
                        else
                        {
                            // Fallback: Try old format (packed in high 32 bits) for backward compatibility
                            int depthCm = (int)(rawValue >> 32);
                            waterDepth = depthCm / 100.0;
                        }

                        // Debug: Write Depth (Only for first scenario to avoid duplicate IO)
                        if (scenarioIdx == 0)
                        {
                            debugWriter.WriteLine(waterDepth);
                        }

                        double baitDepth = depthIndex * step[1];

                        for (int s = 0; s < numSpecies; s++)
                        {
                            int fishEnvId = speciesList[s];
                            var release = activeReleases.FirstOrDefault(r => r.FishEnvId == fishEnvId);
                            if (release == null || !fishReleasesRaw.TryGetValue(release.ReleaseId.ToString(), out var fishRelease)) continue;

                            bool doDebug = (debugCount < debugLimit && scenarioIdx == 0);
                            double weight;

                            if (doDebug)
                            {
                                string fishName = fishEnvAffinities.FirstOrDefault(f => f.Id == fishEnvId)?.Name ?? $"Unknown_{fishEnvId}";
                                weight = calculator.CalculateWeightDebug(
                                    fishEnvId, x, depthIndex, z,
                                    baitDepth, waterDepth, bitmask,
                                    weatherId, periodKey,
                                    fishRelease.ProbWeightIdeal, fishRelease.MinEnvCoeff,
                                    weatherWaterTemp, bottomTemp, waterMinZ, waterMaxZ,
                                    mapId, scenario, fishName, release.ReleaseId
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

                    Console.WriteLine($"\nWriting {resultData.Length} floats for scenario {scenario}...");
                    foreach (var val in resultData) writer.Write(val);

                    scenarioIdx++;
                }
            }

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

        private static void ParseScenario(string selectedScenario, List<WeatherFactor> weatherFactors, List<FishPond> activePonds,
            out int weatherId, out string periodKey, out double weatherWaterTemp, out double bottomTemp)
        {
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

    public class AggregatedData
    {
        public ConditionKey Conditions { get; set; }
        public double[] Weights { get; set; }
        public int VoxelCount { get; set; }
    }

    public class ConditionKey
    {
        public double VoxelDepth { get; set; }
        public long StructureMask { get; set; }
        public List<int> Layers { get; set; }
    }
}

#nullable disable
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace FishWeightPrecomputer
{
    public class FishEnvAffinity
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("structId")]
        public int StructId { get; set; }

        [JsonPropertyName("tempId")]
        public int TempId { get; set; }

        [JsonPropertyName("layerId")]
        public int LayerId { get; set; }

        [JsonPropertyName("periodCoeffGroup")]
        public int PeriodCoeffGroup { get; set; }

        [JsonPropertyName("pressureSensitivity")]
        public double PressureSensitivity { get; set; }
    }

    public class TempAffinity
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("temperatureFav")]
        public int TemperatureFav { get; set; }

        [JsonPropertyName("tempAffectedRatio")]
        public double TempAffectedRatio { get; set; }

        [JsonPropertyName("tempThreshold")]
        public double TempThreshold { get; set; }
    }

    // New Struct Affinity Structures
    public class StructAffinityProfile
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("List")]
        public List<StructAffinityItem> Items { get; set; }
    }

    public class StructAffinityItem
    {
        [JsonPropertyName("structType")]
        public int StructType { get; set; }

        [JsonPropertyName("coeff")]
        public double Coeff { get; set; }
    }

    public class WaterLayerProfile
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("List")]
        public List<WaterLayerItem> Items { get; set; }
    }

    public class WaterLayerItem
    {
        [JsonPropertyName("layerType")]
        public int LayerType { get; set; }

        [JsonPropertyName("coeff")]
        public double Coeff { get; set; }
    }

    public class EnvAffinityConst
    {
        [JsonPropertyName("tempToleranceWidth")]
        public double TempToleranceWidth { get; set; }

        [JsonPropertyName("waterTopLayerHeight")]
        public double WaterTopLayerHeight { get; set; }

        [JsonPropertyName("waterTopLayerRatio")]
        public double WaterTopLayerRatio { get; set; }

        [JsonPropertyName("waterBottomLayerHeight")]
        public double WaterBottomLayerHeight { get; set; }

        [JsonPropertyName("waterBottomLayerRatio")]
        public double WaterBottomLayerRatio { get; set; }
    }

    public class WeatherFactor
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("pressureInfluence")]
        public int PressureInfluence { get; set; }

        [JsonPropertyName("WaterTemp")]
        public int[] WaterTemp { get; set; }
    }

    public class PeriodAffinity
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("periodGroup")]
        public int PeriodGroup { get; set; }

        [JsonPropertyName("periodId")]
        public int PeriodId { get; set; }

        [JsonPropertyName("periodActivityFactor")]
        public double PeriodActivityFactor { get; set; }
    }

    public class FishPond
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("fishStockId")]
        public int FishStockId { get; set; }

        [JsonPropertyName("hypolimnionT")]
        public int HypolimnionT { get; set; }

        [JsonPropertyName("mapId")]
        public int MapId { get; set; }
    }

    // New Stock Release Model
    public class StockRelease
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("stockId")]
        public int StockId { get; set; }

        [JsonPropertyName("fishId")]
        public int FishId { get; set; }

        [JsonPropertyName("fishEnvId")]
        public int FishEnvId { get; set; }

        [JsonPropertyName("releaseId")]
        public int ReleaseId { get; set; }
    }

    public class FishRelease
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("probWeightIdeal")]
        public double ProbWeightIdeal { get; set; }

        [JsonPropertyName("minEnvCoeff")]
        public double MinEnvCoeff { get; set; }
    }

    public class FishStock
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }
    }

    // Map Basic Info
    public class MapBasicConfig
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("waterMaxZ")]
        public double WaterMaxZ { get; set; }

        [JsonPropertyName("waterMinZ")]
        public double WaterMinZ { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }
    }

    public class MapDataConfig
    {
        [JsonPropertyName("mapID")]
        public int MapId { get; set; }

        [JsonPropertyName("global")]
        public MapRegionConfig Global { get; set; }

        [JsonPropertyName("locals")]
        public List<MapRegionConfig> Locals { get; set; }
    }

    public class MapRegionConfig
    {
        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("dataFile")]
        public string DataFile { get; set; }

        [JsonPropertyName("origin")]
        public float[] Origin { get; set; }

        [JsonPropertyName("step")]
        public float[] Step { get; set; }

        [JsonPropertyName("dim")]
        public int[] Dim { get; set; }
    }

    public class MapSceneInfo
    {
        [JsonPropertyName("id")]
        public int Id { get; set; } // This is Scene Entry ID

        [JsonPropertyName("desc")]
        public int Desc { get; set; } // This is the Game Map ID (matching fish_pond_list)

        [JsonPropertyName("assetId")]
        public string AssetId { get; set; } // This is SceneID (string in JSON)
    }
}

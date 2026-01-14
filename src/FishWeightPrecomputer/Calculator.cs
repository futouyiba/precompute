using System;
using System.Collections.Generic;
using System.Linq;

namespace FishWeightPrecomputer
{
    public class Calculator
    {
        private EnvAffinityConst _affinityConst;
        private Dictionary<int, StructAffinityProfile> _structAffinities;
        private Dictionary<int, TempAffinity> _tempAffinities;
        private Dictionary<int, WaterLayerProfile> _layerAffinities;
        private Dictionary<int, WeatherFactor> _weatherFactors;
        private Dictionary<int, PeriodAffinity> _periodAffinities;
        private Dictionary<int, FishEnvAffinity> _fishEnvAffinities;
        
        private Dictionary<int, List<PeriodAffinity>> _periodGroups;

        public Calculator(
            EnvAffinityConst affinityConst,
            Dictionary<int, StructAffinityProfile> structAffinities,
            List<TempAffinity> tempAffinities,
            List<WaterLayerProfile> layerAffinities,
            List<WeatherFactor> weatherFactors,
            List<PeriodAffinity> periodAffinities,
            List<FishEnvAffinity> fishEnvAffinities
        )
        {
            _affinityConst = affinityConst;
            _structAffinities = structAffinities;
            _tempAffinities = tempAffinities.ToDictionary(x => x.Id);
            _layerAffinities = layerAffinities.ToDictionary(x => x.Id);
            _weatherFactors = weatherFactors.ToDictionary(x => x.Id);
            
            _periodAffinities = periodAffinities.ToDictionary(x => x.Id);
            _fishEnvAffinities = fishEnvAffinities.ToDictionary(x => x.Id);

            _periodGroups = periodAffinities.GroupBy(p => p.PeriodGroup).ToDictionary(g => g.Key, g => g.ToList());
        }

        public double CalculateWeight(
            int fishEnvId,
            int voxelX, int voxelY, int voxelZ, 
            double baitDepth, double waterDepth, int voxelBitmask,
            int weatherId, string periodKey,
            double baseWeight, double minEnvCoeff,
            double weatherWaterTemp, 
            double bottomTemp,
            double waterMinZ,
            double waterMaxZ
        )
        {
            if (!_fishEnvAffinities.TryGetValue(fishEnvId, out var fishAffinity))
                return 0;

            // 1. Temp Affinity
            double tempAffinity = CalculateTempAffinity(fishAffinity.TempId, baitDepth, waterDepth, 
                weatherWaterTemp, bottomTemp, waterMinZ, waterMaxZ);

            // 2. Struct Affinity
            double structAffinity = CalculateStructAffinity(fishAffinity.StructId, voxelBitmask);

            // 3. Layer Affinity
            double layerAffinity = CalculateLayerAffinity(fishAffinity.LayerId, baitDepth, waterDepth);

            // 4. Weather Affinity
            double weatherAffinity = CalculateWeatherAffinity(weatherId, fishAffinity.PressureSensitivity);

            // 5. Period Activity
            double periodActivity = CalculatePeriodActivity(fishAffinity.PeriodCoeffGroup, periodKey);

            double envCoeff = tempAffinity * structAffinity * layerAffinity * weatherAffinity * periodActivity;
            
            envCoeff = Math.Max(envCoeff, minEnvCoeff);

            return baseWeight * envCoeff;
        }

        public double CalculateWeightDebug(
            int fishEnvId,
            int voxelX, int voxelY, int voxelZ,
            double baitDepth, double waterDepth, int voxelBitmask,
            int weatherId, string periodKey,
            double baseWeight, double minEnvCoeff,
            double weatherWaterTemp,
            double bottomTemp,
            double waterMinZ,
            double waterMaxZ
        )
        {
            Console.WriteLine($"--- Debug Calculation for Species {fishEnvId} @ [{voxelX},{voxelY},{voxelZ}] ---");
            Console.WriteLine($"Inputs: Bitmask={voxelBitmask}, BaitDepth={baitDepth:F2}, WaterDepth={waterDepth:F2}");
            Console.WriteLine($"Temps: Surface={weatherWaterTemp:F1}, Bottom={bottomTemp:F1}");

            if (!_fishEnvAffinities.TryGetValue(fishEnvId, out var fishAffinity))
            {
                Console.WriteLine("Error: FishEnvId not found in affinities.");
                return 0;
            }

            // 1. Temp Affinity
            double tempAffinity = CalculateTempAffinity(fishAffinity.TempId, baitDepth, waterDepth, 
                weatherWaterTemp, bottomTemp, waterMinZ, waterMaxZ);
            Console.WriteLine($"1. TempAffinity (Id {fishAffinity.TempId}): {tempAffinity:F4}");
            if (_tempAffinities.TryGetValue(fishAffinity.TempId, out var ta))
            {
                 Console.WriteLine($"   - Profile: Fav={ta.TemperatureFav/10f}, Threshold={ta.TempThreshold}");
            }

            // 2. Struct Affinity
            double structAffinity = CalculateStructAffinity(fishAffinity.StructId, voxelBitmask);
            Console.WriteLine($"2. StructAffinity (Id {fishAffinity.StructId}): {structAffinity:F4}");

            // 3. Layer Affinity
            double layerAffinity = CalculateLayerAffinity(fishAffinity.LayerId, baitDepth, waterDepth);
            Console.WriteLine($"3. LayerAffinity (Id {fishAffinity.LayerId}): {layerAffinity:F4}");

            // 4. Weather Affinity
            double weatherAffinity = CalculateWeatherAffinity(weatherId, fishAffinity.PressureSensitivity);
            Console.WriteLine($"4. WeatherAffinity: {weatherAffinity:F4}");

            // 5. Period Activity
            double periodActivity = CalculatePeriodActivity(fishAffinity.PeriodCoeffGroup, periodKey);
            Console.WriteLine($"5. PeriodActivity: {periodActivity:F4}");

            double envCoeff = tempAffinity * structAffinity * layerAffinity * weatherAffinity * periodActivity;
            Console.WriteLine($"Raw EnvCoeff: {envCoeff:F6}");
            
            envCoeff = Math.Max(envCoeff, minEnvCoeff);
            Console.WriteLine($"Final EnvCoeff (Min {minEnvCoeff}): {envCoeff:F6}");

            return baseWeight * envCoeff;
        }

        private double CalculateTempAffinity(int tempId, double baitDepth, double waterDepth, 
            double weatherWaterTemp, double bottomTemp, double waterMinZ, double waterMaxZ)
        {
            if (!_tempAffinities.TryGetValue(tempId, out var affinity)) return 1.0; 

            // WeatherWaterTemp is Surface Temp.
            double tempGradient = 0;
            // Use WaterMaxZ (Pool Depth) for gradient calculation as per docs
            if (Math.Abs(waterMaxZ - waterMinZ) > 0.0001)
                tempGradient = (weatherWaterTemp - bottomTemp) / (waterMaxZ - waterMinZ);
            
            double baitTemp = weatherWaterTemp - tempGradient * baitDepth;

            double favTemp = affinity.TemperatureFav / 10.0; 
            double fishTolerance = affinity.TempAffectedRatio;
            double globalTolerance = _affinityConst.TempToleranceWidth;

            // If tolerance is 0, avoid NaN
            if (globalTolerance == 0 || fishTolerance == 0) return 0; // Or 1 if match?

            double exponent = -Math.Pow(baitTemp - favTemp, 2) / (globalTolerance * Math.Pow(fishTolerance, 2));
            double coeff = Math.Exp(exponent);

            if (coeff < affinity.TempThreshold) return 0;

            return coeff;
        }

        private double CalculateStructAffinity(int structId, int voxelBitmask)
        {
            if (!_structAffinities.TryGetValue(structId, out var profile)) return 1.0;
            
            double maxCoeff = 0;
            bool foundAnyStruct = false;

            // Bits 1-11 mapping to StructType 1-11
            for (int i = 1; i <= 11; i++)
            {
                if ((voxelBitmask & (1 << i)) != 0)
                {
                    foundAnyStruct = true;
                    var item = profile.Items.FirstOrDefault(x => x.StructType == i);
                    if (item != null)
                    {
                        maxCoeff = Math.Max(maxCoeff, item.Coeff);
                    }
                }
            }

            // Bit 0: Water. If water is present but NO other structs (1-11), then it is Open Water (Type 0).
            bool hasWater = (voxelBitmask & 1) != 0;
            if (hasWater && !foundAnyStruct)
            {
                var item = profile.Items.FirstOrDefault(x => x.StructType == 0);
                if (item != null)
                {
                    maxCoeff = Math.Max(maxCoeff, item.Coeff);
                }
            }
            
            // If no match found or coeff is 0? 
            // If struct exists but has 0 coeff in profile, maxCoeff remains 0 (if init 0).
            // But if NO structs found at all (e.g. land, bitmask 0), weight should be 0?
            // "Precompute": Land voxels (Bit 0=0) usually excluded or return 0.
            if ((voxelBitmask & 1) == 0) return 0; // Not water

            return maxCoeff; // Logic: Use Best Structure Affinity found.
        }

        private double CalculateLayerAffinity(int layerId, double baitDepth, double waterDepth)
        {
            if (!_layerAffinities.TryGetValue(layerId, out var profile)) return 1.0;
            
            // 收集所有命中的水层
            var hitLayers = new HashSet<int>();
            
            // 1. 绝对值判断
            DetermineLayerByAbsolute(baitDepth, waterDepth, hitLayers);
            
            // 2. 相对值判断
            DetermineLayerByRelative(baitDepth, waterDepth, hitLayers);
            
            // 3. 从命中的水层中取最大亲和系数
            double maxCoeff = 0.0;
            foreach (int layerType in hitLayers)
            {
                var item = profile.Items.FirstOrDefault(x => x.LayerType == layerType);
                if (item != null)
                {
                    maxCoeff = Math.Max(maxCoeff, item.Coeff);
                }
            }

            return maxCoeff;
        }

        /// <summary>
        /// 通过绝对值判断水层
        /// </summary>
        private void DetermineLayerByAbsolute(double baitDepth, double waterDepth, HashSet<int> hitLayers)
        {
            double surfaceLimit = _affinityConst.WaterTopLayerHeight;
            double bottomLimit = _affinityConst.WaterBottomLayerHeight;
            double distToBottom = waterDepth - baitDepth;

            // 饵的深度 - 表层最小厚度 <= 0 → 表层
            if (baitDepth <= surfaceLimit)
            {
                hitLayers.Add(1); // Surface
            }
            // 饵的深度 - 表层最小厚度 > 0
            else
            {
                // 饵距水底距离 - 底层最小厚度 <= 0 → 底层
                if (distToBottom <= bottomLimit)
                {
                    hitLayers.Add(3); // Bottom
                }
                // 饵距水底距离 - 底层最小厚度 > 0 → 中层
                else
                {
                    hitLayers.Add(2); // Middle
                }
            }
        }

        /// <summary>
        /// 通过相对值判断水层
        /// </summary>
        private void DetermineLayerByRelative(double baitDepth, double waterDepth, HashSet<int> hitLayers)
        {
            if (waterDepth <= 0) return; // 避免除零

            double surfaceRatio = _affinityConst.WaterTopLayerRatio;
            double bottomRatio = _affinityConst.WaterBottomLayerRatio;
            double relativeDepth = baitDepth / waterDepth;
            double distToBottom = waterDepth - baitDepth;
            double relativeDistToBottom = distToBottom / waterDepth;

            // 饵的相对深度 - 表层深度比例 <= 0 → 表层
            if (relativeDepth <= surfaceRatio)
            {
                hitLayers.Add(1); // Surface
            }
            // 饵的相对深度 - 表层深度比例 > 0
            else
            {
                // (饵距水底距离 / 最大深度) - 底层深度比例 <= 0 → 底层
                if (relativeDistToBottom <= bottomRatio)
                {
                    hitLayers.Add(3); // Bottom
                }
                // > 0 → 中层
                else
                {
                    hitLayers.Add(2); // Middle
                }
            }
        }

        private double CalculateWeatherAffinity(int weatherId, double pressureSensitivity)
        {
            if (!_weatherFactors.TryGetValue(weatherId, out var weather)) return 1.0;
            
            // Weather PressureInfluence is int, e.g. 10000. 
            double influence = weather.PressureInfluence / 10000.0;
            // Pressure Activity = Influence ^ Sensitivity
            if (influence <= 0) return 0; // Avoid NaN
            return Math.Pow(influence, pressureSensitivity);
        }

        private double CalculatePeriodActivity(int coeffGroup, string periodKey)
        {
            int periodId = GetPeriodId(periodKey);
            if (_periodGroups.TryGetValue(coeffGroup, out var list))
            {
                var match = list.FirstOrDefault(p => p.PeriodId == periodId);
                if (match != null) return match.PeriodActivityFactor;
            }
            return 1.0;
        }
        
        private int GetPeriodId(string key)
        {
            switch(key)
            {
                case "period6_9": return 101060001;
                case "period9_12": return 101060002;
                case "period12_15": return 101060003;
                case "period15_18": return 101060004;
                case "period18_21": return 101060005;
                case "period21_24": return 101060006;
                case "period0_3": return 101060007;
                case "period3_6": return 101060008;
                default: return 0;
            }
        }
    }
}

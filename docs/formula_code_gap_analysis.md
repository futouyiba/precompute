# 预计算公式 vs 代码实现差异分析 (Formula vs Code Gap Analysis)

本文档对比 `data_formula.md` (算法规范) 与 `0precomputeDemo.ipynb` (当前代码 V2) 之间的实现差异，并标记待办事项。

## 1. 核心合成公式 (Core Synthesis)

| 项目 | 规范描述 (`data_formula.md`) | 当前代码 (`0precomputeDemo.ipynb` Cell 18) | 状态 | 差异/待办 |
| :--- | :--- | :--- | :--- | :--- |
| **合成公式** | `max(Temp * Struct * Layer * Weather * Period, min_threshold)` | `Struct * Temp` | ⚠️ 部分 | 缺失 Layer, Weather, Period, MinThreshold |
| **基础权重** | `prob_weight_ideal * EnvCoeff` | 未实现 | ❌ 缺失 | 尚未引入 `df_fish_release['probWeightIdeal']` 参与计算 |

## 2. 因子详细分析

### 2.1 水温亲和 (Temp Affinity)

| 参数/逻辑 | 规范来源 | 当前实现 | 差异 |
| :--- | :--- | :--- | :--- |
| **计算公式** | 高斯函数 (Gaussian) | 高斯函数 (Gaussian) | ✅ 一致 |
| **全局温差忍耐系数** | `EnvAffinityConst.TEMP_TOLERANCE_WIDTH` | `WIDTH_CONST = 50.0` (Hardcoded) | ⚠️ **待修正**: 需从 JSON 常量表读取 |
| **底层温度** | `PondList.hypolimnion_t` | `BOTTOM_T = 10.0` (Hardcoded) | ⚠️ **待修正**: 需从 Pond 配置读取 |
| **表层温度** | 场景输入 (Scenario Input) | `SURFACE_T = 25.0` (Hardcoded) | ⚠️ **待修正**: 需对接场景输入接口 |
| **最大深度** | `MapBasic.water_max_z` | 未明确使用 (隐含在归一化中) | ⚠️ **待修正**: 需从 Map 配置读取以计算梯度 |
| **阈值截断** | `< temp_threshold` -> 0 | 未实现 | ❌ 缺失 |

### 2.2 结构亲和 (Struct Affinity)

| 参数/逻辑 | 规范来源 | 当前实现 | 差异 |
| :--- | :--- | :--- | :--- |
| **计算逻辑** | 匹配 struct_type 取 coeff | Bitmask 迭代 + 广播取最大值 | ✅ 一致 (语义一致) |
| **结构ID映射** | `struct_type` | 假设 `BitIndex == StructID` | ⚠️ **需验证**: 确认 JSON ID 与 Bitmask 位置的对应关系 |

### 2.3 觅食水层亲和 (Layer Affinity)

| 参数/逻辑 | 规范来源 | 当前实现 | 差异 |
| :--- | :--- | :--- | :--- |
| **计算逻辑** | 复杂判定 (Top/Mid/Bot) 基于深度 | 仅有 `m_layer` 数据准备，无计算逻辑 | ❌ **完全缺失**: 需实现 `calc_layer_affinity(depth_map, consts)` |
| **判定参数** | `WATER_TOP_LAYER_HEIGHT` 等 4 个常量 | 未读取 | ❌ 缺失 |

### 2.4 天气亲和 (Weather Affinity)

| 参数/逻辑 | 规范来源 | 当前实现 | 差异 |
| :--- | :--- | :--- | :--- |
| **计算逻辑** | `pressure_influence ^ pressure_sensitivity` | 未实现 | ❌ **完全缺失**: 需引入 Weather 配置 |

### 2.5 时段亲和 (Period Affinity)

| 参数/逻辑 | 规范来源 | 当前实现 | 差异 |
| :--- | :--- | :--- | :--- |
| **数据关联** | `Fish -> Env -> Period` | 已实现 DataFrame 构建 (`df_period_final`) | ✅ 数据已备好 |
| **计算应用** | 参与最终乘法 | 未参与 | ⚠️ **待集成**: 需将 DataFrame 转为 Matrix 或直接广播乘入 |

## 3. 立即行动建议 (Action Items)

1.  **参数参数化**: 将 Cell 18 中的 Hardcoded 常量 (`50.0`, `25.0`, `10.0`) 替换为从 `EnvAffinityConst` 和 `PondList` 读取的变量。
2.  **实现 Layer 逻辑**: 从 `EnvAffinityConst` 读取水层判定参数，编写 `calculate_layer_mask(depth_map)` 函数。
3.  **集成 Period**: 将 `df_period_final` 转换为与 Fish 维度对齐的向量/矩阵，乘入总公式。
4.  **引入 Weather**: 模拟一个 `current_pressure` 输入，并读取 `pressure_sensitivity` 进行计算。

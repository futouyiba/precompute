# 预计算实现待办清单 (Precompute Implementation Todo)

本文档用于追踪 `0precomputeDemo.ipynb` 对于 `technical_guide.md` 的实现进度，记录逻辑完成度、需决策细节及长期规划。

## 0. 已完成逻辑 (Completed Logic)

以下逻辑已在 `0precomputeDemo.ipynb` 中实现：

- [x] **数据源与环境建立 (Setup)**
    - 创建 `0precomputeDemo.ipynb` 作为实验环境。
    - 引入 `pandas`, `numpy`, `json` 等基础库。

- [x] **链式数据采集 (Chained Collection)**
    - [x] `SceneID` 解析与 `MapID` 查找 (`map_scene.json`)。
    - [x] 关联 `Pond` 配置 (`fish_pond_list.json`)。
    - [x] 关联 `Stock` 配置 (`fish_stock.json`)。
    - [x] 遍历并展开 `Release` 配置 (`stock_release.json`, `fish_release.json`)。

- [x] **鱼种数据组装 (Species Data Assembly)**
    - [x] 构建 `stockFishesPd` DataFrame，每一行代表一个 Release 实例。
    - [x] **亲和度数据关联 (Enrichment)**：
        - 关联 `EnvAffinity` (`fish_env_affinity.json`)，提取 StructId, TempId, LayerId 等。
        - 级联查找 `StructAffinity`, `TempAffinity`, `WaterLayerAffinity` 并回填至 DataFrame。
        - 关联 `BaitAffinity` 与 `PeriodAffinity` (Bait/Period List)。

---

## 1. 待办逻辑 (Missing Logic - To Do)

`technical_guide.md` 中定义的**核心批量计算 (Batch Calculation)** 尚未开始：

### 1.1 数据矩阵化转换 (Matrix Conversion)
- [ ] **转换目标**：将 DataFrame 中的 `layerList` (List of Dict), `structList` 等字段转换为高效的 `numpy.ndarray` 查找表。
- [ ] **决策 (2026-01-08)**：使用 **稠密矩阵 (Dense Matrix)**。
    - `StructAffinityMatrix`: shape `[NumFishQualities, NumStructTypes]`, dtype `float16`
    - `LayerAffinityMatrix`: shape `[NumFishQualities, NumLayerTypes]`, dtype `float16`
    - `TempAffinityParams`: shape `[NumFishQualities, 3]` (Fav, Ratio, Threshold)

### 1.2 环境体素数据加载 (Voxel Data Loading)
- [ ] **加载逻辑**：实际读取 `Fishing_xxxx_Global.npy` 文件。
- [ ] **解析逻辑**：根据 `VoxelMapDataFormat.md` 解析各 Channel/Bitmask (如 `struct_slots`, `depth_layer` 等)。
- [ ] **对齐**：确保 Voxel 坐标系与计算网格对齐。

### 1.3 核心亲和度计算 (Core Affinity Calculation)
- [ ] **结构亲和度 (AffStruct)**
    - 算法：`affStruct[x,y,z,f] = max_{slot} ( PrefStruct[f, struct_slots[x,y,z,slot]] )`
    - 细节：处理 `struct_slots == -1` (空槽位) 的情况，避免索引越界。
    - 决策：优先实现 **Plan A (Gather)**。
- [ ] **温度亲和度 (AffTemp)**
    - 算法：基于深度层 `y` 插值得到 `T_depth[y]`，再应用高斯公式计算亲和度。
    - 公式：`exp( - (T - T_fav)^2 / (Width * Ratio^2) )`
- [ ] **水层亲和度 (AffFeedLayer)**
    - 算法：直接通过 `layer_id` 索引查找。

### 1.4 广播与合成 (Broadcasting & Synthesis)
- [ ] **合成公式**：`EnvCoeff = max( Π(Ci), min_env_threshold )`。
- [ ] **最终权重**：`W = BaseWeight * EnvCoeff`。
- [ ] **广播**：利用 NumPy Broadcasting 机制将 `(y, f)`, `(x, z, f)` 等维度的中间结果扩展到 `(x, y, z, f)`。

---

## 2. 也是决策与细化的技术细节 (Details & Decisions Log)

### 2026-01-08 确认项
- [x] **矩阵化方案**：使用 **稠密矩阵 (Dense Matrix)**，无需过度优化。
- [x] **缺失数据的默认行为**：**严格报错 (Error Out)**，配置完整性必须保证。
- [x] **内存管理策略**：统一使用 **`float16`**。
    - 估算：`500x50x500x30` 规模下约 **715 MB**，无需分块。
- [x] **min_env_threshold 来源**：**单鱼独立配置 (Per-Fish Config)**，非全局常量。

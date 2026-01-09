# 预计算实现待办清单 (Precompute Implementation Todo)

本文档用于追踪 `0precomputeDemo.ipynb` 对于 `technical_guide.md` 的实现进度，记录逻辑完成度、需决策细节及长期规划。

## 0. 已完成逻辑 (Completed Logic)

以下逻辑已在 `0precomputeDemo.ipynb` 中实现：

### 阶段一：数据采集与组装 (Ingestion & Assembly)
- [x] **数据源与环境建立 (Setup)**
- [x] **链式数据采集 (Chained Collection)**
    - [x] `SceneID` 解析与 `MapID` 查找 (`map_scene.json`)。
    - [x] 关联 `Pond` 配置与 `Stock` 配置。
    - [x] 遍历 `Release` 配置。
- [x] **鱼种数据组装 (Species Data Assembly)**
    - [x] 构建 `stockFishesPd` DataFrame。
    - [x] 级联查找与数据回填 (Env/Struct/Temp/Layer)。
    - [x] **时段亲和度 (Period Affinity)**: 实现四表级联 (`FishRelease` -> `Stock` -> `Env` -> `Period`) 并构建 DataFrame。


### 阶段二：核心批量计算 (Core Calculation)
- [x] **数据矩阵化/DataFrame化 (Matrix/DataFrame Conversion)**
    - [x] 实现 DataFrame -> Dense Matrix 的转, 并在 Markdown 中明确了 DataFrame 的中间态定义。
    - [x] **重构 (2026-01-09)**: `build_dense_matrices` 内部先构建 Struct/Layer/Temp DataFrame，再导出 Matrix。
- [x] **环境体素数据加载 (Voxel Data Loading)**
    - [x] 读取 `Global.npy`。
    - [x] **修正 (2026-01-09)**: 确认 Voxel 格式为 Dense 3D `[X, Y, Z]` (Int32 Bitmask)，不再使用 `[X, Z, 3]` 假设。
    - [x] **Bitmask 解析**: 实现了基于 Bit-wise Iteration 的亲和度计算逻辑，以解决 Bitmask 到 StructID 的匹配问题。
- [x] **核心亲和度计算 (Core Affinity Calculation)**
    - [x] **StructAffinity**: 实现了基于 Bitmask 迭代 (`For Bit in 0..11`) 的向量化计算。
    - [x] **TempAffinity**: 实现了基于 Y 轴归一化深度的广播计算。
    - [x] **Synthesis**: `EnvCoeff = AffStruct * AffTemp`。

---

## 1. 待办逻辑 (Missing Logic - To Do)

### 1.1 验证与工程化 (Validation & Engineering)
- [ ] **数值验证**: 检查输出的 `EnvCoeff` 是否在合理范围 (0.0 - 1.0)。
- [ ] **Bitmask Mapping 验证**: 确认 `struct_affinity.json` 中的 StructType ID (0-11) 是否严格对应 Voxel Bitmask 的 Bit 0-11。
- [ ] **坐标系对齐**: Unity (X, Y, Z) vs NumPy (Dim0, Dim1, Dim2)。通常 Unity Y 是 Up，NumPy Dim1 是 Y。需验证方向是否一致 (Top vs Bottom)。
- [ ] **LayerAffinity**: 目前代码中尚未包含 `AffFeedLayer` 的计算（需从 Y 轴推导 LayerID）。
- [ ] **MinThreshold**: 尚未应用 `min_env_threshold` 截断。

### 1.2 长期规划 (Future)
- [ ] **GPU 加速**: 迁移至 CuPy/Torch。
- [ ] **流式处理**: 支持超大地图分块计算。
- [ ] **全局配置组装 (Global Assembly Optimization)**: 将 `Fish * Struct` 的 DataFrame 组装逻辑提升为全局一次性计算（全鱼种），避免针对每个 Pond/Stock 重复组装。

---

## 2. 也是决策与细化的技术细节 (Details & Decisions Log)

- [x] **矩阵化方案**：稠密矩阵 (Dense Matrix) + 中间层 DataFrame。
- [x] **Voxel 格式**：使用 3D Dense Array (`int32` Bitmask)。
- [x] **Struct 匹配**：假设 StructType ID = Bit Index。
- [x] **缺失数据处理**：严格报错 (Error Out)。

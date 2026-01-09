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

### 阶段二：核心批量计算 (Core Calculation)
- [x] **数据矩阵化转换 (Matrix Conversion)**
    - [x] 实现 DataFrame -> Dense Matrix (`StructMatrix`, `LayerMatrix`, `TempParams`) 的转换函数 `build_dense_matrices`。
    - [x] 使用 `float16` 节省显存。
- [x] **环境体素数据加载 (Voxel Data Loading)**
    - [x] 读取 `Global.npy`。
    - [x] 初步解析 `struct_slots` (Channel 0-2) 和 `depth_map` (Channel 3)。(注：Channel定义为Demo假设，需后续根据具体Format微调)。
- [x] **核心亲和度计算 (Core Affinity Calculation)**
    - [x] **StructAffinity**: 实现了基于 `Gather` + `Max` 的向量化计算。
    - [x] **TempAffinity**: 实现了基于深度插值 + 高斯函数的向量化计算。
    - [x] **Synthesis**: 实现了简单的广播乘法 (`EnvCoeff = AffStruct * AffTemp`)。

---

## 1. 待办逻辑 (Missing Logic - To Do)

### 1.1 验证与工程化 (Validation & Engineering)
- [ ] **数值验证**: 检查输出的 `EnvCoeff` 是否在合理范围 (0.0 - 1.0)。
- [ ] **形状对齐**: 确认 Voxel 坐标系 (X, Z) 与 Unity 如果有偏移需要处理。
- [ ] **LayerAffinity**: 目前代码中尚未包含 `AffFeedLayer` 的计算（虽矩阵已准备），需补全。
- [ ] **MinThreshold**: 尚未应用 `min_env_threshold` 截断。

### 1.2 长期规划 (Future)
- [ ] **GPU 加速**: 迁移至 CuPy/Torch。
- [ ] **流式处理**: 支持超大地图分块计算。

---

## 2. 也是决策与细化的技术细节 (Details & Decisions Log)

- [x] **矩阵化方案**：稠密矩阵 (Dense Matrix)。
- [x] **缺失数据处理**：严格报错 (Error Out)。
- [x] **内存管理**：使用 `float16`。
- [x] **阈值配置**：单鱼独立配置。

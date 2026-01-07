# 地图体素数据格式文档 (Map Voxel Data Format)

本文档描述了 Unity 导出工具 `EnvTileExportCfg` 生成的地图体素数据格式。该数据用于服务端或客户端的离线计算（如中鱼概率预计算）。

## 1. 目录结构

导出数据按场景（Scene）名称归档，包含一个元数据文件和若干二进制数据文件：

```
/ExportedData
  /SceneName_MapID
    ├── map_data.json          # 核心元数据索引
    ├── SceneName_Global_Data.npy    # 全局地图 - 数据块
    ├── SceneName_Global_Index.npy   # 全局地图 - 索引块
    ├── SceneName_LocalXXX_Data.npy  # 局部池 - 数据块
    └── SceneName_LocalXXX_Index.npy # 局部池 - 索引块
```

## 2. 元数据格式 (map_data.json)

JSON 文件描述了地图 ID、全局配置以及各图层的物理属性。

```json
{
  "mapID": 101,
  "timestamp": "2023-10-27 10:00:00",
  "global": { ...MapLayerData... },
  "locals": [
    { ...MapLayerData... },
    { ...MapLayerData... }
  ]
}
```

### MapLayerData 结构

| 字段 | 类型 | 说明 | 示例 |
| :--- | :--- | :--- | :--- |
| `name` | string | 图层名称 | "Global" 或 "Local_Pond_1" |
| `type` | string | 类型标识 | "Global" 或 "LocalStock" |
| `format` | string | 数据存储格式 | **"block_sparse"** (分块稀疏) |
| `blockSize` | int | 稀疏块尺寸 | **16** (即 16x16x16) |
| `dataFile` | string |体素数据文件名 | "Map_Global_Data.npy" |
| `indexFile` | string | 块索引文件名 | "Map_Global_Index.npy" |
| `blockCount` | int | 非空块数量 | 1024 |
| `origin` | float[3] | 包围盒最小点 (Min) | [-500.0, -20.0, -500.0] |
| `step` | float[3] | 采样步长 | [1.0, 0.5, 1.0] (Global) 或 [0.25, 0.5, 0.25] (Local) |
| `dim` | int[3] | 整体网格分辨率 | [1000, 40, 1000] |

---

## 3. 数据存储格式 (Block Sparse)

为优化稀疏水域数据的存储效率，采用 **Block Sparse (分块稀疏)** 格式。
数据被分为两个 `.npy` (NumPy) 文件存储。

### A. 索引文件 (`*_Index.npy`)
*   **Shape**: `[N, 3]` (N = blockCount)
*   **DType**: `int32`
*   **内容**: 记录了 N 个非空 Block 在网格中的**块坐标** `(BlockX, BlockY, BlockZ)`。
*   **计算**: 如果一个体素的坐标是 `(gx, gy, gz)`，它所属的块坐标是 `(gx/16, gy/16, gz/16)`。

### B. 数据文件 (`*_Data.npy`)
*   **Shape**: `[N, 16, 16, 16]` (N = blockCount, BlockSize = 16)
*   **DType**: `int32`
*   **内容**: 存储了上述 N 个 Block 内部的完整稠密体素数据。
*   **对应关系**: `Index` 数组的第 `i` 行对应 `Data` 数组的第 `i` 个 Block。

### C. 读取逻辑 (伪代码)

```python
# 加载
index_list = load_npy("Index.npy") # [N, 3]
data_list  = load_npy("Data.npy")  # [N, 16, 16, 16]

# 查询世界坐标 (wx, wy, wz) 的值
def get_voxel(wx, wy, wz):
    # 1. 物理坐标 -> 网格坐标
    gx = int((wx - origin.x) / step.x)
    gy = int((wy - origin.y) / step.y)
    gz = int((wz - origin.z) / step.z)
    
    # 2. 网格坐标 -> 块坐标 + 块内偏移
    bx = gx // 16
    by = gy // 16
    bz = gz // 16
    
    lx = gx % 16
    ly = gy % 16
    lz = gz % 16
    
    # 3. 查找块 (建议构建 Hash Map 优化查询)
    block_id = find_index(index_list, [bx, by, bz])
    if block_id == -1:
        return 0 # 空块，默认值
    else:
        return data_list[block_id][lx][ly][lz]
```

---

## 4. 体素位掩码 (Bitmask) 定义

体素值 (`int32`) 是一个位掩码，包含该位置的所有物理属性。

| 位 (Bit) | 10进制 | 宏定义 | 说明 |
| :--- | :--- | :--- | :--- |
| **0** | 1 | `FLAG_WATER` | **有效水域** (必须具备此标记才是合法钓点) |
| **1** | 2 | `FLAG_WATER_GRASS` | 水草区 |
| **2** | 4 | `FLAG_STONE` | 石头区 |
| **3** | 8 | `FLAG_DRIFTWOOD` | 浮木区 |
| **4** | 16 | `FLAG_PIER` | 码头/栈桥附近 |
| **5** | 32 | `FLAG_DEEP_PIT` | 深坑结构 |
| **6** | 64 | `FLAG_RIDGE` | 坎结构 |
| **7** | 128 | `FLAG_FAULT` | 断层结构 |
| **8** | 256 | `FLAG_ROCK_SHELF` | **乱石底/石架** |
| **9** | 512 | `FLAG_BAY` | 湾结构 |
| **10** | 1024 | `FLAG_MUD` | 泥底 |
| **11** | 2048 | `FLAG_GRAVEL` | 碎石底 |

**注意**：
1. `FLAG_WATER (Bit 0)` 是基础。如果为 0，表示该位置是空气、地面或被剔除的非法区域。
2. 多个属性可能共存，例如 `3 (1 | 2)` 表示 "有水草的水域"。

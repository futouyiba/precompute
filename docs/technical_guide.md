# 派生环境场 v1（Derived Fish Environment Field）


> **定位说明**
> 派生环境场不是“环境因子描述”，而是一组 **以鱼为主体索引的鱼数据场** 。
> 环境仅作为输入条件，最终产物服务于“某鱼在某空间位置的权重/可用性评估”。

---

## 前言：为什么要先做原型（Prototype First）

在当前阶段选择 **先行原型（Prototype First）** ，而非一次性直接落到最终工程实现，主要基于以下现实约束与效率考量。

### 时间与交付压力

* 距离产品正式上线已 **不足六个月** ，期间还将经历 **农历新年等长假** ，可用于连续开发的有效工期被进一步压缩。
* 同期需要完成的工作不仅包括：
  * 多项核心功能（Feature）的持续开发 见[中鱼0.3-预计算+实时计算+校验方案](https://pisn3u3ony2.feishu.cn/wiki/Pk5Swm7SwiOvelkB4Egcnidonpd#share-GRsIddcmaoQWEEx6I4ycMNv4nnh)章节
  * 性能优化与稳定性提升，需要实装、试玩、迭代
  * **结构性调整**

在此背景下，若直接以最终工程规格推进，整体风险与返工成本都将显著升高。

### 原型的核心价值

原型阶段的目标，并不是“做一个临时版本”，而是 **系统性地降低两个关键成本** ：

1. #### 信息传递成本

* 当前中鱼算法涉及：策划、数值、工程多角色协作
* 复杂算法若仅通过文档或口头说明传递，容易出现：
  * 理解偏差
  * 信息丢失
  * 多轮来回确认

通过原型：

* 将算法逻辑**转化为可运行、可验证的形式**
* 显著降低策划 → 工程、设计 → 实现之间的沟通成本和摩擦
* 帮助工程师更快“看懂整体结构”，而不是逐条消化抽象描述

2. #### 技术试错与验证成本

* 当前设计中包含多项 **关键技术决策** ：
  * 张量维度设计
  * gather / broadcast 的计算路径
  * 不同结构优化方案（如结构亲和度方案 A / B）
* 若这些决策在正式工程阶段才被验证，一旦方向不合适，调整代价极高

通过原型：

* 尽早将**算法层完整跑通**
* 提前暴露性能瓶颈、数据规模问题与实现难点
* 为后续工程实现争取：
  * 更充分的优化空间
  * 更低风险的方案选择

> **总结** ：原型并不是额外成本，而是为了在高压周期下， 用最小代价换取最大的信息清晰度与决策确定性。

## 0. 目标与核心产物

 **派生环境场** （Derived Fish Environment Field）由静态地图数据与动态场景参数推导得到，用于描述在给定环境条件下，各鱼种在空间中的权重分布。

**v1（里程碑 1）的核心产物：**

* **环境权重张量** `W[x, y, z, f]`

其中：

* `x, z`：水平采样网格坐标
* `y`：深度层索引（Depth Layer）
* `f`：鱼种（Fish Type）

该张量是后续：

* 中鱼抽样
* 鱼状态派生
* 行为/策略计算

的重要输入资产。

> 语义来源：本文档在算法语义层面继承
> 《中鱼算法 0.2.2.1（Sprint1）- 拟真权重》中的定义：
> **单点·单鱼权重 = 基础权重 × 环境系数 × 适配系数** ，
> v1 仅覆盖其中“环境系数/环境权重张量”的空间化与批量化。

---

1. ## 批量计算与统一计算范式（Prototype v1 设计思想）

在 v1 中，整体采用如下统一计算范式：

链式采集 JSON 配置

    ↓

组装 DataFrame（鱼种习性 / 配置）

    ↓

转换并组装 ndarray（unity导出地形因子+处理）

    ↓

并行计算各环境因子场（批量）

    ↓

广播对齐并逐点相乘

    ↓

得到环境权重张量 W[x,y,z,f]

v1 采用 **链式采集****json**** + 组装ndarray + 批量计算因子 + 广播相乘** 的统一计算范式。

### 0.1 为什么批量计算

1. **计算效率提升**
   1. 充分利用 CPU 的 SIMD 指令集
   2. 连续内存布局使缓存（L1/L2/L3）更易命中
   3. 避免 Python 层循环带来的调度开销
2. **内存****访问更加友好**
   1. 数据在内存中的分布更加规则
   2. 降低随机访问与指针跳转成本
3. **并行****与硬件加速友好**
   1. 易于通过多核 CPU 并行（如 Numba `prange`）
   2. 为后续迁移到 GPU（CUDA / CuPy / JAX / PyTorch）提供天然计算形态
4. **算法结构清晰**
   1. 因子分解 + 广播相乘的模式
   2. 有利于后续增减环境因子，而不破坏整体结构

#### 后续可行的优化方向（非 v1 范围）

* CPU 侧：
  * Numba JIT 编译
  * 多进程 / 多线程并行
* GPU 侧：
  * CuPy / JAX / PyTorch 张量化计算
  * CUDA kernel 定制（如结构亲和度 gather + max）
* 数据层：
  * 结构组合去重（Struct Key Table）
  * 分块计算与流式加载（Chunk / Tile）

> **结论** ：批量计算不是实现细节，而是 v1 原型阶段最重要的结构性决策之一。

### 1.0 链式采集json + 组装ndarray

（目前用链式采集json + 组装ndarray的方式进行）

原型代码中通过链式查找wolong产生的json，跑通了从sceneId→map→pond→stock→release & env affinity → temp → fav_temp 类似的流程。

![](https://pisn3u3ony2.feishu.cn/space/api/box/stream/download/asynccode/?code=ZWIxOWFhMDE3Y2EwODgwOWExZjA5YzYyOWFkZDQ4ZDZfOGd4aTAzWVJyZVdRemNEVTBoWXJqeTRwdFJqQ0RSUHdfVG9rZW46S1lHdmJBNzRJb21vMWZ4eEJnTmNyYmZjbnRkXzE3Njc4Njk4Mjg6MTc2Nzg3MzQyOF9WNA)

![](https://pisn3u3ony2.feishu.cn/space/api/box/stream/download/asynccode/?code=Y2I5NTY1YTkyZDYzNjQzYWYzMjA3NTRlODQ4MmZkYWVfRWYxUVNFY3FuekF4azlMZFNUTEJ1UzlGcEpmaEdLZzRfVG9rZW46WU8wU2JBSnRub2pSNVR4YzdTbWNyd0k2bnJmXzE3Njc4Njk4Mjg6MTc2Nzg3MzQyOF9WNA)

在原型阶段，需要首先解决一个现实问题：

> **我们如何获得构建这些 DataFrame 与 ndarray 所需的数据？**

#### 当前的客观限制

* 在正式中鱼计算流程中，后端使用的部分配置数据：
  * 无法直接在本地或策划侧获取
* 进场界面中可见的天气列表、场景参数：
  * 尚未以可复用的数据接口形式暴露

因此，在原型阶段，需要采用 **替代性的数据获取与组装方案** 。

#### 原型阶段的两种可行方案

方案一：重新制作解析与映射逻辑

* 针对现有配置与规则：
  * 编写一套独立的解析与映射方法
  * 人工或半自动地将其转化为原型所需的数据结构

**特点：**

* 实现直接、可控
* 但需要维护一套“临时解析逻辑”，存在重复劳动

方案二：基于 Wolong 的配置链式组装（当前优先设想）

* 以现有配置表体系为基础
* 利用 Wolong 在编译阶段生成的 JSON 数据
* 通过**链式查找与组合**的方式：
  * 还原中鱼算法实际使用的参数集合
  * 进一步组装为：
    * `DataFrame`（用于鱼种习性、标量配置管理）
    * `ndarray`（用于环境因子与权重的批量计算）

**特点：**

* 与真实配置来源保持高度一致
* 更利于后续从原型平滑过渡到正式工程实现

### 1.1 总体公式

```Plain
W[x,y,z,f] = BaseWeight[f] * EnvCoeff[x,y,z,f]
```

其中：

```Plain
EnvCoeff = max( Π Ci , min_env_threshold )
```

* `Ci`：各环境亲和度因子（温度、结构、水层等）
* `min_env_threshold`：环境下限阈值（与 Sprint1 语义一致）

### 1.2 广播原则

* 每个环境因子 `Ci` 可以只依赖于维度子集，例如：
  * `(y, f)`：仅随深度与鱼种变化（如水温）
  * `(x, z, f)`：仅随平面位置与鱼种变化（如结构）
  * `(x, y, z, f)`：完全空间化因子
* 通过 NumPy 广播机制，所有 `Ci` **无损对齐** 到 `(x,y,z,f)` 维度后逐点相乘。

### 1.3 数值语义约束

* 各环境亲和度因子 `Ci ∈ [0,1]`
* `BaseWeight[f]` 表示鱼种在钓场中的 **基础丰度/规模** ，
  * 数值可远大于 1（常见 10³–10⁴）
  * 非概率含义
  * 考虑用浮点数形式，因浮点数特别适合我们的设计目的
* 如有需要，可在预计算阶段对 `BaseWeight` 做统一缩放（如 ÷100），以改善数值范围与存储精度

---

2. ## 输入类型分类（v1）

### 2.1 Scenario Scalars（场景标量）

来自当前时段/天气的少量标量输入：

* `surface_t`：表层水温
* `air_pressure`：气压
* `time_of_day`：时段
* 其他来源的，例如底层温度、最大深度，以及水层相关的配置常量，等等

> 特点：数量少、全局共享、通常不随空间变化

---

### 2.2 Species Scalars（鱼种标量 dataframe）

以 **DataFrame** 形式管理，**行(Index)为鱼种(Release/Species)，列(Columns)为各项标量参数**：

* `temperature_fav`：最适温度
* `temperature_affected_ratio`：温度敏感系数
* （可选）阈值：`T_min`, `T_max`

> 组装、管理时使用 DataFrame，进入计算内核前统一转换为 `ndarray`

---

### 2.3 Species × Factor Matrices（鱼种 × 因子二维表）

以 **DataFrame** 形式构建与检索（**行=鱼种，列=因子类型**），进入计算内核时转换为稠密 **ndarray (float16/32)**：

* `PrefStruct` (Fish × StructType)：结构亲和度 DataFrame
* `PrefFeedLayer` (Fish × LayerType)：水层亲和度 DataFrame
* ……

> 该类数据在逻辑层为“查找表(DataFrame)”，在计算层转化为矩阵，通过 **索引（gather）** 使用。

---

### 2.4 Period Affinity DataFrame (Fish × Period)

以 **DataFrame** 形式构建（**行=ReleaseId，列=Period信息**），用于建立鱼种与时段活跃度的关联：

* `PeriodActivityFactor` (Fish × PeriodId)：时段活跃度系数

> 该数据通过级联 `FishRelease -> StockRelease -> FishEnv -> PeriodAffinity` 获得。

---

3. ## 例子 A：结构亲和度（affStruct）

### 3.1 前置约束（v1 硬约束）

* 结构类型总数 `K ≈ 15` （目前还没有石质底等，因此大约13种）
* **任一空间点同时存在的结构类型数 ≤ 3**
* 多结构合成规则：取最大值（set → max）

---

### 3.2 结构表示方式（索引槽）

```Plain
struct_slots[x,y,z,slot]
slot ∈ {0,1,2}
```

* 每个槽存放一个 `structTypeId`
* 若该槽为空，则为 `-1`
* 明确 **不使用 one-hot 展开**

---

### 3.3 方案 A：逐点 gather + max（v1 默认）

**计算规则：**

```Plain
affStruct[x,y,z,f] = max over slot (
    PrefStruct[f, struct_slots[x,y,z,slot]]
)
```

* 忽略 `struct_slots == -1` 的槽位

**计算复杂度：**

```Plain
O(P × F × S)
P = X × Y × Z
S = 3
```

**特点：**

* 实现直观
* 易验证
* 非常适合 Numba 在 CPU 多核上并行

---

### 3.4 方案 B：结构组合去重 + 查表（可切换策略）

**思路：**

* 将每个点的结构集合（≤3 个）排序、去空后编码为 `keyId`
* 对每个唯一 `keyId` 预计算一次：

```Plain
StructCoeffTable[keyId, f]
```

* 回填到各空间点

**组合上限：**

```Plain
C(15,1) + C(15,2) + C(15,3) = 576
```

**计算复杂度：**

```Plain
预计算: O(U × F × S),  U ≤ 576
回填:   O(P)
```

**特点：**

* 在超大空间场景中显著减少重复计算
* 结构维度天然不会爆炸
* 可作为 v1 的可选优化策略

---

4. ## 例子 B：水温亲和度（affTemp，高斯型）

### 4.1 深度温度剖面（线性插值）

对每个深度层 `y`，计算水温：

```Plain
frac = (z_depth[y] - minZ) / (maxZ - minZ)
T_depth[y] = surface_t + (hypolimnion_t - surface_t) * frac
```

> v1 假设：同一深度层在全平面 `(x,z)` 上温度一致

---

### 4.2 高斯型水温亲和度

affTemp[y,f]=exp⁡(−(Tdepth[y]−Tfav[f])2TempToleranceWidth⋅(temperature_affected_ratio[f])2)affTemp[y,f] = \exp\left( - \frac{(T_{depth}[y] - T_{fav}[f])^2} {TempToleranceWidth \cdot (temperature\_affected\_ratio[f])^2} \right)

* `T_fav[f]`：鱼种最适温度
* `temperature_affected_ratio[f]`：温度敏感系数
* `TempToleranceWidth`：全局宽度参数

计算得到的 `affTemp[y,f]` 将通过广播扩展到 `(x,y,z,f)`。

---

5. ## 环境系数与环境权重张量汇总

```Plain
env_raw = affTemp * affStruct * affFeedLayer
EnvCoeff = max(env_raw, min_env_threshold)
W = BaseWeight[f] * EnvCoeff
```

* `affFeedLayer`：觅食水层亲和度（结构同上，略）
* `min_env_threshold`：环境下限阈值

至此，得到 **v1 里程碑产物：环境权重张量 ** **`W[x,y,z,f]`** 。

---

6. ## 备注与扩展方向（非 v1 范围）

* 负面机制（危险、警惕、干扰）将作为**独立因子**建模，不并入结构亲和度
* v2 可引入：
  * 结构距离衰减
  * 非 max 的多结构合成规则
  * 组合 key 扩展到更多离散环境变量

> v1 的目标是： **语义清晰、计算可控、结构可扩展** 。

---

7. ## 全局聚合与空间映射 (Global Aggregation)

### 7.1 多层级空间数据 (Multi-Level Spatial Data)

系统数据被组织为两级结构：
*   **Global Map**：全域基础地形与数据 (Low Res/Base)。
*   **Local Stock Map**：特定鱼群的活动区域 (High Res/Detail)，通常覆盖 Global 的一部分。

数据源由 `map_data.json` 统一描述，关键元数据包括：
*   `origin` (x, y, z): 真实世界坐标原点
*   `step` (dx, dy, dz): 体素步长
*   `dim` (nx, ny, nz): 维度

### 7.2 聚合逻辑 (Aggregation Logic)

为了生成最终的全局环境场，采用了 **Overlay (叠加)** 策略：

1.  **独立计算**：对 Global Chunk 和每个 Local Chunk，分别调用通用的 `Core Calculation` 函数，计算得到各自的 `Biomass Tensor`。
2.  **坐标映射**：
    依循 `Local Index -> World Pos -> Global Index` 的路径：
    ```python
    WorldPos = LocalOrigin + LocalIndex * LocalStep
    GlobalIndex = (WorldPos - GlobalOrigin) / GlobalStep
    ```
3.  **融合 (Fusion)**：
    将映射后的 Local Biomass 叠加到 Global Canvas 上。
    *   *v1 原型*: 采用 Center Projection + Sum/Max 策略。
    *   *v2 优化*: 可引入插值 (Trilinear Interpolation) 或精确的体素重采样 (Voxel Resampling)。

这一机制确保了即使 Local 数据与 Global 数据的分辨率或原点不同，也能在统一的世界坐标系下正确呈现。


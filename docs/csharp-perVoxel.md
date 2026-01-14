# csharp逐点计算说明（预计算）

## 总览说明
我们的目标，是用c#，对于voxel map中的x,y,z个点，分别计算出各个点上f种不同鱼的权重。最后组装成一个[x,y,z,f]的4维数组。

> **注意：本文档是唯一可参考的文档。**
> 请忽略以下 docs 目录下的其他文件，它们可能包含过时或冲突的信息：
> - VoxelMapDataFormat.md
> - affinity_logic_reference.md
> - data_formula.md
> - formula_code_gap_analysis.md
> - precompute_implementation_todo.md
> - proto_guide_csharp_pervoxel.md
> - technical_guide.md
> - weather_example.md
>
> **仅参考本文件 (csharp-perVoxel.md) 进行开发和理解。**

- **环境权重**：预计算得到的所有鱼在空间中各采样点的权重。
- **数据关系说明**  
  - JSON 与表是 **多对一** 的关系  
  - 一张表可包含多个子表  
  - 子表通常会被 **wolong** 编译为一个 JSON  
  - 特殊情况下，一个子表可能会被编译为多个 JSON  

- json数据源： 天气、fish stock、env affinity等配置信息位置（需嵌套式查找）：data\1\1001 地图 全局池、局部池 的 列表、位置原点、步长 信息：Fishing_1006001_Dense_20260107_154037\map_data.json
- 注意： 1. 不使用批量计算、numpy等算法； 2. 不组装json，而是算的时候直接去找配置；但是找完配置之后作一些缓存； 3. （注意，json和表是多对一的关系。一张表有多个子表，子表通常会被wolong编译成一个json，有些情况子表会被编译成多个json） 4. 用c#生态；不用python不使用jupyter notebook

- weather方面： - 我随机取12个weather factor的name。你把它记录起来作为一个字符串序列。 - 查询weather 相关的json配置，找到其id，和name一起放在代码和文档文件里（两边一致，都写上name和id），当成一个序列； - 从天气配置json里取出天气标量，并用以计算温度亲和度、气压亲和度、时段活跃系数。注意其中温度要float，并除以10（鱼的fav温度等等也是），气压系数也需要类似的处理，万分数，请参考数据和公式文档 。 ## 手工选取weather example序列 SS_weather_sunny6_9 SS_weather_sunny9_12 SS_weather_sunny12_15 SS_weather_sunny15_18 SS_weather_cloudy6_9 SS_weather_fine_rain9_12 SS_weather_fine_rain12_15 SS_weather_fine_rain15_18 SS_weather_fine_rain6_9 SS_weather_cloudy9_12 SS_weather_sunny12_15 SS_weather_sunny15_18
---

## 第一层：总的预计算公式

- **某点·某鱼种环境权重**
  - = **此钓场中此鱼种基础权重 × 环境系数**

---

## 第二层：参数来源与计算公式

- **此钓场中此鱼种基础权重**
  - 来源：
    - `fish_pond` 表  
      - `FishRelease` 子表  
        - `prob_weight_ideal` 字段

- **环境系数**
  - 计算公式：
    - `max( 水温亲和系数 × 结构亲和系数 × 觅食水层亲和系数 × 天气亲和系数 × 时段活跃系数 , 最小环境系数阈值 )`
  - **最小环境系数阈值**
    - 来源：
      - `fish_pond` 表  
        - `FishRelease` 子表  
          - `min_env_coeff` 字段

---

## 第三层：各环境参数的详细计算

### 一、水温亲和系数

- **计算公式**
  - `e^(-(饵点温度 - 此鱼种最喜温度)^2 / (全局温差忍耐系数 × 此鱼种温差忍耐系数^2))`

- **饵点温度**
  - 计算公式：
    - `温度 - 温度梯度 × (饵点深度 - 水面深度)`
  - **温度梯度**
    - `(温度 - 底层温度) / (池塘最大深度 - 池塘最小深度)`
    - 参数来源：
      - **温度**：待定（目前尚无课程表）
      - **底层温度**
        - `fish_pond` 表  
          - `PondList` 子表  
            - `hypolimnion_t` 字段
      - **池塘最大深度**
        - `map_info` 表  
          - `MapBasic` 子表  
            - `water_max_z` 字段
      - **池塘最小深度**
        - `map_info` 表  
          - `MapBasic` 子表  
            - `water_min_z` 字段（当前为 0）

- **此鱼种最喜温度**
  - 来源：
    - `fish_env_affinity` 表  
      - `TempAffinity` 子表  
        - `temperature_fav` 字段

- **全局温差忍耐系数**
  - 来源：
    - `fish_env_affinity` 表  
      - `EnvAffinityConst` 子表  
        - `TEMP_TOLERANCE_WIDTH` 字段

- **此鱼种温差忍耐系数**
  - 来源：
    - `fish_env_affinity` 表  
      - `TempAffinity` 子表  
        - `temp_affected_ratio` 字段

- **阈值处理**
  - 若 `水温亲和系数 < 水温接受阈值`，则取值为 **0**
  - **水温接受阈值**
    - 来源：
      - `fish_env_affinity` 表  
        - `TempAffinity` 子表  
          - `temp_threshold` 字段

---

### 二、结构亲和系数

- 来源：
  - `fish_env_affinity` 表  
    - `StructAffinity` 子表  
      - `coeff` 字段
- 计算逻辑：
  - 先判断当前饵点的 `struct_type` 结构类型
  - 再取对应结构类型的 `coeff` 系数

---

### 三、觅食水层亲和系数

- 来源：
  - `fish_env_affinity` 表  
    - `WaterLayerAffinity` 子表  
      - `coeff` 字段

- **水层判定说明**
  - 需要先判断当前饵点所处的 `layer_type` 水层

#### 1. 通过绝对值判断水层
- 若：
  - `饵的深度 - 表层最小厚度 ≤ 0`
    - → 表层
- 若：
  - `饵的深度 - 表层最小厚度 > 0`
    - 再计算：
      - `饵距水底距离 - 底层最小厚度`
        - `> 0` → 中层  
        - `≤ 0` → 底层

#### 2. 通过相对值判断水层
- 若：
  - `饵的相对深度 - 表层深度比例 ≤ 0`
    - → 表层
- 若：
  - `饵的相对深度 - 表层深度比例 > 0`
    - 再计算：
      - `(饵距水底距离 / 最大深度 - 底层深度比例)`
        - `> 0` → 中层  
        - `≤ 0` → 底层

#### 3. 多水层命中处理
- 饵点可能同时满足多个水层判定条件
- 对多个水层结果：
  - **取亲和系数最大的一个**

#### 4. 相关参数定义
- **最大深度**
  - 饵点从水面到水底的距离
- **饵的深度**
  - 饵点到水面的距离  
  - 在派生环境场中：指采样点（计算点）深度
- **相对深度**
  - `饵的深度 / 最大深度`
- **距水底距离**
  - `最大深度 - 饵的深度`
- **表层最小厚度**
  - `fish_env_affinity` 表  
    - `EnvAffinityConst` 子表  
      - `WATER_TOP_LAYER_HEIGHT`
- **表层深度比例**
  - `fish_env_affinity` 表  
    - `EnvAffinityConst` 子表  
      - `WATER_TOP_LAYER_RATIO`
- **底层最小厚度**
  - `fish_env_affinity` 表  
    - `EnvAffinityConst` 子表  
      - `WATER_BOTTOM_LAYER_HEIGHT`
- **底层深度比例**
  - `fish_env_affinity` 表  
    - `EnvAffinityConst` 子表  
      - `WATER_BOTTOM_LAYER_RATIO`

---

### 四、天气亲和系数

- **计算公式**
  - `天气亲和系数 = 光照适应系数 × 气压活跃系数`

- **光照适应系数**
  - 暂不实现
  - 当前固定为 **1**

- **气压活跃系数**
  - 计算公式：
    - `气压激活系数 ^ 气压敏感度`
  - **气压激活系数**
    - 来源：
      - `Weather` 表  
        - `WeatherFactor` 子表  
          - `pressure_influence` 字段
  - **气压敏感度**
    - 来源：
      - `fish_env_affinity` 表  
        - `FishEnvAffinity` 子表  
          - `pressure_sensitivity` 字段

---

### 五、时段活跃系数

- 来源流程：
  1. 从 `fish_env_affinity` 表  
     - `FishEnvAffinity` 子表  
       - 读取 `period_coeff_group` 字段
  2. 使用 `period_coeff_group` 作为 key
  3. 检索：
     - `PeriodAffinity` 子表  
       - `period_activity_factor` 字段

* 枚举定义

## 结构体 (Struct)

| ID | 名称 (Name) | 描述 (Description)   |
| :- | :---------- | :------------------- |
| 0  | OpenWater   | [水下结构体]开放水域 |
| 1  | Grass       | [水下结构体]水草     |
| 2  | Rock        | [水下结构体]石头     |
| 3  | Wood        | [水下结构体]沉木     |
| 4  | Bridge      | [水下结构体]桥墩     |
| 5  | Hole        | [水下结构体]深坑     |
| 6  | Ridge       | [水下结构体]尖脊     |
| 7  | Break       | [水下结构体]断层     |
| 8  | Ledge       | [水下结构体]岩架     |
| 9  | Bay         | [水下结构体]湾子     |
| 10 | Mud         | [水下结构体]泥底     |
| 11 | Gravel      | [水下结构体]碎石底   |

## 水层 (Layer)

| ID | 名称 (Name) | 描述 (Description) |
| :- | :---------- | :----------------- |
| 1  | Surface     | [地图水层]表层     |
| 2  | Middle      | [地图水层]中层     |
| 3  | Bottom      | [地图水层]底层     |

## 时段 (Period)

| ID        | 标识 (Key)  | 描述 (Description) |
| :-------- | :---------- | :----------------- |
| 101060001 | period6_9   | 6～9点时间段       |
| 101060002 | period9_12  | 9～12点时间段      |
| 101060003 | period12_15 | 12～15点时间段     |
| 101060004 | period15_18 | 15～18点时间段     |
| 101060005 | period18_21 | 18～21点时间段     |
| 101060006 | period21_24 | 21～24点时间段     |
| 101060007 | period0_3   | 0～3点时间段       |
| 101060008 | period3_6   | 3～6点时间段       |

# voxel数据当中的bitmask

    private const int FLAG_WATER = 1 << 0;
    private const int FLAG_WATER_GRASS = 1 << 1;
    private const int FLAG_STONE = 1 << 2;
    private const int FLAG_DRIFTWOOD = 1 << 3;
    private const int FLAG_PIER = 1 << 4;
    private const int FLAG_DEEP_PIT = 1 << 5;
    private const int FLAG_RIDGE = 1 << 6;
    private const int FLAG_FAULT = 1 << 7;
    private const int FLAG_ROCK_SHELF = 1 << 8;
    private const int FLAG_BAY = 1 << 9;
    private const int FLAG_MUD = 1 << 10;
    private const int FLAG_GRAVEL = 1 << 11;
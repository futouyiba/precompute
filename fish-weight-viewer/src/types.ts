/**
 * 鱼权重可视化工具 - 类型定义
 */

/** 维度信息 */
export interface Dims {
    x: number;
    y: number;
    z: number;
    f: number;
}

/** 网格信息 */
export interface Grid {
    origin: [number, number, number];
    step: [number, number, number];
}

/** 鱼种信息 */
export interface FishInfo {
    fishId: number;
    name: string;
}

/** 编码信息 */
export interface Encoding {
    dtype: 'uint16' | 'float32';
    scale: number;
    offset: number;
    rowMajor: boolean; // true = 行主序 (x变化最慢)
}

/** 版本信息 */
export interface VersionInfo {
    buildTimeISO: string;
    hash: string;
}

/** meta.json 完整结构 */
export interface MetaData {
    dims: Dims;
    grid: Grid;
    fishList: FishInfo[];
    scenarios?: string[]; // 支持多天气场景
    encoding: Encoding;
    version: VersionInfo;
}

/** 颜色映射模式 */
export type ColorMode = 'AutoP99' | 'GlobalClamp' | 'PerSlice';

/** 视图模式 */
export type ViewMode = '2D' | '3D';

/** 切片轴 */
export type SliceAxis = 'XY' | 'XZ' | 'YZ';

/** 控制面板状态 */
export interface ControlState {
    axis: SliceAxis;
    ySlice: number;
    selectedFishIds: number[];
    selectedScenarioIndex: number; // 当前选中的天气场景
    colorMode: ColorMode;
    vmax: number;
    useLog: boolean;
    useClamp: boolean;
    viewMode: ViewMode;
}

/** 切片统计数据 */
export interface SliceStats {
    min: number;
    max: number;
    p99: number;
    mean: number;
}

/** 缓存键 */
export interface CacheKey {
    y: number;
    fishId: number;
}

/** 像素信息 (hover时显示) */
export interface PixelInfo {
    x: number;
    y: number;
    value: number;
    worldX: number;
    worldY: number;
    worldZ: number;
}

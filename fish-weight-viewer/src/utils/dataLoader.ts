/**
 * 二进制数据加载器 v2
 * 支持 Y-slice (2D) 和 Volume (3D)
 */
import type { MetaData, CacheKey, SliceStats } from '../types';
import { LRUCache } from './LRUCache';

const SLICE_CACHE_SIZE = 64;
const VOLUME_CACHE_SIZE = 8;

// Y-slice 缓存 Key: y_f{fid}_s{scen}
const sliceCache = new LRUCache<string, Float32Array>(
    SLICE_CACHE_SIZE,
    (k) => k
);

// Volume 缓存 Key: f{fid}_s{scen}
const volumeCache = new LRUCache<string, Float32Array>(
    VOLUME_CACHE_SIZE,
    (k) => k
);

let metaData: MetaData | null = null;

/**
 * 加载 meta.json
 */
export async function loadMeta(): Promise<MetaData> {
    if (metaData) return metaData;

    const response = await fetch('/meta.json');
    if (!response.ok) {
        throw new Error(`Failed to load meta.json: ${response.status}`);
    }
    metaData = await response.json();
    return metaData!;
}

export function getMeta(): MetaData | null {
    return metaData;
}

/**
 * 加载单个 Y-slice (XZ 平面)
 */
export async function loadYSlice(yLayer: number, fishId: number, scenarioIndex: number = 0): Promise<Float32Array> {
    const cacheKey = `y${yLayer}_f${fishId}_s${scenarioIndex}`;

    const cached = sliceCache.get(cacheKey);
    if (cached) return cached;

    const meta = await loadMeta();
    const { dims } = meta;

    // 新格式: s{scen}_slice_xz_y{y}_f{fishId}.bin
    const url = `/data/s${scenarioIndex}_slice_xz_y${yLayer}_f${fishId}.bin`;
    const response = await fetch(url);

    if (!response.ok) {
        console.warn(`Slice not found: ${url}`);
        const zeros = new Float32Array(dims.x * dims.z);
        sliceCache.set(cacheKey, zeros);
        return zeros;
    }

    const buffer = await response.arrayBuffer();
    const result = new Float32Array(buffer);

    sliceCache.set(cacheKey, result);
    return result;
}

/**
 * 加载 3D Volume (单个鱼种的完整数据)
 */
export async function loadVolume(fishId: number, scenarioIndex: number = 0): Promise<Float32Array> {
    const cacheKey = `vol_f${fishId}_s${scenarioIndex}`;
    const cached = volumeCache.get(cacheKey);
    if (cached) return cached;

    const meta = await loadMeta();
    const { dims } = meta;

    const url = `/data/s${scenarioIndex}_volume_f${fishId}.bin`;
    const response = await fetch(url);

    if (!response.ok) {
        console.warn(`Volume not found: ${url}`);
        const zeros = new Float32Array(dims.x * dims.y * dims.z);
        volumeCache.set(cacheKey, zeros);
        return zeros;
    }

    const buffer = await response.arrayBuffer();
    const result = new Float32Array(buffer);

    volumeCache.set(cacheKey, result);
    return result;
}

/**
 * 并行加载多个 Y-slice 并聚合 (用于 2D 视图)
 */
export async function loadAndAggregateYSlices(
    yLayer: number,
    fishIds: number[],
    scenarioIndex: number = 0
): Promise<Float32Array> {
    const meta = await loadMeta();
    const size = meta.dims.x * meta.dims.z;

    if (fishIds.length === 0) {
        return new Float32Array(size);
    }

    const slices = await Promise.all(
        fishIds.map(fishId => loadYSlice(yLayer, fishId, scenarioIndex))
    );

    const result = new Float32Array(size);
    for (const slice of slices) {
        for (let i = 0; i < size; i++) {
            result[i] += slice[i];
        }
    }

    return result;
}

/**
 * 并行加载多个 Volume 并聚合 (用于 3D 视图)
 */
export async function loadAndAggregateVolumes(
    fishIds: number[],
    scenarioIndex: number = 0
): Promise<Float32Array> {
    const meta = await loadMeta();
    const size = meta.dims.x * meta.dims.y * meta.dims.z;

    if (fishIds.length === 0) {
        return new Float32Array(size);
    }

    const volumes = await Promise.all(
        fishIds.map(fishId => loadVolume(fishId, scenarioIndex))
    );

    const result = new Float32Array(size);
    for (const vol of volumes) {
        for (let i = 0; i < size; i++) {
            result[i] += vol[i];
        }
    }

    return result;
}

/**
 * 计算统计
 */
export function computeStats(data: Float32Array): SliceStats {
    if (data.length === 0) {
        return { min: 0, max: 0, p99: 0, mean: 0 };
    }

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
    }

    const mean = sum / data.length;

    const sorted = Float32Array.from(data).sort();
    const p99Index = Math.floor(sorted.length * 0.99);
    const p99 = sorted[p99Index] || max;

    return { min, max, p99, mean };
}

/**
 * 获取特定点 (x, y, z) 所有鱼种的权重
 * y 为高度层
 */
export async function getFishWeightsAt(
    x: number,
    y: number,
    z: number,
    fishList: { fishId: number; name: string }[],
    scenarioIndex: number = 0
): Promise<{ fishName: string; weight: number }[]> {
    const meta = await loadMeta();
    const { dims } = meta;

    // 检查边界
    if (x < 0 || x >= dims.x || y < 0 || y >= dims.y || z < 0 || z >= dims.z) {
        return [];
    }

    const promises = fishList.map(async (fish) => {
        // 1. 优先从 Volume 缓存读取
        const volCacheKey = `vol_f${fish.fishId}_s${scenarioIndex}`;
        const cachedVol = volumeCache.get(volCacheKey);
        if (cachedVol) {
            // Volume Index: x * dims.y * dims.z + y * dims.z + z
            const volumeIndex = x * dims.y * dims.z + y * dims.z + z;
            return { fishName: fish.name, weight: cachedVol[volumeIndex] || 0 };
        }

        // 2. 从 Slice 缓存读取 (如果 y 匹配)
        const sliceCacheKey = `y${y}_f${fish.fishId}_s${scenarioIndex}`;
        const cachedSlice = sliceCache.get(sliceCacheKey);
        if (cachedSlice) {
            // Slice Index: z * dims.x + x (Z-major, X-minor)
            const sliceIndex = z * dims.x + x;
            return { fishName: fish.name, weight: cachedSlice[sliceIndex] || 0 };
        }

        // 3. Fallback: 尝试加载 Slice 文件
        try {
            const slice = await loadYSlice(y, fish.fishId, scenarioIndex);
            const sliceIndex = z * dims.x + x;
            return { fishName: fish.name, weight: slice[sliceIndex] || 0 };
        } catch (e) {
            console.error(`Failed to fetch weight for fish ${fish.fishId}`, e);
            return { fishName: fish.name, weight: 0 };
        }
    });

    const results = await Promise.all(promises);
    // 按权重降序排列
    return results.sort((a, b) => b.weight - a.weight);
}

export function clearCache(): void {
    sliceCache.clear();
    volumeCache.clear();
}

// 保持向后兼容
export const loadSlice = loadYSlice;
export const loadAndAggregateSlices = loadAndAggregateYSlices;

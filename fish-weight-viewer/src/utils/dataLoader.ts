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

export function clearCache(): void {
    sliceCache.clear();
    volumeCache.clear();
}

// 保持向后兼容
export const loadSlice = loadYSlice;
export const loadAndAggregateSlices = loadAndAggregateYSlices;

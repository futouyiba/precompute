/**
 * 二进制数据加载器 v2
 * 支持 Y-slice (2D) 和 Volume (3D)
 */
import type { MetaData, CacheKey, SliceStats } from '../types';
import { LRUCache } from './LRUCache';

const SLICE_CACHE_SIZE = 64;
const VOLUME_CACHE_SIZE = 8;

// Y-slice 缓存
const sliceCache = new LRUCache<CacheKey, Float32Array>(
    SLICE_CACHE_SIZE,
    (k) => `y${k.y}_f${k.fishId}`  // y 参数表示 Y 层
);

// Volume 缓存
const volumeCache = new LRUCache<number, Float32Array>(
    VOLUME_CACHE_SIZE,
    (fishId) => `vol_${fishId}`
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
export async function loadYSlice(yLayer: number, fishId: number): Promise<Float32Array> {
    const cacheKey: CacheKey = { y: yLayer, fishId };

    const cached = sliceCache.get(cacheKey);
    if (cached) return cached;

    const meta = await loadMeta();
    const { dims } = meta;

    // 新格式: slice_xz_y{y}_f{fishId}.bin
    const url = `/data/slice_xz_y${yLayer}_f${fishId}.bin`;
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
export async function loadVolume(fishId: number): Promise<Float32Array> {
    const cached = volumeCache.get(fishId);
    if (cached) return cached;

    const meta = await loadMeta();
    const { dims } = meta;

    const url = `/data/volume_f${fishId}.bin`;
    const response = await fetch(url);

    if (!response.ok) {
        console.warn(`Volume not found: ${url}`);
        const zeros = new Float32Array(dims.x * dims.y * dims.z);
        volumeCache.set(fishId, zeros);
        return zeros;
    }

    const buffer = await response.arrayBuffer();
    const result = new Float32Array(buffer);

    volumeCache.set(fishId, result);
    return result;
}

/**
 * 并行加载多个 Y-slice 并聚合 (用于 2D 视图)
 */
export async function loadAndAggregateYSlices(
    yLayer: number,
    fishIds: number[]
): Promise<Float32Array> {
    const meta = await loadMeta();
    const size = meta.dims.x * meta.dims.z;

    if (fishIds.length === 0) {
        return new Float32Array(size);
    }

    const slices = await Promise.all(
        fishIds.map(fishId => loadYSlice(yLayer, fishId))
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
    fishIds: number[]
): Promise<Float32Array> {
    const meta = await loadMeta();
    const size = meta.dims.x * meta.dims.y * meta.dims.z;

    if (fishIds.length === 0) {
        return new Float32Array(size);
    }

    const volumes = await Promise.all(
        fishIds.map(fishId => loadVolume(fishId))
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
    fishList: { fishId: number; name: string }[]
): Promise<{ fishName: string; weight: number }[]> {
    const meta = await loadMeta();
    const { dims } = meta;

    // 检查边界
    if (x < 0 || x >= dims.x || y < 0 || y >= dims.y || z < 0 || z >= dims.z) {
        return [];
    }

    // 计算文件内的字节偏移量
    // Slice (XZ): z * dims.x + x (X变化最快)
    // Volume: x * dims.y * dims.z + y * dims.z + z (Z变化最快)
    // 注意：这里需要根据视图模式决定读取策略，或者总是尝试读取 Volume？
    // 实际上，如果我们在 Slice 视图，可能只关心当前 Slice 的数据。
    // 但为了统一“获取该点所有鱼种权重”，我们需要决定是从 Slice 文件读还是 Volume 文件读。
    // 由于 Slice 文件是预计算的 Y-slice，只有特定的 Y 层有对应的 Slice 文件。
    // 如果 y matches current slice, we can read from slice files.
    // 但 Volume 文件包含所有信息。为了通用性，如果 Volume 文件存在，读取 Volume 是最准确的。
    // 不过 Volume 文件可能很大，如果没缓存，Range Request 是必须的。
    // 考虑到应用逻辑，slice 视图时也是从 slice 文件加载的。
    // 我们可以尝试从 Volume 文件读取，因为那是全量的。

    // Volume Index: x * dims.y * dims.z + y * dims.z + z
    // 对应的 byte offset = index * 4 (float32)
    const volumeIndex = x * dims.y * dims.z + y * dims.z + z;
    const byteOffset = volumeIndex * 4;

    const promises = fishList.map(async (fish) => {
        // 1. 检查 Volume 缓存
        const cachedVol = volumeCache.get(fish.fishId);
        if (cachedVol) {
            return { fishName: fish.name, weight: cachedVol[volumeIndex] || 0 };
        }

        // 2. 检查 Slice 缓存 (如果 y 恰好是当前缓存的层)
        // Slice Index: z * dims.x + x
        const sliceKey: CacheKey = { y, fishId: fish.fishId };
        const cachedSlice = sliceCache.get(sliceKey);
        if (cachedSlice) {
            const sliceIndex = z * dims.x + x;
            return { fishName: fish.name, weight: cachedSlice[sliceIndex] || 0 };
        }

        // 3. Fallback: Range Request to Volume file
        // 这是一个优化。如果服务器支持 Range，我们只下载 4 字节。
        // 如果不支持，浏览器可能会下载这个文件(或者被中止)。
        // 这里的风险是并发 N 个请求。
        try {
            const url = `/data/volume_f${fish.fishId}.bin`;
            const response = await fetch(url, {
                headers: {
                    'Range': `bytes=${byteOffset}-${byteOffset + 3}`
                }
            });

            if (!response.ok) {
                // 如果 Range 不满足 (例如 416) 或者文件不存在
                return { fishName: fish.name, weight: 0 };
            }

            const buffer = await response.arrayBuffer();
            if (buffer.byteLength === 4) {
                const view = new DataView(buffer);
                return { fishName: fish.name, weight: view.getFloat32(0, true) }; // little-endian
            } else {
                // 如果服务器忽略了 Range 头返回了整个文件
                // 我们不应该在这里解析整个文件，太慢了。
                // 暂时返回 0 或者解析前 4 个字节(如果它真的返回了整个文件流的开始... wait, if it returns full file, offset 0 is not what we want)
                // 如果返回了整个文件，我们实际上无法高效获取中间的数据 without reading stream.
                // 为了安全，如果长度不对，视为失败。
                return { fishName: fish.name, weight: 0 };
            }
        } catch (e) {
            console.error(`Failed to fetch weight for fish ${fish.fishId}`, e);
            return { fishName: fish.name, weight: 0 };
        }
    });

    const results = await Promise.all(promises);
    // 过滤掉权重为 0 的结果，或者保留但排序？用户想要看分布，保留 0 可能没意义，但也可能想知道哪些没有。
    // 根据需求 "显示...权重列表"，通常按权重降序排列
    return results.sort((a, b) => b.weight - a.weight);
}

export function clearCache(): void {
    sliceCache.clear();
    volumeCache.clear();
}

// 保持向后兼容
export const loadSlice = loadYSlice;
export const loadAndAggregateSlices = loadAndAggregateYSlices;

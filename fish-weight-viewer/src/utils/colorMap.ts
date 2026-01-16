/**
 * 颜色映射工具
 */

/** Viridis 色带 (简化版 256 级) */
const VIRIDIS_STOPS_HEX = [
    "#440154", "#482878", "#3e4989", "#31688e", "#26828e",
    "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"
];

function hexToRgb(hex: string): [number, number, number] {
    const bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

const VIRIDIS_STOPS = VIRIDIS_STOPS_HEX.map(hexToRgb);

const VIRIDIS: [number, number, number][] = [];
for (let i = 0; i < 256; i++) {
    const t = i / 255;
    // Find segment
    const segmentCount = VIRIDIS_STOPS.length - 1;
    const segmentIndex = Math.min(Math.floor(t * segmentCount), segmentCount - 1);
    const segmentT = (t * segmentCount) - segmentIndex;

    const start = VIRIDIS_STOPS[segmentIndex];
    const end = VIRIDIS_STOPS[segmentIndex + 1];

    const r = Math.round(start[0] + (end[0] - start[0]) * segmentT);
    const g = Math.round(start[1] + (end[1] - start[1]) * segmentT);
    const b = Math.round(start[2] + (end[2] - start[2]) * segmentT);

    VIRIDIS.push([r, g, b]);
}

/**
 * 值到颜色的映射
 */
export function valueToColor(
    value: number,
    vmin: number,
    vmax: number,
    useLog: boolean = false
): [number, number, number, number] {
    if (vmax <= vmin) return [0, 0, 0, 255];

    let normalized: number;
    if (useLog) {
        const logMin = Math.log1p(vmin);
        const logMax = Math.log1p(vmax);
        const logVal = Math.log1p(value);
        normalized = (logVal - logMin) / (logMax - logMin);
    } else {
        normalized = (value - vmin) / (vmax - vmin);
    }

    normalized = Math.max(0, Math.min(1, normalized));
    const index = Math.floor(normalized * 255);
    const [r, g, b] = VIRIDIS[index] || [0, 0, 0];
    return [r, g, b, 255];
}

/**
 * 创建颜色查找表 (优化性能)
 */
export function createColorLUT(
    vmin: number,
    vmax: number,
    steps: number = 256,
    useLog: boolean = false
): Uint8ClampedArray {
    const lut = new Uint8ClampedArray(steps * 4);

    for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const value = vmin + t * (vmax - vmin);
        const [r, g, b, a] = valueToColor(value, vmin, vmax, useLog);
        lut[i * 4] = r;
        lut[i * 4 + 1] = g;
        lut[i * 4 + 2] = b;
        lut[i * 4 + 3] = a;
    }

    return lut;
}

/**
 * 使用 LUT 快速映射
 */
export function applyColorLUT(
    value: number,
    vmin: number,
    vmax: number,
    lut: Uint8ClampedArray,
    steps: number = 256
): [number, number, number, number] {
    if (vmax <= vmin) return [0, 0, 0, 255];

    const normalized = Math.max(0, Math.min(1, (value - vmin) / (vmax - vmin)));
    const index = Math.floor(normalized * (steps - 1));

    return [
        lut[index * 4],
        lut[index * 4 + 1],
        lut[index * 4 + 2],
        lut[index * 4 + 3]
    ];
}

/**
 * 2D 热力图组件 - XZ 平面 (固定 Y 高度层)
 */
import React, { useRef, useEffect, useCallback } from 'react';
import type { MetaData, PixelInfo } from '../types';
import { createColorLUT } from '../utils/colorMap';

interface Heatmap2DProps {
    data: Float32Array | null;
    meta: MetaData | null;
    width: number;
    height: number;
    vmin: number;
    vmax: number;
    useLog: boolean;
    ySlice: number;  // Y 层 (高度)
    onHover: (info: PixelInfo | null) => void;
    onPointClick?: (x: number, y: number, z: number) => void;
}

const Heatmap2D: React.FC<Heatmap2DProps> = ({
    data,
    meta,
    width,
    height,
    vmin,
    vmax,
    useLog,
    ySlice,
    onHover,
    onPointClick
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data || !meta) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { dims } = meta;
        const dx = dims.x;  // X 方向
        const dz = dims.z;  // Z 方向 (显示为 Y 轴)

        const imageData = ctx.createImageData(dx, dz);
        const pixels = imageData.data;
        const lut = createColorLUT(vmin, vmax, 256, useLog);

        // 填充像素: data 是 [z * dimX + x] 格式
        for (let z = 0; z < dz; z++) {
            for (let x = 0; x < dx; x++) {
                const dataIndex = z * dx + x;
                const value = data[dataIndex] || 0;

                let normalized = (value - vmin) / (vmax - vmin);
                if (useLog && value > 0) {
                    const logMin = Math.log1p(vmin);
                    const logMax = Math.log1p(vmax);
                    normalized = (Math.log1p(value) - logMin) / (logMax - logMin);
                }
                normalized = Math.max(0, Math.min(1, normalized));
                const lutIndex = Math.floor(normalized * 255);

                // 翻转 Z 轴使原点在左下
                const pixelIndex = ((dz - 1 - z) * dx + x) * 4;
                pixels[pixelIndex] = lut[lutIndex * 4];
                pixels[pixelIndex + 1] = lut[lutIndex * 4 + 1];
                pixels[pixelIndex + 2] = lut[lutIndex * 4 + 2];
                pixels[pixelIndex + 3] = 255;
            }
        }

        const offscreen = new OffscreenCanvas(dx, dz);
        const offCtx = offscreen.getContext('2d');
        if (offCtx) {
            offCtx.putImageData(imageData, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(offscreen, 0, 0, width, height);
        }
    }, [data, meta, width, height, vmin, vmax, useLog]);

    useEffect(() => {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [render]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!meta || !data) {
            onHover(null);
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const { dims, grid } = meta;

        // 转换到数据坐标
        const x = Math.floor(mouseX / width * dims.x);
        const z = dims.z - 1 - Math.floor(mouseY / height * dims.z); // 翻转 Z

        if (x < 0 || x >= dims.x || z < 0 || z >= dims.z) {
            onHover(null);
            return;
        }

        const dataIndex = z * dims.x + x;
        const value = data[dataIndex] || 0;

        // 世界坐标
        const worldX = grid.origin[0] + x * grid.step[0];
        const worldY = grid.origin[1] + ySlice * grid.step[1];
        const worldZ = grid.origin[2] + z * grid.step[2];

        onHover({ x, y: z, value, worldX, worldY, worldZ });
    }, [meta, data, width, height, ySlice, onHover]);

    const handleMouseLeave = useCallback(() => {
        onHover(null);
    }, [onHover]);

    const handleMouseClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!meta || !onPointClick) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const { dims } = meta;

        // 转换到数据坐标
        const x = Math.floor(mouseX / width * dims.x);
        const z = dims.z - 1 - Math.floor(mouseY / height * dims.z); // 翻转 Z

        if (x < 0 || x >= dims.x || z < 0 || z >= dims.z) {
            return;
        }

        onPointClick(x, ySlice, z);
    }, [meta, width, height, ySlice, onPointClick]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{
                border: '1px solid #333',
                cursor: 'crosshair',
                imageRendering: 'pixelated'
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleMouseClick}
        />
    );
};

export default Heatmap2D;

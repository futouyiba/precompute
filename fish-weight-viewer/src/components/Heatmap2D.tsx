/**
 * 2D 热力图组件 - XZ 平面 (固定 Y 高度层)
 * 支持中键拖拽平移 + 滚轮缩放
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
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

    // Pan & Zoom state
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0 });

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data || !meta) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { dims } = meta;
        const dx = dims.x;
        const dz = dims.z;

        const imageData = ctx.createImageData(dx, dz);
        const pixels = imageData.data;
        const lut = createColorLUT(vmin, vmax, 256, useLog);

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

            // Apply pan and zoom transform
            const scaledWidth = width * zoom;
            const scaledHeight = height * zoom;
            ctx.drawImage(offscreen, panOffset.x, panOffset.y, scaledWidth, scaledHeight);
        }
    }, [data, meta, width, height, vmin, vmax, useLog, panOffset, zoom]);

    useEffect(() => {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [render]);

    // Middle Mouse Button Pan
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button === 1) {
            e.preventDefault();
            isPanningRef.current = true;
            panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
        }
    }, [panOffset]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isPanningRef.current) {
            setPanOffset({
                x: e.clientX - panStartRef.current.x,
                y: e.clientY - panStartRef.current.y
            });
            return;
        }

        if (!meta || !data) {
            onHover(null);
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        // Account for pan and zoom when calculating data coordinates
        const mouseX = (e.clientX - rect.left - panOffset.x) / zoom;
        const mouseY = (e.clientY - rect.top - panOffset.y) / zoom;

        const { dims, grid } = meta;

        const x = Math.floor(mouseX / width * dims.x);
        const z = dims.z - 1 - Math.floor(mouseY / height * dims.z);

        if (x < 0 || x >= dims.x || z < 0 || z >= dims.z) {
            onHover(null);
            return;
        }

        const dataIndex = z * dims.x + x;
        const value = data[dataIndex] || 0;

        const worldX = grid.origin[0] + x * grid.step[0];
        const worldY = grid.origin[1] + ySlice * grid.step[1];
        const worldZ = grid.origin[2] + z * grid.step[2];

        onHover({ x, y: z, value, worldX, worldY, worldZ });
    }, [meta, data, width, height, ySlice, onHover, panOffset, zoom]);

    const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button === 1) {
            isPanningRef.current = false;
        }
    }, []);

    const handleMouseLeave = useCallback(() => {
        isPanningRef.current = false;
        onHover(null);
    }, [onHover]);

    // Scroll Wheel Zoom
    const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1; // Zoom out / Zoom in
        setZoom(prev => Math.max(0.1, Math.min(10, prev * delta)));
    }, []);

    const handleMouseClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!meta || !onPointClick) return;
        if (e.button !== 0) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - panOffset.x) / zoom;
        const mouseY = (e.clientY - rect.top - panOffset.y) / zoom;

        const { dims } = meta;

        const x = Math.floor(mouseX / width * dims.x);
        const z = dims.z - 1 - Math.floor(mouseY / height * dims.z);

        if (x < 0 || x >= dims.x || z < 0 || z >= dims.z) {
            return;
        }

        onPointClick(x, ySlice, z);
    }, [meta, width, height, ySlice, onPointClick, panOffset, zoom]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
    }, []);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{
                border: '1px solid #333',
                cursor: isPanningRef.current ? 'grabbing' : 'crosshair',
                imageRendering: 'pixelated'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleMouseClick}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
        />
    );
};

export default Heatmap2D;

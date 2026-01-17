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

    // Transform state: scale, tx, ty
    const transformRef = useRef({ k: 1, x: 0, y: 0 });
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data || !meta) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { dims } = meta;
        const dx = dims.x;
        const dz = dims.z;

        // 1. Prepare offscreen buffer (data visualization)
        // Only recreate if data/LUt changed conceptually, but for now we redo per frame 
        // because lightweight. Optimization: cache offscreen canvas.
        // Let's create visuals on an OffscreenCanvas or temp canvas
        const offCanvas = document.createElement('canvas');
        offCanvas.width = dx;
        offCanvas.height = dz;
        const offCtx = offCanvas.getContext('2d');
        if (!offCtx) return;

        const imageData = offCtx.createImageData(dx, dz);
        const pixels = imageData.data;
        const lut = createColorLUT(vmin, vmax, 256, useLog);

        for (let z = 0; z < dz; z++) {
            for (let x = 0; x < dx; x++) {
                const dataIndex = z * dx + x;
                const value = data[dataIndex] || 0;

                // ... (Color mapping logic same as before)
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
        offCtx.putImageData(imageData, 0, 0);

        // 2. Main Draw with Transform
        // Clear background
        ctx.save();
        ctx.fillStyle = '#0d0d1a'; // App background color
        ctx.fillRect(0, 0, width, height);

        const { k, x, y } = transformRef.current;

        ctx.translate(x, y);
        ctx.scale(k, k);

        // Draw the heatmap centered initially if we want, or just at 0,0
        // We stretch the offscreen canvas (size dx, dz) to fit the VIEW area?
        // No, usually heatmap pixels map to screen pixels or scaled.
        // Let's draw it such that it fills 'optimally' or 1:1 if zoomed.
        // Let's assume initially we want it to fit in viewWidth/Height.

        // But here we just draw it at natural size 1 pixel = 1 data unit? 
        // No, typically we want it large. 
        // Let's scale it so it fills the screen initially?
        // Actually the `transform` should handle the view scaling.
        // Let's draw the image at 0,0 width: width, height: height?
        // Previous logic: ctx.drawImage(offscreen, 0, 0, width, height);
        // This implies stretching.
        // So `ctx.scale` operates on top of that stretch?
        // Complex. Let's simplify:
        // The "Base" drawing is stretched to (width, height).
        // The transform applies to that 800x800 rect.

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(offCanvas, 0, 0, width, height);

        ctx.restore();

    }, [data, meta, width, height, vmin, vmax, useLog]);

    useEffect(() => {
        // Initial render logic or requestAnimationFrame loop
        // Here we just trigger render when props change.
        // But for smooth pan/zoom we might want a loop if we had momentum.
        // Since we don't, just render on interaction.
        render();
    }, [render]);

    // --- Interaction Handlers ---

    const updateRender = () => {
        requestAnimationFrame(render);
    };

    const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const { k, x, y } = transformRef.current;
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Zoom centered on mouse
        let zoom = Math.exp(-e.deltaY * 0.001);
        // Limit zoom
        const newK = Math.max(0.1, Math.min(20, k * zoom));
        const finalZoom = newK / k;

        // x' = mx - (mx - x) * zoom
        const newX = mx - (mx - x) * finalZoom;
        const newY = my - (my - y) * finalZoom;

        transformRef.current = { k: newK, x: newX, y: newY };
        updateRender();
    }, [render]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        // Middle mouse (button 1) or Left mouse (button 0) for testing? 
        // Requirement: Middle mouse pan.
        if (e.button === 1) { // Middle
            e.preventDefault();
            isDraggingRef.current = true;
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
        }
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Pan
        if (isDraggingRef.current) {
            const dx = e.clientX - lastMouseRef.current.x;
            const dy = e.clientY - lastMouseRef.current.y;
            transformRef.current.x += dx;
            transformRef.current.y += dy;
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
            updateRender();
            return; // Don't hover while panning
        }

        // Hover
        if (!meta || !data) return;

        const { k, x, y } = transformRef.current;

        // Inverse transform to find data coordinate
        // Screen(mx, my) -> Transformed Space
        // The drawing logic:
        // VisualX = DataNormalX * width * k + x
        // VisualY = DataNormalY * height * k + y
        // So:
        // DataNormalX = (mx - x) / (width * k)
        // But wait, drawImage(offCanvas, 0, 0, width, height) means
        // Data index x=0 maps to 0, data index x=dx maps to width.
        // So scaling factor from DATA_GRID to BASE_SCREEN is width/dims.x

        // Let's go step by step:
        // 1. Un-apply pan/zoom transform
        const baseScreenX = (mx - x) / k;
        const baseScreenY = (my - y) / k;

        // 2. Map BaseScreen (0..width, 0..height) to DataGrid (0..dims.x, 0..dims.z)
        const { dims, grid } = meta;
        const dataX = Math.floor((baseScreenX / width) * dims.x);

        // Remember Y axis flip in visualization (pixelIndex = (dz - 1 - z)...)
        // VisualY = 0 is Top, corresponds to Data Z = dz-1
        // VisualY = height is Bottom, corresponds to Data Z = 0
        // baseScreenY / height = 0..1
        const normalizedY = baseScreenY / height;
        const dataZ = dims.z - 1 - Math.floor(normalizedY * dims.z);

        if (dataX < 0 || dataX >= dims.x || dataZ < 0 || dataZ >= dims.z) {
            onHover(null);
            return;
        }

        const dataIndex = dataZ * dims.x + dataX;
        const value = data[dataIndex] || 0;

        const worldX = grid.origin[0] + dataX * grid.step[0];
        const worldY = grid.origin[1] + ySlice * grid.step[1];
        const worldZ = grid.origin[2] + dataZ * grid.step[2];

        onHover({ x: dataX, y: dataZ, value, worldX, worldY, worldZ });

    }, [meta, data, width, height, ySlice, onHover, render]);

    const handleMouseUp = useCallback(() => {
        isDraggingRef.current = false;
    }, []);

    const handleMouseClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        // Prevent click if we were dragging? usually helpful.
        if (isDraggingRef.current) return;

        if (!meta || !onPointClick) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const { k, x, y } = transformRef.current;
        const { dims } = meta;

        // Same inverse logic as Hover
        const baseScreenX = (mx - x) / k;
        const baseScreenY = (my - y) / k;

        const dataX = Math.floor((baseScreenX / width) * dims.x);
        const normalizedY = baseScreenY / height;
        const dataZ = dims.z - 1 - Math.floor(normalizedY * dims.z);

        if (dataX < 0 || dataX >= dims.x || dataZ < 0 || dataZ >= dims.z) {
            return;
        }

        onPointClick(dataX, ySlice, dataZ);
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
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
                handleMouseUp();
                onHover(null);
            }}
            onClick={handleMouseClick}
        />
    );
};

export default Heatmap2D;

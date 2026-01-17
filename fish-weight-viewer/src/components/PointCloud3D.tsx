/**
 * 3D 点云视图组件 - 显示完整 Volume 数据
 */
import { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { OrbitView } from '@deck.gl/core';
import { PointCloudLayer } from '@deck.gl/layers';
import type { MetaData } from '../types';
import { valueToColor } from '../utils/colorMap';
import MiddlePanOrbitController from '../utils/MiddlePanOrbitController';

interface PointCloud3DProps {
    data: Float32Array | null;  // 3D Volume 数据
    meta: MetaData | null;
    vmin: number;
    vmax: number;
    useLog: boolean;
    threshold: number;
    width: number;
    height: number;
    onPointClick?: (x: number, y: number, z: number) => void;
}

interface PointData {
    position: [number, number, number];
    color: [number, number, number, number];
    value: number;
    // 原始坐标，方便反查
    gridX: number;
    gridY: number; // Height
    gridZ: number; // Forward
}

const INITIAL_VIEW_STATE: {
    target: [number, number, number];
    rotationX: number;
    rotationOrbit: number;
    zoom: number;
    minZoom: number;
    maxZoom: number;
} = {
    target: [0, 0, 0],
    rotationX: 45,
    rotationOrbit: 45,
    zoom: 0,
    minZoom: -5,
    maxZoom: 10,
};

const PointCloud3D = ({
    data,
    meta,
    vmin,
    vmax,
    useLog,
    threshold,
    width,
    height,
    onPointClick
}: PointCloud3DProps) => {
    // 构建 3D 点云数据
    const points = useMemo<PointData[]>(() => {
        if (!data || !meta) return [];

        const { dims, grid } = meta;
        const result: PointData[] = [];

        // data 格式: [x][y][z] flattened as x * dimY * dimZ + y * dimZ + z
        for (let x = 0; x < dims.x; x++) {
            for (let y = 0; y < dims.y; y++) {
                for (let z = 0; z < dims.z; z++) {
                    const dataIndex = x * dims.y * dims.z + y * dims.z + z;
                    const value = data[dataIndex] || 0;

                    if (value < threshold) continue;

                    // 世界坐标 (Unity 坐标系: Y=UP, Z=FORWARD)
                    const unityX = grid.origin[0] + x * grid.step[0];
                    // 用户要求: Y=0 最浅, Y 越大越深 -> 视觉上 Y 越大越往下 -> 取反
                    const depthMeters = grid.origin[1] + y * grid.step[1];
                    const unityY = -depthMeters; // Depth as negative height
                    const unityZ = grid.origin[2] + z * grid.step[2];

                    // 颜色映射
                    const color = valueToColor(value, vmin, vmax, useLog);

                    // DeckGL 坐标系: [Long(X), Lat(Y), Alt(Z)] ?
                    // OrbitView 坐标系: [X, Y, Z]
                    result.push({
                        position: [unityX, unityZ, unityY],
                        color,
                        value,
                        gridX: x,
                        gridY: y,
                        gridZ: z
                    });
                }
            }
        }
        return result;
    }, [data, meta, vmin, vmax, useLog, threshold]);

    // 计算初始视角中心
    const viewState = useMemo(() => {
        if (!meta) return INITIAL_VIEW_STATE;
        const { dims, grid } = meta;
        const totalW = dims.x * grid.step[0];
        const totalH = dims.y * grid.step[1];
        const totalD = dims.z * grid.step[2];

        const centerX = grid.origin[0] + totalW / 2;
        const centerY_Height = -(grid.origin[1] + totalH / 2);
        const centerZ_Forward = grid.origin[2] + totalD / 2;

        return {
            ...INITIAL_VIEW_STATE,
            // Taget: [X, Y=Forward, Z=Up]
            target: [centerX, centerZ_Forward, centerY_Height] as [number, number, number],
            zoom: 1.5, // Increase zoom to fill screen better
            minZoom: -2,
            maxZoom: 20,
        };
    }, [meta]);

    const layers = [
        new PointCloudLayer({
            id: 'point-cloud-3d',
            data: points,
            getPosition: (d: PointData) => d.position,
            getColor: (d: PointData) => d.color,
            pointSize: 3,
            pickable: true,
            onClick: (info) => {
                // Ignore clicks if panning
                // deck.gl handles click distinguishing but good to be safe
                if (onPointClick && info.object) {
                    const p = info.object as PointData;
                    onPointClick(p.gridX, p.gridY, p.gridZ);
                }
            }
        })
    ];

    const views = new OrbitView({
        id: 'orbit',
        controller: true
    });

    return (
        <div style={{ width, height, position: 'relative' }}>
            <DeckGL
                width={width}
                height={height}
                views={views}
                initialViewState={viewState}
                controller={{
                    type: MiddlePanOrbitController,
                    dragRotate: true,
                    dragPan: true,
                    scrollZoom: true,
                    doubleClickZoom: true,
                    touchRotate: true,
                    keyboard: true
                }}
                layers={layers}
                getTooltip={(info) => {
                    const object = info.object as PointData | undefined;
                    if (!object) return null;
                    return {
                        html: `<div style="background: rgba(20,20,40,0.9); padding: 8px; border-radius: 4px; color: #eee;">
                            <div><strong>Grid:</strong> [${object.gridX}, ${object.gridY}, ${object.gridZ}]</div>
                            <div><strong>Value:</strong> ${object.value.toFixed(4)}</div>
                        </div>`,
                        style: {
                            backgroundColor: 'transparent',
                            border: 'none',
                            zIndex: 1000
                        }
                    };
                }}
                getCursor={({ isDragging }) => isDragging ? 'grabbing' : 'grab'}
            />
            <div style={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                color: '#888',
                fontSize: '0.8em'
            }}>
                Points: {points.length.toLocaleString()}
            </div>
        </div>
    );
};

export default PointCloud3D;

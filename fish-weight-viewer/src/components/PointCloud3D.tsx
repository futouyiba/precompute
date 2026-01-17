/**
 * 3D 点云视图组件 - 显示完整 Volume 数据
 */
import { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { OrbitView } from '@deck.gl/core';
import { PointCloudLayer } from '@deck.gl/layers';
import type { MetaData } from '../types';
import { valueToColor } from '../utils/colorMap';

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
    maxZoom: 10,
};

// 自定义控制器支持中键平移
import { OrbitController } from '@deck.gl/core';

class MiddleMousePanController extends OrbitController {
    handleEvent(event: any) {
        if (event.type === 'pan-start') {
            // event.srcEvent is the browser event
            // buttons: 1=Left, 2=Right, 4=Middle
            if (event.srcEvent.buttons === 4) {
                // Force pan mode for this interaction
                this.setProps({ dragMode: 'pan' });
            } else {
                this.setProps({ dragMode: 'rotate' });
            }
        }
        return super.handleEvent(event);
    }
}


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
                    const unityY = grid.origin[1] + y * grid.step[1];  // 高度 (UP)
                    const unityZ = grid.origin[2] + z * grid.step[2];  // 前后 (FORWARD)

                    // 映射到 deck.gl (Z-UP 系统)
                    // deck.X = Unity.X
                    // deck.Y = Unity.Z (Forward)
                    // deck.Z = Unity.Y (Up)

                    const color = valueToColor(value, vmin, vmax, useLog);

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

    const viewState = useMemo(() => {
        if (!meta) return INITIAL_VIEW_STATE;

        const { dims, grid } = meta;
        const centerX = grid.origin[0] + (dims.x * grid.step[0]) / 2;
        const centerY_Height = grid.origin[1] + (dims.y * grid.step[1]) / 2;
        const centerZ_Forward = grid.origin[2] + (dims.z * grid.step[2]) / 2;

        return {
            ...INITIAL_VIEW_STATE,
            // Taget: [X, Y=Forward, Z=Up]
            target: [centerX, centerZ_Forward, centerY_Height] as [number, number, number]
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
                if (onPointClick && info.object) {
                    const p = info.object as PointData;
                    onPointClick(p.gridX, p.gridY, p.gridZ);
                }
            }
        })
    ];

    // 自定义 Controller 配置: 将中键(buttons:4)映射为 PAN
    const controller = useMemo(() => ({
        type: OrbitView,
        dragMode: 'rotate', // Default left click
        keyboard: true,
        // Override event handling via `options` overrides if possible, or subclassing.
        // Deck.gl's `Controller` is hard to subclass inside FC.
        // However, OrbitController supports `dragMode`.
        // We can try to use `state` changes or just rely on default behavior + Shift.
        // BUT user wants Middle Mouse Pan.

        // Deck.gl natively maps:
        // Left Drag -> Rotate
        // Shift + Left -> Pan
        // Ctrl + Left -> Rotate (or Pan depending on version)

        // To support Middle Mouse without Shift, we need to subclass OrbitController.
        // Let's instantiate the subclass below outside the component.
        controller: MiddleMousePanController
    }), []);

    return (
        <div style={{ width, height, position: 'relative' }}>
            <DeckGL
                width={width}
                height={height}
                initialViewState={viewState}
                controller={controller}
                layers={layers}
                getTooltip={(info) => {
                    const object = info.object as PointData | undefined;
                    return object ? `Value: ${object.value.toFixed(4)}` : null;
                }}
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

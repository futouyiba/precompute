import React, { useMemo } from 'react';
import type { FishInfo } from '../types';

interface DetailPanelProps {
    x: number;
    y: number;
    z: number;
    weights: { fishName: string; weight: number }[];
    loading?: boolean;
    onClose?: () => void;
}

const DetailPanel: React.FC<DetailPanelProps> = ({ x, y, z, weights, loading, onClose }) => {
    const totalWeight = useMemo(() => weights.reduce((sum, item) => sum + item.weight, 0), [weights]);

    // 饼图数据准备
    const pieData = useMemo(() => {
        if (totalWeight === 0) return [];

        let startAngle = 0;
        return weights
            .filter(w => w.weight > 0)
            .map((item, index) => {
                const percentage = item.weight / totalWeight;
                const angle = percentage * 2 * Math.PI;
                const endAngle = startAngle + angle;

                // 计算扇形路径
                const r = 50; // 半径
                const cx = 60; // 圆心 x
                const cy = 60; // 圆心 y

                const x1 = cx + r * Math.cos(startAngle - Math.PI / 2); // -PI/2 为了从 12 点方向开始
                const y1 = cy + r * Math.sin(startAngle - Math.PI / 2);
                const x2 = cx + r * Math.cos(endAngle - Math.PI / 2);
                const y2 = cy + r * Math.sin(endAngle - Math.PI / 2);

                // 大于 180 度需要使用大弧标志
                const largeArcFlag = angle > Math.PI ? 1 : 0;

                const pathData = [
                    `M ${cx} ${cy}`,
                    `L ${x1} ${y1}`,
                    `A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                    'Z'
                ].join(' ');

                const color = `hsl(${(index * 137.5) % 360}, 70%, 50%)`; // 简单的颜色生成

                const slice = {
                    path: pathData,
                    color,
                    key: item.fishName
                };

                startAngle = endAngle;
                return slice;
            });
    }, [weights, totalWeight]);

    if (loading) {
        return (
            <div className="detail-panel loading">
                <div className="spinner-small"></div>
                Loading details...
            </div>
        );
    }

    return (
        <div className="detail-panel">
            <div className="detail-header">
                <h3>Location Info</h3>
                {onClose && <button className="close-btn" onClick={onClose}>×</button>}
            </div>

            <div className="detail-coords">
                <div>X: {x}</div>
                <div>Y: {y} (Height)</div>
                <div>Z: {z}</div>
            </div>

            <div className="detail-total">
                <strong>Total Weight:</strong> {totalWeight.toFixed(4)}
            </div>

            <div className="detail-content">
                {/* 饼图 */}
                {pieData.length > 0 && (
                    <div className="detail-chart">
                        <svg width="120" height="120" viewBox="0 0 120 120">
                            {pieData.length === 1 && pieData[0].path.indexOf('A') === -1 ? (
                                // 如果只有一个且是100%（可能是完整圆），特殊处理
                                <circle cx="60" cy="60" r="50" fill={pieData[0].color} />
                            ) : (
                                pieData.map(slice => (
                                    <path key={slice.key} d={slice.path} fill={slice.color} stroke="#fff" strokeWidth="1" />
                                ))
                            )}
                        </svg>
                    </div>
                )}

                {/* 列表 */}
                <div className="detail-list">
                    <table>
                        <thead>
                            <tr>
                                <th>Fish</th>
                                <th>Wgt</th>
                                <th>%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {weights.map((item, idx) => (
                                <tr key={item.fishName}>
                                    <td>
                                        <span
                                            className="color-dot"
                                            style={{ backgroundColor: `hsl(${(idx * 137.5) % 360}, 70%, 50%)` }}
                                        ></span>
                                        {item.fishName}
                                    </td>
                                    <td>{item.weight.toFixed(4)}</td>
                                    <td>{totalWeight > 0 ? ((item.weight / totalWeight) * 100).toFixed(1) + '%' : '0%'}</td>
                                </tr>
                            ))}
                            {weights.length === 0 && (
                                <tr><td colSpan={3} style={{ textAlign: 'center' }}>No fish here</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default DetailPanel;

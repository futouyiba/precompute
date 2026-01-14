/**
 * 控制面板组件
 */
import React, { useState, useMemo } from 'react';
import type { MetaData, ControlState, ColorMode, SliceStats, PixelInfo } from '../types';
import './ControlPanel.css';

interface ControlPanelProps {
    meta: MetaData | null;
    control: ControlState;
    onChange: (updates: Partial<ControlState>) => void;
    stats: SliceStats | null;
    pixelInfo: PixelInfo | null;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
    meta,
    control,
    onChange,
    stats,
    pixelInfo
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [multiSelect, setMultiSelect] = useState(false);

    // 过滤鱼种列表
    const filteredFish = useMemo(() => {
        if (!meta) return [];
        const term = searchTerm.toLowerCase();
        return meta.fishList.filter(f =>
            f.name.toLowerCase().includes(term) ||
            f.fishId.toString().includes(term)
        );
    }, [meta, searchTerm]);

    const handleFishSelect = (fishId: number) => {
        if (multiSelect) {
            const current = control.selectedFishIds;
            if (current.includes(fishId)) {
                onChange({ selectedFishIds: current.filter(id => id !== fishId) });
            } else {
                onChange({ selectedFishIds: [...current, fishId] });
            }
        } else {
            onChange({ selectedFishIds: [fishId] });
        }
    };

    const selectAll = () => {
        if (!meta) return;
        onChange({ selectedFishIds: meta.fishList.map(f => f.fishId) });
    };

    const clearSelection = () => {
        onChange({ selectedFishIds: [] });
    };

    return (
        <div className="control-panel">
            <h2>🐟 Fish Weight Viewer</h2>

            {/* 视图模式切换 */}
            <section>
                <h3>View Mode</h3>
                <div className="button-group">
                    <button
                        className={control.viewMode === '2D' ? 'active' : ''}
                        onClick={() => onChange({ viewMode: '2D' })}
                    >
                        2D Heatmap
                    </button>
                    <button
                        className={control.viewMode === '3D' ? 'active' : ''}
                        onClick={() => onChange({ viewMode: '3D' })}
                    >
                        3D Point Cloud
                    </button>
                </div>
            </section>

            {/* Y 高度层选择 (仅 2D 模式) */}
            {control.viewMode === '2D' && (
                <section>
                    <h3>Y Layer (Depth): {control.zSlice}</h3>
                    <input
                        type="range"
                        min={0}
                        max={meta ? meta.dims.y - 1 : 0}
                        value={control.zSlice}
                        onChange={e => onChange({ zSlice: parseInt(e.target.value) })}
                        style={{ width: '100%' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', color: '#666' }}>
                        <span>Surface (0)</span>
                        <span>Bottom ({meta ? meta.dims.y - 1 : 7})</span>
                    </div>
                </section>
            )}

            {/* 鱼种选择 */}
            <section>
                <h3>Fish Selection ({control.selectedFishIds.length})</h3>
                <div className="fish-controls">
                    <label>
                        <input
                            type="checkbox"
                            checked={multiSelect}
                            onChange={e => setMultiSelect(e.target.checked)}
                        />
                        Multi-select (Sum)
                    </label>
                    <div className="button-group small">
                        <button onClick={selectAll}>All</button>
                        <button onClick={clearSelection}>Clear</button>
                    </div>
                </div>
                <input
                    type="text"
                    placeholder="Search fish..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="search-input"
                />
                <div className="fish-list">
                    {filteredFish.map(fish => (
                        <div
                            key={fish.fishId}
                            className={`fish-item ${control.selectedFishIds.includes(fish.fishId) ? 'selected' : ''}`}
                            onClick={() => handleFishSelect(fish.fishId)}
                        >
                            <span className="fish-id">{fish.fishId}</span>
                            <span className="fish-name">{fish.name}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* 颜色映射控制 */}
            <section>
                <h3>Color Mapping</h3>
                <div className="form-row">
                    <label>Mode:</label>
                    <select
                        value={control.colorMode}
                        onChange={e => onChange({ colorMode: e.target.value as ColorMode })}
                    >
                        <option value="AutoP99">Auto P99</option>
                        <option value="GlobalClamp">Global Clamp</option>
                        <option value="PerSlice">Per Slice</option>
                    </select>
                </div>

                {control.colorMode === 'GlobalClamp' && (
                    <div className="form-row">
                        <label>Vmax:</label>
                        <input
                            type="number"
                            value={control.vmax}
                            onChange={e => onChange({ vmax: parseFloat(e.target.value) || 1 })}
                            step={0.1}
                            min={0.01}
                        />
                    </div>
                )}

                <div className="form-row">
                    <label>
                        <input
                            type="checkbox"
                            checked={control.useLog}
                            onChange={e => onChange({ useLog: e.target.checked })}
                        />
                        Log scale (log1p)
                    </label>
                </div>

                <div className="form-row">
                    <label>
                        <input
                            type="checkbox"
                            checked={control.useClamp}
                            onChange={e => onChange({ useClamp: e.target.checked })}
                        />
                        Clamp overflow
                    </label>
                </div>
            </section>

            {/* 统计信息 */}
            {stats && (
                <section className="stats">
                    <h3>Statistics</h3>
                    <div className="stat-row"><span>Min:</span><span>{stats.min.toFixed(4)}</span></div>
                    <div className="stat-row"><span>Max:</span><span>{stats.max.toFixed(4)}</span></div>
                    <div className="stat-row"><span>P99:</span><span>{stats.p99.toFixed(4)}</span></div>
                    <div className="stat-row"><span>Mean:</span><span>{stats.mean.toFixed(4)}</span></div>
                </section>
            )}

            {/* Hover 信息 */}
            {pixelInfo && (
                <section className="pixel-info">
                    <h3>Cursor Position</h3>
                    <div className="stat-row"><span>Grid:</span><span>({pixelInfo.x}, {pixelInfo.y})</span></div>
                    <div className="stat-row"><span>World:</span><span>({pixelInfo.worldX.toFixed(1)}, {pixelInfo.worldY.toFixed(1)}, {pixelInfo.worldZ.toFixed(1)})</span></div>
                    <div className="stat-row"><span>Value:</span><span className="value-highlight">{pixelInfo.value.toFixed(4)}</span></div>
                </section>
            )}

            {/* 版本信息 */}
            {meta && (
                <section className="version-info">
                    <small>Build: {meta.version.buildTimeISO}</small>
                    <small>Hash: {meta.version.hash.substring(0, 8)}</small>
                </section>
            )}
        </div>
    );
};

export default ControlPanel;

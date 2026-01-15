/**
 * 主应用组件 v2
 * 2D: Y-slice (XZ 平面)
 * 3D: 全量 Volume
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MetaData, ControlState, SliceStats, PixelInfo } from './types';
import {
  loadMeta,
  loadAndAggregateYSlices,
  loadAndAggregateVolumes,
  computeStats
} from './utils/dataLoader';
import ControlPanel from './components/ControlPanel';
import Heatmap2D from './components/Heatmap2D';
import PointCloud3D from './components/PointCloud3D';
import './App.css';

const DEFAULT_CONTROL: ControlState = {
  axis: 'XY',
  ySlice: 0,       // Y 层 (0-7)
  selectedFishIds: [],
  selectedScenarioIndex: 0, // NEW
  colorMode: 'AutoP99',
  vmax: 1,
  useLog: false,
  useClamp: true,
  viewMode: '2D'
};

function App() {
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [control, setControl] = useState<ControlState>(DEFAULT_CONTROL);
  const [sliceData, setSliceData] = useState<Float32Array | null>(null);
  const [volumeData, setVolumeData] = useState<Float32Array | null>(null);
  const [stats, setStats] = useState<SliceStats | null>(null);
  const [pixelInfo, setPixelInfo] = useState<PixelInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载 meta.json
  useEffect(() => {
    loadMeta()
      .then(m => {
        setMeta(m);
        if (m.fishList.length > 0) {
          setControl(c => ({ ...c, selectedFishIds: [m.fishList[0].fishId] }));
        }
      })
      .catch(e => setError(`Failed to load meta.json: ${e.message}`));
  }, []);

  // 2D: 加载 Y-slice
  useEffect(() => {
    if (!meta || control.selectedFishIds.length === 0 || control.viewMode !== '2D') {
      return;
    }

    setLoading(true);
    loadAndAggregateYSlices(control.ySlice, control.selectedFishIds, control.selectedScenarioIndex)
      .then(data => {
        setSliceData(data);
        setStats(computeStats(data));
        setLoading(false);
      })
      .catch(e => {
        console.error('Failed to load Y-slice:', e);
        setLoading(false);
      });
  }, [meta, control.ySlice, control.selectedFishIds, control.viewMode, control.selectedScenarioIndex]);

  // 3D: 加载 Volume
  useEffect(() => {
    if (!meta || control.selectedFishIds.length === 0 || control.viewMode !== '3D') {
      return;
    }

    setLoading(true);
    loadAndAggregateVolumes(control.selectedFishIds, control.selectedScenarioIndex)
      .then(data => {
        setVolumeData(data);
        setStats(computeStats(data));
        setLoading(false);
      })
      .catch(e => {
        console.error('Failed to load Volume:', e);
        setLoading(false);
      });
  }, [meta, control.selectedFishIds, control.viewMode, control.selectedScenarioIndex]);

  // 计算有效 vmax
  const effectiveVmax = useMemo(() => {
    if (!stats) return 1;

    switch (control.colorMode) {
      case 'AutoP99':
        return stats.p99 > 0 ? stats.p99 : 1;
      case 'PerSlice':
        return stats.max > 0 ? stats.max : 1;
      case 'GlobalClamp':
        return control.vmax;
      default:
        return 1;
    }
  }, [stats, control.colorMode, control.vmax]);

  const handleControlChange = useCallback((updates: Partial<ControlState>) => {
    setControl(c => ({ ...c, ...updates }));
  }, []);

  const handleHover = useCallback((info: PixelInfo | null) => {
    setPixelInfo(info);
  }, []);

  const viewWidth = 800;
  const viewHeight = 800;

  if (error) {
    return (
      <div className="app error-screen">
        <h1>⚠️ Error</h1>
        <p>{error}</p>
        <p>Make sure <code>public/meta.json</code> exists.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <ControlPanel
        meta={meta}
        control={control}
        onChange={handleControlChange}
        stats={stats}
        pixelInfo={pixelInfo}
      />

      <main className="main-view">
        {loading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            Loading...
          </div>
        )}

        {control.viewMode === '2D' ? (
          <Heatmap2D
            data={sliceData}
            meta={meta}
            width={viewWidth}
            height={viewHeight}
            vmin={0}
            vmax={effectiveVmax}
            useLog={control.useLog}
            ySlice={control.ySlice}
            onHover={handleHover}
          />
        ) : (
          <PointCloud3D
            data={volumeData}
            meta={meta}
            vmin={0}
            vmax={effectiveVmax}
            useLog={control.useLog}
            threshold={0.01}
            width={viewWidth}
            height={viewHeight}
          />
        )}

        <div className="colorbar">
          <div className="colorbar-gradient"></div>
          <div className="colorbar-labels">
            <span>0</span>
            <span>{effectiveVmax.toFixed(2)}</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;

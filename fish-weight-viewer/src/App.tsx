/**
 * 主应用组件 v2
 * 2D: Y-slice (XZ 平面)
 * 3D: 全量 Volume
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { MetaData, ControlState, SliceStats, PixelInfo } from './types';
import {
  loadMeta,
  loadAndAggregateYSlices,
  loadAndAggregateVolumes,
  computeStats,
  getFishWeightsAt
} from './utils/dataLoader';
import ControlPanel from './components/ControlPanel';
import DetailPanel from './components/DetailPanel';
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

  // 详情面板状态
  const [selectedPoint, setSelectedPoint] = useState<{ x: number; y: number; z: number } | null>(null);
  const [pointWeights, setPointWeights] = useState<{ fishName: string; weight: number }[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

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

  // 动态视图尺寸 (ResizeObserver)
  const mainViewRef = useRef<HTMLDivElement>(null);
  const [viewSize, setViewSize] = useState({ width: 800, height: 800 });

  useEffect(() => {
    if (!mainViewRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        // Subtract padding (24px * 2 = 48px)
        const w = entry.contentRect.width - 48;
        const h = entry.contentRect.height - 48;
        setViewSize({
          width: Math.max(400, w),
          height: Math.max(400, h)
        });
      }
    });
    resizeObserver.observe(mainViewRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // 点击点位查看详情
  const handlePointClick = useCallback(async (x: number, y: number, z: number) => {
    if (!meta) return;

    setSelectedPoint({ x, y, z });
    setLoadingDetail(true);

    try {
      const weights = await getFishWeightsAt(x, y, z, meta.fishList, control.selectedScenarioIndex);
      setPointWeights(weights);
    } catch (e) {
      console.error('Failed to load point details:', e);
      setPointWeights([]);
    } finally {
      setLoadingDetail(false);
    }
  }, [meta]);

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

      {selectedPoint && (
        <DetailPanel
          x={selectedPoint.x}
          y={selectedPoint.y}
          z={selectedPoint.z}
          weights={pointWeights}
          loading={loadingDetail}
          onClose={() => setSelectedPoint(null)}
        />
      )}

      <main className="main-view" ref={mainViewRef}>
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
            width={viewSize.width}
            height={viewSize.height}
            vmin={0}
            vmax={effectiveVmax}
            useLog={control.useLog}
            ySlice={control.ySlice}
            onHover={handleHover}
            onPointClick={handlePointClick}
          />
        ) : (
          <PointCloud3D
            data={volumeData}
            meta={meta}
            vmin={0}
            vmax={effectiveVmax}
            useLog={control.useLog}
            threshold={0.01}
            width={viewSize.width}
            height={viewSize.height}
            onPointClick={handlePointClick}
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

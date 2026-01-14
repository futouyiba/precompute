# Fish Weight Viewer

基于 React + TypeScript + deck.gl 的鱼权重体数据可视化工具。

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 数据准备

### 方式一：使用 Mock 数据测试
```bash
python generate_mock_data.py
```

### 方式二：转换真实的 weights.bin
```bash
python convert_weights.py ../weights.bin public/data
```

## 功能特性

- **2D 热力图**：Canvas2D 渲染 XY 切片
- **3D 点云**：deck.gl OrbitView 支持旋转/缩放
- **鱼种选择**：支持单选/多选，多选时 Sum 聚合
- **颜色映射**：AutoP99 / GlobalClamp / PerSlice
- **LRU 缓存**：缓存最近 64 个切片避免重复加载

## 数据格式

### meta.json
```json
{
  "dims": {"x": 134, "y": 134, "z": 8, "f": 10},
  "grid": {"origin": [0,0,0], "step": [1,1,1]},
  "fishList": [{"fishId": 1001, "name": "鲤鱼"}],
  "encoding": {"dtype": "float32", "scale": 1.0, "offset": 0.0, "rowMajor": true}
}
```

### 切片文件
`public/data/slice_xy_z{z}_f{fishId}.bin` - 行主序 float32 数组

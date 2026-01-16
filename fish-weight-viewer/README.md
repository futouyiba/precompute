# Fish Weight Viewer

基于 React + TypeScript + deck.gl 的鱼权重体数据可视化工具。

## 快速开始 (Quick Start)

### 0. 前置要求

*   请确保已安装 **Node.js** (推荐 LTS 版本, v18+)。
*   验证安装: `node -v`

### 1. 数据准备 (Data Preparation)

**重要**：在启动可视化之前，必须先将 C# 预计算生成的二进制结果转换为 Web 可读的格式。

```bash
# 1. 确保上级目录 (../) 已经由 C# 程序生成了 `weights.bin` 和 `species_mapping.json`

# 2. 运行转换脚本
node convert_weights.cjs
```

> [!NOTE]
> 脚本会从上一级目录读取数据，转换并输出到本项目的 `public/data` 目录中。每次重新运行 C# 计算后，都需要重新运行此转换步骤。

### 2. 安装依赖

```bash
npm install
```

### 3. 运行开发服务器 (Development)

```bash
# 启动本地开发服务器
npm run dev

# 如果需要局域网访问 (例如用手机/平板查看)
npm run dev -- --host
```

启动后打开浏览器访问: [http://localhost:5173/](http://localhost:5173/) (或控制台显示的局域网 IP)。

### 4. 生产环境部署 (Production)

如果需要更优的性能或正式部署：

```bash
# 构建生产包
npm run build

# 预览生产包 (本地模拟运行)
npm run preview -- --host
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

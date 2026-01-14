/**
 * Node.js 版本的 weights.bin 转换脚本 v2
 * 按 Y (高度) 切片：slice_xz_y{y}_f{fishId}.bin
 * 同时生成 3D 全量数据：volume_f{fishId}.bin
 * 
 * 运行: node convert_weights_v2.cjs
 */
const fs = require('fs');
const path = require('path');

// 读取 species_mapping.json
const speciesMapping = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'species_mapping.json'), 'utf-8')
);
console.log(`Loaded ${speciesMapping.length} species from mapping`);

// 读取 weights.bin
const weightsPath = path.join(__dirname, '..', 'weights.bin');
const buffer = fs.readFileSync(weightsPath);
console.log(`Loaded weights.bin: ${buffer.length} bytes`);

// 解析 Header
let offset = 0;
const magic = buffer.readUInt32LE(offset); offset += 4;
if (magic !== 0x46495348) {
    throw new Error(`Invalid magic number: 0x${magic.toString(16)}`);
}

const version = buffer.readUInt32LE(offset); offset += 4;
const dimX = buffer.readUInt32LE(offset); offset += 4;
const dimY = buffer.readUInt32LE(offset); offset += 4;  // 高度层 (8)
const dimZ = buffer.readUInt32LE(offset); offset += 4;
const numSpecies = buffer.readUInt32LE(offset); offset += 4;

console.log(`Version: ${version}`);
console.log(`Dimensions: X=${dimX}, Y=${dimY} (height), Z=${dimZ}`);
console.log(`Species count: ${numSpecies}`);

// 读取 Species IDs
const speciesIds = [];
for (let i = 0; i < numSpecies; i++) {
    speciesIds.push(buffer.readUInt32LE(offset));
    offset += 4;
}

const dataOffset = offset;

// 创建输出目录
const outputDir = path.join(__dirname, 'public', 'data');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// 清空旧文件
const oldFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.bin'));
oldFiles.forEach(f => fs.unlinkSync(path.join(outputDir, f)));
console.log(`Cleared ${oldFiles.length} old files`);

// weights.bin 格式: data[x][y][z][species] (C order)
// flatIndex = (x * dimY * dimZ + y * dimZ + z) * numSpecies + s

console.log('\n=== Generating Y-slices (for 2D view) ===');
// 按 Y 切片：每个切片是 XZ 平面
for (let y = 0; y < dimY; y++) {
    for (let s = 0; s < numSpecies; s++) {
        const fishId = speciesIds[s];

        // 创建 XZ 切片 (dimX * dimZ)
        const sliceData = new Float32Array(dimX * dimZ);

        for (let z = 0; z < dimZ; z++) {
            for (let x = 0; x < dimX; x++) {
                const flatIndex = (x * dimY * dimZ + y * dimZ + z) * numSpecies + s;
                const byteOffset = dataOffset + flatIndex * 4;
                const value = buffer.readFloatLE(byteOffset);

                // 行主序: z * dimX + x
                sliceData[z * dimX + x] = value;
            }
        }

        const filename = `slice_xz_y${y}_f${fishId}.bin`;
        fs.writeFileSync(path.join(outputDir, filename), Buffer.from(sliceData.buffer));
    }
    console.log(`  Y=${y} done (${numSpecies} species)`);
}

console.log('\n=== Generating 3D volumes (for 3D view) ===');
// 为 3D 视图生成完整体数据
for (let s = 0; s < numSpecies; s++) {
    const fishId = speciesIds[s];

    // 全量数据: dimX * dimY * dimZ
    const volumeData = new Float32Array(dimX * dimY * dimZ);

    for (let x = 0; x < dimX; x++) {
        for (let y = 0; y < dimY; y++) {
            for (let z = 0; z < dimZ; z++) {
                const flatIndex = (x * dimY * dimZ + y * dimZ + z) * numSpecies + s;
                const byteOffset = dataOffset + flatIndex * 4;
                const value = buffer.readFloatLE(byteOffset);

                // 输出顺序: x * dimY * dimZ + y * dimZ + z
                const outIndex = x * dimY * dimZ + y * dimZ + z;
                volumeData[outIndex] = value;
            }
        }
    }

    const filename = `volume_f${fishId}.bin`;
    fs.writeFileSync(path.join(outputDir, filename), Buffer.from(volumeData.buffer));

    if ((s + 1) % 10 === 0) {
        console.log(`  ${s + 1}/${numSpecies} species done`);
    }
}
console.log(`  ${numSpecies}/${numSpecies} species done`);

// 生成 meta.json
const fishList = speciesIds.map((id) => {
    const mapping = speciesMapping.find(m => m.fishEnvId === id);
    return {
        fishId: id,
        name: mapping ? mapping.name : `Fish_${id}`
    };
});

const meta = {
    dims: { x: dimX, y: dimY, z: dimZ, f: numSpecies },
    grid: {
        origin: [12.6, -6.8, -147.3],
        step: [1.5, 1.0, 1.5]
    },
    fishList: fishList,
    encoding: {
        dtype: 'float32',
        scale: 1.0,
        offset: 0.0,
        rowMajor: true
    },
    version: {
        buildTimeISO: new Date().toISOString(),
        hash: 'weights_bin_v2'
    }
};

fs.writeFileSync(path.join(__dirname, 'public', 'meta.json'), JSON.stringify(meta, null, 2));

const totalSlices = dimY * numSpecies;
const totalVolumes = numSpecies;
console.log(`\nDone! Generated ${totalSlices} Y-slices + ${totalVolumes} volumes.`);

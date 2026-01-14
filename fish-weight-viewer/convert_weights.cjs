/**
 * Node.js 版本的 weights.bin 转换脚本
 * 将 FishWeightPrecomputer 生成的 weights.bin 转换为切片格式
 * 运行: node convert_weights.cjs
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
const dimY = buffer.readUInt32LE(offset); offset += 4;
const dimZ = buffer.readUInt32LE(offset); offset += 4;
const numSpecies = buffer.readUInt32LE(offset); offset += 4;

console.log(`Version: ${version}`);
console.log(`Dimensions: ${dimX} x ${dimY} x ${dimZ}`);
console.log(`Species count: ${numSpecies}`);

// 读取 Species IDs
const speciesIds = [];
for (let i = 0; i < numSpecies; i++) {
    speciesIds.push(buffer.readUInt32LE(offset));
    offset += 4;
}
console.log(`Species IDs (first 5): ${speciesIds.slice(0, 5).join(', ')}...`);

// 数据起始位置
const dataOffset = offset;
const totalFloats = dimX * dimY * dimZ * numSpecies;
console.log(`Data offset: ${dataOffset}, Total floats: ${totalFloats}`);

// 创建输出目录
const outputDir = path.join(__dirname, 'public', 'data');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// 清空旧文件
const oldFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.bin'));
oldFiles.forEach(f => fs.unlinkSync(path.join(outputDir, f)));
console.log(`Cleared ${oldFiles.length} old files`);

// 提取切片
// weights.bin 格式: data[x][y][z][species] (C order)
// flatIndex = (x * dimY * dimZ + y * dimZ + z) * numSpecies + s
console.log('\nExtracting slices...');

for (let z = 0; z < dimZ; z++) {
    for (let s = 0; s < numSpecies; s++) {
        const fishId = speciesIds[s];

        // 创建切片数据 (行主序: Y 变化最慢)
        const sliceData = new Float32Array(dimX * dimY);

        for (let y = 0; y < dimY; y++) {
            for (let x = 0; x < dimX; x++) {
                // 读取 weights.bin 中的值
                const flatIndex = (x * dimY * dimZ + y * dimZ + z) * numSpecies + s;
                const byteOffset = dataOffset + flatIndex * 4;
                const value = buffer.readFloatLE(byteOffset);

                // 写入切片 (行主序)
                sliceData[y * dimX + x] = value;
            }
        }

        // 保存文件
        const filename = `slice_xy_z${z}_f${fishId}.bin`;
        const filepath = path.join(outputDir, filename);
        fs.writeFileSync(filepath, Buffer.from(sliceData.buffer));
    }
    console.log(`  Z=${z} done (${numSpecies} species)`);
}

// 生成 meta.json
const fishList = speciesIds.map((id, idx) => {
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
        hash: 'weights_bin_converted'
    }
};

const metaPath = path.join(__dirname, 'public', 'meta.json');
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(`\nGenerated meta.json with ${fishList.length} species`);

console.log(`\nDone! Generated ${dimZ * numSpecies} slice files.`);

/**
 * Node.js 版本的 weights.bin 转换脚本
 * 支持 V2 多重天气场景
 * 按 Y (高度) 切片：s{scenario}_slice_xz_y{y}_f{fishId}.bin
 * 同时生成 3D 全量数据：s{scenario}_volume_f{fishId}.bin
 * 
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

// Cursor management
let offset = 0;
function readUInt32() {
    const val = buffer.readUInt32LE(offset);
    offset += 4;
    return val;
}
function readFloat() {
    const val = buffer.readFloatLE(offset);
    offset += 4;
    return val;
}
// Helper for C# BinaryWriter 7-bit encoded string length
function readString() {
    let count = 0;
    let shift = 0;
    let b;
    do {
        if (offset >= buffer.length) throw new Error("End of stream reading 7-bit int");
        b = buffer[offset++];
        count |= (b & 0x7F) << shift;
        shift += 7;
    } while ((b & 0x80) !== 0);

    // Read bytes
    const strBuffer = buffer.subarray(offset, offset + count);
    offset += count;
    return strBuffer.toString('utf8');
}

// 解析 Header
const magic = readUInt32();
if (magic !== 0x46495348) {
    throw new Error(`Invalid magic number: 0x${magic.toString(16)}`);
}

const version = readUInt32();
const dimX = readUInt32();
const dimY = readUInt32();  // 高度层 (8)
const dimZ = readUInt32();
const numSpecies = readUInt32();

console.log(`Version: ${version}`);
console.log(`Dimensions: X=${dimX}, Y=${dimY}, Z=${dimZ}`);
console.log(`Species count: ${numSpecies}`);

let numScenarios = 1;
let scenarioNames = ["Default"];

if (version >= 2) {
    numScenarios = readUInt32();
    console.log(`Scenarios count: ${numScenarios}`);
}

// 读取 Species IDs
const speciesIds = [];
for (let i = 0; i < numSpecies; i++) {
    speciesIds.push(readUInt32());
}

// 读取 Scenario Names (Only for V2+)
if (version >= 2) {
    scenarioNames = [];
    for (let i = 0; i < numScenarios; i++) {
        scenarioNames.push(readString());
    }
    console.log("Scenarios:", scenarioNames);
}

// 创建输出目录
const outputDir = path.join(__dirname, 'public', 'data');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// 清空旧文件 (Remove all .bin files)
const oldFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.bin'));
oldFiles.forEach(f => fs.unlinkSync(path.join(outputDir, f)));
console.log(`Cleared ${oldFiles.length} old binary files`);

// 循环处理每个场景
// weights.bin (V2) 格式: For each scenario => data[x][y][z][species]
// dataOffset points to start of data
console.log(`\nStarting data processing from offset ${offset}...`);

for (let scenarioIdx = 0; scenarioIdx < numScenarios; scenarioIdx++) {
    const scenarioName = scenarioNames[scenarioIdx];
    console.log(`\n=== Processing Scenario ${scenarioIdx}: ${scenarioName} ===`);

    // The data is stored scenario by scenario. 
    // We need to read the entire block for this scenario.
    // However, the structure in file is flattened: [All Voxels for S0] [All Voxels for S1] ...
    // And each voxel block is [species0, species1...].
    // So logic is identical to V1, just repeated.

    const sliceDataStartOffset = offset;

    // 1. Generate Y-slices (2D)
    // To minimize memory, we might need to seek around or read into memory.
    // Since file is 240MB, we can't easily jump around without reading.
    // But 'offset' variable is global strictly sequential read pointer.
    // If we want to do "slicing", we need to iterate the whole block.
    // Challenge: Generating Y-slices means we need to pull XZ planes. 
    // In the file, order is X -> Y -> Z -> Species.
    // Wait, let's recheck V1 comments:
    // "weights.bin 格式: data[x][y][z][species]"
    // X loops outermost, then Y, then Z. 
    // To get a Y-slice (constant Y, vary X, Z), we need to visit every X.

    // Strategy: Read the entire scenario block into a temporary Float32Array in memory?
    // Block size = X * Y * Z * Species * 4 bytes.
    // 134*8*134 * 35 * 4 = 143,648 * 35 * 4 ~= 20 MB.
    // This is very small. We can buffer one scenario in memory easily.

    const elementsPerScenario = dimX * dimY * dimZ * numSpecies;
    const scenarioBuffer = new Float32Array(elementsPerScenario);

    // Bulk read from node buffer?
    // buffer.readFloatLE is slow in tight loop. 
    // Buffer.subarray + TypedArray is faster but endianness matters. 
    // Node Buffer is usually LE on Intel, but to be safe loop valid.
    // Actually, creating a DataView or using Buffer directly is cleaner.
    // Let's stick to readFloat for simplicity, or buffer.copy if we trust endianness (Node Buffer is usually host endian? No, usually distinct).
    // Let's loop readFloatLE. 20MB is ~5 million floats. might take a sec but fine.

    for (let i = 0; i < elementsPerScenario; i++) {
        scenarioBuffer[i] = readFloat();
    }

    // Now we have the data in memory for this scenario.
    // Indexing: mapping input flat index to [x,y,z,s]
    // Input loop was: x, y, z, s
    // flatIndex = (x * dimY * dimZ + y * dimZ + z) * numSpecies + s

    // Generate Y-slices
    // file: s{scen}_slice_xz_y{y}_f{fishId}.bin
    for (let y = 0; y < dimY; y++) {
        for (let s = 0; s < numSpecies; s++) {
            const fishId = speciesIds[s];
            const sliceArr = new Float32Array(dimX * dimZ);

            for (let x = 0; x < dimX; x++) {
                for (let z = 0; z < dimZ; z++) {
                    const srcIndex = (x * dimY * dimZ + y * dimZ + z) * numSpecies + s;
                    const val = scenarioBuffer[srcIndex];
                    // Output row-major for texture/display: typically z*width + x or y*width + x
                    // Original code: sliceData[z * dimX + x]
                    sliceArr[z * dimX + x] = val;
                }
            }

            const filename = `s${scenarioIdx}_slice_xz_y${y}_f${fishId}.bin`;
            fs.writeFileSync(path.join(outputDir, filename), Buffer.from(sliceArr.buffer));
        }
    }

    // Generate Volumes
    // file: s{scen}_volume_f{fishId}.bin
    for (let s = 0; s < numSpecies; s++) {
        const fishId = speciesIds[s];
        const volArr = new Float32Array(dimX * dimY * dimZ);

        for (let x = 0; x < dimX; x++) {
            for (let y = 0; y < dimY; y++) {
                for (let z = 0; z < dimZ; z++) {
                    const srcIndex = (x * dimY * dimZ + y * dimZ + z) * numSpecies + s;
                    const val = scenarioBuffer[srcIndex];

                    const destIndex = x * dimY * dimZ + y * dimZ + z;
                    volArr[destIndex] = val;
                }
            }
        }

        const filename = `s${scenarioIdx}_volume_f${fishId}.bin`;
        fs.writeFileSync(path.join(outputDir, filename), Buffer.from(volArr.buffer));
    }

    console.log(`  Scenario ${scenarioIdx} processed.`);
}

console.log('All scenarios processed.');

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
        origin: [12.6, -6.8, -147.3], // TODO: Read from config if possible, hardcoded for now
        step: [1.5, 1.0, 1.5]
    },
    fishList: fishList,
    scenarios: scenarioNames, // NEW FIELD
    encoding: {
        dtype: 'float32',
        scale: 1.0,
        offset: 0.0,
        rowMajor: true
    },
    version: {
        buildTimeISO: new Date().toISOString(),
        hash: 'weights_bin_v2_multi_scenario'
    }
};

fs.writeFileSync(path.join(__dirname, 'public', 'meta.json'), JSON.stringify(meta, null, 2));

console.log(`\nDone! Meta.json updated with ${scenarioNames.length} scenarios.`);

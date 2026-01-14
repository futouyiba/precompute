"""
weights.bin 转换为切片文件的脚本
将 FishWeightPrecomputer 生成的 weights.bin 转换为 Web 可视化工具需要的切片格式
"""
import struct
import numpy as np
import json
import os
from pathlib import Path

def convert_weights_bin(input_path: str, output_dir: str):
    """
    将 weights.bin 转换为按 Z 和 FishId 分片的文件
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    with open(input_path, 'rb') as f:
        # 读取 Header
        magic = struct.unpack('<I', f.read(4))[0]
        if magic != 0x46495348:  # "FISH"
            raise ValueError(f"Invalid magic number: {hex(magic)}")
        
        version = struct.unpack('<I', f.read(4))[0]
        dim_x = struct.unpack('<I', f.read(4))[0]
        dim_y = struct.unpack('<I', f.read(4))[0]
        dim_z = struct.unpack('<I', f.read(4))[0]
        num_species = struct.unpack('<I', f.read(4))[0]
        
        print(f"Version: {version}")
        print(f"Dimensions: {dim_x} x {dim_y} x {dim_z}")
        print(f"Species count: {num_species}")
        
        # 读取 Species IDs
        species_ids = []
        for _ in range(num_species):
            sid = struct.unpack('<I', f.read(4))[0]
            species_ids.append(sid)
        
        print(f"Species IDs: {species_ids[:5]}... (showing first 5)")
        
        # 读取数据
        total_elements = dim_x * dim_y * dim_z * num_species
        data = np.frombuffer(f.read(total_elements * 4), dtype=np.float32)
        
        # Reshape to [X, Y, Z, Species]
        data = data.reshape((dim_x, dim_y, dim_z, num_species))
        
        print(f"Data shape: {data.shape}")
        print(f"Data range: {data.min():.4f} - {data.max():.4f}")
    
    # 生成切片文件
    print(f"\nWriting slice files to {output_dir}...")
    
    for z in range(dim_z):
        for s, fish_id in enumerate(species_ids):
            # 提取切片: data[:, :, z, s] -> XY 平面
            # 输出为行主序 (Y 变化最慢)
            slice_data = data[:, :, z, s].T.astype(np.float32)  # 转置为 [Y, X]
            
            filename = f"slice_xy_z{z}_f{fish_id}.bin"
            filepath = output_path / filename
            slice_data.tofile(filepath)
        
        print(f"  Z={z} done")
    
    # 生成 meta.json
    meta = {
        "dims": {
            "x": dim_x,
            "y": dim_y,
            "z": dim_z,
            "f": num_species
        },
        "grid": {
            "origin": [12.6, -6.8, -147.3],  # 可根据实际情况调整
            "step": [1.5, 1.0, 1.5]
        },
        "fishList": [{"fishId": sid, "name": f"Fish_{sid}"} for sid in species_ids],
        "encoding": {
            "dtype": "float32",
            "scale": 1.0,
            "offset": 0.0,
            "rowMajor": True
        },
        "version": {
            "buildTimeISO": "2026-01-14T14:35:00+08:00",
            "hash": "auto_generated"
        }
    }
    
    meta_path = output_path.parent / 'meta.json'
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    
    print(f"\nGenerated {dim_z * num_species} slice files")
    print(f"Meta file: {meta_path}")

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python convert_weights.py <weights.bin> [output_dir]")
        print("Example: python convert_weights.py ../weights.bin public/data")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else 'public/data'
    
    convert_weights_bin(input_file, output_dir)

#!/usr/bin/env python3
"""
Sprint 7: Export YuNet ONNX weights to flat binary format for C engine.

Format: "YNET" magic (4B) + n_tensors (4B) + [size(4B) + data]...
Each tensor stored as FP32 contiguously.
"""
import onnx
import numpy as np
import struct
import sys

def main():
    onnx_path = sys.argv[1] if len(sys.argv) > 1 else "weights/yunet_2023mar.onnx"
    out_path = sys.argv[2] if len(sys.argv) > 2 else "weights/yunet_fp32.bin"

    model = onnx.load(onnx_path)

    # Collect all initializers in order
    tensors = []
    names = []
    for init in model.graph.initializer:
        if init.data_type == 1:  # float32
            arr = np.frombuffer(init.raw_data, dtype=np.float32).copy()
        elif init.data_type == 7:  # int64
            arr = np.frombuffer(init.raw_data, dtype=np.int64).astype(np.float32)
        else:
            arr = np.array(onnx.numpy_helper.to_array(init), dtype=np.float32).flatten()
        tensors.append(arr)
        names.append(init.name)

    # Write binary
    with open(out_path, 'wb') as f:
        f.write(b'YNET')  # magic
        f.write(struct.pack('I', len(tensors)))  # n_tensors

        for i, (name, arr) in enumerate(zip(names, tensors)):
            data = arr.tobytes()
            f.write(struct.pack('I', len(data)))  # size in bytes
            f.write(data)

    total_bytes = 8 + sum(4 + len(t.tobytes()) for t in tensors)
    print(f"Exported {len(tensors)} tensors to {out_path}")
    print(f"File size: {total_bytes:,} bytes ({total_bytes/1024:.1f} KB)")

    # Save name map for debugging
    with open(out_path.replace('.bin', '_names.txt'), 'w') as f:
        for i, (name, arr) in enumerate(zip(names, tensors)):
            f.write(f"{i:3d} {name:50s} {arr.shape} {arr.size} params\n")

    print(f"Name map: {out_path.replace('.bin', '_names.txt')}")

if __name__ == '__main__':
    main()

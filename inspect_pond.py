import json
from pathlib import Path

DATA_ROOT = Path(r'D:\fishinggame\precompute\data\1\1001')

def load_json(filename):
    with open(DATA_ROOT / filename, 'r', encoding='utf-8') as f:
        return json.load(f)

pond_list = load_json('fish_pond_list.json')
first_pond = next(iter(pond_list.values()))

with open('pond_debug.txt', 'w', encoding='utf-8') as f:
    f.write(f"Keys: {list(first_pond.keys())}\n")
    f.write(f"Content: {json.dumps(first_pond, indent=2, ensure_ascii=False)}\n")

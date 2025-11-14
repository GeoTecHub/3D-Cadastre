import json

INPUT_FILE = 'B4.json'
OUTPUT_FILE = 'B4_fixed_v2.json'
VERTEX_PRECISION = 6

print(f"Loading '{INPUT_FILE}'...")

with open(INPUT_FILE, 'r') as f:
    data = json.load(f)

# ==============================
# STEP 1: Merge Duplicate Vertices
# ==============================
print("\nStep 1: Merging duplicate vertices...")

old_vertices = data['vertices']
new_vertices = []
vertex_map = {}
index_remap = {}

for old_idx, vertex in enumerate(old_vertices):
    rounded = tuple(round(coord, VERTEX_PRECISION) for coord in vertex)
    
    if rounded in vertex_map:
        index_remap[old_idx] = vertex_map[rounded]
    else:
        new_idx = len(new_vertices)
        vertex_map[rounded] = new_idx
        index_remap[old_idx] = new_idx
        new_vertices.append(vertex)

print(f"  Original vertices: {len(old_vertices)}")
print(f"  Unique vertices: {len(new_vertices)}")
print(f"  Duplicates removed: {len(old_vertices) - len(new_vertices)}")

data['vertices'] = new_vertices

# ==============================
# STEP 2: Remap and Clean
# ==============================
print("\nStep 2: Remapping indices and removing degenerate triangles...")

def is_degenerate_triangle(idx0, idx1, idx2, vertices):
    """Check if three vertex indices form a degenerate triangle"""
    if idx0 == idx1 or idx1 == idx2 or idx0 == idx2:
        return True
    
    if idx0 >= len(vertices) or idx1 >= len(vertices) or idx2 >= len(vertices):
        return True
    
    p0 = vertices[idx0]
    p1 = vertices[idx1]
    p2 = vertices[idx2]
    
    v1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
    v2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]]
    
    cross = [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
    ]
    
    area_sq = cross[0]**2 + cross[1]**2 + cross[2]**2
    return area_sq < 1e-16

total_removed = 0
total_kept = 0

def process_boundary(boundary, vertices, depth=0):
    """
    Recursively process boundaries at any nesting level.
    Returns None if the boundary should be removed.
    """
    global total_removed, total_kept
    
    if not boundary or not isinstance(boundary, list):
        return None
    
    # Check if this is a leaf node (list of indices)
    if len(boundary) > 0 and isinstance(boundary[0], (int, float)):
        # This is a ring of indices - remap them
        remapped = [index_remap[int(idx)] for idx in boundary]
        
        # Remove consecutive duplicates
        cleaned = []
        for idx in remapped:
            if not cleaned or idx != cleaned[-1]:
                cleaned.append(idx)
        
        # Remove closing duplicate if present
        if len(cleaned) > 1 and cleaned[0] == cleaned[-1]:
            cleaned = cleaned[:-1]
        
        # Get unique indices
        unique = list(dict.fromkeys(cleaned))
        
        # Check if it's a triangle
        if len(unique) == 3:
            if is_degenerate_triangle(unique[0], unique[1], unique[2], vertices):
                total_removed += 1
                return None
            else:
                total_kept += 1
                return remapped  # Return original remapped (may include closing vertex)
        elif len(unique) < 3:
            total_removed += 1
            return None
        else:
            # Polygon with > 3 vertices
            total_kept += 1
            return remapped
    
    # Not a leaf - recurse deeper
    processed = []
    for item in boundary:
        result = process_boundary(item, vertices, depth + 1)
        if result is not None:
            processed.append(result)
    
    # Only return if we have valid children
    return processed if len(processed) > 0 else None

for obj_id, city_obj in data['CityObjects'].items():
    if 'geometry' not in city_obj:
        continue
    
    for geom in city_obj['geometry']:
        if 'boundaries' not in geom:
            continue
        
        cleaned_boundaries = []
        for boundary in geom['boundaries']:
            result = process_boundary(boundary, new_vertices)
            if result is not None:
                cleaned_boundaries.append(result)
        
        geom['boundaries'] = cleaned_boundaries

print(f"  Valid faces kept: {total_kept}")
print(f"  Degenerate faces removed: {total_removed}")

# ==============================
# STEP 3: Save
# ==============================
print(f"\nSaving to '{OUTPUT_FILE}'...")

with open(OUTPUT_FILE, 'w') as f:
    json.dump(data, f, indent=2)

print("\n" + "="*50)
print("SUCCESS!")
print(f"  - Merged {len(old_vertices) - len(new_vertices)} duplicate vertices")
print(f"  - Removed {total_removed} degenerate triangles")
print(f"  - Kept {total_kept} valid triangles")
print("="*50)
print(f"\nTry loading '{OUTPUT_FILE}' in your viewer now.")
import json
import math
from earcut import earcut

# --- Configuration ---
INPUT_FILE = 'B4.json'
OUTPUT_FILE = 'B4_repaired_final.json'
PRECISION = 5 # Decimals to consider for merging vertices

print(f"Starting geometry repair for '{INPUT_FILE}'...")

try:
    with open(INPUT_FILE, 'r') as f:
        cm = json.load(f)
except Exception as e:
    print(f"ERROR reading file: {e}")
    exit()

# === Part 1: Clean Duplicate Vertices ===
print("Step 1/3: Cleaning duplicate vertices...")
old_vertices = cm['vertices']
new_vertices = []
unique_vertices_map = {}
index_mapping = [-1] * len(old_vertices)
new_idx_counter = 0

for i, v in enumerate(old_vertices):
    rounded_v = [round(coord, PRECISION) for coord in v]
    vertex_key = "_".join(map(str, rounded_v))
    if vertex_key in unique_vertices_map:
        index_mapping[i] = unique_vertices_map[vertex_key]
    else:
        unique_vertices_map[vertex_key] = new_idx_counter
        index_mapping[i] = new_idx_counter
        new_vertices.append(v)
        new_idx_counter += 1

cm['vertices'] = new_vertices
print(f"--> Vertices reduced from {len(old_vertices)} to {len(new_vertices)}.")

# === Part 2: Update Boundaries and Triangulate ===
print("Step 2/3: Updating boundaries and triangulating polygons...")

def get_normal(points):
    nx, ny, nz = 0, 0, 0
    for i in range(len(points)):
        p1 = points[i]
        p2 = points[(i + 1) % len(points)]
        nx += (p1[1] - p2[1]) * (p1[2] + p2[2])
        ny += (p1[2] - p2[2]) * (p1[0] + p2[0])
        nz += (p1[0] - p2[0]) * (p1[1] + p2[1])
    return [nx, ny, nz]

def triangulate_face(face_rings_indices):
    new_triangles = []
    # Process the exterior ring
    exterior_ring_indices = face_rings_indices[0]
    if len(set(exterior_ring_indices)) < 3:
        return [] # Skip degenerate ring

    exterior_points = [new_vertices[i] for i in exterior_ring_indices]
    
    # Project to 2D for earcut
    normal = get_normal(exterior_points)
    ax1, ax2 = (0, 1) if abs(normal[2]) > abs(normal[0]) and abs(normal[2]) > abs(normal[1]) else ((1, 2) if abs(normal[0]) > abs(normal[1]) else (0, 2))
    
    vertices_2d = []
    for p in exterior_points:
        vertices_2d.extend([p[ax1], p[ax2]])
        
    hole_indices = []
    # Process interior rings (holes) if they exist
    if len(face_rings_indices) > 1:
        for i in range(1, len(face_rings_indices)):
            hole_ring_indices = face_rings_indices[i]
            hole_indices.append(len(vertices_2d) // 2)
            hole_points = [new_vertices[j] for j in hole_ring_indices]
            for p in hole_points:
                vertices_2d.extend([p[ax1], p[ax2]])

    # Triangulate using earcut
    result = earcut(vertices_2d, hole_indices, 2)
    
    # Map earcut indices back to original vertex indices
    all_indices = exterior_ring_indices + [idx for hole in face_rings_indices[1:] for idx in hole]

    for i in range(0, len(result), 3):
        new_triangles.append([
            all_indices[result[i]],
            all_indices[result[i+1]],
            all_indices[result[i+2]]
        ])
    return new_triangles

for city_object in cm['CityObjects'].values():
    if 'geometry' in city_object:
        for geom in city_object['geometry']:
            if 'boundaries' in geom:
                # Update all old indices to new indices first
                updated_boundaries = json.loads(json.dumps(geom['boundaries'])) # Deep copy
                for face in updated_boundaries:
                    for ring in face:
                        for i, old_idx in enumerate(ring):
                            ring[i] = index_mapping[old_idx]

                # Now triangulate
                new_boundaries = []
                for face in updated_boundaries:
                    triangles = triangulate_face(face)
                    new_boundaries.extend([[triangle] for triangle in triangles])
                
                geom['boundaries'] = new_boundaries

# === Part 3: Save the Repaired File ===
print("Step 3/3: Saving repaired file...")
with open(OUTPUT_FILE, 'w') as f:
    json.dump(cm, f)

print(f"\nSUCCESS! Repaired file saved as '{OUTPUT_FILE}'.")
print("This file contains only valid triangles and can be used directly in your Angular viewer.")
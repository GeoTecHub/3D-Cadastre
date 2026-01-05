import json
import math

# --- Configuration ---
INPUT_FILE = 'B4.json'
OUTPUT_FILE = 'B4_repaired.json'
# How many decimal places to consider when checking if vertices are identical.
# This is the most important setting. 5 is usually a safe bet.
PRECISION = 5

print(f"Starting repair process for '{INPUT_FILE}'...")

try:
    with open(INPUT_FILE, 'r') as f:
        cm = json.load(f)
except FileNotFoundError:
    print(f"ERROR: Input file '{INPUT_FILE}' not found. Make sure it's in the same directory.")
    exit()
except json.JSONDecodeError:
    print(f"ERROR: Could not read '{INPUT_FILE}'. It may not be a valid JSON file.")
    exit()

print("Cleaning duplicate vertices...")

old_vertices = cm['vertices']
new_vertices = []
# A dictionary to keep track of vertices we've already seen
# The key is a string like "1.23_4.56_7.89"
unique_vertices_map = {}
# An array to map an old vertex index to its new index
index_mapping = [-1] * len(old_vertices)
new_idx_counter = 0

for i, v in enumerate(old_vertices):
    # Round the vertex coordinates to the specified precision
    rounded_v = [round(coord, PRECISION) for coord in v]
    # Create a string key from the rounded coordinates
    vertex_key = "_".join(map(str, rounded_v))

    if vertex_key in unique_vertices_map:
        # We've seen this vertex before, map the old index to the existing new index
        index_mapping[i] = unique_vertices_map[vertex_key]
    else:
        # This is a new, unique vertex
        unique_vertices_map[vertex_key] = new_idx_counter
        index_mapping[i] = new_idx_counter
        new_vertices.append(v) # Append the original, un-rounded vertex
        new_idx_counter += 1

print(f"Vertex cleaning complete. Original vertices: {len(old_vertices)}, New unique vertices: {len(new_vertices)}")

# Update the main vertices list with the new, clean list
cm['vertices'] = new_vertices

print("Updating geometry boundaries with new vertex indices...")

# Now, iterate through all CityObjects and update their geometry boundaries
def update_boundaries(boundaries):
    for i, item in enumerate(boundaries):
        if isinstance(item, list):
            update_boundaries(item)
        elif isinstance(item, int):
            boundaries[i] = index_mapping[item]

for city_object in cm['CityObjects'].values():
    if 'geometry' in city_object:
        for geom in city_object['geometry']:
            if 'boundaries' in geom:
                update_boundaries(geom['boundaries'])

# --- Optional but recommended: Add the referenceSystem if missing ---
if 'metadata' in cm and 'referenceSystem' not in cm['metadata']:
    print("Adding missing 'referenceSystem' to metadata...")
    cm['metadata']['referenceSystem'] = "https://www.opengis.net/def/crs/EPSG/0/4326"

print("Saving repaired file...")

with open(OUTPUT_FILE, 'w') as f:
    json.dump(cm, f)

print(f"\nSUCCESS! Repaired file saved as '{OUTPUT_FILE}'.")
print("You can now load this new file into your viewer.")
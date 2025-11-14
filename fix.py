import json

INPUT_FILE = 'B4.json'
OUTPUT_FILE = 'B4_repaired_final.json'

print(f"Starting geometry repair for '{INPUT_FILE}'...")

try:
    with open(INPUT_FILE, 'r') as f:
        cm = json.load(f)
except Exception as e:
    print(f"ERROR: Could not read the input file. {e}")
    exit()

vertices = cm['vertices']
degenerate_count = 0
total_faces = 0

print("Scanning all objects and filtering out degenerate triangles...")

# --- Helper functions for vector math ---
def sub(p2, p1):
    return [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]

def cross_product(a, b):
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ]

def length_squared(v):
    return v[0]**2 + v[1]**2 + v[2]**2

# --- Iterate through all geometries to clean them ---
for city_object in cm['CityObjects'].values():
    if 'geometry' in city_object:
        for geom in city_object['geometry']:
            if 'boundaries' in geom:
                new_boundaries = []
                for face in geom['boundaries']:
                    total_faces += 1
                    # Your file has pre-triangulated faces with this structure: [[[v1, v2, v3]]]
                    if len(face) == 1 and len(face[0]) == 1 and len(face[0][0]) == 3:
                        indices = face[0][0]
                        
                        # Check for invalid indices before trying to access them
                        if any(idx >= len(vertices) or idx < 0 for idx in indices):
                            print(f"Warning: Found invalid vertex index in face {indices}. Skipping.")
                            degenerate_count += 1
                            continue

                        p1 = vertices[indices[0]]
                        p2 = vertices[indices[1]]
                        p3 = vertices[indices[2]]

                        # Check for collinearity by calculating the area of the triangle.
                        # If the cross product's length is near zero, the points are on a line.
                        if length_squared(cross_product(sub(p2, p1), sub(p3, p1))) < 1e-12:
                            degenerate_count += 1
                        else:
                            new_boundaries.append(face)
                    else:
                        # Keep any non-triangular faces (though there shouldn't be any)
                        new_boundaries.append(face)
                
                geom['boundaries'] = new_boundaries

# --- Save the repaired file ---
with open(OUTPUT_FILE, 'w') as f:
    json.dump(cm, f)

print(f"\nProcessing complete.")
print(f"Total faces scanned: {total_faces}")
print(f"Removed {degenerate_count} degenerate triangles.")
print(f"SUCCESS! A clean file has been saved as '{OUTPUT_FILE}'.")
print("Please load this file into your Angular viewer.")
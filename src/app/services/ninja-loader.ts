// services/ninja-loader.service.ts

import { Injectable } from '@angular/core';
import * as THREE from 'three';
import earcut from 'earcut';
import { CityjsonService } from './cityjson';

import { CityJSON } from './cityjson.model'; // We need our data model!

@Injectable({
  providedIn: 'root'
})
export class NinjaLoader {
  
  // STEP 1: Inject the CityjsonService in the constructor.
  // This is the correct Angular way to get access to another service.
  constructor(private cityjsonService: CityjsonService) {}

  /**
   * Creates a THREE.Group from the currently loaded CityJSON data.
   * This method pulls data directly from the CityjsonService.
   * Based on: https://github.com/cityjson/ninja/blob/master/src/js/viewer.js
   * 
   * @returns A THREE.Group containing all the city object meshes, or null if no data is loaded.
   */
  createSceneGroup(options?: {
    colorBySemantic?: boolean; // We can add options later
    wireframe?: boolean;
  }): THREE.Group | null {
    
    // STEP 2: Get the actual CityJSON data from the service.
    // We use the 'snapshot' method for a direct, one-time read.
    const cityjsonData = this.cityjsonService.getCityJSONSnapshot();

    // Always check if data exists before trying to process it.
    if (!cityjsonData) {
      console.warn("NinjaLoader: No CityJSON data available to load.");
      return null;
    }

    const group = new THREE.Group();
    
    // Transform vertices using the correct data object
    const vertices = this.getTransformedVertices(cityjsonData);
    
    // Load city objects from the correct data object
   Object.entries(cityjsonData.CityObjects).forEach(([id, obj]) => {
      // 🛑 FIX: If an object has children, it's likely a container/envelope.
      // We skip rendering it so we can see the detailed parts inside.
      if (obj.children && obj.children.length > 0) {
        return; 
      }

      const meshes = this.createObjectMeshes(id, obj, vertices, options);
      meshes.forEach(mesh => group.add(mesh));
    });
    
    return group;
  }
  
  private getTransformedVertices(cm: CityJSON): THREE.Vector3[] {
    const transform = cm.transform;
    return cm.vertices.map(v => {
      // This logic was already correct!
      if (transform) {
        return new THREE.Vector3(
          v[0] * transform.scale[0] + transform.translate[0],
          v[1] * transform.scale[1] + transform.translate[1],
          v[2] * transform.scale[2] + transform.translate[2]
        );
      }
      return new THREE.Vector3(v[0], v[1], v[2]);
    });
  }
  
 private createObjectMeshes(
    objectId: string,
    cityObject: any,
    vertices: THREE.Vector3[],
    options?: { colorBySemantic?: boolean; wireframe?: boolean }
  ): THREE.Mesh[] {
    if (!cityObject || !Array.isArray(cityObject.geometry)) {
      return [];
    }

    const baseColor = this.getColorForObject(cityObject);
    
    // 1. Group geometries by their Semantic Type (e.g. 'WallSurface', 'RoofSurface')
    // Key = semanticType string, Value = Array of BufferGeometries
    const groupedGeoms: Record<string, THREE.BufferGeometry[]> = {};
    const defaultKey = '__default__'; // For faces without semantics

    cityObject.geometry.forEach((geometry: any) => {
      if (!geometry || !geometry.boundaries) return;

      const faces = this.collectFaces(geometry.boundaries, geometry.semantics);

      faces.forEach((face) => {
        const bufferGeometry = this.polygonToGeometry(face.indices, vertices, face.holes);
        if (!bufferGeometry) return;

        // Determine the key for grouping
        const semKey = (options?.colorBySemantic && face.semanticType) 
          ? face.semanticType 
          : defaultKey;

        if (!groupedGeoms[semKey]) {
          groupedGeoms[semKey] = [];
        }
        groupedGeoms[semKey].push(bufferGeometry);
      });
    });

    // 2. Merge geometries and create one Mesh per group
    const meshes: THREE.Mesh[] = [];

    Object.entries(groupedGeoms).forEach(([semType, geomArray]) => {
      if (geomArray.length === 0) return;

      // Merge all tiny triangles into one big geometry
      const mergedGeometry = this.mergeGeometries(geomArray);

      // Determine color
      let finalColor = baseColor;
      if (semType !== defaultKey && options?.colorBySemantic) {
        finalColor = this.getColorForSemantic(semType);
      }

      const material = new THREE.MeshStandardMaterial({
        color: finalColor,
        side: THREE.DoubleSide,
        wireframe: options?.wireframe ?? false,
        flatShading: false, // Smooth shading now works because geometry is merged!
        polygonOffset: true, 
        polygonOffsetFactor: 1, // Helps with z-fighting if outlines are drawn
        polygonOffsetUnits: 1
      });

      const mesh = new THREE.Mesh(mergedGeometry, material);
      mesh.name = `${objectId}-${semType}`;
      
      // Assign userData for selection logic
      mesh.userData = {
        objectId,
        cityObjectType: cityObject.type,
        semanticType: semType === defaultKey ? null : semType
      };

      meshes.push(mesh);
    });

    return meshes;
  }

  /**
   * Helper to merge multiple BufferGeometries into one.
   * This mimics BufferGeometryUtils.mergeBufferGeometries but without external dependencies.
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    if (geometries.length === 1) return geometries[0];

    let totalVertices = 0;
    let totalIndices = 0;

    // Calculate total size
    geometries.forEach(g => {
      totalVertices += g.attributes['position'].count;
      if (g.index) totalIndices += g.index.count;
    });

    const mergedPositions = new Float32Array(totalVertices * 3);
    const mergedIndices = new Uint32Array(totalIndices);

    let vertexOffset = 0;
    let indexOffset = 0;

    geometries.forEach(g => {
      const posAttribute = g.attributes['position'];
      
      // Copy positions
      mergedPositions.set(posAttribute.array as Float32Array, vertexOffset * 3);

      // Copy indices with offset
      if (g.index) {
        const indices = g.index.array;
        for (let i = 0; i < indices.length; i++) {
          mergedIndices[indexOffset + i] = indices[i] + vertexOffset;
        }
        indexOffset += g.index.count;
      }

      vertexOffset += posAttribute.count;
    });

    const mergedGeo = new THREE.BufferGeometry();
    mergedGeo.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    mergedGeo.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
    
    // CRITICAL: Recompute normals on the merged geometry to smooth the seams between triangles
    mergedGeo.computeVertexNormals();
    
    return mergedGeo;
  }

  private collectFaces(boundaries: any, semantics?: any): Array<{
    indices: number[];
    holes?: number[][];
    semanticType?: string;
  }> {
    const faces: Array<{ indices: number[]; holes?: number[][]; semanticType?: string }> = [];

    const traverse = (node: any, semanticNode: any) => {
      if (!Array.isArray(node) || node.length === 0) {
        return;
      }

      const first = node[0];

      // Case 1: node is already a simple ring [v1, v2, v3]
      if (typeof first === 'number') {
        faces.push({
          indices: node as number[],
          holes: [],
          semanticType: this.resolveSemanticType(semanticNode, semantics)
        });
        return;
      }

      // Case 2: node is an array of rings: [ [outer], [hole1], ... ]
      if (Array.isArray(first) && typeof first[0] === 'number') {
        const [outer, ...holes] = node as number[][];
        faces.push({
          indices: outer ?? [],
          holes,
          semanticType: this.resolveSemanticType(semanticNode, semantics)
        });
        return;
      }

      // Case 3: nested collection (Solids, CompositeSolids, etc.)
      node.forEach((child: any, index: number) => {
        const nextSemantic = Array.isArray(semanticNode) ? semanticNode[index] : semanticNode;
        traverse(child, nextSemantic);
      });
    };

    traverse(boundaries, semantics?.values ?? semantics);
    return faces.filter(face => face.indices.length >= 3);
  }

  private resolveSemanticType(valueNode: any, semantics?: any): string | undefined {
    if (Array.isArray(valueNode)) {
      const candidate = valueNode.find((value: any) => typeof value === 'number');
      if (typeof candidate === 'number') {
        valueNode = candidate;
      }
    }
    if (typeof valueNode === 'number' && semantics?.surfaces?.[valueNode]) {
      const surface = semantics.surfaces[valueNode];
      if (surface?.type) {
        return String(surface.type);
      }
    }
    return undefined;
  }

  private polygonToGeometry(
    indices: number[],
    vertices: THREE.Vector3[],
    holes?: number[][]
  ): THREE.BufferGeometry | null {
    const points = indices
      .map(idx => vertices[idx])
      .filter((v): v is THREE.Vector3 => Boolean(v));

    if (points.length < 3) {
      return null;
    }

    const projected: number[] = [];
    const axes = this.getProjectionAxes(points);
    points.forEach(point => {
      projected.push(point.getComponent(axes[0]), point.getComponent(axes[1]));
    });

    const holeIndices: number[] = [];
    if (holes && holes.length) {
      for (const hole of holes) {
        const holePoints = hole
          .map(idx => vertices[idx])
          .filter((v): v is THREE.Vector3 => Boolean(v));
        if (holePoints.length < 3) {
          continue;
        }
        holeIndices.push(projected.length / 2);
        holePoints.forEach(point => {
          projected.push(point.getComponent(axes[0]), point.getComponent(axes[1]));
        });
        points.push(...holePoints);
      }
    }

    const triangles = earcut(projected, holeIndices.length ? holeIndices : undefined);
    if (!triangles.length) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);
    points.forEach((point, index) => {
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(triangles);
    geometry.computeVertexNormals();
    return geometry;
  }

  private getProjectionAxes(points: THREE.Vector3[]): [number, number] {
    if (!points.length) {
      return [0, 1];
    }
    const normal = this.computePolygonNormal(points);
    const absNormal = new THREE.Vector3(
      Math.abs(normal.x),
      Math.abs(normal.y),
      Math.abs(normal.z)
    );

    if (absNormal.z >= absNormal.x && absNormal.z >= absNormal.y) {
      return [0, 1];
    }
    if (absNormal.x >= absNormal.y && absNormal.x >= absNormal.z) {
      return [1, 2];
    }
    return [0, 2];
  }

  private computePolygonNormal(points: THREE.Vector3[]): THREE.Vector3 {
    const normal = new THREE.Vector3();
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      normal.x += (current.y - next.y) * (current.z + next.z);
      normal.y += (current.z - next.z) * (current.x + next.x);
      normal.z += (current.x - next.x) * (current.y + next.y);
    }
    return normal.lengthSq() === 0 ? new THREE.Vector3(0, 0, 1) : normal.normalize();
  }

  private getColorForObject(cityObject: any): number {
    const palette: Record<string, number> = {
      building: 0xffb347,
      buildingpart: 0xffcc80,
      buildingroom: 0xffe0b2,
      genericcityobject: 0xb0bec5
    };
    const key = String(cityObject?.type ?? '').toLowerCase();
    return palette[key] ?? 0xbdbdbd;
  }

private getColorForSemantic(type: string): number {
    const palette: Record<string, number> = {
      GroundSurface: 0xbdbdbd, // Grey
      WallSurface: 0x90a4ae,   // Blue-Grey
      RoofSurface: 0xff7043,   // Orange-Red
      
      // 👇 ADD THESE TWO LINES 👇
      FloorSurface: 0x81c784,  // Green (for floors)
      CeilingSurface: 0xba68c8,// Purple (for ceilings)
      
      Default: 0xbdbdbd        // Fallback color
    };
    return palette[type] ?? palette['Default'];
  }
}

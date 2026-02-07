// src/app/services/parcel-layer.service.ts

import { Injectable } from '@angular/core';
import * as THREE from 'three';
import earcut from 'earcut';
import proj4 from 'proj4';
import { GeoTransformService, GeoExtent } from './geo-transform.service';
import { LandUse } from '../models/land-parcel.model';

// ─── GeoJSON Types ───────────────────────────────────────────────

export interface ParcelProperties {
  parcelId: string;
  cadastralRef?: string;
  landUse?: LandUse | string;
  tenureType?: string;
  parcelStatus?: string;
  buildingIds?: string[];
  area?: number;
  [key: string]: unknown;
}

export interface ParcelGeometry {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon';
  coordinates: number[] | number[][] | number[][][] | number[][][][];
}

export interface ParcelFeature {
  type: 'Feature';
  properties: ParcelProperties;
  geometry: ParcelGeometry;
}

export interface ParcelFeatureCollection {
  type: 'FeatureCollection';
  crs?: {
    type: string;
    properties: { name: string };
  };
  features: ParcelFeature[];
}

// ─── Parcel Mesh Result ──────────────────────────────────────────

export interface ParcelMeshData {
  parcelId: string;
  fillMesh: THREE.Mesh;
  strokeLine: THREE.LineSegments;
  properties: ParcelProperties;
}

export interface ParcelLayerResult {
  group: THREE.Group;
  parcels: ParcelMeshData[];
}

// ─── Land Use Colors ─────────────────────────────────────────────

const LAND_USE_COLORS: Record<string, number> = {
  [LandUse.RES]: 0x4ade80,    // Green - Residential
  [LandUse.COM]: 0x60a5fa,    // Blue - Commercial
  [LandUse.IND]: 0xf97316,    // Orange - Industrial
  [LandUse.AGR]: 0xa3e635,    // Lime - Agricultural
  [LandUse.REC]: 0x22d3ee,    // Cyan - Recreational
  [LandUse.PUB]: 0xa78bfa,    // Purple - Public/Institutional
  [LandUse.MIX]: 0xfbbf24,    // Amber - Mixed Use
  [LandUse.TRN]: 0x94a3b8,    // Gray - Transportation
  [LandUse.VAC]: 0x71717a,    // Zinc - Vacant
  'default': 0x34d399          // Emerald (default)
};

/**
 * Service for creating Three.js parcel polygon layers from GeoJSON data.
 * Handles coordinate transformation, triangulation, and mesh generation.
 */
@Injectable({ providedIn: 'root' })
export class ParcelLayerService {

  constructor(private geoTransform: GeoTransformService) {}

  /**
   * Create a Three.js group containing all parcel meshes.
   *
   * @param parcels - GeoJSON FeatureCollection or array of features
   * @param srcEpsg - Source EPSG code of the parcel coordinates
   * @param extent - Geographic extent from the building model
   * @param sceneCenter - Center point in scene coordinates
   * @param sceneSizeFactor - Scale factor (scene units per meter)
   * @param groundZ - Z position for the parcel layer (slightly above ground)
   */
  createParcelLayer(
    parcels: ParcelFeatureCollection | ParcelFeature[],
    srcEpsg: number,
    extent: GeoExtent,
    sceneCenter: THREE.Vector3,
    sceneSizeFactor: number,
    groundZ: number = 0
  ): ParcelLayerResult {
    const features = Array.isArray(parcels) ? parcels : parcels.features;
    const group = new THREE.Group();
    group.name = 'parcel-layer';

    const parcelMeshes: ParcelMeshData[] = [];

    // Reset debug counter
    this.debugLogCount = 0;

    // Calculate the reference point in Web Mercator for coordinate offset
    const refMerc = this.geoTransform.lonLatToWebMercator(extent.centerLon, extent.centerLat);

    console.info('ParcelLayerService: Creating layer', {
      numFeatures: features.length,
      srcEpsg,
      refMerc,
      sceneCenter: [sceneCenter.x, sceneCenter.y, sceneCenter.z],
      sceneSizeFactor,
      groundZ
    });

    for (const feature of features) {
      try {
        const meshData = this.createParcelMesh(
          feature,
          srcEpsg,
          refMerc,
          sceneCenter,
          sceneSizeFactor,
          groundZ
        );
        if (meshData) {
          group.add(meshData.fillMesh);
          group.add(meshData.strokeLine);
          parcelMeshes.push(meshData);
          console.info(`ParcelLayerService: Created parcel ${feature.properties?.parcelId}`, {
            fillVertexCount: meshData.fillMesh.geometry.getAttribute('position')?.count,
            strokeVertexCount: meshData.strokeLine.geometry.getAttribute('position')?.count
          });
        }
      } catch (err) {
        console.warn(`Failed to create mesh for parcel ${feature.properties?.parcelId}:`, err);
      }
    }

    return { group, parcels: parcelMeshes };
  }

  /**
   * Create fill mesh and stroke line for a single parcel feature.
   * Only Polygon and MultiPolygon geometries are supported for mesh creation.
   */
  private createParcelMesh(
    feature: ParcelFeature,
    srcEpsg: number,
    refMerc: [number, number],
    sceneCenter: THREE.Vector3,
    sceneSizeFactor: number,
    groundZ: number
  ): ParcelMeshData | null {
    const { geometry, properties } = feature;
    if (!geometry || !properties?.parcelId) return null;

    // Only Polygon and MultiPolygon can be rendered as filled meshes
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
      console.warn(`Skipping non-polygon geometry for parcel ${properties.parcelId}: ${geometry.type}`);
      return null;
    }

    // Normalize to array of polygon rings (handle MultiPolygon)
    const polygons: number[][][][] = geometry.type === 'MultiPolygon'
      ? geometry.coordinates as number[][][][]
      : [geometry.coordinates as number[][][]];

    // Transform all coordinates to scene space
    const allSceneCoords: number[][][] = [];
    for (const polygon of polygons) {
      if (!Array.isArray(polygon)) continue;
      const transformedRings: number[][] = [];
      for (const ring of polygon) {
        if (!Array.isArray(ring)) continue;
        const transformedRing: number[] = [];
        for (const coord of ring) {
          if (!Array.isArray(coord) || coord.length < 2) continue;
          const [x, y] = this.transformToScene(
            coord[0], coord[1],
            srcEpsg, refMerc, sceneCenter, sceneSizeFactor
          );
          transformedRing.push(x, y);
        }
        if (transformedRing.length >= 6) { // At least 3 points (6 values for x,y pairs)
          transformedRings.push(transformedRing);
        }
      }
      if (transformedRings.length > 0) {
        allSceneCoords.push(transformedRings);
      }
    }

    // Create geometry using earcut triangulation
    const positions: number[] = [];
    const strokePositions: number[] = [];

    for (const rings of allSceneCoords) {
      // Flatten rings for earcut (first ring is outer, rest are holes)
      const { vertices, holes } = this.flattenRings(rings);

      // Triangulate
      const indices = earcut(vertices, holes, 2);

      // Add triangulated positions
      for (const idx of indices) {
        const x = vertices[idx * 2];
        const y = vertices[idx * 2 + 1];
        positions.push(x, y, groundZ);
      }

      // Add stroke lines (outer ring and hole boundaries)
      this.addStrokeFromRings(rings, groundZ, strokePositions);
    }

    if (positions.length === 0) return null;

    // Create fill mesh
    const fillGeom = new THREE.BufferGeometry();
    fillGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    fillGeom.computeVertexNormals();

    const color = this.getColorForLandUse(properties.landUse);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000, // DEBUG: Bright red for visibility
      transparent: true,
      opacity: 0.7,    // DEBUG: Higher opacity
      side: THREE.DoubleSide,
      depthWrite: true
    });

    const fillMesh = new THREE.Mesh(fillGeom, fillMaterial);
    fillMesh.name = `parcel-fill-${properties.parcelId}`;
    fillMesh.userData = { parcelId: properties.parcelId, type: 'parcel-fill' };

    // Create stroke line
    const strokeGeom = new THREE.BufferGeometry();
    strokeGeom.setAttribute('position', new THREE.Float32BufferAttribute(strokePositions, 3));

    const strokeMaterial = new THREE.LineBasicMaterial({
      color,
      linewidth: 2,
      transparent: true,
      opacity: 0.85
    });

    const strokeLine = new THREE.LineSegments(strokeGeom, strokeMaterial);
    strokeLine.name = `parcel-stroke-${properties.parcelId}`;
    strokeLine.userData = { parcelId: properties.parcelId, type: 'parcel-stroke' };

    return {
      parcelId: properties.parcelId,
      fillMesh,
      strokeLine,
      properties
    };
  }

  private debugLogCount = 0;

  /**
   * Transform a coordinate from source CRS to scene coordinates.
   */
  private transformToScene(
    x: number,
    y: number,
    srcEpsg: number,
    refMerc: [number, number],
    sceneCenter: THREE.Vector3,
    sceneSizeFactor: number
  ): [number, number] {
    // Convert source coords to Web Mercator
    const srcProj = `EPSG:${srcEpsg}`;
    const merc = proj4(srcProj, 'EPSG:3857', [x, y]) as [number, number];

    // Offset from reference center (in meters, since Web Mercator is in meters)
    const dx = merc[0] - refMerc[0];
    const dy = merc[1] - refMerc[1];

    // Scale to scene units and offset to scene center
    const sceneX = sceneCenter.x + dx * sceneSizeFactor;
    const sceneY = sceneCenter.y + dy * sceneSizeFactor;

    // Debug log first few coordinates
    if (this.debugLogCount < 5) {
      console.info('transformToScene:', {
        input: [x, y],
        srcEpsg,
        merc,
        refMerc,
        delta: [dx, dy],
        sceneSizeFactor,
        output: [sceneX, sceneY]
      });
      this.debugLogCount++;
    }

    return [sceneX, sceneY];
  }

  /**
   * Flatten polygon rings for earcut (returns flat vertex array and hole indices).
   */
  private flattenRings(rings: number[][]): { vertices: number[]; holes: number[] } {
    const vertices: number[] = [];
    const holes: number[] = [];

    for (let i = 0; i < rings.length; i++) {
      if (i > 0) {
        // Record hole start index (in vertices, not coordinates)
        holes.push(vertices.length / 2);
      }
      const ring = rings[i];
      // Each ring is already [x, y, x, y, ...] from our transformation
      for (let j = 0; j < ring.length; j++) {
        vertices.push(ring[j]);
      }
    }

    return { vertices, holes };
  }

  /**
   * Add stroke line segments from polygon rings.
   */
  private addStrokeFromRings(rings: number[][], z: number, strokePositions: number[]): void {
    for (const ring of rings) {
      // ring is [x, y, x, y, ...]
      const numPoints = ring.length / 2;
      for (let i = 0; i < numPoints; i++) {
        const x1 = ring[i * 2];
        const y1 = ring[i * 2 + 1];
        const nextI = (i + 1) % numPoints;
        const x2 = ring[nextI * 2];
        const y2 = ring[nextI * 2 + 1];

        strokePositions.push(x1, y1, z, x2, y2, z);
      }
    }
  }

  /**
   * Get fill color based on land use type.
   */
  private getColorForLandUse(landUse?: LandUse | string): number {
    if (!landUse) return LAND_USE_COLORS['default'];
    return LAND_USE_COLORS[landUse] ?? LAND_USE_COLORS['default'];
  }

  /**
   * Update highlight state for a parcel.
   */
  highlightParcel(meshData: ParcelMeshData, highlight: boolean): void {
    const fillMat = meshData.fillMesh.material as THREE.MeshBasicMaterial;
    const strokeMat = meshData.strokeLine.material as THREE.LineBasicMaterial;

    if (highlight) {
      fillMat.opacity = 0.6;
      strokeMat.opacity = 1.0;
      strokeMat.color.setHex(0xffffff);
    } else {
      fillMat.opacity = 0.35;
      strokeMat.opacity = 0.85;
      strokeMat.color.setHex(this.getColorForLandUse(meshData.properties.landUse));
    }
  }

  /**
   * Dispose of parcel layer resources.
   */
  disposeParcelLayer(result: ParcelLayerResult): void {
    for (const meshData of result.parcels) {
      meshData.fillMesh.geometry.dispose();
      (meshData.fillMesh.material as THREE.Material).dispose();
      meshData.strokeLine.geometry.dispose();
      (meshData.strokeLine.material as THREE.Material).dispose();
    }
    result.group.clear();
  }
}

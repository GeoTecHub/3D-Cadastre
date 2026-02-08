// src/app/services/cadastral-polygon.service.ts
/**
 * Cadastral Polygon Service
 *
 * PURPOSE: Display land parcel polygons as LEGAL ENTITIES in 3D view.
 *
 * IMPORTANT: Unlike terrain/surface meshes, cadastral parcels are legal boundaries
 * that must be rendered EXACTLY as received from the backend. The coordinates
 * define precise legal boundaries that cannot be modified or interpolated.
 *
 * This service:
 * 1. Takes WGS84 (EPSG:4326) polygon coordinates from the backend
 * 2. Transforms them to scene coordinates for display
 * 3. Renders them as flat polygons overlaid on the OSM base map
 * 4. Preserves exact vertex positions (legal boundary points)
 */

import { Injectable } from '@angular/core';
import * as THREE from 'three';
import proj4 from 'proj4';
import { GeoTransformService, GeoExtent } from './geo-transform.service';
import { LandUse } from '../models/land-parcel.model';

// ─── GeoJSON Types ───────────────────────────────────────────────

export interface CadastralProperties {
  parcelId: string;
  cadastralRef?: string;
  landUse?: LandUse | string;
  tenureType?: string;
  area?: number;
  ownerName?: string;
  [key: string]: unknown;
}

export interface CadastralGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface CadastralFeature {
  type: 'Feature';
  properties: CadastralProperties;
  geometry: CadastralGeometry;
}

export interface CadastralFeatureCollection {
  type: 'FeatureCollection';
  features: CadastralFeature[];
}

// ─── Output Types ──────────────────────────────────────────────

export interface CadastralPolygonData {
  parcelId: string;
  properties: CadastralProperties;
  boundaryLine: THREE.Line;        // Exact legal boundary (LineLoop)
  fillShape: THREE.Mesh | null;    // Optional filled polygon
  boundaryPoints: THREE.Vector3[]; // Original boundary vertices in scene coords
}

export interface CadastralLayerResult {
  group: THREE.Group;
  polygons: CadastralPolygonData[];
  extent: GeoExtent;
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
  'default': 0x22c55e         // Green (default)
};

const BOUNDARY_COLOR = 0xffffff;  // White boundary lines for visibility
const BOUNDARY_WIDTH = 3;

/**
 * Service for displaying cadastral (land parcel) polygons in the 3D viewer.
 *
 * Parcels are legal entities with exact boundaries. This service preserves
 * the exact coordinates and displays them as flat polygons on top of OSM.
 */
@Injectable({ providedIn: 'root' })
export class CadastralPolygonService {

  constructor(private geoTransform: GeoTransformService) {}

  /**
   * Create a layer of cadastral polygons for display in the 3D scene.
   *
   * @param parcels - GeoJSON FeatureCollection with parcel polygons
   * @param srcEpsg - Source EPSG code of the parcel coordinates (e.g., 4326 for WGS84, 32643 for UTM Zone 43N)
   * @param displayOptions - Options for rendering (show fills, boundary style, etc.)
   * @param sceneParams - Scene positioning parameters
   */
  createCadastralLayer(
    parcels: CadastralFeatureCollection,
    srcEpsg: number,
    options: {
      showFills?: boolean;          // Whether to show filled polygons (default: true)
      fillOpacity?: number;         // Fill opacity (default: 0.5)
      boundaryWidth?: number;       // Boundary line width (default: 3)
      elevationAboveGround?: number; // Height above OSM ground (default: 0.5)
    } = {},
    sceneParams: {
      extent: GeoExtent;           // Geographic extent of the parcels (in WGS84)
      sceneCenter: THREE.Vector3;  // Center point in scene coordinates
      sceneScale: number;          // Scale factor (scene units per meter)
    }
  ): CadastralLayerResult {

    const {
      showFills = true,
      fillOpacity = 0.5,
      boundaryWidth = BOUNDARY_WIDTH,
      elevationAboveGround = 0.5
    } = options;

    const { extent, sceneCenter, sceneScale } = sceneParams;

    const group = new THREE.Group();
    group.name = 'cadastral-polygons';

    const polygonDataList: CadastralPolygonData[] = [];

    // Reset z-counter for new layer
    this.parcelZCounter = 0;

    // Reference point for coordinate transformation (center of extent in Web Mercator)
    const refMerc = this.geoTransform.lonLatToWebMercator(extent.centerLon, extent.centerLat);

    console.info('CadastralPolygonService: Creating cadastral layer', {
      parcelCount: parcels.features.length,
      srcEpsg,
      extent: { lon: [extent.minLon, extent.maxLon], lat: [extent.minLat, extent.maxLat] },
      sceneCenter: sceneCenter.toArray(),
      sceneScale,
      showFills,
      elevationAboveGround
    });

    for (const feature of parcels.features) {
      const polygonData = this.createCadastralPolygon(
        feature,
        srcEpsg,
        refMerc,
        sceneCenter,
        sceneScale,
        elevationAboveGround,
        showFills,
        fillOpacity,
        boundaryWidth
      );

      if (polygonData) {
        group.add(polygonData.boundaryLine);
        if (polygonData.fillShape) {
          group.add(polygonData.fillShape);
        }
        polygonDataList.push(polygonData);
      }
    }

    console.info(`CadastralPolygonService: Created ${polygonDataList.length} cadastral polygons`);

    return { group, polygons: polygonDataList, extent };
  }

  // Counter for unique z-offsets to prevent z-fighting between parcels
  private parcelZCounter = 0;

  /**
   * Create a single cadastral polygon with boundary and optional fill.
   *
   * The boundary line represents the EXACT legal boundary - vertices are
   * preserved exactly as received from the backend.
   */
  private createCadastralPolygon(
    feature: CadastralFeature,
    srcEpsg: number,
    refMerc: [number, number],
    sceneCenter: THREE.Vector3,
    sceneScale: number,
    groundZ: number,
    showFill: boolean,
    fillOpacity: number,
    boundaryWidth: number
  ): CadastralPolygonData | null {

    const { geometry, properties } = feature;
    if (!geometry || !properties?.parcelId) return null;

    // Log raw coordinates for debugging (first 3 coords of first ring)
    const firstRing = geometry.type === 'Polygon'
      ? (geometry.coordinates as number[][][])[0]
      : (geometry.coordinates as number[][][][])[0]?.[0];
    if (firstRing && firstRing.length > 0) {
      console.debug(`Parcel ${properties.parcelId} raw coords (first 3):`,
        firstRing.slice(0, 3).map(c => `[${c[0]?.toFixed(6)}, ${c[1]?.toFixed(6)}]`).join(', '));
    }

    // Get all polygon rings (outer boundary + any holes)
    const allPolygons = this.extractPolygonRings(geometry);
    if (allPolygons.length === 0) return null;

    // Transform WGS84 coordinates to scene coordinates
    // Each polygon is array of rings, each ring is array of [x, y] points
    const scenePolygons: THREE.Vector3[][] = [];

    for (const polygon of allPolygons) {
      for (const ring of polygon) {
        const sceneRing: THREE.Vector3[] = [];

        for (const coord of ring) {
          if (!Array.isArray(coord) || coord.length < 2) continue;

          const [x, y] = coord;
          const scenePoint = this.coordToScene(x, y, srcEpsg, refMerc, sceneCenter, sceneScale, groundZ);
          sceneRing.push(scenePoint);
        }

        if (sceneRing.length >= 3) {
          scenePolygons.push(sceneRing);
        }
      }
    }

    if (scenePolygons.length === 0) return null;

    // The first ring is the outer boundary (legal boundary)
    const outerBoundary = scenePolygons[0];

    // Give each parcel a unique z-offset to prevent z-fighting between overlapping parcels
    const parcelZOffset = this.parcelZCounter * 0.001;
    this.parcelZCounter++;

    // Create boundary line (exact legal boundary)
    const boundaryLine = this.createBoundaryLine(outerBoundary, properties, boundaryWidth, parcelZOffset);

    // Create fill shape if requested
    let fillShape: THREE.Mesh | null = null;
    if (showFill) {
      fillShape = this.createFillShape(scenePolygons, properties, fillOpacity, groundZ, parcelZOffset);
    }

    return {
      parcelId: properties.parcelId,
      properties,
      boundaryLine,
      fillShape,
      boundaryPoints: outerBoundary
    };
  }

  /**
   * Extract polygon rings from GeoJSON geometry.
   * Returns array of polygons, each containing array of rings (outer + holes).
   */
  private extractPolygonRings(geometry: CadastralGeometry): number[][][][] {
    if (geometry.type === 'Polygon') {
      // Polygon: coordinates = [ring1, ring2, ...] where ring = [[x,y], [x,y], ...]
      return [geometry.coordinates as number[][][]];
    } else if (geometry.type === 'MultiPolygon') {
      // MultiPolygon: coordinates = [polygon1, polygon2, ...]
      return geometry.coordinates as number[][][][];
    }
    return [];
  }

  /**
   * Transform coordinates from source EPSG to scene coordinates.
   *
   * Transformation:
   * 1. Source EPSG -> Web Mercator (meters)
   * 2. Offset from reference center
   * 3. Scale to scene units
   */
  private coordToScene(
    x: number,
    y: number,
    srcEpsg: number,
    refMerc: [number, number],
    sceneCenter: THREE.Vector3,
    sceneScale: number,
    groundZ: number
  ): THREE.Vector3 {
    // Convert source coordinates to Web Mercator (meters)
    const srcProj = `EPSG:${srcEpsg}`;
    const merc = proj4(srcProj, 'EPSG:3857', [x, y]) as [number, number];

    // Offset from reference center (in meters)
    const dx = merc[0] - refMerc[0];
    const dy = merc[1] - refMerc[1];

    // Scale to scene units and offset from scene center
    const sceneX = sceneCenter.x + dx * sceneScale;
    const sceneY = sceneCenter.y + dy * sceneScale;

    return new THREE.Vector3(sceneX, sceneY, groundZ);
  }

  /**
   * Create the boundary line for a parcel (exact legal boundary).
   * Uses LineLoop to create a closed polygon outline.
   */
  private createBoundaryLine(
    vertices: THREE.Vector3[],
    properties: CadastralProperties,
    lineWidth: number,
    zOffset: number = 0
  ): THREE.Line {
    // Create geometry from vertices
    const geometry = new THREE.BufferGeometry().setFromPoints(vertices);

    // Use LineLoop for closed polygon
    const material = new THREE.LineBasicMaterial({
      color: BOUNDARY_COLOR,
      linewidth: lineWidth,
      transparent: true,
      opacity: 1.0
    });

    const line = new THREE.LineLoop(geometry, material);
    line.name = `cadastral-boundary-${properties.parcelId}`;
    line.userData = {
      parcelId: properties.parcelId,
      type: 'cadastral-boundary',
      landUse: properties.landUse
    };

    // Raise above fill to ensure visibility (base offset + unique parcel offset)
    line.position.z += 0.05 + zOffset;

    // Set render order to ensure boundaries render after fills
    line.renderOrder = 2;

    return line;
  }

  /**
   * Create the filled polygon shape.
   * Uses THREE.Shape for proper polygon rendering with holes support.
   */
  private createFillShape(
    rings: THREE.Vector3[][],
    properties: CadastralProperties,
    opacity: number,
    groundZ: number,
    zOffset: number = 0
  ): THREE.Mesh | null {
    if (rings.length === 0 || rings[0].length < 3) return null;

    // Create shape from outer ring (first ring)
    const outerRing = rings[0];
    const shape = new THREE.Shape();

    shape.moveTo(outerRing[0].x, outerRing[0].y);
    for (let i = 1; i < outerRing.length; i++) {
      shape.lineTo(outerRing[i].x, outerRing[i].y);
    }
    shape.closePath();

    // Add holes (subsequent rings)
    for (let i = 1; i < rings.length; i++) {
      const holeRing = rings[i];
      if (holeRing.length < 3) continue;

      const hole = new THREE.Path();
      hole.moveTo(holeRing[0].x, holeRing[0].y);
      for (let j = 1; j < holeRing.length; j++) {
        hole.lineTo(holeRing[j].x, holeRing[j].y);
      }
      hole.closePath();
      shape.holes.push(hole);
    }

    // Create geometry from shape
    const geometry = new THREE.ShapeGeometry(shape);

    // Get color based on land use
    const color = this.getColorForLandUse(properties.landUse);

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,  // DoubleSide for visibility from all angles
      depthWrite: false,       // Disable depth write to prevent blinking/z-fighting
      polygonOffset: false     // Physical separation is enough, no offset needed
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `cadastral-fill-${properties.parcelId}`;
    mesh.userData = {
      parcelId: properties.parcelId,
      type: 'cadastral-fill',
      landUse: properties.landUse
    };

    // Position at ground level with unique offset per parcel
    mesh.position.z = groundZ + zOffset;

    // Set render order to ensure fills render before boundaries
    mesh.renderOrder = 1;

    return mesh;
  }

  /**
   * Get fill color based on land use type.
   */
  private getColorForLandUse(landUse?: LandUse | string): number {
    if (!landUse) return LAND_USE_COLORS['default'];
    return LAND_USE_COLORS[landUse] ?? LAND_USE_COLORS['default'];
  }

  /**
   * Highlight a cadastral polygon (for selection).
   */
  highlightPolygon(polygonData: CadastralPolygonData, highlight: boolean): void {
    const boundaryMat = polygonData.boundaryLine.material as THREE.LineBasicMaterial;

    if (highlight) {
      boundaryMat.color.setHex(0xffff00);  // Yellow highlight
      boundaryMat.opacity = 1.0;

      if (polygonData.fillShape) {
        const fillMat = polygonData.fillShape.material as THREE.MeshBasicMaterial;
        fillMat.opacity = 0.7;
      }
    } else {
      boundaryMat.color.setHex(BOUNDARY_COLOR);
      boundaryMat.opacity = 1.0;

      if (polygonData.fillShape) {
        const fillMat = polygonData.fillShape.material as THREE.MeshBasicMaterial;
        fillMat.opacity = 0.5;
      }
    }
  }

  /**
   * Dispose of cadastral layer resources.
   */
  disposeCadastralLayer(result: CadastralLayerResult): void {
    for (const polygonData of result.polygons) {
      polygonData.boundaryLine.geometry.dispose();
      (polygonData.boundaryLine.material as THREE.Material).dispose();

      if (polygonData.fillShape) {
        polygonData.fillShape.geometry.dispose();
        (polygonData.fillShape.material as THREE.Material).dispose();
      }
    }
    result.group.clear();
  }

  /**
   * Calculate geographic extent from cadastral features.
   * Transforms coordinates from source EPSG to WGS84 for the extent.
   *
   * @param parcels - The cadastral feature collection
   * @param srcEpsg - Source EPSG code of the coordinates (e.g., 4326, 32643)
   */
  calculateExtent(parcels: CadastralFeatureCollection, srcEpsg: number): GeoExtent | null {
    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    let totalCoords = 0;
    let validCoords = 0;
    let transformErrors = 0;

    const srcProj = `EPSG:${srcEpsg}`;

    const updateBounds = (x: number, y: number) => {
      totalCoords++;
      if (!isFinite(x) || !isFinite(y)) return;

      let lon: number, lat: number;

      if (srcEpsg === 4326) {
        // Already WGS84
        lon = x;
        lat = y;
      } else {
        // Transform from source EPSG to WGS84
        try {
          const result = proj4(srcProj, 'EPSG:4326', [x, y]) as [number, number];
          lon = result[0];
          lat = result[1];
        } catch (err) {
          transformErrors++;
          return;
        }
      }

      // Validate transformed coordinates
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        return;
      }

      validCoords++;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    };

    // Collect sample coordinates for format detection
    const sampleCoords: number[][] = [];

    for (const feature of parcels.features) {
      const allPolygons = this.extractPolygonRings(feature.geometry);

      for (const polygon of allPolygons) {
        for (const ring of polygon) {
          for (const coord of ring) {
            if (Array.isArray(coord) && coord.length >= 2) {
              if (sampleCoords.length < 10) {
                sampleCoords.push([coord[0], coord[1]]);
              }
              updateBounds(coord[0], coord[1]);
            }
          }
        }
      }
    }

    // Log coordinate info
    console.info('CadastralPolygonService: Coordinate processing', {
      srcEpsg,
      totalCoords,
      validCoords,
      transformErrors,
      sampleInput: sampleCoords.slice(0, 3).map(c => `[${c[0]?.toFixed(2)}, ${c[1]?.toFixed(2)}]`)
    });

    if (!isFinite(minLon) || !isFinite(maxLon) || !isFinite(minLat) || !isFinite(maxLat)) {
      console.warn(`CadastralPolygonService: No valid coordinates after transforming from EPSG:${srcEpsg}`);
      return null;
    }

    console.info('CadastralPolygonService: Extent calculated (WGS84)', {
      minLon: minLon.toFixed(6),
      maxLon: maxLon.toFixed(6),
      minLat: minLat.toFixed(6),
      maxLat: maxLat.toFixed(6),
      widthDeg: (maxLon - minLon).toFixed(6),
      heightDeg: (maxLat - minLat).toFixed(6)
    });

    return {
      centerLon: (minLon + maxLon) / 2,
      centerLat: (minLat + maxLat) / 2,
      minLon,
      maxLon,
      minLat,
      maxLat,
      epsg: srcEpsg,
      crsExplicit: true
    };
  }

  /**
   * Analyze sample coordinates to detect potential format issues.
   */
  private analyzeCoordinateFormat(coords: number[][]): { format: string; warning?: string } {
    if (coords.length === 0) {
      return { format: 'empty' };
    }

    // Check if coordinates look like WGS84 lon/lat
    const allInLonRange = coords.every(c => c[0] >= -180 && c[0] <= 180);
    const allInLatRange = coords.every(c => c[1] >= -90 && c[1] <= 90);
    const firstCoordInLatRange = coords.every(c => c[0] >= -90 && c[0] <= 90);
    const secondCoordInLonRange = coords.every(c => c[1] >= -180 && c[1] <= 180);

    // Check for projected coordinates (large numbers)
    const hasLargeValues = coords.some(c => Math.abs(c[0]) > 180 || Math.abs(c[1]) > 180);

    if (allInLonRange && allInLatRange) {
      // Coordinates look like valid WGS84 [lon, lat]
      // But check if they might be swapped [lat, lon]
      if (firstCoordInLatRange && !secondCoordInLonRange) {
        return {
          format: 'possibly swapped [lat, lon]',
          warning: 'Coordinates may be in [lat, lon] order instead of [lon, lat]. ' +
            'GeoJSON standard uses [lon, lat] order.'
        };
      }
      return { format: 'WGS84 [lon, lat]' };
    }

    if (hasLargeValues) {
      // Check if they might be in meters (projected coordinates)
      const avgMagnitude = coords.reduce((sum, c) => sum + Math.abs(c[0]) + Math.abs(c[1]), 0) / (coords.length * 2);
      if (avgMagnitude > 100000) {
        return {
          format: 'projected (meters)',
          warning: 'Coordinates appear to be in a projected CRS (meters), not WGS84. ' +
            'Expected EPSG:4326 (lon/lat in degrees). Check the parcelsEpsg input setting.'
        };
      }
    }

    return {
      format: 'unknown',
      warning: 'Could not determine coordinate format. Check if data is in WGS84 (EPSG:4326).'
    };
  }
}

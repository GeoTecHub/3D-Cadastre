// src/app/services/osm-tile.service.ts

import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { GeoTransformService, GeoExtent } from './geo-transform.service';

/** Information about a single tile */
interface TileInfo {
  x: number;
  y: number;
  z: number;
  url: string;
}

/** Result of building the OSM ground plane */
export interface OsmGroundPlaneResult {
  group: THREE.Group;
  /** Web Mercator coordinates of the ground plane center */
  centerX: number;
  centerY: number;
  /** Scale factor applied to fit the Three.js scene */
  metersPerUnit: number;
}

/** Result of building hybrid OSM layers (country + detail) */
export interface OsmHybridResult {
  /** Country-level overview layer */
  countryLayer: OsmGroundPlaneResult | null;
  /** Detail layer around the building */
  detailLayer: OsmGroundPlaneResult | null;
}

/** Predefined geographic extents */
export interface CountryExtent {
  name: string;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

/** Predefined country extents */
export const COUNTRY_EXTENTS: Record<string, CountryExtent> = {
  SRI_LANKA: {
    name: 'Sri Lanka',
    minLon: 79.5,
    maxLon: 82.0,
    minLat: 5.9,
    maxLat: 9.9
  },
  INDIA: {
    name: 'India',
    minLon: 68.0,
    maxLon: 97.5,
    minLat: 6.5,
    maxLat: 37.0
  }
};

/**
 * Fetches OpenStreetMap tiles and builds a Three.js ground plane
 * textured with the map imagery.
 *
 * Tile URL template follows the standard OSM slippy map convention.
 */
@Injectable({ providedIn: 'root' })
export class OsmTileService {
  private static readonly TILE_SIZE = 256;
  private static readonly TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  /** Earth circumference at equator in meters (Web Mercator) */
  private static readonly EARTH_CIRCUMFERENCE = 40075016.686;

  private textureLoader = new THREE.TextureLoader();

  constructor(private geoTransform: GeoTransformService) {
    // Set cross-origin for OSM tiles
    this.textureLoader.setCrossOrigin('anonymous');
  }

  /**
   * Create a textured ground plane from OSM tiles for the given geographic extent.
   *
   * @param extent The geographic extent in WGS84
   * @param sceneCenter The Three.js scene center [x, y] (used to offset the plane)
   * @param sceneSizeFactor How large the model appears in the scene (for scaling)
   * @param options Optional configuration for custom extent and zoom
   * @returns The ground plane group, or null if tiles couldn't be loaded
   */
  async createGroundPlane(
    extent: GeoExtent,
    sceneCenter: THREE.Vector3,
    sceneSizeFactor: number,
    options?: {
      /** Override the extent used for tile coverage (uses building extent for positioning) */
      customExtent?: GeoExtent;
      /** Override the zoom level */
      zoomOverride?: number;
      /** Z offset for the ground plane (default: -0.1) */
      zOffset?: number;
      /** Tile padding around the extent (default: 2) */
      padding?: number;
    }
  ): Promise<OsmGroundPlaneResult | null> {
    // Use custom extent for tile coverage if provided, otherwise use building extent
    const tileExtent = options?.customExtent || extent;

    // Determine an appropriate zoom level based on extent size
    const zoom = options?.zoomOverride ?? this.calculateZoom(tileExtent);
    const padding = options?.padding ?? 2; // extra tiles around the extent
    const zOffset = options?.zOffset ?? -0.1;

    // Get tile range covering the extent + padding
    const minTile = this.lonLatToTile(tileExtent.minLon, tileExtent.maxLat, zoom); // top-left
    const maxTile = this.lonLatToTile(tileExtent.maxLon, tileExtent.minLat, zoom); // bottom-right

    const startX = minTile.x - padding;
    const endX = maxTile.x + padding;
    const startY = minTile.y - padding;
    const endY = maxTile.y + padding;

    // Calculate the Web Mercator position of the building center
    const [centerMX, centerMY] = this.geoTransform.lonLatToWebMercator(
      extent.centerLon, extent.centerLat
    );

    // Calculate meters per tile at this zoom level
    const metersPerTile = OsmTileService.EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
    const metersPerPixel = metersPerTile / OsmTileService.TILE_SIZE;

    // We need to figure out what scale factor the scene uses.
    // The building model spans some meters in reality and some units in Three.js.
    // We compute the real-world extent in meters:
    const [minMX, minMY] = this.geoTransform.lonLatToWebMercator(extent.minLon, extent.minLat);
    const [maxMX, maxMY] = this.geoTransform.lonLatToWebMercator(extent.maxLon, extent.maxLat);
    const realWidthMeters = Math.abs(maxMX - minMX);
    const realHeightMeters = Math.abs(maxMY - minMY);

    // The building in the scene has a certain size; we compute the scene-to-meter ratio
    // sceneSizeFactor is the max dimension of the building model in scene units
    const realMaxDim = Math.max(realWidthMeters, realHeightMeters, 1);
    const sceneToMeterRatio = sceneSizeFactor / realMaxDim;

    // Each tile covers metersPerTile real meters → in scene units:
    const tileSizeInScene = metersPerTile * sceneToMeterRatio;

    const group = new THREE.Group();
    group.name = 'osm-ground-plane';

    // Calculate the tile that contains the center
    const centerTile = this.lonLatToTile(extent.centerLon, extent.centerLat, zoom);

    // Load tiles
    const tilePromises: Promise<void>[] = [];

    for (let tx = startX; tx <= endX; tx++) {
      for (let ty = startY; ty <= endY; ty++) {
        const url = this.getTileUrl(tx, ty, zoom);

        // Position offset from center tile (in scene units)
        const offsetX = (tx - centerTile.x) * tileSizeInScene;
        const offsetY = -(ty - centerTile.y) * tileSizeInScene; // Y is flipped in tiles

        const promise = this.loadTileMesh(url, tileSizeInScene, offsetX, offsetY)
          .then(mesh => {
            if (mesh) {
              group.add(mesh);
            }
          })
          .catch(() => {
            // Silently skip failed tiles
          });

        tilePromises.push(promise);
      }
    }

    await Promise.allSettled(tilePromises);

    if (group.children.length === 0) {
      return null;
    }

    // Position the group at the scene center, at z = slightly below ground
    // Note: The tile offset calculation (tx - centerTile.x) already uses the fractional
    // tile coordinates, which correctly positions tiles so the geographic center is at (0,0).
    // No additional fractional adjustment is needed here.
    group.position.set(
      sceneCenter.x,
      sceneCenter.y,
      sceneCenter.z + zOffset // Offset to avoid z-fighting with ground surfaces
    );

    return {
      group,
      centerX: centerMX,
      centerY: centerMY,
      metersPerUnit: 1 / sceneToMeterRatio
    };
  }

  /**
   * Create hybrid OSM layers with both country overview and building detail.
   * The country layer provides geographic context while the detail layer shows
   * street-level information around the building.
   *
   * @param buildingExtent The building's geographic extent in WGS84
   * @param countryExtent The country's geographic extent for the overview layer
   * @param sceneCenter The Three.js scene center
   * @param sceneSizeFactor How large the model appears in the scene
   * @returns Both country and detail layers
   */
  async createHybridLayers(
    buildingExtent: GeoExtent,
    countryExtent: CountryExtent,
    sceneCenter: THREE.Vector3,
    sceneSizeFactor: number
  ): Promise<OsmHybridResult> {
    // Create the country overview extent
    const countryGeoExtent: GeoExtent = {
      minLon: countryExtent.minLon,
      maxLon: countryExtent.maxLon,
      minLat: countryExtent.minLat,
      maxLat: countryExtent.maxLat,
      centerLon: (countryExtent.minLon + countryExtent.maxLon) / 2,
      centerLat: (countryExtent.minLat + countryExtent.maxLat) / 2,
      epsg: 4326, // WGS84 for country extents
      crsExplicit: true
    };

    // Calculate appropriate zoom levels
    const countryZoom = this.calculateZoom(countryGeoExtent);
    const detailZoom = this.calculateZoom(buildingExtent);

    console.log(`[OSM Hybrid] Country zoom: ${countryZoom}, Detail zoom: ${detailZoom}`);
    console.log(`[OSM Hybrid] Building center: ${buildingExtent.centerLon}, ${buildingExtent.centerLat}`);

    // Create both layers in parallel
    const [countryLayer, detailLayer] = await Promise.all([
      // Country layer - lower zoom, covers whole country, positioned slightly lower
      this.createGroundPlane(buildingExtent, sceneCenter, sceneSizeFactor, {
        customExtent: countryGeoExtent,
        zoomOverride: Math.min(countryZoom, 8), // Cap at zoom 8 for country view
        zOffset: -0.2, // Below detail layer
        padding: 1
      }),
      // Detail layer - higher zoom, around building, positioned above country layer
      this.createGroundPlane(buildingExtent, sceneCenter, sceneSizeFactor, {
        zoomOverride: Math.max(detailZoom, 16), // At least zoom 16 for street detail
        zOffset: -0.1, // Above country layer
        padding: 3 // More padding for detail view
      })
    ]);

    // Name the groups for easy identification
    if (countryLayer?.group) {
      countryLayer.group.name = 'osm-country-layer';
    }
    if (detailLayer?.group) {
      detailLayer.group.name = 'osm-detail-layer';
    }

    return { countryLayer, detailLayer };
  }

  /**
   * Convert a CountryExtent to GeoExtent format
   */
  countryToGeoExtent(country: CountryExtent): GeoExtent {
    return {
      minLon: country.minLon,
      maxLon: country.maxLon,
      minLat: country.minLat,
      maxLat: country.maxLat,
      centerLon: (country.minLon + country.maxLon) / 2,
      centerLat: (country.minLat + country.maxLat) / 2,
      epsg: 4326, // WGS84 for country extents
      crsExplicit: true
    };
  }

  /**
   * Calculate the best zoom level for the given extent.
   * We want roughly 5-7 tiles across the building extent.
   */
  private calculateZoom(extent: GeoExtent): number {
    const lonSpan = extent.maxLon - extent.minLon;
    const latSpan = extent.maxLat - extent.minLat;
    const maxSpan = Math.max(lonSpan, latSpan);

    // At zoom z, the world is 2^z tiles of 360/2^z degrees each
    // We want about 5 tiles across the building, so:
    // tilesAcross = maxSpan / (360 / 2^z) ≈ 5
    // 2^z = 5 * 360 / maxSpan
    if (maxSpan <= 0) return 18;

    const z = Math.log2(5 * 360 / maxSpan);
    return Math.max(1, Math.min(19, Math.round(z)));
  }

  /**
   * Convert lon/lat to tile coordinates at the given zoom level.
   * Returns fractional tile coordinates.
   */
  private lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
    const n = Math.pow(2, zoom);
    const x = ((lon + 180) / 360) * n;
    const latRad = lat * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    return { x, y };
  }

  private getTileUrl(x: number, y: number, z: number): string {
    // Wrap x to valid range
    const n = Math.pow(2, z);
    const wrappedX = ((x % n) + n) % n;
    return OsmTileService.TILE_URL
      .replace('{z}', z.toString())
      .replace('{x}', Math.floor(wrappedX).toString())
      .replace('{y}', Math.floor(y).toString());
  }

  /**
   * Load a single tile as a textured plane mesh.
   */
  private loadTileMesh(
    url: string,
    size: number,
    offsetX: number,
    offsetY: number
  ): Promise<THREE.Mesh | null> {
    return new Promise((resolve) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.colorSpace = THREE.SRGBColorSpace;

          const geometry = new THREE.PlaneGeometry(size, size);
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: false,
            depthWrite: true
          });

          const mesh = new THREE.Mesh(geometry, material);
          // Position in the XY plane (Z is up in our scene)
          mesh.position.set(offsetX + size / 2, offsetY - size / 2, 0);
          mesh.name = 'osm-tile';

          resolve(mesh);
        },
        undefined,
        () => {
          // Load error — return null
          resolve(null);
        }
      );
    });
  }
}

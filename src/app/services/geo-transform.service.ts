// src/app/services/geo-transform.service.ts

import { Injectable } from '@angular/core';
import proj4 from 'proj4';
import { CityJSON } from './cityjson.model';

/** Geographic center + extent in WGS84 (lat/lon) */
export interface GeoExtent {
  centerLon: number;
  centerLat: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  /** The detected or assumed EPSG code */
  epsg: number;
  /** Whether the CRS was explicitly defined in the file */
  crsExplicit: boolean;
}

/**
 * Handles CRS detection from CityJSON metadata and coordinate
 * transformation to WGS84 (EPSG:4326) using proj4js.
 */
@Injectable({ providedIn: 'root' })
export class GeoTransformService {

  /** Map of compound / 3D CRS codes to their 2D horizontal base code */
  private static readonly COMPOUND_TO_2D: Record<number, number> = {
    7415: 28992,  // Amersfoort / RD New + NAP height → RD New
    7416: 28992,  // Amersfoort / RD New + MSL NL depth → RD New
    9286: 28992,  // Amersfoort / RD New + NAP 2022 → RD New
    4979: 4326,   // WGS84 geographic 3D → WGS84 2D
    4978: 4326,   // WGS84 geocentric → WGS84 2D
    3855: 4326,   // EGM2008 height (used with 4326)
    7409: 25831,  // ETRS89 / UTM zone 31N + EVRF2000 → ETRS89 UTM 31N
    7410: 25832,  // ETRS89 / UTM zone 32N + EVRF2000 → ETRS89 UTM 32N
    7411: 25833,  // ETRS89 / UTM zone 33N + EVRF2000 → ETRS89 UTM 33N
    9518: 3414,   // SVY21 / Singapore TM + SHD → SVY21
  };

  constructor() {
    // Register common cadastral CRS definitions that proj4 doesn't know by default

    // Dutch RD New (base for EPSG:7415 compound)
    proj4.defs('EPSG:28992', '+proj=sterea +lat_0=52.1561605555556 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.4171,50.3319,465.5524,-0.398957,0.343988,-1.87740,4.0725 +units=m +no_defs');
    // Singapore SVY21
    proj4.defs('EPSG:3414', '+proj=tmerc +lat_0=1.36666666666667 +lon_0=103.833333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs');
    // UTM Zone 33N (common in Europe)
    proj4.defs('EPSG:32633', '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs');
    // ETRS89 / UTM zones 31-33 (common across Europe)
    proj4.defs('EPSG:25831', '+proj=utm +zone=31 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    proj4.defs('EPSG:25833', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
  }

  /**
   * Detect the CRS from CityJSON metadata and compute the geographic
   * extent in WGS84 (lon/lat).
   *
   * Returns null if the model uses purely local coordinates and no
   * referenceSystem is specified.
   */
  async getGeoExtent(cityjson: CityJSON): Promise<GeoExtent | null> {
    let epsg = this.detectEPSG(cityjson);
    if (!epsg) return null;

    // Resolve compound / 3D CRS to their 2D horizontal base
    const baseEpsg = GeoTransformService.COMPOUND_TO_2D[epsg];
    if (baseEpsg) {
      console.info(`GeoTransform: Resolving compound EPSG:${epsg} → EPSG:${baseEpsg}`);
      epsg = baseEpsg;
    }

    // Ensure the CRS is registered in proj4
    await this.ensureCrsDefined(epsg);

    // Get transformed vertices bounding box
    const transform = cityjson.transform;
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const v of cityjson.vertices) {
      let x = v[0], y = v[1];
      if (transform) {
        x = x * transform.scale[0] + transform.translate[0];
        y = y * transform.scale[1] + transform.translate[1];
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    // Quick sanity check — local coordinate models often have small extents near origin
    if (epsg !== 4326 && epsg !== 3857 && maxX < 1000 && maxY < 1000 && minX >= 0 && minY >= 0) {
      // Likely local coordinates despite having a CRS declaration
      return null;
    }

    // Transform corners to WGS84 (EPSG:4326)
    const srcProj = `EPSG:${epsg}`;
    try {
      const bl = proj4(srcProj, 'EPSG:4326', [minX, minY]);
      const tr = proj4(srcProj, 'EPSG:4326', [maxX, maxY]);

      // Validate results are plausible lon/lat
      if (!this.isValidLonLat(bl[0], bl[1]) || !this.isValidLonLat(tr[0], tr[1])) {
        return null;
      }

      return {
        centerLon: (bl[0] + tr[0]) / 2,
        centerLat: (bl[1] + tr[1]) / 2,
        minLon: Math.min(bl[0], tr[0]),
        minLat: Math.min(bl[1], tr[1]),
        maxLon: Math.max(bl[0], tr[0]),
        maxLat: Math.max(bl[1], tr[1]),
        epsg,
        crsExplicit: true
      };
    } catch (err) {
      console.warn('GeoTransform: proj4 conversion failed for EPSG:' + epsg, err);
      return null;
    }
  }

  /**
   * Convert a single [x, y] coordinate from the source CRS to Web Mercator (EPSG:3857).
   */
  toWebMercator(x: number, y: number, srcEpsg: number): [number, number] {
    return proj4(`EPSG:${srcEpsg}`, 'EPSG:3857', [x, y]) as [number, number];
  }

  /**
   * Convert WGS84 lon/lat to Web Mercator.
   */
  lonLatToWebMercator(lon: number, lat: number): [number, number] {
    return proj4('EPSG:4326', 'EPSG:3857', [lon, lat]) as [number, number];
  }

  /**
   * Convert Web Mercator to WGS84 lon/lat.
   */
  webMercatorToLonLat(x: number, y: number): [number, number] {
    return proj4('EPSG:3857', 'EPSG:4326', [x, y]) as [number, number];
  }

  /**
   * Convert coordinates from any source EPSG to WGS84 (lon/lat).
   * Returns null if transformation fails or result is invalid.
   */
  toWGS84(x: number, y: number, srcEpsg: number): [number, number] | null {
    // If already WGS84, just return as-is
    if (srcEpsg === 4326) {
      if (this.isValidLonLat(x, y)) {
        return [x, y];
      }
      return null;
    }

    try {
      const result = proj4(`EPSG:${srcEpsg}`, 'EPSG:4326', [x, y]) as [number, number];
      if (this.isValidLonLat(result[0], result[1])) {
        return result;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Parse the EPSG code from a CityJSON referenceSystem string.
   * Handles formats like:
   *   "urn:ogc:def:crs:EPSG::4326"
   *   "EPSG:4326"
   *   "https://www.opengis.net/def/crs/EPSG/0/4326"
   */
  private detectEPSG(cityjson: CityJSON): number | null {
    const ref = cityjson.metadata?.referenceSystem;
    if (!ref) return null;

    // Try to extract numeric EPSG code
    const patterns = [
      /EPSG::?(\d+)/i,
      /EPSG\/\d+\/(\d+)/i,
      /^(\d{4,5})$/
    ];

    for (const pattern of patterns) {
      const match = ref.match(pattern);
      if (match) {
        const code = parseInt(match[1], 10);
        if (code > 0) return code;
      }
    }

    return null;
  }

  /**
   * Ensure a CRS definition is registered in proj4.
   * If not already known, attempts to fetch the proj4 string from epsg.io.
   */
  async ensureCrsDefined(epsg: number): Promise<void> {
    const key = `EPSG:${epsg}`;
    // Already registered?
    try {
      if (proj4.defs(key)) return;
    } catch { /* not defined */ }

    // Fetch from epsg.io
    try {
      const resp = await fetch(`https://epsg.io/${epsg}.proj4`);
      if (resp.ok) {
        const proj4Str = (await resp.text()).trim();
        if (proj4Str && proj4Str.startsWith('+')) {
          proj4.defs(key, proj4Str);
          console.info(`GeoTransform: Dynamically registered ${key} from epsg.io`);
          return;
        }
      }
    } catch (err) {
      console.warn(`GeoTransform: Failed to fetch CRS definition for ${key} from epsg.io`, err);
    }
  }

  private isValidLonLat(lon: number, lat: number): boolean {
    return isFinite(lon) && isFinite(lat) &&
           lon >= -180 && lon <= 180 &&
           lat >= -90 && lat <= 90;
  }
}

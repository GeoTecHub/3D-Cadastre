// src/app/services/parcel-api.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, catchError, map, from, firstValueFrom } from 'rxjs';
import { ParcelFeatureCollection, ParcelFeature } from './parcel-layer.service';
import { LandUse } from '../models/land-parcel.model';

/**
 * Expected response structure from the InfoBhoomi backend.
 * Adjust these interfaces based on your actual API response.
 */
export interface InfoBhoomiParcel {
  id?: number;
  survey_no?: string;
  parcel_id?: string;
  cadastral_ref?: string;
  land_use?: string;
  area?: number;
  owner_name?: string;
  tenure_type?: string;
  // Geometry can come in different formats
  geometry?: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  // Or as WKT string
  geom_wkt?: string;
  // Or as separate coordinate arrays
  coordinates?: number[][];
  // Building associations
  building_ids?: string[];
  buildings?: { id: string; name?: string }[];
  // Additional properties from your InfoBhoomi app
  [key: string]: unknown;
}

export interface InfoBhoomiResponse {
  status?: string;
  message?: string;
  data?: InfoBhoomiParcel[];
  results?: InfoBhoomiParcel[];
  features?: InfoBhoomiParcel[];
  // Handle paginated responses
  count?: number;
  next?: string;
  previous?: string;
}

/**
 * Service to fetch parcel data from the InfoBhoomi backend API.
 */
@Injectable({ providedIn: 'root' })
export class ParcelApiService {

  private readonly API_BASE = 'https://infobhoomiback.geoinfobox.com/api';

  constructor(private http: HttpClient) {}

  /**
   * Fetch parcels from the backend API.
   *
   * @param endpoint - API endpoint path (default: '/user/survey_rep_data_user/')
   * @param authToken - Optional JWT or API token for authentication
   * @param bbox - Optional bounding box filter [minX, minY, maxX, maxY]
   */
  fetchParcels(
    endpoint: string = '/user/survey_rep_data_user/',
    authToken?: string,
    bbox?: [number, number, number, number]
  ): Observable<ParcelFeatureCollection> {
    const url = `${this.API_BASE}${endpoint}`;

    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    if (authToken) {
      // Use Token auth for Django REST Framework (InfoBhoomi backend)
      headers = headers.set('Authorization', `Token ${authToken}`);
    }

    // Build query params
    let params: { [key: string]: string } = {};
    if (bbox) {
      params['bbox'] = bbox.join(',');
    }

    return this.http.get<InfoBhoomiResponse>(url, { headers, params }).pipe(
      map(response => this.convertToGeoJSON(response)),
      catchError(err => {
        console.error('ParcelApiService: Failed to fetch parcels', err);
        return of({ type: 'FeatureCollection' as const, features: [] });
      })
    );
  }

  /**
   * Convert the backend response to GeoJSON FeatureCollection.
   */
  private convertToGeoJSON(response: InfoBhoomiResponse): ParcelFeatureCollection {
    // Handle different response formats
    const parcels = response.data || response.results || response.features || [];

    const features: ParcelFeature[] = parcels
      .filter(p => this.hasValidGeometry(p))
      .map(p => this.convertToFeature(p));

    console.info(`ParcelApiService: Converted ${features.length} parcels to GeoJSON`);

    return {
      type: 'FeatureCollection',
      features
    };
  }

  /**
   * Check if a parcel has valid geometry data.
   */
  private hasValidGeometry(parcel: InfoBhoomiParcel): boolean {
    return !!(
      parcel.geometry?.coordinates ||
      parcel.geom_wkt ||
      parcel.coordinates
    );
  }

  /**
   * Convert a single parcel to GeoJSON Feature.
   */
  private convertToFeature(parcel: InfoBhoomiParcel): ParcelFeature {
    // Get geometry
    let geometry: ParcelFeature['geometry'];

    if (parcel.geometry) {
      // Already in GeoJSON format
      geometry = parcel.geometry;
    } else if (parcel.coordinates) {
      // Simple coordinate array - assume Polygon
      geometry = {
        type: 'Polygon',
        coordinates: [parcel.coordinates]
      };
    } else if (parcel.geom_wkt) {
      // WKT format - parse it
      geometry = this.parseWKT(parcel.geom_wkt);
    } else {
      // Fallback empty polygon
      geometry = { type: 'Polygon', coordinates: [[]] };
    }

    // Extract building IDs
    let buildingIds: string[] = [];
    if (parcel.building_ids) {
      buildingIds = parcel.building_ids;
    } else if (parcel.buildings) {
      buildingIds = parcel.buildings.map(b => b.id);
    }

    // Map land use to our enum
    const landUse = this.mapLandUse(parcel.land_use);

    return {
      type: 'Feature',
      properties: {
        parcelId: parcel.parcel_id || parcel.survey_no || `P-${parcel.id}`,
        cadastralRef: parcel.cadastral_ref || parcel.survey_no,
        landUse,
        area: parcel.area,
        buildingIds,
        // Preserve original properties
        ownerName: parcel.owner_name,
        tenureType: parcel.tenure_type
      },
      geometry
    };
  }

  /**
   * Parse WKT (Well-Known Text) geometry to GeoJSON.
   * Supports POLYGON and MULTIPOLYGON.
   */
  private parseWKT(wkt: string): ParcelFeature['geometry'] {
    try {
      const cleanWkt = wkt.trim().toUpperCase();

      if (cleanWkt.startsWith('POLYGON')) {
        const coordsMatch = wkt.match(/\(\(([^)]+)\)\)/);
        if (coordsMatch) {
          const coords = this.parseWKTRing(coordsMatch[1]);
          return { type: 'Polygon', coordinates: [coords] };
        }
      } else if (cleanWkt.startsWith('MULTIPOLYGON')) {
        // Handle MultiPolygon - simplified parsing
        const polygonMatches = wkt.matchAll(/\(\(([^)]+)\)\)/g);
        const polygons: number[][][][] = [];
        for (const match of polygonMatches) {
          const coords = this.parseWKTRing(match[1]);
          polygons.push([coords]);
        }
        return { type: 'MultiPolygon', coordinates: polygons };
      }
    } catch (err) {
      console.warn('ParcelApiService: Failed to parse WKT', wkt, err);
    }

    return { type: 'Polygon', coordinates: [[]] };
  }

  /**
   * Parse a WKT coordinate ring string to array of [x, y] coordinates.
   */
  private parseWKTRing(ringStr: string): number[][] {
    return ringStr
      .split(',')
      .map(pair => {
        const [x, y] = pair.trim().split(/\s+/).map(Number);
        return [x, y];
      })
      .filter(coord => !isNaN(coord[0]) && !isNaN(coord[1]));
  }

  /**
   * Fetch all parcels from a paginated API endpoint.
   * Handles pagination automatically by following the 'next' links.
   *
   * @param endpoint - API endpoint path (default: '/user/survey_rep_data_user/')
   * @param authToken - JWT or API token for authentication
   * @returns Observable with all parcels combined into a single FeatureCollection
   */
  fetchAllParcels(
    endpoint: string = '/user/survey_rep_data_user/',
    authToken: string
  ): Observable<ParcelFeatureCollection> {
    return from(this.fetchAllPagesAsync(endpoint, authToken));
  }

  /**
   * Async method to fetch all pages of parcels.
   */
  private async fetchAllPagesAsync(
    endpoint: string,
    authToken: string
  ): Promise<ParcelFeatureCollection> {
    const allParcels: InfoBhoomiParcel[] = [];
    let url: string | null = `${this.API_BASE}${endpoint}`;
    let pageCount = 0;

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Token ${authToken}`
    });

    while (url) {
      pageCount++;
      console.info(`ParcelApiService: Fetching page ${pageCount} from ${url}`);

      try {
        const response: InfoBhoomiResponse = await firstValueFrom(
          this.http.get<InfoBhoomiResponse>(url, { headers })
        );
        if (!response) break;

        // Extract parcels from this page
        const pageParcels = response.data || response.results || response.features || [];
        allParcels.push(...pageParcels);

        console.info(`ParcelApiService: Page ${pageCount} returned ${pageParcels.length} parcels (total: ${allParcels.length})`);

        // Check for next page
        url = response.next || null;
      } catch (err) {
        console.error(`ParcelApiService: Error fetching page ${pageCount}`, err);
        break;
      }
    }

    console.info(`ParcelApiService: Fetched ${allParcels.length} parcels from ${pageCount} pages`);
    return this.convertToGeoJSON({ data: allParcels });
  }

  /**
   * Load parcels from a local JSON file.
   * Use this when the API is not directly accessible.
   *
   * @param filePath - Path to the JSON file (relative to assets or public folder)
   */
  loadParcelsFromFile(filePath: string = '/parcels.json'): Observable<ParcelFeatureCollection> {
    return this.http.get<InfoBhoomiResponse | InfoBhoomiParcel[]>(filePath).pipe(
      map(response => {
        // Handle array response directly
        if (Array.isArray(response)) {
          return this.convertToGeoJSON({ data: response });
        }
        return this.convertToGeoJSON(response);
      }),
      catchError(err => {
        console.error('ParcelApiService: Failed to load parcels from file', err);
        return of({ type: 'FeatureCollection' as const, features: [] });
      })
    );
  }

  /**
   * Create parcels from raw data (for inline data or testing).
   */
  createParcelsFromData(data: InfoBhoomiParcel[]): ParcelFeatureCollection {
    return this.convertToGeoJSON({ data });
  }

  /**
   * Map backend land use values to our LandUse enum.
   */
  private mapLandUse(landUse?: string): LandUse {
    if (!landUse) return LandUse.RES;

    const normalized = landUse.toUpperCase();

    const mapping: Record<string, LandUse> = {
      'RESIDENTIAL': LandUse.RES,
      'RES': LandUse.RES,
      'COMMERCIAL': LandUse.COM,
      'COM': LandUse.COM,
      'INDUSTRIAL': LandUse.IND,
      'IND': LandUse.IND,
      'AGRICULTURAL': LandUse.AGR,
      'AGR': LandUse.AGR,
      'AGRICULTURE': LandUse.AGR,
      'RECREATIONAL': LandUse.REC,
      'REC': LandUse.REC,
      'INSTITUTIONAL': LandUse.PUB,
      'PUBLIC': LandUse.PUB,
      'PUB': LandUse.PUB,
      'MIXED': LandUse.MIX,
      'MIX': LandUse.MIX,
      'MIXED_USE': LandUse.MIX,
      'TRANSPORT': LandUse.TRN,
      'TRANSPORTATION': LandUse.TRN,
      'TRN': LandUse.TRN,
      'VACANT': LandUse.VAC,
      'VAC': LandUse.VAC
    };

    return mapping[normalized] || LandUse.RES;
  }
}

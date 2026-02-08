// src/app/services/parcel-api.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, catchError, map, from, firstValueFrom, throwError, switchMap } from 'rxjs';
import { ParcelFeatureCollection, ParcelFeature } from './parcel-layer.service';
import { LandUse } from '../models/land-parcel.model';

/**
 * Authentication validation response from /api/user/user-authentication/
 */
export interface AuthValidationResponse {
  is_token_valid: boolean;
  is_active: boolean;
  is_role_id: boolean;
  is_org_active: boolean;
}

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

  // Use relative path to leverage Angular's proxy configuration (avoids CORS)
  private readonly API_BASE = '/api';
  // Full URL used to strip from pagination 'next' links
  private readonly FULL_API_HOST = 'https://infobhoomiback.geoinfobox.com';

  constructor(private http: HttpClient) {}

  /**
   * Validate user authentication by calling /api/user/user-authentication/
   * Checks all 4 required fields: is_token_valid, is_active, is_role_id, is_org_active
   *
   * @param authToken - JWT or API token for authentication
   * @returns Observable that completes if valid, throws error if invalid
   */
  validateAuthentication(authToken: string): Observable<AuthValidationResponse> {
    const url = `${this.API_BASE}/user/user-authentication/`;
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Token ${authToken}`
    });

    return this.http.post<AuthValidationResponse>(url, {}, { headers }).pipe(
      map(response => {
        // Check all 4 validation fields
        const errors: string[] = [];

        if (!response.is_token_valid) {
          errors.push('Token is invalid or expired');
        }
        if (!response.is_active) {
          errors.push('User account is not active');
        }
        if (!response.is_role_id) {
          errors.push('User role is not valid');
        }
        if (!response.is_org_active) {
          errors.push('Organization is not active');
        }

        if (errors.length > 0) {
          const errorMessage = `Authentication failed: ${errors.join(', ')}`;
          console.error('ParcelApiService:', errorMessage);
          throw new Error(errorMessage);
        }

        console.info('ParcelApiService: Authentication validated successfully');
        return response;
      }),
      catchError(err => {
        if (err instanceof Error) {
          return throwError(() => err);
        }
        console.error('ParcelApiService: Authentication validation failed', err);
        return throwError(() => new Error('Authentication validation failed. Please login again.'));
      })
    );
  }

  /**
   * Fetch survey/parcel geometry data from /api/user/survey_rep_data_user/
   *
   * @param authToken - JWT or API token for authentication
   * @param bbox - Optional bounding box filter [minX, minY, maxX, maxY]
   */
  fetchSurveyData(
    authToken: string,
    bbox?: [number, number, number, number]
  ): Observable<ParcelFeatureCollection> {
    const url = `${this.API_BASE}/user/survey_rep_data_user/`;
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Token ${authToken}`
    });

    const body: { [key: string]: unknown } = {};
    if (bbox) {
      body['bbox'] = bbox.join(',');
    }

    return this.http.post<InfoBhoomiResponse>(url, body, { headers }).pipe(
      map(response => this.convertToGeoJSON(response)),
      catchError(err => {
        console.error('ParcelApiService: Failed to fetch survey data', err);
        return throwError(() => new Error('Failed to fetch survey data'));
      })
    );
  }

  /**
   * Fetch parcels from the backend API.
   * First validates authentication, then fetches geometry data.
   *
   * @param authToken - JWT or API token for authentication
   * @param bbox - Optional bounding box filter [minX, minY, maxX, maxY]
   */
  fetchParcels(
    endpoint: string = '/user/survey_rep_data_user/',
    authToken?: string,
    bbox?: [number, number, number, number]
  ): Observable<ParcelFeatureCollection> {
    if (!authToken) {
      console.error('ParcelApiService: No auth token provided');
      return of({ type: 'FeatureCollection' as const, features: [] });
    }

    // First validate authentication, then fetch survey data
    return this.validateAuthentication(authToken).pipe(
      switchMap(() => this.fetchSurveyData(authToken, bbox)),
      catchError(err => {
        console.error('ParcelApiService: Failed to fetch parcels', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Convert the backend response to GeoJSON FeatureCollection.
   */
  private convertToGeoJSON(response: InfoBhoomiResponse): ParcelFeatureCollection {
    // Handle different response formats
    const parcels = response.data || response.results || response.features || [];

    // Debug: Log raw parcel data structure
    if (parcels.length > 0) {
      const sample = parcels[0];
      console.debug('ParcelApiService: Raw parcel sample:', {
        keys: Object.keys(sample),
        hasGeometry: !!sample.geometry,
        hasGeomWkt: !!sample.geom_wkt,
        hasCoordinates: !!sample.coordinates,
        geometryType: sample.geometry?.type,
        // Log first few coordinates to check format (lon/lat order)
        sampleCoords: sample.geometry?.coordinates
          ? this.getSampleCoords(sample.geometry)
          : sample.coordinates?.slice(0, 3)
      });
    }

    const features: ParcelFeature[] = parcels
      .filter(p => this.hasValidGeometry(p))
      .map(p => this.convertToFeature(p));

    console.info(`ParcelApiService: Converted ${features.length} parcels to GeoJSON`);

    // Debug: Log first converted feature
    if (features.length > 0) {
      const first = features[0];
      const coords = first.geometry.type === 'Polygon'
        ? (first.geometry.coordinates as number[][][])[0]?.slice(0, 3)
        : (first.geometry.coordinates as number[][][][])[0]?.[0]?.slice(0, 3);
      console.debug('ParcelApiService: Converted feature sample:', {
        parcelId: first.properties.parcelId,
        geometryType: first.geometry.type,
        coordsSample: coords?.map(c => `[${c[0]?.toFixed(6)}, ${c[1]?.toFixed(6)}]`).join(', '),
        coordFormat: coords?.[0] ? (
          Math.abs(coords[0][0]) <= 180 && Math.abs(coords[0][1]) <= 90
            ? 'Looks like WGS84 [lon, lat]'
            : 'May be projected coordinates (not WGS84)'
        ) : 'Unknown'
      });
    }

    return {
      type: 'FeatureCollection',
      features
    };
  }

  /**
   * Get sample coordinates from geometry for logging.
   */
  private getSampleCoords(geometry: { type: string; coordinates: unknown }): string {
    try {
      if (geometry.type === 'Polygon') {
        const coords = (geometry.coordinates as number[][][])[0];
        return coords?.slice(0, 3).map(c => `[${c[0]?.toFixed(6)}, ${c[1]?.toFixed(6)}]`).join(', ') || 'empty';
      } else if (geometry.type === 'MultiPolygon') {
        const coords = (geometry.coordinates as number[][][][])[0]?.[0];
        return coords?.slice(0, 3).map(c => `[${c[0]?.toFixed(6)}, ${c[1]?.toFixed(6)}]`).join(', ') || 'empty';
      }
    } catch {
      return 'parse error';
    }
    return 'unknown type';
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
   * Fetch all parcels from the InfoBhoomi API.
   * First validates authentication, then fetches geometry data with pagination.
   *
   * @param endpoint - API endpoint path (default: '/user/survey_rep_data_user/')
   * @param authToken - JWT or API token for authentication
   * @returns Observable with all parcels combined into a single FeatureCollection
   */
  fetchAllParcels(
    endpoint: string = '/user/survey_rep_data_user/',
    authToken: string
  ): Observable<ParcelFeatureCollection> {
    // First validate authentication, then fetch all pages
    return this.validateAuthentication(authToken).pipe(
      switchMap(() => from(this.fetchAllPagesAsync(endpoint, authToken))),
      catchError(err => {
        console.error('ParcelApiService: Failed to fetch all parcels', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Async method to fetch all pages of parcels from survey_rep_data_user endpoint.
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
        // Use POST method for the survey_rep_data_user endpoint
        const response: InfoBhoomiResponse = await firstValueFrom(
          this.http.post<InfoBhoomiResponse>(url, {}, { headers })
        );
        if (!response) break;

        // Extract parcels from this page
        const pageParcels = response.data || response.results || response.features || [];
        allParcels.push(...pageParcels);

        console.info(`ParcelApiService: Page ${pageCount} returned ${pageParcels.length} parcels (total: ${allParcels.length})`);

        // Check for next page - convert full URL to relative path for proxy
        if (response.next) {
          url = response.next.replace(this.FULL_API_HOST, '');
        } else {
          url = null;
        }
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

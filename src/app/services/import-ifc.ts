import { Injectable } from '@angular/core';
import { IfcAPI, FlatMesh } from 'web-ifc';
import { Matrix4, Vector3 } from 'three';

export interface CityJSONGeometry {
  type: string;
  lod: number;
  boundaries: number[][][];
}

export interface CityJSONObject {
  type: string;
  geometry: CityJSONGeometry[];
  attributes?: Record<string, unknown>;
}

export interface CityJSON {
  type: 'CityJSON';
  version: string;
  metadata?: Record<string, unknown>;
  vertices: number[][];
  CityObjects: Record<string, CityJSONObject>;
  transform?: Record<string, unknown>;
}

export interface ConvertIfcOptions {
  /**
   * Override the location of the web-ifc wasm asset.
   * Defaults to `/assets/` which expects `web-ifc.wasm` to be served there.
   */
  wasmPath?: string;
  /**
   * Logical Level Of Detail written in the output geometry.
   * Defaults to `2`.
   */
  lod?: number;
}

export interface IfcObjectSummary {
  objectId: string;
  expressID: number;
  ifcType: string;
  name?: string;
  include?: boolean;
  attributes: Record<string, unknown>;
  rawIfc?: Record<string, unknown>;
}

export interface IfcImportResult {
  cityjson: CityJSON;
  objects: IfcObjectSummary[];
}

@Injectable({
  providedIn: 'root',
})
export class ImportIFC {
  private ifcApi: IfcAPI | null = null;
  private initPromise: Promise<void> | null = null;
  private wasmBasePath: string | null = null;

  /**
   * Prepares an IFC import session providing both the generated CityJSON and
   * per-object metadata for inspection/editing prior to final import.
   */
  async prepareIfcImport(
    source: File | ArrayBuffer | Uint8Array,
    options: ConvertIfcOptions = {}
  ): Promise<IfcImportResult> {
    const lod = options.lod ?? 2;
    await this.ensureIfcReady(options.wasmPath);

    const buffer = await this.coerceToUint8Array(source);
    const modelID = this.ifcApi!.OpenModel(buffer);

    try {
      const vertices: number[][] = [];
      const vertexMap = new Map<string, number>();
      const cityObjects: Record<string, CityJSONObject> = {};
      const summaries = new Map<string, IfcObjectSummary>();

      const meshes = this.ifcApi!.LoadAllGeometry(modelID);
      const meshCount = meshes.size();

      for (let i = 0; i < meshCount; i++) {
        const mesh = meshes.get(i);
        if (!mesh) continue;
        const result = this.meshToCityObject(
          modelID,
          mesh,
          vertices,
          vertexMap,
          lod
        );
        if (typeof (mesh as { delete?: () => void }).delete === 'function') {
          mesh.delete();
        }
        if (!result) continue;
        cityObjects[result.id] = result.payload;
        if (!summaries.has(result.id) && result.summary) {
          summaries.set(result.id, result.summary);
        }
      }

      const cityjson: CityJSON = {
        type: 'CityJSON',
        version: '1.1',
        metadata: {
          source: 'IFC',
          generatedAt: new Date().toISOString(),
          meshCount,
        },
        vertices,
        CityObjects: cityObjects,
      };

      return {
        cityjson,
        objects: Array.from(summaries.values()),
      };
    } finally {
      this.ifcApi!.CloseModel(modelID);
    }
  }

  /**
   * Backwards compatible helper returning only the CityJSON payload.
   */
  async convertIfcToCityJSON(
    source: File | ArrayBuffer | Uint8Array,
    options: ConvertIfcOptions = {}
  ): Promise<CityJSON> {
    const { cityjson } = await this.prepareIfcImport(source, options);
    return cityjson;
  }

  private async ensureIfcReady(wasmPath?: string): Promise<void> {
    if (!this.ifcApi) {
      this.ifcApi = new IfcAPI();
    }
    if (!this.initPromise) {
      const { path, isAbsolute } = this.resolveWasmBasePath(wasmPath);
      this.wasmBasePath = path;
      this.ifcApi.SetWasmPath(path, isAbsolute);
      this.initPromise = this.ifcApi.Init();
    }
    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      const basePath = this.wasmBasePath ?? '(unknown path)';
      if (
        error instanceof Error &&
        /fetch|loading wasm|failed to sync response|404/i.test(error.message)
      ) {
        throw new Error(
          `Failed to load web-ifc.wasm from "${basePath}". ` +
          'Ensure the file is reachable (e.g. served from /assets/web-ifc.wasm) or ' +
          'provide a custom wasmPath in ImportIFC options.'
        );
      }
      throw error;
    }
  }

  private resolveWasmBasePath(
    provided?: string
  ): { path: string; isAbsolute: boolean } {
    if (provided && provided.trim().length) {
      const normalised = this.ensureTrailingSlash(provided.trim());
      return {
        path: normalised,
        isAbsolute: this.isAbsolutePath(normalised),
      };
    }

    if (typeof document !== 'undefined') {
      const baseHref = document.querySelector('base')?.href;
      if (baseHref) {
        try {
          const url = new URL('./assets/', baseHref);
          return { path: this.ensureTrailingSlash(url.href), isAbsolute: true };
        } catch {
          // fall through to default
        }
      }
    }

    return { path: 'assets/', isAbsolute: false };
  }

  private ensureTrailingSlash(path: string): string {
    return path.endsWith('/') ? path : `${path}/`;
  }

  private isAbsolutePath(path: string): boolean {
    return /^([a-z]+:)?\/\//i.test(path) || path.startsWith('/');
  }

  private async coerceToUint8Array(
    source: File | ArrayBuffer | Uint8Array
  ): Promise<Uint8Array> {
    if (source instanceof Uint8Array) {
      return source;
    }
    if (source instanceof ArrayBuffer) {
      return new Uint8Array(source);
    }
    const buffer = await source.arrayBuffer();
    return new Uint8Array(buffer);
  }

  private meshToCityObject(
    modelID: number,
    mesh: FlatMesh,
    vertices: number[][],
    vertexMap: Map<string, number>,
    lod: number
  ): { id: string; payload: CityJSONObject; summary?: IfcObjectSummary } | null {
    const cityGeometries: CityJSONGeometry[] = [];
    const geoms = mesh.geometries;
    const geomCount = geoms.size();
    const ifcLine = this.ifcApi!.GetLine(modelID, mesh.expressID);
    const ifcType = this.normalizeIfcType(ifcLine?.type);
    const cityType = this.mapIfcTypeToCityJSON(ifcType);
    const objectId =
      (this.ifcApi!.GetGuidFromExpressId(modelID, mesh.expressID) as string) ??
      `ifc_${mesh.expressID}`;
    const name = this.extractIfcName(ifcLine);

    for (let i = 0; i < geomCount; i++) {
      const placed = geoms.get(i);
      if (!placed) continue;

      const geometry = this.ifcApi!.GetGeometry(
        modelID,
        placed.geometryExpressID
      );
      const vertexArray = this.ifcApi!.GetVertexArray(
        geometry.GetVertexData(),
        geometry.GetVertexDataSize()
      );
      const indexArray = this.ifcApi!.GetIndexArray(
        geometry.GetIndexData(),
        geometry.GetIndexDataSize()
      );

      const transform = new Matrix4().fromArray(placed.flatTransformation);
      const transformed = this.triangulatedBoundaries(
        vertexArray,
        indexArray,
        transform,
        vertices,
        vertexMap
      );

      if (typeof (geometry as { delete?: () => void }).delete === 'function') {
        geometry.delete();
      }

      // ✨ CLEAN BOUNDARIES BEFORE ADDING
      const cleaned = this.cleanBoundaries(transformed);
      if (!cleaned.length) {
        console.warn(`No valid boundaries for object ${objectId} geometry ${i}`);
        continue;
      }

      // ✨ ASSIGN SEMANTIC TYPES PER BOUNDARY
      const surfaceTypes = cleaned.map(boundary =>
        this.getSemanticSurfaceType(ifcType, vertices, boundary[0])
      );

      const uniqueTypes = [...new Set(surfaceTypes)];
      const surfaces = uniqueTypes.map(type => ({ type }));
      const values = surfaceTypes.map(type => uniqueTypes.indexOf(type));

      cityGeometries.push({
        type: 'MultiSurface',
        lod,
        boundaries: cleaned,
        semantics: {
          surfaces,
          values
        }
      });
    }

    if (!cityGeometries.length) {
      console.warn(`Skipping object ${objectId}: no valid geometries`);
      return null;
    }

    const baseAttributes: Record<string, unknown> = {
      expressID: mesh.expressID,
      ifcType,
    };
    if (name) {
      baseAttributes['name'] = name;
    }

    const summary: IfcObjectSummary | undefined = {
      objectId,
      expressID: mesh.expressID,
      ifcType,
      name,
      attributes: { ...baseAttributes },
      rawIfc: this.cloneIfcLine(ifcLine),
    };

    return {
      id: objectId,
      payload: {
        type: cityType,
        geometry: cityGeometries,
        attributes: baseAttributes,
      },
      summary,
    };
  }

  private getSemanticSurfaceType(ifcType: string, vertices: number[][], boundary: number[]): string {
    const normalized = ifcType.toUpperCase();

    // Direct IFC type mapping
    const directMapping: Record<string, string> = {
      'IFCWALL': 'WallSurface',
      'IFCWALLSTANDARDCASE': 'WallSurface',
      'IFCROOF': 'RoofSurface',
      'IFCDOOR': 'Door',
      'IFCWINDOW': 'Window',
      'IFCCURTAINWALL': 'WallSurface',
      'IFCPLATE': 'WallSurface',
      'IFCBEAM': 'WallSurface',
      'IFCCOLUMN': 'WallSurface'
    };

    if (directMapping[normalized]) {
      return directMapping[normalized];
    }

    // For IFCSLAB or ambiguous types, detect from geometry orientation
    if (normalized === 'IFCSLAB' || normalized === 'IFCPRODUCT') {
      // Calculate surface normal to determine if horizontal (roof/ground) or vertical (wall)
      const normal = this.calculateNormal(vertices, boundary);
      const verticalComponent = Math.abs(normal[2]); // Z component

      // If mostly horizontal (Z normal > 0.7), it's a roof or ground
      if (verticalComponent > 0.7) {
        // Check if it's at the top (roof) or bottom (ground) by Z coordinate
        const avgZ = boundary.slice(0, -1).reduce((sum, idx) => sum + vertices[idx][2], 0) / (boundary.length - 1);
        return avgZ > 0 ? 'RoofSurface' : 'GroundSurface';
      }
    }

    return 'WallSurface';
  }

  private calculateNormal(vertices: number[][], boundary: number[]): [number, number, number] {
    // Use first 3 vertices to calculate normal
    const v0 = vertices[boundary[0]];
    const v1 = vertices[boundary[1]];
    const v2 = vertices[boundary[2]];

    // Edge vectors
    const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

    // Cross product
    const nx = edge1[1] * edge2[2] - edge1[2] * edge2[1];
    const ny = edge1[2] * edge2[0] - edge1[0] * edge2[2];
    const nz = edge1[0] * edge2[1] - edge1[1] * edge2[0];

    // Normalize
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return length > 0 ? [nx / length, ny / length, nz / length] : [0, 0, 1];
  }

  private triangulatedBoundaries(
    vertexArray: Float32Array,
    indexArray: Uint32Array,
    transform: Matrix4,
    vertices: number[][],
    vertexMap: Map<string, number>
  ): number[][][] {
    const boundaries: number[][][] = [];
    const tempVertex = new Vector3();

    for (let i = 0; i < indexArray.length; i += 3) {
      const ring: number[] = [];

      // Collect the 3 vertices of the triangle
      for (let j = 0; j < 3; j++) {
        const rawIndex = indexArray[i + j];
        const vx = vertexArray[rawIndex * 3];
        const vy = vertexArray[rawIndex * 3 + 1];
        const vz = vertexArray[rawIndex * 3 + 2];

        tempVertex.set(vx, vy, vz).applyMatrix4(transform);
        const vertexIndex = this.registerVertex(tempVertex, vertices, vertexMap);
        ring.push(vertexIndex);
      }

      // ✨ CHECK FOR DEGENERATE TRIANGLES
      if (ring.length === 3) {
        const [v0, v1, v2] = ring;

        // Skip if any vertices are duplicates (degenerate triangle)
        if (v0 === v1 || v1 === v2 || v0 === v2) {
          console.warn(`Skipping degenerate triangle with duplicate vertices: [${v0}, ${v1}, ${v2}]`);
          continue;
        }

        // ✨ CLOSE THE RING (CityJSON expects closed rings)
        // CityJSON format: outer ring should be closed [v0, v1, v2, v0]
        boundaries.push([[v0, v1, v2, v0]]);
      }
    }

    return boundaries;
  }

  private cleanBoundaries(boundaries: number[][][]): number[][][] {
    const seen = new Set<string>();
    const cleaned: number[][][] = [];

    for (const boundary of boundaries) {
      for (const ring of boundary) {
        // Remove consecutive duplicates
        const uniqueRing: number[] = [];
        for (let i = 0; i < ring.length; i++) {
          if (i === 0 || ring[i] !== ring[i - 1]) {
            uniqueRing.push(ring[i]);
          }
        }

        // Check if ring has at least 3 unique vertices (excluding closing vertex)
        const vertices = uniqueRing.length > 0 && uniqueRing[0] === uniqueRing[uniqueRing.length - 1]
          ? uniqueRing.slice(0, -1)
          : uniqueRing;

        const unique = new Set(vertices);
        if (unique.size < 3) {
          continue; // Skip degenerate
        }

        // ✨ CREATE CANONICAL FORM to detect duplicates with opposite winding
        const sorted = [...vertices].sort((a, b) => a - b);
        const canonical = sorted.join(',');

        if (seen.has(canonical)) {
          console.warn(`Skipping duplicate triangle: [${uniqueRing.join(',')}]`);
          continue; // Skip duplicate
        }

        seen.add(canonical);
        cleaned.push([uniqueRing]);
      }
    }

    return cleaned;
  }

  private registerVertex(
    position: Vector3,
    vertices: number[][],
    vertexMap: Map<string, number>,
    precision = 6
  ): number {
    const key = `${position.x.toFixed(precision)}|${position.y.toFixed(
      precision
    )}|${position.z.toFixed(precision)}`;

    const existing = vertexMap.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const stored = [
      parseFloat(position.x.toFixed(precision)),
      parseFloat(position.y.toFixed(precision)),
      parseFloat(position.z.toFixed(precision)),
    ];
    const index = vertices.length;
    vertices.push(stored);
    vertexMap.set(key, index);
    return index;
  }

  private normalizeIfcType(value: unknown): string {
    if (typeof value === 'string' && value.trim().length) {
      return value;
    }
    const unwrapped = this.unwrapIfcValue(value);
    if (typeof unwrapped === 'string' && unwrapped.trim().length) {
      return unwrapped;
    }
    return 'IFCPRODUCT';
  }

  private mapIfcTypeToCityJSON(ifcType: string): string {
    const normalized = ifcType.toUpperCase();
    switch (normalized) {
      case 'IFCBUILDING':
        return 'Building';
      case 'IFCBUILDINGSTOREY':
        return 'BuildingPart';
      case 'IFCSPACE':
        return 'BuildingRoom';
      case 'IFCWALL':
      case 'IFCWALLSTANDARDCASE':
      case 'IFCSLAB':
      case 'IFCCOLUMN':
      case 'IFCBEAM':
      case 'IFCDOOR':
      case 'IFCWINDOW':
      case 'IFCSTAIR':
        return 'BuildingInstallation';
      default:
        return 'GenericCityObject';
    }
  }

  private extractIfcName(ifcLine: any): string | undefined {
    if (!ifcLine) return undefined;

    const candidates = [ifcLine?.Name, ifcLine?.LongName, ifcLine?.ObjectType];
    for (const candidate of candidates) {
      const value = this.unwrapIfcValue(candidate);
      if (typeof value === 'string' && value.trim().length) {
        return value.trim();
      }
    }
    return undefined;
  }

  private unwrapIfcValue(field: any): unknown {
    if (field === null || field === undefined) return undefined;
    if (typeof field === 'object') {
      if ('value' in field) {
        return (field as { value: unknown }).value;
      }
      if (Array.isArray(field)) {
        return field.map((item) => this.unwrapIfcValue(item));
      }
    }
    return field;
  }

  private cloneIfcLine(ifcLine: any): Record<string, unknown> | undefined {
    if (!ifcLine) return undefined;
    try {
      return JSON.parse(JSON.stringify(ifcLine));
    } catch {
      return undefined;
    }
  }
}

// ✨ Updated interfaces
export interface CityJSONSemanticSurface {
  type: string;
  [key: string]: unknown;
}

export interface CityJSONSemantics {
  surfaces: CityJSONSemanticSurface[];
  values: (number | null)[];
}

export interface CityJSONGeometry {
  type: string;
  lod: number;
  boundaries: number[][][];
  semantics?: CityJSONSemantics;
}

export interface CityJSONObject {
  type: string;
  geometry: CityJSONGeometry[];
  attributes?: Record<string, unknown>;
}

export interface CityJSON {
  type: 'CityJSON';
  version: string;
  metadata?: Record<string, unknown>;
  vertices: number[][];
  CityObjects: Record<string, CityJSONObject>;
  transform?: Record<string, unknown>;
  [key: string]: unknown;
}
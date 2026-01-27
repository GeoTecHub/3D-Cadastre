// Path: src/app/services/cityjson.model.ts

/**
 * Defines the structure of the CityJSON 'transform' object.
 */
export interface Transform {
  scale: [number, number, number];
  translate: [number, number, number];
}

/**
 * Defines the main structure of a CityJSON file.
 */
export interface CityJSON {
  type: string;
  version: string;
  vertices: number[][];
  CityObjects: { [key: string]: any };
  transform?: Transform;
}

export interface CityObject {
  type: string;
  attributes?: Record<string, any>;
  geometry?: any[];
}

/**
 * Apartment definition linking rooms to an apartment unit.
 */
export interface Apartment {
  apartment_id: string;
  rooms: string[];
}

/**
 * Payload for saving a CityJSON model to the backend.
 */
export interface CityJSONSavePayload {
  name: string;
  cityjson_data: CityJSON;
}

/**
 * Response from the CityJSON API.
 */
export interface CityJSONRecord {
  id: number;
  name: string;
  cityjson_data: CityJSON;
  created_at?: string;
  updated_at?: string;
}

/**
 * Payload for saving city objects (apartments) to the backend.
 */
export interface CityObjectSavePayload {
  cityjson_record: number;
  apartment_id: string;
  rooms: string[];
}

/**
 * Response from the CityObjects API.
 */
export interface CityObjectRecord {
  id: number;
  cityjson_record: number;
  apartment_id: string;
  rooms: string[];
  created_at?: string;
  updated_at?: string;
}
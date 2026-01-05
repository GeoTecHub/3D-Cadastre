// Path: src/app/services/cityjson.model.ts

/**
 * Defines the structure of the CityJSON 'transform' object.
 */
export interface Transform {
  scale: [number, number, number];      // An array of 3 numbers
  translate: [number, number, number]; // An array of 3 numbers
}

/**
 * Defines the main structure of a CityJSON file.
 */
export interface CityJSON {
  type: string;
  version: string;
  vertices: number[][];
  CityObjects: { [key: string]: any };

  // --- THIS IS THE NEW LINE ---
  // The '?' makes this property optional.
  // The file is still valid even if 'transform' is missing.
  transform?: Transform;
}

export interface CityObject {
  type: string;
  attributes?: Record<string, any>;
  geometry?: any[]; // specific geometry types can be defined later
}
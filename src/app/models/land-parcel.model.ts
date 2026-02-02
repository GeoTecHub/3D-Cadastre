// Path: src/app/models/land-parcel.model.ts
// LADM ISO 19152 compliant Land/Parcel data model

import {
  RightType, RIGHT_TYPE_DISPLAY,
  RestrictionType, RESTRICTION_TYPE_DISPLAY,
  ResponsibilityType, RESPONSIBILITY_TYPE_DISPLAY,
  AccuracyLevel, ACCURACY_LEVEL_DISPLAY,
  SurveyMethod, SURVEY_METHOD_DISPLAY
} from './building-info.model';

import type { RRREntry, RRRInfo } from './building-info.model';

// Re-export shared types for convenience
export {
  RightType, RIGHT_TYPE_DISPLAY,
  RestrictionType, RESTRICTION_TYPE_DISPLAY,
  ResponsibilityType, RESPONSIBILITY_TYPE_DISPLAY,
  AccuracyLevel, ACCURACY_LEVEL_DISPLAY,
  SurveyMethod, SURVEY_METHOD_DISPLAY
};

export type { RRREntry, RRRInfo };

/**
 * Land Use Classification (LADM LA_LandUseClassification)
 */
export enum LandUse {
  RES = 'RES',
  COM = 'COM',
  AGR = 'AGR',
  IND = 'IND',
  MIX = 'MIX',
  REC = 'REC',
  TRN = 'TRN',
  PUB = 'PUB',
  VAC = 'VAC'
}

export const LAND_USE_DISPLAY: Record<LandUse, string> = {
  [LandUse.RES]: 'Residential',
  [LandUse.COM]: 'Commercial',
  [LandUse.AGR]: 'Agricultural',
  [LandUse.IND]: 'Industrial',
  [LandUse.MIX]: 'Mixed Use',
  [LandUse.REC]: 'Recreational / Open Space',
  [LandUse.TRN]: 'Transportation',
  [LandUse.PUB]: 'Public / Institutional',
  [LandUse.VAC]: 'Vacant / Undeveloped'
};

/**
 * Tenure Type (LADM LA_RightType specialization for land)
 */
export enum TenureType {
  FREE = 'FREE',
  LEASE = 'LEASE',
  STATE = 'STATE',
  CUSTOM = 'CUSTOM',
  COMMON = 'COMMON',
  OPEN_ACC = 'OPEN_ACC'
}

export const TENURE_TYPE_DISPLAY: Record<TenureType, string> = {
  [TenureType.FREE]: 'Freehold',
  [TenureType.LEASE]: 'Leasehold',
  [TenureType.STATE]: 'State / Crown Land',
  [TenureType.CUSTOM]: 'Customary Tenure',
  [TenureType.COMMON]: 'Common Property',
  [TenureType.OPEN_ACC]: 'Open Access'
};

/**
 * Parcel Type (LADM LA_SpatialUnitType)
 */
export enum ParcelType {
  LAND = 'LAND',
  BUILDING = 'BUILDING',
  UTILITY = 'UTILITY',
  MINING = 'MINING',
  WATER = 'WATER'
}

export const PARCEL_TYPE_DISPLAY: Record<ParcelType, string> = {
  [ParcelType.LAND]: 'Land Parcel',
  [ParcelType.BUILDING]: 'Building Parcel',
  [ParcelType.UTILITY]: 'Utility Network',
  [ParcelType.MINING]: 'Mining Right',
  [ParcelType.WATER]: 'Water Right'
};

/**
 * Boundary Type (LADM LA_BoundaryType)
 */
export enum BoundaryType {
  FIXED = 'FIXED',
  GENERAL = 'GENERAL',
  NATURAL = 'NATURAL',
  APPROX = 'APPROX'
}

export const BOUNDARY_TYPE_DISPLAY: Record<BoundaryType, string> = {
  [BoundaryType.FIXED]: 'Fixed (Survey)',
  [BoundaryType.GENERAL]: 'General Boundary',
  [BoundaryType.NATURAL]: 'Natural Feature',
  [BoundaryType.APPROX]: 'Approximate'
};

/**
 * Zoning Category
 */
export enum ZoningCategory {
  R1 = 'R1',
  R2 = 'R2',
  C1 = 'C1',
  C2 = 'C2',
  I1 = 'I1',
  I2 = 'I2',
  AG = 'AG',
  OS = 'OS',
  SP = 'SP'
}

export const ZONING_CATEGORY_DISPLAY: Record<ZoningCategory, string> = {
  [ZoningCategory.R1]: 'R1 – Low Density Residential',
  [ZoningCategory.R2]: 'R2 – Medium/High Density Residential',
  [ZoningCategory.C1]: 'C1 – Neighbourhood Commercial',
  [ZoningCategory.C2]: 'C2 – General Commercial',
  [ZoningCategory.I1]: 'I1 – Light Industrial',
  [ZoningCategory.I2]: 'I2 – Heavy Industrial',
  [ZoningCategory.AG]: 'AG – Agricultural',
  [ZoningCategory.OS]: 'OS – Open Space / Recreation',
  [ZoningCategory.SP]: 'SP – Special Purpose'
};

/**
 * Parcel Status
 */
export enum ParcelStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  SUSPENDED = 'SUSPENDED',
  HISTORIC = 'HISTORIC'
}

export const PARCEL_STATUS_DISPLAY: Record<ParcelStatus, string> = {
  [ParcelStatus.ACTIVE]: 'Active',
  [ParcelStatus.PENDING]: 'Pending Registration',
  [ParcelStatus.SUSPENDED]: 'Suspended',
  [ParcelStatus.HISTORIC]: 'Historic / Cancelled'
};

/**
 * Soil Classification
 */
export enum SoilType {
  CLAY = 'CLAY',
  SAND = 'SAND',
  LOAM = 'LOAM',
  SILT = 'SILT',
  ROCK = 'ROCK',
  PEAT = 'PEAT',
  FILL = 'FILL'
}

export const SOIL_TYPE_DISPLAY: Record<SoilType, string> = {
  [SoilType.CLAY]: 'Clay',
  [SoilType.SAND]: 'Sandy',
  [SoilType.LOAM]: 'Loam',
  [SoilType.SILT]: 'Silt',
  [SoilType.ROCK]: 'Rock / Bedrock',
  [SoilType.PEAT]: 'Peat / Organic',
  [SoilType.FILL]: 'Fill / Reclaimed'
};

// ─── INTERFACES ───────────────────────────────────────────

/**
 * Parcel Identification & Administrative (LADM LA_BAUnit)
 */
export interface ParcelIdentification {
  parcelId: string;               // Unique parcel identifier
  cadastralRef: string;           // Cadastral reference / lot number
  parcelType: ParcelType;         // LADM spatial unit type
  parcelStatus: ParcelStatus;     // Registration status
  landUse: LandUse;               // Current land use classification
  tenureType: TenureType;         // Tenure / ownership type
  registrationDate: string;       // ISO 8601
  localAuthority: string;         // Governing municipality / district
}

/**
 * Spatial / Geometric Properties (2D)
 */
export interface ParcelSpatial {
  area: number;                   // Surveyed area in m²
  perimeter: number;              // Perimeter in m
  geometryType: string;           // e.g. 'Polygon', 'MultiPolygon'
  boundaryType: BoundaryType;     // How boundaries were determined
  coordinateCount: number;        // Number of boundary vertices
  crs: string;                    // CRS string e.g. 'EPSG:4326'
  centroidLon: number;            // Centroid longitude
  centroidLat: number;            // Centroid latitude
}

/**
 * Physical & Environmental Attributes
 */
export interface ParcelPhysical {
  elevation: number;              // Average ground elevation (m)
  slope: number;                  // Average slope (degrees)
  soilType: SoilType;             // Soil classification
  floodZone: boolean;             // Is within a flood zone
  vegetationCover: string;        // Description
  accessRoad: boolean;            // Has road access
  utilities: string;              // Available utilities description
}

/**
 * Zoning & Restrictions
 */
export interface ParcelZoning {
  zoningCategory: ZoningCategory;
  maxBuildingHeight: number;      // meters
  maxCoverage: number;            // percentage (0-100)
  maxFAR: number;                 // Floor Area Ratio
  setbackFront: number;           // meters
  setbackRear: number;            // meters
  setbackSide: number;            // meters
  specialOverlay: string;         // Heritage, environmental, etc.
}

/**
 * Tax & Valuation
 */
export interface ParcelValuation {
  landValue: number;              // Assessed land value
  marketValue: number;            // Estimated market value
  annualTax: number;              // Annual property tax
  lastAssessmentDate: string;     // ISO 8601
  taxStatus: 'paid' | 'pending' | 'overdue';
}

/**
 * Relationships (links to buildings, adjacent parcels)
 */
export interface ParcelRelationships {
  buildingIds: string[];          // Buildings sitting on this parcel
  adjacentParcels: string;        // Comma-separated adjacent parcel IDs
  parentParcel: string;           // If subdivided from another
  childParcels: string;           // If this parcel was subdivided
  partOfEstate: string;           // Estate / complex ID
}

/**
 * Metadata & Quality
 */
export interface ParcelMetadata {
  dataQualityId: string;          // UUID
  accuracyLevel: AccuracyLevel;
  surveyMethod: SurveyMethod;
  lastUpdated: string;            // ISO 8601
  responsibleParty: string;       // Surveyor / office
  sourceDocument: string;         // Survey plan reference
}

/**
 * Complete Land Parcel Information (LADM LA_SpatialUnit + LA_BAUnit)
 */
export interface LandParcelInfo {
  identification: ParcelIdentification;
  spatial: ParcelSpatial;
  physical: ParcelPhysical;
  zoning: ParcelZoning;
  rrr: RRRInfo;                   // Shared RRR structure with building
  valuation: ParcelValuation;
  relationships: ParcelRelationships;
  metadata: ParcelMetadata;
}

/**
 * Create a default empty LandParcelInfo
 */
export function createDefaultLandParcel(parcelId?: string): LandParcelInfo {
  const id = parcelId || `P-${Date.now()}`;
  return {
    identification: {
      parcelId: id,
      cadastralRef: '',
      parcelType: ParcelType.LAND,
      parcelStatus: ParcelStatus.PENDING,
      landUse: LandUse.VAC,
      tenureType: TenureType.FREE,
      registrationDate: new Date().toISOString().split('T')[0],
      localAuthority: ''
    },
    spatial: {
      area: 0,
      perimeter: 0,
      geometryType: 'Polygon',
      boundaryType: BoundaryType.GENERAL,
      coordinateCount: 0,
      crs: 'EPSG:4326',
      centroidLon: 0,
      centroidLat: 0
    },
    physical: {
      elevation: 0,
      slope: 0,
      soilType: SoilType.LOAM,
      floodZone: false,
      vegetationCover: '',
      accessRoad: true,
      utilities: ''
    },
    zoning: {
      zoningCategory: ZoningCategory.R1,
      maxBuildingHeight: 0,
      maxCoverage: 0,
      maxFAR: 0,
      setbackFront: 0,
      setbackRear: 0,
      setbackSide: 0,
      specialOverlay: ''
    },
    rrr: {
      entries: [{
        rrrId: `LRRR-${id}`,
        type: RightType.OWN_FREE,
        holder: '',
        share: 100,
        validFrom: new Date().toISOString().split('T')[0],
        validTo: '',
        documentRef: '',
        restrictions: [],
        responsibilities: []
      }]
    },
    valuation: {
      landValue: 0,
      marketValue: 0,
      annualTax: 0,
      lastAssessmentDate: '',
      taxStatus: 'pending'
    },
    relationships: {
      buildingIds: [],
      adjacentParcels: '',
      parentParcel: '',
      childParcels: '',
      partOfEstate: ''
    },
    metadata: {
      dataQualityId: crypto.randomUUID?.() || `DQ-${Date.now()}`,
      accuracyLevel: AccuracyLevel.ACC_TIER2,
      surveyMethod: SurveyMethod.SURVEY_TS,
      lastUpdated: new Date().toISOString(),
      responsibleParty: '',
      sourceDocument: ''
    }
  };
}

// Path: src/app/models/building-info.model.ts

/**
 * Administrative & Legal Enums (Section 2.1.2)
 */
export enum LegalStatus {
  FREEHOLD = 'FREEHOLD',
  LEASEHOLD = 'LEASEHOLD',
  STRATA = 'STRATA',
  STATE = 'STATE'
}

export const LEGAL_STATUS_DISPLAY: Record<LegalStatus, string> = {
  [LegalStatus.FREEHOLD]: 'Freehold',
  [LegalStatus.LEASEHOLD]: 'Leasehold',
  [LegalStatus.STRATA]: 'Strata Title',
  [LegalStatus.STATE]: 'State Land'
};

export enum PrimaryUse {
  RES = 'RES',
  COM = 'COM',
  IND = 'IND',
  MIX = 'MIX',
  PUB = 'PUB'
}

export const PRIMARY_USE_DISPLAY: Record<PrimaryUse, string> = {
  [PrimaryUse.RES]: 'Residential',
  [PrimaryUse.COM]: 'Commercial',
  [PrimaryUse.IND]: 'Industrial',
  [PrimaryUse.MIX]: 'Mixed Use',
  [PrimaryUse.PUB]: 'Public/Institutional'
};

export enum RightType {
  OWN = 'OWN',
  LSE = 'LSE',
  EAS = 'EAS',
  MTG = 'MTG',
  USU = 'USU'
}

export const RIGHT_TYPE_DISPLAY: Record<RightType, string> = {
  [RightType.OWN]: 'Ownership',
  [RightType.LSE]: 'Lease',
  [RightType.EAS]: 'Easement',
  [RightType.MTG]: 'Mortgage',
  [RightType.USU]: 'Usufruct'
};

/**
 * Summary & Administrative Information (Section 2.1.1)
 */
export interface BuildingSummary {
  buildingId: string;       // UUID, Read-Only
  legalStatus: LegalStatus; // Enum, Editable
  address: string;          // Text, Editable, max 255 chars
  primaryUse: PrimaryUse;   // Enum, Editable
  cadastralRef: string;     // Link, Read-Only
  floorCount: number;       // Integer, Read-Only (calculated from 3D model)
  registrationDate: string; // ISO 8601, Editable
}

/**
 * Spatial/Geometric (3D) Information
 */
export interface SpatialInfo {
  footprint: string;
  solidGeometry: string;
  boundedBy: string[];
  heightAboveGround: number;
  volume: number;
  surfaceArea: number;
  coordinateSystem: string;
  lodLevel: string;
}

/**
 * Rights, Restrictions & Responsibilities (RRR)
 */
export interface OwnershipInfo {
  ownerName: string;
  ownershipType: string;
  sharePercentage: number;
  registrationNumber: string;
  registrationDate: string;
}

export interface RestrictionInfo {
  type: string;
  description: string;
  registeredBy: string;
  effectiveDate: string;
  expiryDate?: string;
}

export interface RRRInfo {
  ownership: OwnershipInfo[];
  restrictions: RestrictionInfo[];
}

/**
 * Building Unit / Strata Information
 */
export interface BuildingUnit {
  unitId: string;
  unitType: string;
  floor: number;
  area: number;
  rooms: string[];
  ownerName?: string;
  status: 'occupied' | 'vacant' | 'under_construction';
}

/**
 * Physical Attributes
 */
export interface PhysicalAttributes {
  buildingFunction: string;
  numberOfFloors: number;
  grossFloorArea: number;
  constructionYear: number;
  roofType: string;
  wallMaterial: string;
  foundationType: string;
  energyRating?: string;
}

/**
 * Tax & Valuation Details
 */
export interface TaxValuation {
  assessedValue: number;
  marketValue: number;
  annualTax: number;
  lastAssessmentDate: string;
  taxStatus: 'paid' | 'pending' | 'overdue';
}

/**
 * Relationships & Topology Information
 */
export interface RelationshipsTopology {
  parcelRelation: string;
  adjacentBuildings: string;
  sharedBoundaries: string;
  partOfComplex: string;
}

/**
 * Metadata & Quality Information
 */
export interface MetadataQuality {
  accuracyLevel: string;
  surveyMethod: string;
  lastUpdated: string;
  responsibleParty: string;
}

/**
 * Complete Building Information
 */
export interface BuildingInfo {
  summary: BuildingSummary;
  spatial: SpatialInfo;
  rrr: RRRInfo;
  units: BuildingUnit[];
  physicalAttributes: PhysicalAttributes;
  taxValuation?: TaxValuation;
  relationshipsTopology: RelationshipsTopology;
  metadataQuality: MetadataQuality;
}

/**
 * Extract building info from CityJSON data
 */
export function extractBuildingInfo(cityjson: any, objectId?: string): BuildingInfo | null {
  if (!cityjson || !cityjson.CityObjects) return null;

  const cityObjects = cityjson.CityObjects;
  const keys = Object.keys(cityObjects);

  // Find the building object
  let buildingKey = objectId;
  if (!buildingKey) {
    buildingKey = keys.find(key =>
      cityObjects[key].type === 'Building' ||
      cityObjects[key].type === 'BuildingPart'
    );
  }

  if (!buildingKey) return null;

  const building = cityObjects[buildingKey];
  const attributes = building.attributes || {};

  // Find all building parts/rooms
  const buildingParts = keys.filter(key => {
    const obj = cityObjects[key];
    return obj.parents?.includes(buildingKey) ||
           obj.type === 'BuildingRoom' ||
           obj.type === 'Room';
  });

  // Extract units from rooms
  const units: BuildingUnit[] = buildingParts
    .filter(key => {
      const obj = cityObjects[key];
      return obj.type === 'BuildingRoom' || obj.type === 'Room';
    })
    .map((key, index) => ({
      unitId: key,
      unitType: cityObjects[key].attributes?.usage || 'Room',
      floor: cityObjects[key].attributes?.floor || 0,
      area: cityObjects[key].attributes?.area || 0,
      rooms: [key],
      status: 'occupied' as const
    }));

  // Calculate geometry info
  let volume = 0;
  let surfaceArea = 0;
  if (building.geometry?.length > 0) {
    const geom = building.geometry[0];
    volume = geom.volume || attributes.volume || 0;
    surfaceArea = geom.surfaceArea || attributes.surfaceArea || 0;
  }

  // Resolve legalStatus enum from attribute value
  const resolvedLegalStatus = resolveLegalStatus(attributes.legalStatus);
  // Resolve primaryUse enum from attribute value
  const resolvedPrimaryUse = resolvePrimaryUse(attributes.function || attributes.usage);

  return {
    summary: {
      buildingId: buildingKey,
      legalStatus: resolvedLegalStatus,
      address: attributes.address || attributes.name || 'Not specified',
      primaryUse: resolvedPrimaryUse,
      cadastralRef: attributes.cadastralReference || attributes.cadastralRef || attributes.id || buildingKey,
      floorCount: attributes.storeysAboveGround || attributes.numberOfFloors || attributes.floorCount || 1,
      registrationDate: attributes.registrationDate || new Date().toISOString().split('T')[0]
    },
    spatial: {
      footprint: attributes.footprint || 'Polygon',
      solidGeometry: building.geometry?.[0]?.type || 'Solid',
      boundedBy: building.geometry?.[0]?.semantics?.surfaces?.map((s: any) => s.type) || [],
      heightAboveGround: attributes.measuredHeight || attributes.height || 0,
      volume,
      surfaceArea,
      coordinateSystem: cityjson.metadata?.referenceSystem || 'EPSG:4326',
      lodLevel: building.geometry?.[0]?.lod || 'LoD2'
    },
    rrr: {
      ownership: [{
        ownerName: attributes.ownerName || 'Not specified',
        ownershipType: attributes.ownershipType || 'Freehold',
        sharePercentage: 100,
        registrationNumber: attributes.registrationNumber || 'N/A',
        registrationDate: attributes.registrationDate || 'N/A'
      }],
      restrictions: attributes.restrictions || []
    },
    units,
    physicalAttributes: {
      buildingFunction: attributes.function || 'residential',
      numberOfFloors: attributes.storeysAboveGround || 1,
      grossFloorArea: attributes.grossFloorArea || 0,
      constructionYear: attributes.yearOfConstruction || 0,
      roofType: attributes.roofType || 'flat',
      wallMaterial: attributes.wallMaterial || 'Not specified',
      foundationType: attributes.foundationType || 'Not specified',
      energyRating: attributes.energyRating
    },
    taxValuation: attributes.assessedValue ? {
      assessedValue: attributes.assessedValue || 0,
      marketValue: attributes.marketValue || 0,
      annualTax: attributes.annualTax || 0,
      lastAssessmentDate: attributes.lastAssessmentDate || 'N/A',
      taxStatus: 'paid'
    } : undefined,
    relationshipsTopology: {
      parcelRelation: attributes.parcelRelation || 'Parcel 123',
      adjacentBuildings: attributes.adjacentBuildings || 'Building B-8295-Y, Building B-8293-W',
      sharedBoundaries: attributes.sharedBoundaries || 'Party Wall East',
      partOfComplex: attributes.partOfComplex || 'Complex C-100'
    },
    metadataQuality: {
      accuracyLevel: attributes.accuracyLevel || 'Sub-meter',
      surveyMethod: attributes.surveyMethod || 'LiDAR & GNSS',
      lastUpdated: attributes.lastUpdated || cityjson.metadata?.fileIdentifier?.date || '2023-10-27T10:30:00Z',
      responsibleParty: attributes.responsibleParty || 'City Surveyor Office'
    }
  };
}

/**
 * Resolve a raw legalStatus attribute value to the LegalStatus enum.
 */
function resolveLegalStatus(raw: string | undefined): LegalStatus {
  if (!raw) return LegalStatus.FREEHOLD;
  const upper = raw.toUpperCase().replace(/[\s_-]/g, '');
  if (upper.includes('LEASE')) return LegalStatus.LEASEHOLD;
  if (upper.includes('STRATA')) return LegalStatus.STRATA;
  if (upper.includes('STATE') || upper.includes('CROWN') || upper.includes('GOVERNMENT')) return LegalStatus.STATE;
  if (upper.includes('FREE')) return LegalStatus.FREEHOLD;
  // Try direct enum match
  if (Object.values(LegalStatus).includes(raw as LegalStatus)) return raw as LegalStatus;
  return LegalStatus.FREEHOLD;
}

/**
 * Resolve a raw primaryUse / function attribute value to the PrimaryUse enum.
 */
function resolvePrimaryUse(raw: string | undefined): PrimaryUse {
  if (!raw) return PrimaryUse.RES;
  const upper = raw.toUpperCase().replace(/[\s_-]/g, '');
  if (upper.includes('COMMERCIAL') || upper === 'COM') return PrimaryUse.COM;
  if (upper.includes('INDUSTRIAL') || upper === 'IND') return PrimaryUse.IND;
  if (upper.includes('MIXED') || upper === 'MIX') return PrimaryUse.MIX;
  if (upper.includes('PUBLIC') || upper.includes('INSTITUTIONAL') || upper === 'PUB') return PrimaryUse.PUB;
  if (upper.includes('RESIDENTIAL') || upper === 'RES') return PrimaryUse.RES;
  // Try direct enum match
  if (Object.values(PrimaryUse).includes(raw as PrimaryUse)) return raw as PrimaryUse;
  return PrimaryUse.RES;
}

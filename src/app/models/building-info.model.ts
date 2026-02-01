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
  OWN_FREE = 'OWN_FREE',
  OWN_LSE = 'OWN_LSE',
  OWN_STR = 'OWN_STR',
  OWN_COM = 'OWN_COM',
  BEN_USU = 'BEN_USU',
  BEN_OCC = 'BEN_OCC',
  SEC_MTG = 'SEC_MTG'
}

export const RIGHT_TYPE_DISPLAY: Record<RightType, string> = {
  [RightType.OWN_FREE]: 'Freehold Ownership',
  [RightType.OWN_LSE]: 'Leasehold',
  [RightType.OWN_STR]: 'Strata Title',
  [RightType.OWN_COM]: 'Common Property',
  [RightType.BEN_USU]: 'Usufruct',
  [RightType.BEN_OCC]: 'Right of Occupation',
  [RightType.SEC_MTG]: 'Mortgage'
};

export enum RestrictionType {
  RES_EAS = 'RES_EAS',
  RES_COV = 'RES_COV',
  RES_HGT = 'RES_HGT',
  RES_HER = 'RES_HER',
  RES_ENV = 'RES_ENV'
}

export const RESTRICTION_TYPE_DISPLAY: Record<RestrictionType, string> = {
  [RestrictionType.RES_EAS]: 'Easement',
  [RestrictionType.RES_COV]: 'Restrictive Covenant',
  [RestrictionType.RES_HGT]: 'Height Restriction',
  [RestrictionType.RES_HER]: 'Heritage Status',
  [RestrictionType.RES_ENV]: 'Environmental'
};

export enum ResponsibilityType {
  RSP_MAINT = 'RSP_MAINT',
  RSP_TAX = 'RSP_TAX',
  RSP_INS = 'RSP_INS'
}

export const RESPONSIBILITY_TYPE_DISPLAY: Record<ResponsibilityType, string> = {
  [ResponsibilityType.RSP_MAINT]: 'Maintenance',
  [ResponsibilityType.RSP_TAX]: 'Tax Liability',
  [ResponsibilityType.RSP_INS]: 'Insurance'
};

/**
 * Building Unit / Strata Enums (Section 2.3.2)
 */
export enum UnitType {
  APT = 'APT',
  OFF = 'OFF',
  RET = 'RET',
  COM = 'COM',
  UTL = 'UTL'
}

export const UNIT_TYPE_DISPLAY: Record<UnitType, string> = {
  [UnitType.APT]: 'Apartment',
  [UnitType.OFF]: 'Office',
  [UnitType.RET]: 'Retail',
  [UnitType.COM]: 'Common Area',
  [UnitType.UTL]: 'Utility'
};

export enum AccessType {
  PVT = 'PVT',
  COR = 'COR',
  ELV = 'ELV'
}

export const ACCESS_TYPE_DISPLAY: Record<AccessType, string> = {
  [AccessType.PVT]: 'Private Entrance',
  [AccessType.COR]: 'Shared Corridor',
  [AccessType.ELV]: 'Elevator Lobby'
};

export enum LodLevel {
  LOD1 = 'LOD1',
  LOD2 = 'LOD2',
  LOD3 = 'LOD3',
  LOD4 = 'LOD4'
}

export const LOD_LEVEL_DISPLAY: Record<LodLevel, string> = {
  [LodLevel.LOD1]: 'LoD1 (Block)',
  [LodLevel.LOD2]: 'LoD2 (Roof)',
  [LodLevel.LOD3]: 'LoD3 (Detailed)',
  [LodLevel.LOD4]: 'LoD4 (Interior)'
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
 * Data Dictionary Section 2.1.3
 */

/** A restriction attached to a specific RRR entry */
export interface RRRRestriction {
  type: RestrictionType;
  description: string;
}

/** A responsibility attached to a specific RRR entry */
export interface RRRResponsibility {
  type: ResponsibilityType;
  description: string;
}

/** One RRR record (right/tenure entry) */
export interface RRREntry {
  rrrId: string;                    // UUID, Editable
  type: RightType;                  // Enum, Editable dropdown
  holder: string;                   // Person/Org ID, Editable
  share: number;                    // Float 0-100, Editable
  validFrom: string;                // ISO 8601, Editable
  validTo: string;                  // ISO 8601 or '' for indefinite, Editable
  documentRef: string;              // File path/link, Editable
  restrictions: RRRRestriction[];   // Linked restrictions for this holder
  responsibilities: RRRResponsibility[]; // Linked responsibilities for this holder
}

export interface RRRInfo {
  entries: RRREntry[];
}

/**
 * Unit-level Tax & Valuation
 */
export interface UnitTaxValuation {
  taxUnitArea: number;
  assessedValue: number;
  lastValuationDate: string;
  taxDue: number;
}

/**
 * Building Unit / Strata Information (Section 2.3.1)
 */
export interface BuildingUnit {
  unitId: string;              // Editable, unique ID
  parentBuilding: string;      // System-Set, FK to BuildingID
  floorNumber: number;         // Editable, logical floor number
  unitType: UnitType;          // Enum, Editable
  boundary: string;            // Read-Only, 3D geometry description
  accessType: AccessType;      // Enum, Editable
  cadastralRef: string;        // Editable
  floorArea: number;           // Editable (m²)
  registrationDate: string;    // ISO 8601, Editable
  primaryUse: PrimaryUse;      // Enum, Editable
  tax: UnitTaxValuation;       // Tax & Valuation for this unit
  rrr: RRRInfo;                // Rights, Restrictions & Responsibilities for this unit
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
    .map((key) => {
      const attrs = cityObjects[key].attributes || {};
      return {
        unitId: key,
        parentBuilding: buildingKey!,
        floorNumber: attrs.floor || attrs.floorNumber || 0,
        unitType: resolveUnitType(attrs.usage || attrs.unitType),
        boundary: cityObjects[key].geometry?.[0]?.type || 'Solid',
        accessType: resolveAccessType(attrs.accessType),
        cadastralRef: attrs.cadastralRef || '',
        floorArea: attrs.area || attrs.floorArea || 0,
        registrationDate: attrs.registrationDate || new Date().toISOString().split('T')[0],
        primaryUse: resolvePrimaryUse(attrs.primaryUse || attrs.usage),
        tax: {
          taxUnitArea: attrs.taxUnitArea || attrs.area || 0,
          assessedValue: attrs.assessedValue || 0,
          lastValuationDate: attrs.lastValuationDate || '',
          taxDue: attrs.taxDue || 0
        },
        rrr: {
          entries: [{
            rrrId: `URRR-${key}`,
            type: RightType.OWN_STR,
            holder: attrs.ownerName || '',
            share: 100,
            validFrom: attrs.registrationDate || '2023-01-01',
            validTo: '',
            documentRef: '',
            restrictions: [],
            responsibilities: []
          }]
        }
      };
    });

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
      entries: [{
        rrrId: attributes.registrationNumber || crypto.randomUUID?.() || `RRR-${Date.now()}`,
        type: RightType.OWN_FREE,
        holder: attributes.ownerName || 'Jane Doe',
        share: 100,
        validFrom: attributes.registrationDate || '2023-01-01',
        validTo: '',
        documentRef: attributes.documentRef || '',
        restrictions: [
          { type: RestrictionType.RES_HGT, description: 'Max 40m building height' }
        ],
        responsibilities: [
          { type: ResponsibilityType.RSP_TAX, description: 'Annual property tax' },
          { type: ResponsibilityType.RSP_INS, description: 'Building insurance required' }
        ]
      }]
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

/**
 * Resolve raw unitType to UnitType enum.
 */
function resolveUnitType(raw: string | undefined): UnitType {
  if (!raw) return UnitType.APT;
  const upper = raw.toUpperCase().replace(/[\s_-]/g, '');
  if (upper.includes('OFFICE') || upper === 'OFF') return UnitType.OFF;
  if (upper.includes('RETAIL') || upper === 'RET') return UnitType.RET;
  if (upper.includes('COMMON') || upper === 'COM') return UnitType.COM;
  if (upper.includes('UTIL') || upper === 'UTL') return UnitType.UTL;
  if (Object.values(UnitType).includes(raw as UnitType)) return raw as UnitType;
  return UnitType.APT;
}

/**
 * Resolve raw accessType to AccessType enum.
 */
function resolveAccessType(raw: string | undefined): AccessType {
  if (!raw) return AccessType.COR;
  const upper = raw.toUpperCase().replace(/[\s_-]/g, '');
  if (upper.includes('PRIVATE') || upper === 'PVT') return AccessType.PVT;
  if (upper.includes('ELEVATOR') || upper.includes('LIFT') || upper === 'ELV') return AccessType.ELV;
  if (Object.values(AccessType).includes(raw as AccessType)) return raw as AccessType;
  return AccessType.COR;
}

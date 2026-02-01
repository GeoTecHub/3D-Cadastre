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

/**
 * Spatial/Geometric Enums (Section 2.4)
 */
export enum LodLevel {
  LOD0 = 'LOD0',
  LOD1 = 'LOD1',
  LOD2 = 'LOD2',
  LOD3 = 'LOD3',
  LOD4 = 'LOD4'
}

export const LOD_LEVEL_DISPLAY: Record<LodLevel, string> = {
  [LodLevel.LOD0]: 'LoD0 (Footprint)',
  [LodLevel.LOD1]: 'LoD1 (Block)',
  [LodLevel.LOD2]: 'LoD2 (Roof)',
  [LodLevel.LOD3]: 'LoD3 (Architectural)',
  [LodLevel.LOD4]: 'LoD4 (Interior)'
};

export enum ElevationRef {
  MSL = 'MSL',
  ELLIP = 'ELLIP',
  LAT = 'LAT',
  GROUND = 'GROUND'
}

export const ELEVATION_REF_DISPLAY: Record<ElevationRef, string> = {
  [ElevationRef.MSL]: 'Mean Sea Level',
  [ElevationRef.ELLIP]: 'Ellipsoidal',
  [ElevationRef.LAT]: 'Lowest Astro. Tide',
  [ElevationRef.GROUND]: 'Relative to Ground'
};

export enum CRS {
  EPSG_3857 = 'EPSG_3857',
  EPSG_4326 = 'EPSG_4326',
  EPSG_XXXX = 'EPSG_XXXX'
}

export const CRS_DISPLAY: Record<CRS, string> = {
  [CRS.EPSG_3857]: 'WGS 84 / Pseudo-Mercator',
  [CRS.EPSG_4326]: 'WGS 84 (Lat/Lon)',
  [CRS.EPSG_XXXX]: '[Local Grid]'
};

/**
 * Physical & Technical Enums (Section 2.5.2)
 */
export enum StructureType {
  CONC_REINF = 'CONC_REINF',
  STEEL_FRM = 'STEEL_FRM',
  MASONRY = 'MASONRY',
  TIMBER = 'TIMBER',
  COMPOSITE = 'COMPOSITE'
}

export const STRUCTURE_TYPE_DISPLAY: Record<StructureType, string> = {
  [StructureType.CONC_REINF]: 'Reinforced Concrete',
  [StructureType.STEEL_FRM]: 'Steel Frame',
  [StructureType.MASONRY]: 'Masonry / Brick',
  [StructureType.TIMBER]: 'Timber Frame',
  [StructureType.COMPOSITE]: 'Composite'
};

export enum Condition {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  DILAPID = 'DILAPID'
}

export const CONDITION_DISPLAY: Record<Condition, string> = {
  [Condition.EXCELLENT]: 'Excellent',
  [Condition.GOOD]: 'Good',
  [Condition.FAIR]: 'Fair',
  [Condition.POOR]: 'Poor',
  [Condition.DILAPID]: 'Dilapidated'
};

export enum RoofType {
  FLAT = 'FLAT',
  GABLE = 'GABLE',
  HIP = 'HIP',
  DOME = 'DOME',
  MANSARD = 'MANSARD'
}

export const ROOF_TYPE_DISPLAY: Record<RoofType, string> = {
  [RoofType.FLAT]: 'Flat Roof',
  [RoofType.GABLE]: 'Gable',
  [RoofType.HIP]: 'Hip',
  [RoofType.DOME]: 'Dome',
  [RoofType.MANSARD]: 'Mansard'
};

/**
 * Relationships & Topology Enums
 */
export enum TopologyStatus {
  VALID = 'VALID',
  WARN_OVER = 'WARN_OVER',
  WARN_GAP = 'WARN_GAP'
}

export const TOPOLOGY_STATUS_DISPLAY: Record<TopologyStatus, string> = {
  [TopologyStatus.VALID]: 'Valid',
  [TopologyStatus.WARN_OVER]: 'Overlap Warning',
  [TopologyStatus.WARN_GAP]: 'Gap Warning'
};

/**
 * Metadata & Quality Enums (Section 2.6.2)
 */
export enum AccuracyLevel {
  ACC_TIER1 = 'ACC_TIER1',
  ACC_TIER2 = 'ACC_TIER2',
  ACC_TIER3 = 'ACC_TIER3',
  ACC_UNK = 'ACC_UNK'
}

export const ACCURACY_LEVEL_DISPLAY: Record<AccuracyLevel, string> = {
  [AccuracyLevel.ACC_TIER1]: 'Tier 1: Survey Grade (< 5cm)',
  [AccuracyLevel.ACC_TIER2]: 'Tier 2: Mapping Grade (< 50cm)',
  [AccuracyLevel.ACC_TIER3]: 'Tier 3: Sketch/Approx (> 1m)',
  [AccuracyLevel.ACC_UNK]: 'Unknown'
};

export enum SurveyMethod {
  LIDAR_ALS = 'LIDAR_ALS',
  LIDAR_TLS = 'LIDAR_TLS',
  PHOTO_UAV = 'PHOTO_UAV',
  SURVEY_TS = 'SURVEY_TS',
  DIGIT_2D = 'DIGIT_2D',
  BIM_IFC = 'BIM_IFC',
  MANUAL = 'MANUAL'
}

export const SURVEY_METHOD_DISPLAY: Record<SurveyMethod, string> = {
  [SurveyMethod.LIDAR_ALS]: 'Airborne LiDAR',
  [SurveyMethod.LIDAR_TLS]: 'Terrestrial LiDAR',
  [SurveyMethod.PHOTO_UAV]: 'UAV Photogrammetry',
  [SurveyMethod.SURVEY_TS]: 'Total Station / GNSS',
  [SurveyMethod.DIGIT_2D]: 'Extruded 2D Plans',
  [SurveyMethod.BIM_IFC]: 'BIM Import (IFC)',
  [SurveyMethod.MANUAL]: 'Manual Modeling'
};

/**
 * Summary & Administrative Information (Section 2.1.1)
 */
export interface BuildingSummary {
  buildingId: string;
  legalStatus: LegalStatus;
  address: string;
  primaryUse: PrimaryUse;
  cadastralRef: string;
  floorCount: number;
  registrationDate: string;
}

/**
 * Spatial/Geometric (3D) Information (Section 2.4.1)
 */
export interface SpatialInfo {
  footprint: string;          // Read-Only, 2D polygon from CityJSON
  solidGeometry: string;      // Read-Only, 3D representation
  lodLevel: LodLevel;         // Read-Only, detected from import
  height: number;             // Read-Only, max height from vertices
  crs: CRS;                   // System-Set, detected from import
  elevationRef: ElevationRef; // Editable, vertical datum
}

/**
 * Rights, Restrictions & Responsibilities (RRR)
 */
export interface RRRRestriction {
  type: RestrictionType;
  description: string;
}

export interface RRRResponsibility {
  type: ResponsibilityType;
  description: string;
}

export interface RRREntry {
  rrrId: string;
  type: RightType;
  holder: string;
  share: number;
  validFrom: string;
  validTo: string;
  documentRef: string;
  restrictions: RRRRestriction[];
  responsibilities: RRRResponsibility[];
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
  unitId: string;
  parentBuilding: string;
  floorNumber: number;
  unitType: UnitType;
  boundary: string;
  accessType: AccessType;
  cadastralRef: string;
  floorArea: number;
  registrationDate: string;
  primaryUse: PrimaryUse;
  tax: UnitTaxValuation;
  rrr: RRRInfo;
}

/**
 * Physical Attributes (Section 2.5.1)
 */
export interface PhysicalAttributes {
  constructionYear: number;     // Editable
  structureType: StructureType; // Enum, Editable
  condition: Condition;         // Enum, Editable
  roofType: RoofType;           // Enum, Editable
  grossArea: number;            // System-Calculated (sum of unit areas)
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
 * Relationships & Topology Information (Section 2.6.1)
 */
export interface RelationshipsTopology {
  parcelRelation: string;         // Editable, list of UUIDs
  adjacentBuildings: string;      // System-Calculated
  sharedWall: boolean;            // Editable, default false
  topologyStatus: TopologyStatus; // System-Calculated enum
  overlapVolume: number;          // Read-Only, shown if warning
  partOfComplex: string;          // Editable, UUID
}

/**
 * Metadata & Quality Information (Section 2.6.1)
 */
export interface MetadataQuality {
  dataQualityID: string;          // Read-Only UUID
  accuracyLevel: AccuracyLevel;   // Enum, Editable
  surveyMethod: SurveyMethod;     // Enum, Editable
  lastUpdated: string;            // System-Set ISO 8601
  responsibleParty: string;       // System-Set
  sourceFile: string;             // Read-Only, original filename
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

  // Calculate gross area from units
  const grossArea = units.reduce((sum, u) => sum + u.floorArea, 0);

  const resolvedLegalStatus = resolveLegalStatus(attributes.legalStatus);
  const resolvedPrimaryUse = resolvePrimaryUse(attributes.function || attributes.usage);

  // Resolve CRS
  const rawCrs = cityjson.metadata?.referenceSystem || '';
  let crs = CRS.EPSG_4326;
  if (rawCrs.includes('3857')) crs = CRS.EPSG_3857;
  else if (rawCrs.includes('4326')) crs = CRS.EPSG_4326;
  else if (rawCrs) crs = CRS.EPSG_XXXX;

  // Resolve LoD
  const rawLod = building.geometry?.[0]?.lod || '2';
  let lodLevel = LodLevel.LOD2;
  if (rawLod === '0' || rawLod === 'LoD0') lodLevel = LodLevel.LOD0;
  else if (rawLod === '1' || rawLod === 'LoD1') lodLevel = LodLevel.LOD1;
  else if (rawLod === '3' || rawLod === 'LoD3') lodLevel = LodLevel.LOD3;
  else if (rawLod === '4' || rawLod === 'LoD4') lodLevel = LodLevel.LOD4;

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
      solidGeometry: building.geometry?.[0]?.type || 'MultiSolid',
      lodLevel,
      height: attributes.measuredHeight || attributes.height || 0,
      crs,
      elevationRef: ElevationRef.MSL
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
      constructionYear: attributes.yearOfConstruction || 0,
      structureType: StructureType.CONC_REINF,
      condition: Condition.GOOD,
      roofType: RoofType.FLAT,
      grossArea
    },
    taxValuation: attributes.assessedValue ? {
      assessedValue: attributes.assessedValue || 0,
      marketValue: attributes.marketValue || 0,
      annualTax: attributes.annualTax || 0,
      lastAssessmentDate: attributes.lastAssessmentDate || 'N/A',
      taxStatus: 'paid'
    } : undefined,
    relationshipsTopology: {
      parcelRelation: attributes.parcelRelation || '',
      adjacentBuildings: attributes.adjacentBuildings || '',
      sharedWall: attributes.sharedWall || false,
      topologyStatus: TopologyStatus.VALID,
      overlapVolume: attributes.overlapVolume || 0,
      partOfComplex: attributes.partOfComplex || ''
    },
    metadataQuality: {
      dataQualityID: crypto.randomUUID?.() || `DQ-${Date.now()}`,
      accuracyLevel: AccuracyLevel.ACC_TIER2,
      surveyMethod: SurveyMethod.LIDAR_ALS,
      lastUpdated: attributes.lastUpdated || cityjson.metadata?.fileIdentifier?.date || new Date().toISOString(),
      responsibleParty: attributes.responsibleParty || 'City Surveyor Office',
      sourceFile: cityjson.metadata?.fileIdentifier?.name || ''
    }
  };
}

function resolveLegalStatus(raw: string | undefined): LegalStatus {
  if (!raw) return LegalStatus.FREEHOLD;
  const upper = raw.toUpperCase().replace(/[\s_-]/g, '');
  if (upper.includes('LEASE')) return LegalStatus.LEASEHOLD;
  if (upper.includes('STRATA')) return LegalStatus.STRATA;
  if (upper.includes('STATE') || upper.includes('CROWN') || upper.includes('GOVERNMENT')) return LegalStatus.STATE;
  if (upper.includes('FREE')) return LegalStatus.FREEHOLD;
  if (Object.values(LegalStatus).includes(raw as LegalStatus)) return raw as LegalStatus;
  return LegalStatus.FREEHOLD;
}

function resolvePrimaryUse(raw: string | undefined): PrimaryUse {
  if (!raw) return PrimaryUse.RES;
  const upper = raw.toUpperCase().replace(/[\s_-]/g, '');
  if (upper.includes('COMMERCIAL') || upper === 'COM') return PrimaryUse.COM;
  if (upper.includes('INDUSTRIAL') || upper === 'IND') return PrimaryUse.IND;
  if (upper.includes('MIXED') || upper === 'MIX') return PrimaryUse.MIX;
  if (upper.includes('PUBLIC') || upper.includes('INSTITUTIONAL') || upper === 'PUB') return PrimaryUse.PUB;
  if (upper.includes('RESIDENTIAL') || upper === 'RES') return PrimaryUse.RES;
  if (Object.values(PrimaryUse).includes(raw as PrimaryUse)) return raw as PrimaryUse;
  return PrimaryUse.RES;
}

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

function resolveAccessType(raw: string | undefined): AccessType {
  if (!raw) return AccessType.COR;
  const upper = raw.toUpperCase().replace(/[\s_-]/g, '');
  if (upper.includes('PRIVATE') || upper === 'PVT') return AccessType.PVT;
  if (upper.includes('ELEVATOR') || upper.includes('LIFT') || upper === 'ELV') return AccessType.ELV;
  if (Object.values(AccessType).includes(raw as AccessType)) return raw as AccessType;
  return AccessType.COR;
}

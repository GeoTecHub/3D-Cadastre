// Path: src/app/components/building-info-panel/building-info-panel.ts

import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BuildingInfo,
  BuildingSummary,
  BuildingUnit,
  UnitTaxValuation,
  RRREntry,
  RRRInfo,
  RRRRestriction,
  RRRResponsibility,
  SpatialInfo,
  PhysicalAttributes,
  RelationshipsTopology,
  MetadataQuality,
  LegalStatus,
  PrimaryUse,
  RightType,
  RestrictionType,
  ResponsibilityType,
  UnitType,
  AccessType,
  LodLevel,
  ElevationRef,
  CRS,
  StructureType,
  Condition,
  RoofType,
  TopologyStatus,
  AccuracyLevel,
  SurveyMethod,
  LEGAL_STATUS_DISPLAY,
  PRIMARY_USE_DISPLAY,
  RIGHT_TYPE_DISPLAY,
  RESTRICTION_TYPE_DISPLAY,
  RESPONSIBILITY_TYPE_DISPLAY,
  UNIT_TYPE_DISPLAY,
  ACCESS_TYPE_DISPLAY,
  LOD_LEVEL_DISPLAY,
  ELEVATION_REF_DISPLAY,
  CRS_DISPLAY,
  STRUCTURE_TYPE_DISPLAY,
  CONDITION_DISPLAY,
  ROOF_TYPE_DISPLAY,
  TOPOLOGY_STATUS_DISPLAY,
  ACCURACY_LEVEL_DISPLAY,
  SURVEY_METHOD_DISPLAY
} from '../../models/building-info.model';

type RRRTab = 'overview' | 'ownership';
type CollapsibleSection = 'summary' | 'spatial' | 'rrr' | 'units' | 'physical' | 'relationships' | 'metadata';

@Component({
  selector: 'app-building-info-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './building-info-panel.html',
  styleUrls: ['./building-info-panel.css']
})
export class BuildingInfoPanel {
  // Inputs
  buildingInfo = input<BuildingInfo | null>(null);
  selectedUnitId = input<string | null>(null);

  // Outputs
  unitSelected = output<string>();
  explodeViewRequested = output<void>();
  summaryChanged = output<BuildingSummary>();
  rrrChanged = output<RRRInfo>();
  unitsChanged = output<BuildingUnit[]>();
  spatialChanged = output<SpatialInfo>();
  physicalChanged = output<PhysicalAttributes>();
  relationshipsChanged = output<RelationshipsTopology>();
  metadataChanged = output<MetadataQuality>();

  // Enum option lists for dropdown selects
  readonly legalStatusOptions = Object.values(LegalStatus);
  readonly primaryUseOptions = Object.values(PrimaryUse);
  readonly rightTypeOptions = Object.values(RightType);
  readonly restrictionTypeOptions = Object.values(RestrictionType);
  readonly responsibilityTypeOptions = Object.values(ResponsibilityType);
  readonly unitTypeOptions = Object.values(UnitType);
  readonly accessTypeOptions = Object.values(AccessType);
  readonly elevationRefOptions = Object.values(ElevationRef);
  readonly structureTypeOptions = Object.values(StructureType);
  readonly conditionOptions = Object.values(Condition);
  readonly roofTypeOptions = Object.values(RoofType);
  readonly accuracyLevelOptions = Object.values(AccuracyLevel);
  readonly surveyMethodOptions = Object.values(SurveyMethod);

  readonly legalStatusDisplayMap = LEGAL_STATUS_DISPLAY;
  readonly primaryUseDisplayMap = PRIMARY_USE_DISPLAY;
  readonly rightTypeDisplayMap = RIGHT_TYPE_DISPLAY;
  readonly restrictionTypeDisplayMap = RESTRICTION_TYPE_DISPLAY;
  readonly responsibilityTypeDisplayMap = RESPONSIBILITY_TYPE_DISPLAY;
  readonly unitTypeDisplayMap = UNIT_TYPE_DISPLAY;
  readonly accessTypeDisplayMap = ACCESS_TYPE_DISPLAY;
  readonly lodLevelDisplayMap = LOD_LEVEL_DISPLAY;
  readonly elevationRefDisplayMap = ELEVATION_REF_DISPLAY;
  readonly crsDisplayMap = CRS_DISPLAY;
  readonly structureTypeDisplayMap = STRUCTURE_TYPE_DISPLAY;
  readonly conditionDisplayMap = CONDITION_DISPLAY;
  readonly roofTypeDisplayMap = ROOF_TYPE_DISPLAY;
  readonly topologyStatusDisplayMap = TOPOLOGY_STATUS_DISPLAY;
  readonly accuracyLevelDisplayMap = ACCURACY_LEVEL_DISPLAY;
  readonly surveyMethodDisplayMap = SURVEY_METHOD_DISPLAY;

  // Local state
  expandedSections = signal<Set<CollapsibleSection>>(new Set(['summary', 'units']));
  activeRRRTab = signal<RRRTab>('ownership');
  selectedUnit = signal<BuildingUnit | null>(null);
  expandedRRRId = signal<string | null>(null);
  expandedUnitId = signal<string | null>(null);
  expandedUnitRRRId = signal<string | null>(null);

  // Computed values
  hasBuilding = computed(() => this.buildingInfo() !== null);

  toggleSection(section: CollapsibleSection): void {
    const current = this.expandedSections();
    const newSet = new Set(current);
    if (newSet.has(section)) {
      newSet.delete(section);
    } else {
      newSet.add(section);
    }
    this.expandedSections.set(newSet);
  }

  isSectionExpanded(section: CollapsibleSection): boolean {
    return this.expandedSections().has(section);
  }

  setRRRTab(tab: RRRTab): void {
    this.activeRRRTab.set(tab);
  }

  selectUnit(unit: BuildingUnit): void {
    this.selectedUnit.set(unit);
    this.unitSelected.emit(unit.unitId);
  }

  onExplodeView(): void {
    this.explodeViewRequested.emit();
  }

  formatNumber(value: number | undefined): string {
    if (value === undefined || value === null) return 'N/A';
    return value.toLocaleString();
  }

  formatArea(value: number | undefined): string {
    if (value === undefined || value === null || value === 0) return 'N/A';
    return `${value.toLocaleString()} m²`;
  }

  formatVolume(value: number | undefined): string {
    if (value === undefined || value === null || value === 0) return 'N/A';
    return `${value.toLocaleString()} m³`;
  }

  formatHeight(value: number | undefined): string {
    if (value === undefined || value === null || value === 0) return 'N/A';
    return `${value.toLocaleString()} m`;
  }

  formatCurrency(value: number | undefined): string {
    if (value === undefined || value === null || value === 0) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'occupied': return 'status-occupied';
      case 'vacant': return 'status-vacant';
      case 'under_construction': return 'status-construction';
      default: return '';
    }
  }

  getLegalStatusDisplay(code: LegalStatus | undefined): string {
    if (!code) return 'N/A';
    return LEGAL_STATUS_DISPLAY[code] || code;
  }

  getPrimaryUseDisplay(code: PrimaryUse | undefined): string {
    if (!code) return 'N/A';
    return PRIMARY_USE_DISPLAY[code] || code;
  }

  // ─── Summary field editing ────────────────────────────────

  onSummaryFieldChange(field: keyof BuildingSummary, value: string | number): void {
    const info = this.buildingInfo();
    if (!info) return;
    const updated: BuildingSummary = { ...info.summary, [field]: value };
    this.summaryChanged.emit(updated);
  }

  // ─── RRR editing ──────────────────────────────────────────

  toggleRRRExpand(rrrId: string): void {
    this.expandedRRRId.set(this.expandedRRRId() === rrrId ? null : rrrId);
  }

  private emitRRRUpdate(entries: RRREntry[]): void {
    this.rrrChanged.emit({ entries });
  }

  private cloneEntries(): RRREntry[] {
    const info = this.buildingInfo();
    if (!info) return [];
    return info.rrr.entries.map(e => ({
      ...e,
      restrictions: [...e.restrictions.map(r => ({ ...r }))],
      responsibilities: [...e.responsibilities.map(r => ({ ...r }))]
    }));
  }

  onRRRFieldChange(index: number, field: keyof RRREntry, value: any): void {
    const entries = this.cloneEntries();
    if (!entries[index]) return;
    (entries[index] as any)[field] = value;
    this.emitRRRUpdate(entries);
  }

  addRRREntry(): void {
    const entries = this.cloneEntries();
    entries.push({
      rrrId: `RRR-${Date.now().toString(36).toUpperCase()}`,
      type: RightType.OWN_FREE,
      holder: '',
      share: 0,
      validFrom: new Date().toISOString().split('T')[0],
      validTo: '',
      documentRef: '',
      restrictions: [],
      responsibilities: []
    });
    this.emitRRRUpdate(entries);
  }

  removeRRREntry(index: number): void {
    const entries = this.cloneEntries();
    if (!entries[index]) return;
    entries.splice(index, 1);
    this.emitRRRUpdate(entries);
  }

  // ─── Standalone Restrictions (across all entries) ─────────

  /** Flat list of all restrictions across all RRR entries, with their parent entry index */
  getAllRestrictions(): { entryIndex: number; restrictionIndex: number; holder: string; restriction: RRRRestriction }[] {
    const info = this.buildingInfo();
    if (!info) return [];
    const result: { entryIndex: number; restrictionIndex: number; holder: string; restriction: RRRRestriction }[] = [];
    info.rrr.entries.forEach((entry, ei) => {
      entry.restrictions.forEach((r, ri) => {
        result.push({ entryIndex: ei, restrictionIndex: ri, holder: entry.holder, restriction: r });
      });
    });
    return result;
  }

  addStandaloneRestriction(): void {
    const entries = this.cloneEntries();
    if (entries.length === 0) return;
    // Add to the first entry by default
    entries[0].restrictions.push({ type: RestrictionType.RES_EAS, description: '' });
    this.emitRRRUpdate(entries);
  }

  // ─── Standalone Responsibilities (across all entries) ─────

  getAllResponsibilities(): { entryIndex: number; responsibilityIndex: number; holder: string; responsibility: RRRResponsibility }[] {
    const info = this.buildingInfo();
    if (!info) return [];
    const result: { entryIndex: number; responsibilityIndex: number; holder: string; responsibility: RRRResponsibility }[] = [];
    info.rrr.entries.forEach((entry, ei) => {
      entry.responsibilities.forEach((r, ri) => {
        result.push({ entryIndex: ei, responsibilityIndex: ri, holder: entry.holder, responsibility: r });
      });
    });
    return result;
  }

  addStandaloneResponsibility(): void {
    const entries = this.cloneEntries();
    if (entries.length === 0) return;
    entries[0].responsibilities.push({ type: ResponsibilityType.RSP_MAINT, description: '' });
    this.emitRRRUpdate(entries);
  }

  // Restrictions
  addRestriction(entryIndex: number): void {
    const entries = this.cloneEntries();
    if (!entries[entryIndex]) return;
    entries[entryIndex].restrictions.push({
      type: RestrictionType.RES_EAS,
      description: ''
    });
    this.emitRRRUpdate(entries);
  }

  removeRestriction(entryIndex: number, restrictionIndex: number): void {
    const entries = this.cloneEntries();
    if (!entries[entryIndex]) return;
    entries[entryIndex].restrictions.splice(restrictionIndex, 1);
    this.emitRRRUpdate(entries);
  }

  onRestrictionChange(entryIndex: number, restrictionIndex: number, field: keyof RRRRestriction, value: any): void {
    const entries = this.cloneEntries();
    if (!entries[entryIndex]?.restrictions[restrictionIndex]) return;
    (entries[entryIndex].restrictions[restrictionIndex] as any)[field] = value;
    this.emitRRRUpdate(entries);
  }

  // Responsibilities
  addResponsibility(entryIndex: number): void {
    const entries = this.cloneEntries();
    if (!entries[entryIndex]) return;
    entries[entryIndex].responsibilities.push({
      type: ResponsibilityType.RSP_MAINT,
      description: ''
    });
    this.emitRRRUpdate(entries);
  }

  removeResponsibility(entryIndex: number, responsibilityIndex: number): void {
    const entries = this.cloneEntries();
    if (!entries[entryIndex]) return;
    entries[entryIndex].responsibilities.splice(responsibilityIndex, 1);
    this.emitRRRUpdate(entries);
  }

  onResponsibilityChange(entryIndex: number, responsibilityIndex: number, field: keyof RRRResponsibility, value: any): void {
    const entries = this.cloneEntries();
    if (!entries[entryIndex]?.responsibilities[responsibilityIndex]) return;
    (entries[entryIndex].responsibilities[responsibilityIndex] as any)[field] = value;
    this.emitRRRUpdate(entries);
  }

  // ─── Unit Editing ──────────────────────────────────────────

  toggleUnitExpand(unitId: string): void {
    this.expandedUnitId.set(this.expandedUnitId() === unitId ? null : unitId);
    this.expandedUnitRRRId.set(null);
  }

  toggleUnitRRRExpand(rrrId: string): void {
    this.expandedUnitRRRId.set(this.expandedUnitRRRId() === rrrId ? null : rrrId);
  }

  private cloneUnits(): BuildingUnit[] {
    const info = this.buildingInfo();
    if (!info) return [];
    return info.units.map(u => ({
      ...u,
      tax: { ...u.tax },
      rrr: {
        entries: u.rrr.entries.map(e => ({
          ...e,
          restrictions: e.restrictions.map(r => ({ ...r })),
          responsibilities: e.responsibilities.map(r => ({ ...r }))
        }))
      }
    }));
  }

  private emitUnitsUpdate(units: BuildingUnit[]): void {
    this.unitsChanged.emit(units);
  }

  onUnitFieldChange(unitIndex: number, field: string, value: any): void {
    const units = this.cloneUnits();
    if (!units[unitIndex]) return;
    (units[unitIndex] as any)[field] = value;
    this.emitUnitsUpdate(units);
  }

  onUnitTaxFieldChange(unitIndex: number, field: keyof UnitTaxValuation, value: any): void {
    const units = this.cloneUnits();
    if (!units[unitIndex]) return;
    (units[unitIndex].tax as any)[field] = value;
    this.emitUnitsUpdate(units);
  }

  addUnit(): void {
    const units = this.cloneUnits();
    const parentId = this.buildingInfo()?.summary?.buildingId || '';
    units.push({
      unitId: `U-${Date.now().toString(36).toUpperCase()}`,
      parentBuilding: parentId,
      floorNumber: 0,
      unitType: UnitType.APT,
      boundary: 'Solid',
      accessType: AccessType.COR,
      cadastralRef: '',
      floorArea: 0,
      registrationDate: new Date().toISOString().split('T')[0],
      primaryUse: PrimaryUse.RES,
      tax: { taxUnitArea: 0, assessedValue: 0, lastValuationDate: '', taxDue: 0 },
      rrr: { entries: [] }
    });
    this.emitUnitsUpdate(units);
  }

  removeUnit(unitIndex: number): void {
    const units = this.cloneUnits();
    if (!units[unitIndex]) return;
    units.splice(unitIndex, 1);
    this.emitUnitsUpdate(units);
  }

  // ─── Unit-level RRR editing ────────────────────────────────

  addUnitRRREntry(unitIndex: number): void {
    const units = this.cloneUnits();
    if (!units[unitIndex]) return;
    units[unitIndex].rrr.entries.push({
      rrrId: `URRR-${Date.now().toString(36).toUpperCase()}`,
      type: RightType.OWN_STR,
      holder: '',
      share: 0,
      validFrom: new Date().toISOString().split('T')[0],
      validTo: '',
      documentRef: '',
      restrictions: [],
      responsibilities: []
    });
    this.emitUnitsUpdate(units);
  }

  removeUnitRRREntry(unitIndex: number, entryIndex: number): void {
    const units = this.cloneUnits();
    if (!units[unitIndex]?.rrr?.entries[entryIndex]) return;
    units[unitIndex].rrr.entries.splice(entryIndex, 1);
    this.emitUnitsUpdate(units);
  }

  onUnitRRRFieldChange(unitIndex: number, entryIndex: number, field: keyof RRREntry, value: any): void {
    const units = this.cloneUnits();
    if (!units[unitIndex]?.rrr?.entries[entryIndex]) return;
    (units[unitIndex].rrr.entries[entryIndex] as any)[field] = value;
    this.emitUnitsUpdate(units);
  }

  addUnitRestriction(unitIndex: number, entryIndex: number): void {
    const units = this.cloneUnits();
    if (!units[unitIndex]?.rrr?.entries[entryIndex]) return;
    units[unitIndex].rrr.entries[entryIndex].restrictions.push({ type: RestrictionType.RES_EAS, description: '' });
    this.emitUnitsUpdate(units);
  }

  removeUnitRestriction(unitIndex: number, entryIndex: number, ri: number): void {
    const units = this.cloneUnits();
    if (!units[unitIndex]?.rrr?.entries[entryIndex]) return;
    units[unitIndex].rrr.entries[entryIndex].restrictions.splice(ri, 1);
    this.emitUnitsUpdate(units);
  }

  onUnitRestrictionChange(unitIndex: number, entryIndex: number, ri: number, field: keyof RRRRestriction, value: any): void {
    const units = this.cloneUnits();
    if (!units[unitIndex]?.rrr?.entries[entryIndex]?.restrictions[ri]) return;
    (units[unitIndex].rrr.entries[entryIndex].restrictions[ri] as any)[field] = value;
    this.emitUnitsUpdate(units);
  }

  addUnitResponsibility(unitIndex: number, entryIndex: number): void {
    const units = this.cloneUnits();
    if (!units[unitIndex]?.rrr?.entries[entryIndex]) return;
    units[unitIndex].rrr.entries[entryIndex].responsibilities.push({ type: ResponsibilityType.RSP_MAINT, description: '' });
    this.emitUnitsUpdate(units);
  }

  removeUnitResponsibility(unitIndex: number, entryIndex: number, ri: number): void {
    const units = this.cloneUnits();
    if (!units[unitIndex]?.rrr?.entries[entryIndex]) return;
    units[unitIndex].rrr.entries[entryIndex].responsibilities.splice(ri, 1);
    this.emitUnitsUpdate(units);
  }

  onUnitResponsibilityChange(unitIndex: number, entryIndex: number, ri: number, field: keyof RRRResponsibility, value: any): void {
    const units = this.cloneUnits();
    if (!units[unitIndex]?.rrr?.entries[entryIndex]?.responsibilities[ri]) return;
    (units[unitIndex].rrr.entries[entryIndex].responsibilities[ri] as any)[field] = value;
    this.emitUnitsUpdate(units);
  }

  // ─── Spatial field editing ──────────────────────────────────

  onSpatialFieldChange(field: keyof SpatialInfo, value: any): void {
    const info = this.buildingInfo();
    if (!info) return;
    const updated: SpatialInfo = { ...info.spatial, [field]: value };
    this.spatialChanged.emit(updated);
  }

  // ─── Physical Attributes editing ────────────────────────────

  onPhysicalFieldChange(field: keyof PhysicalAttributes, value: any): void {
    const info = this.buildingInfo();
    if (!info) return;
    const updated: PhysicalAttributes = { ...info.physicalAttributes, [field]: value };
    this.physicalChanged.emit(updated);
  }

  // ─── Relationships & Topology editing ───────────────────────

  onRelationshipsFieldChange(field: keyof RelationshipsTopology, value: any): void {
    const info = this.buildingInfo();
    if (!info) return;
    const updated: RelationshipsTopology = { ...info.relationshipsTopology, [field]: value };
    this.relationshipsChanged.emit(updated);
  }

  // ─── Metadata & Quality editing ─────────────────────────────

  onMetadataFieldChange(field: keyof MetadataQuality, value: any): void {
    const info = this.buildingInfo();
    if (!info) return;
    const updated: MetadataQuality = { ...info.metadataQuality, [field]: value };
    this.metadataChanged.emit(updated);
  }
}

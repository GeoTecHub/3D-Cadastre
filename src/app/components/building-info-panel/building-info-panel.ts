// Path: src/app/components/building-info-panel/building-info-panel.ts

import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BuildingInfo,
  BuildingSummary,
  BuildingUnit,
  RRREntry,
  RRRInfo,
  RRRRestriction,
  RRRResponsibility,
  RelationshipsTopology,
  MetadataQuality,
  LegalStatus,
  PrimaryUse,
  RightType,
  RestrictionType,
  ResponsibilityType,
  LEGAL_STATUS_DISPLAY,
  PRIMARY_USE_DISPLAY,
  RIGHT_TYPE_DISPLAY,
  RESTRICTION_TYPE_DISPLAY,
  RESPONSIBILITY_TYPE_DISPLAY
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

  // Enum option lists for dropdown selects
  readonly legalStatusOptions = Object.values(LegalStatus);
  readonly primaryUseOptions = Object.values(PrimaryUse);
  readonly rightTypeOptions = Object.values(RightType);
  readonly restrictionTypeOptions = Object.values(RestrictionType);
  readonly responsibilityTypeOptions = Object.values(ResponsibilityType);

  readonly legalStatusDisplayMap = LEGAL_STATUS_DISPLAY;
  readonly primaryUseDisplayMap = PRIMARY_USE_DISPLAY;
  readonly rightTypeDisplayMap = RIGHT_TYPE_DISPLAY;
  readonly restrictionTypeDisplayMap = RESTRICTION_TYPE_DISPLAY;
  readonly responsibilityTypeDisplayMap = RESPONSIBILITY_TYPE_DISPLAY;

  // Local state
  expandedSections = signal<Set<CollapsibleSection>>(new Set(['summary', 'units']));
  activeRRRTab = signal<RRRTab>('ownership');
  selectedUnit = signal<BuildingUnit | null>(null);
  expandedRRRId = signal<string | null>(null);

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
}

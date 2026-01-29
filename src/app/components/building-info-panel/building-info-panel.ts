// Path: src/app/components/building-info-panel/building-info-panel.ts

import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  BuildingInfo,
  BuildingUnit,
  OwnershipInfo,
  RestrictionInfo,
  RelationshipsTopology,
  MetadataQuality
} from '../../models/building-info.model';

type RRRTab = 'ownership' | 'restrictions';
type CollapsibleSection = 'summary' | 'spatial' | 'rrr' | 'units' | 'physical' | 'relationships' | 'metadata';

@Component({
  selector: 'app-building-info-panel',
  standalone: true,
  imports: [CommonModule],
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

  // Local state
  expandedSections = signal<Set<CollapsibleSection>>(new Set(['summary', 'units']));
  activeRRRTab = signal<RRRTab>('ownership');
  selectedUnit = signal<BuildingUnit | null>(null);

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
}

// src/app/components/land-info-panel/land-info-panel.ts

import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  LandParcelInfo, createDefaultLandParcel,
  LandUse, LAND_USE_DISPLAY,
  TenureType, TENURE_TYPE_DISPLAY,
  ParcelType, PARCEL_TYPE_DISPLAY,
  BoundaryType, BOUNDARY_TYPE_DISPLAY,
  ZoningCategory, ZONING_CATEGORY_DISPLAY,
  ParcelStatus, PARCEL_STATUS_DISPLAY,
  SoilType, SOIL_TYPE_DISPLAY,
  RightType, RIGHT_TYPE_DISPLAY,
  RestrictionType, RESTRICTION_TYPE_DISPLAY,
  ResponsibilityType, RESPONSIBILITY_TYPE_DISPLAY,
  AccuracyLevel, ACCURACY_LEVEL_DISPLAY,
  SurveyMethod, SURVEY_METHOD_DISPLAY,
  ParcelIdentification, ParcelSpatial, ParcelPhysical,
  ParcelZoning, ParcelValuation, ParcelRelationships, ParcelMetadata,
  RRRInfo, RRREntry
} from '../../models/land-parcel.model';

@Component({
  selector: 'app-land-info-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './land-info-panel.html',
  styleUrls: ['./land-info-panel.css']
})
export class LandInfoPanel {

  // --- Inputs ---
  parcelInfo = input<LandParcelInfo | null>(null);

  // --- Outputs ---
  identificationChanged = output<ParcelIdentification>();
  spatialChanged = output<ParcelSpatial>();
  physicalChanged = output<ParcelPhysical>();
  zoningChanged = output<ParcelZoning>();
  rrrChanged = output<RRRInfo>();
  valuationChanged = output<ParcelValuation>();
  relationshipsChanged = output<ParcelRelationships>();
  metadataChanged = output<ParcelMetadata>();
  saveParcelRequested = output<LandParcelInfo>();
  deleteParcelRequested = output<void>();
  newParcelRequested = output<LandParcelInfo>();

  // --- Enum Options ---
  landUseOptions = Object.values(LandUse);
  tenureTypeOptions = Object.values(TenureType);
  parcelTypeOptions = Object.values(ParcelType);
  boundaryTypeOptions = Object.values(BoundaryType);
  zoningCategoryOptions = Object.values(ZoningCategory);
  parcelStatusOptions = Object.values(ParcelStatus);
  soilTypeOptions = Object.values(SoilType);
  rightTypeOptions = Object.values(RightType);
  restrictionTypeOptions = Object.values(RestrictionType);
  responsibilityTypeOptions = Object.values(ResponsibilityType);
  accuracyLevelOptions = Object.values(AccuracyLevel);
  surveyMethodOptions = Object.values(SurveyMethod);

  // --- Display Maps ---
  landUseDisplayMap = LAND_USE_DISPLAY;
  tenureTypeDisplayMap = TENURE_TYPE_DISPLAY;
  parcelTypeDisplayMap = PARCEL_TYPE_DISPLAY;
  boundaryTypeDisplayMap = BOUNDARY_TYPE_DISPLAY;
  zoningCategoryDisplayMap = ZONING_CATEGORY_DISPLAY;
  parcelStatusDisplayMap = PARCEL_STATUS_DISPLAY;
  soilTypeDisplayMap = SOIL_TYPE_DISPLAY;
  rightTypeDisplayMap = RIGHT_TYPE_DISPLAY;
  restrictionTypeDisplayMap = RESTRICTION_TYPE_DISPLAY;
  responsibilityTypeDisplayMap = RESPONSIBILITY_TYPE_DISPLAY;
  accuracyLevelDisplayMap = ACCURACY_LEVEL_DISPLAY;
  surveyMethodDisplayMap = SURVEY_METHOD_DISPLAY;

  // --- UI State ---
  expandedSections = signal<Set<string>>(new Set(['identification']));
  expandedRRRId = signal<string | null>(null);

  isSectionExpanded(section: string): boolean {
    return this.expandedSections().has(section);
  }

  toggleSection(section: string): void {
    this.expandedSections.update(set => {
      const next = new Set(set);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  toggleRRRExpand(rrrId: string): void {
    this.expandedRRRId.update(current => current === rrrId ? null : rrrId);
  }

  // --- Change Handlers ---

  onIdentificationFieldChange(field: string, value: any): void {
    const info = this.parcelInfo();
    if (!info) return;
    const updated = { ...info.identification, [field]: value };
    this.identificationChanged.emit(updated);
  }

  onSpatialFieldChange(field: string, value: any): void {
    const info = this.parcelInfo();
    if (!info) return;
    const updated = { ...info.spatial, [field]: value };
    this.spatialChanged.emit(updated);
  }

  onPhysicalFieldChange(field: string, value: any): void {
    const info = this.parcelInfo();
    if (!info) return;
    const updated = { ...info.physical, [field]: value };
    this.physicalChanged.emit(updated);
  }

  onZoningFieldChange(field: string, value: any): void {
    const info = this.parcelInfo();
    if (!info) return;
    const updated = { ...info.zoning, [field]: value };
    this.zoningChanged.emit(updated);
  }

  onValuationFieldChange(field: string, value: any): void {
    const info = this.parcelInfo();
    if (!info) return;
    const updated = { ...info.valuation, [field]: value };
    this.valuationChanged.emit(updated);
  }

  onRelationshipsFieldChange(field: string, value: any): void {
    const info = this.parcelInfo();
    if (!info) return;
    const updated = { ...info.relationships, [field]: value };
    this.relationshipsChanged.emit(updated);
  }

  onMetadataFieldChange(field: string, value: any): void {
    const info = this.parcelInfo();
    if (!info) return;
    const updated = { ...info.metadata, [field]: value };
    this.metadataChanged.emit(updated);
  }

  // --- RRR Handlers ---

  onRRRFieldChange(entryIndex: number, field: string, value: any): void {
    const info = this.parcelInfo();
    if (!info) return;
    const entries = info.rrr.entries.map((e, i) =>
      i === entryIndex ? { ...e, [field]: value } : e
    );
    this.rrrChanged.emit({ entries });
  }

  addRRREntry(): void {
    const info = this.parcelInfo();
    if (!info) return;
    const entries = [...info.rrr.entries, {
      rrrId: `LRRR-${Date.now()}`,
      type: RightType.OWN_FREE,
      holder: '',
      share: 0,
      validFrom: new Date().toISOString().split('T')[0],
      validTo: '',
      documentRef: '',
      restrictions: [],
      responsibilities: []
    }];
    this.rrrChanged.emit({ entries });
  }

  removeRRREntry(index: number): void {
    const info = this.parcelInfo();
    if (!info) return;
    const entries = info.rrr.entries.filter((_, i) => i !== index);
    this.rrrChanged.emit({ entries });
  }

  onRestrictionChange(entryIndex: number, restrictionIndex: number, field: string, value: any): void {
    const info = this.parcelInfo();
    if (!info) return;
    const entries = info.rrr.entries.map((e, i) => {
      if (i !== entryIndex) return e;
      const restrictions = e.restrictions.map((r, ri) =>
        ri === restrictionIndex ? { ...r, [field]: value } : r
      );
      return { ...e, restrictions };
    });
    this.rrrChanged.emit({ entries });
  }

  addRestriction(entryIndex: number): void {
    const info = this.parcelInfo();
    if (!info) return;
    const entries = info.rrr.entries.map((e, i) => {
      if (i !== entryIndex) return e;
      return { ...e, restrictions: [...e.restrictions, { type: RestrictionType.RES_EAS, description: '' }] };
    });
    this.rrrChanged.emit({ entries });
  }

  removeRestriction(entryIndex: number, restrictionIndex: number): void {
    const info = this.parcelInfo();
    if (!info) return;
    const entries = info.rrr.entries.map((e, i) => {
      if (i !== entryIndex) return e;
      return { ...e, restrictions: e.restrictions.filter((_, ri) => ri !== restrictionIndex) };
    });
    this.rrrChanged.emit({ entries });
  }

  onResponsibilityChange(entryIndex: number, responsibilityIndex: number, field: string, value: any): void {
    const info = this.parcelInfo();
    if (!info) return;
    const entries = info.rrr.entries.map((e, i) => {
      if (i !== entryIndex) return e;
      const responsibilities = e.responsibilities.map((r, ri) =>
        ri === responsibilityIndex ? { ...r, [field]: value } : r
      );
      return { ...e, responsibilities };
    });
    this.rrrChanged.emit({ entries });
  }

  addResponsibility(entryIndex: number): void {
    const info = this.parcelInfo();
    if (!info) return;
    const entries = info.rrr.entries.map((e, i) => {
      if (i !== entryIndex) return e;
      return { ...e, responsibilities: [...e.responsibilities, { type: ResponsibilityType.RSP_MAINT, description: '' }] };
    });
    this.rrrChanged.emit({ entries });
  }

  removeResponsibility(entryIndex: number, responsibilityIndex: number): void {
    const info = this.parcelInfo();
    if (!info) return;
    const entries = info.rrr.entries.map((e, i) => {
      if (i !== entryIndex) return e;
      return { ...e, responsibilities: e.responsibilities.filter((_, ri) => ri !== responsibilityIndex) };
    });
    this.rrrChanged.emit({ entries });
  }

  // --- Actions ---

  createNewParcel(): void {
    const parcel = createDefaultLandParcel();
    this.newParcelRequested.emit(parcel);
  }

  onSaveParcel(): void {
    const info = this.parcelInfo();
    if (info) this.saveParcelRequested.emit(info);
  }

  onDeleteParcel(): void {
    this.deleteParcelRequested.emit();
  }

  // --- Formatters ---

  formatArea(value: number | undefined): string {
    if (!value) return '0 m²';
    return value >= 10000
      ? `${(value / 10000).toFixed(2)} ha`
      : `${value.toLocaleString()} m²`;
  }

  formatCurrency(value: number | undefined): string {
    if (!value) return '$0';
    return '$' + value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}

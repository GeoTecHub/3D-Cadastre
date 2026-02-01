import { Component, Inject, PLATFORM_ID, signal, effect, inject, ViewChild, computed, NgZone, untracked } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { CityjsonService } from '../../services/cityjson';
import { BackendService } from '../../services/backend.service';
import { NinjaViewer } from '../viewers/ninja-viewer/ninja-viewer';
import { BuildingInfoPanel } from '../building-info-panel/building-info-panel';
import { SaveModelDialog, SaveModelResult } from '../dialogs/save-model-dialog/save-model-dialog';
import { CreateApartmentDialog, CreateApartmentResult } from '../dialogs/create-apartment-dialog/create-apartment-dialog';
import { Apartment, CityJSONRecord } from '../../services/cityjson.model';
import {
  BuildingInfo, BuildingSummary, BuildingUnit, RRRInfo,
  SpatialInfo, PhysicalAttributes, RelationshipsTopology, MetadataQuality,
  extractBuildingInfo
} from '../../models/building-info.model';

type ViewerType = 'ninja' | 'threejs';

@Component({
  selector: 'app-viewer-container',
  standalone: true,
  imports: [CommonModule, NinjaViewer, BuildingInfoPanel, SaveModelDialog, CreateApartmentDialog],
  templateUrl: './viewer-container.html',
  styleUrls: ['./viewer-container.css']
})
export class ViewerContainer {
  private readonly cityjsonService = inject(CityjsonService);
  private readonly backendService = inject(BackendService);
  private readonly ngZone = inject(NgZone);

  @ViewChild(NinjaViewer) ninjaViewer!: NinjaViewer;

  cityjson = toSignal(this.cityjsonService.cityjsonData$);

  // Local state signals
  activeViewer = signal<ViewerType>('ninja');
  isLoading = signal(false);
  isSaving = signal(false);
  loadError = signal<string | null>(null);
  saveStatus = signal<string | null>(null);
  selectedObjectId = signal<string | null>(null);
  savedModels = signal<CityJSONRecord[]>([]);
  showModelList = signal(false);
  showLeftPanel = signal(true);
  isExplodeView = signal(false);

  // Track the backend record ID for the currently loaded model
  currentRecordId = signal<number | null>(null);

  // Dialog visibility
  showSaveModelDialog = signal(false);
  showCreateApartmentDialog = signal(false);
  selectedRoomsForApartment = signal<string[]>([]);

  // Resizable sidebar
  sidebarWidth = signal(340);
  private _resizing = false;

  // Room selection state
  pendingRoomSelection = signal<string[]>([]);
  private _selectingForUnitIndex = signal<number | null>(null);

  // Override signal for user edits to summary fields
  private _buildingInfoOverride = signal<BuildingInfo | null>(null);

  // Building info computed from cityjson, with user edits applied
  buildingInfo = computed<BuildingInfo | null>(() => {
    const override = this._buildingInfoOverride();
    if (override) return override;
    const data = this.cityjson();
    if (!data) return null;
    return extractBuildingInfo(data, this.selectedObjectId() || undefined);
  });

  // Whether a model is currently loaded
  modelLoaded = computed(() => !!this.cityjson());

  // Extract all Room/BuildingRoom IDs from the CityJSON data
  availableRooms = computed<string[]>(() => {
    const data = this.cityjson();
    if (!data || !data.CityObjects) return [];
    return Object.keys(data.CityObjects).filter(key => {
      const type = data.CityObjects[key].type;
      return type === 'BuildingRoom' || type === 'Room';
    });
  });

  // Build a roomId → unitId map from current building info units
  assignedRoomMap = computed<Record<string, string>>(() => {
    const info = this.buildingInfo();
    if (!info) return {};
    const map: Record<string, string> = {};
    info.units.forEach(unit => {
      unit.rooms.forEach(roomId => {
        map[roomId] = unit.unitId;
      });
    });
    return map;
  });

  private readonly defaultModelUrl = '/lod2_appartment.city.json';
  private readonly isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    if (this.isBrowser) {
      this.loadDefaultModel();
    }

    effect(() => {
      if (!this.cityjson()) {
        this.selectedObjectId.set(null);
        this.currentRecordId.set(null);
      }
    });

    // Auto-clear save status after 3 seconds
    effect(() => {
      const status = this.saveStatus();
      if (status) {
        setTimeout(() => {
          this.saveStatus.set(null);
        }, 3000);
      }
    });
  }

  async onFileSelected(event: Event): Promise<void> {
    if (!this.isBrowser) return;

    this.loadError.set(null);
    this.currentRecordId.set(null);
    const input = event.target as HTMLInputElement;

    if (!input.files?.length) return;

    const file = input.files[0];
    this.isLoading.set(true);

    try {
      await this.cityjsonService.loadCityJSONFromFile(file);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Could not read file.');
    } finally {
      this.isLoading.set(false);
      input.value = '';
    }
  }

  switchViewer(type: ViewerType): void {
    this.activeViewer.set(type);
  }

  async reloadDefaultModel(): Promise<void> {
    this.currentRecordId.set(null);
    await this.loadDefaultModel();
  }

  onSelectionChange(objectId: string): void {
    this.selectedObjectId.set(objectId || null);
  }

  toggleLeftPanel(): void {
    this.showLeftPanel.update(v => !v);
  }

  // ─── Apartment Creation Mode ────────────────────────────────

  startApartmentCreation(): void {
    if (this.ninjaViewer) {
      this.ninjaViewer.startApartmentCreationMode();
    }
  }

  openCreateApartmentDialog(): void {
    if (!this.cityjson()) return;

    // Get selected rooms from the ninja viewer if in creation mode
    if (this.ninjaViewer) {
      const rooms = this.ninjaViewer.getCurrentRoomSelection?.() || [];
      this.selectedRoomsForApartment.set(rooms);
    }
    this.showCreateApartmentDialog.set(true);
  }

  async onCreateApartmentDialogClose(result: CreateApartmentResult): Promise<void> {
    this.showCreateApartmentDialog.set(false);

    if (!result.confirmed || !result.apartment) {
      // Cancel creation mode in the viewer
      if (this.ninjaViewer) {
        this.ninjaViewer.cancelCreationMode?.();
      }
      this.selectedRoomsForApartment.set([]);
      return;
    }

    // Save the apartment
    await this.onApartmentCreated(result.apartment);

    // Reset selection
    if (this.ninjaViewer) {
      this.ninjaViewer.cancelCreationMode?.();
    }
    this.selectedRoomsForApartment.set([]);
  }

  // ─── Explode View ───────────────────────────────────────────

  onExplodeViewRequested(): void {
    this.isExplodeView.update(v => !v);
    // Explode view logic will be implemented in the viewer
    if (this.ninjaViewer && 'toggleExplodeView' in this.ninjaViewer) {
      (this.ninjaViewer as any).toggleExplodeView?.();
    }
  }

  onUnitSelected(unitId: string): void {
    this.selectedObjectId.set(unitId);
    // Focus on the unit in the 3D viewer
    if (this.ninjaViewer) {
      // The viewer will react to focusObjectId input change
    }
  }

  onSummaryChanged(updated: BuildingSummary): void {
    const current = this.buildingInfo();
    if (!current) return;
    this._buildingInfoOverride.set({ ...current, summary: updated });
  }

  onRRRChanged(updated: RRRInfo): void {
    const current = this.buildingInfo();
    if (!current) return;
    this._buildingInfoOverride.set({ ...current, rrr: updated });
  }

  onUnitsChanged(updated: BuildingUnit[]): void {
    const current = this.buildingInfo();
    if (!current) return;
    this._buildingInfoOverride.set({ ...current, units: updated });
  }

  onSpatialChanged(updated: SpatialInfo): void {
    const current = this.buildingInfo();
    if (!current) return;
    this._buildingInfoOverride.set({ ...current, spatial: updated });
  }

  onPhysicalChanged(updated: PhysicalAttributes): void {
    const current = this.buildingInfo();
    if (!current) return;
    this._buildingInfoOverride.set({ ...current, physicalAttributes: updated });
  }

  onRelationshipsChanged(updated: RelationshipsTopology): void {
    const current = this.buildingInfo();
    if (!current) return;
    this._buildingInfoOverride.set({ ...current, relationshipsTopology: updated });
  }

  onMetadataChanged(updated: MetadataQuality): void {
    const current = this.buildingInfo();
    if (!current) return;
    this._buildingInfoOverride.set({ ...current, metadataQuality: updated });
  }

  // ─── Backend: Save Model ───────────────────────────────────

  openSaveModelDialog(): void {
    if (!this.cityjson()) {
      this.saveStatus.set('No model loaded to save.');
      return;
    }
    this.showSaveModelDialog.set(true);
  }

  async onSaveModelDialogClose(result: SaveModelResult): Promise<void> {
    this.showSaveModelDialog.set(false);

    if (!result.confirmed) return;

    const data = this.cityjsonService.getCityJSONSnapshot();
    if (!data) {
      this.saveStatus.set('No model loaded to save.');
      return;
    }

    this.isSaving.set(true);
    this.saveStatus.set(null);

    try {
      const modelName = result.modelName || `CityJSON_${new Date().toISOString().slice(0, 19)}`;
      const record = await this.backendService.saveCityJSON(modelName, data);
      this.currentRecordId.set(record.id);
      this.saveStatus.set(`Model saved (ID: ${record.id})`);
    } catch (error) {
      this.saveStatus.set(error instanceof Error ? error.message : 'Failed to save model.');
    } finally {
      this.isSaving.set(false);
    }
  }

  // ─── Backend: List & Load Models ───────────────────────────

  async toggleModelList(): Promise<void> {
    if (this.showModelList()) {
      this.showModelList.set(false);
      return;
    }

    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const models = await this.backendService.listCityJSON();
      this.savedModels.set(models);
      this.showModelList.set(true);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Failed to fetch models.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadModelFromBackend(record: CityJSONRecord): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.showModelList.set(false);

    try {
      const fullRecord = await this.backendService.getCityJSON(record.id);
      this.cityjsonService.loadCityJSONData(fullRecord.cityjson_data);
      this.currentRecordId.set(fullRecord.id);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Failed to load model.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // ─── Backend: Save Apartment ───────────────────────────────

  async onApartmentCreated(apartment: Apartment): Promise<void> {
    const recordId = this.currentRecordId();
    if (!recordId) {
      this.saveStatus.set('Save the model first before saving apartments.');
      return;
    }

    this.isSaving.set(true);
    this.saveStatus.set(null);

    try {
      const saved = await this.backendService.saveApartment(
        recordId,
        apartment.apartment_id,
        apartment.rooms
      );
      this.saveStatus.set(`Apartment "${apartment.apartment_id}" saved (ID: ${saved.id})`);
    } catch (error) {
      this.saveStatus.set(error instanceof Error ? error.message : 'Failed to save apartment.');
    } finally {
      this.isSaving.set(false);
    }
  }

  // ─── Panel: Save/Delete Building ─────────────────────────

  onSaveModelRequested(): void {
    this.openSaveModelDialog();
  }

  onSaveBuildingRequested(info: BuildingInfo): void {
    // Persist the building info override and trigger backend save
    this._buildingInfoOverride.set(info);
    this.saveStatus.set('Building details saved locally.');
    // Backend persistence will be handled by user's extended service
  }

  onDeleteBuildingRequested(): void {
    this._buildingInfoOverride.set(null);
    this.selectedObjectId.set(null);
    this.saveStatus.set('Building details cleared.');
  }

  // ─── Panel: Room Selection Orchestration ────────────────

  onStartRoomSelection(event: { unitIndex: number; existingRooms: string[] }): void {
    this._selectingForUnitIndex.set(event.unitIndex);
    // Pre-populate with existing rooms
    this.pendingRoomSelection.set([...event.existingRooms]);

    if (this.ninjaViewer) {
      this.ninjaViewer.startApartmentCreationMode();
      // Pre-select existing rooms in the viewer
      event.existingRooms.forEach(roomId => {
        const meshes = (this.ninjaViewer as any).findAllMeshesByObjectId?.(roomId);
        if (meshes?.length) {
          meshes.forEach((m: any) => {
            m.material = (this.ninjaViewer as any).wireframeRoomMaterial;
          });
        }
      });
      this.ninjaViewer.currentRoomSelection = [...event.existingRooms];
    }
  }

  onFinishRoomSelection(event: { unitIndex: number; rooms: string[] }): void {
    // Get the final selection from the viewer
    if (this.ninjaViewer) {
      const viewerSelection = this.ninjaViewer.getCurrentRoomSelection();
      event.rooms = viewerSelection;
      this.ninjaViewer.cancelCreationMode();
    }

    // Update the building info with the new room assignment
    const current = this.buildingInfo();
    if (current && current.units[event.unitIndex]) {
      const updatedUnits = current.units.map((u, i) => {
        if (i === event.unitIndex) {
          return { ...u, rooms: [...event.rooms] };
        }
        return u;
      });
      this._buildingInfoOverride.set({ ...current, units: updatedUnits });
    }

    this._selectingForUnitIndex.set(null);
    this.pendingRoomSelection.set([]);
  }

  onCancelRoomSelection(): void {
    if (this.ninjaViewer) {
      this.ninjaViewer.cancelCreationMode();
    }
    this._selectingForUnitIndex.set(null);
    this.pendingRoomSelection.set([]);
  }

  onHighlightRooms(roomIds: string[]): void {
    if (this.ninjaViewer) {
      this.ninjaViewer.highlightRoomIds(roomIds);
    }
  }

  // ─── Sidebar Resize ──────────────────────────────────────

  onResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this._resizing = true;
    const startX = event.clientX;
    const startWidth = this.sidebarWidth();

    const onMove = (e: MouseEvent) => {
      if (!this._resizing) return;
      const delta = startX - e.clientX;
      const newWidth = Math.max(240, Math.min(600, startWidth + delta));
      this.ngZone.run(() => this.sidebarWidth.set(newWidth));
      // Notify Three.js viewer that the container size changed
      window.dispatchEvent(new Event('resize'));
    };

    const onUp = () => {
      this._resizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  private async loadDefaultModel(): Promise<void> {
    if (!this.isBrowser) return;

    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      await this.cityjsonService.loadCityJSONFromUrl(this.defaultModelUrl);
    } catch {
      this.loadError.set('Could not load the sample model.');
    } finally {
      this.isLoading.set(false);
    }
  }
}

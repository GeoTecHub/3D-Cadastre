import { Component, Inject, PLATFORM_ID, signal, effect,inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop'; // 👈 Vital for Angular 20
import { CityjsonService } from '../../services/cityjson';
import { CityobjectsTree } from '../cityobjects-tree/cityobjects-tree';
import { NinjaViewer } from '../viewers/ninja-viewer/ninja-viewer';

type ViewerType = 'ninja' | 'threejs';

@Component({
  selector: 'app-viewer-container',
  standalone: true,
  imports: [CommonModule, CityobjectsTree, NinjaViewer], // Add ThreejsViewer here if needed
  templateUrl: './viewer-container.html',
  styleUrls: ['./viewer-container.css']
})
export class ViewerContainer {
  private readonly cityjsonService = inject(CityjsonService);
  // 1. Convert Observable to Signal. 'requireSync' is false by default, so it starts undefined.
  // This automatically handles subscription/unsubscription.
  cityjson = toSignal(this.cityjsonService.cityjsonData$);

  // 2. Use Signals for local state
  activeViewer = signal<ViewerType>('ninja');
  isLoading = signal(false);
  loadError = signal<string | null>(null);
  selectedObjectId = signal<string | null>(null);

  private readonly defaultModelUrl = '/lod2_appartment.city.json';
  private readonly isBrowser: boolean;

  constructor(
    
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    // Load default model on startup (browser only)
    if (this.isBrowser) {
      this.loadDefaultModel();
    }
    
    // Automatic Reset: If cityjson becomes null, clear selection
    effect(() => {
        if (!this.cityjson()) {
            this.selectedObjectId.set(null);
        }
    });
  }

  // No ngOnInit or ngOnDestroy needed!

  async onFileSelected(event: Event): Promise<void> {
    if (!this.isBrowser) return;

    this.loadError.set(null);
    const input = event.target as HTMLInputElement;

    if (!input.files?.length) return;

    const file = input.files[0];
    this.isLoading.set(true);

    try {
      await this.cityjsonService.loadCityJSONFromFile(file);
      // Logic for success is handled by the cityjson signal updating automatically
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
    await this.loadDefaultModel();
  }

  // Update signal value
  onSelectionChange(objectId: string): void {
    // If empty string comes in, treat as null
    this.selectedObjectId.set(objectId || null);
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
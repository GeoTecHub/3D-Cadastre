// components/viewer-container/viewer-container.component.ts
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { Subscription } from 'rxjs';
import { CityjsonService } from '../../services/cityjson';
import { CityJSON } from '../../services/cityjson.model';
import { CityobjectsTree } from '../cityobjects-tree/cityobjects-tree';
import { NinjaViewer } from '../viewers/ninja-viewer/ninja-viewer';
import { ThreejsViewer } from '../viewers/threejs-viewer/threejs-viewer';

type ViewerType = 'ninja' | 'threejs';

@Component({
  selector: 'app-viewer-container',
  standalone: true,
  imports: [CommonModule, CityobjectsTree, NinjaViewer, ThreejsViewer],
  templateUrl: './viewer-container.html',
  styleUrls: ['./viewer-container.css']
})
export class ViewerContainer implements OnInit, OnDestroy {
  activeViewer: ViewerType = 'ninja';
  cityjson: CityJSON | null = null;
  loadError: string | null = null;
  isLoading = false;
  selectedObjectId: string | null = null;

  private readonly defaultModelUrl = '/lod2_appartment.city.json';
  private readonly isBrowser: boolean;
  private dataSubscription?: Subscription;

  constructor(
    private readonly cityjsonService: CityjsonService,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.dataSubscription = this.cityjsonService.cityjsonData$.subscribe(data => {
      this.cityjson = data;
      this.isLoading = false;
      if (!data) {
        this.selectedObjectId = null;
      }
    });

    if (this.isBrowser) {
      this.loadDefaultModel();
    }
  }

  ngOnDestroy(): void {
    this.dataSubscription?.unsubscribe();
  }

  async onFileSelected(event: Event): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    this.loadError = null;
    const input = event.target as HTMLInputElement;

    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      await this._loadData(this.cityjsonService.loadCityJSONFromFile(file), 'Could not read the selected file.');
    } finally {
      input.value = ''; // Reset file input to allow re-selecting the same file
    }
  }

  switchViewer(type: ViewerType): void {
    this.activeViewer = type;
  }

  async reloadDefaultModel(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    await this.loadDefaultModel(true);
  }

  updateSelectedObject(objectId: string | null): void {
    this.selectedObjectId = objectId || null;
  }

  private async loadDefaultModel(forceReload = false): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    // Avoid reloading if data is already present, unless forced
    if (this.cityjson && !forceReload) {
      return;
    }
    await this._loadData(this.cityjsonService.loadCityJSONFromUrl(this.defaultModelUrl), 'Could not load the sample model.');
  }

  private async _loadData(loader: Promise<void>, errorMessage: string): Promise<void> {
    this.isLoading = true;
    this.loadError = null;
    try {
      await loader;
    } catch (error) {
      this.isLoading = false;
      this.loadError = error instanceof Error ? error.message : errorMessage;
    }
  }
}

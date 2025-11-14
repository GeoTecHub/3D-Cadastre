import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CityjsonService } from './services/cityjson';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { CityobjectsTree } from './components/cityobjects-tree/cityobjects-tree';
import { ChangeDetectorRef } from '@angular/core';

import { CityJSON } from './services/import-ifc';

@Component({
  selector: 'app-root',
  imports: [CommonModule,  CityobjectsTree],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  currentCityJSON: CityJSON | null = null;

  onCityJSONLoaded(cityjson: CityJSON) {
    this.currentCityJSON = cityjson;
  }
  cityjson: any = null;
  fileError: string | null = null;
  viewerKey = Date.now();
  selectedObjectId: string | null = null;
  private readonly localCityJsonPath = '/lod2_appartment.city.json';
  private readonly isBrowser: boolean;

  constructor(
    private cityjsonService: CityjsonService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    if (!this.isBrowser) {
      return;
    }

    this.cityjsonService.loadCityJSONFromUrl(this.localCityJsonPath)
      .then(data => {
        this.cityjson = data;
        this.viewerKey = Date.now();
        this.cdr.detectChanges();
        console.log('Loaded CityJSON from local asset:', this.localCityJsonPath);
      })
      .catch(err => {
        this.fileError = 'Failed to load CityJSON: ' + err;
        this.cdr.detectChanges();
      });

    // this.cityjsonService.getCityJSONFromApi('https://example.com/cityjson')
    //   .then(data => {
    //     this.cityjson = data[0]?.cityjson_data;

    //     this.viewerKey = Date.now();
    //     this.cdr.detectChanges();
    //   })
    //   .catch(err => {
    //     this.fileError = 'Failed to load CityJSON from API: ' + err.message;
    //     this.cdr.detectChanges();
    //   });

  }

  onObjectSelected(objId: string) {
    this.selectedObjectId = objId;
  }

  onCityjsonChange(cityjson: CityJSON) {
    this.cityjson = cityjson;
    this.selectedObjectId = null;
    this.viewerKey = Date.now();
  }
}

import { Component, OnInit } from '@angular/core';
import { CityjsonService } from './services/cityjson';
import { CommonModule } from '@angular/common';
import { CityobjectsTree } from './components/cityobjects-tree/cityobjects-tree';
import { ChangeDetectorRef } from '@angular/core';
import { ENDPOINT_URL } from '../../env';
import { ItownsViewer } from './components/itowns-viewer/itowns-viewer';

@Component({
  selector: 'app-root',
  imports: [CommonModule, ItownsViewer, CityobjectsTree],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  cityjson: any = null;
  fileError: string | null = null;
  viewerKey = Date.now();
  selectedObjectId: string | null = null;

  constructor(
    private cityjsonService: CityjsonService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.cityjsonService.loadCityJSONFromUrl('/lod2_appartment.city.json')
      .then(data => {
        this.cityjson = data;
        this.viewerKey = Date.now();
        this.cdr.detectChanges();
      })
      .catch(err => {
        this.fileError = 'Failed to load CityJSON: ' + err;
        this.cdr.detectChanges();
      });

    // this.cityjsonService.getCityJSONFromApi(ENDPOINT_URL)
    //   .then(data => {
    //     this.cityjson = data[0]?.cityjson_data;

    //     this.viewerKey = Date.now();
    //     this.cdr.detectChanges();
    //   })
    //   .catch(err => {
    //     this.fileError = 'Failed to load CityJSON from API: ' + err.message;
    //     this.cdr.detectChanges();
    //   });

    console.log('Configured API endpoint:', ENDPOINT_URL);
  }

  onObjectSelected(objId: string) {
    this.selectedObjectId = objId;
  }
}

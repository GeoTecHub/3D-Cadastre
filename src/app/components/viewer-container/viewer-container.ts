// components/viewer-container/viewer-container.component.ts
import { Component, Input } from '@angular/core';
import { CityJSON } from '../../services/cityjson.service';

type ViewerType = 'ninja' | 'itowns' | 'threejs'

@Component({
  selector: 'app-viewer-container',
  imports: [],
  templateUrl: './viewer-container.html',
  styleUrl: './viewer-container.css'
})
export class ViewerContainer {
  @Input() cityjson: CityJSON | null = null;
  
  activeViewer: ViewerType = 'ninja'; // Default to Ninja

  switchViewer(type: ViewerType) {
    this.activeViewer = type;
  }

}

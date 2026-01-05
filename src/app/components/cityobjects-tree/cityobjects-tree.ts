import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CityJSON } from '../../services/cityjson.model';

interface CityObjectEntry {
  id: string;
  object: any;
}

@Component({
  selector: 'app-cityobjects-tree',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cityobjects-tree.html',
  styleUrls: ['./cityobjects-tree.css'],
})
export class CityobjectsTree implements OnChanges {
  @Input() cityjson: CityJSON | null = null;
  @Output() selectObject = new EventEmitter<string>();

  cityObjectEntries: CityObjectEntry[] = [];
  hasCityObjects = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cityjson']) {
      const currentCityJson = changes['cityjson'].currentValue;
      const cityObjects = currentCityJson?.CityObjects;

      this.cityObjectEntries = cityObjects
        ? Object.keys(cityObjects).map(id => ({ id: id, object: cityObjects[id] }))
        : [];

      this.hasCityObjects = this.cityObjectEntries.length > 0;
    }
  }

  getObjectType(obj: any): string {
    return obj.type || 'Unknown';
  }

  onSelect(objId: string) {
    this.selectObject.emit(objId);
  }

  trackByObjectId(index: number, entry: CityObjectEntry): string {
    return entry.id;
  }
}

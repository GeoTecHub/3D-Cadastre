import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-cityobjects-tree',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cityobjects-tree.html',
  styleUrls: ['./cityobjects-tree.css'],
})
export class CityobjectsTree {
  @Input() cityjson: any;
  @Output() selectObject = new EventEmitter<string>();

  getCityObjectEntries() {
    return this.cityjson && this.cityjson.CityObjects
      ? Object.entries(this.cityjson.CityObjects)
      : [];
  }

  getObjectType(obj: any): string {
    return obj.type || 'Unknown';
  }

  onSelect(objId: string) {
    this.selectObject.emit(objId);
  }
}

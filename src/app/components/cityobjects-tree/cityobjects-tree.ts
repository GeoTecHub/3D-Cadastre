import { Component, input, computed, output } from '@angular/core'; // Note new imports
import { CommonModule } from '@angular/common';
import { CityJSON } from '../../services/cityjson.model';

@Component({
  selector: 'app-cityobjects-tree',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cityobjects-tree.html',
  styleUrls: ['./cityobjects-tree.css'],
})
export class CityobjectsTree {
  // 1. Replace @Input with input()
  cityjson = input<CityJSON | null>(null);

  // 2. Replace @Output with output()
  selectObject = output<string>();

  // 💡 NEW INPUT: The ID of the object currently in "wireframe mode" 
  // (This ID is set by the parent component, usually after the user clicks "Create Apartment")
  activeWireframeId = input<string | null>(null);

  // 3. Use computed() instead of ngOnChanges
  // This automatically updates whenever 'cityjson' changes.
cityObjectEntries = computed(() => {
    const data = this.cityjson();
    if (!data || !data.CityObjects) return [];
    
    return Object.entries(data.CityObjects)
      .map(([id, obj]) => ({ id, object: obj }))
      .sort((a, b) => {
          // 1. Get the type (e.g., "Building", "Road", "TINRelief")
          const typeA = a.object.type || 'Unknown';
          const typeB = b.object.type || 'Unknown';
          
          // 2. Primary Sort: Compare Types
          // This ensures "Bridge" comes before "Building", and "Road" comes after "PlantCover".
          const typeComparison = typeA.localeCompare(typeB);
          
          // 3. If types are different, use that order to separate the groups
          if (typeComparison !== 0) {
            return typeComparison;
          }

          // 4. Secondary Sort: If types are the same (e.g. both are "Building"), sort by ID
          return a.id.localeCompare(b.id);
      }); 
  });

  // 4. Helper for the template to check length
  hasCityObjects = computed(() => this.cityObjectEntries().length > 0);

  getObjectType(obj: any): string {
    return obj.type || 'Unknown';
  }

  onSelect(objId: string) {
    this.selectObject.emit(objId);
  }
}
// services/ninja-loader.service.ts
import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { CityjsonService } from './cityjson';

@Injectable({
  providedIn: 'root'
})
export class NinjaLoader {/**
   * Loads CityJSON using Ninja's proven logic
   * Based on: https://github.com/cityjson/ninja/blob/master/src/js/viewer.js
   */
  loadCityJSON(
    cityjson: CityjsonService, 
    scene: THREE.Scene,
    options?: {
      colorBySemantic?: boolean;
      wireframe?: boolean;
    }
  ): THREE.Group {
    const group = new THREE.Group();
    
    // Transform vertices
    const vertices = this.getTransformedVertices(cityjson);
    
    // Load city objects
    Object.entries(cityjson.CityObjects).forEach(([id, obj]) => {
      const meshes = this.createObjectMeshes(id, obj, vertices, options);
      meshes.forEach(mesh => group.add(mesh));
    });
    
    return group;
  }
  
  private getTransformedVertices(cm: CityJSON): THREE.Vector3[] {
    const transform = cm.transform;
    return cm.vertices.map(v => {
      if (transform) {
        return new THREE.Vector3(
          v[0] * transform.scale[0] + transform.translate[0],
          v[1] * transform.scale[1] + transform.translate[1],
          v[2] * transform.scale[2] + transform.translate[2]
        );
      }
      return new THREE.Vector3(v[0], v[1], v[2]);
    });
  }
  
  private createObjectMeshes(
    objectId: string,
    cityObject: any,
    vertices: THREE.Vector3[],
    options?: any
  ): THREE.Mesh[] {
    // Implement Ninja's robust geometry creation
    // This is where you'd port Ninja's triangle handling logic
    return [];
  }
}

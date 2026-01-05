// components/viewers/ninja-viewer/ninja-viewer.component.ts

import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Inject, PLATFORM_ID, input, output, effect, untracked,inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { NinjaLoader } from 'src/app/services/ninja-loader';
import { CityjsonService } from 'src/app/services/cityjson';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-ninja-viewer',
  standalone: true,
  templateUrl: './ninja-viewer.html',
  styleUrls: ['./ninja-viewer.css']
})
export class NinjaViewer implements AfterViewInit, OnDestroy {
  // --- MODERN SIGNALS ---
  focusObjectId = input<string | null>(null);
  objectSelected = output<string>();
  private cityjsonService = inject(CityjsonService);
  // Convert Service Observable to Signal
  cityData = toSignal(this.cityjsonService.cityjsonData$);

  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  
  private cityModel: THREE.Group | null = null;
  // ⚡ PERFORMANCE OPTIMIZATION: Instant lookup map
  private meshLookup = new Map<string, THREE.Mesh[]>(); 

  private animationId: number | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  
  private selectedMesh: THREE.Mesh | null = null;
  private hoveredMesh: THREE.Mesh | null = null;
  private outlineMeshes: THREE.LineSegments[] = [];

  private readonly highlightColor = new THREE.Color(0x4f46e5);
  private readonly hoverColor = new THREE.Color(0x818cf8);
  private readonly isBrowser: boolean;
  
  // Pointer state
  private pointerIsDown = false;
  private pointerDownPos = new THREE.Vector2();
  
constructor(
    private ninjaLoader: NinjaLoader,
    
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    // 1. React to Data Changes
    effect(() => {
      const data = this.cityData();
      // untracked prevents loop if loadModel triggers other signals
      untracked(() => {
        if (data) this.loadModel();
        else this.clearModel();
      });
    });

    // 2. React to Input Selection Changes
    effect(() => {
      const id = this.focusObjectId();
      untracked(() => {
        if (!id) {
          this.clearSelection(true);
        } else {
          // Check if already selected to prevent flicker
          const currentId = this.selectedMesh ? this.findObjectId(this.selectedMesh) : null;
          if (currentId !== id) {
             const meshes = this.findAllMeshesByObjectId(id); // Now O(1) fast!
             if (meshes.length > 0) {
               this.applySelectionToMeshes(meshes, id, false);
             }
          }
        }
      });
    });
  }
ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.initScene();
    }
  }

  ngOnDestroy(): void {
    if (!this.isBrowser) return;
    
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointerup', this.handlePointerUp);
    
    this.renderer?.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.controls?.dispose();
    
    if (this.animationId) cancelAnimationFrame(this.animationId);
    
    this.clearModel(); // Ensure GPU memory is freed
    this.renderer?.dispose();
  }

private initScene(): void {
    // ... (Your existing init code is fine, keep it same) ...
    // Just ensure you bind the events correctly as you did before.
    if (!this.container) return;
    
    const { width, height } = this.getContainerSize();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf6f7fb);
    
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1_000_000);
    this.camera.position.set(30, 30, 30);
    this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio ?? 1);
    
    this.container.nativeElement.appendChild(this.renderer.domElement);
    
    // Add Lights & Controls...
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambient);
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('resize', this.handleResize);
    
    this.animate();
  }


private clearModel(): void {
    if (this.cityModel) {
      // 1. Manually dispose geometries and materials
      this.cityModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      // 2. Remove from scene
      this.scene.remove(this.cityModel);
      this.cityModel = null;
    }
    this.meshLookup.clear();
    this.clearSelection(true);
    this.clearHover();
  }

 private loadModel(): void {
    this.clearModel();
    this.cityModel = this.ninjaLoader.createSceneGroup();

    if (this.cityModel) {
      // Build the Fast Lookup Map
      this.buildLookupMap(this.cityModel);
      
      this.normalizeModelScale(this.cityModel);
      this.scene.add(this.cityModel);
      this.fitCameraToModel();
    }
  }

  // --- ⚡ OPTIMIZED LOOKUP ---
  private buildLookupMap(group: THREE.Group) {
    this.meshLookup.clear();
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData['objectId']) {
        const id = obj.userData['objectId'];
        if (!this.meshLookup.has(id)) {
          this.meshLookup.set(id, []);
        }
        this.meshLookup.get(id)?.push(obj);
      }
    });
  }


  private fitCameraToModel(): void {
    if (!this.cityModel || !this.camera || !this.controls) {
      return;
    }

    const box = new THREE.Box3().setFromObject(this.cityModel);
    if (box.isEmpty()) {
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const distance = maxDim * 1.6;
    const minDistance = Math.max(maxDim * 0.005, 0.02);

    this.camera.position.copy(center).add(new THREE.Vector3(distance, distance, distance));
    this.camera.near = Math.max(minDistance / 20, 0.005);
    this.camera.far = Math.max(distance * 50, 5000);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.maxDistance = distance * 15;
    this.controls.minDistance = minDistance;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.update();
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  };

  private getContainerSize(): { width: number; height: number } {
    const element = this.container.nativeElement;
    const fallbackWidth = this.isBrowser ? window.innerWidth : 800;
    const fallbackHeight = this.isBrowser ? window.innerHeight : 600;
    const width = element.clientWidth || element.parentElement?.clientWidth || fallbackWidth;
    const height = element.clientHeight || element.parentElement?.clientHeight || fallbackHeight;
    return {
      width: Math.max(width ?? 0, 200),
      height: Math.max(height ?? 0, 200)
    };
  }

  private handleResize = (): void => {
    if (!this.isBrowser || !this.renderer || !this.camera) {
      return;
    }
    const { width, height } = this.getContainerSize();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private normalizeModelScale(group: THREE.Group): number {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) {
      return 1;
    }

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const minComfort = 60;
    const maxComfort = 800;
    let scale = 1;

    if (maxDim < minComfort) {
      scale = minComfort / Math.max(maxDim, 1e-3);
    } else if (maxDim > maxComfort) {
      scale = maxComfort / maxDim;
    }

    if (scale !== 1) {
      group.scale.setScalar(scale);
    }

    return scale;
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    this.pointerIsDown = true;
    this.pointerDownPos.set(event.clientX, event.clientY);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.pointerIsDown || event.button !== 0) {
      return;
    }
    this.pointerIsDown = false;
    const deltaX = event.clientX - this.pointerDownPos.x;
    const deltaY = event.clientY - this.pointerDownPos.y;
    if (Math.hypot(deltaX, deltaY) > 4) {
      return;
    }
    this.pickObject(event);
  };

  private handlePointerCancel = (): void => {
    this.pointerIsDown = false;
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.cityModel || !this.camera || !this.renderer || this.pointerIsDown) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.cityModel.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObject(this.cityModel, true);

    if (!intersections.length) {
      this.clearHover();
      return;
    }

    const mesh = intersections[0].object as THREE.Mesh;
    
    // Don't hover if it's the selected mesh
    if (this.selectedMesh?.uuid === mesh.uuid) {
      this.clearHover();
      return;
    }

    this.applyHover(mesh);
  };

  private pickObject(event: PointerEvent): void {
    if (!this.cityModel || !this.camera || !this.renderer) {
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.cityModel.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObject(this.cityModel, true);

    if (!intersections.length) {
      this.clearSelection();
      return;
    }

    const mesh = intersections[0].object as THREE.Mesh;
    this.applySelection(mesh);
  }

  private applySelection(mesh: THREE.Mesh): void {
    const objectId = this.findObjectId(mesh);
    if (!objectId) return;

    // Use optimized lookup
    const meshes = this.findAllMeshesByObjectId(objectId);
    this.applySelectionToMeshes(meshes, objectId, true);
  }

  private applySelectionToMeshes(meshes: THREE.Mesh[], objectId: string, emit: boolean) {
    this.clearSelection(true);
    
    meshes.forEach(m => {
       // ... (Your highlight logic: store original color, set highlight color) ...
       // Same as your original code
       const material = this.getMeshMaterial(m);
       if (material) {
          m.userData['__originalColor'] = material.color.clone();
          material.color.copy(this.highlightColor);
       }
    });

    this.selectedMesh = meshes[0];
    this.createOutlineForMeshes(meshes);

    if (emit) {
      this.objectSelected.emit(objectId);
    }
  }

  private clearSelection(silent = false): void {
    if (!this.selectedMesh) {
      if (!silent) {
        this.objectSelected.emit('');
      }
      return;
    }

    // Get the objectId and find all meshes
    const objectId = this.findObjectId(this.selectedMesh);
    if (objectId) {
      const meshesInObject = this.findAllMeshesByObjectId(objectId);
      
      // Restore original colors for all meshes in the object
      meshesInObject.forEach(mesh => {
        const material = this.getMeshMaterial(mesh);
        const originalColor = mesh.userData['__originalColor'] as THREE.Color | undefined;
        const originalEmissive = mesh.userData['__originalEmissive'] as THREE.Color | undefined;
        
        if (material && originalColor) {
          material.color.copy(originalColor);
        }
        
        if (material && originalEmissive && material.emissive) {
          material.emissive.copy(originalEmissive);
          material.emissiveIntensity = 0;
        }
      });
    }
    
    this.selectedMesh = null;
    this.removeOutline();
    
    if (!silent) {
      this.objectSelected.emit('');
    }
  }

  private applyHover(mesh: THREE.Mesh): void {
    if (this.hoveredMesh?.uuid === mesh.uuid) {
      return;
    }

    this.clearHover();

    const material = this.getMeshMaterial(mesh);
    if (!material) {
      return;
    }

    mesh.userData['__hoverOriginalColor'] = material.color.clone();
    material.color.copy(this.hoverColor);
    this.hoveredMesh = mesh;
  }

  private clearHover(): void {
    if (this.hoveredMesh) {
      const material = this.getMeshMaterial(this.hoveredMesh);
      const originalColor = this.hoveredMesh.userData['__hoverOriginalColor'] as THREE.Color | undefined;
      
      if (material && originalColor) {
        material.color.copy(originalColor);
      }
      
      this.hoveredMesh = null;
    }
  }

  private createOutlineForMeshes(meshes: THREE.Mesh[]): void {
    this.removeOutline();

    meshes.forEach(mesh => {
      const geometry = mesh.geometry;
      if (!geometry) {
        return;
      }

      // Create edges geometry for outline
      const edges = new THREE.EdgesGeometry(geometry, 15); // threshold angle in degrees
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0xffffff,
        linewidth: 2,
        transparent: true,
        opacity: 0.8
      });
      
      const outlineMesh = new THREE.LineSegments(edges, lineMaterial);
      
      // Copy transform from the mesh
      outlineMesh.position.copy(mesh.position);
      outlineMesh.rotation.copy(mesh.rotation);
      outlineMesh.scale.copy(mesh.scale);
      
      // Add to parent so it moves with the mesh
      if (mesh.parent) {
        mesh.parent.add(outlineMesh);
      } else {
        this.scene.add(outlineMesh);
      }
      
      this.outlineMeshes.push(outlineMesh);
    });
  }

  private removeOutline(): void {
    this.outlineMeshes.forEach(outlineMesh => {
      if (outlineMesh.parent) {
        outlineMesh.parent.remove(outlineMesh);
      }
      outlineMesh.geometry.dispose();
      if (Array.isArray(outlineMesh.material)) {
        outlineMesh.material.forEach(mat => mat.dispose());
      } else {
        outlineMesh.material.dispose();
      }
    });
    this.outlineMeshes = [];
  }

  private getMeshMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial | null {
    if (Array.isArray(mesh.material)) {
      return mesh.material[0] as THREE.MeshStandardMaterial;
    }
    return mesh.material as THREE.MeshStandardMaterial | null;
  }

  private findObjectId(object: THREE.Object3D | null): string | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current.userData && typeof current.userData['objectId'] === 'string') {
        return current.userData['objectId'] as string;
      }
      current = current.parent;
    }
    return null;
  }

  private findMeshById(objectId: string): THREE.Mesh | null {
    if (!this.cityModel) {
      return null;
    }
    let target: THREE.Mesh | null = null;
    this.cityModel.traverse(obj => {
      if (target || !(obj instanceof THREE.Mesh)) {
        return;
      }
      if (obj.userData && obj.userData['objectId'] === objectId) {
        target = obj;
      }
    });
    return target;
  }

  /**
   * Find all meshes that belong to the same CityJSON object
   * This includes walls, roofs, windows, etc. that share the same objectId
   */
private findAllMeshesByObjectId(objectId: string): THREE.Mesh[] {
    // Replaces O(N) traversal with O(1) map access
    return this.meshLookup.get(objectId) || [];
  }
}
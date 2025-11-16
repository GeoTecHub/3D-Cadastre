// components/viewers/ninja-viewer/ninja-viewer.component.ts

import { isPlatformBrowser } from '@angular/common';
import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, Output, EventEmitter, Inject, PLATFORM_ID, Input } from '@angular/core';
import * as THREE from 'three';
// @ts-ignore: three/examples/jsm/... has no bundled type declarations in this project
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Subscription } from 'rxjs';

// Import both of our services
import { NinjaLoader } from 'src/app/services/ninja-loader';
import { CityjsonService } from 'src/app/services/cityjson';

@Component({
  selector: 'app-ninja-viewer',
  standalone: true,
  templateUrl: './ninja-viewer.html',
  styleUrls: ['./ninja-viewer.css']
})
export class NinjaViewer implements AfterViewInit, OnDestroy {
  @Output() objectSelected = new EventEmitter<string>();
  
  @Input() set focusObjectId(id: string | null) {
    if (!id) {
      this.clearSelection(true);
      return;
    }
    
    // Check if already selected using findObjectId
    const currentId = this.selectedMesh ? this.findObjectId(this.selectedMesh) : null;
    if (currentId === id) {
      return; // Already selected
    }
    
    const mesh = this.findMeshById(id);
    if (mesh) {
      this.applySelection(mesh, false);
    }
  }
  
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private cityModel: THREE.Group | null = null;
  private animationId: number | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private selectedMesh: THREE.Mesh | null = null;
  
  // Enhanced highlight colors
  private readonly highlightColor = new THREE.Color(0x4f46e5); // Indigo
  private readonly hoverColor = new THREE.Color(0x818cf8); // Light indigo
  
  private readonly isBrowser: boolean;
  private pointerIsDown = false;
  private pointerDownPos = new THREE.Vector2();
  
  // For hover effect
  private hoveredMesh: THREE.Mesh | null = null;
  
  // Outline for better visual feedback (now can be multiple)
  private outlineMeshes: THREE.LineSegments[] = [];
  
  private dataSubscription: Subscription | null = null;

  constructor(
    private ninjaLoader: NinjaLoader,
    private cityjsonService: CityjsonService,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) {
      return;
    }
    
    this.initScene();
    
    this.dataSubscription = this.cityjsonService.cityjsonData$.subscribe(cityjsonData => {
      if (cityjsonData) {
        this.loadModel();
      } else {
        this.clearModel();
      }
    });
  }

  ngOnDestroy(): void {
    this.dataSubscription?.unsubscribe();

    if (this.isBrowser) {
      window.removeEventListener('resize', this.handleResize);
      window.removeEventListener('pointerup', this.handlePointerUp);
      window.removeEventListener('pointercancel', this.handlePointerCancel);
      window.removeEventListener('pointermove', this.handlePointerMove);
    }
    this.renderer?.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.controls?.dispose();

    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.renderer?.dispose();
    
    // Clean up outline
    this.removeOutline();
  }

  private initScene(): void {
    if (!this.container || !this.isBrowser) {
      return;
    }

    const { width, height } = this.getContainerSize();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf6f7fb);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1_000_000);
    this.camera.position.set(30, 30, 30);
    this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio ?? 1);
    this.renderer.setSize(width, height);

    const host = this.container.nativeElement;
    host.innerHTML = '';
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.cursor = 'pointer';
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerCancel);
    window.addEventListener('pointermove', this.handlePointerMove);

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 120, 160);

    this.scene.add(ambient, dirLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    window.addEventListener('resize', this.handleResize);
    this.animate();
  }

  private clearModel(): void {
    if (this.cityModel) {
      this.scene.remove(this.cityModel);
      this.cityModel = null;
    }
    this.clearSelection(true);
    this.clearHover();
  }

  private loadModel(): void {
    this.clearModel();
    this.clearSelection(true);

    this.cityModel = this.ninjaLoader.createSceneGroup();

    if (this.cityModel) {
      this.normalizeModelScale(this.cityModel);
      this.scene.add(this.cityModel);
      this.fitCameraToModel();
    }
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

  private applySelection(mesh: THREE.Mesh, emit = true): void {
    const objectId = this.findObjectId(mesh);
    if (!objectId) {
      return;
    }

    // Find the current selected object ID (if any)
    const currentSelectedId = this.selectedMesh ? this.findObjectId(this.selectedMesh) : null;
    if (currentSelectedId === objectId) {
      return; // Same CityJSON object already selected
    }

    this.clearSelection(true);
    this.clearHover(); // Clear any hover effect

    // Find ALL meshes that belong to this CityJSON object
    const meshesInObject = this.findAllMeshesByObjectId(objectId);
    
    if (meshesInObject.length === 0) {
      return;
    }

    // Highlight all meshes belonging to this object
    meshesInObject.forEach(m => {
      const material = this.getMeshMaterial(m);
      if (!material) {
        return;
      }

      // Store original color and apply highlight
      m.userData['__originalColor'] = material.color.clone();
      m.userData['objectId'] = objectId; // Store objectId on mesh itself
      material.color.copy(this.highlightColor);
      
      // Make it slightly emissive for better visibility
      if (material.emissive) {
        m.userData['__originalEmissive'] = material.emissive.clone();
        material.emissive.copy(this.highlightColor);
        material.emissiveIntensity = 0.3;
      }
    });
    
    // Store the first mesh as reference (or you could store all meshes)
    this.selectedMesh = meshesInObject[0];
    
    // Add outlines to all meshes in the object
    this.createOutlineForMeshes(meshesInObject);
    
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
    if (!this.cityModel) {
      return [];
    }
    
    const meshes: THREE.Mesh[] = [];
    
    this.cityModel.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) {
        return;
      }
      
      // Check if this mesh or any of its parents has the matching objectId
      const meshObjectId = this.findObjectId(obj);
      if (meshObjectId === objectId) {
        meshes.push(obj);
      }
    });
    
    return meshes;
  }
}
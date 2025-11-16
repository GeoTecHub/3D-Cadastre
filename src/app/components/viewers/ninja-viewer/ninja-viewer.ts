// components/viewers/ninja-viewer/ninja-viewer.component.ts

import { isPlatformBrowser } from '@angular/common';
import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, Output, EventEmitter, Inject, PLATFORM_ID, Input } from '@angular/core';
import * as THREE from 'three';
// @ts-ignore: three/examples/jsm/... has no bundled type declarations in this project
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Subscription } from 'rxjs'; // Import Subscription

// Import both of our services
import { NinjaLoader } from 'src/app/services/ninja-loader';
import { CityjsonService } from 'src/app/services/cityjson';

// Use the correct class name

@Component({
  selector: 'app-ninja-viewer',
  standalone: true,
  templateUrl: './ninja-viewer.html',
  styleUrls: ['./ninja-viewer.css'] // Note: styleUrl -> styleUrls (for arrays)
})
export class NinjaViewer implements AfterViewInit, OnDestroy {
  // We no longer need the @Input() for cityjson
  @Output() objectSelected = new EventEmitter<string>();
  @Input() set focusObjectId(id: string | null) {
    if (!id) {
      this.clearSelection(true);
      return;
    }
    if (this.selectedMesh?.userData && this.selectedMesh.userData['objectId'] === id) {
      return;
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
  private readonly highlightColor = new THREE.Color(0x4f46e5);
  private readonly isBrowser: boolean;
  private pointerIsDown = false;
  private pointerDownPos = new THREE.Vector2();
  
  // To hold our subscription so we can unsubscribe later
  private dataSubscription: Subscription | null = null;

  // Inject both services now
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
    // 1. Initialize the 3D scene
    this.initScene();
    
    // 2. Subscribe to data changes from the service
    this.dataSubscription = this.cityjsonService.cityjsonData$.subscribe(cityjsonData => {
      // This block will run every time new data is loaded
      if (cityjsonData) {
        this.loadModel();
      } else {
        this.clearModel(); // If data is null, clear the scene
      }
    });
  }

  ngOnDestroy(): void {
    // Unsubscribe to prevent memory leaks
    this.dataSubscription?.unsubscribe();

    if (this.isBrowser) {
      window.removeEventListener('resize', this.handleResize);
      window.removeEventListener('pointerup', this.handlePointerUp);
      window.removeEventListener('pointercancel', this.handlePointerCancel);
    }
    this.renderer?.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.controls?.dispose();

    // The rest of your excellent cleanup
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.renderer?.dispose();
  }

  // initScene remains the same, it's perfect.
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
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerCancel);

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
  }

  private loadModel(): void {
    // This method is much simpler now!
    this.clearModel();
    this.clearSelection(true);

    // The loader gets data from the service by itself
    this.cityModel = this.ninjaLoader.createSceneGroup();

    if (this.cityModel) {
      this.normalizeModelScale(this.cityModel);
      this.scene.add(this.cityModel);
      this.fitCameraToModel();
    }
  }

  // fitCameraToModel remains the same, it's perfect.
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

  // animate remains the same, it's perfect.
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

    if (this.selectedMesh?.uuid === mesh.uuid) {
      return;
    }

    this.clearSelection(true);

    const material = this.getMeshMaterial(mesh);
    if (!material) {
      return;
    }

    mesh.userData['__originalColor'] = material.color.clone();
    material.color.copy(this.highlightColor);
    this.selectedMesh = mesh;
    if (emit) {
      this.objectSelected.emit(objectId);
    }
  }

  private clearSelection(silent = false): void {
    if (this.selectedMesh) {
      const material = this.getMeshMaterial(this.selectedMesh);
      const originalColor = this.selectedMesh.userData['__originalColor'] as THREE.Color | undefined;
      if (material && originalColor) {
        material.color.copy(originalColor);
      }
      this.selectedMesh = null;
    }
    if (!silent) {
      this.objectSelected.emit('');
    }
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
}

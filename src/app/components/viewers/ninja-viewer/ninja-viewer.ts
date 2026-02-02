// src/app/components/viewers/ninja-viewer/ninja-viewer.ts

import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Inject, PLATFORM_ID, input, output, effect, untracked, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { NinjaLoader } from 'src/app/services/ninja-loader';
import { CityjsonService } from 'src/app/services/cityjson';
import { Apartment } from 'src/app/services/cityjson.model';
import { GeoTransformService } from 'src/app/services/geo-transform.service';
import { OsmTileService } from 'src/app/services/osm-tile.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-ninja-viewer',
  standalone: true,
  templateUrl: './ninja-viewer.html',
  styleUrls: ['./ninja-viewer.css']
})
export class NinjaViewer implements AfterViewInit, OnDestroy {

  // Camera and scene configuration constants
  private static readonly INITIAL_CAMERA_POSITION = 30;
  private static readonly CAMERA_FOV = 45;
  private static readonly CAMERA_NEAR = 0.1;
  private static readonly CAMERA_FAR = 1_000_000;
  private static readonly MODEL_MIN_COMFORT_SIZE = 60;
  private static readonly MODEL_MAX_COMFORT_SIZE = 800;
  private static readonly CAMERA_DISTANCE_MULTIPLIER = 1.6;
  private static readonly CLICK_THRESHOLD = 4; // pixels

  // 1. State flags
  isApartmentCreationMode = false;

  // 2. Temporary storage for the rooms the user is currently clicking
  currentRoomSelection: string[] = [];

  // 3. Persistent Registry: Maps "Apartment 101" -> ["room_id_1", "room_id_2"]
  private apartmentRegistry = new Map<string, string[]>();

  // 4. Reverse Lookup: Maps "room_id_1" -> "Apartment 101" (for easier selection later)
  private roomToApartmentMap = new Map<string, string>();

  // --- MODERN SIGNALS ---
  focusObjectId = input<string | null>(null);
  showOsmMap = input<boolean>(false);
  objectSelected = output<string>();
  apartmentCreated = output<Apartment>();
  osmMapStatus = output<'loading' | 'loaded' | 'no-crs' | 'error'>();
  private cityjsonService = inject(CityjsonService);
  private geoTransformService = inject(GeoTransformService);
  private osmTileService = inject(OsmTileService);
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

  // OSM ground plane
  private osmGroup: THREE.Group | null = null;
  private osmLoading = false;

  // Explode view state
  private isExploded = false;
  private originalPositions = new Map<string, THREE.Vector3>();
  private static readonly EXPLODE_DISTANCE = 15;

  // 💡 NEW: Define Materials for Creation Mode
  private readonly structuralSolidMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00, // Explicit Green for Rooms
    side: THREE.DoubleSide,
    metalness: 0,
    roughness: 1
  });
  private readonly ghostRoomMaterial = new THREE.MeshStandardMaterial({
    color: 0x808080,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.1, // Very faint walls
    metalness: 0,
    roughness: 1
  });
  private readonly wireframeRoomMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
  });

  constructor(
    private ninjaLoader: NinjaLoader,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    // 1. React to Data Changes
    effect(() => {
      const data = this.cityData();
      untracked(() => {
        if (data) this.loadModel();
        else this.clearModel();
      });
    });

    // 2. React to OSM map toggle
    effect(() => {
      const show = this.showOsmMap();
      untracked(() => {
        if (show) {
          this.loadOsmGroundPlane();
        } else {
          this.removeOsmGroundPlane();
        }
      });
    });

    // 3. React to Input Selection Changes
    effect(() => {
      const id = this.focusObjectId();
      untracked(() => {
        if (!id) {
          this.clearSelection(true);
        } else {
          const currentId = this.selectedMesh ? this.findObjectId(this.selectedMesh) : null;
          if (currentId !== id) {
            const meshes = this.findAllMeshesByObjectId(id);
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
    this.renderer?.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.controls?.dispose();

    if (this.animationId) cancelAnimationFrame(this.animationId);

    this.clearModel();

    // Dispose class-level materials
    this.structuralSolidMaterial.dispose();
    this.ghostRoomMaterial.dispose();
    this.wireframeRoomMaterial.dispose();
    this.highlightMaterial.dispose();

    this.renderer?.dispose();
  }

  private initScene(): void {
    if (!this.container) return;

    const { width, height } = this.getContainerSize();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf6f7fb);

    this.camera = new THREE.PerspectiveCamera(
      NinjaViewer.CAMERA_FOV,
      width / height,
      NinjaViewer.CAMERA_NEAR,
      NinjaViewer.CAMERA_FAR
    );
    const pos = NinjaViewer.INITIAL_CAMERA_POSITION;
    this.camera.position.set(pos, pos, pos);
    this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio ?? 1);

    this.container.nativeElement.appendChild(this.renderer.domElement);

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
      this.scene.remove(this.cityModel);
      this.cityModel = null;
    }
    this.meshLookup.clear();
    this.removeOsmGroundPlane();
    this.clearSelection(true);
    this.clearHover();
  }

  private loadModel(): void {
    this.clearModel();
    this.cityModel = this.ninjaLoader.createSceneGroup({ colorBySemantic: true });

    if (this.cityModel) {
      this.buildLookupMap(this.cityModel);
      this.normalizeModelScale(this.cityModel);
      this.scene.add(this.cityModel);
      this.fitCameraToModel();
      this.refreshModelMaterials();
    }
  }

  /**
   * Updates material visibility based on apartment creation mode.
   * In creation mode: rooms are solid green, walls are ghosted.
   */
  private refreshModelMaterials(): void {
    if (!this.cityModel) return;

    const isCreationMode = this.isApartmentCreationMode;

    this.clearSelection(true);

    this.cityModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const userData = child.userData || {};
        const cityObjType = userData['cityObjectType'];
        const attributes = userData['attributes'] || {};
        const ifcType = attributes['ifc_type'];

        // Determine if this mesh represents a room (calculated once)
        const isRoom = cityObjType === 'BuildingRoom' || cityObjType === 'Room' || ifcType === 'IfcSpace';

        // Restore original material first
        if (userData['__originalMaterial']) {
          child.material = userData['__originalMaterial'];
          delete userData['__originalMaterial'];
        }

        if (isCreationMode) {
          if (!userData['__originalMaterial']) {
            userData['__originalMaterial'] = child.material;
          }

          // Apply appropriate material based on object type
          child.material = isRoom ? this.structuralSolidMaterial : this.ghostRoomMaterial;
        }

        // Ensure opacity is correct
        const material = this.getMeshMaterial(child);
        if (material) {
          material.opacity = isCreationMode ? (isRoom ? 1.0 : 0.1) : 1.0;
        }
      }
    });

    // Re-apply wireframe to currently selected items
    if (isCreationMode) {
      this.currentRoomSelection.forEach(roomId => {
        const meshes = this.findAllMeshesByObjectId(roomId);
        meshes.forEach(mesh => {
          mesh.material = this.wireframeRoomMaterial;
        });
      });
    }
  }

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
    if (!this.cityModel || !this.camera || !this.controls) return;

    const box = new THREE.Box3().setFromObject(this.cityModel);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const distance = maxDim * NinjaViewer.CAMERA_DISTANCE_MULTIPLIER;
    const minDistance = Math.max(maxDim * 0.005, 0.02);

    this.camera.position.copy(center).add(new THREE.Vector3(distance, distance, distance));
    this.camera.near = Math.max(minDistance / 20, 0.005);
    this.camera.far = Math.max(distance * 50, 5000);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.maxDistance = distance * 15;
    this.controls.minDistance = minDistance;
    this.controls.update();
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    if (!this.renderer || !this.scene || !this.camera) return;
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  };

  private getContainerSize(): { width: number; height: number } {
    const element = this.container.nativeElement;
    const fallbackWidth = this.isBrowser ? window.innerWidth : 800;
    const fallbackHeight = this.isBrowser ? window.innerHeight : 600;
    const width = element.clientWidth || element.parentElement?.clientWidth || fallbackWidth;
    const height = element.clientHeight || element.parentElement?.clientHeight || fallbackHeight;
    return { width: Math.max(width ?? 0, 200), height: Math.max(height ?? 0, 200) };
  }

  private handleResize = (): void => {
    if (!this.isBrowser || !this.renderer || !this.camera) return;
    const { width, height } = this.getContainerSize();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private normalizeModelScale(group: THREE.Group): number {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return 1;

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    let scale = 1;

    if (maxDim < NinjaViewer.MODEL_MIN_COMFORT_SIZE) {
      scale = NinjaViewer.MODEL_MIN_COMFORT_SIZE / Math.max(maxDim, 1e-3);
    } else if (maxDim > NinjaViewer.MODEL_MAX_COMFORT_SIZE) {
      scale = NinjaViewer.MODEL_MAX_COMFORT_SIZE / maxDim;
    }

    if (scale !== 1) {
      group.scale.setScalar(scale);
    }
    return scale;
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerIsDown = true;
    this.pointerDownPos.set(event.clientX, event.clientY);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.pointerIsDown || event.button !== 0) return;
    this.pointerIsDown = false;
    const deltaX = event.clientX - this.pointerDownPos.x;
    const deltaY = event.clientY - this.pointerDownPos.y;
    if (Math.hypot(deltaX, deltaY) > NinjaViewer.CLICK_THRESHOLD) return;
    this.pickObject(event);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.cityModel || !this.camera || !this.renderer || this.pointerIsDown) return;

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
    if (this.selectedMesh?.uuid === mesh.uuid) {
      this.clearHover();
      return;
    }
    this.applyHover(mesh);
  };

  private pickObject(event: PointerEvent): void {
    if (!this.cityModel || !this.camera || !this.renderer) return;

    // 1. Setup Raycaster
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.cityModel.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    
    // Get ALL intersections, sorted by distance (closest first)
    const intersections = this.raycaster.intersectObject(this.cityModel, true);

    if (intersections.length === 0) {
      if (!this.isApartmentCreationMode) this.clearSelection();
      return;
    }

    // 2. Find the "Right" Hit
    let targetMesh: THREE.Mesh | null = null;
    let targetId: string | null = null;

    if (this.isApartmentCreationMode) {
      // --- CREATION MODE: X-Ray Vision ---
      // Loop through hits to find the first 'Room', ignoring walls in front of it.
      const roomHit = intersections.find(hit => {
        const mesh = hit.object as THREE.Mesh;
        const type = mesh.userData['cityObjectType'];
        return type === 'Room' || type === 'BuildingRoom';
      });

      if (roomHit) {
        targetMesh = roomHit.object as THREE.Mesh;
        targetId = this.findObjectId(targetMesh);
      }

    } else {
      // --- NORMAL MODE: Standard Selection ---
      // Just take the very first thing we hit (Wall, Roof, etc.)
      targetMesh = intersections[0].object as THREE.Mesh;
      targetId = this.findObjectId(targetMesh);
    }

    // 3. Process the Selection
    if (!targetMesh || !targetId) {
      // We hit something, but it wasn't a valid target for the current mode
      return; 
    }

    if (this.isApartmentCreationMode) {
      this.toggleRoomSelection(targetMesh, targetId);
    } else {
      // Normal behavior logic
      const apartmentId = this.roomToApartmentMap.get(targetId);
      if (apartmentId) {
        this.selectApartmentGroup(apartmentId);
      } else {
        this.applySelection(targetMesh);
      }
    }
  }

  private selectApartmentGroup(groupId: string) {
    this.clearSelection(true);
    const roomIds = this.apartmentRegistry.get(groupId);
    if (!roomIds) return;

    const allMeshes: THREE.Mesh[] = [];
    roomIds.forEach(id => {
      const meshes = this.findAllMeshesByObjectId(id);
      allMeshes.push(...meshes);
    });

    allMeshes.forEach(mesh => {
      const material = this.getMeshMaterial(mesh);
      if (material) {
        if (!mesh.userData['__originalColor']) {
          mesh.userData['__originalColor'] = material.color.clone();
        }
        material.color.setHex(0xffaa00);
        material.opacity = 0.8;
      }
    });

    this.createOutlineForMeshes(allMeshes);
    this.objectSelected.emit(groupId);
  }

  private applySelection(mesh: THREE.Mesh): void {
    const objectId = this.findObjectId(mesh);
    if (!objectId) return;
    const meshes = this.findAllMeshesByObjectId(objectId);
    this.applySelectionToMeshes(meshes, objectId, true);
  }

  private applySelectionToMeshes(meshes: THREE.Mesh[], objectId: string, emit: boolean) {
    this.clearSelection(true);
    meshes.forEach(m => {
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
      if (!silent) this.objectSelected.emit('');
      return;
    }
    const objectId = this.findObjectId(this.selectedMesh);
    if (objectId) {
      const meshesInObject = this.findAllMeshesByObjectId(objectId);
      meshesInObject.forEach(mesh => {
        const material = this.getMeshMaterial(mesh);
        const originalColor = mesh.userData['__originalColor'] as THREE.Color | undefined;
        if (material && originalColor) {
          material.color.copy(originalColor);
        }
      });
    }
    this.selectedMesh = null;
    this.removeOutline();
    if (!silent) this.objectSelected.emit('');
  }

  private applyHover(mesh: THREE.Mesh): void {
    if (this.hoveredMesh?.uuid === mesh.uuid) return;
    this.clearHover();
    const material = this.getMeshMaterial(mesh);
    if (!material) return;
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
      if (!geometry) return;
      const edges = new THREE.EdgesGeometry(geometry, 80);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 2,
        transparent: true,
        opacity: 0.8
      });
      const outlineMesh = new THREE.LineSegments(edges, lineMaterial);
      outlineMesh.position.copy(mesh.position);
      outlineMesh.rotation.copy(mesh.rotation);
      outlineMesh.scale.copy(mesh.scale);
      if (mesh.parent) mesh.parent.add(outlineMesh);
      else this.scene.add(outlineMesh);
      this.outlineMeshes.push(outlineMesh);
    });
  }

  private removeOutline(): void {
    this.outlineMeshes.forEach(outlineMesh => {
      if (outlineMesh.parent) outlineMesh.parent.remove(outlineMesh);
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

  private findAllMeshesByObjectId(objectId: string): THREE.Mesh[] {
    return this.meshLookup.get(objectId) || [];
  }

  private toggleRoomSelection(mesh: THREE.Mesh, objectId: string) {
    const index = this.currentRoomSelection.indexOf(objectId);
    const meshes = this.findAllMeshesByObjectId(objectId);

    if (index > -1) {
      // Deselect
      this.currentRoomSelection.splice(index, 1);
      meshes.forEach(m => {
        m.material = this.structuralSolidMaterial; // Revert to solid green (not ghost)
      });
    } else {
      // Select
      this.currentRoomSelection.push(objectId);
      meshes.forEach(m => {
        m.material = this.wireframeRoomMaterial;
      });
    }
  }

  // --- ACTIONS ---

  public startApartmentCreationMode() {
    this.isApartmentCreationMode = true;
    this.currentRoomSelection = [];
    this.clearSelection(true);
    this.refreshModelMaterials();
  }

  public commitApartmentCreation(newApartmentId: string) {
    const trimmedId = newApartmentId?.trim();

    if (!trimmedId) {
      console.warn("Apartment ID cannot be empty!");
      return;
    }

    if (this.apartmentRegistry.has(trimmedId)) {
      console.warn(`Apartment "${trimmedId}" already exists!`);
      return;
    }

    if (this.currentRoomSelection.length === 0) {
      console.warn("No rooms selected!");
      return;
    }

    const rooms = [...this.currentRoomSelection];
    this.apartmentRegistry.set(trimmedId, rooms);
    rooms.forEach(roomId => {
      this.roomToApartmentMap.set(roomId, trimmedId);
    });

    // Emit apartment data so the parent can save it to the backend
    this.apartmentCreated.emit({ apartment_id: trimmedId, rooms });

    // Reset State
    this.currentRoomSelection = [];
    this.isApartmentCreationMode = false;
    this.clearSelection(true);
    this.refreshModelMaterials();
  }

  public cancelCreationMode() {
    this.isApartmentCreationMode = false;
    this.currentRoomSelection = [];
    this.clearSelection(true);
    this.refreshModelMaterials();
  }

  public getCurrentRoomSelection(): string[] {
    return [...this.currentRoomSelection];
  }

  // ─── OSM Ground Plane ─────────────────────────────────────

  private async loadOsmGroundPlane(): Promise<void> {
    if (this.osmLoading || this.osmGroup) return;

    const data = this.cityData();
    if (!data || !this.cityModel) {
      this.osmMapStatus.emit('no-crs');
      return;
    }

    const extent = await this.geoTransformService.getGeoExtent(data);
    if (!extent) {
      this.osmMapStatus.emit('no-crs');
      return;
    }

    this.osmLoading = true;
    this.osmMapStatus.emit('loading');

    try {
      // Calculate the building's bounding box in scene coordinates
      const box = new THREE.Box3().setFromObject(this.cityModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, 1);

      // Place the ground plane at the bottom of the building
      const groundCenter = new THREE.Vector3(center.x, center.y, box.min.z);

      const result = await this.osmTileService.createGroundPlane(
        extent,
        groundCenter,
        maxDim
      );

      if (result && this.showOsmMap()) {
        this.osmGroup = result.group;
        this.scene.add(this.osmGroup);
        this.osmMapStatus.emit('loaded');
      } else if (!result) {
        this.osmMapStatus.emit('error');
      }
    } catch (err) {
      console.warn('Failed to load OSM ground plane:', err);
      this.osmMapStatus.emit('error');
    } finally {
      this.osmLoading = false;
    }
  }

  private removeOsmGroundPlane(): void {
    if (!this.osmGroup) return;

    // Dispose all tile textures and geometries
    this.osmGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const mat = child.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    });

    this.scene.remove(this.osmGroup);
    this.osmGroup = null;
  }

  // ─── Highlight Rooms (for unit-click in panel) ─────────────

  private readonly highlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffaa00,  // Orange highlight
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    metalness: 0,
    roughness: 0.8
  });

  private highlightedRoomIds: string[] = [];

  /**
   * Highlights specific rooms in the 3D viewer when a unit card is clicked.
   * Restores previous highlights before applying new ones.
   */
  public highlightRoomIds(roomIds: string[]): void {
    // Restore previously highlighted rooms
    this.clearRoomHighlights();

    if (!roomIds.length || !this.cityModel) return;

    this.highlightedRoomIds = [...roomIds];

    roomIds.forEach(roomId => {
      const meshes = this.findAllMeshesByObjectId(roomId);
      meshes.forEach(mesh => {
        if (!mesh.userData['__highlightOriginalMaterial']) {
          mesh.userData['__highlightOriginalMaterial'] = mesh.material;
        }
        mesh.material = this.highlightMaterial;
      });
    });

    // Create outline around all highlighted meshes
    const allMeshes: THREE.Mesh[] = [];
    roomIds.forEach(id => {
      allMeshes.push(...this.findAllMeshesByObjectId(id));
    });
    this.createOutlineForMeshes(allMeshes);
  }

  private clearRoomHighlights(): void {
    if (!this.highlightedRoomIds.length) return;

    this.highlightedRoomIds.forEach(roomId => {
      const meshes = this.findAllMeshesByObjectId(roomId);
      meshes.forEach(mesh => {
        const original = mesh.userData['__highlightOriginalMaterial'];
        if (original) {
          mesh.material = original;
          delete mesh.userData['__highlightOriginalMaterial'];
        }
      });
    });
    this.highlightedRoomIds = [];
    this.removeOutline();
  }

  // ─── Explode View ───────────────────────────────────────────

  public toggleExplodeView(): void {
    if (this.isExploded) {
      this.collapseView();
    } else {
      this.explodeView();
    }
  }

  public get isExplodeViewActive(): boolean {
    return this.isExploded;
  }

  private explodeView(): void {
    if (!this.cityModel || this.isExploded) return;

    // Calculate center of the model
    const box = new THREE.Box3().setFromObject(this.cityModel);
    const center = box.getCenter(new THREE.Vector3());

    // Store original positions and explode meshes
    this.cityModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const objectId = child.userData['objectId'];
        if (!objectId) return;

        // Store original position if not already stored
        if (!this.originalPositions.has(child.uuid)) {
          this.originalPositions.set(child.uuid, child.position.clone());
        }

        // Calculate direction from center to mesh
        const meshCenter = new THREE.Vector3();
        child.geometry.computeBoundingBox();
        child.geometry.boundingBox?.getCenter(meshCenter);
        child.localToWorld(meshCenter);

        const direction = meshCenter.sub(center).normalize();

        // Determine explosion distance based on object type
        const cityObjType = child.userData['cityObjectType'];
        let distance = NinjaViewer.EXPLODE_DISTANCE;

        // Rooms/BuildingRooms explode more
        if (cityObjType === 'BuildingRoom' || cityObjType === 'Room') {
          distance *= 1.5;
        }
        // Walls explode less
        else if (cityObjType === 'WallSurface') {
          distance *= 0.8;
        }
        // Roof explodes upward more
        else if (cityObjType === 'RoofSurface') {
          direction.set(0, 0, 1); // Explode upward
          distance *= 2;
        }
        // Ground stays in place
        else if (cityObjType === 'GroundSurface') {
          distance = 0;
        }

        // Animate the explosion using simple transition
        const targetPosition = child.position.clone().add(direction.multiplyScalar(distance));
        this.animateToPosition(child, targetPosition);
      }
    });

    this.isExploded = true;
  }

  private collapseView(): void {
    if (!this.cityModel || !this.isExploded) return;

    // Restore original positions
    this.cityModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const originalPos = this.originalPositions.get(child.uuid);
        if (originalPos) {
          this.animateToPosition(child, originalPos);
        }
      }
    });

    this.isExploded = false;
  }

  private animateToPosition(mesh: THREE.Mesh, targetPosition: THREE.Vector3): void {
    const startPosition = mesh.position.clone();
    const duration = 500; // ms
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      mesh.position.lerpVectors(startPosition, targetPosition, eased);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }
}
// src/app/components/viewers/ninja-viewer/ninja-viewer.ts

import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Inject, PLATFORM_ID, input, output, effect, untracked, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import proj4 from 'proj4';

import { NinjaLoader } from 'src/app/services/ninja-loader';
import { CityjsonService } from 'src/app/services/cityjson';
import { Apartment } from 'src/app/services/cityjson.model';
import { GeoTransformService, GeoExtent } from 'src/app/services/geo-transform.service';
import { OsmTileService } from 'src/app/services/osm-tile.service';
import { ParcelLayerService, ParcelFeatureCollection, ParcelMeshData, ParcelLayerResult } from 'src/app/services/parcel-layer.service';
import { CadastralPolygonService, CadastralFeatureCollection, CadastralLayerResult, CadastralPolygonData } from 'src/app/services/cadastral-polygon.service';
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
  parcelsData = input<ParcelFeatureCollection | null>(null);
  parcelsEpsg = input<number>(4326); // Default to WGS84 (InfoBhoomi uses WGS84)
  objectSelected = output<string>();
  apartmentCreated = output<Apartment>();
  osmMapStatus = output<'loading' | 'loaded' | 'no-crs' | 'error'>();
  parcelSelected = output<string>();
  private cityjsonService = inject(CityjsonService);
  private geoTransformService = inject(GeoTransformService);
  private osmTileService = inject(OsmTileService);
  private parcelLayerService = inject(ParcelLayerService);
  private cadastralPolygonService = inject(CadastralPolygonService);
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

  // Parcel layer (old triangulated mesh approach)
  private parcelLayerResult: ParcelLayerResult | null = null;
  private selectedParcelId: string | null = null;
  private parcelGroundZ = 0;

  // Cadastral polygon layer (new clean polygon approach)
  private cadastralLayerResult: CadastralLayerResult | null = null;
  private selectedCadastralId: string | null = null;
  private useCadastralPolygons = true; // Use new approach by default

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

    // 3. React to parcels data changes - use new cadastral polygon approach
    effect(() => {
      const parcels = this.parcelsData();
      untracked(() => {
        if (parcels && parcels.features.length > 0) {
          if (this.useCadastralPolygons) {
            this.loadCadastralPolygons();
          } else {
            this.loadParcelLayer();
          }
        } else {
          this.removeCadastralPolygons();
          this.removeParcelLayer();
        }
      });
    });

    // 4. React to Input Selection Changes
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
    this.removeParcelLayer();
    this.removeCadastralPolygons();
    this.clearSelection(true);
    this.clearHover();
  }

  private loadModel(): void {
    this.clearModel();
    this.cityModel = this.ninjaLoader.createSceneGroup({ colorBySemantic: true });

    if (this.cityModel) {
      this.buildLookupMap(this.cityModel);
      this.normalizeModelScale(this.cityModel);
      // TEMPORARILY DISABLED: Don't add building to scene so we can see parcels
      // this.scene.add(this.cityModel);
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
    if (!this.camera || !this.renderer) return;

    // 1. Setup Raycaster
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // 2. Check cadastral polygon layer first (new approach)
    if (this.cadastralLayerResult) {
      const cadastralHit = this.pickCadastralPolygon();
      if (cadastralHit) {
        this.highlightCadastralById(cadastralHit);
        this.parcelSelected.emit(cadastralHit);
        return;
      }
    }

    // 2b. Check old parcel layer (legacy approach)
    if (this.parcelLayerResult) {
      const parcelHit = this.pickParcel();
      if (parcelHit) {
        this.highlightParcelById(parcelHit);
        this.parcelSelected.emit(parcelHit);
        return;
      }
    }

    // 3. Check city model
    if (!this.cityModel) return;

    this.cityModel.updateWorldMatrix(true, true);

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

  // ─── Parcel Layer ───────────────────────────────────────────

  /**
   * Calculate geographic extent from parcel GeoJSON features.
   * Handles Polygon, MultiPolygon, Point, and LineString geometry types.
   * Transforms coordinates from source EPSG to WGS84 for proper extent calculation.
   */
  private calculateParcelExtent(parcels: ParcelFeatureCollection): GeoExtent | null {
    const srcEpsg = this.parcelsEpsg();
    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    // Transform coordinate from source EPSG to WGS84 before updating bounds
    const updateBounds = (x: number, y: number) => {
      if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
        return;
      }

      let lon: number, lat: number;

      if (srcEpsg === 4326) {
        // Already WGS84
        lon = x;
        lat = y;
      } else {
        // Transform from source EPSG to WGS84
        try {
          const result = proj4(`EPSG:${srcEpsg}`, 'EPSG:4326', [x, y]) as [number, number];
          lon = result[0];
          lat = result[1];
        } catch (err) {
          console.warn('Failed to transform coordinate:', [x, y], 'from EPSG:', srcEpsg, err);
          return;
        }
      }

      // Validate result is valid lon/lat
      if (!isFinite(lon) || !isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        return;
      }

      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    };

    for (const feature of parcels.features) {
      const geom = feature.geometry;
      if (!geom || !geom.coordinates) continue;

      switch (geom.type) {
        case 'Point': {
          // Point: coordinates = [x, y]
          const coords = geom.coordinates as number[];
          if (Array.isArray(coords) && coords.length >= 2) {
            updateBounds(coords[0], coords[1]);
          }
          break;
        }
        case 'LineString': {
          // LineString: coordinates = [[x, y], [x, y], ...]
          const coords = geom.coordinates as number[][];
          if (Array.isArray(coords)) {
            for (const coord of coords) {
              if (Array.isArray(coord) && coord.length >= 2) {
                updateBounds(coord[0], coord[1]);
              }
            }
          }
          break;
        }
        case 'Polygon': {
          // Polygon: coordinates = [[[x, y], ...], ...] (array of rings)
          const rings = geom.coordinates as number[][][];
          if (Array.isArray(rings)) {
            for (const ring of rings) {
              if (Array.isArray(ring)) {
                for (const coord of ring) {
                  if (Array.isArray(coord) && coord.length >= 2) {
                    updateBounds(coord[0], coord[1]);
                  }
                }
              }
            }
          }
          break;
        }
        case 'MultiPolygon': {
          // MultiPolygon: coordinates = [[[[x, y], ...], ...], ...]
          const polygons = geom.coordinates as number[][][][];
          if (Array.isArray(polygons)) {
            for (const polygon of polygons) {
              if (Array.isArray(polygon)) {
                for (const ring of polygon) {
                  if (Array.isArray(ring)) {
                    for (const coord of ring) {
                      if (Array.isArray(coord) && coord.length >= 2) {
                        updateBounds(coord[0], coord[1]);
                      }
                    }
                  }
                }
              }
            }
          }
          break;
        }
        default:
          // Skip unsupported geometry types
          console.warn(`Unsupported geometry type: ${geom.type}`);
      }
    }

    if (!isFinite(minLon) || !isFinite(maxLon) || !isFinite(minLat) || !isFinite(maxLat)) {
      console.warn('calculateParcelExtent: No valid coordinates found after transformation from EPSG:', srcEpsg);
      return null;
    }

    console.info('calculateParcelExtent: Computed WGS84 extent from EPSG:', srcEpsg, {
      minLon, maxLon, minLat, maxLat,
      centerLon: (minLon + maxLon) / 2,
      centerLat: (minLat + maxLat) / 2
    });

    return {
      centerLon: (minLon + maxLon) / 2,
      centerLat: (minLat + maxLat) / 2,
      minLon,
      maxLon,
      minLat,
      maxLat,
      epsg: srcEpsg,
      crsExplicit: true
    };
  }

  private async loadParcelLayer(): Promise<void> {
    const parcels = this.parcelsData();
    if (!parcels || !this.cityModel) return;

    // Remove existing layer first
    this.removeParcelLayer();

    try {
      // Ensure the parcel CRS is registered in proj4 BEFORE calculating extent
      // (needed for coordinate transformation in calculateParcelExtent)
      await this.geoTransformService.ensureCrsDefined(this.parcelsEpsg());

      // Calculate extent from actual parcel data (not from building)
      const parcelExtent = this.calculateParcelExtent(parcels);
      if (!parcelExtent) {
        console.warn('Cannot load parcel layer: no valid parcel extent');
        return;
      }

      // Get building scene parameters for positioning
      const box = new THREE.Box3().setFromObject(this.cityModel);
      const buildingSceneCenter = box.getCenter(new THREE.Vector3());
      const buildingSize = box.getSize(new THREE.Vector3());
      const buildingMaxDim = Math.max(buildingSize.x, buildingSize.y, 1);

      // Position parcels at the building's ground level
      this.parcelGroundZ = box.min.z + 0.1;

      // Calculate parcel extent in Web Mercator for sizing
      const [minMX, minMY] = this.geoTransform.lonLatToWebMercator(parcelExtent.minLon, parcelExtent.minLat);
      const [maxMX, maxMY] = this.geoTransform.lonLatToWebMercator(parcelExtent.maxLon, parcelExtent.maxLat);
      const parcelWidthMeters = Math.abs(maxMX - minMX);
      const parcelHeightMeters = Math.abs(maxMY - minMY);
      const parcelMaxDimMeters = Math.max(parcelWidthMeters, parcelHeightMeters, 1);

      let sceneCenter: THREE.Vector3;
      let sceneToMeterRatio: number = 1; // Default to 1:1 scale

      // Get building's geo location (using existing CityJSON metadata)
      const cityJsonData = this.cityData();
      const buildingGeoExtent = cityJsonData ? await this.geoTransformService.getGeoExtent(cityJsonData) : null;

      if (buildingGeoExtent) {
        // --- GEOREFERENCED MODE: Use real geographic offset ---

        // Convert both building and parcel extent centers to Web Mercator
        const [bX, bY] = this.geoTransform.lonLatToWebMercator(buildingGeoExtent.centerLon, buildingGeoExtent.centerLat);
        const [pX, pY] = this.geoTransform.lonLatToWebMercator(parcelExtent.centerLon, parcelExtent.centerLat);

        // Calculate the real-world offset in meters
        const offsetX = pX - bX;
        const offsetY = pY - bY;

        // Apply offset to the scene center
        sceneCenter = new THREE.Vector3(
          buildingSceneCenter.x + offsetX,
          buildingSceneCenter.y + offsetY,
          this.parcelGroundZ
        );

        // Use real-world scale (1 unit = 1 meter)
        sceneToMeterRatio = 1;

        console.info('Parcel layer: Using georeferenced positioning', {
          buildingGeoCenter: [buildingGeoExtent.centerLon, buildingGeoExtent.centerLat],
          parcelGeoCenter: [parcelExtent.centerLon, parcelExtent.centerLat],
          offsetMeters: [offsetX, offsetY],
          sceneToMeterRatio
        });
      } else {
        // --- FALLBACK MODE: Building not georeferenced, use heuristic centering ---
        console.warn('Building not georeferenced, using fallback centering for parcel layer.');

        // Scale parcels to fit around building (2x building size)
        const targetSceneSize = buildingMaxDim * 2;
        sceneToMeterRatio = targetSceneSize / parcelMaxDimMeters;

        // Center parcels on building
        sceneCenter = new THREE.Vector3(buildingSceneCenter.x, buildingSceneCenter.y, this.parcelGroundZ);
      }

      console.info('Parcel layer params:', {
        sceneCenter: sceneCenter.toArray(),
        sceneToMeterRatio,
        parcelMaxDimMeters,
        buildingMaxDim,
        parcelsEpsg: this.parcelsEpsg(),
        parcelExtent: {
          minLon: parcelExtent.minLon,
          maxLon: parcelExtent.maxLon,
          minLat: parcelExtent.minLat,
          maxLat: parcelExtent.maxLat,
          centerLon: parcelExtent.centerLon,
          centerLat: parcelExtent.centerLat
        }
      });

      // Use parcel extent for the reference point (not building extent)
      this.parcelLayerResult = this.parcelLayerService.createParcelLayer(
        parcels,
        this.parcelsEpsg(),
        parcelExtent,  // Use parcel extent, not building extent
        sceneCenter,
        sceneToMeterRatio,
        this.parcelGroundZ
      );

      if (this.parcelLayerResult) {
        this.scene.add(this.parcelLayerResult.group);
        console.info(`Parcel layer loaded: ${this.parcelLayerResult.parcels.length} parcels`);

        // Log first parcel position for debugging
        if (this.parcelLayerResult.parcels.length > 0) {
          const firstParcel = this.parcelLayerResult.parcels[0];
          const pos = firstParcel.fillMesh.geometry.getAttribute('position');
          if (pos && pos.count > 0) {
            console.info('First parcel vertex:', pos.getX(0), pos.getY(0), pos.getZ(0));
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load parcel layer:', err);
    }
  }

  private removeParcelLayer(): void {
    if (!this.parcelLayerResult) return;

    this.parcelLayerService.disposeParcelLayer(this.parcelLayerResult);
    this.scene.remove(this.parcelLayerResult.group);
    this.parcelLayerResult = null;
    this.selectedParcelId = null;
  }

  // ─── Cadastral Polygon Layer (New Clean Approach) ───────────────

  /**
   * Load cadastral polygons using the new CadastralPolygonService.
   *
   * This approach displays parcel boundaries as EXACT legal polygons,
   * without any mesh triangulation that could distort boundaries.
   * Polygons are rendered directly on top of OSM tiles.
   *
   * Supports two modes:
   * 1. Standalone: Parcels displayed centered at origin with OSM background
   * 2. With Building: Parcels positioned using REAL geographic offset from building
   *
   * IMPORTANT: When a building is georeferenced, we calculate the exact offset
   * between the building's geographic center and the parcels' geographic center,
   * then apply that offset in scene coordinates. This preserves the true spatial
   * relationship between the building and land parcels.
   */
  private async loadCadastralPolygons(): Promise<void> {
    const parcels = this.parcelsData();
    if (!parcels || parcels.features.length === 0) return;

    // Remove existing layers
    this.removeCadastralPolygons();
    this.removeParcelLayer();

    try {
      // Convert to cadastral feature collection
      const cadastralParcels = parcels as unknown as CadastralFeatureCollection;

      // Calculate extent from parcel data
      const extent = this.cadastralPolygonService.calculateExtent(cadastralParcels);
      if (!extent) {
        console.warn('Cannot load cadastral polygons: no valid extent');
        return;
      }

      // Calculate parcel dimensions in meters (for fallback scaling)
      const [minMX, minMY] = this.geoTransform.lonLatToWebMercator(extent.minLon, extent.minLat);
      const [maxMX, maxMY] = this.geoTransform.lonLatToWebMercator(extent.maxLon, extent.maxLat);
      const parcelWidthMeters = Math.abs(maxMX - minMX);
      const parcelHeightMeters = Math.abs(maxMY - minMY);
      const parcelMaxDimMeters = Math.max(parcelWidthMeters, parcelHeightMeters, 1);

      let sceneCenter: THREE.Vector3;
      let sceneScale: number = 1; // Default to 1:1 scale (1 unit = 1 meter)
      let elevationAboveGround: number;

      // Check if we have a building model loaded
      if (this.cityModel) {
        // 1. Get the building's reference point (center of the model in scene coords)
        const box = new THREE.Box3().setFromObject(this.cityModel);
        const buildingSceneCenter = box.getCenter(new THREE.Vector3());
        const buildingSize = box.getSize(new THREE.Vector3());
        const buildingMaxDim = Math.max(buildingSize.x, buildingSize.y, 1);

        // 2. Get building's geo location (using existing CityJSON metadata)
        const cityJsonData = this.cityData();
        const buildingGeoExtent = cityJsonData ? await this.geoTransformService.getGeoExtent(cityJsonData) : null;

        if (buildingGeoExtent) {
          // --- GEOREFERENCED MODE: Use real geographic offset ---

          // 3. Convert both building and parcel extent centers to Web Mercator
          const [bX, bY] = this.geoTransform.lonLatToWebMercator(buildingGeoExtent.centerLon, buildingGeoExtent.centerLat);
          const [pX, pY] = this.geoTransform.lonLatToWebMercator(extent.centerLon, extent.centerLat);

          // 4. Calculate the real-world offset in meters
          const offsetX = pX - bX;
          const offsetY = pY - bY;

          // 5. Apply offset to the scene center
          // The scene uses the same coordinate system orientation as CityJSON (X=east, Y=north)
          sceneCenter = new THREE.Vector3(
            buildingSceneCenter.x + offsetX,
            buildingSceneCenter.y + offsetY,
            box.min.z
          );

          // 6. Use real-world scale (1 unit = 1 meter)
          // This assumes the CityJSON viewer uses 1 unit = 1 meter (standard for CityJSON/Three.js)
          sceneScale = 1;

          console.info('Cadastral polygons: Using georeferenced positioning', {
            buildingGeoCenter: [buildingGeoExtent.centerLon, buildingGeoExtent.centerLat],
            parcelGeoCenter: [extent.centerLon, extent.centerLat],
            offsetMeters: [offsetX, offsetY],
            sceneScale
          });
        } else {
          // --- FALLBACK MODE: Building not georeferenced, use heuristic centering ---
          console.warn('Building not georeferenced, using fallback centering.');

          // Scale parcels to fit around building (2x building size)
          const targetSceneSize = buildingMaxDim * 2;
          sceneScale = targetSceneSize / parcelMaxDimMeters;

          // Center parcels on building
          sceneCenter = new THREE.Vector3(buildingSceneCenter.x, buildingSceneCenter.y, box.min.z);
        }

        // Elevation: just above building ground level
        elevationAboveGround = box.min.z + 0.2;
      } else {
        // Mode: Standalone parcel viewing (no building)
        const targetSceneSize = 200; // Scene units
        sceneScale = targetSceneSize / parcelMaxDimMeters;
        sceneCenter = new THREE.Vector3(0, 0, 0);
        elevationAboveGround = 0.1;  // Low elevation above OSM ground
      }

      console.info('Loading cadastral polygons:', {
        mode: this.cityModel ? 'overlay' : 'standalone',
        parcelCount: cadastralParcels.features.length,
        extent: {
          center: [extent.centerLon, extent.centerLat],
          size: [parcelWidthMeters, parcelHeightMeters]
        },
        sceneScale,
        elevationAboveGround
      });

      // Create the cadastral layer
      this.cadastralLayerResult = this.cadastralPolygonService.createCadastralLayer(
        cadastralParcels,
        {
          showFills: true,
          fillOpacity: 0.5,
          boundaryWidth: 3,
          elevationAboveGround
        },
        {
          extent,
          sceneCenter,
          sceneScale
        }
      );

      if (this.cadastralLayerResult) {
        this.scene.add(this.cadastralLayerResult.group);
        console.info(`Cadastral layer loaded: ${this.cadastralLayerResult.polygons.length} polygons`);

        // Fit camera to show all parcels (only in standalone mode)
        if (!this.cityModel) {
          this.fitCameraToCadastralLayer();
        }

        // Load OSM tiles as ground plane under the parcels
        await this.loadOsmForCadastralExtent(extent, sceneCenter, sceneScale);
      }
    } catch (err) {
      console.error('Failed to load cadastral polygons:', err);
    }
  }

  /**
   * Fit camera to show all cadastral polygons.
   */
  private fitCameraToCadastralLayer(): void {
    if (!this.cadastralLayerResult || !this.camera || !this.controls) return;

    const box = new THREE.Box3().setFromObject(this.cadastralLayerResult.group);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const distance = maxDim * 1.5;

    // Position camera looking down at parcels (bird's eye view)
    this.camera.position.set(center.x, center.y - distance * 0.3, distance);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.maxDistance = distance * 10;
    this.controls.minDistance = maxDim * 0.1;
    this.controls.update();
  }

  /**
   * Load OSM ground tiles for the cadastral extent.
   */
  private async loadOsmForCadastralExtent(
    extent: GeoExtent,
    sceneCenter: THREE.Vector3,
    sceneScale: number
  ): Promise<void> {
    // Remove existing OSM
    this.removeOsmGroundPlane();

    try {
      // Calculate the scene size in meters for OSM tile sizing
      const [minMX, minMY] = this.geoTransform.lonLatToWebMercator(extent.minLon, extent.minLat);
      const [maxMX, maxMY] = this.geoTransform.lonLatToWebMercator(extent.maxLon, extent.maxLat);
      const extentWidthMeters = Math.abs(maxMX - minMX);
      const extentHeightMeters = Math.abs(maxMY - minMY);
      const sceneSizeFactor = Math.max(extentWidthMeters, extentHeightMeters) * sceneScale;

      const result = await this.osmTileService.createGroundPlane(
        extent,
        sceneCenter,
        sceneSizeFactor,
        { zOffset: -0.5 }  // Well below cadastral polygons to prevent z-fighting
      );

      if (result) {
        this.osmGroup = result.group;
        this.scene.add(this.osmGroup);
        this.osmMapStatus.emit('loaded');
      }
    } catch (err) {
      console.warn('Failed to load OSM for cadastral extent:', err);
      this.osmMapStatus.emit('error');
    }
  }

  /**
   * Remove cadastral polygon layer.
   */
  private removeCadastralPolygons(): void {
    if (!this.cadastralLayerResult) return;

    this.cadastralPolygonService.disposeCadastralLayer(this.cadastralLayerResult);
    this.scene.remove(this.cadastralLayerResult.group);
    this.cadastralLayerResult = null;
    this.selectedCadastralId = null;
  }

  /**
   * Highlight a cadastral polygon by ID.
   */
  public highlightCadastralById(parcelId: string | null): void {
    if (!this.cadastralLayerResult) return;

    // Clear previous highlight
    if (this.selectedCadastralId) {
      const prevPolygon = this.cadastralLayerResult.polygons.find(
        p => p.parcelId === this.selectedCadastralId
      );
      if (prevPolygon) {
        this.cadastralPolygonService.highlightPolygon(prevPolygon, false);
      }
    }

    this.selectedCadastralId = parcelId;

    // Apply new highlight
    if (parcelId) {
      const polygonData = this.cadastralLayerResult.polygons.find(p => p.parcelId === parcelId);
      if (polygonData) {
        this.cadastralPolygonService.highlightPolygon(polygonData, true);
      }
    }
  }

  /**
   * Pick cadastral polygon at click position.
   */
  private pickCadastralPolygon(): string | null {
    if (!this.cadastralLayerResult) return null;

    const intersections = this.raycaster.intersectObject(this.cadastralLayerResult.group, true);
    if (intersections.length === 0) return null;

    for (const hit of intersections) {
      const userData = hit.object.userData;
      if (userData?.['type'] === 'cadastral-fill' && userData?.['parcelId']) {
        return userData['parcelId'];
      }
    }

    return null;
  }

  /**
   * Highlight a specific parcel by ID (called from outside).
   */
  public highlightParcelById(parcelId: string | null): void {
    if (!this.parcelLayerResult) return;

    // Clear previous highlight
    if (this.selectedParcelId) {
      const prevMesh = this.parcelLayerResult.parcels.find(p => p.parcelId === this.selectedParcelId);
      if (prevMesh) {
        this.parcelLayerService.highlightParcel(prevMesh, false);
      }
    }

    this.selectedParcelId = parcelId;

    // Apply new highlight
    if (parcelId) {
      const meshData = this.parcelLayerResult.parcels.find(p => p.parcelId === parcelId);
      if (meshData) {
        this.parcelLayerService.highlightParcel(meshData, true);
      }
    }
  }

  private get geoTransform(): GeoTransformService {
    return this.geoTransformService;
  }

  /**
   * Check if raycaster hits a parcel polygon. Returns parcelId or null.
   */
  private pickParcel(): string | null {
    if (!this.parcelLayerResult) return null;

    const intersections = this.raycaster.intersectObject(this.parcelLayerResult.group, true);
    if (intersections.length === 0) return null;

    // Find the first hit that's a parcel fill mesh
    for (const hit of intersections) {
      const userData = hit.object.userData;
      if (userData?.['type'] === 'parcel-fill' && userData?.['parcelId']) {
        return userData['parcelId'];
      }
    }

    return null;
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
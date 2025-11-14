import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  EventEmitter,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import earcut from 'earcut';
import {
  ImportIFC,
  CityJSON,
  CityJSONObject,
  IfcImportResult,
  IfcObjectSummary,
} from '../../services/import-ifc';

interface ObjectEditorState extends IfcObjectSummary {
  include: boolean;
  attributesText: string;
  parsedAttributes: Record<string, unknown>;
  parseError: string | null;
}

@Component({
  selector: 'app-itowns-viewer',
  imports: [CommonModule, FormsModule],
  templateUrl: './itowns-viewer.html',
  styleUrl: './itowns-viewer.css',
})
export class ItownsViewer implements AfterViewInit, OnChanges, OnDestroy {
  @Input() cityjson: CityJSON | null = null;
  @Output() cityjsonChange = new EventEmitter<CityJSON>();
  @ViewChild('viewerContainer', { static: true })
  viewerContainer!: ElementRef<HTMLDivElement>;

  // Add these fields
  private objectMeshes: Map<string, THREE.Mesh[]> = new Map();
  private originalMatsByObject: Map<string, THREE.Material[]> = new Map();
  private selectedObjectId: string | null = null;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private buildingGroup!: THREE.Group;
  private animationId: number | null = null;
  private initialized = false;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private selectedMesh: THREE.Mesh | null = null;
  private originalMaterial: THREE.Material | null = null;
  private meshMap: Map<THREE.Mesh, { objectId: string; surfaceType: string }> = new Map();

  selectedInfo: { objectId: string; surfaceType: string; position: string } | null = null;
  isImporting = false;
  importError: string | null = null;
  importStatusText: string | null = null;
  inspectorOpen = false;
  inspectorError: string | null = null;
  pendingImport: IfcImportResult | null = null;
  editedCityjson: CityJSON | null = null;
  objectEditors: ObjectEditorState[] = [];
  metadataText = '{}';
  metadataError: string | null = null;
  parsedMetadata: Record<string, unknown> = {};
  inspectorSelectedObjectId: string | null = null;
  activeImportTab: 'ifc' | 'cityjson' = 'ifc';

  private SURFACE_COLORS: Record<string, number> = {
    GroundSurface: 0xdddddd,
    WallSurface: 0xbbbbbb,
    RoofSurface: 0xff5555,
  };
  private DEFAULT_COLOR = 0xcccccc;

  constructor(private importIfc: ImportIFC) { }

  ngAfterViewInit(): void {
    this.initialized = true;
    if (this.cityjson) {
      this.initScene();
    }
  }

  get selectedInspectorObject(): ObjectEditorState | null {
    if (!this.inspectorSelectedObjectId) return null;
    return (
      this.objectEditors.find(
        (editor) => editor.objectId === this.inspectorSelectedObjectId
      ) ?? null
    );
  }

  selectImportTab(tab: 'ifc' | 'cityjson') {
    if (this.activeImportTab === tab) {
      return;
    }
    this.activeImportTab = tab;
    this.importError = null;
    this.importStatusText = null;
  }

  onIncludeToggle(editor: ObjectEditorState) {
    editor.include = !!editor.include;
    this.inspectorError = null;
  }

  selectInspectorObject(objectId: string) {
    this.inspectorSelectedObjectId = objectId;
  }

  get inspectorHasBlockingErrors(): boolean {
    return (
      !!this.metadataError ||
      this.objectEditors.some((editor) => !!editor.parseError)
    );
  }

  onAttributesTextChange(editor: ObjectEditorState, text: string) {
    editor.attributesText = text;
    const { value, error } = this.safeParseRecord(text);
    editor.parseError = error;
    editor.parsedAttributes = value;
    if (!error) {
      this.inspectorError = null;
    }
  }

  onMetadataTextChange(text: string) {
    this.metadataText = text;
    const { value, error } = this.safeParseRecord(text);
    this.metadataError = error;
    this.parsedMetadata = value;
    if (!error) {
      this.inspectorError = null;
    }
  }

  finalizeInspector() {
    if (!this.editedCityjson) return;

    if (this.metadataError) {
      this.inspectorError = 'Fix metadata JSON before importing.';
      return;
    }

    const attributeError = this.objectEditors.find((editor) => !!editor.parseError);
    if (attributeError) {
      this.inspectorError = 'Fix attribute JSON for all selected objects before importing.';
      return;
    }

    const filtered: Record<string, CityJSONObject> = {};
    for (const editor of this.objectEditors) {
      if (!editor.include) continue;
      const original = this.editedCityjson.CityObjects[editor.objectId];
      if (!original) continue;
      const attributes = { ...editor.parsedAttributes };
      const name = editor.name?.trim();
      if (name) {
        attributes['name'] = name;
      } else {
        delete attributes['name'];
      }
      filtered[editor.objectId] = {
        ...original,
        attributes,
      };
    }

    if (Object.keys(filtered).length === 0) {
      this.inspectorError = 'Select at least one object to import.';
      return;
    }

    const finalCityjson: CityJSON = {
      ...this.editedCityjson,
      metadata: this.parsedMetadata,
      CityObjects: filtered,
    };

    this.cityjson = finalCityjson;
    this.cityjsonChange.emit(finalCityjson);
    this.inspectorOpen = false;
    this.pendingImport = null;
    this.objectEditors = [];
    this.editedCityjson = null;
    this.metadataText = '{}';
    this.metadataError = null;
    this.parsedMetadata = {};
    this.inspectorSelectedObjectId = null;
    this.inspectorError = null;
    this.deselectObject();
    this.selectedInfo = null;
    if (this.initialized && finalCityjson) {
      this.initScene();
    }
  }

  cancelInspector() {
    this.inspectorOpen = false;
    this.pendingImport = null;
    this.objectEditors = [];
    this.editedCityjson = null;
    this.metadataText = '{}';
    this.metadataError = null;
    this.parsedMetadata = {};
    this.inspectorSelectedObjectId = null;
    this.inspectorError = null;
  }

  trackObjectById(index: number, editor: ObjectEditorState) {
    return editor.objectId ?? index;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cityjson'] && this.cityjson && this.initialized) {
      this.initScene();
    }
  }

  ngOnDestroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.renderer) this.renderer.dispose();
    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
      this.renderer.domElement.removeEventListener('mousemove', this.onCanvasMouseMove);
    }
  }

  async onIfcFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }

    this.importError = null;
    this.isImporting = true;
    this.importStatusText = 'Converting IFC...';

    try {
      const importResult = await this.importIfc.prepareIfcImport(file);
      this.openInspector(importResult);
    } catch (error) {
      console.error('Failed to import IFC file', error);
      const message =
        error instanceof Error ? error.message : 'Unexpected error while importing IFC.';
      this.importError = `Failed to import IFC: ${message}`;
    } finally {
      this.isImporting = false;
      this.importStatusText = null;
      if (input) {
        input.value = '';
      }
    }
  }

  async onCityjsonFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }

    this.importError = null;
    this.isImporting = true;
    this.importStatusText = 'Loading CityJSON...';

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!this.looksLikeCityJSON(parsed)) {
        throw new Error('Selected file is not a valid CityJSON document.');
      }

      const cityjson = parsed as CityJSON;

      const validation = this.validateCityJSON(cityjson);
      if (!validation.valid) {
        console.warn('CityJSON validation warnings:', validation.errors);
      }

      this.cityjson = cityjson;
      this.cityjsonChange.emit(cityjson);
      this.deselectObject();
      this.selectedInfo = null;
      if (this.initialized && cityjson) {
        this.initScene();
      }
    } catch (error) {
      console.error('Failed to import CityJSON file', error);
      const message =
        error instanceof Error ? error.message : 'Unexpected error while importing CityJSON.';
      this.importError = `Failed to import CityJSON: ${message}`;
    } finally {
      this.isImporting = false;
      this.importStatusText = null;
      if (input) {
        input.value = '';
      }
    }
  }

  private openInspector(result: IfcImportResult) {
    this.pendingImport = result;
    this.editedCityjson = this.cloneCityjson(result.cityjson);

    // ✨ VALIDATE THE CITYJSON
    const validation = this.validateCityJSON(this.editedCityjson);
    if (!validation.valid) {
      console.warn('CityJSON validation warnings:', validation.errors);
      // Optionally show to user
      this.inspectorError = `Data quality issues detected:\n${validation.errors.slice(0, 3).join('\n')}${validation.errors.length > 3 ? `\n...and ${validation.errors.length - 3} more` : ''}`;
    }
    this.metadataText = JSON.stringify(this.editedCityjson.metadata ?? {}, null, 2);
    const metadataParsed = this.safeParseRecord(this.metadataText);
    this.metadataError = metadataParsed.error;
    this.parsedMetadata = metadataParsed.value;

    this.objectEditors = result.objects.map((summary) => {
      const cityObject = this.editedCityjson!.CityObjects[summary.objectId];
      const attributes = cityObject?.attributes ?? {};
      const attributesText = JSON.stringify(attributes, null, 2);
      const parsed = this.safeParseRecord(attributesText);
      const editor: ObjectEditorState = {
        ...summary,
        include: summary.include ?? true,
        name: summary.name ?? summary.objectId,
        attributesText,
        parsedAttributes: parsed.value,
        parseError: parsed.error,
      };
      return editor;
    });

    this.inspectorSelectedObjectId = this.objectEditors[0]?.objectId ?? null;
    this.inspectorError = null;
    this.inspectorOpen = true;
  }

  private cleanBoundaries(boundaries: any): any {
    if (!boundaries) return boundaries;

    // Handle nested arrays
    if (Array.isArray(boundaries[0])) {
      return boundaries.map((b: any) => this.cleanBoundaries(b)).filter((b: any) => b !== null);
    }

    // Handle ring (flat array of indices)
    if (typeof boundaries[0] === 'number') {
      const cleaned: number[] = [];
      for (let i = 0; i < boundaries.length; i++) {
        // Remove consecutive duplicates
        if (i === 0 || boundaries[i] !== boundaries[i - 1]) {
          cleaned.push(boundaries[i]);
        }
      }

      // Check for non-consecutive duplicates (creates degenerate triangles)
      const unique = new Set(cleaned);
      if (unique.size < 3) {
        console.warn('Degenerate boundary removed (< 3 unique vertices):', cleaned);
        return null;
      }

      return cleaned;
    }

    return boundaries;
  }



  private initScene() {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null as any;
    }
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    const width = this.viewerContainer.nativeElement.clientWidth || 800;
    const height = this.viewerContainer.nativeElement.clientHeight || 600;

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000000);
    this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.createCanvas(),
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(100, 100, 100);
    this.scene.add(directionalLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.15;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 10000000;
    this.controls.enablePan = true;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.6;
    this.controls.panSpeed = 0.5;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;

    this.drawCityObjects();
    this.setupEventListeners();
    this.animate();
  }

  private createCanvas(): HTMLCanvasElement {
    const existing = this.viewerContainer.nativeElement.querySelector('canvas');
    if (existing) {
      this.viewerContainer.nativeElement.removeChild(existing);
    }
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.viewerContainer.nativeElement.appendChild(canvas);
    return canvas;
  }

  private drawCityObjects() {
    this.objectMeshes.clear();
    this.originalMatsByObject.clear();
    this.selectedObjectId = null;

    const cityjson = this.cityjson;
    if (!cityjson || !cityjson.CityObjects || !cityjson.vertices) {
      console.warn('Invalid CityJSON structure:', {
        hasCityObjects: !!cityjson?.CityObjects,
        hasVertices: !!cityjson?.vertices,
        vertexCount: cityjson?.vertices?.length
      });
      return;
    }

    if (this.buildingGroup) {
      this.scene.remove(this.buildingGroup);
      this.disposeGroup(this.buildingGroup);
    }
    this.buildingGroup = new THREE.Group();
    this.meshMap.clear();

    const transform = cityjson.transform;
    const allVertices = this.getTransformedVertices(cityjson.vertices, transform);

    const vertexBox = new THREE.Box3();
    allVertices.forEach(v => vertexBox.expandByPoint(new THREE.Vector3(v[0], v[1], v[2])));
    const groupCenter = vertexBox.getCenter(new THREE.Vector3());

    Object.entries(cityjson.CityObjects).forEach(([objectId, obj]: [string, any]) => {
      if (!obj.geometry) return;

      obj.geometry.forEach((geom: any) => {
        // ✨ CLEAN BOUNDARIES BEFORE PROCESSING
        const cleanedBoundaries = this.cleanBoundaries(geom.boundaries);
        if (!cleanedBoundaries) {
          console.warn(`Skipping object ${objectId}: no valid boundaries after cleaning`);
          return;
        }

        const semantics = geom.semantics;
        const surfaces = semantics?.surfaces || [];
        const values = semantics?.values || [];
        let faceIndex = 0;

        this.traverseBoundaries(cleanedBoundaries, (ring) => {
          // Additional validation
          if (!ring || ring.length < 3) {
            console.warn(`Invalid ring in ${objectId}:`, ring);
            return;
          }

          const geometry = this.polygonToGeometry(ring, allVertices, groupCenter);

          if (geometry) {
            let color = this.DEFAULT_COLOR;
            if (values && surfaces && values[faceIndex] !== undefined) {
              const surfaceIdx = values[faceIndex];
              const type = surfaces[surfaceIdx]?.type;
              if (type && this.SURFACE_COLORS[type]) {
                color = this.SURFACE_COLORS[type];
              }
            }

            const mesh = new THREE.Mesh(
              geometry,
              new THREE.MeshStandardMaterial({
                color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.95,
              })
            );
            const surfaceType = surfaces[faceIndex]?.type || 'Default';
            this.meshMap.set(mesh, { objectId, surfaceType });

            if (!this.objectMeshes.has(objectId)) {
              this.objectMeshes.set(objectId, []);
            }
            this.objectMeshes.get(objectId)!.push(mesh);

            this.buildingGroup.add(mesh);
          }
          faceIndex++;
        });
      });
    });


    this.buildingGroup.position.set(0, 0, 0);
    this.scene.add(this.buildingGroup);

    if (!vertexBox.isEmpty()) {
      this.fitCameraToVertices(vertexBox);
    } else {
      console.warn('No valid geometry found, vertex box is empty');
    }
  }

  private validateCityJSON(cityjson: CityJSON): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!cityjson.type || cityjson.type !== 'CityJSON') {
      errors.push('Missing or invalid "type" field (should be "CityJSON")');
    }

    if (!cityjson.vertices || !Array.isArray(cityjson.vertices)) {
      errors.push('Missing "vertices" array');
    } else if (cityjson.vertices.length === 0) {
      errors.push('Empty "vertices" array');
    }

 // ✨ FIXED: Check for degenerate triangles (excluding the closing vertex)
  if (cityjson.CityObjects) {
    Object.entries(cityjson.CityObjects).forEach(([id, obj]: [string, any]) => {
      obj.geometry?.forEach((geom: any, gIdx: number) => {
        this.traverseBoundaries(geom.boundaries, (ring) => {
          // For closed rings, check uniqueness without the last vertex
          const vertices = ring.length > 0 && ring[0] === ring[ring.length - 1]
            ? ring.slice(0, -1)  // Exclude closing vertex
            : ring;
          
          const unique = new Set(vertices);
          
          // Check for duplicates in the ring (excluding closing vertex)
          if (unique.size < vertices.length) {
            errors.push(
              `Object "${id}" has duplicate vertex indices in geometry[${gIdx}]: ${JSON.stringify(ring)}`
            );
          }
          
          // Check for degenerate triangles (need at least 3 unique vertices)
          if (unique.size < 3) {
            errors.push(
              `Object "${id}" has degenerate triangle (< 3 unique vertices) in geometry[${gIdx}]`
            );
          }
        });
      });
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

  private polygonToGeometry(
    indices: number[],
    vertices: number[][],
    groupCenter: THREE.Vector3
  ): THREE.BufferGeometry | null {
    if (!Array.isArray(indices) || indices.length < 3) {
      console.warn('Invalid polygon: insufficient vertices', indices);
      return null;
    }

    const maxIndex = vertices.length - 1;
    const invalidIndices = indices.filter((idx) => idx < 0 || idx > maxIndex);
    if (invalidIndices.length > 0) {
      console.error('Invalid vertex indices:', invalidIndices, 'max:', maxIndex);
      return null;
    }

    try {
      const points3d = indices.map((idx) => {
        const v = vertices[idx];
        if (!v || v.length < 3) {
          throw new Error(`Invalid vertex at index ${idx}`);
        }
        return [v[0] - groupCenter.x, v[1] - groupCenter.y, v[2] - groupCenter.z];
      });

      if (indices.length === 3) {
        if (this.isDegenerateTriangle(points3d)) {
          console.warn('Skipping degenerate triangle with indices:', indices);
          return null;
        }
        return this.buildGeometry(points3d, [0, 1, 2]);
      }

      const n = this.getNormal(points3d);
      let axis1 = 0;
      let axis2 = 1;
      if (Math.abs(n[2]) > Math.abs(n[0]) && Math.abs(n[2]) > Math.abs(n[1])) {
        axis1 = 0;
        axis2 = 1;
      } else if (Math.abs(n[0]) > Math.abs(n[1])) {
        axis1 = 1;
        axis2 = 2;
      } else {
        axis1 = 0;
        axis2 = 2;
      }

      const points2d = points3d.map((pt) => [pt[axis1], pt[axis2]]).flat();
      const triangles = earcut(points2d);

      if (triangles.length === 0) {
        console.warn('Earcut failed to triangulate polygon with indices:', indices);
        return null;
      }

      return this.buildGeometry(points3d, triangles);
    } catch (error) {
      console.error('Error creating geometry:', error, 'indices:', indices);
      return null;
    }
  }

  private buildGeometry(points3d: number[][], indices: number[]): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points3d.flat(), 3)
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private isDegenerateTriangle(points: number[][]): boolean {
    if (points.length < 3) {
      return true;
    }
    const a = new THREE.Vector3(...points[0]);
    const b = new THREE.Vector3(...points[1]);
    const c = new THREE.Vector3(...points[2]);
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const cross = new THREE.Vector3().crossVectors(ab, ac);
    return cross.lengthSq() < 1e-8;
  }
  private fitCameraToVertices(box: THREE.Box3) {
    const size = box.getSize(new THREE.Vector3());
    let maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim < 1) maxDim = 1;

    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = maxDim / (2 * Math.tan(fov / 2));
    const viewDir = new THREE.Vector3(1.5, -1.2, 1).normalize();
    const target = new THREE.Vector3(0, 0, 0);

    const cameraPosition = target.clone().add(viewDir.multiplyScalar(distance * 2));
    this.camera.position.copy(cameraPosition);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(target);

    this.camera.near = Math.max(distance * 0.01, 0.1);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(target);
    this.controls.minDistance = maxDim * 0.05;
    this.controls.maxDistance = maxDim * 20;
    this.controls.update();
  }

  private disposeGroup(group: THREE.Group) {
    group.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach(mat => mat.dispose());
        } else {
          material?.dispose();
        }
      }
    });
  }

  private setupEventListeners() {
    if (!this.renderer?.domElement) return;

    this.renderer.domElement.addEventListener('click', this.onCanvasClick);
    this.renderer.domElement.addEventListener('mousemove', this.onCanvasMouseMove);
  }

  private onCanvasClick = (event: MouseEvent) => {
    if (!this.renderer || !this.buildingGroup) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.buildingGroup.children, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const intersectedMesh = hit.object as THREE.Mesh;
      this.selectObjectFromMesh(intersectedMesh, hit.point);
    } else {
      this.deselectObject();
    }
  };

  private selectObjectFromMesh(mesh: THREE.Mesh, hitPoint?: THREE.Vector3) {
    const info = this.meshMap.get(mesh);
    if (!info) return;

    if (this.selectedObjectId === info.objectId) return; // already selected

    // Deselect previous selection
    this.deselectObject();

    // Prepare highlight material for all faces of this object
    const highlightMat = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0xffff00,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });

    const meshes = this.objectMeshes.get(info.objectId) || [mesh];

    // Save originals (order aligned)
    const originals: THREE.Material[] = [];
    meshes.forEach(m => {
      originals.push(m.material as THREE.Material);
      m.material = highlightMat;
    });
    this.originalMatsByObject.set(info.objectId, originals);
    this.selectedObjectId = info.objectId;

    // Update info panel; prefer the hit point if available
    const p = hitPoint ?? mesh.getWorldPosition(new THREE.Vector3());
    this.selectedInfo = {
      objectId: info.objectId,
      surfaceType: info.surfaceType, // first-hit surface
      position: `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`,
    };
  }

  private deselectObject() {
    if (!this.selectedObjectId) return;

    const meshes = this.objectMeshes.get(this.selectedObjectId) || [];
    const originals = this.originalMatsByObject.get(this.selectedObjectId) || [];
    for (let i = 0; i < meshes.length; i++) {
      if (originals[i]) meshes[i].material = originals[i];
    }
    this.originalMatsByObject.delete(this.selectedObjectId);
    this.selectedObjectId = null;
    this.selectedMesh = null;           // legacy single-mesh selection
    this.originalMaterial = null;       // legacy single-mesh selection
    this.selectedInfo = null;
  }

  private onCanvasMouseMove = (event: MouseEvent) => {
    if (!this.renderer || !this.buildingGroup) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(
      this.buildingGroup.children,
      true
    );

    this.renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
  };

  private selectMesh(mesh: THREE.Mesh) {
    if (this.selectedMesh === mesh) return;

    this.deselectMesh();

    this.selectedMesh = mesh;
    this.originalMaterial = mesh.material as THREE.Material;

    const info = this.meshMap.get(mesh);
    if (info) {
      this.selectedInfo = {
        objectId: info.objectId,
        surfaceType: info.surfaceType,
        position: `(${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)})`,
      };
    }

    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0xffff00,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });

    mesh.material = highlightMaterial;
  }

  private deselectMesh() {
    if (this.selectedMesh && this.originalMaterial) {
      this.selectedMesh.material = this.originalMaterial;
      this.selectedMesh = null;
      this.originalMaterial = null;
      this.selectedInfo = null;
    }
  }

  private traverseBoundaries(boundary: any, callback: (ring: number[]) => void) {
    if (!boundary) return;
    if (Array.isArray(boundary[0])) {
      boundary.forEach((b: any) => this.traverseBoundaries(b, callback));
    } else if (typeof boundary[0] === 'number') {
      callback(boundary);
    }
  }

  private getNormal(points: number[][]): number[] {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      nx += (current[1] - next[1]) * (current[2] + next[2]);
      ny += (current[2] - next[2]) * (current[0] + next[0]);
      nz += (current[0] - next[0]) * (current[1] + next[1]);
    }
    return [nx, ny, nz];
  }

  private getTransformedVertices(
    vertices: number[][],
    transform: any
  ): number[][] {
    if (!transform || !transform.scale || !transform.translate) return vertices;
    return vertices.map((v) => [
      v[0] * transform.scale[0] + transform.translate[0],
      v[1] * transform.scale[1] + transform.translate[1],
      v[2] * transform.scale[2] + transform.translate[2],
    ]);
  }

  private looksLikeCityJSON(candidate: unknown): candidate is CityJSON {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }
    const payload = candidate as Partial<CityJSON>;
    const hasVertices = Array.isArray(payload.vertices);
    const hasCityObjects =
      !!payload.CityObjects && typeof payload.CityObjects === 'object';
    return payload.type === 'CityJSON' && hasVertices && hasCityObjects;
  }

  private cloneCityjson(source: CityJSON): CityJSON {
    return JSON.parse(JSON.stringify(source));
  }

  private safeParseRecord(text: string): {
    value: Record<string, unknown>;
    error: string | null;
  } {
    if (!text || !text.trim()) {
      return { value: {}, error: null };
    }

    try {
      const parsed = JSON.parse(text);
      if (this.isPlainObject(parsed)) {
        return { value: parsed, error: null };
      }
      return { value: {}, error: 'Value must be a JSON object.' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid JSON.';
      return { value: {}, error: message };
    }
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    );
  }

  private animate = () => {
    if (this.renderer && this.scene && this.camera && this.controls) {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.animationId = requestAnimationFrame(this.animate);
    }
  };
}


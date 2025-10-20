import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import earcut from 'earcut';

@Component({
  selector: 'app-itowns-viewer',
  imports: [CommonModule],
  templateUrl: './itowns-viewer.html',
  styleUrl: './itowns-viewer.css',
})
export class ItownsViewer implements AfterViewInit, OnChanges, OnDestroy {
  @Input() cityjson: any;
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

  private SURFACE_COLORS: Record<string, number> = {
    GroundSurface: 0xdddddd,
    WallSurface: 0xbbbbbb,
    RoofSurface: 0xff5555,
  };
  private DEFAULT_COLOR = 0xcccccc;

  ngAfterViewInit(): void {
    this.initialized = true;
    if (this.cityjson) {
      this.initScene();
    }
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

    if (!this.cityjson || !this.cityjson.CityObjects || !this.cityjson.vertices) return;

    if (this.buildingGroup) {
      this.scene.remove(this.buildingGroup);
    }
    this.buildingGroup = new THREE.Group();
    this.meshMap.clear();

    const transform = this.cityjson.transform;
    const allVertices = this.getTransformedVertices(
      this.cityjson.vertices,
      transform
    );

    const vertexBox = new THREE.Box3();
    allVertices.forEach(v => vertexBox.expandByPoint(new THREE.Vector3(v[0], v[1], v[2])));
    const groupCenter = vertexBox.getCenter(new THREE.Vector3());
    const size = vertexBox.getSize(new THREE.Vector3());
    let maxDim = Math.max(size.x, size.y, size.z);

    console.log('Group center:', groupCenter);
    console.log('Max dim:', maxDim);

    let meshCount = 0;

    Object.entries(this.cityjson.CityObjects).forEach(([objectId, obj]: [string, any]) => {
      if (!obj.geometry) return;
      obj.geometry.forEach((geom: any) => {
        const semantics = geom.semantics;
        const surfaces = semantics?.surfaces || [];
        const values = semantics?.values || [];
        let faceIndex = 0;
        this.traverseBoundaries(geom.boundaries, (ring) => {
          const geometry = this.polygonToGeometry(ring, allVertices, groupCenter);

          if (geometry) {
            let color = this.DEFAULT_COLOR;
            if (values && surfaces && values[faceIndex] !== undefined) {
              const surfaceIdx = values[faceIndex];
              const type = surfaces[surfaceIdx]?.type;
              if (type && this.SURFACE_COLORS[type])
                color = this.SURFACE_COLORS[type];
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

            // NEW: track meshes by objectId
            if (!this.objectMeshes.has(objectId)) this.objectMeshes.set(objectId, []);
            this.objectMeshes.get(objectId)!.push(mesh);

            this.buildingGroup.add(mesh);
            meshCount++;


          }
          faceIndex++;
        });
      });
    });

    this.buildingGroup.position.set(0, 0, 0);
    this.scene.add(this.buildingGroup);

    console.log('Meshes created:', meshCount);

    this.fitCameraToVertices(vertexBox, groupCenter);
  }

  private polygonToGeometry(
    indices: number[],
    vertices: number[][],
    groupCenter: THREE.Vector3
  ): THREE.BufferGeometry | null {
    if (!Array.isArray(indices) || indices.length < 3) return null;
    const points3d = indices.map((idx) => {
      const v = vertices[idx];
      return [
        v[0] - groupCenter.x,
        v[1] - groupCenter.y,
        v[2] - groupCenter.z
      ];
    });

    const n = this.getNormal(points3d);
    let axis1 = 0, axis2 = 1;
    if (Math.abs(n[2]) > Math.abs(n[0]) && Math.abs(n[2]) > Math.abs(n[1])) {
      axis1 = 0; axis2 = 1;
    } else if (Math.abs(n[0]) > Math.abs(n[1])) {
      axis1 = 1; axis2 = 2;
    } else {
      axis1 = 0; axis2 = 2;
    }
    const points2d = points3d.map(pt => [pt[axis1], pt[axis2]]).flat();
    const triangles = earcut(points2d);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points3d.flat(), 3));
    geometry.setIndex(triangles);
    geometry.computeVertexNormals();
    return geometry;
  }

  private fitCameraToVertices(box: THREE.Box3, center: THREE.Vector3) {
    const size = box.getSize(new THREE.Vector3());
    let maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim < 1) maxDim = 1;

    const cameraDistance = maxDim * 2;

    this.camera.position.set(
      0 - cameraDistance,
      0 + cameraDistance,
      0 + cameraDistance
    );
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);

    this.controls.minDistance = maxDim * 0.1;
    this.controls.maxDistance = maxDim * 10;
    this.controls.update();

    console.log("Box size:", size, "maxDim:", maxDim, "CameraDistance:", cameraDistance);
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

  private animate = () => {
    if (this.renderer && this.scene && this.camera && this.controls) {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.animationId = requestAnimationFrame(this.animate);
    }
  };
}
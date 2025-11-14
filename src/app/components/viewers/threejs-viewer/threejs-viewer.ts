import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import * as THREE from 'three';
import earcut from 'earcut';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';


@Component({
  selector: 'app-threejs-viewer',
  imports: [],
  templateUrl: './threejs-viewer.html',
  styleUrl: './threejs-viewer.css'
})
export class ThreejsViewer implements OnChanges, OnDestroy, AfterViewInit {
  @Input() cityjson: any;
  @ViewChild('rendererCanvas', { static: true })
  rendererCanvas!: ElementRef<HTMLCanvasElement>;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private cityGroup!: THREE.Group;
  private animationId: number | null = null;
  private initialized = false;
  private cameraFitted = false;
  SURFACE_COLORS: Record<string, number> = {
    GroundSurface: 0xdddddd,
    WallSurface: 0xbbbbbb,
    RoofSurface: 0xff0000,
  };
  DEFAULT_COLOR = 0xcccccc;

  ngAfterViewInit() {
    this.initialized = true;
    if (this.cityjson) {
      this.initScene();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    console.log('chng');
    if (this.cityjson && this.initialized) {
      this.initScene();
    }
  }

  ngOnDestroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.renderer) this.renderer.dispose();
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
    this.cameraFitted = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    const width = this.rendererCanvas.nativeElement.clientWidth || 800;
    const height = this.rendererCanvas.nativeElement.clientHeight || 600;
    this.camera = new THREE.PerspectiveCamera(
      45,
      width / height,
      0.1,
      10000000
    );

    this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.rendererCanvas.nativeElement,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(width, height);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
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
    this.controls.maxPolarAngle = Math.PI / 2;

    this.drawCityObjects();

    this.animate();
  }

  private drawCityObjects() {
    if (!this.cityjson || !this.cityjson.CityObjects || !this.cityjson.vertices)
      return;

    if (this.cityGroup) {
      this.scene.remove(this.cityGroup);
    }
    this.cityGroup = new THREE.Group();

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

    // Decide your minimum visual size
    const minModelSize = 3;
    const maxModelSize = 50; // never scale up beyond this!
    let scaleFactor = 1;
    if (maxDim < minModelSize) scaleFactor = minModelSize / maxDim;
    if (maxDim > maxModelSize) scaleFactor = maxModelSize / maxDim;

    const allMeshVertices: number[][] = [];
    let meshCount = 0;

    Object.values(this.cityjson.CityObjects).forEach((obj: any) => {
      if (!obj.geometry) return;
      obj.geometry.forEach((geom: any) => {
        const semantics = geom.semantics;
        const surfaces = semantics?.surfaces || [];
        const values = semantics?.values || [];
        let faceIndex = 0;
        this.traverseBoundaries(geom.boundaries, (ring) => {
          const geometry = this.polygonToGeometry(ring, allVertices, groupCenter, scaleFactor);

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
              new THREE.MeshLambertMaterial({
                color,
                side: THREE.DoubleSide,
              })
            );
            this.cityGroup.add(mesh);
            meshCount++;
            const attr = geometry.getAttribute('position');
            for (let i = 0; i < attr.count; i++) {
              allMeshVertices.push([attr.getX(i), attr.getY(i), attr.getZ(i)]);
            }
          }
          faceIndex++;
        });
      });
    });

    this.cityGroup.position.set(0, 0, 0);
    this.scene.add(this.cityGroup);

    // const testCube = new THREE.Mesh(
    //   new THREE.BoxGeometry(10, 10, 10),
    //   new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true })
    // );
    // testCube.position.set(0, 0, 0);
    // this.scene.add(testCube);

    if (!this.cameraFitted && meshCount > 0) {
      this.fitCameraToVertices(vertexBox, groupCenter);
      this.cameraFitted = true;
    }
  }

  private polygonToGeometry(
    indices: number[],
    vertices: number[][],
    groupCenter: THREE.Vector3,
    scaleFactor: number // <-- new param!
  ): THREE.BufferGeometry | null {
    if (!Array.isArray(indices) || indices.length < 3) return null;
    const points3d = indices.map((idx) => {
      const v = vertices[idx];
      return [
        (v[0] - groupCenter.x) * scaleFactor,
        (v[1] - groupCenter.y) * scaleFactor,
        (v[2] - groupCenter.z) * scaleFactor
      ];
    });
    // ... rest stays the same ...
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

    // If model is very tiny, force a "display scale" for comfortable viewing
    if (maxDim < 1) maxDim = 1; // or use 10 if you want a bigger model

    const cameraDistance = maxDim * 2;

    this.camera.position.set(
      0 - cameraDistance,
      0 + cameraDistance,
      0 + cameraDistance
    );
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);

    // Set orbit controls to match scale
    this.controls.minDistance = maxDim * 0.1;  // allow zooming in close
    this.controls.maxDistance = maxDim * 10;   // but not infinitely far
    this.controls.update();

    // Debug
    console.log("Box size:", size, "maxDim:", maxDim, "CameraDistance:", cameraDistance);
    console.log("Camera pos after fit:", this.camera.position);
  }


  private traverseBoundaries(
    boundary: any,
    callback: (ring: number[]) => void
  ) {
    if (!boundary) return;
    if (Array.isArray(boundary[0])) {
      boundary.forEach((b: any) => this.traverseBoundaries(b, callback));
    } else if (typeof boundary[0] === 'number') {
      callback(boundary);
    }
  }

  private getNormal(points: number[][]): number[] {
    let nx = 0,
      ny = 0,
      nz = 0;
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
      if (!document.body.contains(this.renderer.domElement)) {
        console.warn('Canvas is not in DOM!');
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.animationId = requestAnimationFrame(this.animate);
    }
  };
}



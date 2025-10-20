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
import * as THREE from 'three';
import * as itowns from 'itowns';
import earcut from 'earcut';

type Extent = any;
type PlanarView = any;

@Component({
  selector: 'app-itowns-viewer',
  imports: [],
  templateUrl: './itowns-viewer.html',
  styleUrl: './itowns-viewer.css',
})
export class ItownsViewer implements AfterViewInit, OnChanges, OnDestroy {
  @Input() cityjson: any;
  @ViewChild('viewerContainer', { static: true })
  viewerContainer!: ElementRef<HTMLDivElement>;

  private view: PlanarView | null = null;
  private buildingGroup: THREE.Group | null = null;
  private initialized = false;
  private ambientLight: THREE.AmbientLight | null = null;
  private directionalLight: THREE.DirectionalLight | null = null;

  ngAfterViewInit(): void {
    this.initialized = true;
    if (this.cityjson) {
      this.initView();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cityjson'] && this.cityjson && this.initialized) {
      this.initView();
    }
  }

  ngOnDestroy(): void {
    this.disposeView();
  }

  private initView() {
    if (!this.cityjson || !this.viewerContainer?.nativeElement) {
      return;
    }

    const container = this.viewerContainer.nativeElement;
    const extent = this.computeExtent(this.cityjson);

    if (!this.view) {
      this.view = new (itowns as any).PlanarView(
        container,
        extent,
        { controls: { enableTilt: true } }
      );
    }

    this.ensureLights();

    this.updateCityLayer();
  }

  private updateCityLayer() {
    if (!this.view || !this.cityjson) {
      return;
    }

    if (this.buildingGroup) {
      this.view.scene.remove(this.buildingGroup);
      this.buildingGroup = null;
    }

    const { group, center, maxRadius } = this.buildCityGroup(this.cityjson);
    this.buildingGroup = group;
    this.view.scene.add(group);
    this.configureCamera(maxRadius);
    this.positionCamera(center, maxRadius);

    this.view.notifyChange(this);
  }

  private configureCamera(maxRadius: number) {
    if (!this.view) {
      return;
    }
    const camera =
      (this.view as any).camera3D ??
      (this.view as any).camera ??
      (this.view as any)?.camera?.camera3D;
    if (camera) {
      const minNear = 1e-4;
      const near = Math.max(minNear, maxRadius / 500 || minNear);
      const far = Math.max(near * 1000, maxRadius * 100 || 10);
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  private positionCamera(center: [number, number, number], maxRadius: number) {
    if (!this.view) {
      return;
    }
    const camera =
      (this.view as any).camera3D ??
      (this.view as any).camera ??
      (this.view as any)?.camera?.camera3D;
    const CameraUtils = (itowns as any)?.CameraUtils;
    if (!camera || !CameraUtils?.transformCameraToLookAtTarget) {
      return;
    }
    const coord = new (itowns as any).Coordinates(
      'EPSG:4326',
      center[0],
      center[1],
      center[2]
    );
    const placement = {
      coord,
      range: Math.max(maxRadius * 6, 20),
      tilt: 45,
      heading: 0,
    };
    CameraUtils.transformCameraToLookAtTarget(this.view, camera, placement);
    const controls = (this.view as any).controls;
    controls?.update?.(0, false);
  }

  private computeExtent(cityjson: any): Extent {
    const metadataExtent = cityjson?.metadata?.geographicalExtent;
    if (Array.isArray(metadataExtent) && metadataExtent.length >= 5) {
      return new (itowns as any).Extent(
        'EPSG:4326',
        metadataExtent[0],
        metadataExtent[3],
        metadataExtent[1],
        metadataExtent[4]
      );
    }

    const vertices = this.getTransformedVertices(
      cityjson?.vertices || [],
      cityjson?.transform
    );

    if (vertices.length === 0) {
      return new (itowns as any).Extent('EPSG:4326', -10, 10, -10, 10);
    }

    const xs = vertices.map((v) => v[0]);
    const ys = vertices.map((v) => v[1]);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return new (itowns as any).Extent('EPSG:4326', minX, maxX, minY, maxY);
  }

  private buildCityGroup(cityjson: any): {
    group: THREE.Group;
    center: [number, number, number];
    maxRadius: number;
  } {
    const vertices = this.getTransformedVertices(
      cityjson.vertices || [],
      cityjson.transform
    );

    const vertexVectors = vertices.map(
      (v) => new THREE.Vector3(v[0], v[1], v[2] || 0)
    );

    const boundingBox = vertexVectors.length
      ? new THREE.Box3().setFromPoints(vertexVectors)
      : new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const centerVec = boundingBox.getCenter(new THREE.Vector3());
    const maxRadius = boundingBox.getSize(new THREE.Vector3()).length() / 2 || 1;

    const group = new THREE.Group();
    group.position.copy(centerVec);

    const colors = this.surfaceColors();

    const cityObjects = cityjson.CityObjects || {};
    for (const [objectId, cityObj] of Object.entries<any>(cityObjects)) {
      if (!Array.isArray(cityObj.geometry)) continue;

      for (const geometry of cityObj.geometry) {
        if (!geometry || !geometry.boundaries) continue;

        const semantics = geometry.semantics;
        let surfaceIndex = 0;
        this.traverseBoundaries(geometry.boundaries, (ring: number[]) => {
          const geometry3d = this.polygonToGeometry(
            ring,
            vertices,
            centerVec
          );
          if (!geometry3d) return;

          const surfaceType =
            semantics?.surfaces?.[surfaceIndex]?.type || 'Default';

          const material = new THREE.MeshStandardMaterial({
            color: colors[surfaceType] ?? colors['Default'],
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
          });

          const mesh = new THREE.Mesh(geometry3d, material);
          mesh.name = `${objectId}_${surfaceIndex}`;
          group.add(mesh);
          surfaceIndex += 1;
        });
      }
    }

    return {
      group,
      center: [centerVec.x, centerVec.y, centerVec.z],
      maxRadius,
    };
  }

  private polygonToGeometry(
    indices: number[],
    vertices: number[][],
    center: THREE.Vector3
  ): THREE.BufferGeometry | null {
    if (!Array.isArray(indices) || indices.length < 3) return null;

    const points3d = indices.map((idx) => {
      const v = vertices[idx];
      return new THREE.Vector3(
        (v?.[0] ?? 0) - center.x,
        (v?.[1] ?? 0) - center.y,
        (v?.[2] ?? 0) - center.z
      );
    });

    const normal = this.computeNormal(points3d);
    const dominant = this.dominantAxes(normal);

    const projected = points3d.map((pt) => [
      pt.getComponent(dominant[0]),
      pt.getComponent(dominant[1]),
    ]);
    const flatPoints = projected.flat();

    const triangles = earcut(flatPoints);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        points3d.flatMap((p) => p.toArray()),
        3
      )
    );
    geometry.setIndex(triangles);
    geometry.computeVertexNormals();
    return geometry;
  }

  private computeNormal(points: THREE.Vector3[]): THREE.Vector3 {
    const normal = new THREE.Vector3();
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      normal.x += (current.y - next.y) * (current.z + next.z);
      normal.y += (current.z - next.z) * (current.x + next.x);
      normal.z += (current.x - next.x) * (current.y + next.y);
    }
    return normal.normalize();
  }

  private dominantAxes(normal: THREE.Vector3): [number, number] {
    const absNormal = normal.clone().set(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
    if (absNormal.z >= absNormal.x && absNormal.z >= absNormal.y) {
      return [0, 1];
    }
    if (absNormal.x >= absNormal.y && absNormal.x >= absNormal.z) {
      return [1, 2];
    }
    return [0, 2];
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

  private surfaceColors(): Record<string, number> {
    return {
      GroundSurface: 0xdddddd,
      WallSurface: 0xbbbbbb,
      RoofSurface: 0xff5555,
      Default: 0xcccccc,
    };
  }

  private getTransformedVertices(vertices: number[][], transform: any) {
    if (!Array.isArray(vertices)) {
      return [];
    }
    if (!transform?.scale || !transform?.translate) {
      return vertices.map((v) => [(v?.[0] ?? 0), (v?.[1] ?? 0), v?.[2] ?? 0]);
    }

    return vertices.map((v) => [
      v[0] * transform.scale[0] + transform.translate[0],
      v[1] * transform.scale[1] + transform.translate[1],
      (v[2] ?? 0) * transform.scale[2] + transform.translate[2],
    ]);
  }

  private disposeView() {
    if (this.view) {
      if (this.buildingGroup) {
        this.view.scene.remove(this.buildingGroup);
        this.buildingGroup = null;
      }
      if (this.ambientLight) {
        this.view.scene.remove(this.ambientLight);
        this.ambientLight = null;
      }
      if (this.directionalLight) {
        this.view.scene.remove(this.directionalLight);
        this.directionalLight = null;
      }

      if (typeof this.view.dispose === 'function') {
        this.view.dispose();
      }
    }
    this.view = null;
  }

  private ensureLights() {
    if (!this.view) {
      return;
    }
    if (!this.ambientLight) {
      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      this.view.scene.add(this.ambientLight);
    }
    if (!this.directionalLight) {
      this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      this.directionalLight.position.set(0.3, 0.3, 1).normalize();
      this.view.scene.add(this.directionalLight);
    }
  }
}

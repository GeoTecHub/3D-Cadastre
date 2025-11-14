// components/viewers/ninja-viewer/ninja-viewer.component.ts
import {
  Component,
  Input,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  OnDestroy,
  Output,
  EventEmitter
} from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { CityJSON } from '../../../services/cityjson.service';
import { NinjaLoaderService } from '../../../services/ninja-loader.service';

@Component({
  selector: 'app-ninja-viewer',
  imports: [],
  templateUrl: './ninja-viewer.html',
  styleUrl: './ninja-viewer.css'
})
export class NinjaViewer implements AfterViewInit, OnChanges, OnDestroy {
  @Input() cityjson: CityJSON | null = null;
  @Output() objectSelected = new EventEmitter<string>();
  
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private cityModel?: THREE.Group;
  private animationId: number | null = null;

  constructor(private ninjaLoader: NinjaLoaderService) {}

  ngAfterViewInit(): void {
    this.initScene();
    if (this.cityjson) {
      this.loadModel();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cityjson'] && !changes['cityjson'].firstChange && this.cityjson) {
      this.loadModel();
    }
  }

  ngOnDestroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.renderer?.dispose();
  }

  private initScene(): void {
    const width = this.container.nativeElement.clientWidth || 800;
    const height = this.container.nativeElement.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.001, 100000);
    this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.nativeElement.appendChild(this.renderer.domElement);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 1, 1);
    this.scene.add(dirLight);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    this.animate();
  }

  private loadModel(): void {
    if (!this.cityjson) return;

    // Remove old model
    if (this.cityModel) {
      this.scene.remove(this.cityModel);
      this.cityModel = undefined;
    }

    // Load with Ninja
    this.cityModel = this.ninjaLoader.loadCityJSON(this.cityjson, this.scene);
    this.scene.add(this.cityModel);

    // Fit camera
    this.fitCameraToModel();
  }

  private fitCameraToModel(): void {
    if (!this.cityModel) return;

    const box = new THREE.Box3().setFromObject(this.cityModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const distance = maxDim / (2 * Math.tan(fov / 2));

    this.camera.position.set(
      center.x + distance,
      center.y + distance,
      center.z + distance
    );
    this.camera.lookAt(center);
    this.controls.target.copy(center);
    this.controls.update();
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}

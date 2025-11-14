import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThreejsViewer } from './threejs-viewer';

describe('ThreejsViewer', () => {
  let component: ThreejsViewer;
  let fixture: ComponentFixture<ThreejsViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThreejsViewer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ThreejsViewer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

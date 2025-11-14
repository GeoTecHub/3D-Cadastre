import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NinjaViewer } from './ninja-viewer';

describe('NinjaViewer', () => {
  let component: NinjaViewer;
  let fixture: ComponentFixture<NinjaViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NinjaViewer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NinjaViewer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

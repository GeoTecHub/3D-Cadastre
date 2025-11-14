import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ItownsViewer } from './itowns-viewer';

describe('ItownsViewer', () => {
  let component: ItownsViewer;
  let fixture: ComponentFixture<ItownsViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItownsViewer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ItownsViewer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewerContainer } from './viewer-container';

describe('ViewerContainer', () => {
  let component: ViewerContainer;
  let fixture: ComponentFixture<ViewerContainer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewerContainer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewerContainer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

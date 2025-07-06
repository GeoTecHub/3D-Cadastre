import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CityobjectsTree } from './cityobjects-tree';

describe('CityobjectsTree', () => {
  let component: CityobjectsTree;
  let fixture: ComponentFixture<CityobjectsTree>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CityobjectsTree]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CityobjectsTree);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

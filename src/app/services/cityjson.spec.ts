import { TestBed } from '@angular/core/testing';

import { Cityjson } from './cityjson';

describe('Cityjson', () => {
  let service: Cityjson;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Cityjson);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

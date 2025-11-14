import { TestBed } from '@angular/core/testing';

import { ImportIFC } from './import-ifc';

describe('ImportIFC', () => {
  let service: ImportIFC;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ImportIFC);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

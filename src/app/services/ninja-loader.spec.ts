import { TestBed } from '@angular/core/testing';

import { NinjaLoader } from './ninja-loader';

describe('NinjaLoader', () => {
  let service: NinjaLoader;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NinjaLoader);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

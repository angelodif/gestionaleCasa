import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FsLoginDialogComponent } from './fs-login-dialog.component';

describe('FsLoginDialogComponent', () => {
  let component: FsLoginDialogComponent;
  let fixture: ComponentFixture<FsLoginDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FsLoginDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(FsLoginDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

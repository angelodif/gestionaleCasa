import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UnifiedCalendarComponent } from './unified-calendar.component';

describe('UnifiedCalendarComponent', () => {
  let component: UnifiedCalendarComponent;
  let fixture: ComponentFixture<UnifiedCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UnifiedCalendarComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(UnifiedCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

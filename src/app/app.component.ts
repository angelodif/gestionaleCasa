import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { NotificationService } from './services/notification/notification.service';
import { take } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, MatProgressBarModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'gestionaleCasa';
  isAuthLoading = true;
  private auth = inject(Auth);
  notification = inject(NotificationService);

  constructor() {
    authState(this.auth).pipe(take(1)).subscribe(() => {
      this.isAuthLoading = false;
    });
  }
}

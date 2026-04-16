import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { CommonModule } from '@angular/common';
import { take } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'gestionaleCasa';
  isAuthLoading = true;
  private auth = inject(Auth);

  constructor() {
    authState(this.auth).pipe(take(1)).subscribe(() => {
      this.isAuthLoading = false;
    });
  }
}

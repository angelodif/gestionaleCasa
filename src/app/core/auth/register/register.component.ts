import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth/auth.service';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    RouterLink,
    MatCardModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatButtonModule, 
    MatIconModule
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  registerForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    displayName: ['', Validators.required]
  });

  selectedFile: File | null = null;
  loading = false; // Per disabilitare il tasto durante l'invio

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
  }

  async onRegister() {
    if (this.registerForm.valid) {
      this.loading = true;
      const { email, password, displayName } = this.registerForm.value;
      
      try {
        // Registrazione semplice + upload foto
        await this.authService.register(email, password, displayName, this.selectedFile);
        
        this.router.navigate(['/dashboard']);
      } catch (error: any) {
        console.error("Errore registrazione:", error);
        alert("Errore: " + error.message);
      } finally {
        this.loading = false;
      }
    }
  }
}
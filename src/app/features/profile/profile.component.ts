import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';


// Material Imports
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../core/services/auth/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    MatCardModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatButtonModule, 
    MatIconModule,
    MatDividerModule
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  authService = inject(AuthService);

  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  selectedFile: File | null = null;
  loading = false;
  ngOnInit() {
    const user = this.authService.getCurrentUser();

    // Form per Nome e Dati base
    this.profileForm = this.fb.group({
      displayName: [user?.displayName || '', Validators.required]
    });

    // Form per Password con validatore di uguaglianza
    this.passwordForm = this.fb.group({
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  passwordMatchValidator(g: FormGroup) {
    const pass = g.get('newPassword')?.value;
    const confirm = g.get('confirmPassword')?.value;
    return pass === confirm ? null : { mismatch: true };
  }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
  }

  async updateProfile() {
    if (this.profileForm.valid) {
      this.loading = true;
      try {
        await this.authService.updateUserProfile(
          this.profileForm.value.displayName, 
          this.selectedFile
        );
        alert('Profilo aggiornato!');
        this.selectedFile = null; // Reset selezione file
      } catch (e) {
        alert('Errore durante l\'aggiornamento.');
      } finally {
        this.loading = false;
      }
    }
  }

  async changePassword() {
    if (this.passwordForm.valid) {
      try {
        await this.authService.updateUserPassword(this.passwordForm.value.newPassword);
        alert('Password modificata con successo!');
        this.passwordForm.reset();
      } catch (error: any) {
        alert('Errore: Devi aver effettuato l\'accesso di recente per cambiare password.');
      }
    }
  }

  async logout() {
    if (confirm('Sei sicuro di voler uscire?')) {
      await this.authService.logout();
      this.router.navigate(['/login']);
    }
  }
}
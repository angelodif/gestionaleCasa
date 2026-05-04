import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-fs-login-dialog',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="sync-container">
      <div class="sync-header">
        <div class="logo-circle">
          <mat-icon>sync_alt</mat-icon>
        </div>
        <h2 class="title">Funny Station</h2>
        <p class="description">Accedi per importare i tuoi eventi nel calendario di casa</p>
      </div>

      <div class="form-section">
        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
          <div class="input-group">
            <label>Email Funny Station</label>
            <mat-form-field appearance="outline" class="full-width">
              <mat-icon matPrefix>alternate_email</mat-icon>
              <input matInput formControlName="email" type="email" placeholder="angelo@esempio.it">
            </mat-form-field>
          </div>

          <div class="input-group">
            <label>Password</label>
            <mat-form-field appearance="outline" class="full-width">
              <mat-icon matPrefix>lock_outline</mat-icon>
              <input matInput formControlName="password" [type]="hidePassword ? 'password' : 'text'" placeholder="••••••••">
              <button type="button" mat-icon-button matSuffix (click)="hidePassword = !hidePassword">
                <mat-icon>{{hidePassword ? 'visibility_off' : 'visibility'}}</mat-icon>
              </button>
            </mat-form-field>
          </div>

          <div *ngIf="errorMessage" class="error-banner">
            <mat-icon>error_outline</mat-icon>
            <span>{{ errorMessage }}</span>
          </div>

          <div class="dialog-actions">
            <button mat-button type="button" class="cancel-btn" (click)="onCancel()" [disabled]="isLoading">
              Annulla
            </button>
            <button mat-flat-button class="submit-btn" type="submit" [disabled]="loginForm.invalid || isLoading">
              <mat-spinner diameter="20" *ngIf="isLoading"></mat-spinner>
              <span *ngIf="!isLoading">Importa Eventi</span>
              <mat-icon *ngIf="!isLoading">arrow_forward</mat-icon>
            </button>
          </div>
        </form>
      </div>
      
      <div class="security-footer">
        <mat-icon>verified_user</mat-icon>
        <span>Logout automatico al termine della sincronizzazione</span>
      </div>
    </div>
  `,
  styles: [`
    .sync-container {
      padding: 32px 24px 24px;
      max-width: 400px;
      background: #fff;
    }

    .sync-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo-circle {
      width: 64px;
      height: 64px;
      background: #fdf2f8;
      color: #db2777;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      transform: rotate(-10deg);
      box-shadow: 0 4px 12px rgba(219, 39, 119, 0.1);
    }

    .logo-circle mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .title {
      font-size: 1.5rem;
      font-weight: 800;
      color: #111827;
      margin: 0 0 8px !important;
      letter-spacing: -0.025em;
    }

    .description {
      font-size: 0.95rem;
      color: #6b7280;
      margin: 0;
      line-height: 1.5;
    }

    .form-section {
      margin-bottom: 24px;
    }

    .input-group {
      margin-bottom: 16px;
      
      label {
        display: block;
        font-size: 0.875rem;
        font-weight: 600;
        color: #374151;
        margin-bottom: 6px;
      }
    }

    .full-width {
      width: 100%;
    }

    ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    ::ng-deep .mat-mdc-text-field-wrapper {
      background-color: #f9fafb !important;
      border-radius: 12px !important;
    }

    ::ng-deep .mat-mdc-form-field-focus-overlay {
      background-color: transparent !important;
    }

    .error-banner {
      background: #fef2f2;
      border: 1px solid #fee2e2;
      color: #b91c1c;
      padding: 12px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 20px;
      font-size: 0.875rem;
    }

    .dialog-actions {
      display: flex;
      gap: 12px;
      margin-top: 32px;
    }

    .cancel-btn {
      flex: 1;
      height: 48px;
      border-radius: 12px;
      font-weight: 600;
      color: #4b5563;
    }

    .submit-btn {
      flex: 2;
      height: 48px;
      background-color: #db2777 !important;
      color: white !important;
      border-radius: 12px;
      font-weight: 700;
      box-shadow: 0 4px 14px rgba(219, 39, 119, 0.3);
      
      ::ng-deep .mdc-button__label {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
    }

    .security-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      color: #9ca3af;
      font-size: 0.75rem;
      border-top: 1px solid #f3f4f6;
      padding-top: 16px;
      margin-top: 8px;
      
      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
    }

    mat-spinner {
      margin-right: 8px;
    }
  `]
})
export class FsLoginDialogComponent {
  loginForm: FormGroup;
  hidePassword = true;
  isLoading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<FsLoginDialogComponent>
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  onSubmit() {
    if (this.loginForm.valid) {
      this.dialogRef.close(this.loginForm.value);
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}

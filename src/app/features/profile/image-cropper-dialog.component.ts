import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ImageCroppedEvent, ImageCropperComponent } from 'ngx-image-cropper';

@Component({
  selector: 'app-image-cropper-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, ImageCropperComponent],
  template: `
    <h2 mat-dialog-title>Ritaglia la tua foto</h2>
    <mat-dialog-content>
      <div class="cropper-wrapper">
        <image-cropper
          [imageChangedEvent]="data.imageChangedEvent"
          [maintainAspectRatio]="true"
          [aspectRatio]="1 / 1"
          format="jpeg"
          [resizeToWidth]="400"
          [cropperMinWidth]="120"
          (imageCropped)="imageCropped($event)">
        </image-cropper>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Annulla</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!croppedBlob">Ritaglia e Salva</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .cropper-wrapper {
      max-height: 60vh;
      overflow: hidden;
      display: flex;
      justify-content: center;
      background: #333;
      border-radius: 8px;
    }
  `]
})
export class ImageCropperDialogComponent {
  croppedBlob: Blob | null = null;
  croppedUrl: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<ImageCropperDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { imageChangedEvent: any }
  ) { }

  imageCropped(event: ImageCroppedEvent) {
    if (event.blob) {
      this.croppedBlob = event.blob;
      // Creiamo l'ObjectURL per la preview veloce in chiusura
      if (this.croppedUrl) URL.revokeObjectURL(this.croppedUrl);
      this.croppedUrl = URL.createObjectURL(event.blob);
    }
  }

  cancel() {
    if (this.croppedUrl) URL.revokeObjectURL(this.croppedUrl);
    this.dialogRef.close(null);
  }

  save() {
    this.dialogRef.close({
      blob: this.croppedBlob,
      url: this.croppedUrl
    });
  }
}

// Path: src/app/components/dialogs/save-model-dialog/save-model-dialog.ts

import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BuildingInfo } from '../../../models/building-info.model';

export interface SaveModelResult {
  modelName: string;
  confirmed: boolean;
}

@Component({
  selector: 'app-save-model-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './save-model-dialog.html',
  styleUrls: ['./save-model-dialog.css']
})
export class SaveModelDialog {
  // Inputs
  isOpen = input<boolean>(false);
  buildingInfo = input<BuildingInfo | null>(null);

  // Outputs
  dialogClose = output<SaveModelResult>();

  // Local state
  modelName = signal<string>('');

  onCancel(): void {
    this.modelName.set('');
    this.dialogClose.emit({ modelName: '', confirmed: false });
  }

  onSave(): void {
    const name = this.modelName() || `Building_${this.buildingInfo()?.summary?.buildingId || 'Model'}_v1`;
    this.dialogClose.emit({ modelName: name, confirmed: true });
    this.modelName.set('');
  }

  updateModelName(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.modelName.set(input.value);
  }
}

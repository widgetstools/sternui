import { Component } from '@angular/core';
import { DataProviderEditorComponent } from '@stern/angular';

@Component({
  selector: 'stern-data-providers-page',
  standalone: true,
  imports: [DataProviderEditorComponent],
  template: `
    <div class="h-screen w-screen">
      <stern-data-provider-editor></stern-data-provider-editor>
    </div>
  `,
})
export class DataProvidersComponent {}

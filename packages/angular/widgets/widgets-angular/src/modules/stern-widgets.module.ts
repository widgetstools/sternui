import { NgModule } from '@angular/core';
import { DockConfiguratorComponent } from '../components/dock-configurator/dock-configurator.component';
import { DataProviderEditorComponent } from '../components/data-provider-editor/data-provider-editor.component';

@NgModule({
  imports: [DockConfiguratorComponent, DataProviderEditorComponent],
  exports: [DockConfiguratorComponent, DataProviderEditorComponent],
})
export class SternWidgetsModule {}

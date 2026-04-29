import { bootstrapApplication } from '@angular/platform-browser';
import { buildAppConfig } from './app/app.config';
import { AppComponent } from './app/app';

buildAppConfig()
  .then((cfg) => bootstrapApplication(AppComponent, cfg))
  .catch((err) => console.error(err));

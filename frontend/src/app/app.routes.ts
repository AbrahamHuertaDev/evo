import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { InstanciasComponent } from './instancias/instancias.component';
import { WebhooksComponent } from './webhooks/webhooks.component';
import { InstanciaDetalleComponent } from './instancia-detalle/instancia-detalle.component';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'instancias', component: InstanciasComponent, canActivate: [authGuard] },
  { path: 'instancias/:id', component: InstanciaDetalleComponent, canActivate: [authGuard] },
  { path: 'webhooks', component: WebhooksComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
];

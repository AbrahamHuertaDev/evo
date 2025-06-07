import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InstanceService } from '../services/instance.service';
import { Instance } from '../models/instance.model';

@Component({
  selector: 'app-instancias',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './instancias.component.html',
  styleUrl: './instancias.component.css'
})
export class InstanciasComponent implements OnInit {
  instancias: Instance[] = [];
  loading = true;
  error = '';
  newInstanceName = '';
  showCreateForm = false;

  constructor(
    private instanceService: InstanceService,
    private router: Router
  ) {}

  ngOnInit() {
    this.cargarInstancias();
  }

  cargarInstancias() {
    this.loading = true;
    this.instanceService.getInstances().subscribe({
      next: (instances: any) => {
        this.instancias = instances.data;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'No se pudieron cargar las instancias';
        this.loading = false;
      }
    });
  }

  crearInstancia() {
    if (!this.newInstanceName.trim()) return;
    
    this.instanceService.createInstance(this.newInstanceName).subscribe({
      next: (instance) => {
        this.instancias.push(instance);
        this.newInstanceName = '';
        this.showCreateForm = false;
      },
      error: (err) => {
        this.error = 'No se pudo crear la instancia';
      }
    });
  }

  conectarInstancia(instance: Instance) {
    this.instanceService.connectInstance(instance.id).subscribe({
      next: (updatedInstance) => {
        const index = this.instancias.findIndex(i => i.id === instance.id);
        if (index !== -1) {
          this.instancias[index] = updatedInstance;
        }
      },
      error: (err) => {
        this.error = 'No se pudo conectar la instancia';
      }
    });
  }

  desconectarInstancia(instance: Instance) {
    this.instanceService.disconnectInstance(instance.id).subscribe({
      next: (updatedInstance) => {
        const index = this.instancias.findIndex(i => i.id === instance.id);
        if (index !== -1) {
          this.instancias[index] = updatedInstance;
        }
      },
      error: (err) => {
        this.error = 'No se pudo desconectar la instancia';
      }
    });
  }

  verInstancia(inst: Instance) {
    if (!inst.id) {
      console.error('ID de instancia indefinido:', inst);
      return;
    }
    this.router.navigate(['/#/instancias', inst.id]);
  }

  eliminarInstancia(instance: Instance) {
    if (!confirm(`¿Seguro que deseas eliminar la instancia "${instance.name}"?`)) return;
    
    this.instanceService.deleteInstance(instance.id).subscribe({
      next: () => {
        this.instancias = this.instancias.filter(i => i.id !== instance.id);
      },
      error: (err) => {
        this.error = 'No se pudo eliminar la instancia';
      }
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'connected':
        return 'status-connected';
      case 'connecting':
        return 'status-connecting';
      case 'waiting_qr':
        return 'status-waiting';
      case 'error':
      case 'auth_failed':
        return 'status-error';
      default:
        return 'status-disconnected';
    }
  }
}

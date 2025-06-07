import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { io, Socket } from 'socket.io-client';
import { InstanceService } from '../services/instance.service';
import { Instance } from '../models/instance.model';
import { environment } from '../../environments/environment';
import Swal, { SweetAlertResult } from 'sweetalert2';
import QRCode from 'qrcode';

@Component({
  selector: 'app-instancia-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './instancia-detalle.component.html',
  styleUrl: './instancia-detalle.component.css'
})
export class InstanciaDetalleComponent implements OnInit, OnDestroy {
  instancia: Instance | null = null;
  loading = true;
  error = '';
  id: string = '';
  estado: string = '';
  qr: string = '';
  qrImage: string = '';
  socket: Socket | null = null;
  showChatwootForm = false;
  chatwootConfig = {
    inboxId: '',
    apiToken: ''
  };
  mensajes: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private instanceService: InstanceService
  ) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    this.cargarDetalle();
    this.iniciarWebSocket();
  }

  cargarDetalle() {
    this.loading = true;
    this.instanceService.getInstance(this.id).subscribe({
      next: (res: any) => {
        const instancia = res && res.data ? res.data : res;
        if (!instancia) {
          this.error = 'No se encontró la instancia';
          this.loading = false;
          return;
        }
        this.instancia = instancia;
        this.estado = instancia.status;
        this.qr = instancia.qr || '';
        if (this.qr) {
          QRCode.toDataURL(this.qr).then((url: string) => {
            this.qrImage = url;
          });
        } else {
          this.qrImage = '';
        }
        if (instancia.chatwootInboxId && instancia.chatwootApiToken) {
          this.chatwootConfig = {
            inboxId: instancia.chatwootInboxId,
            apiToken: instancia.chatwootApiToken
          };
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = 'No se pudo cargar la instancia';
        this.loading = false;
      }
    });
  }

  iniciarWebSocket() {
    this.socket = io(environment.apiUrl, {
      transports: ['websocket'],
      auth: { token: localStorage.getItem('token') }
    });

    this.socket.on('connect', () => {
      this.socket?.emit('subscribe', { instanceId: this.id });
    });

    this.socket.on('status', (data: any) => {
      if (data.instanceId === this.id && this.instancia) {
        this.estado = data.status;
        this.instancia.status = data.status;
      }
    });

    this.socket.on('qr', (data: any) => {
      if (data.instanceId === this.id) {
        this.qr = data.qr;
        if (this.qr) {
          QRCode.toDataURL(this.qr).then((url: string) => {
            this.qrImage = url;
          });
        } else {
          this.qrImage = '';
        }
      }
    });

    this.socket.on('ready', (data: any) => {
      if (data.instanceId === this.id && this.instancia) {
        this.estado = 'connected';
        this.instancia.status = 'connected';
        console.log('Evento ready recibido:', data);
      }
    });

    this.socket.on('message', (data: any) => {
      if (data.instanceId === this.id) {
        this.mensajes.push(data);
        console.log('Mensaje recibido:', data);
      }
    });
  }

  conectarInstancia() {
    if (!this.instancia) return;
    
    this.instanceService.connectInstance(this.instancia.id).subscribe({
      next: (instance) => {
        this.instancia = instance;
        this.estado = instance.status;
      },
      error: (err) => {
        this.error = 'No se pudo conectar la instancia';
      }
    });
  }

  desconectarInstancia() {
    if (!this.instancia) return;
    
    this.instanceService.disconnectInstance(this.instancia.id).subscribe({
      next: (instance) => {
        this.instancia = instance;
        this.estado = instance.status;
      },
      error: (err) => {
        this.error = 'No se pudo desconectar la instancia';
      }
    });
  }

  actualizarChatwoot() {
    if (!this.instancia) return;
    
    this.instanceService.createChatwootInbox(this.instancia.name, this.chatwootConfig.inboxId, this.instancia.id, this.chatwootConfig.apiToken).subscribe({
      next: (instance: any) => {
        this.instancia = instance;
        this.showChatwootForm = false;
      },
      error: (err: any) => {
        this.error = 'No se pudo actualizar la configuración de Chatwoot';
      }
    })
  }

  eliminarInstancia() {
    if (!this.instancia) return;

    Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas eliminar la instancia "${this.instancia.name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e53e3e',
      cancelButtonColor: '#3182ce',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result: SweetAlertResult<any>) => {
      if (result.isConfirmed) {
        this.instanceService.deleteInstance(this.instancia!.id).subscribe({
          next: () => {
            Swal.fire('Eliminada', 'La instancia ha sido eliminada.', 'success');
            this.router.navigate(['/instancias']);
          },
          error: (err) => {
            Swal.fire('Error', 'No se pudo eliminar la instancia', 'error');
          }
        });
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

  ngOnDestroy() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

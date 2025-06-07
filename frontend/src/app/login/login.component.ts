import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  email: string = '';
  password: string = '';
  error: string = '';
  apiUrl: string = 'http://localhost:3001/api';

  constructor(private http: HttpClient) {
    // Si ya hay token, redirigir a /instancias
    if (localStorage.getItem('token')) {
      window.location.href = '/instancias';
    }
  }

  onSubmit() {
    this.error = '';
    this.http.post<any>(`${this.apiUrl}/login`, {
      email: this.email,
      password: this.password
    }).subscribe({
      next: (res) => {
        localStorage.setItem('token', res.token);
        window.location.href = '/instancias';
      },
      error: (err) => {
        this.error = err.error?.error || 'Error al iniciar sesión';
      }
    });
  }
}

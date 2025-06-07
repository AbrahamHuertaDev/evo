const EventEmitter = require('events');

// Crear un EventEmitter para los webhooks
const webhookEmitter = new EventEmitter();

// Configurar el número máximo de listeners
webhookEmitter.setMaxListeners(20);

// Agregar logs para todos los eventos
webhookEmitter.on('qr', (data) => {
    console.log('\n=== WEBHOOK EMITTER: EVENTO QR ===');
    console.log('Datos recibidos:', JSON.stringify(data, null, 2));
    console.log('Número de listeners:', webhookEmitter.listenerCount('qr'));
});

webhookEmitter.on('ready', (data) => {
    console.log('\n=== WEBHOOK EMITTER: EVENTO READY ===');
    console.log('Datos recibidos:', JSON.stringify(data, null, 2));
    console.log('Número de listeners:', webhookEmitter.listenerCount('ready'));
});

webhookEmitter.on('disconnected', (data) => {
    console.log('\n=== WEBHOOK EMITTER: EVENTO DISCONNECTED ===');
    console.log('Datos recibidos:', JSON.stringify(data, null, 2));
    console.log('Número de listeners:', webhookEmitter.listenerCount('disconnected'));
});

webhookEmitter.on('auth_failure', (data) => {
    console.log('\n=== WEBHOOK EMITTER: EVENTO AUTH FAILURE ===');
    console.log('Datos recibidos:', JSON.stringify(data, null, 2));
    console.log('Número de listeners:', webhookEmitter.listenerCount('auth_failure'));
});

// Agregar listener para errores
webhookEmitter.on('error', (error) => {
    console.error('\n=== WEBHOOK EMITTER: ERROR ===');
    console.error('Error:', error);
    console.error('Stack trace:', error.stack);
});

console.log('=== WEBHOOK EMITTER INICIALIZADO ===');
console.log('Eventos configurados:', webhookEmitter.eventNames());

module.exports = webhookEmitter; 
const { Server } = require('socket.io');
const http = require('http');

let io;

// Mapa de suscripciones por instanciaId
const instanceSubscribers = {};

function initializeSocketServer(app) {
    const server = http.createServer(app);
    io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        socket.on('subscribe', ({ instanceId }) => {
            socket.join(instanceId);
            if (!instanceSubscribers[instanceId]) instanceSubscribers[instanceId] = [];
            instanceSubscribers[instanceId].push(socket.id);
        });
        socket.on('disconnect', () => {
            for (const id in instanceSubscribers) {
                instanceSubscribers[id] = instanceSubscribers[id].filter(sid => sid !== socket.id);
            }
        });
    });

    return server;
}

// Función para emitir eventos de estado y QR
function emitInstanceEvent(type, instanceId, payload) {
    if (!io) {
        console.error('Socket.io no está inicializado');
        return;
    }
    io.to(instanceId).emit(type, { instanceId, ...payload });
}

module.exports = {
    initializeSocketServer,
    emitInstanceEvent
}; 
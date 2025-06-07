require('dotenv').config();
const express = require('express');
const cors = require('cors');
const instanceController = require('./controllers/instanceController');
const webhookEmitter = require('./utils/webhookEmitter');
const instanceRoutes = require('./routes/instanceRoutes');
const chatwootRoutes = require('./routes/chatwootRoutes');
const loginRoutes = require('./routes/loginRoutes');
const { initializeSocketServer } = require('./utils/socketManager');
const path = require('path');

const app = express();
const server = initializeSocketServer(app);

const port = process.env.PORT || 8089;

// Configurar CORS
app.use(cors());

// Middleware para parsear JSON
app.use(express.json());

// Configurar el controlador para emitir eventos
console.log('Configurando instanceController con webhookEmitter...');
instanceController.on = webhookEmitter.on.bind(webhookEmitter);
instanceController.emit = webhookEmitter.emit.bind(webhookEmitter);
console.log('instanceController configurado con webhookEmitter');

// Rutas CRUD para instancias
app.post('/api/instances', (req, res) => instanceController.createInstance(req, res));
app.get('/api/instances', (req, res) => instanceController.getInstances(req, res));
app.get('/api/instances/:instanceId', (req, res) => instanceController.getInstance(req, res));
app.put('/api/instances/:instanceId', (req, res) => instanceController.updateInstance(req, res));
app.delete('/api/instances/:instanceId', (req, res) => instanceController.deleteInstance(req, res));

// Rutas de conexión
app.post('/api/instances/:instanceId/connect', (req, res) => instanceController.connectInstance(req, res));
app.post('/api/instances/:instanceId/disconnect', (req, res) => instanceController.disconnectInstance(req, res));

// Ruta para webhooks
app.post('/api/webhook/:instanceId', (req, res) => {
    const { instanceId } = req.params;
    const webhookData = req.body;

    // Emitir el evento del webhook
    webhookEmitter.emit('webhook', instanceId, webhookData);

    res.json({ status: 'success', message: 'Webhook recibido' });
});

// Endpoint para enviar mensajes
app.post('/v1/messages', async (req, res) => {
    try {
        const { number, message, instanceId } = req.body;
        if (!number || !message) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'El número y el mensaje son requeridos' 
            });
        }

        if (!instanceId) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'El ID de la instancia es requerido' 
            });
        }

        const instance = instanceController.bots.get(instanceId);
        if (!instance) {
            return res.status(404).json({ 
                status: 'error', 
                message: 'Instancia no encontrada o no conectada' 
            });
        }

        await instance.sendMessage(number, message);
        return res.json({ 
            status: 'success', 
            message: 'Mensaje enviado correctamente' 
        });
    } catch (error) {
        console.error('Error al enviar mensaje:', error);
        return res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// Endpoint para enviar mensajes con archivos multimedia
app.post('/v1/messages/media', async (req, res) => {
    try {
        const { number, message, mediaUrl, instanceId } = req.body;
        if (!number || !message || !mediaUrl) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'El número, mensaje y URL del medio son requeridos' 
            });
        }

        if (!instanceId) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'El ID de la instancia es requerido' 
            });
        }

        const instance = instanceController.bots.get(instanceId);
        if (!instance) {
            return res.status(404).json({ 
                status: 'error', 
                message: 'Instancia no encontrada o no conectada' 
            });
        }

        const options = { media: mediaUrl };
        await instance.sendMessage(number, message, options);

        return res.json({ 
            status: 'success', 
            message: 'Mensaje multimedia enviado correctamente' 
        });
    } catch (error) {
        console.error('Error al enviar mensaje multimedia:', error);
        return res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// Rutas
app.use('/api/instances', instanceRoutes);
app.use('/api/chatwoot', chatwootRoutes);
app.use('/api', loginRoutes);

// Servir archivos estáticos de la carpeta public en la ruta /
app.use('/', express.static(path.join(__dirname, '../public')));

// Iniciar el servidor
server.listen(port, async () => {
    console.log(`Servidor corriendo en el puerto ${port}`);
    
    try {
        // Inicializar instancias existentes
        console.log('Iniciando reconexión de instancias existentes...');
        await instanceController.initializeInstances();
    } catch (error) {
        console.error('Error al inicializar el servidor:', error);
    }
}); 
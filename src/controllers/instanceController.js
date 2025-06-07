const Instance = require('../models/Instance');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const path = require('path');
const ChatwootController = require('./chatwootController');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const EventEmitter = require('events');
const webhookEmitter = require('../utils/webhookEmitter');
const { emitInstanceEvent } = require('../utils/socketManager');

class InstanceController extends EventEmitter {
    constructor() {
        super();
        this.bots = new Map();
        console.log('=== INSTANCE CONTROLLER INICIALIZADO ===');
        this.initializeInstances();
    }

    // Inicializar instancias existentes
    async initializeInstances() {
        try {
            console.log('=== INICIALIZANDO INSTANCIAS EXISTENTES ===');
            const instances = await Instance.getAllInstances();
            console.log(`Instancias encontradas en la base de datos: ${instances.length}`);
            
            if (instances.length === 0) {
                console.log('No hay instancias para reconectar');
                return;
            }

            for (const instance of instances) {
                console.log(`\nProcesando instancia: ${instance.name} (${instance.id})`);
                console.log('Estado actual:', instance.status);
                
                try {
                    console.log('Creando nuevo cliente...');
                    const client = new Client({
                        puppeteer: {
                            headless: 'new', // o true si estás en puppeteer <21
                            executablePath: '/usr/bin/chromium-browser', // asegúrate que exista ese path
                            args: [
                              '--no-sandbox',
                              '--disable-setuid-sandbox',
                              '--disable-dev-shm-usage',
                              '--disable-gpu',
                              '--disable-accelerated-2d-canvas',
                              '--no-zygote',
                              '--single-process',
                              '--no-first-run',
                              '--no-default-browser-check',
                              '--disable-background-networking',
                              '--disable-client-side-phishing-detection',
                              '--disable-component-update',
                              '--disable-default-apps',
                              '--disable-hang-monitor',
                              '--disable-popup-blocking',
                              '--disable-prompt-on-repost',
                              '--disable-sync',
                              '--disable-translate',
                              '--metrics-recording-only',
                              '--mute-audio',
                              '--no-sandbox',
                              '--safebrowsing-disable-auto-update'
                            ],
                            ignoreHTTPSErrors: true,
                            timeout: 60000
                        },
                        authStrategy: new LocalAuth({
                            clientId: instance.id,
                            dataPath: path.join(process.cwd(), 'data', 'sessions')
                        })
                    });

                    // Configurar eventos de conexión
                    client.on('loading_screen', (percent, message) => {
                        console.log(`[${instance.name}] Loading: ${percent}% - ${message}`);
                    });

                    client.on('qr', async (qr) => {
                        try {
                            console.log('\n=== EVENTO QR RECIBIDO ===');
                            console.log(`QR generado para instancia ${instance.name}`);
                            qrcode.generate(qr, { small: true });
                            console.log('Actualizando estado de la instancia...');
                            await Instance.updateInstanceStatus(instance.id, 'waiting_qr', qr);
                            console.log('Estado actualizado a waiting_qr');
                            
                            console.log('Emitiendo evento QR...');
                            // Emitir evento QR
                            const qrData = {
                                instanceId: instance.id,
                                instanceName: instance.name,
                                qr: qr
                            };
                            console.log('Datos del evento QR:', JSON.stringify(qrData, null, 2));
                            
                            // Emitir el evento de dos formas para asegurar que se capture
                            this.emit('qr', qrData);
                            webhookEmitter.emit('qr', qrData);
                            emitInstanceEvent('qr', instance.id, { qr });
                            
                            console.log('Evento QR emitido');
                        } catch (error) {
                            console.error('Error al procesar QR:', error);
                            console.error('Stack trace:', error.stack);
                        }
                    });

                    client.on('ready', async () => {
                        console.log(`\n=== ${instance.name} CONECTADA ===`);
                        await Instance.updateInstanceStatus(instance.id, 'connected');
                        emitInstanceEvent('status', instance.id, { status: 'connected' });
                    });

                    client.on('disconnected', async (reason) => {
                        console.log(`\n=== ${instance.name} DESCONECTADA ===`);
                        console.log('Razón:', reason);
                        await Instance.updateInstanceStatus(instance.id, 'disconnected');
                        emitInstanceEvent('status', instance.id, { status: 'disconnected' });
                    });

                    client.on('auth_failure', async (error) => {
                        console.log(`\n=== ERROR DE AUTENTICACIÓN EN ${instance.name} ===`);
                        console.log('Error:', error);
                        await Instance.updateInstanceStatus(instance.id, 'auth_failed');
                        emitInstanceEvent('status', instance.id, { status: 'auth_failed' });
                    });

                    // Configurar evento de mensajes
                    client.on('message', async (message) => {
                        console.log('MENSAJE EVENTO DISPARADO', message);
                        try {
                            console.log(`\n=== MENSAJE RECIBIDO EN ${instance.name} ===`);
                            console.log('De:', message.from);
                            console.log('Contenido:', message.body);

                            // Emitir evento al frontend
                            emitInstanceEvent('message', instance.id, {
                                from: message.from,
                                body: message.body,
                                timestamp: message.timestamp,
                                instanceId: instance.id,
                                instanceName: instance.name
                            });

                            // Obtener la instancia actualizada
                            const currentInstance = await Instance.getInstance(instance.id);
                            if (!currentInstance) {
                                console.error('No se pudo obtener la instancia actualizada');
                                return;
                            }

                            // Enviar mensaje a Chatwoot si la instancia está configurada
                            if (currentInstance.chatwootInboxId && currentInstance.chatwootApiToken) {
                                console.log('Enviando mensaje a Chatwoot...');
                                await ChatwootController.handleWhatsAppMessage(message, currentInstance);
                            } else {
                                console.log('Instancia no configurada con Chatwoot');
                            }
                        } catch (error) {
                            console.error('Error al procesar mensaje:', error);
                        }
                    });

                    // Guardar la referencia del cliente
                    this.bots.set(instance.id, client);
                    console.log('Cliente guardado en el mapa de instancias');
                    
                    // Actualizar estado antes de iniciar
                    await Instance.updateInstanceStatus(instance.id, 'connecting');
                    console.log('Estado actualizado a connecting');
                    
                    // Iniciar la conexión
                    console.log('Iniciando cliente...');
                    await client.initialize();
                    console.log('Cliente iniciado exitosamente');
                    
                } catch (error) {
                    console.error(`\nError al inicializar instancia ${instance.name}:`, error);
                    await Instance.updateInstanceStatus(instance.id, 'error');
                }
            }
            
            console.log('\n=== FINALIZADA INICIALIZACIÓN DE INSTANCIAS ===');
            console.log(`Total de instancias procesadas: ${instances.length}`);
            console.log(`Instancias en el mapa: ${this.bots.size}`);
        } catch (error) {
            console.error('Error al inicializar instancias:', error);
        }
    }

    // Función para enviar mensaje al webhook
    async sendToWebhook(instanceId, message) {
        try {
            console.log('=== ENVIANDO A WEBHOOK ===');
            console.log('Instance ID:', instanceId);
            
            const instance = await Instance.getInstance(instanceId);
            if (!instance) {
                console.log('Instancia no encontrada para webhook');
                return;
            }

            const webhookData = {
                instance_id: instanceId,
                message: {
                    id: message.id.id,
                    from: message.from,
                    to: message.to,
                    body: message.body,
                    timestamp: message.timestamp,
                    type: message.type,
                    hasMedia: message.hasMedia,
                    mediaUrl: message.hasMedia ? await message.downloadMedia() : null
                }
            };

            console.log('Datos del webhook:', JSON.stringify(webhookData, null, 2));

            // Emitir el evento para que los webhooks puedan escucharlo
            this.emit('webhook', instanceId, webhookData);
            console.log('Evento webhook emitido');
        } catch (error) {
            console.error('Error al procesar webhook:', error);
        }
    }

    // CREATE - Crear una nueva instancia
    async createInstance(params) {
        try {
            console.log('\n=== INICIO CREACIÓN DE INSTANCIA ===');
            // Evitar referencias circulares en el log de parámetros
            if (params.body) {
                console.log('Parámetros recibidos:', params.body);
            } else {
                console.log('Parámetros recibidos:', params);
            }
            
            const { name } = params.body || params;
            console.log('Nombre de la instancia:', name);

            if (!name) {
                console.log('Error: Nombre no proporcionado');
                throw new Error('El nombre de la instancia es requerido');
            }

            console.log('Creando instancia en la base de datos...');
            // Crear la instancia en la base de datos
            const instance = await Instance.createInstance(name);
            // Evitar referencias circulares en el log
            console.log('Instancia creada en la base de datos:', {
              id: instance.id,
              name: instance.name,
              status: instance.status,
              createdAt: instance.createdAt,
              updatedAt: instance.updatedAt
            });

            console.log('Creando cliente de WhatsApp...');
            // Crear el cliente de WhatsApp
            const client = new Client({
                puppeteer: {
                    headless: false,
                    executablePath: process.platform === 'win32' 
                        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
                        : '/usr/bin/google-chrome',
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu',
                        '--window-size=1280,720',
                        '--window-position=0,0',
                        '--disable-extensions',
                        '--disable-default-apps',
                        '--disable-popup-blocking',
                        '--disable-notifications',
                        '--disable-web-security',
                        '--disable-features=IsolateOrigins,site-per-process'
                    ],
                    defaultViewport: {
                        width: 1280,
                        height: 720
                    },
                    ignoreHTTPSErrors: true,
                    timeout: 60000
                },
                authStrategy: new LocalAuth({
                    clientId: instance.id,
                    dataPath: path.join(process.cwd(), 'data', 'sessions')
                })
            });
            console.log('Cliente de WhatsApp creado');

            console.log('Configurando eventos del cliente...');
            // Configurar eventos del cliente
            client.on('loading_screen', (percent, message) => {
                console.log(`[${instance.name}] Loading: ${percent}% - ${message}`);
            });

            client.on('qr', async (qr) => {
                try {
                    console.log('\n=== EVENTO QR RECIBIDO ===');
                    console.log(`QR generado para instancia ${instance.name}`);
                    qrcode.generate(qr, { small: true });
                    console.log('Actualizando estado de la instancia...');
                    await Instance.updateInstanceStatus(instance.id, 'waiting_qr', qr);
                    console.log('Estado actualizado a waiting_qr');
                    
                    console.log('Emitiendo evento QR...');
                    // Emitir evento QR
                    const qrData = {
                        instanceId: instance.id,
                        instanceName: instance.name,
                        qr: qr
                    };
                    console.log('Datos del evento QR:', JSON.stringify(qrData, null, 2));
                    
                    // Emitir el evento de dos formas para asegurar que se capture
                    this.emit('qr', qrData);
                    webhookEmitter.emit('qr', qrData);
                    emitInstanceEvent('qr', instance.id, { qr });
                    
                    console.log('Evento QR emitido');
                } catch (error) {
                    console.error('Error al procesar QR:', error);
                    console.error('Stack trace:', error.stack);
                }
            });

            client.on('ready', async () => {
                console.log(`\n=== ${instance.name} CONECTADA ===`);
                console.log('Actualizando estado de la instancia...');
                await Instance.updateInstanceStatus(instance.id, 'connected');
                console.log('Estado actualizado a connected');
                
                console.log('Emitiendo evento ready...');
                // Emitir evento ready
                this.emit('ready', {
                    instanceId: instance.id,
                    instanceName: instance.name
                });
                console.log('Evento ready emitido');
                emitInstanceEvent('status', instance.id, { status: 'connected' });
            });

            client.on('disconnected', async (reason) => {
                console.log(`\n=== ${instance.name} DESCONECTADA ===`);
                console.log('Razón:', reason);
                console.log('Actualizando estado de la instancia...');
                await Instance.updateInstanceStatus(instance.id, 'disconnected');
                console.log('Estado actualizado a disconnected');
                emitInstanceEvent('status', instance.id, { status: 'disconnected' });
            });

            client.on('auth_failure', async (error) => {
                console.log(`\n=== ERROR DE AUTENTICACIÓN EN ${instance.name} ===`);
                console.log('Error:', error);
                console.log('Actualizando estado de la instancia...');
                await Instance.updateInstanceStatus(instance.id, 'auth_failed');
                console.log('Estado actualizado a auth_failed');
                emitInstanceEvent('status', instance.id, { status: 'auth_failed' });
            });

            console.log('Guardando referencia del cliente...');
            // Guardar la referencia del cliente
            this.bots.set(instance.id, client);
            console.log('Cliente guardado en el mapa de instancias');

            console.log('Iniciando cliente...');
            // Iniciar la conexión
            await client.initialize();
            console.log('Cliente iniciado exitosamente');

            // Si es una petición HTTP, enviar respuesta
            if (params.res) {
                console.log('Enviando respuesta HTTP...');
                params.res.json({
                    success: true,
                    instance: {
                        id: instance.id,
                        name: instance.name,
                        status: instance.status
                    }
                });
                console.log('Respuesta HTTP enviada');
            }

            console.log('=== FIN CREACIÓN DE INSTANCIA ===\n');
            return instance;
        } catch (error) {
            console.error('\n=== ERROR EN CREACIÓN DE INSTANCIA ===');
            console.error('Error completo:', error);
            console.error('Stack trace:', error.stack);
            
            // Si es una petición HTTP, enviar error
            if (params.res) {
                console.log('Enviando error HTTP...');
                params.res.status(500).json({
                    success: false,
                    error: error.message
                });
                console.log('Error HTTP enviado');
            }
            
            throw error;
        }
    }

    // READ - Obtener todas las instancias
    async getInstances(req, res) {
        try {
            const instances = await Instance.getAllInstances();
            
            // Si se llama desde una ruta HTTP
            if (res) {
                return res.json({
                    status: 'success',
                    data: instances
                });
            }
            
            // Si se llama internamente
            return instances;
        } catch (error) {
            console.error('Error al obtener instancias:', error);
            if (res) {
                return res.status(500).json({ error: 'Error al obtener las instancias' });
            }
            throw error;
        }
    }

    // READ - Obtener una instancia específica
    async getInstance(req, res) {
        try {
            const instanceId = req.params?.instanceId;
            if (!instanceId) {
                if (res) {
                    return res.status(400).json({ error: 'ID de instancia no proporcionado' });
                }
                return null;
            }

            const instance = await Instance.getInstance(instanceId);
            
            if (!instance) {
                if (res) {
                    return res.status(404).json({ error: 'Instancia no encontrada' });
                }
                return null;
            }

            // Asegurarse de que la instancia tenga todas las propiedades necesarias
            const instanceData = {
                id: instance.id,
                name: instance.name || 'Sin nombre',
                status: instance.status || 'unknown',
                created_at: instance.created_at,
                updated_at: instance.updated_at,
                chatwootInboxId: instance.chatwootInboxId,
                chatwootApiToken: instance.chatwootApiToken,
                qr: instance.qr
            };

            if (res) {
                return res.json({
                    status: 'success',
                    data: instanceData
                });
            }
            
            return instanceData;
        } catch (error) {
            console.error('Error al obtener instancia:', error);
            if (res) {
                return res.status(500).json({ error: 'Error al obtener la instancia' });
            }
            return null;
        }
    }

    // UPDATE - Actualizar una instancia
    async updateInstance(req, res) {
        try {
            console.log('\n=== ACTUALIZANDO INSTANCIA ===');
            const instanceId = req.params.instanceId;
            const updates = req.body;
            
            console.log('ID de instancia:', instanceId);
            console.log('Actualizaciones:', updates);

            // Actualizar la instancia
            const updatedInstance = await Instance.updateInstance(instanceId, updates);
            console.log('Instancia actualizada:', updatedInstance);

            if (!updatedInstance) {
                console.error('No se pudo actualizar la instancia');
                if (res) {
                    return res.status(404).json({ error: 'Instancia no encontrada' });
                }
                throw new Error('Instancia no encontrada');
            }

            // Si se actualizó la configuración de Chatwoot, reiniciar el cliente
            if (updates.chatwootInboxId || updates.chatwootApiToken || updates.chatwootAccountId) {
                console.log('Configuración de Chatwoot actualizada, reiniciando cliente...');
                const client = this.bots.get(instanceId);
                if (client) {
                    try {
                        await client.destroy();
                        this.bots.delete(instanceId);
                        console.log('Cliente anterior destruido');
                    } catch (destroyError) {
                        console.error('Error al destruir cliente anterior:', destroyError);
                    }
                }
                // Volver a conectar la instancia (esto recrea el cliente y listeners)
                await this.connectInstance({ params: { instanceId } });
                console.log('Cliente reiniciado tras actualización de Chatwoot');
            }

            if (res) {
                return res.json({
                    message: 'Instancia actualizada exitosamente',
                    instance: updatedInstance
                });
            }
            
            return updatedInstance;
        } catch (error) {
            console.error('Error al actualizar instancia:', error);
            if (res) {
                return res.status(500).json({ error: error.message });
            }
            throw error;
        }
    }

    // DELETE - Eliminar una instancia
    async deleteInstance(req, res) {
        try {
            const { instanceId } = req.params;
            console.log('Intentando eliminar instancia:', instanceId);
            const instance = await Instance.getInstance(instanceId);
            if (!instance) {
                console.log('Instancia no encontrada');
                return res.status(404).json({ error: 'Instancia no encontrada' });
            }

            // Desconectar el bot si está activo
            if (this.bots.has(instanceId)) {
                const client = this.bots.get(instanceId);
                try {
                    await client.destroy();
                    this.bots.delete(instanceId);
                    console.log('Cliente destruido y eliminado del mapa');
                } catch (destroyError) {
                    console.error('Error al destruir el cliente:', destroyError);
                }
            } else {
                console.log('No hay cliente activo para esta instancia');
            }

            try {
                await Instance.deleteInstance(instanceId);
                console.log('Instancia eliminada de la base de datos');
            } catch (deleteError) {
                console.error('Error al eliminar instancia de la base de datos:', deleteError);
                return res.status(500).json({ error: 'Error al eliminar la instancia de la base de datos', details: deleteError.message });
            }

            await this.restartAllInstances();

            return res.json({
                status: 'success',
                message: 'Instancia eliminada correctamente'
            });
        } catch (error) {
            console.error('Error general al eliminar instancia:', error);
            return res.status(500).json({ error: 'Error al eliminar la instancia', details: error.message });
        }
    }

    // Conectar una instancia
    async connectInstance(req, res) {
        try {
            const { instanceId } = req.params;
            console.log('\n=== INICIO DE CONEXIÓN ===');
            console.log('ID de instancia:', instanceId);

            // Verificar si la instancia existe
            const instance = await Instance.getInstance(instanceId);
            if (!instance) {
                console.log('Instancia no encontrada');
                if (res) {
                    return res.status(404).json({ error: 'Instancia no encontrada' });
                }
                return null;
            }

            console.log('Nombre de instancia:', instance.name);

            // Si ya existe un bot para esta instancia, desconectarlo primero
            if (this.bots.has(instanceId)) {
                console.log('Desconectando instancia existente...');
                const oldClient = this.bots.get(instanceId);
                try {
                    if (oldClient && typeof oldClient.destroy === 'function') {
                        await oldClient.destroy();
                    }
                } catch (destroyError) {
                    console.error('Error al destruir cliente anterior:', destroyError);
                }
                this.bots.delete(instanceId);
                console.log('Instancia anterior desconectada');
            }

            console.log('Creando nuevo cliente...');
            const client = new Client({
                puppeteer: {
                    headless: false,
                    executablePath: process.platform === 'win32' 
                        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
                        : '/usr/bin/google-chrome',
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu',
                        '--window-size=1280,720',
                        '--window-position=0,0',
                        '--disable-extensions',
                        '--disable-default-apps',
                        '--disable-popup-blocking',
                        '--disable-notifications',
                        '--disable-web-security',
                        '--disable-features=IsolateOrigins,site-per-process'
                    ],
                    defaultViewport: {
                        width: 1280,
                        height: 720
                    },
                    ignoreHTTPSErrors: true,
                    timeout: 60000
                },
                authStrategy: new LocalAuth({
                    clientId: instance.id,
                    dataPath: path.join(process.cwd(), 'data', 'sessions')
                })
            });

            console.log('Cliente creado, configurando eventos...');

            // Configurar eventos de conexión
            client.on('loading_screen', (percent, message) => {
                console.log('=== LOADING SCREEN ===');
                console.log('Porcentaje:', percent);
                console.log('Mensaje:', message);
            });

            client.on('qr', async (qr) => {
                try {
                    console.log('=== EVENTO QR RECIBIDO ===');
                    console.log(`QR generado para instancia ${instance.name}`);
                    qrcode.generate(qr, { small: true });
                    await Instance.updateInstanceStatus(instanceId, 'waiting_qr', qr);
                    
                    // Enviar QR directamente a Telegram
                    await sendQRToTelegram(instance.id, instance.name, qr);
                } catch (error) {
                    console.error('Error al procesar QR:', error);
                }
            });

            client.on('ready', async () => {
                console.log('=== EVENTO READY RECIBIDO ===');
                console.log(`Instancia ${instance.name} conectada exitosamente`);
                await Instance.updateInstanceStatus(instanceId, 'connected');
                
                // Emitir evento ready
                this.emit('ready', {
                    instanceId: instance.id,
                    instanceName: instance.name
                });
            });

            client.on('disconnected', async (reason) => {
                console.log('=== EVENTO DISCONNECTED RECIBIDO ===');
                console.log(`Instancia ${instance.name} desconectada`);
                console.log('Razón:', reason);
                await Instance.updateInstanceStatus(instanceId, 'disconnected');
            });

            client.on('auth_failure', async (error) => {
                console.log('=== EVENTO AUTH FAILURE RECIBIDO ===');
                console.log(`Error de autenticación para instancia ${instance.name}`);
                console.log('Error:', error);
                await Instance.updateInstanceStatus(instanceId, 'error');
            });

            // Configurar evento de mensajes
            client.on('message', async (message) => {
                console.log('=== MENSAJE RECIBIDO ===');
                console.log('De:', message.from);
                console.log('Mensaje:', message.body);
                
                await this.sendToWebhook(instanceId, message);
            });

            // Guardar la referencia del cliente
            this.bots.set(instanceId, client);
            console.log('Referencia del cliente guardada');

            // Actualizar estado antes de iniciar
            await Instance.updateInstanceStatus(instanceId, 'connecting');
            console.log('Estado actualizado a connecting');

            // Iniciar la conexión
            try {
                console.log('Iniciando cliente...');
                await client.initialize();
                console.log('Cliente iniciado exitosamente');
            } catch (error) {
                console.error('Error al iniciar cliente:', error);
                await Instance.updateInstanceStatus(instanceId, 'error');
                throw error;
            }

            // Obtener el estado actualizado
            const updatedInstance = await Instance.getInstance(instanceId);
            console.log('Estado final de la instancia:', updatedInstance.status);
            console.log('=== FIN DE CONEXIÓN ===');

            if (res) {
                return res.json({
                    status: 'success',
                    message: 'Iniciando conexión de la instancia',
                    data: updatedInstance
                });
            }
            return updatedInstance;
        } catch (error) {
            console.error('=== ERROR EN CONEXIÓN ===');
            console.error('Error completo:', error);
            console.error('Stack trace:', error.stack);
            
            if (res) {
                return res.status(500).json({ 
                    error: 'Error al conectar la instancia',
                    details: error.message 
                });
            }
            throw error;
        }
    }

    // Desconectar una instancia
    async disconnectInstance(req, res) {
        try {
            const { instanceId } = req.params;
            console.log('=== INICIO DESCONEXIÓN DE INSTANCIA ===');
            console.log('ID de instancia:', instanceId);

            const instance = await Instance.getInstance(instanceId);
            if (!instance) {
                console.log('Instancia no encontrada');
                if (res) {
                    return res.status(404).json({ error: 'Instancia no encontrada' });
                }
                return null;
            }

            console.log('Instancia encontrada:', instance.name);

            if (this.bots.has(instanceId)) {
                console.log('Desconectando cliente de WhatsApp...');
                const client = this.bots.get(instanceId);
                console.log('Cliente encontrado:', client.destroy);
                
                try {
                    // Intentar destruir el cliente de manera segura
                    try {
                        console.log('Destruyendo cliente...');
                        // Verificar si el cliente tiene los métodos necesarios
                        if (typeof client.destroy === 'function') {
                            // Intentar destruir el cliente
                            await client.destroy();
                            console.log('Cliente destruido');
                        } else {
                            console.log('El cliente no tiene el método destroy, procediendo con limpieza...');
                        }
                    } catch (destroyError) {
                        console.error('Error al destruir cliente:', destroyError);
                        console.log('Procediendo con limpieza a pesar del error...');
                    }

                    // Eliminar del mapa de instancias
                    this.bots.delete(instanceId);
                    console.log('Cliente eliminado del mapa de instancias');

                    // Eliminar la instancia de la base de datos
                    try {
                        await Instance.deleteInstance(instanceId);
                        console.log('Instancia eliminada de la base de datos');
                    } catch (deleteError) {
                        console.error('Error al eliminar instancia:', deleteError);
                        // Intentar forzar la eliminación
                        try {
                            await Instance.deleteInstance(instanceId, true);
                            console.log('Instancia eliminada de la base de datos (forzado)');
                        } catch (forceDeleteError) {
                            console.error('Error al forzar eliminación de instancia:', forceDeleteError);
                        }
                    }
                } catch (error) {
                    console.error('Error general al desconectar cliente:', error);
                    // Intentar forzar la limpieza
                    try {
                        this.bots.delete(instanceId);
                        console.log('Cliente eliminado del mapa de instancias (forzado)');
                        
                        // Intentar eliminar la instancia de la base de datos
                        try {
                            await Instance.deleteInstance(instanceId, true);
                            console.log('Instancia eliminada de la base de datos (forzado)');
                        } catch (forceDeleteError) {
                            console.error('Error al forzar eliminación de instancia:', forceDeleteError);
                        }
                    } catch (forceError) {
                        console.error('Error al forzar la limpieza:', forceError);
                    }
                }
            } else {
                console.log('No se encontró cliente activo para esta instancia');
                // Intentar eliminar la instancia de la base de datos
                try {
                    await Instance.deleteInstance(instanceId);
                    console.log('Instancia eliminada de la base de datos');
                } catch (deleteError) {
                    console.error('Error al eliminar instancia:', deleteError);
                    // Intentar forzar la eliminación
                    try {
                        await Instance.deleteInstance(instanceId, true);
                        console.log('Instancia eliminada de la base de datos (forzado)');
                    } catch (forceDeleteError) {
                        console.error('Error al forzar eliminación de instancia:', forceDeleteError);
                    }
                }
            }

            if (res) {
                return res.json({
                    status: 'success',
                    message: 'Instancia desconectada y eliminada correctamente'
                });
            }
            return true;
        } catch (error) {
            console.error('Error al desconectar instancia:', error);
            if (res) {
                return res.status(500).json({ 
                    error: 'Error al desconectar la instancia',
                    details: error.message 
                });
            }
            throw error;
        }
    }

    // Reiniciar todas las instancias
    async restartAllInstances(req, res) {
        try {
            console.log('=== INICIO DE REINICIO DE TODAS LAS INSTANCIAS ===');
            
            // Obtener todas las instancias
            const instances = await Instance.getAllInstances();
            console.log(`Instancias encontradas: ${instances.length}`);

            // Desconectar todas las instancias primero
            for (const instance of instances) {
                console.log(`\nDesconectando instancia: ${instance.name} (${instance.id})`);
                try {
                    if (this.bots.has(instance.id)) {
                        const client = this.bots.get(instance.id);
                        
                        // Forzar el cierre de Puppeteer
                        try {
                            // Cerrar todas las páginas
                            if (client.pupBrowser) {
                                console.log('Obteniendo páginas abiertas...');
                                const pages = await client.pupBrowser.pages();
                                console.log(`Cerrando ${pages.length} páginas...`);
                                
                                for (const page of pages) {
                                    try {
                                        await page.close();
                                        console.log('Página cerrada');
                                    } catch (pageError) {
                                        console.error('Error al cerrar página:', pageError);
                                    }
                                }
                            }

                            // Cerrar la página principal
                            if (client.pupPage) {
                                console.log('Cerrando página principal...');
                                try {
                                    await client.pupPage.close();
                                    console.log('Página principal cerrada');
                                } catch (pageError) {
                                    console.error('Error al cerrar página principal:', pageError);
                                }
                            }

                            // Cerrar el navegador
                            if (client.pupBrowser) {
                                console.log('Cerrando navegador...');
                                try {
                                    await client.pupBrowser.close();
                                    console.log('Navegador cerrado');
                                } catch (browserError) {
                                    console.error('Error al cerrar navegador:', browserError);
                                }
                            }

                            // Forzar el cierre del proceso de Chrome
                            if (client.pupBrowser && client.pupBrowser.process()) {
                                console.log('Forzando cierre del proceso de Chrome...');
                                try {
                                    const process = client.pupBrowser.process();
                                    if (process) {
                                        process.kill();
                                        console.log('Proceso de Chrome terminado');
                                    }
                                } catch (processError) {
                                    console.error('Error al terminar proceso de Chrome:', processError);
                                }
                            }
                        } catch (puppeteerError) {
                            console.error('Error al cerrar Puppeteer:', puppeteerError);
                        }

                        // Intentar destruir el cliente
                        try {
                            if (typeof client.destroy === 'function') {
                                await client.destroy();
                                console.log('Cliente destruido');
                            }
                        } catch (destroyError) {
                            console.error('Error al destruir cliente:', destroyError);
                        }

                        // Eliminar del mapa de instancias
                        this.bots.delete(instance.id);
                        console.log('Cliente eliminado del mapa de instancias');
                    }
                } catch (error) {
                    console.error(`Error al desconectar instancia ${instance.name}:`, error);
                }
            }

            // Limpiar el mapa de instancias
            this.bots.clear();
            console.log('Mapa de instancias limpiado');

            // Esperar un momento para asegurar que todo se haya cerrado
            console.log('Esperando 5 segundos para asegurar el cierre de todos los procesos...');
            await new Promise(resolve => setTimeout(resolve, 5000));

            if (res) {
                // Enviar respuesta antes de reiniciar
                res.json({
                    status: 'success',
                    message: 'Reiniciando el servicio...'
                });
            }

            console.log('=== REINICIANDO SERVICIO ===');
            
            // Esperar un momento para asegurar que la respuesta se envíe
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Reiniciar solo este servicio usando PM2
            const { exec } = require('child_process');
            const appName = 'evo-app';

            console.log('Reiniciando servicio con PM2...');
            exec(`pm2 restart ${appName}`, (restartError) => {
                if (restartError) {
                    console.error('Error al reiniciar servicio:', restartError);
                    process.exit(1);
                }
                console.log('Servicio reiniciado exitosamente');
                process.exit(0);
            });
        } catch (error) {
            console.error('Error al reiniciar instancias:', error);
            if (res) {
                return res.status(500).json({ 
                    error: 'Error al reiniciar las instancias',
                    details: error.message 
                });
            }
            throw error;
        }
    }
}

module.exports = new InstanceController(); 
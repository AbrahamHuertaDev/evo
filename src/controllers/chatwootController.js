const axios = require('axios');
const Instance = require('../models/Instance');
const { MessageMedia } = require('whatsapp-web.js');

class ChatwootController {
    constructor() {
        this.chatwootApiUrl = process.env.CHATWOOT_API_URL;
        
        // Vincular los métodos al contexto de la clase
        this.connectToChatwoot = this.connectToChatwoot.bind(this);
        this.createChatwootInbox = this.createChatwootInbox.bind(this);
        this.handleChatwootWebhook = this.handleChatwootWebhook.bind(this);
        this.handleWhatsAppMessage = this.handleWhatsAppMessage.bind(this);
    }

    async connectToChatwoot(req, res) {
        try {
            const { instanceId } = req.params;
            const { inboxName = 'WhatsApp Inbox', accountId, apiToken } = req.body;

            if (!accountId) {
                return res.status(400).json({ 
                    error: 'El ID de la cuenta de Chatwoot es requerido' 
                });
            }

            if (!apiToken) {
                return res.status(400).json({ 
                    error: 'El token de API de Chatwoot es requerido' 
                });
            }

            // Verificar que la instancia existe
            const instance = await Instance.getInstance(instanceId);
            if (!instance) {
                return res.status(404).json({ error: 'Instancia no encontrada' });
            }

            // Crear el inbox en Chatwoot
            const inbox = await this.createChatwootInbox(inboxName, accountId, instanceId, apiToken);

            // Actualizar la instancia con la información de Chatwoot
            const updatedInstance = await Instance.updateInstance(instanceId, {
                chatwootInboxId: inbox.id,
                chatwootInboxName: inboxName,
                chatwootAccountId: accountId,
                chatwootApiToken: apiToken
            });

            return res.json({
                status: 'success',
                message: 'Instancia conectada a Chatwoot exitosamente',
                data: {
                    instance: updatedInstance,
                    chatwoot: {
                        inbox: inbox
                    }
                }
            });
        } catch (error) {
            console.error('Error al conectar con Chatwoot:', error);
            return res.status(500).json({ 
                error: 'Error al conectar con Chatwoot',
                details: error.message 
            });
        }
    }

    async createChatwootInbox(name, accountId, instanceId, apiToken) {
        try {
            const response = await axios.post(
                `${this.chatwootApiUrl}/api/v1/accounts/${accountId}/inboxes`,
                {
                    name: name,
                    greeting_enabled: false,
                    enable_email_collect: true,
                    csat_survey_enabled: true,
                    enable_auto_assignment: true,
                    working_hours_enabled: true,
                    out_of_office_message: "Estamos fuera de la oficina. Por favor, deja un mensaje y nos pondremos en contacto contigo pronto.",
                    timezone: "America/Mexico_City",
                    allow_messages_after_resolved: true,
                    lock_to_single_conversation: true,
                    sender_name_type: "friendly",
                    business_name: name,
                    channel: {
                        type: 'api',
                        webhook_url: `${process.env.API_URL}/webhook/${instanceId}`
                    }
                },
                {
                    headers: {
                        'api_access_token': apiToken,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error('Error al crear inbox en Chatwoot:', error.response?.data || error.message);
            throw new Error(`Error al crear inbox en Chatwoot: ${error.response?.data?.error || error.message}`);
        }
    }

    async handleChatwootWebhook(req, res) {
        try {
            const { instanceId } = req.params;
            const webhookData = req.body;

            // Verificar que la instancia existe
            const instance = await Instance.getInstance(instanceId);
            if (!instance) {
                return res.status(404).json({ error: 'Instancia no encontrada' });
            }

            // Verificar que la instancia tiene la configuración de Chatwoot
            if (!instance.chatwootApiToken || !instance.chatwootAccountId) {
                return res.status(400).json({ 
                    error: 'La instancia no está configurada con Chatwoot' 
                });
            }

            // Obtener el cliente de WhatsApp
            const client = this.bots.get(instanceId);
            if (!client) {
                return res.status(404).json({ error: 'Cliente de WhatsApp no encontrado' });
            }

            // Procesar el mensaje de Chatwoot
            if (webhookData.event === 'message_created') {
                const message = webhookData.message;
                const conversation = webhookData.conversation;

                // Verificar si el mensaje tiene archivos adjuntos
                if (message.attachments && message.attachments.length > 0) {
                    for (const attachment of message.attachments) {
                        // Descargar el archivo
                        const fileResponse = await axios.get(attachment.data_url, {
                            responseType: 'arraybuffer'
                        });

                        // Enviar el archivo a WhatsApp
                        await client.sendMessage(
                            conversation.meta.sender.phone_number,
                            new MessageMedia(
                                attachment.content_type,
                                Buffer.from(fileResponse.data).toString('base64'),
                                attachment.name
                            )
                        );
                    }
                }

                // Enviar el mensaje de texto si existe
                if (message.content) {
                    await client.sendMessage(conversation.meta.sender.phone_number, message.content);
                }

                return res.json({
                    status: 'success',
                    message: 'Mensaje enviado a WhatsApp'
                });
            }

            return res.json({
                status: 'success',
                message: 'Webhook procesado'
            });
        } catch (error) {
            console.error('Error al procesar webhook de Chatwoot:', error);
            return res.status(500).json({ 
                error: 'Error al procesar webhook de Chatwoot',
                details: error.message 
            });
        }
    }

    async handleWhatsAppMessage(message, instance) {
        try {
            console.log('=== MANEJANDO MENSAJE DE WHATSAPP ===');
            console.log('ID de instancia:', instance.id);
            console.log('Mensaje recibido:', message);

            // Verificar si la instancia existe
            if (!instance) {
                console.error('Instancia no encontrada');
                return;
            }

            // Verificar si la instancia tiene configuración de Chatwoot
            if (!instance.chatwootInboxId || !instance.chatwootAccountId || !instance.chatwootApiToken) {
                console.error('Instancia no configurada con Chatwoot');
                return;
            }

            console.log('Configuración de Chatwoot:', {
                inboxId: instance.chatwootInboxId,
                accountId: instance.chatwootAccountId,
                hasApiToken: !!instance.chatwootApiToken
            });

            // Extraer el número de teléfono del remitente
            const phoneNumber = message.from.split('@')[0];
            console.log('Número de teléfono:', phoneNumber);

            // Buscar o crear el contacto en Chatwoot
            const contactResponse = await this.findOrCreateContact(phoneNumber, instance);
            console.log('Contacto encontrado/creado:', contactResponse);

            if (!contactResponse || !contactResponse.contact || !contactResponse.contact.id) {
                console.error('No se pudo obtener/crear el contacto');
                return;
            }

            const contactId = contactResponse.contact.id;
            console.log('ID del contacto:', contactId);

            // Buscar o crear la conversación
            const conversationResponse = await this.findOrCreateConversation(contactId, instance);
            console.log('Conversación encontrada/creada:', conversationResponse);

            if (!conversationResponse || !conversationResponse.conversation || !conversationResponse.conversation.id) {
                console.error('No se pudo obtener/crear la conversación');
                return;
            }

            const conversationId = conversationResponse.conversation.id;
            console.log('ID de la conversación:', conversationId);

            // Procesar el mensaje según su tipo
            let messageContent = '';
            let attachments = [];

            if (message.type === 'chat') {
                messageContent = message.body;
            } else if (message.type === 'image' || message.type === 'video' || message.type === 'document') {
                // Descargar el archivo
                const media = await message.downloadMedia();
                if (media) {
                    attachments.push({
                        data: media.data,
                        filename: media.filename || `file.${media.mimetype.split('/')[1]}`,
                        content_type: media.mimetype
                    });
                }
                messageContent = message.caption || '';
            } else if (message.type === 'location') {
                messageContent = `📍 Ubicación: ${message.location.latitude}, ${message.location.longitude}`;
            }

            console.log('Contenido del mensaje:', messageContent);
            console.log('Archivos adjuntos:', attachments.length);

            // Crear el mensaje en Chatwoot
            const messageData = {
                content: messageContent,
                message_type: 'incoming',
                private: false,
                account_id: instance.chatwootAccountId,
                attachments: attachments,
                api_access_token: instance.chatwootApiToken
            };

            console.log('Enviando mensaje a Chatwoot:', messageData);
            const response = await this.createMessage(conversationId, messageData);
            console.log('Respuesta de Chatwoot:', response);

            return response;
        } catch (error) {
            console.error('Error al procesar mensaje de WhatsApp:', error);
            console.error('Stack trace:', error.stack);
            throw error;
        }
    }

    async findOrCreateContact(phoneNumber, instance) {
        try {
            console.log('=== BUSCANDO/CREANDO CONTACTO ===');
            console.log('Número original:', phoneNumber);

            // Formatear número a E.164 (asumiendo que es un número mexicano)
            const formattedNumber = this.formatPhoneNumber(phoneNumber);
            console.log('Número formateado:', formattedNumber);

            // Buscar contacto por número de teléfono
            const searchResponse = await axios.get(
                `${this.chatwootApiUrl}/api/v1/accounts/${instance.chatwootAccountId}/contacts/search`,
                {
                    params: { q: formattedNumber },
                    headers: {
                        'api_access_token': instance.chatwootApiToken,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Respuesta de búsqueda:', JSON.stringify(searchResponse.data, null, 2));

            if (searchResponse.data && searchResponse.data.payload && searchResponse.data.payload.length > 0) {
                console.log('Contacto existente encontrado');
                // Devolver el contacto en el mismo formato que la creación
                return {
                    contact: searchResponse.data.payload[0]
                };
            }

            console.log('Creando nuevo contacto...');
            // Si no existe, crear nuevo contacto
            const createResponse = await axios.post(
                `${this.chatwootApiUrl}/api/v1/accounts/${instance.chatwootAccountId}/contacts`,
                {
                    name: `WhatsApp ${formattedNumber}`,
                    phone_number: formattedNumber,
                    custom_attributes: {
                        source: 'whatsapp'
                    }
                },
                {
                    headers: {
                        'api_access_token': instance.chatwootApiToken,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Respuesta de creación:', JSON.stringify(createResponse.data, null, 2));

            if (!createResponse.data || !createResponse.data.payload) {
                throw new Error('Respuesta inválida al crear contacto');
            }

            console.log('Contacto creado exitosamente');
            return createResponse.data.payload;
        } catch (error) {
            console.error('Error al buscar/crear contacto:', error.response?.data || error.message);
            throw new Error(`Error al buscar/crear contacto en Chatwoot: ${error.response?.data?.error || error.message}`);
        }
    }

    formatPhoneNumber(phoneNumber) {
        // Eliminar caracteres no numéricos
        let cleaned = phoneNumber.replace(/\D/g, '');
        
        // Si el número comienza con 52 (código de México), asegurarse de que tenga el + al inicio
        if (cleaned.startsWith('52')) {
            return `+${cleaned}`;
        }
        
        // Si el número no tiene código de país, asumir que es mexicano y agregar +52
        if (cleaned.length === 10) {
            return `+52${cleaned}`;
        }
        
        // Si el número ya tiene el formato correcto, solo agregar el +
        return `+${cleaned}`;
    }

    async findOrCreateConversation(contactId, instance) {
        try {
            console.log('=== BUSCANDO/CREANDO CONVERSACIÓN ===');
            console.log('Account ID:', instance.chatwootAccountId);
            console.log('Inbox ID:', instance.chatwootInboxId);
            console.log('Contact ID:', contactId);

            if (!contactId) {
                throw new Error('ID de contacto no proporcionado');
            }

            // Buscar conversación activa
            const searchResponse = await axios.get(
                `${this.chatwootApiUrl}/api/v1/accounts/${instance.chatwootAccountId}/conversations`,
                {
                    params: {
                        inbox_id: instance.chatwootInboxId,
                        contact_id: contactId,
                        status: 'open'
                    },
                    headers: {
                        'api_access_token': instance.chatwootApiToken,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Respuesta de búsqueda:', JSON.stringify(searchResponse.data, null, 2));

            // Verificar si hay conversaciones en la respuesta
            if (searchResponse.data && searchResponse.data.data && searchResponse.data.data.payload) {
                const conversations = searchResponse.data.data.payload;
                if (conversations.length > 0) {
                    console.log('Conversación existente encontrada');
                    return {
                        conversation: conversations[0]
                    };
                }
            }

            console.log('Creando nueva conversación...');
            // Si no existe, crear nueva conversación
            const createPayload = {
                inbox_id: instance.chatwootInboxId,
                contact_id: contactId,
                source: 'api',
                status: 'open',
                additional_attributes: {
                    source: 'whatsapp'
                }
            };

            console.log('Payload de creación:', JSON.stringify(createPayload, null, 2));

            const createResponse = await axios.post(
                `${this.chatwootApiUrl}/api/v1/accounts/${instance.chatwootAccountId}/conversations`,
                createPayload,
                {
                    headers: {
                        'api_access_token': instance.chatwootApiToken,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Respuesta de creación:', JSON.stringify(createResponse.data, null, 2));

            // Verificar la respuesta de creación
            if (!createResponse.data) {
                throw new Error('Respuesta vacía al crear conversación');
            }

            // La respuesta puede venir en diferentes formatos
            let conversation;
            if (createResponse.data.payload) {
                conversation = createResponse.data.payload;
            } else if (createResponse.data.conversation) {
                conversation = createResponse.data.conversation;
            } else {
                conversation = createResponse.data;
            }

            if (!conversation || !conversation.id) {
                console.error('Respuesta inválida:', createResponse.data);
                throw new Error('No se pudo obtener la conversación de la respuesta');
            }

            console.log('Conversación creada exitosamente');
            return {
                conversation: conversation
            };
        } catch (error) {
            console.error('Error al buscar/crear conversación:', error.response?.data || error.message);
            throw new Error(`Error al buscar/crear conversación en Chatwoot: ${error.response?.data?.error || error.message}`);
        }
    }

    async createMessage(conversationId, messageData) {
        try {
            console.log('=== CREANDO MENSAJE ===');
            console.log('Conversation ID:', conversationId);
            console.log('Contenido:', messageData.content);
            console.log('Archivos adjuntos:', messageData.attachments.length);

            // Si hay archivos adjuntos, crear el mensaje con ellos
            if (messageData.attachments.length > 0) {
                const FormData = require('form-data');
                const formData = new FormData();
                
                // Agregar el contenido del mensaje
                formData.append('content', messageData.content);
                formData.append('message_type', 'incoming');

                // Agregar cada archivo adjunto
                for (const attachment of messageData.attachments) {
                    // Convertir el base64 a buffer
                    const buffer = Buffer.from(attachment.data, 'base64');
                    
                    // Agregar el archivo al form-data
                    formData.append('attachments[]', buffer, {
                        filename: attachment.filename,
                        contentType: attachment.content_type
                    });
                }

                console.log('Enviando mensaje con archivos adjuntos...');
                const response = await axios.post(
                    `${this.chatwootApiUrl}/api/v1/accounts/${messageData.account_id}/conversations/${conversationId}/messages`,
                    formData,
                    {
                        headers: {
                            'api_access_token': messageData.api_access_token,
                            ...formData.getHeaders()
                        }
                    }
                );
                return response.data;
            }

            // Si no hay archivos adjuntos, crear mensaje normal
            console.log('Enviando mensaje sin archivos adjuntos...');
            const response = await axios.post(
                `${this.chatwootApiUrl}/api/v1/accounts/${messageData.account_id}/conversations/${conversationId}/messages`,
                {
                    content: messageData.content,
                    message_type: 'incoming'
                },
                {
                    headers: {
                        'api_access_token': messageData.api_access_token,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error('Error al crear mensaje:', error.response?.data || error.message);
            throw new Error(`Error al crear mensaje en Chatwoot: ${error.response?.data?.error || error.message}`);
        }
    }
}

module.exports = new ChatwootController(); 
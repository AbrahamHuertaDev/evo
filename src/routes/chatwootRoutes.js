const express = require('express');
const router = express.Router();
const chatwootController = require('../controllers/chatwootController');

// Conectar una instancia a Chatwoot
router.post('/connect/:instanceId', chatwootController.connectToChatwoot);

// Webhook para recibir mensajes de Chatwoot
router.post('/webhook/:instanceId', chatwootController.handleChatwootWebhook);

module.exports = router; 
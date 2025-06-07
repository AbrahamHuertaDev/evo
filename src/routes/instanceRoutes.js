const express = require('express');
const router = express.Router();
const instanceController = require('../controllers/instanceController');

// Rutas CRUD para instancias
router.post('/', instanceController.createInstance);
router.get('/', instanceController.getInstances);
router.get('/:instanceId', instanceController.getInstance);
router.put('/:instanceId', instanceController.updateInstance);
router.delete('/:instanceId', instanceController.deleteInstance);

// Rutas de conexión
router.post('/:instanceId/connect', instanceController.connectInstance);
router.post('/:instanceId/disconnect', instanceController.disconnectInstance);

// Ruta para reiniciar todas las instancias
router.post('/restart-all', instanceController.restartAllInstances);

module.exports = router; 
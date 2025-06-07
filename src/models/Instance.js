const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class Instance {
    constructor() {
        this.dataDir = path.join(process.cwd(), 'data');
        this.instancesFile = path.join(this.dataDir, 'instances.json');
        this.instances = new Map();
        this.initialized = false;
        this.id = null;
        this.name = null;
        this.status = 'disconnected';
        this.qr = null;
        this.chatwootInboxId = null;
        this.chatwootWebhookId = null;
        this.chatwootInboxName = null;
        this.chatwootAccountId = null;
        this.chatwootApiToken = null;
        this.createdAt = null;
        this.updatedAt = null;
    }

    static fromJSON(json) {
        const instance = new Instance();
        instance.id = json.id;
        instance.name = json.name;
        instance.status = json.status;
        instance.qr = json.qr;
        instance.chatwootInboxId = json.chatwootInboxId;
        instance.chatwootWebhookId = json.chatwootWebhookId;
        instance.chatwootInboxName = json.chatwootInboxName;
        instance.chatwootAccountId = json.chatwootAccountId;
        instance.chatwootApiToken = json.chatwootApiToken;
        instance.createdAt = json.createdAt;
        instance.updatedAt = json.updatedAt;
        return instance;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            status: this.status,
            qr: this.qr,
            chatwootInboxId: this.chatwootInboxId,
            chatwootWebhookId: this.chatwootWebhookId,
            chatwootInboxName: this.chatwootInboxName,
            chatwootAccountId: this.chatwootAccountId,
            chatwootApiToken: this.chatwootApiToken,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    async initializeDB() {
        if (this.initialized) {
            return;
        }

        try {
            console.log('Inicializando base de datos de instancias...');
            console.log('Ruta del archivo:', this.instancesFile);

            // Crear directorio data si no existe
            await fs.mkdir(this.dataDir, { recursive: true });

            try {
                const data = await fs.readFile(this.instancesFile, 'utf8');
                const instances = JSON.parse(data);
                
                // Convertir el array a Map
                this.instances = new Map(instances.map(instance => [instance.id, instance]));
                
                console.log(`Base de datos inicializada con ${this.instances.size} instancias`);
                if (this.instances.size > 0) {
                    console.log('Instancias cargadas:');
                    this.instances.forEach(instance => {
                        console.log(`${instance.name} (${instance.id})`);
                    });
                }
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log('Archivo de instancias no encontrado, creando uno nuevo...');
                    await this.saveInstances();
                } else {
                    throw error;
                }
            }

            this.initialized = true;
        } catch (error) {
            console.error('Error al inicializar la base de datos:', error);
            throw error;
        }
    }

    async ensureInitialized() {
        if (!this.initialized) {
            await this.initializeDB();
        }
    }

    async saveInstances() {
        try {
            // Convertir Map a array para guardar
            const instancesArray = Array.from(this.instances.values());
            await fs.writeFile(this.instancesFile, JSON.stringify(instancesArray, null, 2));
        } catch (error) {
            console.error('Error al guardar instancias:', error);
            throw error;
        }
    }

    async createInstance(name) {
        try {
            await this.ensureInitialized();
            
            const instance = new Instance();
            instance.id = uuidv4();
            instance.name = name;
            instance.status = 'disconnected';
            instance.createdAt = new Date().toISOString();
            instance.updatedAt = new Date().toISOString();

            this.instances.set(instance.id, instance);
            await this.saveInstances();
            console.log(`Instancia creada: ${name} (${instance.id})`);
            return instance;
        } catch (error) {
            console.error('Error al crear instancia:', error);
            throw error;
        }
    }

    async getAllInstances() {
        try {
            await this.ensureInitialized();
            
            console.log('Obteniendo todas las instancias...');
            const instances = Array.from(this.instances.values());
            console.log(`${instances.length} instancias encontradas`);
            return instances;
        } catch (error) {
            console.error('Error al obtener instancias:', error);
            throw error;
        }
    }

    async getInstance(id) {
        try {
            await this.ensureInitialized();
            return this.instances.get(id);
        } catch (error) {
            console.error('Error al obtener instancia:', error);
            throw error;
        }
    }

    async updateInstance(id, updates) {
        try {
            await this.ensureInitialized();
            
            console.log('\n=== ACTUALIZANDO INSTANCIA ===');
            console.log('ID:', id);
            console.log('Actualizaciones:', JSON.stringify(updates, null, 2));
            
            const instance = this.instances.get(id);
            if (!instance) {
                console.log('Instancia no encontrada');
                throw new Error('Instancia no encontrada');
            }

            console.log('Instancia actual:', JSON.stringify(instance, null, 2));

            // Asegurar que todos los campos de Chatwoot se actualicen correctamente
            const chatwootUpdates = {
                chatwootInboxId: updates.chatwootInboxId || instance.chatwootInboxId,
                chatwootWebhookId: updates.chatwootWebhookId || instance.chatwootWebhookId,
                chatwootInboxName: updates.chatwootInboxName || instance.chatwootInboxName,
                chatwootAccountId: updates.chatwootAccountId || instance.chatwootAccountId,
                chatwootApiToken: updates.chatwootApiToken || instance.chatwootApiToken
            };

            // Crear una nueva instancia con los datos actualizados
            const updatedInstance = Instance.fromJSON({
                ...instance,
                ...updates,
                ...chatwootUpdates,
                updatedAt: new Date().toISOString()
            });

            console.log('Instancia actualizada:', JSON.stringify(updatedInstance, null, 2));

            // Guardar la instancia actualizada
            this.instances.set(id, updatedInstance);
            await this.saveInstances();
            
            return updatedInstance;
        } catch (error) {
            console.error('Error al actualizar instancia:', error);
            console.error('Stack trace:', error.stack);
            throw error;
        }
    }

    async updateInstanceStatus(id, status, qr = null) {
        try {
            await this.ensureInitialized();
            
            const instance = this.instances.get(id);
            if (!instance) {
                throw new Error('Instancia no encontrada');
            }

            const updates = {
                status,
                updatedAt: new Date().toISOString()
            };

            if (qr) {
                updates.qr = qr;
            }

            const updatedInstance = {
                ...instance,
                ...updates
            };

            this.instances.set(id, updatedInstance);
            await this.saveInstances();
            return updatedInstance;
        } catch (error) {
            console.error('Error al actualizar estado de instancia:', error);
            throw error;
        }
    }

    async deleteInstance(id) {
        try {
            await this.ensureInitialized();
            
            if (!this.instances.has(id)) {
                throw new Error('Instancia no encontrada');
            }

            this.instances.delete(id);
            await this.saveInstances();
        } catch (error) {
            console.error('Error al eliminar instancia:', error);
            throw error;
        }
    }
}

// Crear una única instancia del modelo
const instanceModel = new Instance();

// Inicializar la base de datos
instanceModel.initializeDB().catch(console.error);

module.exports = instanceModel; 
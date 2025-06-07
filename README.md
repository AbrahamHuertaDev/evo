# BuilderBot API

Esta es una API para crear y gestionar instancias de BuilderBot.

## Instalación

1. Clona este repositorio
2. Instala las dependencias:
```bash
npm install
```

## Configuración

1. Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:
```
PORT=3001
NODE_ENV=development
```

## Uso

Para iniciar el servidor en modo desarrollo:
```bash
npm run dev
```

Para iniciar el servidor en modo producción:
```bash
npm start
```

## Endpoints

### Enviar mensaje
```bash
POST /v1/messages
{
    "number": "34000000",
    "message": "Hola!"
}
```

### Gestionar lista negra
```bash
POST /v1/blacklist
{
    "number": "34000000",
    "intent": "add" // o "remove"
}
```

## Notas

- Asegúrate de tener Node.js instalado (versión 14 o superior)
- El servidor se ejecutará por defecto en el puerto 3001 
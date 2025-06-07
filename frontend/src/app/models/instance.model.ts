export interface Instance {
    id: string;
    name: string;
    status: 'disconnected' | 'connecting' | 'connected' | 'waiting_qr' | 'error' | 'auth_failed';
    qr?: string;
    chatwootInboxId?: string;
    chatwootApiToken?: string;
    createdAt: Date;
    updatedAt: Date;
} 
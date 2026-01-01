// realtime.js
class RealtimeManager {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.subscriptions = new Set();
        this.messageHandlers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        
        this.initializeWebSocket();
    }

    initializeWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.connected = true;
                this.reconnectAttempts = 0;
                
                // Resubscribe to previous subscriptions
                this.subscriptions.forEach(subscription => {
                    this.subscribe(subscription.type, subscription.id);
                });
                
                // Dispatch connection event
                this.dispatchEvent('connected', { timestamp: new Date().toISOString() });
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('WebSocket message error:', error);
                }
            };
            
            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.connected = false;
                this.handleDisconnection();
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.connected = false;
            };
            
        } catch (error) {
            console.error('WebSocket initialization error:', error);
            this.scheduleReconnect();
        }
    }

    handleMessage(data) {
        const { type, ...payload } = data;
        
        // Call registered handlers for this message type
        if (this.messageHandlers.has(type)) {
            this.messageHandlers.get(type).forEach(handler => {
                try {
                    handler(payload);
                } catch (error) {
                    console.error('Message handler error:', error);
                }
            });
        }
        
        // Dispatch custom event
        this.dispatchEvent(type, payload);
    }

    handleDisconnection() {
        this.dispatchEvent('disconnected', { timestamp: new Date().toISOString() });
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            this.initializeWebSocket();
        }, Math.min(delay, 30000)); // Max 30 seconds delay
    }

    subscribe(type, id) {
        if (!this.connected || !this.ws) {
            // Store subscription for when connection is restored
            this.subscriptions.add({ type, id });
            return false;
        }

        const subscription = { type, id };
        this.subscriptions.add(subscription);
        
        this.ws.send(JSON.stringify({
            type: `subscribe_${type}`,
            payload: { [type]: id }
        }));
        
        return true;
    }

    unsubscribe(type, id) {
        const subscription = Array.from(this.subscriptions).find(sub => 
            sub.type === type && sub.id === id
        );
        
        if (subscription) {
            this.subscriptions.delete(subscription);
            
            if (this.connected && this.ws) {
                this.ws.send(JSON.stringify({
                    type: `unsubscribe_${type}`,
                    payload: { [type]: id }
                }));
            }
        }
    }

    on(event, handler) {
        if (!this.messageHandlers.has(event)) {
            this.messageHandlers.set(event, new Set());
        }
        this.messageHandlers.get(event).add(handler);
    }

    off(event, handler) {
        if (this.messageHandlers.has(event)) {
            this.messageHandlers.get(event).delete(handler);
        }
    }

    dispatchEvent(event, data) {
        // Dispatch DOM event
        const customEvent = new CustomEvent(`realtime:${event}`, { detail: data });
        document.dispatchEvent(customEvent);
    }

    send(type, payload) {
        if (this.connected && this.ws) {
            this.ws.send(JSON.stringify({ type, payload }));
            return true;
        }
        return false;
    }

    getConnectionStatus() {
        return {
            connected: this.connected,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            subscriptions: Array.from(this.subscriptions)
        };
    }
}

// Create global instance
window.realtimeManager = new RealtimeManager();

// Export for module usage
export default window.realtimeManager;
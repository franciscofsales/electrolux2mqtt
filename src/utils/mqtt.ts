/**
 * MQTT client module that handles connection to an MQTT broker
 */
import mqtt from 'mqtt';
import logger from './logger.js';

export interface MqttConfig {
  brokerUrl: string;
  clientId: string;
  username?: string;
  password?: string;
  port?: number;
  protocol?: 'mqtt' | 'mqtts' | 'ws' | 'wss';
  connectTimeout?: number;
}

export class MqttConnector {
  private client: mqtt.MqttClient | null = null;
  private readonly config: MqttConfig;
  private connected = false;
  
  constructor(config: MqttConfig) {
    this.config = config;
  }

  /**
   * Connect to the MQTT broker
   * @returns A promise that resolves when connected and rejects if connection fails
   */
  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        logger.info('Connecting to MQTT broker...', { url: this.config.brokerUrl });
        
        // Set a timeout to fail if connection takes too long
        const timeout = setTimeout(() => {
          reject(new Error(`Connection to MQTT broker timed out after ${this.config.connectTimeout || 5000}ms`));
        }, this.config.connectTimeout || 5000);
        
        // Create connection options
        const options: mqtt.IClientOptions = {
          clientId: this.config.clientId,
          clean: true,
          connectTimeout: this.config.connectTimeout || 5000,
          rejectUnauthorized: false,  // Accept self-signed certificates
        };
        
        // Add auth if provided
        if (this.config.username && this.config.password) {
          options.username = this.config.username;
          options.password = this.config.password;
        }

        // Connect to the broker
        this.client = mqtt.connect(this.config.brokerUrl, options);

        // Set up event handlers
        this.client.on('connect', () => {
          clearTimeout(timeout);
          this.connected = true;
          logger.info('Successfully connected to MQTT broker');
          resolve();
        });

        this.client.on('error', (err) => {
          clearTimeout(timeout);
          logger.error('MQTT connection error', err);
          reject(err);
        });

        this.client.on('close', () => {
          this.connected = false;
          logger.warn('MQTT connection closed');
        });

        this.client.on('reconnect', () => {
          logger.info('Attempting to reconnect to MQTT broker...');
        });

        this.client.on('message', (topic, message) => {
          logger.debug('Received MQTT message', { topic, message: message.toString() });
        });
      } catch (error) {
        logger.error('Failed to establish MQTT connection', error);
        reject(error);
      }
    });
  }

  /**
   * Subscribe to an MQTT topic
   * @param topic The topic to subscribe to
   * @returns A promise that resolves when subscribed
   */
  public async subscribe(topic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.connected) {
        reject(new Error('Not connected to MQTT broker'));
        return;
      }

      this.client.subscribe(topic, (err) => {
        if (err) {
          logger.error(`Failed to subscribe to topic: ${topic}`, err);
          reject(err);
        } else {
          logger.info(`Subscribed to topic: ${topic}`);
          resolve();
        }
      });
    });
  }

  /**
   * Publish a message to an MQTT topic
   * @param topic The topic to publish to
   * @param message The message to publish
   * @param options MQTT publish options
   * @returns A promise that resolves when published
   */
  public async publish(topic: string, message: string, options?: mqtt.IClientPublishOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.connected) {
        reject(new Error('Not connected to MQTT broker'));
        return;
      }

      this.client.publish(topic, message, options || {}, (err) => {
        if (err) {
          logger.error(`Failed to publish to topic: ${topic}`, err);
          reject(err);
        } else {
          logger.debug(`Published to topic: ${topic}`, { message });
          resolve();
        }
      });
    });
  }

  /**
   * Disconnect from the MQTT broker
   */
  public disconnect(): void {
    if (this.client && this.connected) {
      this.client.end(true);
      this.connected = false;
      logger.info('Disconnected from MQTT broker');
    }
  }

  /**
   * Get the connection status
   * @returns True if connected, false otherwise
   */
  public isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Create an MQTT connector instance from environment variables
 */
export function createMqttConnectorFromEnv(): MqttConnector {
  // Required environment variables
  const brokerHost = process.env.MQTT_HOST;
  if (!brokerHost) {
    throw new Error('MQTT_HOST environment variable is required');
  }

  // Optional environment variables with defaults
  const clientId = process.env.MQTT_CLIENT_ID || `electrolux2mqtt_${Math.random().toString(16).substring(2, 8)}`;
  const protocol = (process.env.MQTT_PROTOCOL || 'mqtt') as 'mqtt' | 'mqtts' | 'ws' | 'wss';
  const port = process.env.MQTT_PORT ? parseInt(process.env.MQTT_PORT, 10) : undefined;
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;
  const connectTimeout = process.env.MQTT_CONNECT_TIMEOUT ? parseInt(process.env.MQTT_CONNECT_TIMEOUT, 10) : 5000;

  // Construct broker URL
  let brokerUrl = `${protocol}://${brokerHost}`;
  if (port) {
    brokerUrl += `:${port}`;
  }

  return new MqttConnector({
    brokerUrl,
    clientId,
    username,
    password,
    connectTimeout,
  });
}

export default createMqttConnectorFromEnv;
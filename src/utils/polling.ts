/**
 * Data polling service that fetches data at regular intervals
 * and publishes it to MQTT
 */
import logger from './logger.js';
import { MqttConnector } from './mqtt.js';
import { ApiClient, ApiResponse } from './api.js';

export interface PollingServiceConfig {
  intervalSeconds: number;
  topicPrefix: string;
  useMockData?: boolean;
}

export class PollingService {
  private readonly mqtt: MqttConnector;
  private readonly api: ApiClient;
  private readonly config: PollingServiceConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(mqtt: MqttConnector, api: ApiClient, config: PollingServiceConfig) {
    this.mqtt = mqtt;
    this.api = api;
    this.config = config;
  }

  /**
   * Start polling for data at the configured interval
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Polling service is already running');
      return;
    }

    logger.info('Starting polling service', {
      intervalSeconds: this.config.intervalSeconds,
      topicPrefix: this.config.topicPrefix,
      useMockData: this.config.useMockData || false,
    });

    // Execute once immediately
    this.pollAndPublish();

    // Then set up interval
    this.intervalId = setInterval(() => {
      this.pollAndPublish();
    }, this.config.intervalSeconds * 1000);

    this.isRunning = true;
  }

  /**
   * Stop the polling service
   */
  public stop(): void {
    if (!this.isRunning || !this.intervalId) {
      logger.warn('Polling service is not running');
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;

    logger.info('Polling service stopped');
  }

  /**
   * Check if the polling service is running
   */
  public isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Fetch data and publish it to MQTT
   */
  private async pollAndPublish(): Promise<void> {
    try {
      // Fetch data from API or use mock data
      const dataResponse = this.config.useMockData
        ? await this.api.fetchMockData()
        : await this.api.fetchData();

      // Handle case where response could be an array (multiple appliances)
      const dataArray = Array.isArray(dataResponse) ? dataResponse : [dataResponse];

      // Publish each appliance's data to a separate topic
      for (const data of dataArray) {
        // Create device-specific topic if appliance ID is available
        let topic = this.config.topicPrefix;

        if (data.applianceId && !data.error) {
          // Publish to device-specific topic
          topic = `${this.config.topicPrefix}/${data.applianceId}`;
          await this.mqtt.publish(topic, JSON.stringify(data));
          logger.info(`Published data for ${data.name || data.applianceId} to MQTT`, { topic });
        } else {
          // Fallback to general data topic
          topic = `${this.config.topicPrefix}/data`;
          await this.mqtt.publish(topic, JSON.stringify(data));
          logger.info('Published general data to MQTT', { topic });
        }
      }

      // Also publish a combined response to the general data topic
      await this.mqtt.publish(
        `${this.config.topicPrefix}/data`,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          devices: dataArray.length,
          appliances: dataArray.map(device => ({
            id: device.applianceId,
            name: device.name,
            connected: device.connected || false,
          })),
        })
      );
    } catch (error) {
      logger.error('Error in poll and publish cycle', error);
    }
  }
}

/**
 * Create a polling service from environment variables
 */
export function createPollingServiceFromEnv(mqtt: MqttConnector, api: ApiClient): PollingService {
  // Get polling interval from environment variable with default fallback
  const intervalSecondsStr = process.env.POLLING_INTERVAL_SECONDS || '30';
  const intervalSeconds = parseInt(intervalSecondsStr, 10);

  // Validate interval
  if (isNaN(intervalSeconds) || intervalSeconds < 5) {
    logger.warn(`Invalid polling interval: ${intervalSecondsStr}. Using default of 30 seconds.`);
  }

  // Use mock data if API_USE_MOCK is set to "true"
  const useMockData = process.env.API_USE_MOCK === 'true';

  return new PollingService(mqtt, api, {
    intervalSeconds: isNaN(intervalSeconds) || intervalSeconds < 5 ? 30 : intervalSeconds,
    topicPrefix: process.env.MQTT_TOPIC_PREFIX || 'electrolux2mqtt',
    useMockData,
  });
}

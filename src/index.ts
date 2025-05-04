import logger from './utils/logger.js';
import { createMqttConnectorFromEnv } from './utils/mqtt.js';
import { createApiClientFromEnv } from './utils/api.js';
import { createElectroluxApiClientFromEnv } from './services/electrolux.js';
import { createPollingServiceFromEnv } from './utils/polling.js';
import { createHomeAssistantServiceFromEnv } from './services/homeAssistant.js';

// Load environment variables is done through Node.js directly
// We don't use dotenv in production to avoid bundling issues

/**
 * Setup and test the MQTT connection
 */
async function setupMqttConnection() {
  try {
    // Create MQTT connector from environment variables
    const mqttConnector = createMqttConnectorFromEnv();

    // Connect to MQTT broker
    await mqttConnector.connect();

    // Publish a status message
    await mqttConnector.publish(
      'electrolux2mqtt/status',
      JSON.stringify({
        status: 'online',
        timestamp: new Date().toISOString(),
      })
    );

    // Return the connector for further use
    return mqttConnector;
  } catch (error) {
    logger.error('Failed to setup MQTT connection', error);
    // Exit with error code 1 to indicate failure
    process.exit(1);
  }
}

/**
 * Main entry point for the service
 */
async function startService(): Promise<void> {
  logger.info('Service starting...');

  try {
    // Connect to MQTT broker
    const mqttClient = await setupMqttConnection();

    // Create API client
    let apiClient;

    if (process.env.API_USE_MOCK === 'true') {
      logger.info('Using mock API client');
      apiClient = createApiClientFromEnv();
    } else {
      // Use Electrolux API client in production mode
      try {
        logger.info('Using Electrolux API client');
        apiClient = createElectroluxApiClientFromEnv();
      } catch (error) {
        logger.warn('Failed to create Electrolux API client', error);
        throw error;
      }
    }

    // Initialize Home Assistant integration if enabled
    const homeAssistantService = createHomeAssistantServiceFromEnv(mqttClient, apiClient);
    if (homeAssistantService) {
      await homeAssistantService.initialize();
    }

    // Create and start polling service
    const pollingService = createPollingServiceFromEnv(mqttClient, apiClient, homeAssistantService);
    pollingService.start();

    logger.info('Electrolux2MQTT service is now running');

    // Handle graceful shutdown
    const handleShutdown = () => {
      logger.info('Service shutting down...');

      // Stop polling service
      if (pollingService.isServiceRunning()) {
        pollingService.stop();
      }

      // Disconnect from MQTT
      mqttClient.disconnect();

      process.exit(0);
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    // Keep the process running
    process.stdin.resume();
  } catch (error) {
    logger.error('Error during service startup', error);
    process.exit(1);
  }
}

// Start the service and catch any unhandled errors
startService().catch(error => {
  logger.error('Unhandled error in service startup', error);
  process.exit(1);
});

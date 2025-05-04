/**
 * Home Assistant MQTT integration service
 *
 * This service provides Home Assistant MQTT auto-discovery and state updates
 * for Electrolux appliances. It will only be enabled when the HOME_ASSISTANT_ENABLED
 * environment variable is set.
 */
import { MqttConnector } from '../utils/mqtt.js';
import { ApiClient } from '../utils/api.js';
import { ElectroluxApiResponse } from './types.js';
import logger from '../utils/logger.js';

export interface HomeAssistantConfig {
  discoveryPrefix: string;
  nodeId: string;
  statusTopic: string;
  enabled: boolean;
}

export class HomeAssistantService {
  private readonly mqtt: MqttConnector;
  private readonly api: ApiClient;
  private readonly config: HomeAssistantConfig;
  private readonly deviceRegistrations: Map<string, boolean> = new Map();
  private readonly startTime: number = Date.now(); // Track when the service started
  private bridgeStateInterval: NodeJS.Timeout | null = null; // Timer for bridge state updates

  constructor(mqtt: MqttConnector, api: ApiClient, config: HomeAssistantConfig) {
    this.mqtt = mqtt;
    this.api = api;
    this.config = {
      ...config,
      // Ensure defaults are set consistently
      nodeId: config.nodeId || 'electrolux2mqtt',
      discoveryPrefix: config.discoveryPrefix || 'homeassistant',
      statusTopic: config.statusTopic || `${config.nodeId || 'electrolux2mqtt'}/status`,
    };
  }

  /**
   * Initialize the Home Assistant integration
   */
  public async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Home Assistant integration is disabled.');
      return;
    }

    logger.info('Initializing Home Assistant integration', {
      discoveryPrefix: this.config.discoveryPrefix,
      nodeId: this.config.nodeId,
    });

    // Publish availability status
    await this.publishAvailability('online');

    // Register the bridge as a device
    await this.registerBridge();

    // Setup shutdown hook to publish offline status when service stops
    process.on('SIGINT', this.handleShutdown.bind(this));
    process.on('SIGTERM', this.handleShutdown.bind(this));

    logger.info('Home Assistant integration initialized successfully');
  }

  /**
   * Handle graceful shutdown
   */
  private async handleShutdown(): Promise<void> {
    if (this.config.enabled) {
      // Clear the bridge state interval if it exists
      if (this.bridgeStateInterval) {
        clearInterval(this.bridgeStateInterval);
        this.bridgeStateInterval = null;
      }

      // Publish offline status
      await this.publishAvailability('offline');
      logger.info('Published offline status to Home Assistant');
    }
  }

  /**
   * Publish availability status for the bridge
   */
  private async publishAvailability(status: 'online' | 'offline'): Promise<void> {
    if (!this.config.enabled) return;

    try {
      await this.mqtt.publish(this.config.statusTopic, status, { retain: true });
      logger.info(`Published availability status: ${status}`);
    } catch (error) {
      logger.error(`Failed to publish availability status: ${status}`, error);
    }
  }

  /**
   * Process incoming appliance data and publish to Home Assistant
   */
  public async processApplianceData(
    data: ElectroluxApiResponse | ElectroluxApiResponse[]
  ): Promise<void> {
    if (!this.config.enabled) return;

    // Handle array of appliances or single appliance
    const applianceArray = Array.isArray(data) ? data : [data];

    for (const appliance of applianceArray) {
      if (!appliance.applianceId) {
        logger.warn('Received appliance data without ID, skipping', appliance);
        continue;
      }

      // Register device if not already registered
      await this.registerDevice(appliance);

      // Publish state updates
      await this.publishState(appliance);
    }
  }

  /**
   * Register a device with Home Assistant via MQTT discovery
   */
  private async registerDevice(appliance: ElectroluxApiResponse): Promise<void> {
    // Skip if already registered
    const originalId = appliance.applianceId;
    const applianceId = this.sanitizeId(originalId);
    if (this.deviceRegistrations.has(applianceId)) return;

    try {
      // Extract device info
      const deviceInfo = {
        identifiers: [originalId], // Keep original ID for device identifiers
        name: appliance.name || `Electrolux ${appliance.info.deviceType}`,
        manufacturer: 'Electrolux',
        model: `${appliance.info.modelName || 'Unknown'}${appliance.info.variant ? ` (${appliance.info.variant})` : ''}`,
        sw_version:
          appliance.state?.applianceMainBoardSwVersion ||
          appliance.state?.applianceUiSwVersion ||
          '1.0.0',
        via_device: this.config.nodeId,
      };

      // Create MQTT discovery configs based on available device state
      await this.createSensors(applianceId, originalId, deviceInfo, appliance);

      // Add to registered devices
      this.deviceRegistrations.set(applianceId, true);
      logger.info(
        `Registered device with Home Assistant: ${appliance.name || originalId} (${applianceId})`
      );
    } catch (error) {
      logger.error(`Failed to register device: ${originalId} (${applianceId})`, error);
    }
  }

  /**
   * Create MQTT discovery configurations for sensors based on available data
   */
  private async createSensors(
    applianceId: string,
    originalId: string,
    deviceInfo: any,
    appliance: ElectroluxApiResponse
  ): Promise<void> {
    const state = appliance.state || {};
    const stateTopic = `electrolux2mqtt/${applianceId}/state`;

    // Create connection state sensor
    await this.createSensor({
      applianceId,
      originalId,
      deviceInfo,
      name: 'Connection',
      deviceClass: 'connectivity',
      stateTopic,
      valueTemplate: '{{ value_json.connected }}',
      payloadOn: 'true',
      payloadOff: 'false',
      entityCategory: 'diagnostic',
      icon: 'mdi:wifi',
      component: 'binary_sensor',
    });

    // Create a device status sensor that aggregates key information
    await this.createSensor({
      applianceId,
      originalId,
      deviceInfo,
      name: 'Device Status',
      stateTopic,
      valueTemplate:
        appliance.info.deviceType === 'TUMBLE_DRYER'
          ? '{{ value_json.applianceState + (value_json.doorState ? " (Door " + value_json.doorState + ")" : "") }}'
          : '{{ value_json.status || value_json.applianceState || "Unknown" }}',
      icon: 'mdi:information',
      component: 'sensor',
    });

    // Check for temperature and create temp sensor if available
    if (state.temperature !== undefined) {
      await this.createSensor({
        applianceId,
        originalId,
        deviceInfo,
        name: 'Temperature',
        deviceClass: 'temperature',
        stateTopic,
        valueTemplate: '{{ value_json.temperature }}',
        unitOfMeasurement: '°C',
        component: 'sensor',
      });
    }

    // Check for humidity and create sensor if available
    if (state.humidity !== undefined) {
      await this.createSensor({
        applianceId,
        originalId,
        deviceInfo,
        name: 'Humidity',
        deviceClass: 'humidity',
        stateTopic,
        valueTemplate: '{{ value_json.humidity }}',
        unitOfMeasurement: '%',
        component: 'sensor',
      });
    }

    // If the device is a washer/dryer, tumble dryer, or dishwasher, create program status sensor
    if (
      appliance.info.deviceType === 'WASHER' ||
      appliance.info.deviceType === 'DRYER' ||
      appliance.info.deviceType === 'DISHWASHER' ||
      appliance.info.deviceType === 'TUMBLE_DRYER'
    ) {
      // Create program sensor based on device type
      await this.createSensor({
        applianceId,
        originalId,
        deviceInfo,
        name: 'Program',
        stateTopic,
        valueTemplate:
          appliance.info.deviceType === 'TUMBLE_DRYER'
            ? '{{ value_json.userSelections.programUID }}'
            : '{{ value_json.program }}',
        icon: 'mdi:washing-machine',
        component: 'sensor',
      });

      // Create status sensor based on device type
      await this.createSensor({
        applianceId,
        originalId,
        deviceInfo,
        name: 'Status',
        stateTopic,
        valueTemplate:
          appliance.info.deviceType === 'TUMBLE_DRYER'
            ? '{{ value_json.applianceState }}'
            : '{{ value_json.status }}',
        icon: 'mdi:information-outline',
        component: 'sensor',
      });

      // Create remaining time sensor if available
      if (
        state.remainingTime !== undefined ||
        (state.timeToEnd !== undefined && appliance.info.deviceType === 'TUMBLE_DRYER')
      ) {
        await this.createSensor({
          applianceId,
          originalId,
          deviceInfo,
          name: 'Remaining Time',
          stateTopic,
          valueTemplate:
            appliance.info.deviceType === 'TUMBLE_DRYER'
              ? '{{ value_json.timeToEnd | int / 60 }}'
              : '{{ value_json.remainingTime }}',
          unitOfMeasurement: 'min',
          icon: 'mdi:timer-outline',
          component: 'sensor',
        });
      }
    }

    // If the device is a tumble dryer, create specialized sensors
    if (appliance.info.deviceType === 'TUMBLE_DRYER') {
      // Door state sensor
      if (state.doorState !== undefined) {
        await this.createSensor({
          applianceId,
          originalId,
          deviceInfo,
          name: 'Door State',
          stateTopic,
          valueTemplate: '{{ value_json.doorState }}',
          icon: 'mdi:door',
          component: 'sensor',
        });
      }

      // Cycle phase sensor
      if (state.cyclePhase !== undefined) {
        await this.createSensor({
          applianceId,
          originalId,
          deviceInfo,
          name: 'Cycle Phase',
          stateTopic,
          valueTemplate: '{{ value_json.cyclePhase }}',
          icon: 'mdi:washing-machine',
          component: 'sensor',
        });
      }

      // Humidity target sensor
      if (state.userSelections?.humidityTarget !== undefined) {
        await this.createSensor({
          applianceId,
          originalId,
          deviceInfo,
          name: 'Humidity Target',
          stateTopic,
          valueTemplate: '{{ value_json.userSelections.humidityTarget }}',
          icon: 'mdi:water-percent',
          component: 'sensor',
        });
      }
    }

    // If the device is a refrigerator, create fridge/freezer temperature sensors
    if (appliance.info.deviceType === 'FRIDGE') {
      if (state.fridgeTemperature !== undefined) {
        await this.createSensor({
          applianceId,
          deviceInfo,
          name: 'Fridge Temperature',
          uniqueId: `${applianceId}_fridge_temperature`,
          deviceClass: 'temperature',
          stateTopic,
          valueTemplate: '{{ value_json.fridgeTemperature }}',
          unitOfMeasurement: '°C',
          component: 'sensor',
        });
      }

      if (state.freezerTemperature !== undefined) {
        await this.createSensor({
          applianceId,
          deviceInfo,
          name: 'Freezer Temperature',
          uniqueId: `${applianceId}_freezer_temperature`,
          deviceClass: 'temperature',
          stateTopic,
          valueTemplate: '{{ value_json.freezerTemperature }}',
          unitOfMeasurement: '°C',
          component: 'sensor',
        });
      }
    }

    // Add generic sensor for any available state property
    for (const [key, value] of Object.entries(state)) {
      // Skip properties already handled or that are objects/arrays
      if (
        key === 'connected' ||
        key === 'temperature' ||
        key === 'humidity' ||
        key === 'program' ||
        key === 'status' ||
        key === 'remainingTime' ||
        key === 'fridgeTemperature' ||
        key === 'freezerTemperature' ||
        key === 'doorState' ||
        key === 'timeToEnd' ||
        key === 'cyclePhase' ||
        key === 'applianceState' ||
        key === 'userSelections' ||
        key === 'device_status' ||
        typeof value === 'object'
      ) {
        continue;
      }

      // Create a generic sensor for this state property
      await this.createSensor({
        applianceId,
        originalId,
        deviceInfo,
        name: this.formatPropertyName(key),
        stateTopic,
        valueTemplate: `{{ value_json.${key} }}`,
        component: typeof value === 'boolean' ? 'binary_sensor' : 'sensor',
        payloadOn: typeof value === 'boolean' ? 'true' : undefined,
        payloadOff: typeof value === 'boolean' ? 'false' : undefined,
      });
    }
  }

  /**
   * Create a single MQTT discovery sensor configuration
   */
  private async createSensor(config: {
    applianceId: string;
    deviceInfo: any;
    name: string;
    uniqueId?: string; // Now optional as we'll generate it if not provided
    component: 'sensor' | 'binary_sensor';
    stateTopic: string;
    valueTemplate: string;
    deviceClass?: string;
    unitOfMeasurement?: string;
    icon?: string;
    entityCategory?: string;
    payloadOn?: string;
    payloadOff?: string;
    originalId?: string; // Add original ID for generating uniqueId
  }): Promise<void> {
    // If no uniqueId is provided, generate one using the sanitized original ID if available
    const uniqueId =
      config.uniqueId ||
      (config.originalId
        ? `${this.sanitizeId(config.originalId, true)}_${config.name.toLowerCase().replace(/\s+/g, '_')}`
        : `${config.applianceId}_${config.name.toLowerCase().replace(/\s+/g, '_')}`);

    const discoveryTopic = `${this.config.discoveryPrefix}/${config.component}/${config.applianceId}/${uniqueId.replace(/[^a-zA-Z0-9_\-]/g, '_')}/config`;

    const discoveryConfig: any = {
      name: config.name,
      unique_id: uniqueId,
      state_topic: config.stateTopic,
      value_template: config.valueTemplate,
      availability_topic: this.config.statusTopic,
      payload_available: 'online',
      payload_not_available: 'offline',
      device: config.deviceInfo,
    };

    // Add optional properties if provided
    if (config.deviceClass) discoveryConfig.device_class = config.deviceClass;
    if (config.unitOfMeasurement) discoveryConfig.unit_of_measurement = config.unitOfMeasurement;
    if (config.icon) discoveryConfig.icon = config.icon;
    if (config.entityCategory) discoveryConfig.entity_category = config.entityCategory;
    if (config.payloadOn) discoveryConfig.payload_on = config.payloadOn;
    if (config.payloadOff) discoveryConfig.payload_off = config.payloadOff;

    try {
      await this.mqtt.publish(discoveryTopic, JSON.stringify(discoveryConfig), { retain: true });
      logger.info(`Published discovery config for ${config.name}`, { topic: discoveryTopic });
    } catch (error) {
      logger.error(`Failed to publish discovery config for ${config.name}`, error);
    }
  }

  /**
   * Format a property name to be more human-readable
   */
  private formatPropertyName(propertyName: string): string {
    // Convert camelCase to Title Case with Spaces
    return propertyName
      .replace(/([A-Z])/g, ' $1') // Insert a space before all caps
      .replace(/^./, str => str.toUpperCase()) // Uppercase the first character
      .trim(); // Remove leading/trailing spaces
  }

  /**
   * Publish appliance state to Home Assistant
   */
  private async publishState(appliance: ElectroluxApiResponse): Promise<void> {
    const originalId = appliance.applianceId;
    const applianceId = this.sanitizeId(originalId);
    const stateTopic = `electrolux2mqtt/${applianceId}/state`;

    try {
      // Create a simplified state object for Home Assistant
      const stateData = {
        timestamp: new Date().toISOString(),
        connected: appliance.info.connected !== undefined ? appliance.info.connected : true,
        ...appliance.state,
      };

      await this.mqtt.publish(stateTopic, JSON.stringify(stateData), { retain: true });
      logger.info(`Published state for ${appliance.name || originalId} (${applianceId})`, {
        topic: stateTopic,
      });
    } catch (error) {
      logger.error(`Failed to publish state for ${originalId} (${applianceId})`, error);
    }
  }

  /**
   * Register the electrolux2mqtt bridge as a device in Home Assistant
   */
  private async registerBridge(): Promise<void> {
    const bridgeId = this.config.nodeId;
    const bridgeStateTopic = `${bridgeId}/state`;

    try {
      // Define the bridge device info
      const deviceInfo = {
        identifiers: [bridgeId],
        name: 'Electrolux2MQTT Bridge',
        manufacturer: 'fsales',
        model: 'Bridge',
        sw_version: process.env.npm_package_version || '1.0.0',
      };

      // Create connection status sensor
      await this.createSensor({
        applianceId: bridgeId,
        originalId: bridgeId, // Same as applianceId for bridge
        deviceInfo,
        name: 'Status',
        deviceClass: 'connectivity',
        stateTopic: this.config.statusTopic,
        valueTemplate: '{{ value }}',
        payloadOn: 'online',
        payloadOff: 'offline',
        entityCategory: 'diagnostic',
        icon: 'mdi:bridge',
        component: 'binary_sensor',
      });

      // Create version sensor
      await this.createSensor({
        applianceId: bridgeId,
        originalId: bridgeId,
        deviceInfo,
        name: 'Version',
        stateTopic: bridgeStateTopic,
        valueTemplate: '{{ value_json.version }}',
        entityCategory: 'diagnostic',
        icon: 'mdi:package-variant',
        component: 'sensor',
      });

      // Create uptime sensor
      await this.createSensor({
        applianceId: bridgeId,
        originalId: bridgeId,
        deviceInfo,
        name: 'Uptime',
        stateTopic: bridgeStateTopic,
        valueTemplate: '{{ value_json.uptime }}',
        unitOfMeasurement: 'seconds',
        entityCategory: 'diagnostic',
        icon: 'mdi:clock-outline',
        component: 'sensor',
      });

      // Publish initial state
      await this.publishBridgeState();

      // Set up periodic state publishing
      this.bridgeStateInterval = setInterval(() => this.publishBridgeState(), 60000); // Update every minute

      logger.info('Registered electrolux2mqtt bridge with Home Assistant');
    } catch (error) {
      logger.error('Failed to register bridge device with Home Assistant', error);
    }
  }

  /**
   * Publish bridge state to Home Assistant
   */
  private async publishBridgeState(): Promise<void> {
    const bridgeId = this.config.nodeId;
    const bridgeStateTopic = `${bridgeId}/state`;

    try {
      const bridgeState = {
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        devices: this.deviceRegistrations.size,
      };

      await this.mqtt.publish(bridgeStateTopic, JSON.stringify(bridgeState), { retain: true });
      logger.info('Published bridge state', { topic: bridgeStateTopic });
    } catch (error) {
      logger.error('Failed to publish bridge state', error);
    }
  }

  /**
   * Sanitize an appliance ID to make it compatible with MQTT topics or Home Assistant entity IDs
   *
   * @param id The original ID to sanitize
   * @param forUniqueId If true, applies less strict sanitization for unique IDs which can handle more characters
   * @returns A sanitized ID safe for use in MQTT topics or Home Assistant entity IDs
   */
  private sanitizeId(id: string, forUniqueId: boolean = false): string {
    if (!id) return 'unknown';

    if (forUniqueId) {
      // For unique IDs, we only need to ensure basic compatibility with Home Assistant entity IDs
      // We can keep most characters but remove the most problematic ones
      return id
        .replace(/[\s,;\\]+/g, '_') // Replace spaces, commas, semicolons, backslashes with underscores
        .replace(/[\/:?&=]+/g, '-') // Replace slashes, colons, etc. with dashes
        .replace(/[^a-zA-Z0-9_\-\.]/g, '') // Remove any other characters that could cause problems
        .replace(/^[0-9-]/, 'a$&') // Ensure ID doesn't start with a number or dash
        .replace(/__+/g, '_'); // Replace multiple underscores with a single one
    } else {
      // For MQTT topics, we need to be very strict
      return id
        .replace(/[\s,:;\/\\]+/g, '_') // Replace spaces, commas, colons, semicolons, slashes with underscores
        .replace(/[+]/g, 'plus') // Replace + with 'plus'
        .replace(/[#]/g, 'hash') // Replace # with 'hash'
        .replace(/[&?=]/g, '') // Remove &, ?, =
        .replace(/[^a-zA-Z0-9_\-]/g, '') // Remove any other non-alphanumeric characters except underscore and dash
        .replace(/^[0-9-]/, 'a$&') // Ensure ID doesn't start with a number or dash
        .replace(/__+/g, '_'); // Replace multiple underscores with a single one
    }
  }
}

/**
 * Create a Home Assistant service from environment variables
 */
export function createHomeAssistantServiceFromEnv(
  mqtt: MqttConnector,
  api: ApiClient
): HomeAssistantService | null {
  // Check if Home Assistant integration is enabled
  const enabled = process.env.HOME_ASSISTANT_ENABLED === 'true';

  if (!enabled) {
    logger.info(
      'Home Assistant integration is disabled. Set HOME_ASSISTANT_ENABLED=true to enable.'
    );
    return null;
  }

  // Get Home Assistant configuration from environment variables
  const discoveryPrefix = process.env.HOME_ASSISTANT_DISCOVERY_PREFIX || 'homeassistant';
  const nodeId = process.env.HOME_ASSISTANT_NODE_ID || 'electrolux2mqtt';
  const statusTopic = `${nodeId}/status`;

  return new HomeAssistantService(mqtt, api, {
    discoveryPrefix,
    nodeId,
    statusTopic,
    enabled,
  });
}

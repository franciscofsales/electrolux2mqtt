/**
 * Home Assistant MQTT integration service
 *
 * This service provides Home Assistant MQTT auto-discovery and state updates
 * for Electrolux appliances. It will only be enabled when the HOME_ASSISTANT_ENABLED
 * environment variable is set.
 */
import { MqttConnector } from '../utils/mqtt.js';
import { ApiClient, ApiResponse } from '../utils/api.js';
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

  constructor(mqtt: MqttConnector, api: ApiClient, config: HomeAssistantConfig) {
    this.mqtt = mqtt;
    this.api = api;
    this.config = config;
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
      logger.debug(`Published availability status: ${status}`);
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
    const applianceId = appliance.applianceId;
    if (this.deviceRegistrations.has(applianceId)) return;

    try {
      // Extract device info
      const deviceInfo = {
        identifiers: [applianceId],
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
      await this.createSensors(applianceId, deviceInfo, appliance);

      // Add to registered devices
      this.deviceRegistrations.set(applianceId, true);
      logger.info(`Registered device with Home Assistant: ${appliance.name || applianceId}`);
    } catch (error) {
      logger.error(`Failed to register device: ${applianceId}`, error);
    }
  }

  /**
   * Create MQTT discovery configurations for sensors based on available data
   */
  private async createSensors(
    applianceId: string,
    deviceInfo: any,
    appliance: ElectroluxApiResponse
  ): Promise<void> {
    const state = appliance.state || {};
    const stateTopic = `electrolux2mqtt/${applianceId}/state`;

    // Create connection state sensor
    await this.createSensor({
      applianceId,
      deviceInfo,
      name: 'Connection',
      uniqueId: `${applianceId}_connection`,
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
      deviceInfo,
      name: 'Device Status',
      uniqueId: `${applianceId}_device_status`,
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
        deviceInfo,
        name: 'Temperature',
        uniqueId: `${applianceId}_temperature`,
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
        deviceInfo,
        name: 'Humidity',
        uniqueId: `${applianceId}_humidity`,
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
        deviceInfo,
        name: 'Program',
        uniqueId: `${applianceId}_program`,
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
        deviceInfo,
        name: 'Status',
        uniqueId: `${applianceId}_status`,
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
          deviceInfo,
          name: 'Remaining Time',
          uniqueId: `${applianceId}_remaining_time`,
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
          deviceInfo,
          name: 'Door State',
          uniqueId: `${applianceId}_door_state`,
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
          deviceInfo,
          name: 'Cycle Phase',
          uniqueId: `${applianceId}_cycle_phase`,
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
          deviceInfo,
          name: 'Humidity Target',
          uniqueId: `${applianceId}_humidity_target`,
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
        deviceInfo,
        name: this.formatPropertyName(key),
        uniqueId: `${applianceId}_${key}`,
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
    uniqueId: string;
    component: 'sensor' | 'binary_sensor';
    stateTopic: string;
    valueTemplate: string;
    deviceClass?: string;
    unitOfMeasurement?: string;
    icon?: string;
    entityCategory?: string;
    payloadOn?: string;
    payloadOff?: string;
  }): Promise<void> {
    const discoveryTopic = `${this.config.discoveryPrefix}/${config.component}/${config.applianceId}/${config.uniqueId}/config`;

    const discoveryConfig: any = {
      name: config.name,
      unique_id: config.uniqueId,
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
      logger.debug(`Published discovery config for ${config.name}`, { topic: discoveryTopic });
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
    const applianceId = appliance.applianceId;
    const stateTopic = `electrolux2mqtt/${applianceId}/state`;

    try {
      // Create a simplified state object for Home Assistant
      const stateData = {
        timestamp: new Date().toISOString(),
        connected: appliance.info.connected !== undefined ? appliance.info.connected : true,
        ...appliance.state,
      };

      await this.mqtt.publish(stateTopic, JSON.stringify(stateData), { retain: true });
      logger.debug(`Published state for ${appliance.name || applianceId}`, { topic: stateTopic });
    } catch (error) {
      logger.error(`Failed to publish state for ${applianceId}`, error);
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
  const nodeId = process.env.HOME_ASSISTANT_NODE_ID || 'homeassistant';
  const statusTopic = `${nodeId}/status`;

  return new HomeAssistantService(mqtt, api, {
    discoveryPrefix,
    nodeId,
    statusTopic,
    enabled,
  });
}

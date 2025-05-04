/**
 * Electrolux API client implementation
 *
 * Based on the Electrolux OneApp (OCP) API documentation
 * from https://developer.electrolux.one/documentation
 */
import logger from '../utils/logger.js';
import { ApiClient, ApiClientConfig, ApiResponse } from '../utils/api.js';
import {
  ElectroluxAppliance,
  ElectroluxApplianceState,
  ElectroluxAuthResponse,
  ElectroluxApplianceInfo,
  ElectroluxApiResponse,
} from './types.js';

export class ElectroluxApiClient extends ApiClient {
  private readonly electroluxConfig: ApiClientConfig;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;
  private appliances: ElectroluxAppliance[] = [];

  constructor(config: ApiClientConfig) {
    super(config);
    this.electroluxConfig = config;

    this.refreshToken = config.refreshToken;

    // Validate required config
    if (!config.apiKey) {
      throw new Error('API key is required for Electrolux API');
    }

    if (!config.refreshToken) {
      throw new Error('Refresh token is required for Electrolux API');
    }
  }

  /**
   * Authenticate with Electrolux API and get access token
   */
  private async authenticate(): Promise<void> {
    try {
      logger.debug('Authenticating with Electrolux API');

      // Check if we already have a valid token
      if (this.accessToken && Date.now() < this.tokenExpiry - 120000) {
        logger.debug('Using existing valid access token');
        return;
      }

      // Try to use refresh token
      try {
        await this.refreshAccessToken();
      } catch (error) {
        logger.warn('Failed to refresh access token', error);
        throw error;
      }
    } catch (error) {
      logger.error('Authentication with Electrolux API failed', error);
      throw error;
    }
    logger.info('Successfully authenticated with Electrolux API');
  }

  /**
   * Refresh the access token using the refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      logger.debug('Refreshing access token');

      const refreshUrl = `${this.electroluxConfig.apiUrl}/api/v1/token/refresh`;

      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }),
        body: JSON.stringify({
          refreshToken: this.refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const authResponse: ElectroluxAuthResponse = await response.json();

      // Update tokens
      this.accessToken = authResponse.accessToken;
      this.refreshToken = authResponse.refreshToken;
      this.tokenExpiry = Date.now() + authResponse.expiresIn * 1000;

      logger.debug('Successfully refreshed access token');
    } catch (error) {
      logger.error('Failed to refresh access token', error);
      this.accessToken = null;
      this.refreshToken = null;
      this.tokenExpiry = 0;
      throw error;
    }
  }

  /**
   * Get a list of all appliances
   */
  private async getAppliances(): Promise<ElectroluxAppliance[]> {
    // Make sure we're authenticated
    await this.authenticate();

    try {
      logger.debug('Fetching appliances from Electrolux API');

      const appliancesUrl = `${this.electroluxConfig.apiUrl}/api/v1/appliances`;
      const response = await fetch(appliancesUrl, {
        method: 'GET',
        headers: new Headers({
          Authorization: `Bearer ${this.accessToken}`,
          'X-API-Key': this.electroluxConfig.apiKey || '',
          Accept: 'application/json',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch appliances: ${response.status} ${response.statusText}`);
      }

      const appliancesResponse: ElectroluxAppliance[] = await response.json();
      this.appliances = appliancesResponse;

      logger.info(`Found ${this.appliances.length} Electrolux appliances`);
      return this.appliances;
    } catch (error) {
      logger.error('Failed to fetch appliances', error);
      throw error;
    }
  }

  /**
   * Get detailed information about an appliance
   */
  private async getApplianceInfo(applianceId: string): Promise<ElectroluxApplianceInfo> {
    // Make sure we're authenticated
    await this.authenticate();

    try {
      logger.debug(`Fetching information for appliance ${applianceId}`);

      const infoUrl = `${this.electroluxConfig.apiUrl}/api/v1/appliances/${applianceId}`;
      const response = await fetch(infoUrl, {
        method: 'GET',
        headers: new Headers({
          Authorization: `Bearer ${this.accessToken}`,
          'X-API-Key': this.electroluxConfig.apiKey || '',
          Accept: 'application/json',
        }),
      });

      if (!response.ok) {
        const errorMsg = `Failed to fetch appliance information: ${response.status} ${response.statusText}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      const applianceInfo: ElectroluxApplianceInfo = await response.json();
      return applianceInfo;
    } catch (error) {
      // Log the actual error with details
      logger.error(`Failed to fetch information for appliance ${applianceId}`, error);
      throw error;
    }
  }

  /**
   * Get the state of an appliance
   */
  private async getApplianceState(applianceId: string): Promise<ElectroluxApplianceState> {
    // Make sure we're authenticated
    await this.authenticate();

    try {
      logger.debug(`Fetching state for appliance ${applianceId}`);

      const stateUrl = `${this.electroluxConfig.apiUrl}/api/v1/appliances/${applianceId}/state`;
      const response = await fetch(stateUrl, {
        method: 'GET',
        headers: new Headers({
          Authorization: `Bearer ${this.accessToken}`,
          'X-API-Key': this.electroluxConfig.apiKey || '',
          Accept: 'application/json',
        }),
      });

      console.log('*******', response);

      if (!response.ok) {
        const errorMsg = `Failed to fetch appliance state: ${response.status} ${response.statusText}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      const stateResponse: ElectroluxApplianceState = await response.json();
      return stateResponse;
    } catch (error) {
      // Log the actual error with details
      logger.error(`Failed to fetch state for appliance ${applianceId}`, error);
      throw error;
    }
  }

  /**
   * Process appliance data and state into standardized format
   */
  private processApplianceData(
    appliance: ElectroluxAppliance,
    info: ElectroluxApplianceInfo,
    state: ElectroluxApplianceState
  ): ApiResponse {
    const stateReported = state.properties.reported || {};

    // Create a standardized response object

    const response: ElectroluxApiResponse = {
      timestamp: new Date().toISOString(),
      applianceId: appliance.applianceId,
      name: appliance.applianceName,
      info: {
        modelName: info.applianceInfo.model || 'Unknown Model',
        variant: info.applianceInfo.variant || 'Unknown Variant',
        serialNumber: info.applianceInfo.serialNumber || 'Unknown Serial',
        deviceType: info.applianceInfo.deviceType || 'Unknown Device',
        connected: stateReported.connectionState === 'CONNECTED',
      },
      state: {},
    };

    // Add all reported state properties
    response.state = { ...stateReported };

    return response;
  }

  /**
   * Implementation of fetchData from ApiClient
   * Fetches data from Electrolux API
   */
  public async fetchData(): Promise<ApiResponse[]> {
    try {
      // Get all appliances
      const appliances = await this.getAppliances();

      if (appliances.length === 0) {
        logger.warn('No appliances found');
        return [
          {
            timestamp: new Date().toISOString(),
            message: 'No appliances found',
          },
        ];
      }

      // Get state for each appliance and process the data
      const applianceData: ApiResponse[] = await Promise.all(
        appliances.map(async appliance => {
          try {
            // Get appliance info
            const info = await this.getApplianceInfo(appliance.applianceId);
            const state = await this.getApplianceState(appliance.applianceId);
            return this.processApplianceData(appliance, info, state);
          } catch (error) {
            // Create a detailed error message with the actual error
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            logger.error(
              `Failed to fetch information for appliance ${appliance.applianceId}`,
              error
            );

            // Return a basic response for this appliance
            return {
              timestamp: new Date().toISOString(),
              applianceId: appliance.applianceId,
              name: appliance.applianceName,
              error: `Failed to fetch appliance data: ${errorMsg}`,
              connected: false,
            };
          }
        })
      );

      return applianceData;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error fetching data from Electrolux API: ${errorMsg}`, error);
      throw error;
    }
  }

  /**
   * Create detailed mock data for testing
   */
  public async fetchMockData(): Promise<ApiResponse[]> {
    // Create mock appliances
    const mockAppliances = [
      {
        applianceId: 'mock-fridge-001',
        name: 'Kitchen Refrigerator',
        info: {
          modelName: 'Electrolux LNT7ME34X2',
          variant: 'Premium',
          serialNumber: 'FR12345678',
          deviceType: 'FRIDGE_FREEZER',
          connected: true,
        },
        state: {
          doorState: Math.random() > 0.9 ? 'OPEN' : 'CLOSED',
          temperatureRefrigerator: Math.round((2 + Math.random() * 6) * 10) / 10, // 2-8°C
          temperatureFreezer: Math.round((-22 + Math.random() * 6) * 10) / 10, // -22 to -16°C
          connectionState: 'CONNECTED',
          ecoMode: Math.random() > 0.7,
          shoppingMode: Math.random() > 0.9,
          vacationMode: false,
          alarmFreezerTemperature: false,
          alarmRefrigeratorTemperature: false,
        },
      },
      {
        applianceId: 'mock-dishwasher-001',
        name: 'Dishwasher',
        info: {
          modelName: 'Electrolux ESF9515LOX',
          variant: 'Standard',
          serialNumber: 'DW98765432',
          deviceType: 'DISHWASHER',
          connected: true,
        },
        state: {
          doorState: 'CLOSED',
          runningState: ['IDLE', 'RUNNING', 'PAUSE', 'END'][Math.floor(Math.random() * 4)],
          programPhase: Math.random() > 0.5 ? 'WASHING' : 'DRYING',
          remainingTimeMinutes: Math.floor(Math.random() * 120),
          connectionState: 'CONNECTED',
          delayStartTimeMinutes: 0,
          ecoMode: true,
        },
      },
      {
        applianceId: 'mock-washer-001',
        name: 'Washing Machine',
        info: {
          modelName: 'Electrolux EW7F3846DB',
          variant: 'PerfectCare',
          serialNumber: 'WM45678901',
          deviceType: 'WASHER',
          connected: Math.random() > 0.2, // 20% chance of being disconnected
        },
        state: {
          doorState: 'CLOSED',
          runningState: ['IDLE', 'RUNNING', 'PAUSE', 'END'][Math.floor(Math.random() * 4)],
          programPhase: ['WASHING', 'RINSE', 'SPIN', 'COMPLETE'][Math.floor(Math.random() * 4)],
          remainingTimeMinutes: Math.floor(Math.random() * 90),
          connectionState: Math.random() > 0.2 ? 'CONNECTED' : 'DISCONNECTED',
          temperature: [30, 40, 60, 90][Math.floor(Math.random() * 4)],
          spinRpm: [800, 1000, 1200, 1400][Math.floor(Math.random() * 4)],
        },
      },
    ];

    // Create response for each appliance
    return mockAppliances.map(appliance => {
      return {
        timestamp: new Date().toISOString(),
        applianceId: appliance.applianceId,
        name: appliance.name,
        info: appliance.info,
        state: appliance.state,
      } as ElectroluxApiResponse;
    });
  }
}

/**
 * Create an Electrolux API client from environment variables
 */
export function createElectroluxApiClientFromEnv(): ElectroluxApiClient {
  // Required environment variables
  const apiUrl = process.env.ELECTROLUX_API_URL;
  const apiKey = process.env.ELECTROLUX_API_KEY;
  const refreshToken = process.env.ELECTROLUX_REFRESH_TOKEN;

  if (!apiUrl) {
    throw new Error('ELECTROLUX_API_URL environment variable is required');
  }
  if (!apiKey) {
    throw new Error('ELECTROLUX_API_KEY environment variable is required');
  }

  if (!refreshToken) {
    throw new Error('ELECTROLUX_REFRESH_TOKEN environment variable is required');
  }

  return new ElectroluxApiClient({
    apiUrl,
    apiKey,
    refreshToken,
  });
}

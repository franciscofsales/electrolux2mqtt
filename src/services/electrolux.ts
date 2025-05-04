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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mockAppliances } from './mock.js';

export class ElectroluxApiClient extends ApiClient {
  private readonly electroluxConfig: ApiClientConfig;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;
  private appliances: ElectroluxAppliance[] = [];
  private stateConfigPath: string;

  constructor(config: ApiClientConfig) {
    super(config);
    this.electroluxConfig = config;

    // Set up the config file path
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    this.stateConfigPath = path.resolve(__dirname, '../../config/state.json');

    // If the config file doesn't exist, initialize it with the refresh token from config
    if (!fs.existsSync(this.stateConfigPath) && config.refreshToken) {
      this.refreshToken = config.refreshToken;
      // Initialize the config directory and file with the refresh token
      this.saveDataToFile();
      logger.info('Initialized state config file with refresh token from environment');
    } else {
      // Try to load existing tokens from config file
      this.loadDataFromFile();

      // If no tokens were loaded, use the ones from config
      if (!this.refreshToken && config.refreshToken) {
        this.refreshToken = config.refreshToken;
        // Update the config file with the new refresh token
        this.saveDataToFile();
        logger.info('Updated state config file with refresh token from environment');
      }
    }

    // Validate required config
    if (!config.apiKey) {
      throw new Error('API key is required for Electrolux API');
    }

    if (!config.refreshToken && !this.refreshToken) {
      throw new Error('Refresh token is required for Electrolux API');
    }
  }

  /**
   * Load tokens from config file
   */
  private loadDataFromFile(): void {
    try {
      if (fs.existsSync(this.stateConfigPath)) {
        const stateData = JSON.parse(fs.readFileSync(this.stateConfigPath, 'utf8'));

        // Only set tokens if they exist in the file
        if (stateData.refreshToken) {
          this.refreshToken = stateData.refreshToken;
          logger.debug('Loaded refresh token from state file');
        }

        if (stateData.accessToken && stateData.tokenExpiry) {
          this.accessToken = stateData.accessToken;
          this.tokenExpiry = stateData.tokenExpiry;
          logger.debug('Loaded access token from state file');
        }

        // Load stored appliances if available
        if (stateData.appliances && Array.isArray(stateData.appliances)) {
          // Maintain basic appliance info even when offline
          if (stateData.appliances.length > 0) {
            this.appliances = stateData.appliances;
            logger.debug(`Loaded ${this.appliances.length} appliances from state file`);
          }
        }
      } else {
        logger.debug('No state file found, will create one when tokens are refreshed');
      }
    } catch (error) {
      logger.warn('Failed to load data from state file', error);
      // Continue without the saved data
    }
  }

  /**
   * Save tokens to config file
   */
  private saveDataToFile(): void {
    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(this.stateConfigPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.debug(`Created directory: ${dir}`);
      }

      // Save tokens to file
      const stateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };

      // Only add tokens that exist
      if (this.refreshToken) {
        stateData.refreshToken = this.refreshToken;
      }

      if (this.accessToken) {
        stateData.accessToken = this.accessToken;
        stateData.tokenExpiry = this.tokenExpiry;
      }

      // Add appliance information if available
      if (this.appliances && this.appliances.length > 0) {
        stateData.appliances = this.appliances.map(appliance => ({
          applianceId: appliance.applianceId,
          applianceName: appliance.applianceName,
        }));
        logger.debug('Adding appliance information to state file');
      }

      fs.writeFileSync(this.stateConfigPath, JSON.stringify(stateData, null, 2));
      logger.debug('Saved tokens and appliance info to state file');
    } catch (error) {
      logger.error('Failed to save state to config file', error);
      // Continue even if we couldn't save the tokens
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

      // Save updated tokens to the config file
      this.saveDataToFile();

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
          'X-API-Key': this.electroluxConfig.apiKey,
          Accept: 'application/json',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch appliances: ${response.status} ${response.statusText}`);
      }

      const appliancesResponse: ElectroluxAppliance[] = await response.json();
      this.appliances = appliancesResponse;

      // Save appliance information to the config file
      this.saveDataToFile();

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

      const infoUrl = `${this.electroluxConfig.apiUrl}/api/v1/appliances/${applianceId}/info`;

      const response = await fetch(infoUrl, {
        method: 'GET',
        headers: new Headers({
          Authorization: `Bearer ${this.accessToken}`,
          'X-API-Key': this.electroluxConfig.apiKey,
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
 *
 * The client will automatically load and save tokens to the config directory
 * to persist them across restarts.
 */
export function createElectroluxApiClientFromEnv(): ElectroluxApiClient {
  // Required environment variables
  const apiUrl = process.env.ELECTROLUX_API_URL || 'https://api.developer.electrolux.one';
  const apiKey = process.env.ELECTROLUX_API_KEY;
  const refreshToken = process.env.ELECTROLUX_REFRESH_TOKEN;

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

/**
 * API client for fetching data from external sources
 */
import logger from './logger.js';

export interface ApiClientConfig {
  apiUrl: string;
  apiKey: string;
  refreshToken: string;
  timeout?: number;
}

export interface ApiResponse {
  [key: string]: any;
  timestamp: string;
}

export class ApiClient {
  private readonly config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = config;
  }

  /**
   * Fetch data from the API
   * @returns Promise with the API response data
   */
  public async fetchData(): Promise<ApiResponse | ApiResponse[]> {
    try {
      logger.debug('Fetching data from API', { url: this.config.apiUrl });

      // Set up request options
      const options: RequestInit = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        // Use AbortController for timeout handling instead of direct timeout property
        signal: this.getTimeoutSignal(this.config.timeout || 10000),
      };

      // Add authentication if provided
      if (this.config.apiKey) {
        options.headers = {
          ...options.headers,
          'X-API-Key': this.config.apiKey,
        };
      }

      // Fetch data from API
      const response = await fetch(this.config.apiUrl, options);

      // Check if the request was successful
      if (!response.ok) {
        throw new Error(
          `API request failed with status ${response.status}: ${response.statusText}`
        );
      }

      // Parse the response
      const data = await response.json();

      // Add timestamp to the response
      const result: ApiResponse = {
        ...data,
        timestamp: new Date().toISOString(),
      };

      logger.debug('Successfully fetched data from API', {
        dataSize: JSON.stringify(result).length,
      });
      return result;
    } catch (error) {
      logger.error('Error fetching data from API', error);
      throw error;
    }
  }

  /**
   * Create an AbortSignal that times out after the specified milliseconds
   */
  private getTimeoutSignal(timeoutMs: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    return controller.signal;
  }

  /**
   * Simple mock function for testing without a real API
   * @returns Mocked API response data
   */
  public async fetchMockData(): Promise<ApiResponse | ApiResponse[]> {
    logger.debug('Fetching mock data');

    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 500));

    // Generate mock data
    const mockData: ApiResponse = {
      timestamp: new Date().toISOString(),
      temperature: Math.round((15 + Math.random() * 10) * 10) / 10, // Random temperature between 15-25°C
      humidity: Math.round((40 + Math.random() * 30) * 10) / 10, // Random humidity between 40-70%
      status: Math.random() > 0.1 ? 'ok' : 'warning', // 10% chance of warning
      deviceId: 'mock-device-001',
      batteryLevel: Math.round((50 + Math.random() * 50) * 10) / 10, // Random battery level 50-100%
    };

    return mockData;
  }
}

/**
 * Create an API client from environment variables
 */
export function createApiClientFromEnv(): ApiClient {
  // Required environment variables
  const apiUrl = process.env.API_URL;
  const apiKey = process.env.API_KEY;
  const refreshToken = process.env.REFRESH_TOKEN;

  if (!apiUrl) {
    throw new Error('API_URL environment variable is required');
  }
  if (!apiKey) {
    throw new Error('API_KEY environment variable is required');
  }
  if (!refreshToken) {
    throw new Error('REFRESH_TOKEN environment variable is required');
  }
  // Optional environment variables
  const timeout = process.env.API_TIMEOUT ? parseInt(process.env.API_TIMEOUT, 10) : 10000;

  return new ApiClient({
    apiUrl,
    apiKey,
    refreshToken,
    timeout,
  });
}

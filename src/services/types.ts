import { ApiClientConfig, ApiResponse } from '../utils/api.js';

// Define interfaces for Electrolux API
export interface ElectroluxAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
}

export interface ElectroluxAppliance {
  applianceId: string;
  applianceName: string;
  applianceType: string;
  created: string;
}

export interface ElectroluxApplianceState {
  applianceId: string;
  connectionState: string;
  status: string;
  properties: {
    reported: {
      [key: string]: any; // Various state values
    };
  };
}

export interface ElectroluxApplianceInfo {
  applianceInfo: {
    serialNumber: string;
    pnc: string;
    brand: string;
    deviceType: string;
    model: string;
    variant: string;
    colour: string;
  };
  capabilities: {
    [key: string]: any;
  };
}

export interface ElectroluxApiResponse extends ApiResponse {
  applianceId: string;
  name: string;
  info: {
    modelName: string;
    variant: string;
    serialNumber: string;
    deviceType: string;
    connected: boolean;
  };
  state: Record<string, any>;
}

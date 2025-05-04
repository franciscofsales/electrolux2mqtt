# electrolux2mqtt

A Node.js service built with TypeScript that integrates Electrolux appliances with MQTT, allowing you to monitor and control your devices through your smart home system. The service periodically polls the Electrolux API and publishes device data to MQTT topics.

## Features

- Integration with Electrolux appliances via their API
- Periodic polling of appliance status and data
- Publishing to MQTT topics in JSON format
- Configurable polling interval
- Automatic reconnection to MQTT broker
- Dockerized for easy deployment
- Structured logging
- Support for mock data for testing and development

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/electrolux2mqtt.git
cd electrolux2mqtt

# Install dependencies
npm install
```

## Development

1. Copy the environment variables example file:

```bash
cp .env.example .env
```

2. Edit the `.env` file to set your Electrolux API credentials, MQTT broker details, and other configuration options

3. Run the service in development mode:

```bash
npm run dev
```

## Docker Deployment

The service can be run with Docker in two ways:

### Option 1: Using a Local MQTT Broker

This option runs both the service and a Mosquitto MQTT broker in Docker:

```bash
# Build and start the containers
docker compose up -d

# View logs
docker compose logs -f
```

### Option 2: Using an External MQTT Broker

To use a public MQTT broker like HiveMQ or your existing home automation broker (Home Assistant, OpenHAB, etc.), edit the `docker-compose.yml` file to use the alternative configuration, then run:

```bash
docker compose up -d
```

## MQTT Topics

The service publishes to the following MQTT topics:

- `{MQTT_TOPIC_PREFIX}/data` - Contains the device data and status information polled from the Electrolux API
- `{MQTT_TOPIC_PREFIX}/status` - Service status information (online/offline)

Example payload for data topic:

```json
{
  "timestamp": "2023-05-03T12:34:56.789Z",
  "deviceId": "electrolux-device-001",
  "temperature": 22.5,
  "humidity": 51.3,
  "status": "ok",
  "batteryLevel": 87.5
}
```

Example payload for status topic:

```json
{
  "status": "online",
  "timestamp": "2023-05-03T12:34:56.789Z"
}
```

## Electrolux API Integration

This service integrates with the Electrolux One API to control and monitor Electrolux connected appliances. To use this feature:

1. Register for a developer account at [Electrolux Developer Portal](https://developer.electrolux.one)
2. Obtain your API key, client ID, and client secret
3. Configure the service with your Electrolux account credentials

### Required Environment Variables for Electrolux API

```
API_USE_MOCK=false
ELECTROLUX_API_KEY=your_electrolux_api_key
ELECTROLUX_USERNAME=your_electrolux_account_email
ELECTROLUX_PASSWORD=your_electrolux_account_password
```

### Optional Environment Variables

```
ELECTROLUX_API_URL=https://api.electrolux.one  # Default API endpoint
ELECTROLUX_BRAND=electrolux                     # Brand name (default: electrolux)
ELECTROLUX_COUNTRY_CODE=US                      # Country code (default: US)
```

### MQTT Topics for Electrolux Devices

The service publishes data for each appliance to individual topics:

- `{MQTT_TOPIC_PREFIX}/{applianceId}` - Device-specific data and state
- `{MQTT_TOPIC_PREFIX}/data` - Summary of all connected appliances
- `{MQTT_TOPIC_PREFIX}/status` - Service status information (online/offline)

### Example Appliance Data

```json
{
  "timestamp": "2023-05-03T12:34:56.789Z",
  "applianceId": "electrolux-fridge-001",
  "name": "Kitchen Refrigerator",
  "modelName": "Electrolux LNT7ME34X2",
  "serialNumber": "FR12345678",
  "connected": true,
  "state": {
    "doorState": "CLOSED",
    "temperatureRefrigerator": 5.2,
    "temperatureFreezer": -18.5,
    "connectionState": "CONNECTED",
    "ecoMode": true,
    "shoppingMode": false,
    "vacationMode": false,
    "alarmFreezerTemperature": false,
    "alarmRefrigeratorTemperature": false
  }
}
```

### Example Combined Data

```json
{
  "timestamp": "2023-05-03T12:34:56.789Z",
  "devices": 3,
  "appliances": [
    {
      "id": "electrolux-fridge-001",
      "name": "Kitchen Refrigerator",
      "connected": true
    },
    {
      "id": "electrolux-dishwasher-001",
      "name": "Dishwasher",
      "connected": true
    },
    {
      "id": "electrolux-washer-001",
      "name": "Washing Machine", 
      "connected": false
    }
  ]
}
```

### Environment Variables

### Application Settings
- `NODE_ENV`: Node.js environment (development/production)
- `LOG_LEVEL`: Logger level (debug, info, warn, error) (default: info)

### MQTT Configuration
- `MQTT_HOST`: MQTT broker hostname or IP (required)
- `MQTT_PORT`: MQTT broker port (default: 1883)
- `MQTT_PROTOCOL`: MQTT protocol (mqtt, mqtts, ws, wss) (default: mqtt)
- `MQTT_CLIENT_ID`: Client ID to use for MQTT connection (default: generated)
- `MQTT_TOPIC_PREFIX`: Prefix for MQTT topics (default: electrolux2mqtt)
- `MQTT_USERNAME`: Username for MQTT authentication (optional)
- `MQTT_PASSWORD`: Password for MQTT authentication (optional)
- `MQTT_CONNECT_TIMEOUT`: Connection timeout in milliseconds (default: 5000)

### API and Polling Settings
- `POLLING_INTERVAL_SECONDS`: How often to fetch data in seconds (default: 60)
- `API_USE_MOCK`: Set to 'true' to use mock data, 'false' to use the Electrolux API

### Electrolux API Settings (used when API_USE_MOCK=false)
- `ELECTROLUX_API_URL`: URL of the Electrolux API endpoint (default: https://api.electrolux.one)
- `ELECTROLUX_API_KEY`: Your API key from the Electrolux developer portal (required)
- `ELECTROLUX_USERNAME`: Your Electrolux account email (required)
- `ELECTROLUX_PASSWORD`: Your Electrolux account password (required)
- `ELECTROLUX_BRAND`: Appliance brand (default: electrolux)
- `ELECTROLUX_COUNTRY_CODE`: Country code for regional settings (default: US)

### Home Assistant Integration Settings
- `HOME_ASSISTANT_ENABLED`: Set to 'true' to enable Home Assistant MQTT discovery (default: false)
- `HOME_ASSISTANT_DISCOVERY_PREFIX`: MQTT discovery prefix (default: homeassistant)
- `HOME_ASSISTANT_NODE_ID`: Node ID for the integration (default: electrolux2mqtt)

## Home Assistant Integration

This service includes automatic integration with Home Assistant via MQTT discovery. When enabled, it will:

1. Create device entities in Home Assistant automatically for each Electrolux appliance
2. Create appropriate sensors based on the capabilities of each appliance
3. Manage entity availability based on connection status

### Enabling the Integration

To enable Home Assistant integration, set the following environment variable:

```
HOME_ASSISTANT_ENABLED=true
```

This will automatically create entities in Home Assistant for all your Electrolux appliances when they are discovered.

### Generated Entities

Based on the appliance type, the integration will create appropriate entities such as:

- Connection status (online/offline)
- Temperature sensors (refrigerator, freezer, etc.)
- Humidity sensors (if applicable)
- Program status and remaining time (for washers, dryers, dishwashers)
- Status information
- Other relevant sensors based on available state data

All entities are automatically categorized and include appropriate device classes, units of measurement, and icons.

### Device Examples in Home Assistant

#### Refrigerator
A refrigerator will appear in Home Assistant with sensors such as:

- Refrigerator Temperature (°C)
- Freezer Temperature (°C)
- Connection Status (connected/disconnected)
- Door State (open/closed)
- Eco Mode (on/off)

#### Washing Machine
A washing machine will include:

- Program Status (idle, washing, rinsing, spinning, etc.)
- Remaining Time (minutes)
- Connection Status (connected/disconnected)
- Door Lock (locked/unlocked)

### Home Assistant Dashboard Example

The discovered entities can be used in Home Assistant dashboards to create a comprehensive view of your Electrolux appliances, allowing you to monitor their status and receive notifications about important events.

## How the Electrolux Integration Works

This service uses the official Electrolux One API to communicate with your Electrolux connected appliances. The integration:

1. Authenticates with your Electrolux account credentials
2. Retrieves a list of all your connected appliances
3. Fetches detailed state information for each appliance
4. Publishes the data to device-specific MQTT topics
5. Handles token refresh and maintains connection

The implementation is in `src/utils/electrolux-api.ts` and handles authentication, API communication, and data processing. The service automatically manages access tokens and retries on connection issues.

The service is designed to be extensible, so you can modify or enhance the Electrolux API client as needed for your specific requirements.

## Project Structure

```
├── src/                    # TypeScript source files
│   ├── services/           # Service implementations
│   │   ├── electrolux.ts   # Electrolux API client
│   │   ├── homeAssistant.ts # Home Assistant integration
│   │   ├── mock.ts         # Mock data service
│   │   └── types.ts        # Type definitions
│   ├── utils/              # Utility modules
│   │   ├── logger.ts       # Custom logger implementation
│   │   ├── mqtt.ts         # MQTT client implementation
│   │   ├── api.ts          # API client implementation
│   │   └── polling.ts      # Polling service implementation
│   └── index.ts            # Application entry point
├── dist/                   # Compiled JavaScript output
├── mosquitto/              # Mosquitto MQTT broker configuration
├── tsconfig.json           # TypeScript configuration
├── Dockerfile              # Docker configuration
├── docker-compose.yml      # Docker Compose configuration
├── .env.example            # Example environment variables
└── package.json            # Project metadata and dependencies
```

## License

ISC
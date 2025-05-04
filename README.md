# electrolux2mqtt

<p align="center">
  <img src="assets/small.png" alt="electrolux2mqtt logo" width="200"/>
</p>

![Project Status: Experimental](https://img.shields.io/badge/Project%20Status-Experimental-yellow)
[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/franciscofm)

A Node.js service that integrates Electrolux/AEG appliances with MQTT, enabling monitoring and control of your devices through Home Assistant.

## ⚠️ IMPORTANT DISCLAIMER

**This project is HIGHLY EXPERIMENTAL and in the EARLY STAGES of development.** It should be used with extreme caution and is not recommended for production environments.

- It has only been tested with a **tumbler dryer** model
- No guarantees are made about compatibility with other Electrolux/AEG appliance types
- The API implementation may change without notice as the official Electrolux API evolves
- Use at your own risk - no responsibility for any issues that may arise

## Overview

This service periodically polls the Electrolux API and publishes device data to MQTT topics. It bridges the gap between Electrolux/AEG connected appliances and MQTT-based home automation systems, providing visibility into appliance status and limited control capabilities.

## Features

- Integration with Electrolux API for appliance data
- Publishing appliance status to MQTT topics in JSON format, compatible with Home Assistant with auto discovery
- Configurable polling interval
- Automatic reconnection to MQTT broker
- Dockerized for easy deployment
- Structured logging
- Mock data support for testing and development

## Installation

```bash
# Clone the repository
git clone https://github.com/franciscofsales/electrolux2mqtt.git
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

To use an external MQTT broker (like HiveMQ or Home Assistant's broker), edit the `docker-compose.yml` file accordingly, then run:

```bash
docker compose up -d
```

## MQTT Topics

The service publishes to the following MQTT topics:

- `{MQTT_TOPIC_PREFIX}/data` - Device data and status information
- `{MQTT_TOPIC_PREFIX}/status` - Service status (online/offline)
- `{MQTT_TOPIC_PREFIX}/{applianceId}` - Device-specific data and state

### Example Tumbler Dryer Data

```json
{
  "timestamp": "2023-05-03T12:34:56.789Z",
  "applianceId": "electrolux-dryer-001",
  "name": "Tumbler Dryer",
  "modelName": "Electrolux EW9H2924DC",
  "serialNumber": "DR12345678",
  "connected": true,
  "state": {
    "doorState": "CLOSED",
    "programState": "RUNNING",
    "programName": "Cotton",
    "remainingTimeMinutes": 45,
    "dryLevel": "CUPBOARD_DRY",
    "temperature": 65,
    "connectionState": "CONNECTED"
  }
}
```

## Home Assistant Integration

This service includes basic integration with Home Assistant via MQTT discovery. When enabled, it will create device entities in Home Assistant automatically for your Electrolux appliance.

To enable Home Assistant integration, set the following environment variable:

```
HOME_ASSISTANT_ENABLED=true
```

## Environment Variables

### Application Settings
- `NODE_ENV`: Node.js environment (development/production)
- `LOG_LEVEL`: Logger level (debug, info, warn, error) (default: info)

### MQTT Configuration
- `MQTT_HOST`: MQTT broker hostname or IP (required)
- `MQTT_PORT`: MQTT broker port (default: 1883)
- `MQTT_PROTOCOL`: MQTT protocol (mqtt, mqtts, ws, wss) (default: mqtt)
- `MQTT_CLIENT_ID`: Client ID for MQTT connection (default: generated)
- `MQTT_TOPIC_PREFIX`: Prefix for MQTT topics (default: electrolux2mqtt)
- `MQTT_USERNAME`: Username for MQTT authentication (optional)
- `MQTT_PASSWORD`: Password for MQTT authentication (optional)
- `MQTT_CONNECT_TIMEOUT`: Connection timeout in milliseconds (default: 5000)

### API and Polling Settings
- `POLLING_INTERVAL_SECONDS`: How often to fetch data in seconds (default: 30)
- `API_USE_MOCK`: Set to 'true' to use mock data, 'false' to use the Electrolux API

### Electrolux API Settings (used when API_USE_MOCK=false)
- `ELECTROLUX_API_URL`: URL of the Electrolux API endpoint (default: https://api.electrolux.one)
- `ELECTROLUX_API_KEY`: Your API key from the Electrolux developer portal (required)
- `ELECTROLUX_REFRESH_TOKEN`: Initial refresh token from the Electrolux developer portal (required)

### Home Assistant Integration Settings
- `HOME_ASSISTANT_ENABLED`: Set to 'true' to enable Home Assistant MQTT discovery (default: false)
- `HOME_ASSISTANT_DISCOVERY_PREFIX`: MQTT discovery prefix (default: homeassistant)
- `HOME_ASSISTANT_NODE_ID`: Node ID for the integration (default: electrolux2mqtt)

## Project Structure

```
├── src/                    # TypeScript source files
│   ├── services/           # Service implementations
│   │   ├── electrolux.ts   # Electrolux API client
│   │   ├── homeAssistant.ts # Home Assistant integration
│   │   ├── mock.ts         # Mock data
│   │   └── types.ts        # Type definitions
│   ├── utils/              # Utility modules
│   │   ├── logger.ts       # Custom logger implementation
│   │   ├── mqtt.ts         # MQTT client implementation
│   │   ├── api.ts          # API client implementation
│   │   └── polling.ts      # Polling service implementation
│   └── index.ts            # Application entry point
├── mosquitto/              # Mosquitto MQTT broker configuration
├── Dockerfile              # Docker configuration
├── docker-compose.yml      # Docker Compose configuration
└── .env.example            # Example environment variables
```

## Contributing

As this project is in its early stages, contributions are welcome! Please be aware that the API implementation may change significantly as development progresses.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Known Limitations

- Currently only tested with a tumbler dryer model
- Limited error handling for various API edge cases
- No comprehensive test suite yet
- May not support all features of the Electrolux API

## Roadmap

- Add support for more Electrolux/AEG appliance types
- Improve error handling and resilience
- Add comprehensive test suite
- Enhance Home Assistant integration
- Support for sending commands to appliances (when API allows)
- ~~Add CI/CD pipeline~~
- ~~Publish to dockerhub a pre-built image~~

## License

MIT

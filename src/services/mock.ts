export const mockAppliances = [
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

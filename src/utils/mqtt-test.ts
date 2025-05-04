/**
 * MQTT Connection Test Script
 * 
 * This file is used to test the MQTT connection in isolation.
 * Run with: npm run test:mqtt
 */

import { config } from 'dotenv';
import mqtt from 'mqtt';

// Load environment variables
config();

// Get MQTT configuration from environment variables
const host = process.env.MQTT_HOST || 'localhost';
const port = process.env.MQTT_PORT || '1883';
const protocol = process.env.MQTT_PROTOCOL || 'mqtt';
const clientId = `mqtt_test_${Math.random().toString(16).substring(2, 8)}`;

// Construct broker URL
const brokerUrl = `${protocol}://${host}:${port}`;

console.log(`Connecting to MQTT broker at ${brokerUrl}...`);

// Connect to the broker with simple options
const client = mqtt.connect(brokerUrl, {
  clientId,
  clean: true,
  connectTimeout: 10000,
  rejectUnauthorized: false, // Accept self-signed certificates
});

// Set up event handlers
client.on('connect', () => {
  console.log('✅ Connected to MQTT broker successfully!');
  
  // Test publishing
  const testTopic = 'mqtt/test';
  const testMessage = JSON.stringify({
    test: true,
    timestamp: new Date().toISOString(),
    clientId
  });
  
  console.log(`Publishing test message to ${testTopic}...`);
  client.publish(testTopic, testMessage, {}, (err) => {
    if (err) {
      console.error('❌ Failed to publish message:', err);
    } else {
      console.log('✅ Published message successfully!');
      
      // Test subscribing
      console.log(`Subscribing to ${testTopic}...`);
      client.subscribe(testTopic, (err) => {
        if (err) {
          console.error('❌ Failed to subscribe:', err);
        } else {
          console.log('✅ Subscribed successfully!');
          console.log('Waiting for messages... (Press Ctrl+C to exit)');
        }
      });
    }
  });
});

client.on('message', (topic, message) => {
  console.log(`📩 Received message on topic ${topic}:`);
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(message.toString());
    console.log(JSON.stringify(parsed, null, 2));
  } catch (e) {
    // If not JSON, show as string
    console.log(message.toString());
  }
});

client.on('error', (err) => {
  console.error('❌ MQTT Error:', err);
});

client.on('reconnect', () => {
  console.log('🔄 Attempting to reconnect to MQTT broker...');
});

client.on('close', () => {
  console.log('🔒 MQTT connection closed');
});

// Keep the process running until Ctrl+C
process.on('SIGINT', () => {
  console.log('Disconnecting from MQTT broker...');
  client.end(true, () => {
    console.log('Disconnected. Exiting.');
    process.exit(0);
  });
});
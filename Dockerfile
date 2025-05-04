FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled JavaScript from CI/CD build
COPY dist ./dist

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

RUN chown -R nodejs:nodejs /app
USER nodejs

# Set environment variables with defaults
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    POLLING_INTERVAL_SECONDS=30 \
    API_USE_MOCK=false

# Start the application
CMD ["node", "dist/index.js"]

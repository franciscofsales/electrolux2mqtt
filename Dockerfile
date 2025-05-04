FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Compile TypeScript to JavaScript without bundling
RUN npm run build:ts

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs
    
RUN chown -R nodejs:nodejs /app
USER nodejs

# Set environment variables with defaults
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    POLLING_INTERVAL_SECONDS=60 \
    API_USE_MOCK=true

# Start the application
CMD ["node", "dist/index.js"]
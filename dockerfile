# ===============================
# Stage 1 — Build
# ===============================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./

RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build


# ===============================
# Stage 2 — Runtime
# ===============================
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup -S nodejs \
 && adduser -S fastify -G nodejs

# Copy only production files
COPY package*.json ./

RUN npm ci --omit=dev

# Copy compiled code
COPY --from=builder /app/dist ./dist

# Use non-root user
USER fastify

# Expose Fastify port
EXPOSE 3000

# Proper signal handling
CMD ["node", "dist/server.js"]
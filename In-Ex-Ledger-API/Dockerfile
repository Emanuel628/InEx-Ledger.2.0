FROM node:20-alpine

WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy rest of API
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
# Enable rate limiting in production; falls back to in-memory store when REDIS_URL is not set
ENV RATE_LIMIT_ENABLED=true
# Confirm receipt storage persistence. Requires a persistent volume mounted at /app/storage/receipts.
ENV RECEIPT_STORAGE_PERSISTENT=true

# Ensure the receipts directory exists at image build time
RUN mkdir -p /app/storage/receipts

EXPOSE 8080

CMD ["node", "server.js"]

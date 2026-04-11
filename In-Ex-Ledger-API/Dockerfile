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
# Enforce strict TLS certificate validation for the database connection.
# Set to "false" only when connecting to Postgres with a self-signed certificate chain
# (e.g. a private CA).  Never set NODE_TLS_REJECT_UNAUTHORIZED=0 as a workaround.
# For self-signed CAs, supply DB_SSL_CA_CERT=/path/to/ca.pem at runtime instead.


# Ensure the receipts directory exists at image build time
RUN mkdir -p /app/storage/receipts

EXPOSE 8080

CMD ["node", "server.js"]

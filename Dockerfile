FROM node:20-alpine

WORKDIR /app

# Install deps first (better caching)
COPY In-Ex-Ledger-API/package*.json ./
RUN npm install --production

# Copy rest of API
COPY In-Ex-Ledger-API/ .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]

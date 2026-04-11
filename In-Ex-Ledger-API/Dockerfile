FROM node:20-alpine

WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy rest of API
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_SSL_REJECT_UNAUTHORIZED=true

EXPOSE 8080

CMD ["node", "server.js"]

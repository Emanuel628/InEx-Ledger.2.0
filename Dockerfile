FROM node:20-alpine

WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm install --production

# Copy rest of app
COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]

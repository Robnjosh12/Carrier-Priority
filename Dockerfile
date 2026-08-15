# CARRIER PRIORITY — Backend API container
FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps || npm install --omit=dev

COPY server ./server
COPY drizzle.config.js ./

ENV NODE_ENV=production
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server/index.js"]

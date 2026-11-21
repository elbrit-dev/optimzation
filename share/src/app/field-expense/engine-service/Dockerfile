FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
ENV NODE_ENV=production
CMD ["node", "server.js"]

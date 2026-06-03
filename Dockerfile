FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

RUN addgroup -S jampa && adduser -S jampa -G jampa && chown -R jampa:jampa /app
USER jampa

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3001}/health || exit 1

CMD ["node", "src/server.js"]

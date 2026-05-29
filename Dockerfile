FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY workshop-sandbox ./workshop-sandbox
COPY server ./server

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/src/index.js"]

FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY src/ ./src/

ENV NODE_ENV=production

EXPOSE 7887
EXPOSE 7888

CMD ["node", "src/server.js"]

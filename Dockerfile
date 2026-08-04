FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY scripts ./scripts
COPY public ./public
# Seed embutido (não é o volume). Em runtime o app grava em DATA_DIR (/data no Railway).
COPY data ./data
ENV PORT=4000
ENV NODE_ENV=production
# Prefira volume Railway montado em /data (ver COMO-PUBLICAR.md)
ENV DATA_DIR=/data
EXPOSE 4000
CMD ["node", "server.js"]

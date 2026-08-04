FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY scripts ./scripts
COPY public ./public
COPY data ./data
ENV PORT=4000
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "server.js"]

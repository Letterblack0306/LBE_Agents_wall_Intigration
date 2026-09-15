FROM node:20-alpine

WORKDIR /app
COPY api-server.js ./api-server.js

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
CMD ["node", "api-server.js"]

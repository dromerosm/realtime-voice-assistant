FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN mkdir -p /data
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server/server.js"]

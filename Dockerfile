FROM node:22.14.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22.14.0-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY services ./services
COPY config ./config
USER node
EXPOSE 8080
CMD ["npm", "run", "start:keeper"]

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=192
CMD ["node", "issuer.mjs"]

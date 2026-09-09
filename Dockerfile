FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/export/package.json apps/export/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/themes/package.json packages/themes/package.json
RUN npm ci
COPY . .
RUN npm run build
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4174
RUN chown -R node:node /app /ms-playwright
USER node
EXPOSE 4174
# Operator must provide FOLIO_ACCESS_TOKEN and a TLS gateway. See deployment.md.
CMD ["npm", "start"]

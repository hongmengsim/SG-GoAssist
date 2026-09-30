# The GoAssist backend, built from the repository root:  docker build -f deploy/Dockerfile -t goassist-backend .
# NOT YET BUILT OR RUN (no Docker on the machine this was written on): treat it as a starting point.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY contracts/package.json contracts/
COPY backend/package.json backend/
COPY passenger-app/package.json passenger-app/
# Only the two workspaces the backend needs; the app's packages are not installed.
RUN npm ci --workspace @buspass/shared --workspace @buspass/backend --include-workspace-root=false \
 && npm install --no-save --workspace @buspass/backend pg ioredis
COPY contracts contracts
COPY backend backend
RUN npm run build --workspace @buspass/backend

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["node", "backend/dist/server.js"]

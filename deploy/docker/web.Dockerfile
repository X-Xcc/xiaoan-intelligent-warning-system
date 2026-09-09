FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/miniprogram/package.json apps/miniprogram/package.json
RUN npm ci --workspace apps/dashboard --include-workspace-root --no-audit --no-fund
COPY apps/dashboard apps/dashboard
COPY server/app/data/command server/app/data/command
ENV VITE_API_BASE_URL=/api
RUN npm run dashboard:build

FROM nginx:1.28-alpine
COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/dashboard/dist /usr/share/nginx/html
EXPOSE 80

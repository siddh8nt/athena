# Athena on Cloud Run (PRD §14.1): Next.js standalone output in a small Node image.
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Fixtures are never used in production; keys come from Secret Manager at runtime, never from the image.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Demo brands' public stockist lists, read at runtime (§7.7).
COPY --from=build /app/proof/stockists ./proof/stockists
USER node
EXPOSE 8080
CMD ["node", "server.js"]

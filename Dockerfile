# Build stage
FROM oven/bun AS build

ENV NODE_ENV=production

WORKDIR /build

COPY tsconfig.json ./
COPY package.json ./
COPY init-db.ts ./
COPY bun.lockb ./
COPY bunfig.toml ./
COPY src ./src/
COPY .env.production ./.env

RUN bun install --frozen-lockfile --production && \
	mkdir .database && \
    bun --env-file=.env run init-db.ts && \
    bun run bin

# Nix store stage
FROM nixos/nix AS nix-store

ENV NIXPKGS_ALLOW_UNFREE=1

COPY docker.nix /tmp/docker.nix

RUN mkdir -p /output/store && \
	nix-channel --update && \
	nix-env --profile /output/profile -i -f /tmp/docker.nix && \
	cp -a $(nix-store -qR /output/profile) /output/store && \
	nix-collect-garbage && \
	nix-collect-garbage -d

# Final stage
FROM gcr.io/distroless/base-debian12:nonroot

LABEL maintainer="Reyhan Kamil <mail@ryhkml.dev>"

ARG PORT

ENV NODE_ENV=production

WORKDIR /home/nonroot/app

COPY --from=nix-store --chown=nonroot:nonroot /output/store /nix/store
COPY --from=nix-store --chown=nonroot:nonroot /output/profile/ /usr/local/
COPY --from=build --chown=nonroot:nonroot /build/tasks-server /usr/local/bin/
COPY --from=build --chown=nonroot:nonroot /build/.database /home/nonroot/app/.database/
COPY --chown=nonroot:nonroot tls /home/nonroot/app/tls/

EXPOSE $PORT/tcp

CMD ["tasks-server"]
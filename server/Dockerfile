# Build from the cardgame checkout: docker build -f server/Dockerfile -t cardgame-server .
FROM oven/bun:1.4.2
WORKDIR /app
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun server ./server
USER bun
EXPOSE 8443
CMD ["bun", "server/main.ts"]

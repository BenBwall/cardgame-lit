import { defineRailway, github, project, service } from "railway/iac";

// Apply to a dedicated Railway project/environment: this file owns its full configuration.
// Preview: railway config plan --file railway-backend.ts
// Deploy:  railway config apply --file railway-backend.ts
export default defineRailway((context) => {
  const backend = service("cardgame-backend", {
    source: github("BenBwall/cardgame-lit", { branch: "main", rootDirectory: "/" }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "server/Dockerfile",
    },
    start: "bun server/main.ts",
    healthcheck: "/health",
    healthcheckTimeout: 30,
    // Rooms live in process memory; all players must reach the same instance.
    replicas: 1,
    deploy: {
      sleepApplication: false,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
      overlapSeconds: 0,
      drainingSeconds: 30,
    },
    env: {
      NODE_ENV: "production",
      MULTIPLAYER_DEV: "0",
      MULTIPLAYER_TLS_MODE: "proxy",
      MULTIPLAYER_HOST: "0.0.0.0",
      MULTIPLAYER_ORIGINS: "https://people.arcada.fi",
      PORT: "8787",
    },
  });

  // Generate a Railway HTTPS domain after apply:
  // railway domain --service cardgame-backend --port 8787
  return project(context.projectName ?? "cardgame-lit", { resources: [backend] });
});

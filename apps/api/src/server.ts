import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";

const config = loadConfig();
const store = new Store({ databaseUrl: config.databaseUrl });
await store.migrate();

const app = buildApp({ config, store });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error, "failed to start api");
  process.exit(1);
}

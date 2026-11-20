import { createApp } from "./app.mjs";

const port = Number(process.env.PORT || 3000);
(await createApp()).listen(port, "127.0.0.1", () => {
  console.log(`Open http://127.0.0.1:${port}`);
});

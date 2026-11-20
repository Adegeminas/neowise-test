import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { classify as mockClassify } from "./mock-ai.mjs";
import { INVALID_INPUT, MODEL_TIMEOUT_MS, parseInput, triage } from "./triage.mjs";

const MAX_BODY_BYTES = 64 * 1024;

const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/ui.mjs": ["ui.mjs", "text/javascript; charset=utf-8"],
};

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Создаёт сервер. Модель и таймаут передаются снаружи, чтобы тесты могли их подменить. */
export async function createApp({
  classify = mockClassify,
  timeoutMs = MODEL_TIMEOUT_MS,
  log = (reason) => console.warn(`[triage] manual_review: ${reason}`),
} = {}) {
  const files = {};
  for (const [path, [file, type]] of Object.entries(STATIC)) {
    files[path] = { body: await readFile(new URL(`./${file}`, import.meta.url)), type };
  }

  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && files[request.url]) {
        const { body, type } = files[request.url];
        response.writeHead(200, { "Content-Type": type });
        response.end(body);
        return;
      }
      if (request.method !== "POST" || request.url !== "/api/triage") {
        return json(response, 404, { status: "not_found" });
      }
      const raw = await readBody(request);
      if (raw === null) return json(response, 400, INVALID_INPUT); // слишком большое тело
      const text = parseInput(raw);
      if (text === null) return json(response, 400, INVALID_INPUT);
      return json(response, 200, await triage(text, { classify, timeoutMs, log }));
    } catch (error) {
      console.error("[triage] unexpected error", error);
      if (!response.headersSent) json(response, 500, { status: "server_error" });
    }
  });
}

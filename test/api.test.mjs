import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.mjs";

const MANUAL = { status: "manual_review", topic: null, draft: null };
const logged = [];
let server;
let base;

before(async () => {
  // Настоящий имитатор модели из mock-ai.mjs и боевой таймаут 300 мс.
  server = await createApp({ log: (reason) => logged.push(reason) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function post(body, raw = false) {
  const response = await fetch(`${base}/api/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("корректная заявка: 200, тема и непустой черновик", async () => {
  const delivery = await post({ text: "Когда будет доставка заказа?" });
  assert.equal(delivery.status, 200);
  assert.equal(delivery.body.status, "ready");
  assert.equal(delivery.body.topic, "delivery");
  assert.ok(delivery.body.draft.trim().length > 0);

  assert.equal((await post({ text: "Какая стоимость подписки?" })).body.topic, "pricing");
  assert.equal((await post({ text: "Здравствуйте" })).body.topic, "other");
});

for (const [name, body, raw] of [
  ["пустая строка", { text: "" }],
  ["только пробелы", { text: "   \n\t" }],
  ["нет поля text", { message: "привет" }],
  ["text не строка", { text: 42 }],
  ["text = null", { text: null }],
  ["тело — массив", ["привет"]],
  ["тело — null", null],
  ["битый JSON", "{text: ", true],
  ["пустое тело", "", true],
]) {
  test(`некорректный ввод (${name}): 400 invalid_input`, async () => {
    const response = await post(body, raw);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { status: "invalid_input" });
  });
}

for (const [label, reason] of [
  ["[error]", "model_error"],
  ["[bad-json]", "bad_json"],
  ["[bad-topic]", "bad_topic"],
  ["[empty-draft]", "empty_draft"],
]) {
  test(`сбой модели ${label}: 200 manual_review без черновика`, async () => {
    const response = await post({ text: `Вопрос по доставке ${label}` });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, MANUAL);
    assert.equal(logged.at(-1), reason);
  });
}

test("таймаут модели: manual_review не позже чем через ~300 мс, а не через 1200 мс", async () => {
  const started = performance.now();
  const response = await post({ text: "Где доставка? [timeout]" });
  const elapsed = performance.now() - started;

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, MANUAL);
  assert.equal(logged.at(-1), "timeout");
  assert.ok(elapsed >= 280, `ответ пришёл слишком рано: ${elapsed.toFixed(0)} мс`);
  assert.ok(elapsed < 900, `таймаут не сработал: ${elapsed.toFixed(0)} мс`);
});

test("модель игнорирует AbortSignal и зависает: всё равно manual_review по таймауту", async () => {
  const hanging = await createApp({ classify: () => new Promise(() => {}), timeoutMs: 50, log: () => {} });
  await new Promise((resolve) => hanging.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${hanging.address().port}/api/triage`, {
      method: "POST",
      body: JSON.stringify({ text: "привет" }),
    });
    assert.deepEqual(await response.json(), MANUAL);
  } finally {
    hanging.close();
  }
});

test("неизвестный маршрут: 404", async () => {
  const response = await fetch(`${base}/api/unknown`, { method: "POST" });
  assert.equal(response.status, 404);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { viewFor, loadingView, MESSAGES } from "../ui.mjs";

test("успех: показываем тему по-русски и черновик", () => {
  const view = viewFor(200, { status: "ready", topic: "delivery", draft: "Спасибо!" });
  assert.deepEqual(view, { kind: "ready", message: "", topic: "Доставка", draft: "Спасибо!" });
});

test("после успешного ответа сбой очищает черновик и показывает ручной разбор", () => {
  const first = viewFor(200, { status: "ready", topic: "pricing", draft: "Старый черновик" });
  assert.equal(first.draft, "Старый черновик");

  const second = viewFor(200, { status: "manual_review", topic: null, draft: null });
  assert.equal(second.kind, "manual");
  assert.equal(second.draft, null);
  assert.equal(second.topic, null);
  assert.equal(second.message, MESSAGES.manualReview);
});

test("во время запроса предыдущий черновик уже скрыт", () => {
  assert.equal(loadingView().draft, null);
});

for (const [name, status, body] of [
  ["ошибка сети", 0, null],
  ["500 от сервера", 500, { status: "server_error" }],
  ["ready с пустым черновиком", 200, { status: "ready", topic: "other", draft: " " }],
  ["ready с неизвестной темой", 200, { status: "ready", topic: "refund", draft: "текст" }],
]) {
  test(`неожиданный ответ (${name}): ручной разбор без черновика`, () => {
    const view = viewFor(status, body);
    assert.equal(view.kind, "manual");
    assert.equal(view.draft, null);
  });
}

test("invalid_input: просим ввести текст, черновика нет", () => {
  const view = viewFor(400, { status: "invalid_input" });
  assert.equal(view.kind, "invalid");
  assert.equal(view.draft, null);
});

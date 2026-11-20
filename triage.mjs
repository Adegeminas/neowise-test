// Бизнес-логика разбора заявки: проверка ввода, таймаут модели и проверка её ответа.
// Вынесена из HTTP-слоя, чтобы её можно было тестировать без сервера.

export const TOPICS = new Set(["delivery", "pricing", "other"]);
export const MODEL_TIMEOUT_MS = 300;

export const INVALID_INPUT = Object.freeze({ status: "invalid_input" });
export const MANUAL_REVIEW = Object.freeze({ status: "manual_review", topic: null, draft: null });

/** Возвращает текст заявки или null, если тело запроса не подходит. */
export function parseInput(rawBody) {
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null; // битый JSON
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const { text } = body;
  if (typeof text !== "string" || text.trim() === "") return null; // нет, не строка, пусто или пробелы
  return text;
}

/**
 * Проверяет сырой ответ модели. HTTP 200 от провайдера не значит, что результат годится:
 * нужен JSON-объект, тема из списка и непустой черновик.
 * Возвращает { ok: true, topic, draft } или { ok: false, reason }.
 */
export function validateModelOutput(raw) {
  if (typeof raw !== "string") return { ok: false, reason: "not_string" };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "bad_json" };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "not_object" };
  }
  if (!TOPICS.has(data.topic)) return { ok: false, reason: "bad_topic" };
  if (typeof data.draft !== "string" || data.draft.trim() === "") {
    return { ok: false, reason: "empty_draft" };
  }
  return { ok: true, topic: data.topic, draft: data.draft.trim() };
}

/**
 * Вызывает модель, но ждёт не дольше timeoutMs. По таймауту отменяет вызов через AbortSignal;
 * если модель сигнал игнорирует, всё равно не ждёт её (Promise.race).
 */
export async function callWithTimeout(classify, text, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error("Model timeout"), { reason: "timeout" }));
    }, timeoutMs);
  });
  try {
    return await Promise.race([classify(text, { signal: controller.signal }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Полный сценарий разбора текста. Никогда не бросает исключение: любой сбой модели
 * превращается в manual_review, чтобы менеджер разобрал заявку вручную.
 */
export async function triage(text, { classify, timeoutMs = MODEL_TIMEOUT_MS, log = () => {} }) {
  let raw;
  try {
    raw = await callWithTimeout(classify, text, timeoutMs);
  } catch (error) {
    log(error?.reason === "timeout" ? "timeout" : "model_error");
    return MANUAL_REVIEW;
  }
  const result = validateModelOutput(raw);
  if (!result.ok) {
    log(result.reason);
    return MANUAL_REVIEW;
  }
  return { status: "ready", topic: result.topic, draft: result.draft };
}

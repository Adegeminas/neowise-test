// Логика отображения ответа API. Без DOM, поэтому выполняется и в браузере, и в node --test.

export const TOPIC_LABELS = {
  delivery: "Доставка",
  pricing: "Цены и стоимость",
  other: "Другое",
};

export const MESSAGES = {
  loading: "Разбираем заявку…",
  emptyInput: "Введите текст заявки.",
  manualReview:
    "AI не смог подготовить черновик. Разберите заявку вручную: определите тему и напишите ответ сами.",
};

/**
 * Превращает ответ API в состояние экрана: { kind, message, topic, draft }.
 * Черновик показывается только для status "ready" с корректными данными.
 * Во всех остальных случаях (manual_review, ошибка сети, 500, неожиданный ответ)
 * черновик равен null: экран не должен показывать текст от предыдущей заявки.
 */
export function viewFor(httpStatus, body) {
  if (httpStatus === 400 && body?.status === "invalid_input") {
    return { kind: "invalid", message: MESSAGES.emptyInput, topic: null, draft: null };
  }
  if (
    httpStatus === 200 &&
    body?.status === "ready" &&
    Object.hasOwn(TOPIC_LABELS, body.topic) &&
    typeof body.draft === "string" &&
    body.draft.trim() !== ""
  ) {
    return { kind: "ready", message: "", topic: TOPIC_LABELS[body.topic], draft: body.draft };
  }
  // manual_review и любой неожиданный ответ сервера ведут к ручному разбору.
  return { kind: "manual", message: MESSAGES.manualReview, topic: null, draft: null };
}

export function loadingView() {
  return { kind: "loading", message: MESSAGES.loading, topic: null, draft: null };
}

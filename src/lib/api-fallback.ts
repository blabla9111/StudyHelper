import { NextResponse } from "next/server";

/** Ответ 405 в том же формате, что и остальные ошибки API: { "error": "…" } */
export const notAllowed = (allowed: string[]) => () =>
  NextResponse.json({ error: "Этот адрес не принимает такой тип запроса." }, { status: 405, headers: { Allow: allowed.join(", ") } });

/** Ответ на несуществующий адрес API */
export const notFoundJson = () => NextResponse.json({ error: "Такого адреса нет." }, { status: 404 });

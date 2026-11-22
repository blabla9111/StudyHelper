import { notFoundJson } from "@/lib/api-fallback";

export const dynamic = "force-dynamic";

// Любой неизвестный адрес под /api отвечает JSON, а не HTML-страницей 404
export const GET = notFoundJson;
export const POST = notFoundJson;
export const PUT = notFoundJson;
export const PATCH = notFoundJson;
export const DELETE = notFoundJson;

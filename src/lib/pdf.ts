import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { PDFFont, PDFPage } from "pdf-lib";
import { formatDayMonth } from "./schedule";

// Пакеты PDF подгружаются при первом обращении к этому модулю и не попадают в сборку сайта. Если они не установлены
// (не выполнен `npm install`), ошибка возникает только здесь, и маршрут скачивания отдаёт запасной образец справки.
const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
const { PDFDocument, rgb } = nodeRequire("pdf-lib") as typeof import("pdf-lib");
const fontkitModule = nodeRequire("@pdf-lib/fontkit");
const fontkit = (fontkitModule.default ?? fontkitModule) as Parameters<import("pdf-lib").PDFDocument["registerFontkit"]>[0];
const qrModule = nodeRequire("qrcode");
const QRCode = (qrModule.default ?? qrModule) as typeof import("qrcode");

export interface CertificateData {
  title: string;
  kindId: string;
  number: string;
  issuedDate: string;
  validUntil: string | null;
  purpose: string | null;
  student: { fullName: string; group: string; course: number; direction: string; faculty: string; form: string; recordBook: string };
  signer: { name: string; position: string };
  verifyUrl: string;
}

const BRAND = rgb(0.145, 0.263, 0.847);
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.4, 0.45, 0.53);
const LINE = rgb(0.85, 0.87, 0.91);

const fontPath = (name: string) => path.join(process.cwd(), "assets", "fonts", name);

const longDate = (d: string) => `${formatDayMonth(d)} ${d.slice(0, 4)} г.`;

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
    else {
      if (line) out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

function bodyText(d: CertificateData): string {
  const s = d.student;
  const base = `${s.fullName} является студентом ${s.course} курса очной формы обучения, группа ${s.group}, направление «${s.direction}», ${s.faculty}. Номер зачётной книжки: ${s.recordBook}.`;
  switch (d.kindId) {
    case "military":
      return `${base} Обучение проводится по очной форме, перерывов в обучении нет. Справка выдана для предоставления в военный комиссариат.`;
    case "scholarship":
      return `${base} Справка выдана для предоставления в орган социальной защиты и назначения выплат.`;
    case "on_demand":
      return `${base} Справка выдана для предоставления по месту требования.`;
    default:
      return `${base} Справка выдана для предоставления по требованию.`;
  }
}

/** Электронная справка в PDF с QR-кодом, ведущим на страницу проверки. Подпись и печать вымышленные. */
export async function buildCertificatePdf(d: CertificateData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${d.title} ${d.number}`);
  doc.setAuthor("StudyHelper (учебный концепт)");
  doc.setSubject("Демонстрационная справка. Не является официальным документом.");
  const regular = await doc.embedFont(fs.readFileSync(fontPath("DejaVuSans.ttf")), { subset: true });
  const bold = await doc.embedFont(fs.readFileSync(fontPath("DejaVuSans-Bold.ttf")), { subset: true });

  const page = doc.addPage([595.28, 841.89]);
  const W = page.getWidth();
  const M = 52;
  let y = 841.89 - 52;

  // Логотип StudyHelper (собственный) и пометка о концепте
  page.drawRectangle({ x: M, y: y - 30, width: 30, height: 30, color: BRAND, borderRadius: 8 } as Parameters<PDFPage["drawRectangle"]>[0]);
  page.drawText("SH", { x: M + 6.5, y: y - 21, size: 13, font: bold, color: rgb(1, 1, 1) });
  page.drawText("StudyHelper", { x: M + 40, y: y - 15, size: 16, font: bold, color: INK });
  page.drawText("Цифровой деканат · учебный концепт", { x: M + 40, y: y - 28, size: 8.5, font: regular, color: MUTED });
  const tag = "ДЕМО-ДОКУМЕНТ";
  page.drawText(tag, { x: W - M - bold.widthOfTextAtSize(tag, 9), y: y - 12, size: 9, font: bold, color: rgb(0.75, 0.2, 0.2) });
  const tag2 = "Не является официальным";
  page.drawText(tag2, { x: W - M - regular.widthOfTextAtSize(tag2, 8), y: y - 24, size: 8, font: regular, color: MUTED });

  y -= 58;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });

  // Заголовок и номер
  y -= 52;
  const title = d.title.toUpperCase();
  const titleSize = 17;
  const titleLines = wrap(title, bold, titleSize, W - 2 * M);
  for (const line of titleLines) {
    page.drawText(line, { x: (W - bold.widthOfTextAtSize(line, titleSize)) / 2, y, size: titleSize, font: bold, color: INK });
    y -= 24;
  }
  const numLine = `№ ${d.number} от ${longDate(d.issuedDate)}`;
  page.drawText(numLine, { x: (W - regular.widthOfTextAtSize(numLine, 11)) / 2, y: y - 2, size: 11, font: regular, color: MUTED });

  // Основной текст
  y -= 44;
  for (const line of wrap(bodyText(d), regular, 11.5, W - 2 * M)) {
    page.drawText(line, { x: M, y, size: 11.5, font: regular, color: INK });
    y -= 18;
  }

  // Реквизиты
  y -= 14;
  const rows: [string, string][] = [
    ["ФИО", d.student.fullName],
    ["Группа, курс", `${d.student.group}, ${d.student.course} курс`],
    ["Направление", d.student.direction],
    ["Номер зачётной книжки", d.student.recordBook],
    ["Куда предоставляется", d.purpose ?? "по требованию"],
    ["Дата выдачи", longDate(d.issuedDate)],
    ["Действительна до", d.validUntil ? longDate(d.validUntil) : "без ограничения срока"],
  ];
  const rowH = 24;
  const tableTop = y;
  rows.forEach(([k, v], i) => {
    const ry = tableTop - i * rowH;
    page.drawLine({ start: { x: M, y: ry - 8 }, end: { x: W - M, y: ry - 8 }, thickness: 0.6, color: LINE });
    page.drawText(k, { x: M, y: ry - 2, size: 9.5, font: regular, color: MUTED });
    const val = wrap(v, bold, 10.5, W - 2 * M - 160)[0] ?? v;
    page.drawText(val, { x: M + 160, y: ry - 2, size: 10.5, font: bold, color: INK });
  });
  y = tableTop - rows.length * rowH - 22;

  // Подпись и печать (вымышленные)
  page.drawText(d.signer.position, { x: M, y, size: 10, font: regular, color: INK });
  page.drawText(d.signer.name, { x: M, y: y - 15, size: 10.5, font: bold, color: INK });
  page.drawSvgPath("M 0 0 C 10 -22, 18 12, 28 -8 S 46 -20, 58 -4 S 80 -16, 96 -6", {
    x: M + 230,
    y: y - 4,
    borderColor: rgb(0.1, 0.2, 0.6),
    borderWidth: 1.4,
  });
  page.drawText("(подпись вымышленная)", { x: M + 230, y: y - 28, size: 7.5, font: regular, color: MUTED });

  // Печать: круг с надписью
  const cx = W - M - 62;
  const cy = y - 6;
  const stamp = rgb(0.18, 0.3, 0.7);
  page.drawCircle({ x: cx, y: cy, size: 44, borderColor: stamp, borderWidth: 1.6, opacity: 0.8, borderOpacity: 0.8 });
  page.drawCircle({ x: cx, y: cy, size: 37, borderColor: stamp, borderWidth: 0.6, borderOpacity: 0.8 });
  const stampLines = ["STUDYHELPER", "ДЕМО-ПЕЧАТЬ", "вымышленная"];
  stampLines.forEach((t, i) => {
    const f = i === 1 ? bold : regular;
    const sz = i === 1 ? 8 : 6.8;
    page.drawText(t, { x: cx - f.widthOfTextAtSize(t, sz) / 2, y: cy + 8 - i * 10, size: sz, font: f, color: stamp, opacity: 0.85 });
  });

  // QR-код: вектором, чтобы оставался чётким при печати
  const qr = QRCode.create(d.verifyUrl, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = 3.4;
  const qrSize = n * cell;
  const qx = W - M - qrSize;
  const qy = 70;
  page.drawRectangle({ x: qx - 8, y: qy - 8, width: qrSize + 16, height: qrSize + 16, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.8 });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) {
        page.drawRectangle({ x: qx + c * cell, y: qy + (n - 1 - r) * cell, width: cell + 0.15, height: cell + 0.15, color: INK });
      }
    }
  }
  page.drawText("Проверка подлинности", { x: M, y: qy + qrSize - 8, size: 11, font: bold, color: INK });
  let ty = qy + qrSize - 26;
  for (const line of wrap("Наведите камеру телефона на QR-код или откройте адрес. Страница проверки покажет, выдана ли такая справка и до какого числа она действует.", regular, 9, W - 2 * M - qrSize - 40)) {
    page.drawText(line, { x: M, y: ty, size: 9, font: regular, color: MUTED });
    ty -= 12.5;
  }
  ty -= 4;
  for (const line of wrap(d.verifyUrl, regular, 8, W - 2 * M - qrSize - 40)) {
    page.drawText(line, { x: M, y: ty, size: 8, font: regular, color: BRAND });
    ty -= 11;
  }

  page.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.6, color: LINE });
  page.drawText("Документ создан в учебном концепте StudyHelper для конкурса. Все данные, подпись и печать вымышленные.", {
    x: M,
    y: 32,
    size: 7.5,
    font: regular,
    color: MUTED,
  });

  return doc.save();
}

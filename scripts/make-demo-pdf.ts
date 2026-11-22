// Создаёт assets/demo-certificate.pdf: запасной образец справки, который отдаётся, если сборка настоящего PDF не удалась.
// Запуск: npx tsx scripts/make-demo-pdf.ts
import fs from "node:fs";
import path from "node:path";
import { buildCertificatePdf } from "../src/lib/pdf";

async function main() {
  const bytes = await buildCertificatePdf({
    title: "Справка об обучении (образец)",
    kindId: "study",
    number: "SH-2026-000000",
    issuedDate: "2026-11-17",
    validUntil: "2027-02-17",
    purpose: "Образец документа для демонстрации",
    student: { fullName: "Иванов Иван Иванович", group: "ПИ-24-1", course: 3, direction: "09.03.04 Программная инженерия", faculty: "Факультет информационных технологий", form: "Очная", recordBook: "0000000" },
    signer: { name: "Специалист деканата", position: "Специалист по учебной работе" },
    verifyUrl: "http://localhost:3000/verify/demo",
  });
  fs.writeFileSync(path.join(process.cwd(), "assets", "demo-certificate.pdf"), bytes);
  console.log("assets/demo-certificate.pdf готов", bytes.length, "байт");
}

main();

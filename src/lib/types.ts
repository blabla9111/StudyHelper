export type Role = "student" | "teacher" | "staff";

export const ROLE_LABEL: Record<Role, string> = {
  student: "Студент",
  teacher: "Преподаватель",
  staff: "Сотрудник деканата",
};

export interface SessionUser {
  id: number;
  login: string;
  role: Role;
  fullName: string;
}

import type { LessonFormat } from "./schedule";

export type OccurrenceStatus = "normal" | "cancelled" | "room_changed" | "moved_away" | "moved_here";

/** Одно конкретное занятие в конкретную дату (с учётом отмен и переносов) */
export interface Occurrence {
  key: string;
  lessonId: number;
  disciplineId: number;
  date: string;
  slot: number;
  start: string;
  end: string;
  subject: string;
  kind: string;
  room: string;
  onlineUrl: string | null;
  teacher: string;
  group: string;
  status: OccurrenceStatus;
  note: string | null;
  /** Прежняя аудитория при её смене */
  prevRoom: string | null;
  /** Для переноса: куда перенесено (moved_away) или откуда (moved_here) */
  otherDate: string | null;
  otherSlot: number | null;
  /** Формат проведения, ссылка и комментарий к подключению */
  format: LessonFormat;
  onlineComment: string | null;
  /** Если формат или ссылку недавно меняли: что было и когда */
  formatChange: { kind: "format" | "link"; from: LessonFormat; at: string } | null;
  /** Есть ли прикреплённая запись пары */
  hasRecording: boolean;
  /** Отметка для текущего студента: преподаватель обещал запись или конспект */
  recordingMark: "will_record" | "will_send_notes" | null;
  /** Когда занятие в расписании менялось (отмена, перенос, аудитория) */
  changedAt: string | null;
}

export interface NotificationDTO {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
}

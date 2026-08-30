const STUDENT_KEY = "gobio_student_id";
const ADMIN_KEY = "gobio_admin";

export function getStudentId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STUDENT_KEY);
}
export function setStudentId(id: string) {
  localStorage.setItem(STUDENT_KEY, id);
}
export function clearStudent() {
  localStorage.removeItem(STUDENT_KEY);
}
export function isAdmin(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ADMIN_KEY) === "1";
}
export function setAdmin(v: boolean) {
  if (v) localStorage.setItem(ADMIN_KEY, "1");
  else localStorage.removeItem(ADMIN_KEY);
}

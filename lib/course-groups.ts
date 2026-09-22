// Catalogo de grupos por cohorte. Unica fuente de verdad para los endpoints
// de token (app/api/v{1,2}/g{n}/auth/token), sus entradas en el OpenAPI y el
// seed de qa_training.credenciales / qa_training_v2.credenciales.
//
// El `username` es el que se siembra en scripts/seed-data*.sql — si cambia
// aca tiene que cambiar alla, no hay validacion cruzada en tiempo de compilado.

export interface CourseGroup {
  grupo: number;
  nombre: string;
  username: string;
}

export const GRUPOS_CURSO_1: readonly CourseGroup[] = [
  { grupo: 1, nombre: "Autenticación y Acceso", username: "g01_auth" },
  { grupo: 2, nombre: "Transferencias entre Cuentas", username: "g02_transferencias" },
  { grupo: 3, nombre: "Pagos de Servicios", username: "g03_pagos" },
  { grupo: 4, nombre: "Registro de Usuario / Onboarding", username: "g04_onboarding" },
  { grupo: 5, nombre: "Tarjetas de Crédito/Débito", username: "g05_tarjetas" },
  { grupo: 6, nombre: "Notificaciones y Alertas", username: "g06_notificaciones" },
  { grupo: 7, nombre: "Carrito de Compras / E-commerce", username: "g07_ecommerce" },
  { grupo: 8, nombre: "Reservas / Turnos", username: "g08_reservas" },
  { grupo: 9, nombre: "Reportes y Dashboard", username: "g09_reportes" },
  { grupo: 10, nombre: "Administración de Roles y Permisos", username: "g10_roles" },
] as const;

export const GRUPOS_CURSO_2: readonly CourseGroup[] = [
  { grupo: 1, nombre: "Cuentas Bancarias", username: "c2_g01_cuentas" },
  { grupo: 2, nombre: "Tarjetas de Crédito/Débito", username: "c2_g02_tarjetas" },
  { grupo: 3, nombre: "Préstamos", username: "c2_g03_prestamos" },
  { grupo: 4, nombre: "Transferencias y Pagos", username: "c2_g04_transferencias" },
  { grupo: 5, nombre: "Ahorros y Depósitos", username: "c2_g05_ahorros" },
] as const;

export function gruposDeCurso(curso: 1 | 2): readonly CourseGroup[] {
  return curso === 1 ? GRUPOS_CURSO_1 : GRUPOS_CURSO_2;
}

export function grupoDeCurso(curso: 1 | 2, grupo: number): CourseGroup | undefined {
  return gruposDeCurso(curso).find((g) => g.grupo === grupo);
}

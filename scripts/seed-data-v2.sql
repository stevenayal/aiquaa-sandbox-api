-- =============================================================================
-- aiquaa-sandbox-api: seed-data-v2.sql  (Curso 2 - Productos Bancarios)
--
-- Datos de ejemplo determinísticos para qa_training_v2 (correr despues de
-- setup-db-v2.sql). Determinísticos a proposito -- no generados al azar --
-- para que la clave de correccion del instructor sea reproducible corrida
-- tras corrida. Cubre las 10 tablas de los 5 grupos del curso 2.
--
-- No toca qa_training (curso 1) en absoluto.
-- =============================================================================

TRUNCATE TABLE
  qa_training_v2.movimientos,
  qa_training_v2.transferencias,
  qa_training_v2.beneficiarios,
  qa_training_v2.cuotas_prestamo,
  qa_training_v2.prestamos,
  qa_training_v2.depositos,
  qa_training_v2.ahorros,
  qa_training_v2.tarjetas,
  qa_training_v2.cuentas,
  qa_training_v2.usuarios
RESTART IDENTITY CASCADE;

-- 8 usuarios (soporte: dueños de cuentas, tarjetas, prestamos, etc.)
INSERT INTO qa_training_v2.usuarios (nombre, email, documento_tipo, documento_numero, telefono, activo) VALUES
  ('Ana Torres',       'ana.torres@bancoqa.com',       'CI',        '4100001', '0981-100001', true),
  ('Bruno Ramirez',    'bruno.ramirez@bancoqa.com',    'CI',        '4100002', '0981-100002', true),
  ('Carla Diaz',       'carla.diaz@bancoqa.com',       'CI',        '4100003', '0981-100003', true),
  ('Diego Fernandez',  'diego.fernandez@bancoqa.com',  'CI',        '4100004', '0981-100004', true),
  ('Elena Gomez',      'elena.gomez@bancoqa.com',      'CI',        '4100005', '0981-100005', true),
  ('Franco Silva',     'franco.silva@bancoqa.com',     'pasaporte', 'PY100006', '0981-100006', true),
  ('Gabriela Nunez',   'gabriela.nunez@bancoqa.com',   'CI',        '4100007', '0981-100007', true),
  ('Hector Morales',   'hector.morales@bancoqa.com',   'RUC',       '80010007-3', '0981-100008', false);

-- 12 cuentas. `estado` es negocio (activa/bloqueada/cerrada), `activa` es el
-- soft-delete del API -- la cuenta 10 esta cerrada pero NO borrada.
INSERT INTO qa_training_v2.cuentas (usuario_id, numero_cuenta, tipo_cuenta, moneda, saldo, estado, activa) VALUES
  (1, '1000000001', 'ahorro',    'PYG',  5000000.00, 'activa',    true),
  (1, '1000000002', 'corriente', 'USD',     1200.00, 'activa',    true),
  (2, '1000000003', 'ahorro',    'PYG',  2500000.00, 'activa',    true),
  (3, '1000000004', 'corriente', 'PYG',  8750000.00, 'activa',    true),
  (4, '1000000005', 'ahorro',    'PYG',   320000.00, 'activa',    true),
  (5, '1000000006', 'ahorro',    'PYG', 15000000.00, 'activa',    true),
  (5, '1000000007', 'ahorro',    'USD',     3400.00, 'activa',    true),
  (6, '1000000008', 'corriente', 'PYG',        0.00, 'bloqueada', true),
  (7, '1000000009', 'ahorro',    'PYG',  1100000.00, 'activa',    true),
  (8, '1000000010', 'ahorro',    'PYG',    45000.00, 'cerrada',   true),
  (2, '1000000011', 'corriente', 'PYG',  6300000.00, 'activa',    true),
  (3, '1000000012', 'ahorro',    'USD',      780.00, 'activa',    true);

-- 20 movimientos. saldo_posterior queda alineado con cuentas.saldo en el
-- ultimo movimiento de cada cuenta, para que un test de "saldo actual" contra
-- GET /cuentas/{id}/saldo cierre con el ledger.
INSERT INTO qa_training_v2.movimientos (cuenta_id, tipo, monto, saldo_posterior, referencia_tipo, referencia_id, descripcion, created_at) VALUES
  (1,  'credito', 6000000.00,  6000000.00, 'manual',         NULL, 'Deposito inicial',            '2026-07-01 09:00:00+00'),
  (1,  'debito',  1500000.00,  4500000.00, 'transferencia',     1, 'Transferencia a Bruno',       '2026-07-05 10:30:00+00'),
  (1,  'credito',  500000.00,  5000000.00, 'manual',         NULL, 'Deposito en ventanilla',      '2026-07-20 14:15:00+00'),
  (2,  'credito',    1500.00,     1500.00, 'manual',         NULL, 'Deposito inicial USD',        '2026-07-02 09:00:00+00'),
  (2,  'debito',      300.00,     1200.00, 'tarjeta',           2, 'Pago tarjeta USD',            '2026-08-10 11:00:00+00'),
  (3,  'credito', 1000000.00,  1000000.00, 'manual',         NULL, 'Deposito inicial',            '2026-07-01 09:10:00+00'),
  (3,  'credito', 1500000.00,  2500000.00, 'transferencia',     1, 'Transferencia recibida',      '2026-07-05 10:30:00+00'),
  (4,  'credito', 9000000.00,  9000000.00, 'manual',         NULL, 'Acreditacion de haberes',     '2026-07-03 08:00:00+00'),
  (4,  'debito',   250000.00,  8750000.00, 'transferencia',     2, 'Pago a beneficiario',         '2026-08-01 16:45:00+00'),
  (5,  'credito',  500000.00,   500000.00, 'manual',         NULL, 'Deposito inicial',            '2026-07-04 09:00:00+00'),
  (5,  'debito',   180000.00,   320000.00, 'manual',         NULL, 'Retiro cajero',               '2026-08-12 18:20:00+00'),
  (6,  'credito',20000000.00, 20000000.00, 'prestamo',          3, 'Desembolso de prestamo',      '2026-07-10 12:00:00+00'),
  (6,  'debito',  5000000.00, 15000000.00, 'deposito',          1, 'Constitucion plazo fijo',     '2026-07-15 12:30:00+00'),
  (7,  'credito',    3400.00,     3400.00, 'manual',         NULL, 'Deposito inicial USD',        '2026-07-06 09:00:00+00'),
  (9,  'credito', 1300000.00,  1300000.00, 'manual',         NULL, 'Deposito inicial',            '2026-07-08 09:00:00+00'),
  (9,  'debito',   200000.00,  1100000.00, 'ahorro',            3, 'Aporte a meta de ahorro',     '2026-08-08 09:30:00+00'),
  (10, 'credito',   45000.00,    45000.00, 'manual',         NULL, 'Saldo remanente al cierre',   '2026-06-30 17:00:00+00'),
  (11, 'credito', 7000000.00,  7000000.00, 'manual',         NULL, 'Acreditacion de haberes',     '2026-07-03 08:05:00+00'),
  (11, 'debito',   700000.00,  6300000.00, 'prestamo',          1, 'Pago de cuota de prestamo',   '2026-08-15 10:00:00+00'),
  (12, 'credito',     780.00,      780.00, 'manual',         NULL, 'Deposito inicial USD',        '2026-07-09 09:00:00+00');

-- 10 tarjetas. `disponible` no se guarda: lo calcula el API como
-- limite_credito - saldo_utilizado.
INSERT INTO qa_training_v2.tarjetas (usuario_id, cuenta_id, tipo, marca, numero_enmascarado, limite_credito, saldo_utilizado, estado, fecha_vencimiento, activo) VALUES
  (1, 1,  'credito', 'visa',       '**** **** **** 1001', 10000000.00, 2500000.00, 'activa',    '2028-06-30', true),
  (1, 2,  'debito',  'mastercard', '**** **** **** 1002',        0.00,       0.00, 'activa',    '2027-11-30', true),
  (2, 3,  'credito', 'mastercard', '**** **** **** 1003',  8000000.00, 7900000.00, 'activa',    '2029-01-31', true),
  (3, 4,  'credito', 'visa',       '**** **** **** 1004', 15000000.00,       0.00, 'activa',    '2028-09-30', true),
  (3, 12, 'debito',  'visa',       '**** **** **** 1005',        0.00,       0.00, 'bloqueada', '2027-05-31', true),
  (4, 5,  'credito', 'amex',       '**** **** **** 1006',  5000000.00, 1250000.00, 'activa',    '2026-10-31', true),
  (5, 6,  'credito', 'visa',       '**** **** **** 1007', 25000000.00, 9800000.00, 'activa',    '2030-03-31', true),
  (6, 8,  'debito',  'mastercard', '**** **** **** 1008',        0.00,       0.00, 'bloqueada', '2028-02-29', true),
  (7, 9,  'credito', 'visa',       '**** **** **** 1009',  4000000.00, 3999000.00, 'activa',    '2027-07-31', true),
  (8, 10, 'credito', 'mastercard', '**** **** **** 1010',  3000000.00,  500000.00, 'vencida',   '2026-01-31', true);

-- 6 prestamos: 2 solicitados (sin cuotas todavia -- el POST /aprobar las
-- genera), 3 aprobados con su plan de cuotas, 1 ya pagado.
INSERT INTO qa_training_v2.prestamos (usuario_id, cuenta_id, monto_solicitado, tasa_interes, plazo_meses, saldo_pendiente, estado, activo) VALUES
  (1, 1,   5000000.00, 18.00,  6,        0.00, 'solicitado', true),
  (2, 11, 12000000.00, 15.50, 12, 11500000.00, 'aprobado',   true),
  (5, 6,  20000000.00, 12.00, 24, 18000000.00, 'aprobado',   true),
  (3, 4,   8000000.00, 20.00,  6,  9600000.00, 'aprobado',   true),
  (4, 5,   3000000.00, 22.50,  4,        0.00, 'solicitado', true),
  (7, 9,   2000000.00, 16.00,  3,        0.00, 'pagado',     true);

-- Cuotas de los prestamos 2, 3, 4 y 6 (los que no estan en 'solicitado').
-- Cuota fija = monto * (1 + tasa/100) / plazo_meses, vencimientos mensuales:
-- misma formula que usa POST /prestamos/{id}/aprobar.
INSERT INTO qa_training_v2.cuotas_prestamo (prestamo_id, numero_cuota, monto, fecha_vencimiento, estado, fecha_pago) VALUES
  (2,  1, 1155000.00, '2026-08-10', 'pagada',    '2026-08-09 10:00:00+00'),
  (2,  2, 1155000.00, '2026-09-10', 'pendiente', NULL),
  (2,  3, 1155000.00, '2026-10-10', 'pendiente', NULL),
  (2,  4, 1155000.00, '2026-11-10', 'pendiente', NULL),
  (2,  5, 1155000.00, '2026-12-10', 'pendiente', NULL),
  (2,  6, 1155000.00, '2027-01-10', 'pendiente', NULL),
  (2,  7, 1155000.00, '2027-02-10', 'pendiente', NULL),
  (2,  8, 1155000.00, '2027-03-10', 'pendiente', NULL),
  (2,  9, 1155000.00, '2027-04-10', 'pendiente', NULL),
  (2, 10, 1155000.00, '2027-05-10', 'pendiente', NULL),
  (2, 11, 1155000.00, '2027-06-10', 'pendiente', NULL),
  (2, 12, 1155000.00, '2027-07-10', 'pendiente', NULL),
  (3,  1,  933333.33, '2026-08-15', 'pagada',    '2026-08-14 09:00:00+00'),
  (3,  2,  933333.33, '2026-09-15', 'pendiente', NULL),
  (3,  3,  933333.33, '2026-10-15', 'pendiente', NULL),
  (3,  4,  933333.33, '2026-11-15', 'pendiente', NULL),
  (4,  1, 1600000.00, '2026-07-20', 'vencida',   NULL),
  (4,  2, 1600000.00, '2026-08-20', 'vencida',   NULL),
  (4,  3, 1600000.00, '2026-09-20', 'pendiente', NULL),
  (4,  4, 1600000.00, '2026-10-20', 'pendiente', NULL),
  (4,  5, 1600000.00, '2026-11-20', 'pendiente', NULL),
  (4,  6, 1600000.00, '2026-12-20', 'pendiente', NULL),
  (6,  1,  773333.33, '2026-06-05', 'pagada',    '2026-06-04 08:00:00+00'),
  (6,  2,  773333.33, '2026-07-05', 'pagada',    '2026-07-04 08:00:00+00'),
  (6,  3,  773333.34, '2026-08-05', 'pagada',    '2026-08-04 08:00:00+00');

-- 10 beneficiarios (destinos externos de transferencia).
INSERT INTO qa_training_v2.beneficiarios (usuario_id, nombre, banco, numero_cuenta, alias, activo) VALUES
  (1, 'Maria Lopez',      'Banco Continental', '2000000001', 'maria.lopez',   true),
  (1, 'Pedro Gimenez',    'Itau',              '2000000002', 'pedro.g',       true),
  (2, 'Sofia Cabrera',    'Vision Banco',      '2000000003', 'sofi',          true),
  (3, 'Luis Benitez',     'Banco Familiar',    '2000000004', 'luisb',         true),
  (3, 'Marta Ayala',      'Sudameris',         '2000000005', 'marta.ayala',   true),
  (4, 'Ramon Duarte',     'Banco Atlas',       '2000000006', NULL,            true),
  (5, 'Julia Ferreira',   'Banco Continental', '2000000007', 'juli',          true),
  (5, 'Oscar Villalba',   'Itau',              '2000000008', 'oscarv',        false),
  (7, 'Nadia Riquelme',   'Vision Banco',      '2000000009', 'nadia',         true),
  (7, 'Cesar Ortiz',      'Banco Familiar',    '2000000010', 'cesar.ortiz',   true);

-- 12 transferencias: internas (cuenta_destino_id) y externas
-- (beneficiario_id), con los cuatro estados representados.
INSERT INTO qa_training_v2.transferencias (cuenta_origen_id, cuenta_destino_id, beneficiario_id, monto, moneda, concepto, referencia, estado, created_at) VALUES
  (1,  3,    NULL, 1500000.00, 'PYG', 'Prestamo entre amigos',   'TRF-2026-0001', 'completada', '2026-07-05 10:30:00+00'),
  (4,  NULL,    4,  250000.00, 'PYG', 'Pago de alquiler',        'TRF-2026-0002', 'completada', '2026-08-01 16:45:00+00'),
  (6,  1,    NULL, 2000000.00, 'PYG', 'Devolucion',              'TRF-2026-0003', 'completada', '2026-08-03 09:15:00+00'),
  (11, NULL,    3,  800000.00, 'PYG', 'Pago proveedor',          'TRF-2026-0004', 'completada', '2026-08-05 11:20:00+00'),
  (1,  NULL,    1,  350000.00, 'PYG', 'Regalo',                  'TRF-2026-0005', 'pendiente',  '2026-08-20 13:00:00+00'),
  (9,  NULL,    9,  120000.00, 'PYG', 'Cuota club',              'TRF-2026-0006', 'completada', '2026-08-22 08:40:00+00'),
  (4,  9,    NULL,  600000.00, 'PYG', 'Adelanto',                'TRF-2026-0007', 'rechazada',  '2026-08-23 15:10:00+00'),
  (6,  NULL,    7, 1000000.00, 'PYG', 'Pago servicios',          'TRF-2026-0008', 'completada', '2026-08-25 10:05:00+00'),
  (3,  1,    NULL,  400000.00, 'PYG', 'Reintegro',               'TRF-2026-0009', 'anulada',    '2026-08-26 17:30:00+00'),
  (2,  7,    NULL,     150.00, 'USD', 'Transferencia USD',       'TRF-2026-0010', 'completada', '2026-08-27 12:00:00+00'),
  (11, NULL,    5,  950000.00, 'PYG', 'Honorarios',              'TRF-2026-0011', 'pendiente',  '2026-08-28 09:45:00+00'),
  (5,  NULL,    6,   80000.00, 'PYG', 'Pago cuota',              'TRF-2026-0012', 'completada', '2026-08-30 19:00:00+00');

-- 6 planes de ahorro programado.
INSERT INTO qa_training_v2.ahorros (usuario_id, cuenta_id, nombre_meta, meta_monto, aporte_mensual, saldo_acumulado, tasa_anual, estado, activo) VALUES
  (1, 1,  'Vacaciones 2027',    12000000.00,  500000.00,  2500000.00,  6.50, 'activo',     true),
  (2, 3,  'Fondo de emergencia', 9000000.00,  300000.00,  1200000.00,  5.00, 'activo',     true),
  (7, 9,  'Notebook nueva',      4000000.00,  200000.00,   800000.00,  4.75, 'activo',     true),
  (3, 4,  'Cuota inicial casa', 50000000.00, 2000000.00, 14000000.00,  7.25, 'activo',     true),
  (5, 6,  'Curso de posgrado',   6000000.00,  600000.00,  6000000.00,  5.50, 'completado', true),
  (4, 5,  'Moto',                8000000.00,  400000.00,   400000.00,  6.00, 'cancelado',  true);

-- 6 depositos a plazo fijo.
INSERT INTO qa_training_v2.depositos (usuario_id, cuenta_id, monto, tasa_anual, plazo_dias, fecha_inicio, fecha_vencimiento, interes_generado, estado, activo) VALUES
  (5, 6,  5000000.00, 11.50, 180, '2026-07-15', '2027-01-11',       0.00, 'activo',    true),
  (1, 1,  3000000.00, 10.25,  90, '2026-08-01', '2026-10-30',       0.00, 'activo',    true),
  (3, 4,  7000000.00, 12.00, 365, '2026-06-10', '2027-06-10',       0.00, 'activo',    true),
  (2, 11, 2000000.00,  9.75,  60, '2026-05-01', '2026-06-30',   32083.33, 'vencido',   true),
  (7, 9,  1000000.00,  8.50,  30, '2026-04-01', '2026-05-01',    7083.33, 'vencido',   true),
  (4, 5,   500000.00, 10.00, 120, '2026-06-01', '2026-09-29',    4109.59, 'cancelado', true);

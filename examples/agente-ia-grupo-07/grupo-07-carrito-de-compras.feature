# language: es
@grupo07 @carrito @ecommerce @regression
Feature: Carrito de Compras / E-commerce (Grupo 07)
  Como alumno del curso de automatización de pruebas
  Quiero ejercitar el cierre de compra (checkout) y la gestión de órdenes del sandbox
  Para validar el cálculo server-side del total y el ciclo de vida de la orden (activo/inactivo)

  Contexto (compartido por todos los escenarios):
  - Base URL: {{baseUrl}}  (p.ej. http://localhost:3000)
  - Autenticación: cabecera `x-api-key: {{apiKey}}`
  - Esquema: `qa_training.ordenes` (cabecera) + `qa_training.items_orden` (detalle)
  - El monto total y los subtotales los calcula SIEMPRE el servidor; un total enviado por el cliente es ignorado.
  - Toda orden nace en estado `pendiente` y solo se da de baja con soft-delete (`activo = false`).

  # ---------------------------------------------------------------------------
  # RF-G7-01 — Listar órdenes
  # ---------------------------------------------------------------------------
  @RF-G7-01
  Scenario: Listar todas las órdenes activas sin filtro
    Given una API key válida
    When GET /api/v1/ordenes sin parámetros
    Then el código de respuesta es 200
    And la respuesta contiene "data" como arreglo
    And cada elemento tiene los campos id, usuario_id, producto, monto, estado, created_at
    And ningún elemento del listado incluye la propiedad "items"
    And el listado contiene a lo sumo 100 órdenes (LIMIT 100)

  @RF-G7-01
  Scenario: Filtrar órdenes por comprador
    Given una API key válida
    And existe al menos una orden del comprador 1
    When GET /api/v1/ordenes?usuarioId=1
    Then el código de respuesta es 200
    And todos los elementos devueltos tienen usuario_id igual a 1
    And los elementos están ordenados por id ascendente

  @RF-G7-01
  Scenario: Un comprador sin órdenes devuelve lista vacía
    Given una API key válida
    When GET /api/v1/ordenes?usuarioId=999999
    Then el código de respuesta es 200
    And "data" es un arreglo vacío

  @RF-G7-01
  Scenario: usuarioId no numérico es rechazado con 400
    Given una API key válida
    When GET /api/v1/ordenes?usuarioId=abc
    Then el código de respuesta es 400
    And el cuerpo incluye el error "VALIDATION_ERROR"

  @RF-G7-01
  Scenario: Una orden recién creada aparece en el listado de su comprador
    Given una API key válida
    And cierro la compra de 1 item para el comprador 2 y guardo su id como "nuevaOrdenId"
    When GET /api/v1/ordenes?usuarioId=2
    Then el código de respuesta es 200
    And "data" incluye un elemento con id igual a "nuevaOrdenId"

  # ---------------------------------------------------------------------------
  # RF-G7-02 — Cerrar la compra (checkout)
  # ---------------------------------------------------------------------------
  @RF-G7-02
  Scenario: Checkout con dos ítems calcula el total server-side
    Given una API key válida
    And el comprador 1 existe
    When POST /api/v1/ordenes con:
      | campo          | valor                                  |
      | usuarioId      | 1                                       |
      | items[0].producto | "Teclado"                          |
      | items[0].cantidad  | 2                                |
      | items[0].precioUnitario | 10.50                      |
      | items[1].producto | "Mouse"                            |
      | items[1].cantidad  | 1                                |
      | items[1].precioUnitario | 5.25                       |
    Then el código de respuesta es 201
    And "data.monto" es 26.25 (2*10.50 + 1*5.25)
    And "data.producto" es "Teclado" (primer ítem)
    And "data.estado" es "pendiente"
    And "data.items" tiene 2 elementos
    And cada "data.items[i].subtotal" = cantidad * precioUnitario (21.00 y 5.25)

  @RF-G7-02
  Scenario: El array de ítems vacío es rechazado
    Given una API key válida
    When POST /api/v1/ordenes con usuarioId 1 y "items" = []
    Then el código de respuesta es 400
    And el cuerpo incluye "VALIDATION_ERROR"
    And no se creó ninguna fila en ordenes

  @RF-G7-02
  Scenario: Un ítem con cantidad cero es rechazado
    Given una API key válida
    When POST /api/v1/ordenes con item cantidad = 0, precioUnitario = 9.99
    Then el código de respuesta es 400
    And el cuerpo incluye "VALIDATION_ERROR"

  @RF-G7-02
  Scenario: Cantidad enviada como texto es rechazada por validación
    Given una API key válida
    When POST /api/v1/ordenes con item cantidad = "2" (string), precioUnitario = 9.99
    Then el código de respuesta es 400
    And el cuerpo incluye "VALIDATION_ERROR"

  @RF-G7-02
  Scenario: Comprador inexistente no crea ni cabecera ni ítems
    Given una API key válida
    When POST /api/v1/ordenes con usuarioId = 999999 y 1 item válido
    Then el código de respuesta es 400
    And el cuerpo incluye "VALIDATION_ERROR"
    And no quedó ninguna fila huérfana en items_orden

  # ---------------------------------------------------------------------------
  # RF-G7-03 — Consultar una orden con su detalle
  # ---------------------------------------------------------------------------
  @RF-G7-03
  Scenario: Consultar una orden recién creada devuelve cabecera + ítems
    Given una API key válida
    And cierro la compra de 2 items para el comprador 3 y guardo su id como "ordenId"
    When GET /api/v1/ordenes/{ordenId}
    Then el código de respuesta es 200
    And "data.items" tiene la misma cantidad de ítems enviados en el checkout
    And la suma de "data.items[i].subtotal" es igual a "data.monto"
    And los ítems están ordenados por id ascendente

  @RF-G7-03
  Scenario: Consultar una orden inexistente devuelve 404
    Given una API key válida
    When GET /api/v1/ordenes/999999
    Then el código de respuesta es 404
    And el cuerpo incluye el mensaje "Orden no encontrada."

  @RF-G7-03
  Scenario: Id no entero positivo es rechazado con 400
    Given una API key válida
    When GET /api/v1/ordenes/abc
    Then el código de respuesta es 400
    And el cuerpo incluye "VALIDATION_ERROR"

  # ---------------------------------------------------------------------------
  # RF-G7-04 — Recalculcar una orden (solo cabecera, NO items_orden)
  # ---------------------------------------------------------------------------
  @RF-G7-04
  Scenario: Recálculo actualiza monto/producto pero NO el detalle original
    Given una API key válida
    And cierro la compra de 1 item (producto "A", cantidad 1, precio 10) para el comprador 4 y guardo su id
    When PUT /api/v1/ordenes/{ordenId} con items = [{producto:"B", cantidad:3, precioUnitario:7}]
    Then el código de respuesta es 200
    And "data.monto" es 21.00 (3*7)
    And "data.producto" es "B"
    And "data" NO incluye la propiedad "items"
    When GET /api/v1/ordenes/{ordenId} (post-recálculo)
    Then "data.monto" sigue siendo 21.00
    But "data.items" sigue mostrando el ítem original "A" (inconsistencia deliberada del diseño)

  @RF-G7-04
  Scenario: Recálculo con items vacíos es rechazado
    Given una API key válida
    When PUT /api/v1/ordenes/1 con "items" = []
    Then el código de respuesta es 400
    And el cuerpo incluye "VALIDATION_ERROR"

  @RF-G7-04
  Scenario: Recálculo de orden inexistente o dada de baja devuelve 404
    Given una API key válida
    When PUT /api/v1/ordenes/999999 con 1 item válido
    Then el código de respuesta es 404
    And el cuerpo incluye "Orden no encontrada."

  # ---------------------------------------------------------------------------
  # RF-G7-05 — Dar de baja (soft-delete)
  # ---------------------------------------------------------------------------
  @RF-G7-05
  Scenario: Dar de baja una orden vigente
    Given una API key válida
    And cierro la compra de 1 item para el comprador 5 y guardo su id
    When DELETE /api/v1/ordenes/{ordenId}
    Then el código de respuesta es 204
    And la respuesta no tiene cuerpo
    When GET /api/v1/ordenes/{ordenId}
    Then el código de respuesta es 404
    When GET /api/v1/ordenes?usuarioId=5
    Then el código de respuesta es 200
    And "data" no incluye la orden dada de baja

  @RF-G7-05
  Scenario: Dar de baja de una orden ya dada de baja devuelve 404
    Given una API key válida
    And la orden 1 ya está dada de baja
    When DELETE /api/v1/ordenes/1
    Then el código de respuesta es 404
    And el cuerpo incluye "Orden no encontrada."

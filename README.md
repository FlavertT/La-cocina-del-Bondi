# La Cocina del Bondi

Sistema de gestión de compras, stock, viandas y entregas por empresa.

## Demo instalable de recetas

[Abrir la demo de GitHub Pages](https://flavertt.github.io/La-cocina-del-Bondi/)

La carpeta `docs/` contiene una PWA estática de presentación con **Malfattis** y **Pan de salvado**. No requiere instalar dependencias ni ejecutar el backend de Workers. GitHub Pages publica `main /docs`.

1. Elegir receta, variante y cantidad.
2. Revisar el consumo, el disponible y el saldo proyectado.
3. Si faltan datos, abrir **Revisar stock** y completarlos, o elegir **Usar stock de ejemplo** y guardar.
4. Confirmar la preparación para descontar y registrar su detalle.
5. Revisar **Depósito** e **Historial**, descargar la comparación CSV o reiniciar.

La referencia inicial contiene solamente los ingredientes relevantes y las cantidades que pueden convertirse a partir de presentaciones explícitas del Excel. Harina sin peso de presentación, nuez moscada sin unidad y productos no presentes quedan sin cargar. Queso máquina no sustituye a queso para rallar. Los datos de ejemplo se identifican como ficticios. La demo no modifica ni sube el Excel original.

Los cambios se guardan en `localStorage` de cada navegador: no hay base compartida, cuentas, sincronización ni envíos de WhatsApp. Se puede instalar desde el menú de un navegador compatible; en iPhone usar Compartir → Agregar a inicio. Tras una primera carga completa, el service worker conserva los archivos necesarios para abrirla sin conexión. Borrar los datos del navegador elimina su historial local.

Prueba local: servir `docs/` con un servidor HTTP, por ejemplo `python -m http.server 4173 --directory docs`. Prueba de cálculos y recursos de PWA: `node tests/demo.mjs`.

## Funciones

- Proveedores, compras, precios históricos, pagos parciales y saldos.
- Productos y movimientos de stock por rol.
- Pedidos variables por empresa, preparación, despacho, recepción y remitos imprimibles.
- Platos y recetas con porciones base, conversión de unidades y descuento automático de ingredientes.
- Cierre semanal y exportación CSV.
- Cuentas por cobrar a mes vencido, cobros parciales y estados de cuenta internos.
- Roles: administración, cocina, bachero, caja y postres, delivery.

## Estado

Primera versión funcional. La vista previa local utiliza una identidad de prueba. El acceso real de varios empleados requiere publicación privada y configuración de acceso. La facturación fiscal electrónica está pendiente; los documentos emitidos son internos.

El repositorio contiene código y el catálogo de nombres de productos. No incluye cantidades del Excel, bases de datos, usuarios, compras, pedidos, pagos, credenciales ni registros de prueba.

## Requisitos

- Node.js 22.13 o superior y npm.
- La aplicación usa React, Vinext, Cloudflare Workers y D1 (SQLite).

## Instalar y ejecutar

```sh
npm ci
npm run build
```

La compilación genera `dist/server/wrangler.json`. Aplicar las migraciones locales una sola vez, en este orden:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_absent_bill_hollister.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_loving_tarantula.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_tense_energizer.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_absent_mac_gargan.sql
npm run dev
```

Abrir la dirección `Local` que muestra el servidor. En desarrollo, Iniciar sesión activa la cuenta simulada `seedy@sites.test`. Esta simulación no se incluye en la compilación de producción.

## Puesta en marcha

1. Incorporar el catálogo y confirmar las unidades de los productos, o crear ítems nuevos.
2. Contar el stock físico y cargar los movimientos iniciales.
3. Registrar proveedores y empresas.
4. Crear recetas con porciones base e ingredientes; para paquetes y cajas indicar su contenido.
5. Seleccionar las recetas al cargar los pedidos. Confirmar la preparación descuenta los ingredientes una sola vez.
6. Confirmar el despacho, imprimir el remito y registrar la recepción.
7. Registrar la deuda mensual después de cerrar el mes y cargar los cobros.

Si falta stock, una preparación real puede dejar un saldo negativo que debe reconciliarse. Los consumos sin receta y las pérdidas se registran manualmente. El costo por porción es estimado con el último precio confirmado, sin mano de obra ni servicios.

## Preparar porciones y alertas

### Fichas basadas en los documentos de recetas

En **Platos y recetas** hay pestañas **Mis recetas**, **Malfattis** y **Pan de salvado**. Las dos últimas contienen fichas de referencia con sus variantes. **Crear ficha con esta variante** abre un borrador: vincular cada ingrediente a su producto real del depósito antes de guardar. No se crean productos ni saldos automáticamente.

El formulario tiene secciones **Ficha**, **Ingredientes** y **Elaboración**: categoría, número, rendimiento y unidad (porciones o piezas), peso individual, tiempo estimado, ingredientes con detalles, paso a paso y observaciones. Las recetas anteriores siguen funcionando.

- Malfattis conserva las cantidades originales para 15, 20, 25 y 30 porciones, sin sustituirlas por una única regla proporcional. Algunas unidades de las variantes de 25 y 30 no están indicadas en el archivo: quedan pendientes de confirmar. El peso de espinaca está expresado blanqueado; ajustar cantidad o presentación si el stock registra espinaca cruda. Las variantes de 15 y 20 no indican peso por porción.
- Pan de salvado permite elegir 40 calzonis de 180 g, 85 piadinas de 90 g o 150 bollitos de 50 g; y levadura habitual de 50 g o de invierno de 100 g. Agua total: 3 litros (1 de hidratación y 2 adicionales), sin descuento por defecto. No se inventan tiempo de horno, temperatura ni cantidades de ingredientes opcionales.
- Un ingrediente sin control de stock, como agua de red, puede conservarse en la ficha desmarcando **Descontar del depósito**. No genera movimientos ni alertas, ni se incluye en el costo estimado. Debe quedar al menos un producto vinculado al depósito.

Guardar o editar una ficha no consume stock. **Preparar → Confirmar preparación y descontar** registra el consumo proporcional de la ficha seleccionada. Para una producción vinculada a un pedido, confirmar solamente desde Pedidos para evitar registrar dos preparaciones diferentes. Los huevos y otras unidades pueden dar fracciones al escalar: revisar el rendimiento o ajustar la ficha cuando corresponda. El historial de preparación conserva una copia de la ficha utilizada.

En **Platos y recetas → Preparar**, elegir las porciones. La vista muestra el consumo proporcional, el disponible y el saldo final por ingrediente. Confirmar registra el historial y descuenta todos los ingredientes en una transacción. Repetir la misma confirmación no duplica el consumo.

Para una preparación vinculada a una empresa, usar **Pedidos → Preparar**. Registrar el mismo trabajo también desde Recetas sería una segunda preparación y descontaría nuevamente.

Un consumo que deja stock negativo genera un aviso por producto en **Stock → Alertas de faltantes**, tanto desde Recetas como desde Pedidos o movimientos manuales. El aviso guarda el faltante al momento del consumo; una reposición posterior no modifica ese historial. Sin API, queda pendiente. El formulario advierte los faltantes antes de confirmar, sin enviar avisos por cada cambio de porciones.

### Conexión opcional de WhatsApp con Twilio

El adaptador está preparado para Twilio. Todavía no hay una cuenta ni un número de destino configurados. Si se elige otro proveedor habrá que adaptar el envío.

Configurar secretos del Worker (en desarrollo, archivo local `.dev.vars`, ignorado por Git):

```text
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
WHATSAPP_FROM=+numero_emisor_completo
WHATSAPP_TO=+numero_destino_completo
WHATSAPP_CONTENT_SID=HX...
```

El emisor debe estar habilitado para WhatsApp y la plantilla debe estar aprobada. Plantilla propuesta: «La Cocina del Bondi: falta {{1}}. Faltante: {{2}}. Stock registrado: {{3}}». Variables: producto, cantidad faltante con unidad y saldo con unidad. Ver [documentación oficial de Twilio](https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder).

Las alertas nuevas se envían después de confirmar el consumo si todos los secretos están configurados. Las pendientes anteriores se envían individualmente desde Stock por administración o caja. Los rechazos quedan visibles y permiten reintentar. Si un envío no puede confirmarse, no se reintenta automáticamente: revisar el proveedor para evitar duplicados. «Aceptado por el proveedor» no significa entregado; la confirmación de entrega por webhook queda pendiente. Si el proceso se interrumpe durante el envío, revisar el aviso «Envío en curso» en el proveedor.

Nunca guardar tokens o números de empleados en el repositorio público. El prefijo de destino suministrado inicialmente está incompleto; falta el número completo antes de activar envíos.

## Producción

La autenticación espera las cabeceras verificadas de la plataforma Sites. No publicar directamente en un servidor que acepte cabeceras de identidad arbitrarias del navegador. El primer visitante autenticado debe ser el propietario y el sitio debe mantenerse privado durante el alta inicial.

`.openai/hosting.json` declara la base D1, sin identidad de un sitio concreto. Para publicar mediante Sites, registrar el proyecto y configurar su acceso privado. Subir a GitHub conserva el código; no pone el sistema en línea.

## Verificación realizada

Compilación y comprobación de tipos. Pruebas funcionales de compras, pagos, cobros a mes vencido, remitos, cantidades recibidas, conversión de ingredientes y confirmaciones simultáneas sin duplicar el consumo.

Para probar las fichas nuevas sin tocar datos reales, con Node.js 22.13+ y dependencias instaladas:

```sh
node tests/recipe-format.mjs
```

La prueba ejecuta la ruta real contra SQLite en memoria, reemplazando los enlaces a Cloudflare y el envoltorio HTTP. Verifica cantidades de los documentos, metadatos, conversiones, creación sin consumo, preparación proporcional, confirmaciones repetidas, recetas anteriores, historial, faltantes y permisos. No sustituye una prueba de interfaz ni de despliegue en Workers.

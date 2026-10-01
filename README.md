# La Cocina del Bondi

Sistema de gestión de compras, stock, viandas y entregas por empresa.

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

## Producción

La autenticación espera las cabeceras verificadas de la plataforma Sites. No publicar directamente en un servidor que acepte cabeceras de identidad arbitrarias del navegador. El primer visitante autenticado debe ser el propietario y el sitio debe mantenerse privado durante el alta inicial.

`.openai/hosting.json` declara la base D1, sin identidad de un sitio concreto. Para publicar mediante Sites, registrar el proyecto y configurar su acceso privado. Subir a GitHub conserva el código; no pone el sistema en línea.

## Verificación realizada

Compilación y comprobación de tipos. Pruebas funcionales de compras, pagos, cobros a mes vencido, remitos, cantidades recibidas, conversión de ingredientes y confirmaciones simultáneas sin duplicar el consumo.

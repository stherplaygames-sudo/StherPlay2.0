# Sther Play App

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Migrar Sheets a Firestore

1. Crea Firestore y las colecciones `clients` y `subscriptions`.
2. Descarga tu clave de servicio desde Firebase Console > Project Settings > Service accounts.
3. Guarda esa clave como `serviceAccountKey.json` en la raiz del proyecto.
4. Ejecuta:

```bash
npm run import:firestore
```

Por defecto el script usa este Apps Script:

```text
https://script.google.com/macros/s/AKfycbwBsBwp5zkmr_cnq0ZuZAhlIfdSO7VH-whbiwgmWA26x_r7YC0QbqpP8ZfAmVYYrOU/exec
```

Si quieres usar otra URL:

```bash
set APPS_SCRIPT_URL=https://tu-script/exec
npm run import:firestore
```

# Instalar Dependencias de Firebase Functions

## Supabase Client

Necesitas instalar el cliente de Supabase en las Firebase Functions:

```bash
cd functions
npm install @supabase/supabase-js
```

## Verificar instalación

```bash
npm list @supabase/supabase-js
```

## Después de instalar

1. Ejecutar `npm run build` para compilar
2. Desplegar con `firebase deploy --only functions`

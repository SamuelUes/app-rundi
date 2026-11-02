#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const env = args[0] || 'development';

const envFiles = {
  // Archivos fuente de configuración por entorno
  // development -> .env.development
  // production  -> .env.productions (plantilla para el proyecto oficial)
  development: '.env.development',
  production: '.env.productions',
};

const envFile = envFiles[env];

if (!envFile) {
  console.error(`❌ Entorno inválido: ${env}`);
  console.log('Uso: node scripts/switch-env.js [development|production]');
  process.exit(1);
}

const envPath = path.join(__dirname, '..', envFile);

if (!fs.existsSync(envPath)) {
  console.error(`❌ Archivo no encontrado: ${envFile}`);
  process.exit(1);
}

// Copiar archivo de entorno
const targetPath = path.join(__dirname, '..', '.env');
fs.copyFileSync(envPath, targetPath);

console.log(`✅ Entorno cambiado a: ${env.toUpperCase()}`);
console.log(`📄 Usando: ${envFile}`);

// Mostrar configuración actual
const envContent = fs.readFileSync(targetPath, 'utf8');
const apiUrl = envContent.match(/API_BASE_URL=(.+)/)?.[1];
const wsUrl = envContent.match(/WS_URL=(.+)/)?.[1];

console.log(`\n🔗 Configuración:`);
console.log(`   API: ${apiUrl}`);
console.log(`   WebSocket: ${wsUrl}`);
console.log(`\n💡 Recuerda reiniciar Expo para aplicar cambios\n`);

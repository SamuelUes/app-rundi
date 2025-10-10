import pool from "./config/database";

/**
 * Probar conexión a Supabase PostgreSQL
 */
export async function testDatabaseConnection() {
  console.log("🔍 Probando conexión a Supabase PostgreSQL...");
  
  try {
    const client = await pool.connect();
    
    // Test 1: Verificar conexión
    const result = await client.query("SELECT NOW() as current_time");
    console.log("✅ Conexión exitosa!");
    console.log("⏰ Hora del servidor:", result.rows[0].current_time);
    
    // Test 2: Verificar tablas creadas
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log("\n📊 Tablas encontradas:");
    tables.rows.forEach((row) => {
      console.log(`  ✅ ${row.table_name}`);
    });
    
    // Test 3: Insertar un registro de prueba
    console.log("\n🧪 Insertando registro de prueba...");
    const insertResult = await client.query(`
      INSERT INTO drivers (user_id, license_number, status)
      VALUES ($1, $2, $3)
      RETURNING *
    `, ["test-firebase-user-123", "LIC-TEST-001", "pending"]);
    
    console.log("✅ Registro insertado:");
    console.log(insertResult.rows[0]);
    
    // Test 4: Leer el registro
    console.log("\n📖 Leyendo registro...");
    const selectResult = await client.query(`
      SELECT * FROM drivers WHERE user_id = $1
    `, ["test-firebase-user-123"]);
    
    console.log("✅ Registro encontrado:");
    console.log(selectResult.rows[0]);
    
    // Test 5: Eliminar el registro de prueba
    console.log("\n🗑️ Limpiando registro de prueba...");
    await client.query(`
      DELETE FROM drivers WHERE user_id = $1
    `, ["test-firebase-user-123"]);
    
    console.log("✅ Registro eliminado");
    
    client.release();
    
    console.log("\n🎉 ¡Todas las pruebas pasaron exitosamente!");
    console.log("✅ Supabase PostgreSQL está funcionando correctamente");
    
    return true;
  } catch (error) {
    console.error("❌ Error en la conexión:", error);
    return false;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testDatabaseConnection()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

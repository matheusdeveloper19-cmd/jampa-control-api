// src/db/migrate.js — Executa o schema SQL no banco
// Uso: node src/db/migrate.js
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('./pool');

async function migrate() {
  const schemaPath = path.join(__dirname, '../../../jampa-control-schema.sql');

  if (!fs.existsSync(schemaPath)) {
    console.error('❌  Arquivo de schema não encontrado:', schemaPath);
    console.error('    Coloque o jampa-control-schema.sql na raiz do projeto.');
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf-8');
  const client = await pool.connect();

  try {
    console.log('🗄️  Executando migração...');
    await client.query(sql);
    console.log('✅  Schema criado com sucesso.');
  } catch (err) {
    console.error('❌  Erro na migração:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

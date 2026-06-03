// src/db/seed.js — Popula dados estruturais iniciais
// Uso: node src/db/seed.js
// ATENÇÃO: não execute mais de uma vez sem limpar o banco antes
require('dotenv').config();
const bcrypt = require('bcrypt');
const { query, pool } = require('./pool');

async function seed() {
  console.log('🌱  Iniciando seed...\n');

  // ── 1. Perfis ──────────────────────────────────────────────
  const perfis = [
    { nome: 'Administrador',                      limite: 0.00,   is_admin: true  },
    { nome: 'Supervisor',                          limite: 300.00, is_admin: false },
    { nome: 'Representante Comercial',             limite: 200.00, is_admin: false },
    { nome: 'Técnico em M&M',                      limite: 150.00, is_admin: false },
    { nome: 'Técnico em Instalação de Máquinas',   limite: 150.00, is_admin: false },
  ];

  for (const p of perfis) {
    await query(
      `INSERT INTO perfis (nome, limite_adiantamento, is_admin)
       VALUES ($1, $2, $3) ON CONFLICT (nome) DO NOTHING`,
      [p.nome, p.limite, p.is_admin]
    );
  }
  console.log(`✅  ${perfis.length} perfis criados.`);

  // ── 2. Tipos de despesa ────────────────────────────────────
  const tipos = [
    'Alimentação', 'Hospedagem', 'Pedágio', 'Estacionamento',
    'Manutenção', 'Material de Escritório', 'Transporte', 'Telefonia', 'Outros',
  ];
  for (const nome of tipos) {
    await query(
      `INSERT INTO tipos_despesa (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING`, [nome]
    );
  }
  console.log(`✅  ${tipos.length} tipos de despesa criados.`);

  // ── 3. Tipos de despesa da frota ───────────────────────────
  const tiposFreota = [
    'Combustível', 'Manutenção / Revisão', 'Seguro',
    'IPVA / Licenciamento', 'Lavagem', 'Pneus', 'Outros',
  ];
  for (const nome of tiposFreota) {
    await query(
      `INSERT INTO tipos_despesa_frota (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING`, [nome]
    );
  }
  console.log(`✅  ${tiposFreota.length} tipos de despesa da frota criados.`);

  // ── 4. Centros de custo ────────────────────────────────────
  const centros = [
    { codigo: 'ADM-001', nome: 'Administrativo', descricao: 'Gestão administrativa geral' },
    { codigo: 'OPS-001', nome: 'Operações',      descricao: 'Operações de campo e logística' },
    { codigo: 'COM-001', nome: 'Comercial',       descricao: 'Atividades comerciais' },
    { codigo: 'TEC-001', nome: 'Tecnologia',      descricao: 'Infraestrutura e TI' },
    { codigo: 'RH-001',  nome: 'RH',              descricao: 'Recursos humanos' },
  ];
  for (const cc of centros) {
    await query(
      `INSERT INTO centros_custo (codigo, nome, descricao)
       VALUES ($1, $2, $3) ON CONFLICT (codigo) DO NOTHING`,
      [cc.codigo, cc.nome, cc.descricao]
    );
  }
  console.log(`✅  ${centros.length} centros de custo criados.`);

  // ── 5. Usuário Admin ───────────────────────────────────────
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@jampa.com';
  const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin@2025';

  if (ADMIN_SENHA === 'admin@2025') {
    console.warn('\n⚠️   ATENÇÃO: usando senha padrão "admin@2025".');
    console.warn('    Troque imediatamente após o primeiro login!\n');
  }

  const { rows: jaExiste } = await query(
    `SELECT id FROM usuarios WHERE email = $1`, [ADMIN_EMAIL]
  );

  if (jaExiste.length) {
    console.log('ℹ️   Admin já existe — pulando criação.');
  } else {
    const hash = await bcrypt.hash(ADMIN_SENHA, parseInt(process.env.BCRYPT_ROUNDS) || 10);
    const { rows: [perfilAdm] } = await query(
      `SELECT id FROM perfis WHERE is_admin = true LIMIT 1`
    );
    const { rows: [admin] } = await query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil_id, cor_avatar)
       VALUES ('Admin Jampa', $1, $2, $3, '#004CD5') RETURNING id`,
      [ADMIN_EMAIL, hash, perfilAdm.id]
    );
    // Saldo inicial zerado
    await query(
      `INSERT INTO saldos_adiantamento (usuario_id, saldo_atual, limite) VALUES ($1, 0, 0)`,
      [admin.id]
    );
    console.log(`✅  Admin criado: ${ADMIN_EMAIL}`);
  }

  // ── 6. Preço do combustível (placeholder) ─────────────────
  const { rows: precoExiste } = await query(
    `SELECT id FROM historico_combustivel LIMIT 1`
  );
  if (!precoExiste.length) {
    await query(
      `INSERT INTO historico_combustivel (valor, vigente_em, observacao, status)
       VALUES (0.000, CURRENT_DATE, 'Defina o preço real antes de lançar rotas.', 'vigente')`
    );
    console.log('⚠️   Preço do combustível criado como R$ 0,000 — atualize em: Combustível → Preço Atual.');
  }

  console.log('\n🎉  Seed concluído! Próximos passos:');
  console.log('    1. Faça login com', ADMIN_EMAIL);
  console.log('    2. Defina o preço atual do combustível');
  console.log('    3. Cadastre os funcionários reais');
  console.log('    4. Vincule funcionários aos centros de custo\n');

  await pool.end();
}

seed().catch((err) => {
  console.error('❌  Erro no seed:', err.message);
  process.exit(1);
});

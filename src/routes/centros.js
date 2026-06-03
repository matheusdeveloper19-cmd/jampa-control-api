// src/routes/centros.js — Centro de Custos
const express  = require('express');
const { query } = require('../db/pool');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { auditLog, getIp } = require('../services/audit');

const router = express.Router();
router.use(authMiddleware, adminOnly);

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT cc.*, u.nome AS responsavel_nome,
       (SELECT COUNT(*) FROM usuario_centro_custo uc WHERE uc.centro_custo_id = cc.id) AS total_funcionarios
     FROM centros_custo cc LEFT JOIN usuarios u ON u.id = cc.responsavel_id
     ORDER BY cc.nome`
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { codigo, nome, descricao, responsavel_id } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
  try {
    const { rows: [cc] } = await query(
      `INSERT INTO centros_custo (codigo, nome, descricao, responsavel_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [codigo, nome, descricao || null, responsavel_id || null]
    );
    await auditLog({ usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'LANCAMENTO', detalhe: `Centro "${nome}" criado.`, modulo: 'Centro de Custos', ip: getIp(req) });
    res.status(201).json(cc);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar centro de custo.' });
  }
});

router.put('/:id', async (req, res) => {
  const { nome, codigo, descricao, responsavel_id, status } = req.body;
  try {
    await query(
      `UPDATE centros_custo SET nome=COALESCE($1,nome), codigo=COALESCE($2,codigo),
       descricao=COALESCE($3,descricao), responsavel_id=COALESCE($4,responsavel_id),
       status=COALESCE($5,status), updated_at=NOW() WHERE id=$6`,
      [nome, codigo, descricao, responsavel_id, status, req.params.id]
    );
    await auditLog({ usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'EDICAO', detalhe: `Centro "${nome}" editado.`, modulo: 'Centro de Custos', ip: getIp(req) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao editar centro.' });
  }
});

// Vincular funcionário a centro
router.post('/:id/vincular', async (req, res) => {
  const { usuario_id } = req.body;
  try {
    await query(
      `INSERT INTO usuario_centro_custo (usuario_id, centro_custo_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [usuario_id, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao vincular.' });
  }
});

module.exports = router;

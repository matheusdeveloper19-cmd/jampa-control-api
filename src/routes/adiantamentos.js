// src/routes/adiantamentos.js
const express = require('express');
const { query } = require('../db/pool');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { auditLog, getIp } = require('../services/audit');
const { recalcularSaldo } = require('../services/saldo');

const router = express.Router();
router.use(authMiddleware);

// GET /adiantamentos/:usuarioId/extrato
router.get('/:usuarioId/extrato', async (req, res) => {
  const { usuarioId } = req.params;
  if (!req.user.is_admin && req.user.id !== usuarioId) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  try {
    const { rows } = await query(
      `SELECT e.*, u.nome AS lancado_por_nome, ap.nome AS aprovado_por_nome
       FROM extrato_adiantamento e
       LEFT JOIN usuarios u  ON u.id = e.lancado_por_id
       LEFT JOIN usuarios ap ON ap.id = e.aprovado_por_id
       WHERE e.usuario_id = $1
       ORDER BY e.created_at DESC`,
      [usuarioId]
    );
    const { rows: [saldo] } = await query(
      `SELECT saldo_atual, limite FROM saldos_adiantamento WHERE usuario_id = $1`, [usuarioId]
    );
    res.json({ extrato: rows, saldo: saldo || { saldo_atual: 0, limite: 200 } });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar extrato.' });
  }
});

// POST /adiantamentos — lançar adiantamento
router.post('/', adminOnly, async (req, res) => {
  const { usuario_id, valor, descricao, data_movimento } = req.body;
  if (!usuario_id || !valor || valor <= 0) {
    return res.status(400).json({ error: 'Usuário e valor são obrigatórios.' });
  }
  try {
    await query(
      `INSERT INTO extrato_adiantamento
         (usuario_id, tipo, descricao, valor, data_movimento, status, lancado_por_id)
       VALUES ($1, 'adiant', $2, $3, $4, 'pend', $5)`,
      [usuario_id, descricao || 'Adiantamento', valor, data_movimento || new Date(), req.user.id]
    );
    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'LANCAMENTO', detalhe: `Adiantamento de R$ ${parseFloat(valor).toFixed(2)} lançado.`,
      modulo: 'Adiantamentos', ip: getIp(req),
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao lançar adiantamento.' });
  }
});

// PUT /adiantamentos/:id/aprovar
router.put('/:id/aprovar', adminOnly, async (req, res) => {
  const { aprovar } = req.body;
  try {
    const { rows: [mov] } = await query(
      `UPDATE extrato_adiantamento
       SET status = $1, aprovado_por_id = $2
       WHERE id = $3 AND status = 'pend'
       RETURNING usuario_id, valor, descricao`,
      [aprovar ? 'ok' : 'rj', req.user.id, req.params.id]
    );
    if (!mov) return res.status(404).json({ error: 'Movimentação não encontrada.' });
    await recalcularSaldo(mov.usuario_id);
    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: aprovar ? 'APROVACAO' : 'REPROVACAO',
      detalhe: `Adiantamento de R$ ${Math.abs(mov.valor).toFixed(2)} ${aprovar ? 'aprovado' : 'reprovado'}.`,
      modulo: 'Adiantamentos', ip: getIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao processar adiantamento.' });
  }
});

module.exports = router;

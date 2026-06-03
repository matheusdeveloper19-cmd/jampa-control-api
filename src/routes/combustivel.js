// src/routes/combustivel.js
const express = require('express');
const { query } = require('../db/pool');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { auditLog, getIp } = require('../services/audit');
const { recalcularTodasRotas, getPrecoAtual } = require('../services/combustivel');

const router = express.Router();
router.use(authMiddleware);

// GET /combustivel/preco-atual
router.get('/preco-atual', async (req, res) => {
  const preco = await getPrecoAtual();
  res.json(preco || { valor: 0 });
});

// GET /combustivel/historico
router.get('/historico', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM historico_combustivel ORDER BY vigente_em DESC`
  );
  res.json(rows);
});

// POST /combustivel — novo preço (equivale a saveCombValor)
router.post('/', adminOnly, async (req, res) => {
  const { valor, vigente_em, observacao } = req.body;
  if (!valor || valor <= 0 || !vigente_em) {
    return res.status(400).json({ error: 'Valor e data de vigência são obrigatórios.' });
  }
  try {
    // Encerrar vigente atual
    await query(
      `UPDATE historico_combustivel SET status = 'encerrado' WHERE status = 'vigente'`
    );
    await query(
      `INSERT INTO historico_combustivel (valor, vigente_em, observacao, status, created_by)
       VALUES ($1, $2, $3, 'vigente', $4)`,
      [valor, vigente_em, observacao || null, req.user.id]
    );
    // Recalcular rotas retroativamente
    const atualizados = await recalcularTodasRotas();

    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'EDICAO', detalhe: `Preço do combustível atualizado para R$ ${parseFloat(valor).toFixed(3)}/L. ${atualizados} rotas recalculadas.`,
      modulo: 'Combustível', ip: getIp(req),
    });
    res.status(201).json({ ok: true, rotasRecalculadas: atualizados });
  } catch (err) {
    console.error('[POST /combustivel]', err);
    res.status(500).json({ error: 'Erro ao salvar preço.' });
  }
});

module.exports = router;

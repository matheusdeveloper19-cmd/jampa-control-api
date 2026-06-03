// src/routes/frota.js
const express = require('express');
const { query } = require('../db/pool');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { auditLog, getIp } = require('../services/audit');

const router = express.Router();
router.use(authMiddleware, adminOnly);

router.get('/', async (req, res) => {
  const { rows } = await query(`SELECT * FROM veiculos ORDER BY modelo`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { codigo, modelo, placa, ano, cor, hodometro, observacao } = req.body;
  if (!modelo || !placa) return res.status(400).json({ error: 'Modelo e placa são obrigatórios.' });
  try {
    const { rows: [v] } = await query(
      `INSERT INTO veiculos (codigo, modelo, placa, ano, cor, hodometro, observacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [codigo, modelo, placa.toUpperCase(), ano || null, cor || null, hodometro || 0, observacao || null]
    );
    await auditLog({ usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'LANCAMENTO', detalhe: `Veículo "${modelo} ${placa}" cadastrado.`, modulo: 'Frota', ip: getIp(req) });
    res.status(201).json(v);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao cadastrar veículo.' });
  }
});

router.get('/:id/historico', async (req, res) => {
  const { rows } = await query(
    `SELECT h.*, u.nome AS condutor_nome
     FROM historico_frota h LEFT JOIN usuarios u ON u.id = h.condutor_id
     WHERE h.veiculo_id = $1 ORDER BY h.data_registro DESC`,
    [req.params.id]
  );
  res.json(rows);
});

router.post('/:id/uso', async (req, res) => {
  const { condutor_id, descricao_rota, km, data_registro } = req.body;
  if (!km || !data_registro) return res.status(400).json({ error: 'KM e data são obrigatórios.' });
  try {
    await query(
      `INSERT INTO historico_frota (veiculo_id, tipo, data_registro, condutor_id, descricao_rota, km, created_by)
       VALUES ($1, 'uso', $2, $3, $4, $5, $6)`,
      [req.params.id, data_registro, condutor_id || null, descricao_rota || null, km, req.user.id]
    );
    await query(`UPDATE veiculos SET hodometro = hodometro + $1, updated_at = NOW() WHERE id = $2`, [km, req.params.id]);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar uso.' });
  }
});

router.post('/:id/nf', async (req, res) => {
  const { data_registro, valor, numero_nf, descricao_nf } = req.body;
  if (!valor || !data_registro) return res.status(400).json({ error: 'Valor e data são obrigatórios.' });
  try {
    await query(
      `INSERT INTO historico_frota (veiculo_id, tipo, data_registro, valor, numero_nf, descricao_nf, created_by)
       VALUES ($1, 'nf', $2, $3, $4, $5, $6)`,
      [req.params.id, data_registro, valor, numero_nf || null, descricao_nf || null, req.user.id]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar NF.' });
  }
});

module.exports = router;

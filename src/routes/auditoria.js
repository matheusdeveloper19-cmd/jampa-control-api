// src/routes/auditoria.js
const express  = require('express');
const { query } = require('../db/pool');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, adminOnly);

router.get('/', async (req, res) => {
  const { usuario_id, acao, data_ini, data_fim, limit = 100, offset = 0 } = req.query;
  const conditions = [];
  const params = [];
  let p = 1;

  if (usuario_id) { conditions.push(`usuario_id = $${p++}`); params.push(usuario_id); }
  if (acao)       { conditions.push(`acao = $${p++}`);       params.push(acao); }
  if (data_ini)   { conditions.push(`created_at >= $${p++}`); params.push(data_ini); }
  if (data_fim)   { conditions.push(`created_at <= $${p++}`); params.push(data_fim + ' 23:59:59'); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  try {
    const { rows } = await query(
      `SELECT * FROM auditoria ${where} ORDER BY created_at DESC LIMIT $${p++} OFFSET $${p++}`,
      [...params, limit, offset]
    );
    const { rows: [{ total }] } = await query(
      `SELECT COUNT(*) AS total FROM auditoria ${where}`, params
    );
    res.json({ registros: rows, total: parseInt(total) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar auditoria.' });
  }
});

module.exports = router;

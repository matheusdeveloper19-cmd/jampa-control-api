const express  = require('express');
const { query } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, nome, limite_adiantamento, is_admin FROM perfis ORDER BY is_admin DESC, nome'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar perfis.' });
  }
});

module.exports = router;

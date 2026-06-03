// src/middleware/auth.js — Verificação JWT em todas as rotas protegidas
const jwt = require('jsonwebtoken');
const { query } = require('../db/pool');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar se usuário ainda está ativo no banco
    const { rows } = await query(
      `SELECT u.id, u.nome, u.email, u.status, p.nome AS perfil, p.is_admin
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
       WHERE u.id = $1`,
      [payload.sub]
    );

    if (!rows.length || rows[0].status === 'Bloqueado') {
      return res.status(401).json({ error: 'Acesso revogado.' });
    }

    req.user = {
      id:       rows[0].id,
      nome:     rows[0].nome,
      email:    rows[0].email,
      perfil:   rows[0].perfil,
      is_admin: rows[0].is_admin,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// Middleware: apenas admins
function adminOnly(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }
  next();
}

module.exports = { authMiddleware, adminOnly };

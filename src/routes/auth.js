// src/routes/auth.js — POST /auth/login | POST /auth/logout | GET /auth/me
const express  = require('express');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const { query } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const { auditLog, getIp } = require('../services/audit');

const router = express.Router();

// ── POST /auth/login ─────────────────────────────────────────
// Equivale a doLogin() do frontend
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const { rows } = await query(
      `SELECT u.id, u.nome, u.email, u.senha_hash, u.status,
              u.cor_avatar, u.placa_veiculo, u.veiculo, u.telefone,
              p.nome AS perfil, p.is_admin, p.limite_adiantamento
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
       WHERE u.email = $1`,
      [email.trim().toLowerCase()]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'E-mail não encontrado.' });
    }

    const user = rows[0];

    if (user.status === 'Bloqueado') {
      return res.status(403).json({ error: 'Acesso bloqueado. Contate o administrador.' });
    }

    const senhaOk = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    // Atualizar último acesso
    await query(
      `UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = $1`,
      [user.id]
    );

    // Gerar JWT
    const token = jwt.sign(
      { sub: user.id, nome: user.nome, perfil: user.perfil, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await auditLog({
      usuarioId: user.id, usuarioNm: user.nome,
      acao: 'LOGIN', detalhe: `${user.nome} entrou no sistema.`,
      modulo: 'Sistema', ip: getIp(req), userAgent: req.headers['user-agent'],
    });

    res.json({
      token,
      usuario: {
        id:          user.id,
        nome:        user.nome,
        email:       user.email,
        perfil:      user.perfil,
        is_admin:    user.is_admin,
        cor_avatar:  user.cor_avatar,
        placa:       user.placa_veiculo,
        veiculo:     user.veiculo,
        telefone:    user.telefone,
        limite_adiantamento: user.limite_adiantamento,
      },
    });
  } catch (err) {
    console.error('[/auth/login]', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ── POST /auth/logout ────────────────────────────────────────
router.post('/logout', authMiddleware, async (req, res) => {
  await auditLog({
    usuarioId: req.user.id, usuarioNm: req.user.nome,
    acao: 'LOGOUT', detalhe: `${req.user.nome} saiu do sistema.`,
    modulo: 'Sistema', ip: getIp(req),
  });
  res.json({ ok: true });
});

// ── GET /auth/me — dados do usuário logado ───────────────────
router.get('/me', authMiddleware, async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.nome, u.email, u.cor_avatar, u.placa_veiculo,
            u.veiculo, u.telefone, u.ultimo_acesso,
            p.nome AS perfil, p.is_admin, p.limite_adiantamento
     FROM usuarios u JOIN perfis p ON p.id = u.perfil_id
     WHERE u.id = $1`,
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json(rows[0]);
});

// ── PUT /auth/senha — trocar a própria senha ─────────────────
// Equivale a doResetPropria() do frontend
router.put('/senha', authMiddleware, async (req, res) => {
  const { senhaAtual, novaSenha } = req.body;
  if (!senhaAtual || !novaSenha || novaSenha.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });
  }

  try {
    const { rows } = await query(
      `SELECT senha_hash FROM usuarios WHERE id = $1`, [req.user.id]
    );
    const ok = await bcrypt.compare(senhaAtual, rows[0].senha_hash);
    if (!ok) return res.status(401).json({ error: 'Senha atual incorreta.' });

    const novoHash = await bcrypt.hash(novaSenha, parseInt(process.env.BCRYPT_ROUNDS) || 10);
    await query(
      `UPDATE usuarios SET senha_hash = $1, updated_at = NOW() WHERE id = $2`,
      [novoHash, req.user.id]
    );

    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'SENHA', detalhe: `${req.user.nome} alterou a própria senha.`,
      modulo: 'Controle de Acesso', ip: getIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[/auth/senha]', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;

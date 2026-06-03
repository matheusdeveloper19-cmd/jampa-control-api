// src/routes/usuarios.js
// Equivale a: saveNF(), saveEF(), toggleAcc(), doReset(), doResetLote()
const express = require('express');
const bcrypt  = require('bcrypt');
const { query } = require('../db/pool');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { auditLog, getIp } = require('../services/audit');
const { recalcularSaldo } = require('../services/saldo');

const router = express.Router();
router.use(authMiddleware);

// ── GET /usuarios ─────────────────────────────────────────────
router.get('/', adminOnly, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.nome, u.email, u.status, u.cor_avatar,
              u.placa_veiculo, u.veiculo, u.telefone, u.ultimo_acesso,
              p.nome AS perfil, p.is_admin, p.limite_adiantamento,
              s.saldo_atual, s.limite AS limite_saldo
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
       LEFT JOIN saldos_adiantamento s ON s.usuario_id = u.id
       ORDER BY p.is_admin DESC, u.nome`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /usuarios]', err);
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

// ── POST /usuarios — novo funcionário ─────────────────────────
// Equivale a saveNF() do frontend
router.post('/', adminOnly, async (req, res) => {
  const { nome, email, senha, perfil_id, placa_veiculo, veiculo, telefone, cor_avatar } = req.body;
  if (!nome || !email || !senha || !perfil_id) {
    return res.status(400).json({ error: 'Nome, email, senha e perfil são obrigatórios.' });
  }

  try {
    const { rows: dup } = await query(
      `SELECT id FROM usuarios WHERE email = $1`, [email.trim().toLowerCase()]
    );
    if (dup.length) return res.status(409).json({ error: 'E-mail já cadastrado.' });

    const senhaHash = await bcrypt.hash(senha, parseInt(process.env.BCRYPT_ROUNDS) || 10);

    const { rows: [usuario] } = await query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil_id, placa_veiculo, veiculo, telefone, cor_avatar)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, nome, email, status`,
      [nome.trim(), email.trim().toLowerCase(), senhaHash, perfil_id,
       placa_veiculo || null, veiculo || null, telefone || null, cor_avatar || '#004CD5']
    );

    // Inicializar saldo zerado
    await query(
      `INSERT INTO saldos_adiantamento (usuario_id, saldo_atual, limite)
       SELECT $1, 0, p.limite_adiantamento FROM perfis p WHERE p.id = $2`,
      [usuario.id, perfil_id]
    );

    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'LANCAMENTO', detalhe: `Funcionário "${nome}" cadastrado.`,
      modulo: 'Funcionários', ip: getIp(req),
    });

    res.status(201).json(usuario);
  } catch (err) {
    console.error('[POST /usuarios]', err);
    res.status(500).json({ error: 'Erro ao cadastrar funcionário.' });
  }
});

// ── PUT /usuarios/:id — editar funcionário ────────────────────
// Equivale a saveEF() do frontend
router.put('/:id', adminOnly, async (req, res) => {
  const { nome, email, perfil_id, placa_veiculo, veiculo, telefone, cor_avatar } = req.body;
  try {
    await query(
      `UPDATE usuarios
       SET nome = COALESCE($1, nome),
           email = COALESCE($2, email),
           perfil_id = COALESCE($3, perfil_id),
           placa_veiculo = COALESCE($4, placa_veiculo),
           veiculo = COALESCE($5, veiculo),
           telefone = COALESCE($6, telefone),
           cor_avatar = COALESCE($7, cor_avatar),
           updated_at = NOW()
       WHERE id = $8`,
      [nome, email?.toLowerCase(), perfil_id, placa_veiculo, veiculo, telefone, cor_avatar, req.params.id]
    );

    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'EDICAO', detalhe: `Funcionário "${nome}" editado.`,
      modulo: 'Funcionários', ip: getIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /usuarios/:id]', err);
    res.status(500).json({ error: 'Erro ao editar funcionário.' });
  }
});

// ── PUT /usuarios/:id/acesso — bloquear / ativar ──────────────
// Equivale a toggleAcc() do frontend
router.put('/:id/acesso', adminOnly, async (req, res) => {
  try {
    const { rows: [u] } = await query(
      `UPDATE usuarios
       SET status = CASE WHEN status = 'Ativo' THEN 'Bloqueado'::status_usuario
                         ELSE 'Ativo'::status_usuario END,
           updated_at = NOW()
       WHERE id = $1 AND nome != 'Admin Jampa'
       RETURNING nome, status`,
      [req.params.id]
    );
    if (!u) return res.status(400).json({ error: 'Usuário não encontrado ou protegido.' });

    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'ACESSO', detalhe: `Acesso de "${u.nome}" alterado para ${u.status}.`,
      modulo: 'Controle de Acesso', ip: getIp(req),
    });

    res.json({ status: u.status });
  } catch (err) {
    console.error('[PUT /usuarios/:id/acesso]', err);
    res.status(500).json({ error: 'Erro ao alterar acesso.' });
  }
});

// ── PUT /usuarios/:id/senha — redefinir senha (admin) ────────
// Equivale a doReset() do frontend
router.put('/:id/senha', adminOnly, async (req, res) => {
  const { novaSenha } = req.body;
  if (!novaSenha || novaSenha.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });
  }

  try {
    const { rows: [u] } = await query(
      `SELECT nome FROM usuarios WHERE id = $1`, [req.params.id]
    );
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const hash = await bcrypt.hash(novaSenha, parseInt(process.env.BCRYPT_ROUNDS) || 10);
    await query(
      `UPDATE usuarios SET senha_hash = $1, updated_at = NOW() WHERE id = $2`,
      [hash, req.params.id]
    );

    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'SENHA', detalhe: `Senha de "${u.nome}" redefinida pelo administrador.`,
      modulo: 'Controle de Acesso', ip: getIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /usuarios/:id/senha]', err);
    res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
});

// ── PUT /usuarios/senha/lote — reset em lote ─────────────────
// Equivale a doResetLote() do frontend
router.put('/senha/lote', adminOnly, async (req, res) => {
  const { novaSenha, usuario_ids } = req.body;
  if (!novaSenha || novaSenha.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });
  }

  try {
    const hash = await bcrypt.hash(novaSenha, parseInt(process.env.BCRYPT_ROUNDS) || 10);

    let sql, params;
    if (usuario_ids?.length) {
      sql = `UPDATE usuarios SET senha_hash = $1, updated_at = NOW()
             WHERE id = ANY($2::uuid[]) AND nome != 'Admin Jampa'`;
      params = [hash, usuario_ids];
    } else {
      sql = `UPDATE usuarios SET senha_hash = $1, updated_at = NOW()
             WHERE nome != 'Admin Jampa'`;
      params = [hash];
    }

    const { rowCount } = await query(sql, params);

    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'SENHA', detalhe: `Reset de senha em lote: ${rowCount} usuário(s).`,
      modulo: 'Controle de Acesso', ip: getIp(req),
    });

    res.json({ atualizados: rowCount });
  } catch (err) {
    console.error('[PUT /usuarios/senha/lote]', err);
    res.status(500).json({ error: 'Erro no reset em lote.' });
  }
});

module.exports = router;

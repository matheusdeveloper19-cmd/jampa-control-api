// src/routes/lancamentos.js
// Equivale a: submDesp(), finR(), aprovAct(), renderHistorico(), buildRelData()
const express = require('express');
const { query, transaction } = require('../db/pool');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { auditLog, getIp } = require('../services/audit');
const { calcularValorRota } = require('../services/combustivel');
const { abaterLancamento, reverterLancamento } = require('../services/saldo');

const router = express.Router();
router.use(authMiddleware);

// ── GET /lancamentos — listar com filtros ────────────────────
router.get('/', async (req, res) => {
  try {
    const { tipo, status, usuario_id, data_ini, data_fim, limit = 100, offset = 0 } = req.query;
    const conditions = ['l.excluido_em IS NULL'];
    const params = [];
    let p = 1;

    // Não-admin só vê os próprios
    if (!req.user.is_admin) {
      conditions.push(`l.usuario_id = $${p++}`);
      params.push(req.user.id);
    } else if (usuario_id) {
      conditions.push(`l.usuario_id = $${p++}`);
      params.push(usuario_id);
    }

    if (tipo)      { conditions.push(`l.tipo = $${p++}`);              params.push(tipo); }
    if (status)    { conditions.push(`l.status = $${p++}`);            params.push(status); }
    if (data_ini)  { conditions.push(`l.data_lancamento >= $${p++}`);  params.push(data_ini); }
    if (data_fim)  { conditions.push(`l.data_lancamento <= $${p++}`);  params.push(data_fim); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await query(
      `SELECT l.*, u.nome AS usuario_nome, u.cor_avatar,
              ap.nome AS aprovado_por_nome, cc.nome AS centro_custo_nome,
              td.nome AS tipo_despesa_nome
       FROM lancamentos l
       LEFT JOIN usuarios u  ON u.id = l.usuario_id
       LEFT JOIN usuarios ap ON ap.id = l.aprovado_por_id
       LEFT JOIN centros_custo cc ON cc.id = l.centro_custo_id
       LEFT JOIN tipos_despesa td ON td.id = l.tipo_despesa_id
       ${where}
       ORDER BY l.data_lancamento DESC, l.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /lancamentos]', err);
    res.status(500).json({ error: 'Erro ao buscar lançamentos.' });
  }
});

// ── POST /lancamentos/rota — nova rota ───────────────────────
// Equivale a finR() do frontend
router.post('/rota', async (req, res) => {
  const { descricao, data_lancamento, km, centro_custo_id } = req.body;
  if (!descricao || !data_lancamento || !km || km <= 0) {
    return res.status(400).json({ error: 'Descrição, data e km são obrigatórios.' });
  }

  try {
    const valor = await calcularValorRota(km, data_lancamento);

    const { rows: [lanc] } = await query(
      `INSERT INTO lancamentos
         (tipo, usuario_id, descricao, data_lancamento, km, valor, status,
          lancado_por_id, centro_custo_id)
       VALUES ('rota', $1, $2, $3, $4, $5, 'pendente', $1, $6)
       RETURNING *`,
      [req.user.id, descricao, data_lancamento, km, valor, centro_custo_id || null]
    );

    // Criar entrada no extrato como pendente
    await query(
      `INSERT INTO extrato_adiantamento
         (usuario_id, tipo, descricao, valor, data_movimento, status, lancado_por_id, lancamento_id)
       VALUES ($1, 'rota', $2, $3, $4, 'pend', $1, $5)`,
      [req.user.id, descricao + ' · ' + km + 'km', -valor, data_lancamento, lanc.id]
    );

    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'LANCAMENTO',
      detalhe: `Rota "${descricao}" de ${km}km · R$ ${valor.toFixed(2)} lançada.`,
      modulo: 'Nova Rota', ip: getIp(req),
    });

    res.status(201).json(lanc);
  } catch (err) {
    console.error('[POST /lancamentos/rota]', err);
    res.status(500).json({ error: 'Erro ao lançar rota.' });
  }
});

// ── POST /lancamentos/despesa — nova despesa ─────────────────
// Equivale a submDesp() do frontend
router.post('/despesa', async (req, res) => {
  const { descricao, data_lancamento, valor, tipo_despesa_id, centro_custo_id, observacao } = req.body;
  if (!descricao || !data_lancamento || !valor || valor <= 0) {
    return res.status(400).json({ error: 'Descrição, data e valor são obrigatórios.' });
  }

  try {
    const { rows: [lanc] } = await query(
      `INSERT INTO lancamentos
         (tipo, usuario_id, descricao, data_lancamento, valor, status,
          lancado_por_id, tipo_despesa_id, centro_custo_id, observacao)
       VALUES ('despesa', $1, $2, $3, $4, 'pendente', $1, $5, $6, $7)
       RETURNING *`,
      [req.user.id, descricao, data_lancamento, valor,
       tipo_despesa_id || null, centro_custo_id || null, observacao || null]
    );

    // Extrato pendente
    await query(
      `INSERT INTO extrato_adiantamento
         (usuario_id, tipo, descricao, valor, data_movimento, status, lancado_por_id, lancamento_id)
       VALUES ($1, 'despesa', $2, $3, $4, 'pend', $1, $5)`,
      [req.user.id, descricao, -valor, data_lancamento, lanc.id]
    );

    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'LANCAMENTO',
      detalhe: `Despesa "${descricao}" de R$ ${parseFloat(valor).toFixed(2)} lançada.`,
      modulo: 'Nova Despesa', ip: getIp(req),
    });

    res.status(201).json(lanc);
  } catch (err) {
    console.error('[POST /lancamentos/despesa]', err);
    res.status(500).json({ error: 'Erro ao lançar despesa.' });
  }
});

// ── PUT /lancamentos/:id/aprovar — aprovar ou reprovar ───────
// Equivale a aprovAct(id, aprove) do frontend
router.put('/:id/aprovar', adminOnly, async (req, res) => {
  const { id } = req.params;
  const { aprovar, motivo } = req.body;

  try {
    const { rows: [lanc] } = await query(
      `SELECT l.*, u.nome AS usuario_nome
       FROM lancamentos l JOIN usuarios u ON u.id = l.usuario_id
       WHERE l.id = $1 AND l.excluido_em IS NULL`,
      [id]
    );

    if (!lanc) return res.status(404).json({ error: 'Lançamento não encontrado.' });
    if (lanc.status !== 'pendente') {
      return res.status(409).json({ error: 'Lançamento já foi ' + lanc.status + '.' });
    }

    const novoStatus = aprovar ? 'aprovado' : 'reprovado';

    await query(
      `UPDATE lancamentos
       SET status = $1, aprovado_por_id = $2, aprovado_em = NOW(),
           motivo_reprovacao = $3, updated_at = NOW()
       WHERE id = $4`,
      [novoStatus, req.user.id, aprovar ? null : (motivo || null), id]
    );

    if (aprovar) {
      await abaterLancamento(id, req.user.id);
    } else {
      await reverterLancamento(id);
    }

    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: aprovar ? 'APROVACAO' : 'REPROVACAO',
      detalhe: `${novoStatus.charAt(0).toUpperCase() + novoStatus.slice(1)}: "${lanc.descricao}" de ${lanc.usuario_nome} · R$ ${parseFloat(lanc.valor).toFixed(2)}.`,
      modulo: 'Aprovações', ip: getIp(req),
    });

    res.json({ ok: true, status: novoStatus });
  } catch (err) {
    console.error('[PUT /lancamentos/:id/aprovar]', err);
    res.status(500).json({ error: 'Erro ao processar aprovação.' });
  }
});

// ── DELETE /lancamentos/:id — exclusão suave ─────────────────
router.delete('/:id', adminOnly, async (req, res) => {
  const { motivo } = req.body;
  try {
    const { rows: [lanc] } = await query(
      `UPDATE lancamentos
       SET excluido_por_id = $1, excluido_em = NOW(),
           motivo_reprovacao = $2, updated_at = NOW()
       WHERE id = $3 AND excluido_em IS NULL
       RETURNING descricao`,
      [req.user.id, motivo || null, req.params.id]
    );
    if (!lanc) return res.status(404).json({ error: 'Lançamento não encontrado.' });

    await auditLog({
      usuarioId: req.user.id, usuarioNm: req.user.nome,
      acao: 'EXCLUSAO',
      detalhe: `Lançamento "${lanc.descricao}" excluído.`,
      modulo: 'Aprovações', ip: getIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /lancamentos/:id]', err);
    res.status(500).json({ error: 'Erro ao excluir.' });
  }
});

module.exports = router;

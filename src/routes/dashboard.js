// src/routes/dashboard.js — KPIs executivos (equivale a buildExecKPIs() + buildDashFuncKPIs())
const express  = require('express');
const { query } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/kpis', async (req, res) => {
  try {
    const userId = req.user.is_admin ? null : req.user.id;

    // KPIs financeiros — totais do mês e do ano corrente
    const { rows: [fin] } = await query(
      `SELECT
         SUM(CASE WHEN status='aprovado' AND DATE_TRUNC('month', data_lancamento) = DATE_TRUNC('month', NOW()) THEN valor ELSE 0 END) AS total_mes,
         SUM(CASE WHEN status='aprovado' AND EXTRACT(YEAR FROM data_lancamento) = EXTRACT(YEAR FROM NOW()) THEN valor ELSE 0 END)    AS total_ano,
         SUM(CASE WHEN status='pendente' THEN valor ELSE 0 END)                                                                        AS total_pendente,
         SUM(CASE WHEN status='aprovado' THEN valor ELSE 0 END)                                                                        AS total_aprovado,
         SUM(CASE WHEN status='reprovado' THEN valor ELSE 0 END)                                                                       AS total_reprovado,
         COUNT(CASE WHEN status='pendente' THEN 1 END)                                                                                 AS qtd_pendente
       FROM lancamentos
       WHERE excluido_em IS NULL
         AND ($1::uuid IS NULL OR usuario_id = $1)`,
      [userId]
    );

    // KPIs operacionais (admin only)
    let operacional = {};
    if (req.user.is_admin) {
      const { rows: [op] } = await query(
        `SELECT
           COUNT(*) FILTER (WHERE status='Ativo')                            AS func_ativos,
           COUNT(*) FILTER (WHERE status='Bloqueado')                        AS func_bloqueados
         FROM usuarios`
      );
      const { rows: [frota] } = await query(
        `SELECT COUNT(*) AS total_veiculos FROM veiculos WHERE ativo = true`
      );
      const { rows: saldos } = await query(
        `SELECT COUNT(*) AS func_saldo_baixo
         FROM saldos_adiantamento s
         JOIN perfis p ON p.id = (SELECT perfil_id FROM usuarios WHERE id = s.usuario_id)
         WHERE s.saldo_atual < s.limite`
      );
      operacional = {
        func_ativos:     parseInt(op.func_ativos),
        func_bloqueados: parseInt(op.func_bloqueados),
        total_veiculos:  parseInt(frota.total_veiculos),
        func_saldo_baixo: parseInt(saldos[0]?.func_saldo_baixo || 0),
      };
    }

    res.json({
      financeiro: {
        total_mes:       parseFloat(fin.total_mes   || 0).toFixed(2),
        total_ano:       parseFloat(fin.total_ano   || 0).toFixed(2),
        total_pendente:  parseFloat(fin.total_pendente || 0).toFixed(2),
        total_aprovado:  parseFloat(fin.total_aprovado || 0).toFixed(2),
        total_reprovado: parseFloat(fin.total_reprovado || 0).toFixed(2),
        qtd_pendente:    parseInt(fin.qtd_pendente || 0),
      },
      ...operacional,
    });
  } catch (err) {
    console.error('[GET /dashboard/kpis]', err);
    res.status(500).json({ error: 'Erro ao buscar KPIs.' });
  }
});

// Custo por funcionário (equivale a buildDashFuncKPIs())
router.get('/custo-por-funcionario', async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Acesso restrito.' });
  try {
    const { data_ini, data_fim } = req.query;
    const { rows } = await query(
      `SELECT u.id, u.nome, u.cor_avatar, p.nome AS perfil,
         SUM(CASE WHEN l.tipo='rota' AND l.status='aprovado' THEN l.valor ELSE 0 END)     AS total_combustivel,
         SUM(CASE WHEN l.tipo='despesa' AND l.status='aprovado' THEN l.valor ELSE 0 END)  AS total_despesas,
         SUM(CASE WHEN l.tipo='rota' AND l.status='aprovado' THEN l.km ELSE 0 END)        AS total_km,
         s.saldo_atual, s.limite
       FROM usuarios u
       JOIN perfis p ON p.id = u.perfil_id
       LEFT JOIN lancamentos l ON l.usuario_id = u.id AND l.excluido_em IS NULL
         AND ($1::date IS NULL OR l.data_lancamento >= $1)
         AND ($2::date IS NULL OR l.data_lancamento <= $2)
       LEFT JOIN saldos_adiantamento s ON s.usuario_id = u.id
       WHERE u.status = 'Ativo' AND NOT p.is_admin
       GROUP BY u.id, u.nome, u.cor_avatar, p.nome, s.saldo_atual, s.limite
       ORDER BY (SUM(CASE WHEN l.status='aprovado' THEN l.valor ELSE 0 END)) DESC`,
      [data_ini || null, data_fim || null]
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /dashboard/custo-por-funcionario]', err);
    res.status(500).json({ error: 'Erro ao buscar custos.' });
  }
});

module.exports = router;

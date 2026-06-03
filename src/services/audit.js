// src/services/audit.js — Registro de auditoria (equivale ao auditLog() do frontend)
const { query } = require('../db/pool');

/**
 * Registra uma ação na tabela de auditoria.
 * Espelha exatamente o auditLog(action, detail, module) do frontend.
 *
 * Ações: LOGIN | LOGOUT | LANCAMENTO | APROVACAO | REPROVACAO |
 *        EDICAO | EXCLUSAO | SENHA | ACESSO
 */
async function auditLog({ usuarioId, usuarioNm, acao, detalhe, modulo, ip, userAgent }) {
  try {
    await query(
      `INSERT INTO auditoria (usuario_id, usuario_nm, acao, detalhe, modulo, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [usuarioId || null, usuarioNm || 'Sistema', acao, detalhe || '', modulo || '—', ip || null, userAgent || null]
    );
  } catch (err) {
    // Auditoria nunca deve quebrar a requisição principal
    console.error('[AUDIT] Falha ao registrar:', err.message);
  }
}

// Helper: extrai IP real mesmo atrás de proxy/Nginx
function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

module.exports = { auditLog, getIp };

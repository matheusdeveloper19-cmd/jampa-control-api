// src/services/saldo.js
// Equivale a SALDOS_ADV, EXTRATO_ADV e aprovAct() saldo logic do frontend
const { query, transaction } = require('../db/pool');

/** Recalcula o saldo de um usuário a partir do extrato aprovado */
async function recalcularSaldo(usuarioId, client) {
  const db = client || { query: (sql, p) => query(sql, p) };
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(valor), 0) AS saldo
     FROM extrato_adiantamento
     WHERE usuario_id = $1 AND status = 'ok'`,
    [usuarioId]
  );
  const saldo = parseFloat(rows[0].saldo);
  await db.query(
    `INSERT INTO saldos_adiantamento (usuario_id, saldo_atual, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (usuario_id)
     DO UPDATE SET saldo_atual = $2, updated_at = NOW()`,
    [usuarioId, saldo]
  );
  return saldo;
}

/** Ao aprovar um lançamento (rota ou despesa):
 *  - insere/atualiza entrada negativa no extrato
 *  - recalcula saldo */
async function abaterLancamento(lancamentoId, aprovadoPorId) {
  await transaction(async (client) => {
    // Buscar lançamento
    const { rows: [lanc] } = await client.query(
      `SELECT id, usuario_id, tipo, descricao, valor, data_lancamento
       FROM lancamentos WHERE id = $1`,
      [lancamentoId]
    );
    if (!lanc) throw new Error('Lançamento não encontrado');

    // Verificar se já tem entrada no extrato para este lançamento
    const { rows: existe } = await client.query(
      `SELECT id FROM extrato_adiantamento WHERE lancamento_id = $1`,
      [lancamentoId]
    );

    if (existe.length) {
      // Atualizar status para 'ok'
      await client.query(
        `UPDATE extrato_adiantamento
         SET status = 'ok', aprovado_por_id = $1
         WHERE lancamento_id = $2`,
        [aprovadoPorId, lancamentoId]
      );
    } else {
      // Criar entrada no extrato (valor negativo = saída)
      await client.query(
        `INSERT INTO extrato_adiantamento
           (usuario_id, tipo, descricao, valor, data_movimento,
            status, lancado_por_id, aprovado_por_id, lancamento_id)
         VALUES ($1, $2, $3, $4, $5, 'ok', $6, $7, $8)`,
        [
          lanc.usuario_id,
          lanc.tipo,
          lanc.descricao,
          -(lanc.valor),           // negativo = custo
          lanc.data_lancamento,
          lanc.usuario_id,
          aprovadoPorId,
          lancamentoId,
        ]
      );
    }

    // Recalcular saldo
    await recalcularSaldo(lanc.usuario_id, client);
  });
}

/** Ao reprovar: marca extrato como 'rj' e recalcula saldo */
async function reverterLancamento(lancamentoId) {
  await transaction(async (client) => {
    const { rows: [ext] } = await client.query(
      `UPDATE extrato_adiantamento
       SET status = 'rj'
       WHERE lancamento_id = $1
       RETURNING usuario_id`,
      [lancamentoId]
    );
    if (ext) await recalcularSaldo(ext.usuario_id, client);
  });
}

module.exports = { recalcularSaldo, abaterLancamento, reverterLancamento };

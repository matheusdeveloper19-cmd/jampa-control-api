// src/services/combustivel.js
// Equivale a PRECO_LITRO, getPrecoParaData() e recalcularTodasRotas() do frontend
const { query, transaction } = require('../db/pool');

/** Retorna o preço vigente na data informada (ou o mais recente se anterior a tudo) */
async function getPrecoParaData(data) {
  const { rows } = await query(
    `SELECT valor FROM historico_combustivel
     WHERE vigente_em <= $1
     ORDER BY vigente_em DESC
     LIMIT 1`,
    [data]
  );
  if (!rows.length) return 0;
  return parseFloat(rows[0].valor);
}

/** Calcula o valor de combustível para uma rota: km * preco / 10 */
async function calcularValorRota(km, data) {
  const preco = await getPrecoParaData(data);
  return parseFloat((km * preco / 10).toFixed(2));
}

/** Recalcula TODOS os valores de rotas aprovadas/pendentes quando o preço muda
 *  Equivale a recalcularTodasRotas() do frontend */
async function recalcularTodasRotas() {
  const { rows: rotas } = await query(
    `SELECT id, km, data_lancamento FROM lancamentos
     WHERE tipo = 'rota' AND excluido_em IS NULL`
  );

  let atualizados = 0;
  await transaction(async (client) => {
    for (const rota of rotas) {
      const preco = await getPrecoParaData(rota.data_lancamento);
      const novoValor = parseFloat((rota.km * preco / 10).toFixed(2));
      await client.query(
        `UPDATE lancamentos SET valor = $1, updated_at = NOW() WHERE id = $2`,
        [novoValor, rota.id]
      );
      atualizados++;
    }
  });
  return atualizados;
}

/** Retorna o preço atual vigente */
async function getPrecoAtual() {
  const { rows } = await query(
    `SELECT valor, vigente_em, observacao
     FROM historico_combustivel
     WHERE status = 'vigente'
     ORDER BY vigente_em DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

module.exports = { getPrecoParaData, calcularValorRota, recalcularTodasRotas, getPrecoAtual };

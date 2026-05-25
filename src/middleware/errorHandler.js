/**
 * middleware/errorHandler.js
 *
 * Captura todos os erros não tratados e retorna uma resposta padronizada.
 * Diferencia erros das APIs externas (axios) de erros internos.
 */

// O Express identifica middleware de erro por ter 4 parâmetros (err, req, res, next)
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(`[Erro] ${req.method} ${req.path}:`, err.message);

  // Erro de comunicação com uma API externa (axios)
  if (err.isAxiosError) {
    return res.status(err.response?.status || 502).json({
      erro: 'Falha ao comunicar com a API externa',
      detalhes: err.response?.data || err.message,
      url: err.config?.url,
    });
  }

  // Erro com status definido manualmente (ex: { status: 404, message: 'Não encontrado' })
  if (err.status) {
    return res.status(err.status).json({ erro: err.message });
  }

  // Erro interno genérico
  res.status(500).json({ erro: 'Erro interno no integrador' });
}

module.exports = errorHandler;

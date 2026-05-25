// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(`[Erro] ${req.method} ${req.path}:`, err.message);

  if (err.isAxiosError) {
    return res.status(err.response?.status || 502).json({
      erro:     'Falha ao comunicar com a API externa',
      detalhes: err.response?.data || err.message,
      url:      err.config?.url,
    });
  }

  if (err.status) {
    return res.status(err.status).json({ erro: err.message });
  }

  res.status(500).json({ erro: 'Erro interno no integrador' });
}

module.exports = errorHandler;

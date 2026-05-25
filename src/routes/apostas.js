/**
 * routes/apostas.js
 *
 * Apostas I2 usa RSA+AES — a criptografia do POST é feita automaticamente no service.
 * O frontend envia e recebe sempre JSON limpo.
 *
 * Filtro opcional: GET /apostas?id_apostador=1
 */
const express = require('express');
const service = require('../services/apostasService');
const router = express.Router();

router.get('/',       async (req, res, next) => {
  try {
    const filtros = req.query.id_apostador ? { id_apostador: req.query.id_apostador } : {};
    res.json(await service.listar(req.usuario.sessionId, filtros));
  } catch (e) { next(e); }
});

router.get('/:id',    async (req, res, next) => {
  try { res.json(await service.buscarPorId(req.params.id, req.query.instancia, req.usuario.sessionId)); }
  catch (e) { next(e); }
});

router.post('/',      async (req, res, next) => {
  try { res.status(201).json(await service.criar(req.body, req.usuario.sessionId)); }
  catch (e) { next(e); }
});

router.put('/:id',    async (req, res, next) => {
  try { res.json(await service.atualizar(req.params.id, req.body, req.query.instancia, req.usuario.sessionId)); }
  catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { res.json(await service.deletar(req.params.id, req.query.instancia, req.usuario.sessionId)); }
  catch (e) { next(e); }
});

module.exports = router;

/**
 * routes/lutadores.js
 *
 * Lutadores I2 usa RSA-OAEP — a descriptografia é feita automaticamente no service.
 * O frontend recebe sempre JSON limpo, sem saber que houve criptografia.
 */
const express = require('express');
const service = require('../services/lutadoresService');
const router = express.Router();

router.get('/',       async (req, res, next) => {
  try { res.json(await service.listar()); }
  catch (e) { next(e); }
});

router.get('/:id',    async (req, res, next) => {
  try { res.json(await service.buscarPorId(req.params.id, req.query.instancia)); }
  catch (e) { next(e); }
});

router.post('/',      async (req, res, next) => {
  try { res.status(201).json(await service.criar(req.body)); }
  catch (e) { next(e); }
});

router.put('/:id',    async (req, res, next) => {
  try { res.json(await service.atualizar(req.params.id, req.body, req.query.instancia)); }
  catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { res.json(await service.deletar(req.params.id, req.query.instancia)); }
  catch (e) { next(e); }
});

module.exports = router;

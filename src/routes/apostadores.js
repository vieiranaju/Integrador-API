const express = require('express');
const service = require('../services/apostadoresService');
const router  = express.Router();

router.get('/',       async (req, res, next) => { try { res.json(await service.listar(req.usuario.sessionId)); } catch (e) { next(e); } });
router.get('/:id',    async (req, res, next) => { try { res.json(await service.buscarPorId(req.params.id, req.query.instancia, req.usuario.sessionId)); } catch (e) { next(e); } });
router.post('/',      async (req, res, next) => { try { res.status(201).json(await service.criar(req.body, req.usuario.sessionId)); } catch (e) { next(e); } });
router.put('/:id',    async (req, res, next) => { try { res.json(await service.atualizar(req.params.id, req.body, req.query.instancia, req.usuario.sessionId)); } catch (e) { next(e); } });
router.delete('/:id', async (req, res, next) => { try { res.json(await service.deletar(req.params.id, req.query.instancia, req.usuario.sessionId)); } catch (e) { next(e); } });

module.exports = router;

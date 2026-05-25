const express = require('express');
const service = require('../services/lutasService');
const router  = express.Router();

router.get('/',       async (req, res, next) => { try { res.json(await service.listar()); } catch (e) { next(e); } });
router.get('/:id',    async (req, res, next) => { try { res.json(await service.buscarPorId(req.params.id, req.query.instancia)); } catch (e) { next(e); } });
router.post('/',      async (req, res, next) => { try { res.status(201).json(await service.criar(req.body)); } catch (e) { next(e); } });
router.put('/:id',    async (req, res, next) => { try { res.json(await service.atualizar(req.params.id, req.body, req.query.instancia)); } catch (e) { next(e); } });
router.delete('/:id', async (req, res, next) => { try { res.json(await service.deletar(req.params.id, req.query.instancia)); } catch (e) { next(e); } });

module.exports = router;

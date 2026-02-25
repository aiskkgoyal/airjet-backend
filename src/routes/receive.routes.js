// /src/routes/receive.routes.js
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

const ctrl = require('../controllers/receive.controller');

// helper: next main piece number (reserve)
router.get('/next-piece-number', auth, ctrl.getNextPieceNumber);

// header ops
router.post('/', auth, ctrl.createReceiveHeader);            // create draft header
router.get('/', auth, ctrl.listReceiveHeaders);              // list
router.get('/:id', auth, ctrl.getReceiveHeader);             // get header

router.patch('/:id/cancel', auth, ctrl.cancelReceiveHeader); // cancel draft

// pieces
router.post('/:id/pieces', auth, ctrl.addPieceRow);          // add piece to header

// confirm
router.post('/:id/confirm', auth, ctrl.confirmReceive);     // confirm receive (transactional)

// overproduction approval (supervisor)
router.post('/adjustments/:id/approve', auth, ctrl.approveOverproduction);

module.exports = router;
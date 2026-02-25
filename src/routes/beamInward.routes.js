const express = require('express');
const router = express.Router();
const { createBeamInward } = require('../controllers/beamInward.controller');
const { listBeamInwards } = require('../controllers/beamInward.list.controller');
const { cancelInward } = require('../controllers/beamInward.cancel.controller');

const auth = require('../middlewares/auth');

router.get('/', auth, listBeamInwards);
router.post('/', auth, createBeamInward);
router.patch('/:id/cancel', auth, cancelInward)

module.exports = router;
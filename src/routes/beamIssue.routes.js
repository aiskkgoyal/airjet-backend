// /src/routes/beamIssue.routes.js
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

const { createBeamIssue, listBeamIssues } = require('../controllers/beamIssue.controller');
const { startIssue, interruptIssue, completeIssue } = require('../controllers/beamIssue.actions.controller');

router.get('/', auth, listBeamIssues);
router.post('/', auth, createBeamIssue);

// actions
router.post('/:id/start', auth, startIssue);        // WAITING -> RUNNING
router.post('/:id/interrupt', auth, interruptIssue);// RUNNING -> INTERRUPTED
router.post('/:id/complete', auth, completeIssue);  // RUNNING -> COMPLETED

module.exports = router;
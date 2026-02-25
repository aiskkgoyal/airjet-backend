// /src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const beamInwardRoutes = require('./routes/beamInward.routes');
const beamIssueRoutes = require('./routes/beamIssue.routes');
const receiveRoutes = require('./routes/receive.routes');


const app = express();

app.use(cors());
app.use(express.json());

// routes
app.use('/auth', authRoutes);
app.use('/beam-inward', beamInwardRoutes);
app.use('/beam-issue', beamIssueRoutes);
app.use('/receive-headers', receiveRoutes);

app.get('/ping', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on', PORT));
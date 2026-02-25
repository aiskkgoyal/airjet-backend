const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );

  res.json({ token });
});

module.exports = router;
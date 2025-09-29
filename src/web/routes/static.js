const express = require('express');
const path = require('path');
const router = express.Router();

router.use('/static', express.static(path.join(process.cwd(), 'web', 'public')));

module.exports = router;

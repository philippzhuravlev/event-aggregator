const express = require('express');
const fbAuth = require('./fbAuth');

const app = express();
app.use('/', fbAuth);

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
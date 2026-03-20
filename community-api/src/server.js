const { app } = require('./app');
const { port } = require('./config');

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Community API listening on http://localhost:${port}`);
});

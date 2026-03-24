const { port } = require('./config');
const { createApp } = require('./app');

async function startServer() {
  const app = await createApp();

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Community API listening on http://localhost:${port}`);
  });
}

startServer().catch(error => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

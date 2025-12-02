const { createServer } = require('http');
const next = require('next');

const port = process.env.PORT || 8080;
const dev = false;
const app = next({ dev });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  createServer(handler).listen(port, () => {
    console.log(`Next.js server running on port ${port}`);
  });
});

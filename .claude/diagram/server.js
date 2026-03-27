const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4000;
const HTML_FILE = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  fs.readFile(HTML_FILE, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading diagram');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Architecture diagram server running on http://localhost:${PORT}`);
});

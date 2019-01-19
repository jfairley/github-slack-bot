module.exports = {
  'package.json': ['fixpack', 'git add'],
  '*.config.js': ['prettier --write', 'git add'],
  '*.json': ['prettier --write', 'git add'],
  '*.ts': ['prettier --write', 'npm run lint', 'git add']
};

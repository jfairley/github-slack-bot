module.exports = {
  'package.json': ['fixpack', 'git add'],
  '*.ts': ['prettier', 'npm run lint', 'git add']
};

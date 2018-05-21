module.exports = {
  'package.json': ['fixpack', 'git add'],
  '*.ts': ['npm run lint', 'prettier', 'git add']
};

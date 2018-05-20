module.exports = {
  '*.js': ['eslint --fix', 'git add'],
  '*.ts': ['prettier', 'git add']
};

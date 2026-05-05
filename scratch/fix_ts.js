const fs = require('fs');
const file = 'app/reception/dispatch/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /disabled=\{!isDispatchReady\(selectedOrder\)\}/g,
  'disabled={!isDispatchReady(selectedSubOrder.originalOrder)}'
);

content = content.replace(
  /\$\{isDispatchReady\(selectedOrder\)/g,
  '${isDispatchReady(selectedSubOrder.originalOrder)'
);

fs.writeFileSync(file, content, 'utf8');
console.log('page.tsx TS fix success');

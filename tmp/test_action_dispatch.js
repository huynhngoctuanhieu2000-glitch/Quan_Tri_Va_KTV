const { getDispatchData } = require('./app/reception/dispatch/actions');
const fs = require('fs');

async function testAction() {
  const date = '2026-03-07'; // Ngày trong ảnh người dùng
  console.log('Testing getDispatchData for date:', date);
  const result = await getDispatchData(date);
  
  fs.writeFileSync('tmp/action_result_debug.json', JSON.stringify(result, null, 2));
  console.log('Result written to tmp/action_result_debug.json');
  process.exit(0);
}

testAction();

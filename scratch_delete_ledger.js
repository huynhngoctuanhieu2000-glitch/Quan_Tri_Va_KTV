const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log('Đang xóa các dữ liệu trống từ trước ngày 04/05/2026...');
  const { error } = await supabase
    .from('KTVDailyLedger')
    .delete()
    .lt('date', '2026-05-04');
    
  if (error) {
    console.error('Lỗi khi xóa:', error);
  } else {
    console.log('Đã dọn dẹp thành công dữ liệu trước ngày mùng 4!');
  }
}
run();

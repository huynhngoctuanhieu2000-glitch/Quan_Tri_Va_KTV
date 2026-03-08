const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestService() {
    const testId = 'TEST_SVC_' + Math.floor(Math.random() * 10000);
    const { data, error } = await supabase
        .from('Services')
        .insert({
            id: testId,
            code: 'TEST1M',
            nameVN: 'Dịch vụ TEST (1 Phút)',
            nameEN: 'Test Service (1 Min)',
            category: 'Test',
            duration: 1, 
            priceVND: 1000,
            isActive: true,
            imageUrl: 'https://i.postimg.cc/BLGMDK2Z/body-dau.webp',
            isBestChoice: false,
            isBestSeller: false,
            description: 'Dịch vụ dùng để test nhanh chức năng điều phối và hoàn thành đơn.'
        })
        .select();

    if (error) {
        console.error('Error:', error.message);
        process.exit(1);
    } else {
        console.log('Success Created Service:', JSON.stringify(data, null, 2));
        process.exit(0);
    }
}

createTestService();

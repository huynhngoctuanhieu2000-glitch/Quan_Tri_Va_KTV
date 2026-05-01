import { createClient } from '@supabase/supabase-js';
import pkg from '@next/env';
const { loadEnvConfig } = pkg;

// Tự động load .env.local bằng thư viện có sẵn của Next.js (không cần cài thêm dotenv)
const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase env vars. Make sure SUPABASE_SERVICE_ROLE_KEY is set in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const DOMAIN_SUFFIX = '@nganhaspa.internal';

async function migrateAuth() {
    console.log('🚀 Starting Auth Migration...');

    // 1. Fetch all users from public.Users
    const { data: users, error: fetchErr } = await supabase
        .from('Users')
        .select('*');

    if (fetchErr) {
        console.error('❌ Error fetching users:', fetchErr);
        return;
    }

    console.log(`📦 Found ${users.length} users to migrate.`);

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
        // Generate a fake email for Supabase Auth since we use usernames
        const email = `${user.username}${DOMAIN_SUFFIX}`.toLowerCase();
        
        console.log(`\n⏳ Migrating user: ${user.username} (${email})`);

        try {
            // 2. Create user in auth.users
            const { data: authUser, error: createErr } = await supabase.auth.admin.createUser({
                email,
                password: user.password, // This assumes password is plain-text currently
                email_confirm: true,
                user_metadata: {
                    business_user_id: user.id, // VITAL: Link back to public.Users
                    techCode: user.code,
                    role: user.role,
                    fullName: user.fullName
                }
            });

            if (createErr) {
                // If user already exists, it might throw an error. We can try to update them.
                if (createErr.message.includes('already exists')) {
                    console.log(`⚠️ User ${email} already exists in auth.users. Skipping creation.`);
                    successCount++;
                    continue;
                }
                console.error(`❌ Failed to create auth user for ${user.username}:`, createErr.message);
                failCount++;
                continue;
            }

            const newAuthUserId = authUser.user.id;
            console.log(`✅ Created auth.users record: ${newAuthUserId}`);

            // 3. Optional: Add a column `auth_user_id` to `public.Users` if we haven't already
            // This requires the column to exist. We will just attempt to update it.
            // Note: In production, you'd run a SQL migration first.
            const { error: updateErr } = await supabase
                .from('Users')
                .update({ auth_user_id: newAuthUserId })
                .eq('id', user.id);

            if (updateErr) {
                // If the column doesn't exist yet, this will fail, which is okay for now if we rely on metadata mapping.
                console.warn(`⚠️ Failed to update public.Users.auth_user_id for ${user.username} (Column might not exist yet):`, updateErr.message);
            } else {
                console.log(`🔗 Linked auth_user_id to public.Users for ${user.username}`);
            }

            successCount++;

        } catch (err: any) {
            console.error(`❌ Unexpected error migrating ${user.username}:`, err.message);
            failCount++;
        }
    }

    console.log('\n=============================================');
    console.log(`🏁 Migration Complete!`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log('=============================================');
    
    if (failCount > 0) {
        console.log('\n💡 Hint: Check if passwords meet Supabase minimum length (6 chars).');
    }
}

migrateAuth();

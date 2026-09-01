
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from("WalletAdjustments")
    .delete()
    .eq("amount", -50000)
    .eq("type", "ADJUST")
    .select();
    
  if (error) {
    console.error("Error deleting:", error);
    return;
  }
  
  console.log(`Successfully deleted ${data.length} original -50000 deductions.`);
}

main();


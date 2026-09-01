
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: records, error: fetchError } = await supabase
    .from("WalletAdjustments")
    .select("id, amount, reason")
    .in("amount", [-50000, 50000])
    .eq("type", "ADJUST")
    .order("created_at", { ascending: false });
    
  if (fetchError) {
    console.error("Error fetching data:", fetchError);
    return;
  }
  
  const toDelete = records.filter(r => r.reason && (r.reason.includes("b?o trì") || r.reason.includes("h? th?ng")));
  console.log(`Found ${toDelete.length} records to delete.`);
  
  if (toDelete.length > 0) {
      const idsToDelete = toDelete.map(r => r.id);
      
      // Batch delete
      const { data: deleted, error: deleteError } = await supabase
        .from("WalletAdjustments")
        .delete()
        .in("id", idsToDelete)
        .select();
        
      if (deleteError) {
          console.error("Error deleting records:", deleteError);
          return;
      }
      console.log(`Successfully deleted ${deleted.length} records.`);
  }
}

main();


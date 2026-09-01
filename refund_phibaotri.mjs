
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: deductions, error: fetchError } = await supabase
    .from("WalletAdjustments")
    .select("*")
    .eq("amount", -50000)
    .eq("type", "ADJUST")
    .order("created_at", { ascending: false });
    
  if (fetchError) {
    console.error("Error fetching data:", fetchError);
    return;
  }
  
  const toRefund = deductions.filter(d => d.reason.includes("b?o trì") || d.reason.includes("h? th?ng") || d.reason.includes("08/2026"));
  
  console.log(`Found ${toRefund.length} deductions to refund.`);
  
  const refunds = toRefund.map(d => ({
    staff_id: d.staff_id,
    amount: 50000,
    type: "ADJUST",
    reason: "Hoàn phí b?o trì h? th?ng (Refund)",
    created_by: "SYSTEM_ADMIN",
    wallet_type: d.wallet_type
  }));
  
  if (refunds.length === 0) {
      console.log("No refunds to process.");
      return;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("WalletAdjustments")
    .insert(refunds)
    .select();
    
  if (insertError) {
      console.error("Error inserting refunds:", insertError);
      return;
  }
  
  console.log(`Successfully refunded ${inserted.length} KTVs.`);
}

main();


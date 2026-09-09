// ============================================================
//  BATTERD — shared partner expense + purchase tracker
//  Backend connection (Supabase). Publishable (anon) key only.
// ============================================================

window.BATTERD_CONFIG = {
  SUPABASE_URL: "https://xwsjodofzisczpjvuerv.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_w7aLVIageQlHH-IOJbS40w_K4nh-mCD", // publishable (public) key

  BUSINESS_NAME: "BATTERD",
  CURRENCY: "OMR",

  // The five partners, with equity share. Each partner logs in as themselves.
  // equity is used for the fair-share / settle-up math.
  PARTNERS: [
    { id: "azzan",    name: "Azzan",    equity: 0.22, color: "#c0392b" }, // chili red
    { id: "ahmed",    name: "Ahmed",    equity: 0.22, color: "#5b6ec9" }, // indigo tint (legible on charcoal + cream)
    { id: "abdullah", name: "Abdullah", equity: 0.22, color: "#2e8b74" }, // teal
    { id: "saud",     name: "Saud",     equity: 0.22, color: "#e5a823" }, // mustard gold (brand)
    { id: "munther",  name: "Munther",  equity: 0.12, color: "#7d5ba6" }, // plum
  ],

  // Expense categories (money already spent by a partner).
  CATEGORIES: [
    { id: "licensing",   name: "Licensing" },
    { id: "rent",        name: "Rent / premises" },
    { id: "fitout",      name: "Fit-out" },
    { id: "equipment",   name: "Equipment" },
    { id: "ingredients", name: "Ingredients" },
    { id: "tasting",     name: "Tasting" },
    { id: "packaging",   name: "Packaging" },
    { id: "tech",        name: "Tech" },
    { id: "marketing",   name: "Marketing" },
    { id: "utilities",   name: "Utilities" },
    { id: "salaries",    name: "Salaries / wages" },
    { id: "other",       name: "Other" },
  ],

  // Purchase tracker (orders that move through a status pipeline).
  PURCHASE_CATEGORIES: [
    { id: "equipment", name: "Equipment" },
    { id: "packaging", name: "Packaging" },
    { id: "ingredients", name: "Ingredients" },
    { id: "fitout", name: "Fit-out" },
    { id: "other", name: "Other" },
  ],
  PURCHASE_STATUSES: [
    { id: "researching", name: "Researching", color: "#8a94a6" },
    { id: "quoted",      name: "Quoted",      color: "#d99a3c" },
    { id: "ordered",     name: "Ordered",     color: "#4a90d9" },
    { id: "delivered",   name: "Delivered",   color: "#2f9e6f" },
    { id: "cancelled",   name: "Cancelled",   color: "#c0392b" },
  ],
};

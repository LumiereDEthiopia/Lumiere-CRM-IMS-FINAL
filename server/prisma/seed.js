import prisma from "../src/config/prisma.js"

import { createHash, randomBytes } from "crypto"

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex")
  const hash = createHash("sha256").update(salt + password).digest("hex")
  return `${salt}:${hash}`
}

async function seed() {
  console.log("Starting seed...")

  const men = await prisma.category.upsert({ where: { slug: "men" }, update: {}, create: { name: "Men", slug: "men", isActive: true, sortOrder: 1 } })
  const women = await prisma.category.upsert({ where: { slug: "women" }, update: {}, create: { name: "Women", slug: "women", isActive: true, sortOrder: 2 } })
  const kids = await prisma.category.upsert({ where: { slug: "kids" }, update: {}, create: { name: "Kids", slug: "kids", isActive: true, sortOrder: 3 } })
  const unisex = await prisma.category.upsert({ where: { slug: "unisex" }, update: {}, create: { name: "Unisex", slug: "unisex", isActive: true, sortOrder: 4 } })
  const luxury = await prisma.category.upsert({ where: { slug: "luxury" }, update: {}, create: { name: "Luxury Perfume", slug: "luxury", isActive: true, sortOrder: 5 } })
  await prisma.category.upsert({ where: { slug: "oud" }, update: {}, create: { name: "Oud", slug: "oud", parentId: luxury.id, isActive: true } })
  await prisma.category.upsert({ where: { slug: "niche" }, update: {}, create: { name: "Niche", slug: "niche", parentId: luxury.id, isActive: true } })

  const accordSlugs = ["floral", "citrus", "fresh", "fruity", "woody", "oud", "amber", "vanilla", "musk", "powdery", "spicy", "sweet", "aromatic", "earthy", "smoky", "green", "aquatic"]
  const accordColors = { floral: "#F8BBD0", citrus: "#FDE93B", fresh: "#A8E6CF", fruity: "#FF6F61", woody: "#8D6E63", oud: "#5D4037", amber: "#FF8A65", vanilla: "#FFE0B2", musk: "#E0E0E0", powdery: "#F3E5F5", spicy: "#EF5350", aromatic: "#A5D6A7", earthy: "#A1887F", smoky: "#757575", green: "#81C784", aquatic: "#64B5F6" }
  const accords = {}
  for (const slug of accordSlugs) {
    accords[slug] = await prisma.accord.upsert({ where: { slug }, update: {}, create: { name: slug.charAt(0).toUpperCase() + slug.slice(1), slug, color: accordColors[slug] || null, isActive: true } })
  }

  const noteSlugs = ["bergamot", "lemon", "orange", "grapefruit", "pepper", "rose", "jasmine", "lavender", "lily", "peony", "vanilla", "musk", "amber", "sandalwood", "oud", "cedarwood", "patchouli", "vetiver"]
  const notes = {}
  for (const slug of noteSlugs) {
    notes[slug] = await prisma.fragranceNote.upsert({ where: { slug }, update: {}, create: { name: slug.charAt(0).toUpperCase() + slug.slice(1), slug } })
  }

  const brandData = [
    { name: "Lumiere", slug: "lumiere", country: "France" },
    { name: "Essence Noir", slug: "essence-noir", country: "Italy" },
    { name: "Aroma Royale", slug: "aroma-royale", country: "UAE" },
    { name: "Fleur de Vie", slug: "fleur-de-vie", country: "France" },
    { name: "Velvet Oud", slug: "velvet-oud", country: "Saudi Arabia" }
  ]
  const brands = {}
  for (const b of brandData) {
    brands[b.slug] = await prisma.brand.upsert({ where: { slug: b.slug }, update: {}, create: { ...b, isActive: true } })
  }

  const p1 = await prisma.product.upsert({ where: { slug: "midnight-oud" }, update: {}, create: { name: "Midnight Oud", slug: "midnight-oud", description: "Rich oud and exotic spices", shortDescription: "Rich oud", brandId: brands["velvet-oud"].id, categoryId: men.id, gender: "men", price: 289.99, stockQuantity: 25, sku: "MO-001", size: "100ml", concentration: "EDP", isLuxury: true, isFeatured: true, isNew: true } })
  await prisma.productAccord.deleteMany({ where: { productId: p1.id } })
  await prisma.productAccord.createMany({ data: [{ productId: p1.id, accordId: accords["oud"].id, intensity: 90 }, { productId: p1.id, accordId: accords["spicy"].id, intensity: 75 }, { productId: p1.id, accordId: accords["amber"].id, intensity: 70 }, { productId: p1.id, accordId: accords["smoky"].id, intensity: 65 }, { productId: p1.id, accordId: accords["woody"].id, intensity: 60 }] })
  await prisma.productNote.deleteMany({ where: { productId: p1.id } })
  await prisma.productNote.createMany({ data: [{ productId: p1.id, fragranceNoteId: notes["pepper"].id, noteType: "TOP" }, { productId: p1.id, fragranceNoteId: notes["bergamot"].id, noteType: "TOP" }, { productId: p1.id, fragranceNoteId: notes["rose"].id, noteType: "HEART" }, { productId: p1.id, fragranceNoteId: notes["jasmine"].id, noteType: "HEART" }, { productId: p1.id, fragranceNoteId: notes["oud"].id, noteType: "BASE" }, { productId: p1.id, fragranceNoteId: notes["vanilla"].id, noteType: "BASE" }, { productId: p1.id, fragranceNoteId: notes["amber"].id, noteType: "BASE" }, { productId: p1.id, fragranceNoteId: notes["sandalwood"].id, noteType: "BASE" }] })
  await prisma.productImage.deleteMany({ where: { productId: p1.id } })
  await prisma.productImage.createMany({ data: [{ productId: p1.id, imageUrl: "https://example.com/mo-main.webp", objectKey: "products/" + p1.id + "/main.webp", isPrimary: true }] })

  const p2 = await prisma.product.upsert({ where: { slug: "rose-elegante" }, update: {}, create: { name: "Rose Elegante", slug: "rose-elegante", description: "Sophisticated rose composition", shortDescription: "Rose", brandId: brands["fleur-de-vie"].id, categoryId: women.id, gender: "women", price: 189.99, stockQuantity: 40, sku: "RE-001", size: "50ml", concentration: "EDP", isLuxury: true, isFeatured: true, isNew: true } })
  await prisma.productAccord.deleteMany({ where: { productId: p2.id } })
  await prisma.productAccord.createMany({ data: [{ productId: p2.id, accordId: accords["floral"].id, intensity: 95 }, { productId: p2.id, accordId: accords["powdery"].id, intensity: 70 }, { productId: p2.id, accordId: accords["musk"].id, intensity: 60 }, { productId: p2.id, accordId: accords["fresh"].id, intensity: 45 }] })
  await prisma.productNote.deleteMany({ where: { productId: p2.id } })
  await prisma.productNote.createMany({ data: [{ productId: p2.id, fragranceNoteId: notes["bergamot"].id, noteType: "TOP" }, { productId: p2.id, fragranceNoteId: notes["rose"].id, noteType: "HEART" }, { productId: p2.id, fragranceNoteId: notes["jasmine"].id, noteType: "HEART" }, { productId: p2.id, fragranceNoteId: notes["lily"].id, noteType: "HEART" }, { productId: p2.id, fragranceNoteId: notes["musk"].id, noteType: "BASE" }, { productId: p2.id, fragranceNoteId: notes["vanilla"].id, noteType: "BASE" }] })

  const p3 = await prisma.product.upsert({ where: { slug: "aqua-fresh" }, update: {}, create: { name: "Aqua Fresh", slug: "aqua-fresh", description: "Refreshing aquatic", shortDescription: "Aquatic", brandId: brands["lumiere"].id, categoryId: unisex.id, gender: "unisex", price: 79.99, stockQuantity: 100, sku: "AF-001", size: "100ml", concentration: "EDT", isFeatured: true } })
  await prisma.productAccord.deleteMany({ where: { productId: p3.id } })
  await prisma.productAccord.createMany({ data: [{ productId: p3.id, accordId: accords["aquatic"].id, intensity: 85 }, { productId: p3.id, accordId: accords["fresh"].id, intensity: 80 }, { productId: p3.id, accordId: accords["citrus"].id, intensity: 70 }, { productId: p3.id, accordId: accords["green"].id, intensity: 55 }] })
  await prisma.productNote.deleteMany({ where: { productId: p3.id } })
  await prisma.productNote.createMany({ data: [{ productId: p3.id, fragranceNoteId: notes["lemon"].id, noteType: "TOP" }, { productId: p3.id, fragranceNoteId: notes["bergamot"].id, noteType: "TOP" }, { productId: p3.id, fragranceNoteId: notes["grapefruit"].id, noteType: "TOP" }, { productId: p3.id, fragranceNoteId: notes["lavender"].id, noteType: "HEART" }, { productId: p3.id, fragranceNoteId: notes["jasmine"].id, noteType: "HEART" }, { productId: p3.id, fragranceNoteId: notes["musk"].id, noteType: "BASE" }, { productId: p3.id, fragranceNoteId: notes["cedarwood"].id, noteType: "BASE" }] })

  const p4 = await prisma.product.upsert({ where: { slug: "citrus-royale" }, update: {}, create: { name: "Citrus Royale", slug: "citrus-royale", description: "Regal citrus blend", shortDescription: "Citrus", brandId: brands["aroma-royale"].id, categoryId: men.id, gender: "men", price: 129.99, stockQuantity: 60, sku: "CR-001", size: "75ml", concentration: "EDT" } })
  await prisma.productAccord.deleteMany({ where: { productId: p4.id } })
  await prisma.productAccord.createMany({ data: [{ productId: p4.id, accordId: accords["citrus"].id, intensity: 90 }, { productId: p4.id, accordId: accords["aromatic"].id, intensity: 75 }, { productId: p4.id, accordId: accords["fresh"].id, intensity: 65 }, { productId: p4.id, accordId: accords["woody"].id, intensity: 50 }] })
  await prisma.productNote.deleteMany({ where: { productId: p4.id } })
  await prisma.productNote.createMany({ data: [{ productId: p4.id, fragranceNoteId: notes["lemon"].id, noteType: "TOP" }, { productId: p4.id, fragranceNoteId: notes["orange"].id, noteType: "TOP" }, { productId: p4.id, fragranceNoteId: notes["bergamot"].id, noteType: "TOP" }, { productId: p4.id, fragranceNoteId: notes["lavender"].id, noteType: "HEART" }, { productId: p4.id, fragranceNoteId: notes["pepper"].id, noteType: "HEART" }, { productId: p4.id, fragranceNoteId: notes["vetiver"].id, noteType: "BASE" }, { productId: p4.id, fragranceNoteId: notes["musk"].id, noteType: "BASE" }] })

  const p5 = await prisma.product.upsert({ where: { slug: "vanille-noir" }, update: {}, create: { name: "Vanille Noir", slug: "vanille-noir", description: "Dark seductive vanilla", shortDescription: "Vanilla", brandId: brands["essence-noir"].id, categoryId: women.id, gender: "women", price: 219.99, stockQuantity: 30, sku: "VN-001", size: "50ml", concentration: "EDP", isLuxury: true, isFeatured: true, isNew: true } })
  await prisma.productAccord.deleteMany({ where: { productId: p5.id } })
  await prisma.productAccord.createMany({ data: [{ productId: p5.id, accordId: accords["vanilla"].id, intensity: 95 }, { productId: p5.id, accordId: accords["sweet"].id, intensity: 80 }, { productId: p5.id, accordId: accords["amber"].id, intensity: 70 }, { productId: p5.id, accordId: accords["musk"].id, intensity: 60 }, { productId: p5.id, accordId: accords["powdery"].id, intensity: 55 }] })
  await prisma.productNote.deleteMany({ where: { productId: p5.id } })
  await prisma.productNote.createMany({ data: [{ productId: p5.id, fragranceNoteId: notes["bergamot"].id, noteType: "TOP" }, { productId: p5.id, fragranceNoteId: notes["pepper"].id, noteType: "TOP" }, { productId: p5.id, fragranceNoteId: notes["rose"].id, noteType: "HEART" }, { productId: p5.id, fragranceNoteId: notes["jasmine"].id, noteType: "HEART" }, { productId: p5.id, fragranceNoteId: notes["vanilla"].id, noteType: "BASE" }, { productId: p5.id, fragranceNoteId: notes["musk"].id, noteType: "BASE" }, { productId: p5.id, fragranceNoteId: notes["patchouli"].id, noteType: "BASE" }] })

  const p6 = await prisma.product.upsert({ where: { slug: "fresh-kids" }, update: {}, create: { name: "Fresh Kids", slug: "fresh-kids", description: "Gentle fun fragrance", shortDescription: "Kids", brandId: brands["lumiere"].id, categoryId: kids.id, gender: "kids", price: 39.99, stockQuantity: 150, sku: "FK-001", size: "50ml", concentration: "EDT", isNew: true } })
  await prisma.productAccord.deleteMany({ where: { productId: p6.id } })
  await prisma.productAccord.createMany({ data: [{ productId: p6.id, accordId: accords["fruity"].id, intensity: 70 }, { productId: p6.id, accordId: accords["fresh"].id, intensity: 65 }, { productId: p6.id, accordId: accords["floral"].id, intensity: 50 }, { productId: p6.id, accordId: accords["sweet"].id, intensity: 45 }] })
  await prisma.productNote.deleteMany({ where: { productId: p6.id } })
  await prisma.productNote.createMany({ data: [{ productId: p6.id, fragranceNoteId: notes["orange"].id, noteType: "TOP" }, { productId: p6.id, fragranceNoteId: notes["lemon"].id, noteType: "TOP" }, { productId: p6.id, fragranceNoteId: notes["peony"].id, noteType: "HEART" }, { productId: p6.id, fragranceNoteId: notes["lily"].id, noteType: "HEART" }, { productId: p6.id, fragranceNoteId: notes["musk"].id, noteType: "BASE" }, { productId: p6.id, fragranceNoteId: notes["vanilla"].id, noteType: "BASE" }] })

  // --- Oil products (sold by gram) ---
  const p7 = await prisma.product.upsert({ where: { slug: "royal-attar-oud" }, update: {}, create: { name: "Royal Attar Oud", slug: "royal-attar-oud", description: "Traditional Indian attar — pure oud oil distilled from aged agarwood. Long-lasting, alcohol-free fragrance oil for men.", shortDescription: "Alcohol-free oud attar", brandId: brands["velvet-oud"].id, categoryId: luxury.id, gender: "men", productType: "OIL", price: 45, stockQuantity: 500, sku: "OA-001", concentration: "Attar", isLuxury: true, isFeatured: true, isNew: false } })
  await prisma.productAccord.deleteMany({ where: { productId: p7.id } })
  await prisma.productAccord.createMany({ data: [{ productId: p7.id, accordId: accords["oud"].id, intensity: 95 }, { productId: p7.id, accordId: accords["woody"].id, intensity: 80 }, { productId: p7.id, accordId: accords["amber"].id, intensity: 70 }, { productId: p7.id, accordId: accords["smoky"].id, intensity: 60 }] })
  await prisma.productNote.deleteMany({ where: { productId: p7.id } })
  await prisma.productNote.createMany({ data: [{ productId: p7.id, fragranceNoteId: notes["oud"].id, noteType: "BASE" }, { productId: p7.id, fragranceNoteId: notes["sandalwood"].id, noteType: "BASE" }, { productId: p7.id, fragranceNoteId: notes["amber"].id, noteType: "BASE" }, { productId: p7.id, fragranceNoteId: notes["vetiver"].id, noteType: "HEART" }] })

  const p8 = await prisma.product.upsert({ where: { slug: "rose-attar-women" }, update: {}, create: { name: "Rose Attar", slug: "rose-attar-women", description: "Exquisite Damask rose attar — steam-distilled from fresh rose petals. A luxurious, alcohol-free fragrance oil for women.", shortDescription: "Pure rose attar", brandId: brands["aroma-royale"].id, categoryId: women.id, gender: "women", productType: "OIL", price: 38, stockQuantity: 400, sku: "RA-001", concentration: "Attar", isLuxury: true, isFeatured: true, isNew: true } })
  await prisma.productAccord.deleteMany({ where: { productId: p8.id } })
  await prisma.productAccord.createMany({ data: [{ productId: p8.id, accordId: accords["floral"].id, intensity: 95 }, { productId: p8.id, accordId: accords["sweet"].id, intensity: 60 }, { productId: p8.id, accordId: accords["musk"].id, intensity: 50 }] })
  await prisma.productNote.deleteMany({ where: { productId: p8.id } })
  await prisma.productNote.createMany({ data: [{ productId: p8.id, fragranceNoteId: notes["rose"].id, noteType: "HEART" }, { productId: p8.id, fragranceNoteId: notes["jasmine"].id, noteType: "HEART" }, { productId: p8.id, fragranceNoteId: notes["vanilla"].id, noteType: "BASE" }, { productId: p8.id, fragranceNoteId: notes["musk"].id, noteType: "BASE" }] })

  const p9 = await prisma.product.upsert({ where: { slug: "sandalwood-pure-oil" }, update: {}, create: { name: "Sandalwood Pure Oil", slug: "sandalwood-pure-oil", description: "100% pure Mysore sandalwood essential oil — therapeutic grade. Used in aromatherapy, skincare, and as a premium fragrance base.", shortDescription: "Pure essential oil", brandId: brands["velvet-oud"].id, categoryId: luxury.id, gender: "unisex", productType: "PURE_OIL", price: 85, stockQuantity: 200, sku: "SPO-001", concentration: "100% Pure", isLuxury: true, isFeatured: true, isNew: false } })
  await prisma.productAccord.deleteMany({ where: { productId: p9.id } })
  await prisma.productAccord.createMany({ data: [{ productId: p9.id, accordId: accords["woody"].id, intensity: 95 }, { productId: p9.id, accordId: accords["earthy"].id, intensity: 60 }, { productId: p9.id, accordId: accords["sweet"].id, intensity: 40 }] })
  await prisma.productNote.deleteMany({ where: { productId: p9.id } })
  await prisma.productNote.createMany({ data: [{ productId: p9.id, fragranceNoteId: notes["sandalwood"].id, noteType: "BASE" }, { productId: p9.id, fragranceNoteId: notes["cedarwood"].id, noteType: "BASE" }, { productId: p9.id, fragranceNoteId: notes["vanilla"].id, noteType: "BASE" }] })

  const p10 = await prisma.product.upsert({ where: { slug: "lavender-pure-oil" }, update: {}, create: { name: "Lavender Pure Oil", slug: "lavender-pure-oil", description: "Pure French lavender essential oil — calming and soothing. Ideal for aromatherapy, massage, and natural perfumery.", shortDescription: "Aromatherapy essential oil", brandId: brands["lumiere"].id, categoryId: unisex.id, gender: "unisex", productType: "PURE_OIL", price: 35, stockQuantity: 350, sku: "LPO-001", concentration: "100% Pure", isFeatured: true, isNew: true } })
  await prisma.productAccord.deleteMany({ where: { productId: p10.id } })
  await prisma.productAccord.createMany({ data: [{ productId: p10.id, accordId: accords["floral"].id, intensity: 80 }, { productId: p10.id, accordId: accords["aromatic"].id, intensity: 90 }, { productId: p10.id, accordId: accords["fresh"].id, intensity: 60 }] })
  await prisma.productNote.deleteMany({ where: { productId: p10.id } })
  await prisma.productNote.createMany({ data: [{ productId: p10.id, fragranceNoteId: notes["lavender"].id, noteType: "HEART" }, { productId: p10.id, fragranceNoteId: notes["bergamot"].id, noteType: "TOP" }, { productId: p10.id, fragranceNoteId: notes["cedarwood"].id, noteType: "BASE" }] })

  const settingsData = [
    { key: "store_name", value: "Lumiere", type: "text" },
    { key: "store_email", value: "contact@lumiere.com", type: "text" },
    { key: "currency", value: "ETB", type: "text" },
    { key: "delivery_fee", value: "9.99", type: "number" }
  ]
  for (const s of settingsData) {
    await prisma.setting.upsert({ where: { key: s.key }, update: { value: s.value }, create: s })
  }

  await prisma.user.upsert({ where: { email: "admin@lumiere.com" }, update: {}, create: { name: "Admin", email: "admin@lumiere.com", passwordHash: hashPassword("admin123"), isActive: true } })

  const superAdminRole = await prisma.role.upsert({
    where: {
      name: "SUPER_ADMIN"
    },
    update: {},
    create: {
      name: "SUPER_ADMIN"
    }
  });
  await prisma.user.upsert({
    where: {
      email: "super_admin@lumiere.com"
    },
    update: {
      isActive: true,
      role: {
        connect: {
          id: superAdminRole.id
        }
      }
    },
    create: {
      name: "SUPER_ADMIN",
      email: "super_admin@lumiere.com",
      passwordHash: hashPassword("admin123"),
      isActive: true,
      role: {
        connect: {
          id: superAdminRole.id
        }
      }
    }
  });

  const customer = await prisma.customer.upsert({ where: { email: "john@example.com" }, update: {}, create: { name: "John Doe", customerCode: "CUST-0001", email: "john@example.com", phone: "+1-555-0123", city: "New York", country: "USA", customerType: "INDIVIDUAL", status: "ACTIVE" } })

  console.log("Seed completed!")
}

seed().catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })

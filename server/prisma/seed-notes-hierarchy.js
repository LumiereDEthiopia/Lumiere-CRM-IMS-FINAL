/**
 * Seed script for Perfume Note Groups and Sub-Groups (Part 1: G01-G03)
 * Idempotent - safe to run multiple times
 */

import prisma from '../src/config/prisma.js'

const groupsData = [
  {
    groupCode: 'G01',
    groupName: 'CITRUS SMELLS',
    description: 'Fresh, zesty, and vibrant citrus aromas',
    sortOrder: 1,
    subGroups: [
      { subGroupCode: 'G01-S01', subGroupName: 'Classic Citrus', description: 'Traditional citrus notes', sortOrder: 1 },
      { subGroupCode: 'G01-S02', subGroupName: 'Exotic / Modern Citrus', description: 'Unique and modern citrus varieties', sortOrder: 2, examples: 'Yuzu, Pomelo, Grapefruit, Hassaku, Kumquat' },
      { subGroupCode: 'G01-S03', subGroupName: 'Citrus Leaves, Twigs & Blossoms', description: 'Citrus plant parts and blossoms', sortOrder: 3, examples: 'Petitgrain, Neroli, Verbena, Lemongrass' },
      { subGroupCode: 'G01-S04', subGroupName: 'Citrus Accords & Drinks', description: 'Citrus-based accords and beverages', sortOrder: 4 }
    ]
  },
  {
    groupCode: 'G02',
    groupName: 'FRUITS',
    description: 'Sweet, tangy, and juicy fruit notes',
    sortOrder: 2,
    subGroups: [
      { subGroupCode: 'G02-S01', subGroupName: 'Berries & Currants', description: 'Small berries and currant notes', sortOrder: 1 },
      { subGroupCode: 'G02-S02', subGroupName: 'Tropical & Exotic Fruits', description: 'Tropical and exotic fruit notes', sortOrder: 2, examples: 'Mango, Pineapple, Coconut, Papaya, Litchi' },
      { subGroupCode: 'G02-S03', subGroupName: 'Orchard, Stone & Pome Fruits', description: 'Classic orchard and tree fruits', sortOrder: 3, examples: 'Apple, Pear, Peach, Cherry, Plum' },
      { subGroupCode: 'G02-S04', subGroupName: 'Melons, Fresh & Watery Fruits', description: 'Fresh and hydrating melon notes', sortOrder: 4 },
      { subGroupCode: 'G02-S05', subGroupName: 'Dried, Jammy & Candied Fruits', description: 'Preserved and processed fruit notes', sortOrder: 5 },
      { subGroupCode: 'G02-S06', subGroupName: 'General Fruity Accords', description: 'Generic fruity accords', sortOrder: 6 }
    ]
  },
  {
    groupCode: 'G03',
    groupName: 'VEGETABLES & GREEN FOODS',
    description: 'Vegetable and green food notes',
    sortOrder: 3,
    subGroups: [
      { subGroupCode: 'G03-S01', subGroupName: 'Green Vegetables & Leaves', description: 'Fresh green vegetable notes', sortOrder: 1 },
      { subGroupCode: 'G03-S02', subGroupName: 'Roots, Gourds & Fungi', description: 'Root vegetables, gourds and fungi', sortOrder: 2, examples: 'Carrot, Truffle, Mushroom' }
    ]
  }
]

async function seed() {
  console.log('🌱 Starting seed (Part 1: G01-G03)...')
  
  for (const groupData of groupsData) {
    const group = await prisma.perfumeNoteGroup.upsert({
      where: { groupCode: groupData.groupCode },
      update: { groupName: groupData.groupName, description: groupData.description, sortOrder: groupData.sortOrder, active: true },
      create: { groupCode: groupData.groupCode, groupName: groupData.groupName, description: groupData.description, sortOrder: groupData.sortOrder, active: true }
    })
    
    console.log(`  ✓ ${groupData.groupCode} - ${groupData.groupName}`)
    
    for (const sgData of groupData.subGroups) {
      await prisma.perfumeNoteSubGroup.upsert({
        where: { subGroupCode: sgData.subGroupCode },
        update: { subGroupName: sgData.subGroupName, groupId: group.id, description: sgData.description, sortOrder: sgData.sortOrder, active: true },
        create: { subGroupCode: sgData.subGroupCode, subGroupName: sgData.subGroupName, groupId: group.id, description: sgData.description, sortOrder: sgData.sortOrder, active: true }
      })
      console.log(`    ✓ ${sgData.subGroupCode} - ${sgData.subGroupName}`)
    }
  }
  
  console.log('✅ Part 1 done!')
}

seed().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect())

﻿

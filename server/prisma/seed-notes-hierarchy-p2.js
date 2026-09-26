/**
 * Seed script for Perfume Note Groups and Sub-Groups (Part 2: G04-G06)
 */

import prisma from '../src/config/prisma.js'

const groupsData = [
  {
    groupCode: 'G04',
    groupName: 'NUTS, SEEDS & GRAINS',
    description: 'Nutty, seed, and grain notes',
    sortOrder: 4,
    subGroups: [
      { subGroupCode: 'G04-S01', subGroupName: 'Nuts', description: 'Various nut notes', sortOrder: 1, examples: 'Almond, Hazelnut, Pistachio, Walnut, Peanut, Chestnut' },
      { subGroupCode: 'G04-S02', subGroupName: 'Seeds, Grains, Butters & Milks', description: 'Seed and grain-derived notes', sortOrder: 2, examples: 'Shea, Malt, Oat, Rice' }
    ]
  },
  {
    groupCode: 'G05',
    groupName: 'FLOWERS',
    description: 'Floral notes and accords',
    sortOrder: 5,
    subGroups: [
      { subGroupCode: 'G05-S01', subGroupName: 'Rose Family', description: 'Rose and related florals', sortOrder: 1, examples: 'Rose, Taif Rose, Peony' },
      { subGroupCode: 'G05-S02', subGroupName: 'Powdery / Violet Florals', description: 'Soft powdery florals', sortOrder: 2, examples: 'Iris, Violet, Heliotrope, Lilac, Mimosa' },
      { subGroupCode: 'G05-S03', subGroupName: 'Yellow / Sunny & Honeyed Florals', description: 'Warm golden florals', sortOrder: 3, examples: 'Ylang-Ylang, Osmanthus, Broom' },
      { subGroupCode: 'G05-S04', subGroupName: 'Fresh / Green / Aquatic Florals', description: 'Fresh green floral notes', sortOrder: 4, examples: 'Lily-of-Valley, Freesia, Lotus, Magnolia' },
      { subGroupCode: 'G05-S05', subGroupName: 'Dark / Spicy / Exotic Florals', description: 'Bold and exotic florals', sortOrder: 5, examples: 'Carnation, Lavender, Hibiscus' },
      { subGroupCode: 'G05-S06', subGroupName: 'General Floral Accords', description: 'Generic floral accords', sortOrder: 6 }
    ]
  },
  {
    groupCode: 'G06',
    groupName: 'WHITE FLOWERS',
    description: 'Classic white floral notes - kept separate from general flowers',
    sortOrder: 6,
    subGroups: [
      { subGroupCode: 'G06-S01', subGroupName: 'Classic White Florals', description: 'Traditional white flower notes', sortOrder: 1, examples: 'Jasmine, Tuberose, Gardenia, Orange Blossom, Frangipani, Tiare, Honeysuckle' },
      { subGroupCode: 'G06-S02', subGroupName: 'White Floral Accords & Musky Whites', description: 'White floral accords', sortOrder: 2 }
    ]
  }
]

async function seed() {
  console.log('🌱 Starting seed (Part 2: G04-G06)...')
  
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
  
  console.log('✅ Part 2 done!')
}

seed().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect())

﻿

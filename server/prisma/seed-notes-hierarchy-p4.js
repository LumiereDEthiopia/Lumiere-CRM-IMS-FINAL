/**
 * Seed script for Perfume Note Groups and Sub-Groups (Part 4: G11-G15)
 */

import prisma from '../src/config/prisma.js'

const groupsData = [
  {
    groupCode: 'G11',
    groupName: 'RESINS & BALSAMS',
    description: 'Resinous and balsamic notes',
    sortOrder: 11,
    subGroups: [
      { subGroupCode: 'G11-S01', subGroupName: 'Soft Balsams', description: 'Gentle balsamic notes', sortOrder: 1, examples: 'Benzoin, Peru Balsam, Tolu Balsam' },
      { subGroupCode: 'G11-S02', subGroupName: 'Deep Resins', description: 'Deep resinous notes', sortOrder: 2, examples: 'Labdanum, Myrrh, Opoponax, Elemi' },
      { subGroupCode: 'G11-S03', subGroupName: 'Incense / Frankincense / Bakhoor', description: 'Incense and sacred resins', sortOrder: 3, examples: 'Olibanum, Nag Champa' }
    ]
  },
  {
    groupCode: 'G12',
    groupName: 'MUSK, AMBER & ANIMALIC',
    description: 'Musky, amber, and animalic notes',
    sortOrder: 12,
    subGroups: [
      { subGroupCode: 'G12-S01', subGroupName: 'Musks', description: 'Various musk types', sortOrder: 1, examples: 'White Musk, Skin Musk, Ambrette' },
      { subGroupCode: 'G12-S02', subGroupName: 'Amber & Ambergris', description: 'Amber and ambergris notes', sortOrder: 2, examples: 'Amber, Ambroxan, Amberwood' },
      { subGroupCode: 'G12-S03', subGroupName: 'Leather / Suede', description: 'Leather and suede notes', sortOrder: 3, examples: 'Leather, Suede, White Leather' },
      { subGroupCode: 'G12-S04', subGroupName: 'Animalic & Skin', description: 'Animalic and skin notes', sortOrder: 4, examples: 'Civet, Castoreum, Hyraceum, Beeswax' }
    ]
  },
  {
    groupCode: 'G13',
    groupName: 'BEVERAGES',
    description: 'Beverage and drink notes',
    sortOrder: 13,
    subGroups: [
      { subGroupCode: 'G13-S01', subGroupName: 'Wine / Champagne / Brandy', description: 'Wine and spirits notes', sortOrder: 1, examples: 'Wine, Champagne, Cognac' },
      { subGroupCode: 'G13-S02', subGroupName: 'Whiskey / Rum / Spirits & Cocktails', description: 'Spirits and cocktails', sortOrder: 2, examples: 'Whiskey, Rum, Gin, Mojito, Pina Colada' },
      { subGroupCode: 'G13-S03', subGroupName: 'Coffee / Chocolate / Tea Drinks', description: 'Hot beverage drinks', sortOrder: 3, examples: 'Espresso, Latte, Mocha, Chai' },
      { subGroupCode: 'G13-S04', subGroupName: 'Soft / Juice / Soda', description: 'Soft drinks and juices', sortOrder: 4, examples: 'Cola, Lemonade, Juice' }
    ]
  },
  {
    groupCode: 'G14',
    groupName: 'SYNTHETIC, MINERAL & ATMOSPHERIC',
    description: 'Synthetic molecules, minerals, and atmospheric notes',
    sortOrder: 14,
    subGroups: [
      { subGroupCode: 'G14-S01', subGroupName: 'Aldehydic / Synthetic Molecules', description: 'Modern synthetic molecules', sortOrder: 1, examples: 'Aldehydes, Iso E Super, Hedione, Cashmeran' },
      { subGroupCode: 'G14-S02', subGroupName: 'Earthy / Mineral / Salty', description: 'Mineral and earthy notes', sortOrder: 2, examples: 'Geosmin, Salt, Flint, Clay' },
      { subGroupCode: 'G14-S03', subGroupName: 'Aquatic / Airy / Ozonic', description: 'Airy and aquatic notes', sortOrder: 3, examples: 'Calone, Sea Water, Rain, Snow' },
      { subGroupCode: 'G14-S04', subGroupName: 'Powdery / Clean / Soapy', description: 'Clean and powdery notes', sortOrder: 4, examples: 'Soap, Linen, Talc, Lipstick' },
      { subGroupCode: 'G14-S05', subGroupName: 'Smoke / Industrial / Unusual', description: 'Unusual and industrial notes', sortOrder: 5, examples: 'Smoke, Gunpowder, Ink, Gasoline' }
    ]
  },
  {
    groupCode: 'G15',
    groupName: 'UNCATEGORIZED / TO REVIEW',
    description: 'Notes that need review or are not yet classified',
    sortOrder: 15,
    subGroups: [
      { subGroupCode: 'G15-S01', subGroupName: 'To Review', description: 'Notes pending classification', sortOrder: 1, examples: 'Hookah, Charcoal, Pandan, Umami, etc.' }
    ]
  }
]

async function seed() {
  console.log('🌱 Starting seed (Part 4: G11-G15)...')
  
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
  
  console.log('✅ Part 4 done! All 15 groups seeded!')
}

seed().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect())

﻿

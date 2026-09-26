/**
 * Seed script for Perfume Note Groups and Sub-Groups (Part 3: G07-G10)
 */

import prisma from '../src/config/prisma.js'

const groupsData = [
  {
    groupCode: 'G07',
    groupName: 'GREENS, HERBS, TEA & FOUGERES',
    description: 'Green, herbal, tea and fougere notes',
    sortOrder: 7,
    subGroups: [
      { subGroupCode: 'G07-S01', subGroupName: 'Green Leaves, Grass & Stems', description: 'Fresh green plant material', sortOrder: 1, examples: 'Galbanum, Fig Leaf, Tomato Leaf, Violet Leaf' },
      { subGroupCode: 'G07-S02', subGroupName: 'Aromatic Herbs', description: 'Culinary and aromatic herbs', sortOrder: 2, examples: 'Basil, Rosemary, Thyme, Sage, Mint, Artemisia' },
      { subGroupCode: 'G07-S03', subGroupName: 'Teas', description: 'Various tea notes', sortOrder: 3, examples: 'Black Tea, Green Tea, Oolong, Matcha, Pu\'er, Mate' },
      { subGroupCode: 'G07-S04', subGroupName: 'Fern / Fougere / Forest', description: 'Fougere and forest accords', sortOrder: 4, examples: 'Fern, Fougere Accord, Lavender + Oakmoss + Coumarin' },
      { subGroupCode: 'G07-S05', subGroupName: 'Aquatic Green / Sea Herbs', description: 'Sea and aquatic green notes', sortOrder: 5, examples: 'Algae, Seaweed' }
    ]
  },
  {
    groupCode: 'G08',
    groupName: 'SPICES',
    description: 'Warm, cool, and exotic spice notes',
    sortOrder: 8,
    subGroups: [
      { subGroupCode: 'G08-S01', subGroupName: 'Warm / Hot Spices', description: 'Heating spices', sortOrder: 1, examples: 'Cinnamon, Clove, Nutmeg, Star Anise' },
      { subGroupCode: 'G08-S02', subGroupName: 'Cool / Fresh Spices', description: 'Cooling spices', sortOrder: 2, examples: 'Cardamom, Coriander, Ginger, Pink Pepper' },
      { subGroupCode: 'G08-S03', subGroupName: 'Peppers', description: 'Various pepper notes', sortOrder: 3, examples: 'Black Pepper, Sichuan Pepper, Cubeb' },
      { subGroupCode: 'G08-S04', subGroupName: 'Precious Spices', description: 'Luxurious and rare spices', sortOrder: 4, examples: 'Saffron, Vanilla, Tonka Bean, Bay Leaf' }
    ]
  },
  {
    groupCode: 'G09',
    groupName: 'SWEETS & GOURMAND',
    description: 'Sweet, dessert, and gourmand notes',
    sortOrder: 9,
    subGroups: [
      { subGroupCode: 'G09-S01', subGroupName: 'Sugar, Caramel, Honey & Syrups', description: 'Sweetening agents', sortOrder: 1 },
      { subGroupCode: 'G09-S02', subGroupName: 'Bakery / Pastry', description: 'Baked goods notes', sortOrder: 2, examples: 'Cake, Cookie, Croissant, Macarons, Donut' },
      { subGroupCode: 'G09-S03', subGroupName: 'Chocolate / Cocoa / Coffee Gourmand', description: 'Chocolate and coffee notes', sortOrder: 3, examples: 'Praline, Gianduia' },
      { subGroupCode: 'G09-S04', subGroupName: 'Dairy / Creamy / Milky', description: 'Dairy and creamy notes', sortOrder: 4, examples: 'Cream, Butter, Ice Cream, Custard' },
      { subGroupCode: 'G09-S05', subGroupName: 'Candy / Chewy', description: 'Candy and confectionery notes', sortOrder: 5, examples: 'Cotton Candy, Marshmallow, Nougat' },
      { subGroupCode: 'G09-S06', subGroupName: 'Dessert Fruits & Sweets', description: 'Dessert and sweet dish notes', sortOrder: 6, examples: 'Creme Brulee, Sorbet, Panna Cotta' }
    ]
  },
  {
    groupCode: 'G10',
    groupName: 'WOODS & MOSSES',
    description: 'Woody, mossy, and earthy notes',
    sortOrder: 10,
    subGroups: [
      { subGroupCode: 'G10-S01', subGroupName: 'Creamy / Soft Woods', description: 'Soft and creamy woods', sortOrder: 1, examples: 'Sandalwood, Cashmir, Amyris' },
      { subGroupCode: 'G10-S02', subGroupName: 'Dry / Cedar / Pine Woods', description: 'Dry woody notes', sortOrder: 2 },
      { subGroupCode: 'G10-S03', subGroupName: 'Oud / Agarwood', description: 'Rare oud varieties', sortOrder: 3, examples: 'Cambodian Oud, Indian Oud, Laotian Oud, Thai Oud, Vietnamese Oud, Kyara' },
      { subGroupCode: 'G10-S04', subGroupName: 'Earthy / Roots', description: 'Earthy root notes', sortOrder: 4, examples: 'Vetiver, Patchouli, Cypriol' },
      { subGroupCode: 'G10-S05', subGroupName: 'Mosses, Lichens & Forest Floor', description: 'Moss and forest floor notes', sortOrder: 5, examples: 'Oakmoss, Tree Moss' },
      { subGroupCode: 'G10-S06', subGroupName: 'Smoky / Charred Woods', description: 'Smoky wood notes', sortOrder: 6 }
    ]
  }
]

async function seed() {
  console.log('🌱 Starting seed (Part 3: G07-G10)...')
  
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
  
  console.log('✅ Part 3 done!')
}

seed().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect())

﻿

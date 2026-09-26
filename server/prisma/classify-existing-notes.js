/**
 * Script to classify existing notes into the new Group/Sub-Group hierarchy
 * This is a one-time script to map existing notes to their appropriate categories
 */

import prisma from '../src/config/prisma.js'

// Mapping of note names to their group/sub-group
const noteClassificationMap = {
  // Citrus
  'bergamot': { groupCode: 'G01', subGroupCode: 'G01-S01' },
  'lemon': { groupCode: 'G01', subGroupCode: 'G01-S01' },
  'orange': { groupCode: 'G01', subGroupCode: 'G01-S01' },
  'grapefruit': { groupCode: 'G01', subGroupCode: 'G01-S02' },
  
  // Flowers
  'jasmine': { groupCode: 'G06', subGroupCode: 'G06-S01' },
  'rose': { groupCode: 'G05', subGroupCode: 'G05-S01' },
  'peony': { groupCode: 'G05', subGroupCode: 'G05-S01' },
  'lily': { groupCode: 'G05', subGroupCode: 'G05-S04' },
  'lavender': { groupCode: 'G05', subGroupCode: 'G05-S05' },
  
  // Woods
  'cedarwood': { groupCode: 'G10', subGroupCode: 'G10-S02' },
  'oud': { groupCode: 'G10', subGroupCode: 'G10-S03' },
  'sandalwood': { groupCode: 'G10', subGroupCode: 'G10-S01' },
  
  // Spices
  'pepper': { groupCode: 'G08', subGroupCode: 'G08-S03' },
  'vanilla': { groupCode: 'G08', subGroupCode: 'G08-S04' },
  
  // Other
  'patchouli': { groupCode: 'G10', subGroupCode: 'G10-S04' },
  'musk': { groupCode: 'G12', subGroupCode: 'G12-S01' },
  'amber': { groupCode: 'G12', subGroupCode: 'G12-S02' }
}

async function classifyNotes() {
  console.log('🔍 Classifying existing notes...')
  
  const notes = await prisma.fragranceNote.findMany({
    where: {
      OR: [
        { groupId: null },
        { subGroupId: null }
      ]
    }
  })
  
  console.log(`Found ${notes.length} notes to classify`)
  
  let classified = 0
  let skipped = 0
  
  for (const note of notes) {
    const nameLower = note.name.toLowerCase().trim()
    const classification = noteClassificationMap[nameLower]
    
    if (classification) {
      // Find the group and subGroup
      const group = await prisma.perfumeNoteGroup.findUnique({
        where: { groupCode: classification.groupCode }
      })
      
      const subGroup = await prisma.perfumeNoteSubGroup.findUnique({
        where: { subGroupCode: classification.subGroupCode }
      })
      
      if (group && subGroup) {
        await prisma.fragranceNote.update({
          where: { id: note.id },
          data: {
            groupId: group.id,
            subGroupId: subGroup.id
          }
        })
        console.log(`  ✓ ${note.name} → ${classification.groupCode} / ${classification.subGroupCode}`)
        classified++
      } else {
        console.log(`  ⚠️ ${note.name}: Group or Sub-Group not found for ${classification.groupCode}/${classification.subGroupCode}`)
        skipped++
      }
    } else {
      console.log(`  ⊘ ${note.name}: No classification mapping found`)
      skipped++
    }
  }
  
  console.log(`\n✅ Classification complete!`)
  console.log(`  Classified: ${classified}`)
  console.log(`  Skipped/Not found: ${skipped}`)
}

classifyNotes()
  .catch(e => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

﻿
